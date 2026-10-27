/*
 * ============================================================================
 * Hossidi Water Monitor - FIRMWARE DA PLACA 3 (NÓ 3 - ÁGUA BRUTA / POÇO)
 * ============================================================================
 * Plataforma: Arduino Uno, Nano, Mega ou ESP32
 * Funções:
 * 1. Monitoramento dos Tanques WW1 (ID 5) e WW2 (ID 6).
 *    - 10 provas ópticas para WW1 (entradas digitais com INPUT_PULLUP).
 *    - 10 provas ópticas para WW2 (entradas digitais com INPUT_PULLUP).
 *    - 2 relés de comando para acionamento das bombas do poço / recalque.
 * 2. Display LCD I2C 16x2 ou 20x4 com exibição contínua.
 * 3. Comunicação não-bloqueante a 115200 bps com a Placa Principal.
 * 4. Protocolo SCADA delimitado com CRC16, número sequencial (SEQ) e ACK.
 * 5. Resposta imediata a comandos PING e POLL.
 * 6. Loop 100% não-bloqueante baseado em millis() (ZERO delays bloqueantes).
 * ============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "protocolo_hossidi.h"

// ----------------------------------------------------------------------------
// PINAGEM DOS SENSORES E RELÉS (PLACA 3)
// ----------------------------------------------------------------------------
// Sensores do Tanque 5 (WW1 - Bruta): 10% a 100%
const uint8_t PROBES_WW1[10] = {2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
// Sensores do Tanque 6 (WW2 - Bruta): 10% a 100%
const uint8_t PROBES_WW2[10] = {12, 13, A0, A1, A2, A3, 14, 15, 16, 17};

const uint8_t RELAY_PUMP_WW1 = 18;
const uint8_t RELAY_PUMP_WW2 = 19;

// ----------------------------------------------------------------------------
// DISPLAY LCD (Endereço 0x27)
// ----------------------------------------------------------------------------
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Variáveis de Nível e Estado
int levelWW1 = 0;
int levelWW2 = 0;
int pumpWW1 = 0;
int pumpWW2 = 0;
uint8_t sensorsWW1[10];
uint8_t sensorsWW2[10];

uint16_t seqNumber = 1;
bool aguardandoAck = false;
uint32_t tempoUltimoEnvio = 0;
uint32_t tempoUltimoAck = 0;
uint32_t tempoUltimaLeitura = 0;
uint32_t tempoUltimoLCD = 0;
uint8_t tentativasEnvio = 0;

char rxBuffer[128];
size_t rxIndex = 0;

// ----------------------------------------------------------------------------
// LEITURA DOS SENSORES ÓPTICOS (ATIVO LOW)
// ----------------------------------------------------------------------------
void lerSensores() {
  int submersosWW1 = 0;
  int submersosWW2 = 0;

  for (int i = 0; i < 10; i++) {
    sensorsWW1[i] = (digitalRead(PROBES_WW1[i]) == LOW) ? 1 : 0;
    if (sensorsWW1[i] == 1) submersosWW1++;

    sensorsWW2[i] = (digitalRead(PROBES_WW2[i]) == LOW) ? 1 : 0;
    if (sensorsWW2[i] == 1) submersosWW2++;
  }

  levelWW1 = submersosWW1 * 10;
  levelWW2 = submersosWW2 * 10;

  pumpWW1 = (digitalRead(RELAY_PUMP_WW1) == LOW) ? 1 : 0;
  pumpWW2 = (digitalRead(RELAY_PUMP_WW2) == LOW) ? 1 : 0;
}

// ----------------------------------------------------------------------------
// ENVIO DE PACOTE DE TELEMETRIA SCADA COM CRC
// ----------------------------------------------------------------------------
void enviarTelemetria() {
  seqNumber++;
  char payload[80];
  snprintf(payload, sizeof(payload), "DATA;PLACA3;SEQ=%u;WW1=%d;WW2=%d;P1=%d;P2=%d",
           seqNumber, levelWW1, levelWW2, pumpWW1, pumpWW2);

  char frameSaida[110];
  empacotarMensagem(payload, frameSaida, sizeof(frameSaida));
  Serial.println(frameSaida);

  aguardandoAck = true;
  tempoUltimoEnvio = millis();
}

// ----------------------------------------------------------------------------
// PROCESSAMENTO DE COMANDOS RECEBIDOS DA PLACA PRINCIPAL
// ----------------------------------------------------------------------------
void processarComando(const char* frame) {
  uint32_t agora = millis();

  // Tratamento de Confirmação ACK
  if (strstr(frame, "ACK;PLACA3") != NULL) {
    aguardandoAck = false;
    tentativasEnvio = 0;
    tempoUltimoAck = agora;
    return;
  }

  // Resposta a PING
  if (strstr(frame, "PING") != NULL && (strstr(frame, "PLACA3") != NULL || strstr(frame, "ALL") != NULL)) {
    char seqStr[16] = "";
    char* posSeq = strstr(frame, "SEQ=");
    if (posSeq) {
      uint16_t seqRecebido = atoi(posSeq + 4);
      snprintf(seqStr, sizeof(seqStr), ";SEQ=%u", seqRecebido);
    }

    char hbPayload[64];
    snprintf(hbPayload, sizeof(hbPayload), "HEARTBEAT;PLACA3%s;STATUS=OK;WW1=%d;WW2=%d",
             seqStr, levelWW1, levelWW2);
    char hbFrame[96];
    empacotarMensagem(hbPayload, hbFrame, sizeof(hbFrame));
    Serial.println(hbFrame);
    return;
  }

  // Resposta a comando POLL (requisição forçada de dados)
  if (strstr(frame, "POLL;PLACA3") != NULL) {
    enviarTelemetria();
    return;
  }

  // Comandos de bomba
  if (strstr(frame, "CMD;PUMP_WW1=1") != NULL) {
    digitalWrite(RELAY_PUMP_WW1, LOW);
    pumpWW1 = 1;
  } else if (strstr(frame, "CMD;PUMP_WW1=0") != NULL) {
    digitalWrite(RELAY_PUMP_WW1, HIGH);
    pumpWW1 = 0;
  }

  if (strstr(frame, "CMD;PUMP_WW2=1") != NULL) {
    digitalWrite(RELAY_PUMP_WW2, LOW);
    pumpWW2 = 1;
  } else if (strstr(frame, "CMD;PUMP_WW2=0") != NULL) {
    digitalWrite(RELAY_PUMP_WW2, HIGH);
    pumpWW2 = 0;
  }
}

// ----------------------------------------------------------------------------
// ATUALIZAÇÃO DO DISPLAY LCD LOCAL (SEM BLOQUEIO)
// ----------------------------------------------------------------------------
void atualizarLCD() {
  lcd.setCursor(0, 0);
  lcd.print("WW1:");
  lcd.print(levelWW1);
  lcd.print("% B:");
  lcd.print(pumpWW1 ? "ON " : "OFF");
  lcd.print("   ");

  lcd.setCursor(0, 1);
  lcd.print("WW2:");
  lcd.print(levelWW2);
  lcd.print("% B:");
  lcd.print(pumpWW2 ? "ON " : "OFF");
  lcd.print("   ");
}

// ----------------------------------------------------------------------------
// SETUP
// ----------------------------------------------------------------------------
void setup() {
  // Comunicação UART com a Placa Principal a 115200 bps
  Serial.begin(115200);

  // Sensores com pull-up
  for (int i = 0; i < 10; i++) {
    pinMode(PROBES_WW1[i], INPUT_PULLUP);
    pinMode(PROBES_WW2[i], INPUT_PULLUP);
  }

  // Relés
  pinMode(RELAY_PUMP_WW1, OUTPUT);
  pinMode(RELAY_PUMP_WW2, OUTPUT);
  digitalWrite(RELAY_PUMP_WW1, HIGH);
  digitalWrite(RELAY_PUMP_WW2, HIGH);

  // Inicializa LCD
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Placa 3 - WW");
  lcd.setCursor(0, 1);
  lcd.print("SCADA Pronto");

  Serial.println("<SYSTEM;PLACA3;STATUS=BOOT_OK;VERSION=2.0>");
}

// ----------------------------------------------------------------------------
// LOOP PRINCIPAL
// ----------------------------------------------------------------------------
void loop() {
  uint32_t agora = millis();

  // 1. Receção contínua da porta Serial
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n' || c == '>') {
      rxBuffer[rxIndex] = (c == '>') ? '>' : '\0';
      if (c == '>') rxBuffer[rxIndex + 1] = '\0';
      processarComando(rxBuffer);
      rxIndex = 0;
    } else if (rxIndex < sizeof(rxBuffer) - 2) {
      rxBuffer[rxIndex++] = c;
    }
  }

  // 2. Leitura dos sensores físicos a cada 200ms
  if (agora - tempoUltimaLeitura >= 200) {
    tempoUltimaLeitura = agora;
    lerSensores();
  }

  // 3. Envio periódico de telemetria a cada 2000ms
  if (agora - tempoUltimoEnvio >= 2000) {
    enviarTelemetria();
  }

  // 4. Retentativa progressiva caso o ACK não chegue
  if (aguardandoAck && (agora - tempoUltimoEnvio > 3000)) {
    tentativasEnvio++;
    if (tentativasEnvio <= 5) {
      enviarTelemetria();
    } else {
      aguardandoAck = false;
      tentativasEnvio = 0;
    }
  }

  // 5. Atualização do LCD a cada 500ms
  if (agora - tempoUltimoLCD >= 500) {
    tempoUltimoLCD = agora;
    atualizarLCD();
  }
}

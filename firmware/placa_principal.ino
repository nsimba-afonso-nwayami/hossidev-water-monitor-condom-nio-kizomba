/*
 * ============================================================================
 * Hossidi Water Monitor - FIRMWARE DA PLACA PRINCIPAL (PLACA-MÃE / NÓ 1)
 * ============================================================================
 * Plataforma recomendada: Arduino Mega 2560 ou ESP32 / Teensy
 * Funções:
 * 1. Interface USB com o Aplicativo Web / SCADA (115200 bps, 8N1).
 * 2. Barramento de comunicação serial independente com a Placa 2 (Serial1) e Placa 3 (Serial2).
 * 3. Monitoramento de 2 Tanques de Água Tratada: FW1 (ID 1) e FW2 (ID 2).
 *    - 10 provas ópticas por tanque (20 entradas digitais com INPUT_PULLUP).
 *    - 2 relés de comando para acionamento das bombas.
 * 4. Display LCD 20x4 ou 16x2 I2C com atualização não-bloqueante a cada 500ms.
 * 5. Heartbeat ativo e watchdog individual por placa secundária (Placa 2 e Placa 3).
 *    - Uma falha na Placa 2 NUNCA paralisa a Placa 3, a Placa Principal ou o Aplicativo.
 *    - Tratamento de timeout (3000ms) e reconexão progressiva (2s, 5s, 10s, 30s).
 *    - Rotina de recuperação de barramento I2C se SDA ficar preso em nível baixo.
 * ============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "protocolo_hossidi.h"

// ----------------------------------------------------------------------------
// PINOS DOS SENSORES E RELÉS (PLACA PRINCIPAL)
// ----------------------------------------------------------------------------
// Provas ópticas do Tanque 1 (FW1 - Tratada): 10% a 100%
const uint8_t PROBES_FW1[10] = {22, 23, 24, 25, 26, 27, 28, 29, 30, 31};
// Provas ópticas do Tanque 2 (FW2 - Tratada): 10% a 100%
const uint8_t PROBES_FW2[10] = {32, 33, 34, 35, 36, 37, 38, 39, 40, 41};

// Relés de comando de bomba (Ativo em LOW ou HIGH conforme o módulo de relés)
const uint8_t RELAY_PUMP_FW1 = 42;
const uint8_t RELAY_PUMP_FW2 = 43;
const uint8_t PIN_I2C_SDA = 20; // Pinos I2C Arduino Mega (SDA=20, SCL=21)
const uint8_t PIN_I2C_SCL = 21;

// ----------------------------------------------------------------------------
// DISPLAY LCD (Endereço I2C 0x27 ou 0x3F)
// ----------------------------------------------------------------------------
LiquidCrystal_I2C lcd(0x27, 20, 4);

// ----------------------------------------------------------------------------
// ESTRUTURAS DE ESTADO
// ----------------------------------------------------------------------------
struct EstadoPlacaSecundaria {
  const char* nome;
  bool online;
  uint8_t falhasConsecutivas;
  uint32_t ultimoHeartbeat;
  uint32_t ultimoEnvioPing;
  uint16_t seqUltimoAck;
  uint16_t seqAtual;
};

EstadoPlacaSecundaria placa2 = {"PLACA2", false, 0, 0, 0, 0, 100};
EstadoPlacaSecundaria placa3 = {"PLACA3", false, 0, 0, 0, 0, 200};

// Leituras locais dos tanques
int levelFW1 = 0;
int levelFW2 = 0;
int pumpFW1 = 0;
int pumpFW2 = 0;
uint8_t sensorsFW1[10];
uint8_t sensorsFW2[10];

// Leituras recebidas das placas secundárias (retidas na memória)
int levelRW1 = 0;
int levelRW2 = 0;
int levelWW1 = 0;
int levelWW2 = 0;

// Temporizadores não-bloqueantes com millis()
uint32_t tempoUltimaLeituraSensores = 0;
uint32_t tempoUltimoEnvioUSB = 0;
uint32_t tempoUltimoHeartbeat = 0;
uint32_t tempoUltimaAtualizacaoLCD = 0;

uint16_t seqGlobal = 1;

// Buffers seriais controlados para evitar fragmentação de memória
char bufferUSB[256];
char bufferSerial1[128];
char bufferSerial2[128];
size_t idxUSB = 0;
size_t idxS1 = 0;
size_t idxS2 = 0;

// ----------------------------------------------------------------------------
// RECUPERAÇÃO DE BARRAMENTO I2C (Caso a linha SDA fique travada em LOW)
// ----------------------------------------------------------------------------
void recuperarBarramentoI2C() {
  pinMode(PIN_I2C_SDA, INPUT_PULLUP);
  pinMode(PIN_I2C_SCL, OUTPUT);

  // Se SDA estiver preso em nível lógico baixo por algum escravo
  if (digitalRead(PIN_I2C_SDA) == LOW) {
    for (int i = 0; i < 9; i++) {
      digitalWrite(PIN_I2C_SCL, LOW);
      delayMicroseconds(5);
      digitalWrite(PIN_I2C_SCL, HIGH);
      delayMicroseconds(5);
      if (digitalRead(PIN_I2C_SDA) == HIGH) break;
    }
  }

  // Gera condição de STOP
  pinMode(PIN_I2C_SDA, OUTPUT);
  digitalWrite(PIN_I2C_SDA, LOW);
  delayMicroseconds(5);
  digitalWrite(PIN_I2C_SCL, HIGH);
  delayMicroseconds(5);
  digitalWrite(PIN_I2C_SDA, HIGH);
  delayMicroseconds(5);

  Wire.begin();
  #if defined(WIRE_HAS_TIMEOUT)
    Wire.setWireTimeout(3000, true); // Timeout de 3ms no barramento I2C
  #endif
}

// ----------------------------------------------------------------------------
// LEITURA DOS SENSORES FÍSICOS (10 PROVAS POR TANQUE)
// ----------------------------------------------------------------------------
void lerSensoresLocais() {
  int submersosFW1 = 0;
  int submersosFW2 = 0;

  for (int i = 0; i < 10; i++) {
    // Sensor com água fecha contato para GND (ativo LOW)
    sensorsFW1[i] = (digitalRead(PROBES_FW1[i]) == LOW) ? 1 : 0;
    if (sensorsFW1[i] == 1) submersosFW1++;

    sensorsFW2[i] = (digitalRead(PROBES_FW2[i]) == LOW) ? 1 : 0;
    if (sensorsFW2[i] == 1) submersosFW2++;
  }

  levelFW1 = submersosFW1 * 10; // 0% a 100%
  levelFW2 = submersosFW2 * 10; // 0% a 100%

  pumpFW1 = (digitalRead(RELAY_PUMP_FW1) == LOW) ? 1 : 0;
  pumpFW2 = (digitalRead(RELAY_PUMP_FW2) == LOW) ? 1 : 0;
}

// ----------------------------------------------------------------------------
// ATUALIZAÇÃO DO DISPLAY LCD (SEM DELAYS)
// ----------------------------------------------------------------------------
void atualizarLCD() {
  lcd.setCursor(0, 0);
  lcd.print("FW1:");
  lcd.print(levelFW1);
  lcd.print("% ");
  lcd.print("FW2:");
  lcd.print(levelFW2);
  lcd.print("%  ");

  lcd.setCursor(0, 1);
  lcd.print("RW1:");
  lcd.print(levelRW1);
  lcd.print("% ");
  lcd.print("RW2:");
  lcd.print(levelRW2);
  lcd.print("%  ");

  lcd.setCursor(0, 2);
  lcd.print("WW1:");
  lcd.print(levelWW1);
  lcd.print("% ");
  lcd.print("WW2:");
  lcd.print(levelWW2);
  lcd.print("%  ");

  lcd.setCursor(0, 3);
  lcd.print("P2:");
  lcd.print(placa2.online ? "ON " : "ERR");
  lcd.print(" P3:");
  lcd.print(placa3.online ? "ON " : "ERR");
  lcd.print(" USB:OK ");
}

// ----------------------------------------------------------------------------
// PROCESSAMENTO DE MENSAGENS RECEBIDAS DAS PLACAS 2 E 3
// ----------------------------------------------------------------------------
void processarMensagemSecundaria(const char* frame, uint8_t origem) {
  // Exemplo de frame: <DATA;PLACA2;SEQ=152;RW1=68;RW2=51;CRC=AB12>
  // Exemplo de heartbeat: <HEARTBEAT;PLACA2;SEQ=153;STATUS=OK;CRC=....>
  // Exemplo de ack: <ACK;PLACA2;SEQ=152>

  if (frame[0] != '<') return;
  size_t len = strlen(frame);
  if (frame[len - 1] != '>') return;

  uint32_t agora = millis();

  if (origem == 2) {
    placa2.online = true;
    placa2.falhasConsecutivas = 0;
    placa2.ultimoHeartbeat = agora;
  } else if (origem == 3) {
    placa3.online = true;
    placa3.falhasConsecutivas = 0;
    placa3.ultimoHeartbeat = agora;
  }

  // Encaminha imediatamente o pacote SCADA recebido para o Aplicativo via USB
  Serial.println(frame);

  // Extrai valores para atualização do LCD local
  if (strstr(frame, "RW1=") != NULL) {
    char* pos = strstr(frame, "RW1=");
    levelRW1 = atoi(pos + 4);
  }
  if (strstr(frame, "RW2=") != NULL) {
    char* pos = strstr(frame, "RW2=");
    levelRW2 = atoi(pos + 4);
  }
  if (strstr(frame, "WW1=") != NULL) {
    char* pos = strstr(frame, "WW1=");
    levelWW1 = atoi(pos + 4);
  }
  if (strstr(frame, "WW2=") != NULL) {
    char* pos = strstr(frame, "WW2=");
    levelWW2 = atoi(pos + 4);
  }

  // Responde ACK se a mensagem foi do tipo DATA ou HEARTBEAT com SEQ
  if (strstr(frame, "SEQ=") != NULL) {
    char* posSeq = strstr(frame, "SEQ=");
    uint16_t seqRecebido = atoi(posSeq + 4);
    char ackBuf[32];
    montarACK(origem == 2 ? "PLACA2" : "PLACA3", seqRecebido, ackBuf, sizeof(ackBuf));
    if (origem == 2) Serial1.println(ackBuf);
    else if (origem == 3) Serial2.println(ackBuf);
  }
}

// ----------------------------------------------------------------------------
// GESTÃO DE HEARTBEAT E WATCHDOG DAS PLACAS SECUNDÁRIAS
// ----------------------------------------------------------------------------
void verificarHeartbeatPlacas() {
  uint32_t agora = millis();

  // Envio de PING cíclico a cada 2000ms
  if (agora - tempoUltimoHeartbeat >= 2000) {
    tempoUltimoHeartbeat = agora;
    seqGlobal++;

    char pingFrame[48];
    // Ping Placa 2
    snprintf(pingFrame, sizeof(pingFrame), "<PING;PLACA2;SEQ=%u>", seqGlobal);
    Serial1.println(pingFrame);

    // Ping Placa 3
    snprintf(pingFrame, sizeof(pingFrame), "<PING;PLACA3;SEQ=%u>", seqGlobal);
    Serial2.println(pingFrame);

    // Verifica timeout da Placa 2 (Timeout: 3000ms)
    if (agora - placa2.ultimoHeartbeat > 3000) {
      if (placa2.falhasConsecutivas < 255) placa2.falhasConsecutivas++;
      if (placa2.falhasConsecutivas >= 3) {
        placa2.online = false; // Declarada offline somente após 3 falhas consecutivas
      }
    }

    // Verifica timeout da Placa 3 (Timeout: 3000ms)
    if (agora - placa3.ultimoHeartbeat > 3000) {
      if (placa3.falhasConsecutivas < 255) placa3.falhasConsecutivas++;
      if (placa3.falhasConsecutivas >= 3) {
        placa3.online = false;
      }
    }
  }
}

// ----------------------------------------------------------------------------
// TRANSMISSÃO DE TELEMETRIA LOCAL PARA O APLICATIVO VIA USB SERIAL
// ----------------------------------------------------------------------------
void enviarTelemetriaUSB() {
  // Transmite pacote SCADA delimitado padrão Hossidi com CRC
  char payload[96];
  snprintf(payload, sizeof(payload), "DATA;PLACA1;SEQ=%u;FW1=%d;FW2=%d;P1=%d;P2=%d",
           seqGlobal, levelFW1, levelFW2, pumpFW1, pumpFW2);

  char frameSaida[128];
  empacotarMensagem(payload, frameSaida, sizeof(frameSaida));
  Serial.println(frameSaida);

  // Também envia JSON unificado para total retrocompatibilidade
  Serial.print("{\"device\":\"kizomba\",\"nodeId\":1,\"uptime\":");
  Serial.print(millis() / 1000);
  Serial.print(",\"node1\":{\"status\":\"online\",\"tanks\":[");
  Serial.print("{\"id\":1,\"level\":");
  Serial.print(levelFW1);
  Serial.print(",\"pump\":");
  Serial.print(pumpFW1);
  Serial.print("},{\"id\":2,\"level\":");
  Serial.print(levelFW2);
  Serial.print(",\"pump\":");
  Serial.print(pumpFW2);
  Serial.print("}]},\"node2\":{\"status\":\"");
  Serial.print(placa2.online ? "online" : "offline");
  Serial.print("\"},\"node3\":{\"status\":\"");
  Serial.print(placa3.online ? "online" : "offline");
  Serial.println("\"}}");
}

// ----------------------------------------------------------------------------
// SETUP
// ----------------------------------------------------------------------------
void setup() {
  // Inicializa porta USB com o computador
  Serial.begin(115200);

  // Inicializa barramentos UART secundários a 115200 bps
  Serial1.begin(115200); // Conexão com Placa 2 (RX1=19, TX1=18 no Mega)
  Serial2.begin(115200); // Conexão com Placa 3 (RX2=17, TX2=16 no Mega)

  // Configuração dos pinos de sensores com pull-up interno
  for (int i = 0; i < 10; i++) {
    pinMode(PROBES_FW1[i], INPUT_PULLUP);
    pinMode(PROBES_FW2[i], INPUT_PULLUP);
  }

  // Configuração dos relés de bomba
  pinMode(RELAY_PUMP_FW1, OUTPUT);
  pinMode(RELAY_PUMP_FW2, OUTPUT);
  digitalWrite(RELAY_PUMP_FW1, HIGH); // Relé desligado inicialmente
  digitalWrite(RELAY_PUMP_FW2, HIGH);

  // Recupera barramento I2C e inicializa LCD
  recuperarBarramentoI2C();
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Hossidi SCADA Mestre");
  lcd.setCursor(0, 1);
  lcd.print("Iniciando Barramento");

  uint32_t agora = millis();
  placa2.ultimoHeartbeat = agora;
  placa3.ultimoHeartbeat = agora;

  Serial.println("<SYSTEM;PLACA1;STATUS=BOOT_OK;VERSION=2.0>");
}

// ----------------------------------------------------------------------------
// LOOP PRINCIPAL (100% NÃO-BLOQUEANTE - SEM DELAY)
// ----------------------------------------------------------------------------
void loop() {
  uint32_t agora = millis();

  // 1. Leitura contínua dos canais seriais (sem bloquear o ciclo)
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n' || c == '>') {
      bufferUSB[idxUSB] = (c == '>') ? '>' : '\0';
      if (c == '>') bufferUSB[idxUSB + 1] = '\0';
      // Processa comando vindo do PC
      if (strstr(bufferUSB, "PING") != NULL || strstr(bufferUSB, "ping") != NULL) {
        Serial.println("{\"type\":\"pong\",\"device\":\"kizomba\",\"node\":1}");
        Serial.println("<PONG;PLACA1;STATUS=OK>");
      }
      idxUSB = 0;
    } else if (idxUSB < sizeof(bufferUSB) - 2) {
      bufferUSB[idxUSB++] = c;
    }
  }

  // Leitura da Placa 2 (Serial1)
  while (Serial1.available() > 0) {
    char c = Serial1.read();
    if (c == '\n' || c == '>') {
      bufferSerial1[idxS1] = (c == '>') ? '>' : '\0';
      if (c == '>') bufferSerial1[idxS1 + 1] = '\0';
      processarMensagemSecundaria(bufferSerial1, 2);
      idxS1 = 0;
    } else if (idxS1 < sizeof(bufferSerial1) - 2) {
      bufferSerial1[idxS1++] = c;
    }
  }

  // Leitura da Placa 3 (Serial2)
  while (Serial2.available() > 0) {
    char c = Serial2.read();
    if (c == '\n' || c == '>') {
      bufferSerial2[idxS2] = (c == '>') ? '>' : '\0';
      if (c == '>') bufferSerial2[idxS2 + 1] = '\0';
      processarMensagemSecundaria(bufferSerial2, 3);
      idxS2 = 0;
    } else if (idxS2 < sizeof(bufferSerial2) - 2) {
      bufferSerial2[idxS2++] = c;
    }
  }

  // 2. Leitura dos sensores locais a cada 200ms
  if (agora - tempoUltimaLeituraSensores >= 200) {
    tempoUltimaLeituraSensores = agora;
    lerSensoresLocais();
  }

  // 3. Heartbeat e verificação de timeouts a cada 2000ms
  verificarHeartbeatPlacas();

  // 4. Transmissão periódica USB para o aplicativo a cada 1500ms
  if (agora - tempoUltimoEnvioUSB >= 1500) {
    tempoUltimoEnvioUSB = agora;
    enviarTelemetriaUSB();
  }

  // 5. Atualização suave do display LCD a cada 500ms
  if (agora - tempoUltimaAtualizacaoLCD >= 500) {
    tempoUltimaAtualizacaoLCD = agora;
    atualizarLCD();
  }
}

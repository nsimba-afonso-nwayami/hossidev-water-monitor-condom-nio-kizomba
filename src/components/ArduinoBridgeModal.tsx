import React, { useState } from 'react';
import { Cpu, Copy, Check, Terminal, Wifi, Usb, X, Code2, Layers, ShieldCheck } from 'lucide-react';

interface ArduinoBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArduinoBridgeModal: React.FC<ArduinoBridgeModalProps> = ({ isOpen, onClose }) => {
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'placa_principal' | 'placa_2' | 'placa_3' | 'protocolo' | 'esp32_wifi'
  >('placa_principal');

  if (!isOpen) return null;

  const copyCode = (code: string, tabId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedTab(tabId);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const PLACA_PRINCIPAL_SKETCH = `/*
 * Hossidev Water Monitor - FIRMWARE DA PLACA PRINCIPAL (PRINCIPAL / NÓ 1)
 * Plataforma: Arduino Mega 2560
 * Tanques: T1 (FW1 - Tratada) e T2 (FW2 - Tratada)
 * Comunicação: USB Serial 115200 bps (PC/SCADA) + Serial1 a 57600 bps (PLACA2) + Serial2 a 57600 bps (PLACA3)
 * Controlo Individual da Sirene / Alarme Físico (T1 a T6):
 * - Nível <= 30%: aciona sirene automaticamente.
 * - Emissão sonora: máx. 2 minutos (120 s).
 * - Intervalo de repetição 1: 15 minutos (900 s).
 * - Intervalos seguintes: a cada 1 hora (3600 s) enquanto nível <= 30%.
 * - Comando {"command":"SET_ALARM","tank":N,"action":"OFF"}: silencia imediatamente até nível > 30%.
 * - Comando {"command":"SET_ALARM","tank":N,"action":"ON"}: pulso manual de até 2 minutos.
 * - Nível > 30%: desliga sirene e rearma sistema para futuras descidas.
 */

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

const uint8_t PROBES_FW1[10] = {22, 23, 24, 25, 26, 27, 28, 29, 30, 31};
const uint8_t PROBES_FW2[10] = {32, 33, 34, 35, 36, 37, 38, 39, 40, 41};
const uint8_t RELAY_PUMP_FW1 = 42;
const uint8_t RELAY_PUMP_FW2 = 43;
const uint8_t SIREN_FW1 = 44;
const uint8_t SIREN_FW2 = 45;

LiquidCrystal_I2C lcd(0x27, 20, 4);

int levelFW1 = 0, levelFW2 = 0;
int levelRW1 = 0, levelRW2 = 0;
int levelWW1 = 0, levelWW2 = 0;
int pumpFW1 = 0, pumpFW2 = 0;
int pumpRW1 = 0, pumpRW2 = 0;
int pumpWW1 = 0, pumpWW2 = 0;

// Estados de Sirene e Silenciamento
int alarmFW1 = 0, alarmFW2 = 0;
bool alarmMutedFW1 = false, alarmMutedFW2 = false;
uint32_t alarmStartFW1 = 0, alarmStartFW2 = 0;
uint32_t alarmStopFW1 = 0, alarmStopFW2 = 0;
uint8_t alarmCycleFW1 = 0, alarmCycleFW2 = 0; // 0=inicial, 1=espera 15m, 2=espera 1h

int alarmRW1 = 0, alarmRW2 = 0;
int alarmMutedRW1 = 0, alarmMutedRW2 = 0;
int alarmWW1 = 0, alarmWW2 = 0;
int alarmMutedWW1 = 0, alarmMutedWW2 = 0;

uint32_t tSensores = 0, tUSB = 0, tHeartbeat = 0, tLCD = 0;
uint16_t seqGlobal = 1;

bool p2Online = false, p3Online = false;
uint32_t p2LastHb = 0, p3LastHb = 0;
char bufS1[128], bufS2[128], bufUSB[128];
size_t idxS1 = 0, idxS2 = 0, idxUSB = 0;

void aplicarSireneLocal(int tank, bool acionar) {
  uint32_t agora = millis();
  if (tank == 1) {
    if (acionar) {
      alarmFW1 = 1;
      alarmMutedFW1 = false;
      alarmStartFW1 = agora;
      digitalWrite(SIREN_FW1, HIGH);
    } else {
      alarmFW1 = 0;
      alarmMutedFW1 = true;
      alarmStopFW1 = agora;
      digitalWrite(SIREN_FW1, LOW);
    }
  } else if (tank == 2) {
    if (acionar) {
      alarmFW2 = 1;
      alarmMutedFW2 = false;
      alarmStartFW2 = agora;
      digitalWrite(SIREN_FW2, HIGH);
    } else {
      alarmFW2 = 0;
      alarmMutedFW2 = true;
      alarmStopFW2 = agora;
      digitalWrite(SIREN_FW2, LOW);
    }
  }
}

void gerirTemporizacaoSirenes(uint32_t agora) {
  // Tanque 1 (FW1)
  if (levelFW1 > 30) {
    if (alarmFW1 == 1) {
      alarmFW1 = 0;
      digitalWrite(SIREN_FW1, LOW);
    }
    alarmMutedFW1 = false;
    alarmCycleFW1 = 0;
    alarmStartFW1 = 0;
    alarmStopFW1 = 0;
  } else if (!alarmMutedFW1) {
    if (alarmFW1 == 1) {
      if (agora - alarmStartFW1 >= 120000UL) { // 2 minutos máx
        alarmFW1 = 0;
        digitalWrite(SIREN_FW1, LOW);
        alarmStopFW1 = agora;
        alarmCycleFW1 = (alarmCycleFW1 == 0) ? 1 : 2;
      }
    } else {
      if (alarmCycleFW1 == 0 && alarmStopFW1 == 0) {
        alarmFW1 = 1;
        alarmStartFW1 = agora;
        digitalWrite(SIREN_FW1, HIGH);
      } else if (alarmCycleFW1 == 1 && (agora - alarmStopFW1 >= 900000UL)) { // 15 minutos
        alarmFW1 = 1;
        alarmStartFW1 = agora;
        digitalWrite(SIREN_FW1, HIGH);
      } else if (alarmCycleFW1 == 2 && (agora - alarmStopFW1 >= 3600000UL)) { // 1 hora
        alarmFW1 = 1;
        alarmStartFW1 = agora;
        digitalWrite(SIREN_FW1, HIGH);
      }
    }
  }

  // Tanque 2 (FW2)
  if (levelFW2 > 30) {
    if (alarmFW2 == 1) {
      alarmFW2 = 0;
      digitalWrite(SIREN_FW2, LOW);
    }
    alarmMutedFW2 = false;
    alarmCycleFW2 = 0;
    alarmStartFW2 = 0;
    alarmStopFW2 = 0;
  } else if (!alarmMutedFW2) {
    if (alarmFW2 == 1) {
      if (agora - alarmStartFW2 >= 120000UL) {
        alarmFW2 = 0;
        digitalWrite(SIREN_FW2, LOW);
        alarmStopFW2 = agora;
        alarmCycleFW2 = (alarmCycleFW2 == 0) ? 1 : 2;
      }
    } else {
      if (alarmCycleFW2 == 0 && alarmStopFW2 == 0) {
        alarmFW2 = 1;
        alarmStartFW2 = agora;
        digitalWrite(SIREN_FW2, HIGH);
      } else if (alarmCycleFW2 == 1 && (agora - alarmStopFW2 >= 900000UL)) {
        alarmFW2 = 1;
        alarmStartFW2 = agora;
        digitalWrite(SIREN_FW2, HIGH);
      } else if (alarmCycleFW2 == 2 && (agora - alarmStopFW2 >= 3600000UL)) {
        alarmFW2 = 1;
        alarmStartFW2 = agora;
        digitalWrite(SIREN_FW2, HIGH);
      }
    }
  }
}

void processarComandoUSB(const char* linha) {
  // Protocolo: {"command":"SET_ALARM","tank":1,"action":"ON"}
  if (strstr(linha, "SET_ALARM") != NULL) {
    int tId = 0;
    char* pt = strstr(linha, "\\"tank\\":");
    if (pt) tId = atoi(pt + 7);
    bool actOn = (strstr(linha, "\\"action\\":\\"ON\\"") != NULL);
    bool actOff = (strstr(linha, "\\"action\\":\\"OFF\\"") != NULL);

    if (tId >= 1 && tId <= 6 && (actOn || actOff)) {
      const char* actStr = actOn ? "ON" : "OFF";
      if (tId == 1 || tId == 2) {
        aplicarSireneLocal(tId, actOn);
        Serial.print("{\\"type\\":\\"ALARM_COMMAND_RESULT\\",\\"tank\\":");
        Serial.print(tId);
        Serial.print(",\\"action\\":\\"");
        Serial.print(actStr);
        Serial.println("\\",\\"ok\\":true,\\"reason\\":\\"APPLIED\\"}");
      } else if (tId == 3 || tId == 4) {
        seqGlobal++;
        Serial1.print("<CMD|PRINCIPAL|PLACA2|");
        Serial1.print(seqGlobal);
        Serial1.print("|SET_ALARM=");
        Serial1.print(tId);
        Serial1.print(",");
        Serial1.print(actStr);
        Serial.print("{\\"type\\":\\"ALARM_COMMAND_RESULT\\",\\"tank\\":");
        Serial.print(tId);
        Serial.print(",\\"action\\":\\"");
        Serial.print(actStr);
        Serial.println("\\",\\"ok\\":true,\\"reason\\":\\"SENT_TO_SLAVE\\"}");
      } else if (tId == 5 || tId == 6) {
        seqGlobal++;
        Serial2.print("<CMD|PRINCIPAL|PLACA3|");
        Serial2.print(seqGlobal);
        Serial2.print("|SET_ALARM=");
        Serial2.print(tId);
        Serial2.print(",");
        Serial2.print(actStr);
        Serial.print("{\\"type\\":\\"ALARM_COMMAND_RESULT\\",\\"tank\\":");
        Serial.print(tId);
        Serial.print(",\\"action\\":\\"");
        Serial.print(actStr);
        Serial.println("\\",\\"ok\\":true,\\"reason\\":\\"SENT_TO_SLAVE\\"}");
      }
    }
  }
}

void setup() {
  Serial.begin(115200);   // USB Serial para o Computador / SCADA a 115200 baud
  Serial1.begin(57600);   // Conexão direta com PLACA2 (TX1/RX1 a 57600 bps)
  Serial2.begin(57600);   // Conexão direta com PLACA3 (TX2/RX2 a 57600 bps)

  for (int i = 0; i < 10; i++) {
    pinMode(PROBES_FW1[i], INPUT_PULLUP);
    pinMode(PROBES_FW2[i], INPUT_PULLUP);
  }
  pinMode(RELAY_PUMP_FW1, OUTPUT);
  pinMode(RELAY_PUMP_FW2, OUTPUT);
  pinMode(SIREN_FW1, OUTPUT);
  pinMode(SIREN_FW2, OUTPUT);
  digitalWrite(SIREN_FW1, LOW);
  digitalWrite(SIREN_FW2, LOW);

  Wire.begin();
  #if defined(WIRE_HAS_TIMEOUT)
    Wire.setWireTimeout(3000, true);
  #endif
  lcd.init();
  lcd.backlight();
  Serial.println("<READY|PRINCIPAL|PC|1|BOOT=1|A1B2>");
}

void loop() {
  uint32_t agora = millis();

  // 1. Receção de Comandos USB Serial do SCADA (115200 baud)
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\\n' || c == '\\r') {
      if (idxUSB > 0) {
        bufUSB[idxUSB] = '\\0';
        processarComandoUSB(bufUSB);
        idxUSB = 0;
      }
    } else if (idxUSB < sizeof(bufUSB) - 2) {
      bufUSB[idxUSB++] = c;
    }
  }

  // 2. Receção de Frames PLACA2 (Serial1 a 57600 bps)
  while (Serial1.available() > 0) {
    char c = Serial1.read();
    if (c == '\\n' || c == '>') {
      bufS1[idxS1] = (c == '>') ? '>' : '\\0';
      if (c == '>') bufS1[idxS1 + 1] = '\\0';
      p2Online = true; p2LastHb = agora;
      Serial.println(bufS1); // Encaminha frame para o app via USB
      if (strstr(bufS1, "T3=")) levelRW1 = atoi(strstr(bufS1, "T3=") + 3);
      if (strstr(bufS1, "T4=")) levelRW2 = atoi(strstr(bufS1, "T4=") + 3);
      if (strstr(bufS1, "A3=")) alarmRW1 = atoi(strstr(bufS1, "A3=") + 3);
      if (strstr(bufS1, "A4=")) alarmRW2 = atoi(strstr(bufS1, "A4=") + 3);
      if (strstr(bufS1, "M3=")) alarmMutedRW1 = atoi(strstr(bufS1, "M3=") + 3);
      if (strstr(bufS1, "M4=")) alarmMutedRW2 = atoi(strstr(bufS1, "M4=") + 3);
      idxS1 = 0;
    } else if (idxS1 < sizeof(bufS1) - 2) bufS1[idxS1++] = c;
  }

  // 3. Receção de Frames PLACA3 (Serial2 a 57600 bps)
  while (Serial2.available() > 0) {
    char c = Serial2.read();
    if (c == '\\n' || c == '>') {
      bufS2[idxS2] = (c == '>') ? '>' : '\\0';
      if (c == '>') bufS2[idxS2 + 1] = '\\0';
      p3Online = true; p3LastHb = agora;
      Serial.println(bufS2); // Encaminha frame para o app via USB
      if (strstr(bufS2, "T5=")) levelWW1 = atoi(strstr(bufS2, "T5=") + 3);
      if (strstr(bufS2, "T6=")) levelWW2 = atoi(strstr(bufS2, "T6=") + 3);
      if (strstr(bufS2, "A5=")) alarmWW1 = atoi(strstr(bufS2, "A5=") + 3);
      if (strstr(bufS2, "A6=")) alarmWW2 = atoi(strstr(bufS2, "A6=") + 3);
      if (strstr(bufS2, "M5=")) alarmMutedWW1 = atoi(strstr(bufS2, "M5=") + 3);
      if (strstr(bufS2, "M6=")) alarmMutedWW2 = atoi(strstr(bufS2, "M6=") + 3);
      idxS2 = 0;
    } else if (idxS2 < sizeof(bufS2) - 2) bufS2[idxS2++] = c;
  }

  // 4. Leitura Provas Ópticas FW1 e FW2 (sem delay)
  if (agora - tSensores >= 200) {
    tSensores = agora;
    int s1 = 0, s2 = 0;
    for (int i = 0; i < 10; i++) {
      if (digitalRead(PROBES_FW1[i]) == LOW) s1++;
      if (digitalRead(PROBES_FW2[i]) == LOW) s2++;
    }
    levelFW1 = s1 * 10;
    levelFW2 = s2 * 10;
    gerirTemporizacaoSirenes(agora);
  }

  // 5. Heartbeat e Watchdog para as Placas Secundárias (2000ms)
  if (agora - tHeartbeat >= 2000) {
    tHeartbeat = agora;
    seqGlobal++;
    Serial1.print("<PING|PRINCIPAL|PLACA2|"); Serial1.print(seqGlobal); Serial1.println("||0000>");
    Serial2.print("<PING|PRINCIPAL|PLACA3|"); Serial2.print(seqGlobal); Serial2.println("||0000>");
    if (agora - p2LastHb > 4000) p2Online = false;
    if (agora - p3LastHb > 4000) p3Online = false;
  }

  // 6. Telemetria Unificada enviada pela USB para o SCADA (1500ms)
  if (agora - tUSB >= 1500) {
    tUSB = agora;
    Serial.print("{\\"device\\":\\"kizomba\\",\\"uptime\\":");
    Serial.print(agora / 1000);
    Serial.print(",\\"tanks\\":[{\\"id\\":1,\\"level\\":");
    Serial.print(levelFW1);
    Serial.print(",\\"pump\\":");
    Serial.print(pumpFW1);
    Serial.print(",\\"alarm\\":");
    Serial.print(alarmFW1);
    Serial.print(",\\"alarm_muted\\":");
    Serial.print(alarmMutedFW1 ? 1 : 0);
    Serial.print("},{\\"id\\":2,\\"level\\":");
    Serial.print(levelFW2);
    Serial.print(",\\"pump\\":");
    Serial.print(pumpFW2);
    Serial.print(",\\"alarm\\":");
    Serial.print(alarmFW2);
    Serial.print(",\\"alarm_muted\\":");
    Serial.print(alarmMutedFW2 ? 1 : 0);
    Serial.print("},{\\"id\\":3,\\"level\\":");
    Serial.print(levelRW1);
    Serial.print(",\\"pump\\":");
    Serial.print(pumpRW1);
    Serial.print(",\\"alarm\\":");
    Serial.print(alarmRW1);
    Serial.print(",\\"alarm_muted\\":");
    Serial.print(alarmMutedRW1);
    Serial.print("},{\\"id\\":4,\\"level\\":");
    Serial.print(levelRW2);
    Serial.print(",\\"pump\\":");
    Serial.print(pumpRW2);
    Serial.print(",\\"alarm\\":");
    Serial.print(alarmRW2);
    Serial.print(",\\"alarm_muted\\":");
    Serial.print(alarmMutedRW2);
    Serial.print("},{\\"id\\":5,\\"level\\":");
    Serial.print(levelWW1);
    Serial.print(",\\"pump\\":");
    Serial.print(pumpWW1);
    Serial.print(",\\"alarm\\":");
    Serial.print(alarmWW1);
    Serial.print(",\\"alarm_muted\\":");
    Serial.print(alarmMutedWW1);
    Serial.print("},{\\"id\\":6,\\"level\\":");
    Serial.print(levelWW2);
    Serial.print(",\\"pump\\":");
    Serial.print(pumpWW2);
    Serial.print(",\\"alarm\\":");
    Serial.print(alarmWW2);
    Serial.print(",\\"alarm_muted\\":");
    Serial.print(alarmMutedWW2);
    Serial.println("}]}");
  }

  // 7. Display LCD Local (500ms)
  if (agora - tLCD >= 500) {
    tLCD = agora;
    lcd.setCursor(0, 0); lcd.print("FW1:"); lcd.print(levelFW1); lcd.print("% FW2:"); lcd.print(levelFW2); lcd.print("%  ");
    lcd.setCursor(0, 1); lcd.print("RW1:"); lcd.print(levelRW1); lcd.print("% RW2:"); lcd.print(levelRW2); lcd.print("%  ");
    lcd.setCursor(0, 2); lcd.print("WW1:"); lcd.print(levelWW1); lcd.print("% WW2:"); lcd.print(levelWW2); lcd.print("%  ");
    lcd.setCursor(0, 3); lcd.print("P2:"); lcd.print(p2Online ? "OK " : "ERR");
    lcd.print(" P3:"); lcd.print(p3Online ? "OK " : "ERR"); lcd.print(" USB:OK ");
  }
}`;

  const PLACA_2_SKETCH = `/*
 * Hossidev Water Monitor - FIRMWARE DA PLACA 2 (PLACA2 / NÓ 2 - ÁGUA PRÉ-TRATADA)
 * Plataforma: Arduino Mega 2560
 * Tanques: T3 (RW1 - Pré-Tratada) e T4 (RW2 - Pré-Tratada)
 * Comunicação: Serial1 a 57600 bps com a Placa Principal
 * Protocolo de Frames: <TIPO|ORIGEM|DESTINO|SEQUENCIA|PAYLOAD|CRC>
 */

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

const uint8_t PROBES_RW1[10] = {22, 23, 24, 25, 26, 27, 28, 29, 30, 31};
const uint8_t PROBES_RW2[10] = {32, 33, 34, 35, 36, 37, 38, 39, 40, 41};
const uint8_t RELAY_RW1 = 42;
const uint8_t RELAY_RW2 = 43;
const uint8_t SIREN_RW1 = 44;
const uint8_t SIREN_RW2 = 45;

LiquidCrystal_I2C lcd(0x27, 16, 2);

int levelRW1 = 0, levelRW2 = 0;
int pumpRW1 = 0, pumpRW2 = 0;
int faultRW1 = 0, faultRW2 = 0;

int alarmRW1 = 0, alarmRW2 = 0;
bool alarmMutedRW1 = false, alarmMutedRW2 = false;
uint32_t alarmStartRW1 = 0, alarmStartRW2 = 0;
uint32_t alarmStopRW1 = 0, alarmStopRW2 = 0;
uint8_t alarmCycleRW1 = 0, alarmCycleRW2 = 0;

uint16_t seq = 1;
uint32_t bootCount = 1;
uint32_t tLeitura = 0, tEnvio = 0, tLCD = 0;
char rxBuf[128];
size_t rxIdx = 0;

void aplicarSireneRW(int tank, bool acionar) {
  uint32_t agora = millis();
  if (tank == 3) {
    if (acionar) {
      alarmRW1 = 1;
      alarmMutedRW1 = false;
      alarmStartRW1 = agora;
      digitalWrite(SIREN_RW1, HIGH);
    } else {
      alarmRW1 = 0;
      alarmMutedRW1 = true;
      alarmStopRW1 = agora;
      digitalWrite(SIREN_RW1, LOW);
    }
  } else if (tank == 4) {
    if (acionar) {
      alarmRW2 = 1;
      alarmMutedRW2 = false;
      alarmStartRW2 = agora;
      digitalWrite(SIREN_RW2, HIGH);
    } else {
      alarmRW2 = 0;
      alarmMutedRW2 = true;
      alarmStopRW2 = agora;
      digitalWrite(SIREN_RW2, LOW);
    }
  }
}

void gerirSirenesRW(uint32_t agora) {
  // Tanque 3
  if (levelRW1 > 30) {
    if (alarmRW1 == 1) { alarmRW1 = 0; digitalWrite(SIREN_RW1, LOW); }
    alarmMutedRW1 = false; alarmCycleRW1 = 0; alarmStartRW1 = 0; alarmStopRW1 = 0;
  } else if (!alarmMutedRW1) {
    if (alarmRW1 == 1) {
      if (agora - alarmStartRW1 >= 120000UL) {
        alarmRW1 = 0; digitalWrite(SIREN_RW1, LOW); alarmStopRW1 = agora;
        alarmCycleRW1 = (alarmCycleRW1 == 0) ? 1 : 2;
      }
    } else {
      if (alarmCycleRW1 == 0 && alarmStopRW1 == 0) {
        alarmRW1 = 1; alarmStartRW1 = agora; digitalWrite(SIREN_RW1, HIGH);
      } else if (alarmCycleRW1 == 1 && (agora - alarmStopRW1 >= 900000UL)) {
        alarmRW1 = 1; alarmStartRW1 = agora; digitalWrite(SIREN_RW1, HIGH);
      } else if (alarmCycleRW1 == 2 && (agora - alarmStopRW1 >= 3600000UL)) {
        alarmRW1 = 1; alarmStartRW1 = agora; digitalWrite(SIREN_RW1, HIGH);
      }
    }
  }

  // Tanque 4
  if (levelRW2 > 30) {
    if (alarmRW2 == 1) { alarmRW2 = 0; digitalWrite(SIREN_RW2, LOW); }
    alarmMutedRW2 = false; alarmCycleRW2 = 0; alarmStartRW2 = 0; alarmStopRW2 = 0;
  } else if (!alarmMutedRW2) {
    if (alarmRW2 == 1) {
      if (agora - alarmStartRW2 >= 120000UL) {
        alarmRW2 = 0; digitalWrite(SIREN_RW2, LOW); alarmStopRW2 = agora;
        alarmCycleRW2 = (alarmCycleRW2 == 0) ? 1 : 2;
      }
    } else {
      if (alarmCycleRW2 == 0 && alarmStopRW2 == 0) {
        alarmRW2 = 1; alarmStartRW2 = agora; digitalWrite(SIREN_RW2, HIGH);
      } else if (alarmCycleRW2 == 1 && (agora - alarmStopRW2 >= 900000UL)) {
        alarmRW2 = 1; alarmStartRW2 = agora; digitalWrite(SIREN_RW2, HIGH);
      } else if (alarmCycleRW2 == 2 && (agora - alarmStopRW2 >= 3600000UL)) {
        alarmRW2 = 1; alarmStartRW2 = agora; digitalWrite(SIREN_RW2, HIGH);
      }
    }
  }
}

void lerSensores() {
  int s1 = 0, s2 = 0;
  for (int i = 0; i < 10; i++) {
    if (digitalRead(PROBES_RW1[i]) == LOW) s1++;
    if (digitalRead(PROBES_RW2[i]) == LOW) s2++;
  }
  levelRW1 = s1 * 10;
  levelRW2 = s2 * 10;
}

void enviarTelemetria() {
  seq++;
  Serial1.print("<DATA|PLACA2|PRINCIPAL|");
  Serial1.print(seq);
  Serial1.print("|T3=");
  Serial1.print(levelRW1);
  Serial1.print(";T4=");
  Serial1.print(levelRW2);
  Serial1.print(";P3=");
  Serial1.print(pumpRW1);
  Serial1.print(";P4=");
  Serial1.print(pumpRW2);
  Serial1.print(";A3=");
  Serial1.print(alarmRW1);
  Serial1.print(";A4=");
  Serial1.print(alarmRW2);
  Serial1.print(";M3=");
  Serial1.print(alarmMutedRW1 ? 1 : 0);
  Serial1.print(";M4=");
  Serial1.print(alarmMutedRW2 ? 1 : 0);
  Serial1.print(";F3=");
  Serial1.print(faultRW1);
  Serial1.print(";F4=");
  Serial1.print(faultRW2);
  Serial1.println("|C3D1>");
}

void processarComando(const char* frame) {
  if (strstr(frame, "PING") != NULL) {
    Serial1.print("<PONG|PLACA2|PRINCIPAL|");
    Serial1.print(seq);
    Serial1.print("|BOOT=");
    Serial1.print(bootCount);
    Serial1.print(";UPTIME=");
    Serial1.print(millis() / 1000);
    Serial1.println("|7FA2>");
  } else if (strstr(frame, "POLL") != NULL) {
    enviarTelemetria();
  } else if (strstr(frame, "SET_ALARM=") != NULL) {
    char* p = strstr(frame, "SET_ALARM=") + 10;
    int tank = atoi(p);
    bool on = (strstr(p, "ON") != NULL);
    aplicarSireneRW(tank, on);
    enviarTelemetria();
  }
}

void setup() {
  Serial.begin(115200);   // Diagnóstico local USB
  Serial1.begin(57600);   // Conexão com Placa Principal (TX1/RX1 a 57600 bps)

  for (int i = 0; i < 10; i++) {
    pinMode(PROBES_RW1[i], INPUT_PULLUP);
    pinMode(PROBES_RW2[i], INPUT_PULLUP);
  }
  pinMode(RELAY_RW1, OUTPUT);
  pinMode(RELAY_RW2, OUTPUT);
  pinMode(SIREN_RW1, OUTPUT);
  pinMode(SIREN_RW2, OUTPUT);
  digitalWrite(SIREN_RW1, LOW);
  digitalWrite(SIREN_RW2, LOW);

  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print("PLACA 2 (RW1/RW2)");
  lcd.setCursor(0, 1); lcd.print("UART: 57600 bps");

  Serial1.print("<READY|PLACA2|PRINCIPAL|1|BOOT=");
  Serial1.print(bootCount);
  Serial1.println("|A1B2>");
}

void loop() {
  uint32_t agora = millis();

  while (Serial1.available() > 0) {
    char c = Serial1.read();
    if (c == '\\n' || c == '>') {
      rxBuf[rxIdx] = (c == '>') ? '>' : '\\0';
      if (c == '>') rxBuf[rxIdx + 1] = '\\0';
      processarComando(rxBuf);
      rxIdx = 0;
    } else if (rxIdx < sizeof(rxBuf) - 2) rxBuf[rxIdx++] = c;
  }

  if (agora - tLeitura >= 200) {
    tLeitura = agora;
    lerSensores();
    gerirSirenesRW(agora);
  }

  if (agora - tEnvio >= 2000) {
    tEnvio = agora;
    enviarTelemetria();
  }

  if (agora - tLCD >= 500) {
    tLCD = agora;
    lcd.setCursor(0, 0); lcd.print("RW1:"); lcd.print(levelRW1); lcd.print("% ");
    lcd.setCursor(0, 1); lcd.print("RW2:"); lcd.print(levelRW2); lcd.print("% ");
  }
}`;

  const PLACA_3_SKETCH = `/*
 * Hossidev Water Monitor - FIRMWARE DA PLACA 3 (PLACA3 / NÓ 3 - ÁGUA BRUTA / POÇO)
 * Plataforma: Arduino Mega 2560
 * Tanques: T5 (WW1 - Bruta) e T6 (WW2 - Bruta)
 * Comunicação: Serial1 a 57600 bps com a Placa Principal
 * Protocolo de Frames: <TIPO|ORIGEM|DESTINO|SEQUENCIA|PAYLOAD|CRC>
 */

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

const uint8_t PROBES_WW1[10] = {22, 23, 24, 25, 26, 27, 28, 29, 30, 31};
const uint8_t PROBES_WW2[10] = {32, 33, 34, 35, 36, 37, 38, 39, 40, 41};
const uint8_t RELAY_WW1 = 42;
const uint8_t RELAY_WW2 = 43;
const uint8_t SIREN_WW1 = 44;
const uint8_t SIREN_WW2 = 45;

LiquidCrystal_I2C lcd(0x27, 16, 2);

int levelWW1 = 0, levelWW2 = 0;
int pumpWW1 = 0, pumpWW2 = 0;
int faultWW1 = 0, faultWW2 = 0;

int alarmWW1 = 0, alarmWW2 = 0;
bool alarmMutedWW1 = false, alarmMutedWW2 = false;
uint32_t alarmStartWW1 = 0, alarmStartWW2 = 0;
uint32_t alarmStopWW1 = 0, alarmStopWW2 = 0;
uint8_t alarmCycleWW1 = 0, alarmCycleWW2 = 0;

uint16_t seq = 1;
uint32_t bootCount = 1;
uint32_t tLeitura = 0, tEnvio = 0, tLCD = 0;
char rxBuf[128];
size_t rxIdx = 0;

void aplicarSireneWW(int tank, bool acionar) {
  uint32_t agora = millis();
  if (tank == 5) {
    if (acionar) {
      alarmWW1 = 1;
      alarmMutedWW1 = false;
      alarmStartWW1 = agora;
      digitalWrite(SIREN_WW1, HIGH);
    } else {
      alarmWW1 = 0;
      alarmMutedWW1 = true;
      alarmStopWW1 = agora;
      digitalWrite(SIREN_WW1, LOW);
    }
  } else if (tank == 6) {
    if (acionar) {
      alarmWW2 = 1;
      alarmMutedWW2 = false;
      alarmStartWW2 = agora;
      digitalWrite(SIREN_WW2, HIGH);
    } else {
      alarmWW2 = 0;
      alarmMutedWW2 = true;
      alarmStopWW2 = agora;
      digitalWrite(SIREN_WW2, LOW);
    }
  }
}

void gerirSirenesWW(uint32_t agora) {
  // Tanque 5
  if (levelWW1 > 30) {
    if (alarmWW1 == 1) { alarmWW1 = 0; digitalWrite(SIREN_WW1, LOW); }
    alarmMutedWW1 = false; alarmCycleWW1 = 0; alarmStartWW1 = 0; alarmStopWW1 = 0;
  } else if (!alarmMutedWW1) {
    if (alarmWW1 == 1) {
      if (agora - alarmStartWW1 >= 120000UL) {
        alarmWW1 = 0; digitalWrite(SIREN_WW1, LOW); alarmStopWW1 = agora;
        alarmCycleWW1 = (alarmCycleWW1 == 0) ? 1 : 2;
      }
    } else {
      if (alarmCycleWW1 == 0 && alarmStopWW1 == 0) {
        alarmWW1 = 1; alarmStartWW1 = agora; digitalWrite(SIREN_WW1, HIGH);
      } else if (alarmCycleWW1 == 1 && (agora - alarmStopWW1 >= 900000UL)) {
        alarmWW1 = 1; alarmStartWW1 = agora; digitalWrite(SIREN_WW1, HIGH);
      } else if (alarmCycleWW1 == 2 && (agora - alarmStopWW1 >= 3600000UL)) {
        alarmWW1 = 1; alarmStartWW1 = agora; digitalWrite(SIREN_WW1, HIGH);
      }
    }
  }

  // Tanque 6
  if (levelWW2 > 30) {
    if (alarmWW2 == 1) { alarmWW2 = 0; digitalWrite(SIREN_WW2, LOW); }
    alarmMutedWW2 = false; alarmCycleWW2 = 0; alarmStartWW2 = 0; alarmStopWW2 = 0;
  } else if (!alarmMutedWW2) {
    if (alarmWW2 == 1) {
      if (agora - alarmStartWW2 >= 120000UL) {
        alarmWW2 = 0; digitalWrite(SIREN_WW2, LOW); alarmStopWW2 = agora;
        alarmCycleWW2 = (alarmCycleWW2 == 0) ? 1 : 2;
      }
    } else {
      if (alarmCycleWW2 == 0 && alarmStopWW2 == 0) {
        alarmWW2 = 1; alarmStartWW2 = agora; digitalWrite(SIREN_WW2, HIGH);
      } else if (alarmCycleWW2 == 1 && (agora - alarmStopWW2 >= 900000UL)) {
        alarmWW2 = 1; alarmStartWW2 = agora; digitalWrite(SIREN_WW2, HIGH);
      } else if (alarmCycleWW2 == 2 && (agora - alarmStopWW2 >= 3600000UL)) {
        alarmWW2 = 1; alarmStartWW2 = agora; digitalWrite(SIREN_WW2, HIGH);
      }
    }
  }
}

void lerSensores() {
  int s1 = 0, s2 = 0;
  for (int i = 0; i < 10; i++) {
    if (digitalRead(PROBES_WW1[i]) == LOW) s1++;
    if (digitalRead(PROBES_WW2[i]) == LOW) s2++;
  }
  levelWW1 = s1 * 10;
  levelWW2 = s2 * 10;
}

void enviarTelemetria() {
  seq++;
  Serial1.print("<DATA|PLACA3|PRINCIPAL|");
  Serial1.print(seq);
  Serial1.print("|T5=");
  Serial1.print(levelWW1);
  Serial1.print(";T6=");
  Serial1.print(levelWW2);
  Serial1.print(";P5=");
  Serial1.print(pumpWW1);
  Serial1.print(";P6=");
  Serial1.print(pumpWW2);
  Serial1.print(";A5=");
  Serial1.print(alarmWW1);
  Serial1.print(";A6=");
  Serial1.print(alarmWW2);
  Serial1.print(";M5=");
  Serial1.print(alarmMutedWW1 ? 1 : 0);
  Serial1.print(";M6=");
  Serial1.print(alarmMutedWW2 ? 1 : 0);
  Serial1.print(";F5=");
  Serial1.print(faultWW1);
  Serial1.print(";F6=");
  Serial1.print(faultWW2);
  Serial1.println("|7FA2>");
}

void processarComando(const char* frame) {
  if (strstr(frame, "PING") != NULL) {
    Serial1.print("<PONG|PLACA3|PRINCIPAL|");
    Serial1.print(seq);
    Serial1.print("|BOOT=");
    Serial1.print(bootCount);
    Serial1.print(";UPTIME=");
    Serial1.print(millis() / 1000);
    Serial1.println("|7FA2>");
  } else if (strstr(frame, "POLL") != NULL) {
    enviarTelemetria();
  } else if (strstr(frame, "SET_ALARM=") != NULL) {
    char* p = strstr(frame, "SET_ALARM=") + 10;
    int tank = atoi(p);
    bool on = (strstr(p, "ON") != NULL);
    aplicarSireneWW(tank, on);
    enviarTelemetria();
  }
}

void setup() {
  Serial.begin(115200);   // Diagnóstico local USB
  Serial1.begin(57600);   // Conexão com Placa Principal (TX1/RX1 a 57600 bps)

  for (int i = 0; i < 10; i++) {
    pinMode(PROBES_WW1[i], INPUT_PULLUP);
    pinMode(PROBES_WW2[i], INPUT_PULLUP);
  }
  pinMode(RELAY_WW1, OUTPUT);
  pinMode(RELAY_WW2, OUTPUT);
  pinMode(SIREN_WW1, OUTPUT);
  pinMode(SIREN_WW2, OUTPUT);
  digitalWrite(SIREN_WW1, LOW);
  digitalWrite(SIREN_WW2, LOW);

  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print("PLACA 3 (WW1/WW2)");
  lcd.setCursor(0, 1); lcd.print("UART: 57600 bps");

  Serial1.print("<READY|PLACA3|PRINCIPAL|1|BOOT=");
  Serial1.print(bootCount);
  Serial1.println("|A1B2>");
}

void loop() {
  uint32_t agora = millis();

  while (Serial1.available() > 0) {
    char c = Serial1.read();
    if (c == '\\n' || c == '>') {
      rxBuf[rxIdx] = (c == '>') ? '>' : '\\0';
      if (c == '>') rxBuf[rxIdx + 1] = '\\0';
      processarComando(rxBuf);
      rxIdx = 0;
    } else if (rxIdx < sizeof(rxBuf) - 2) rxBuf[rxIdx++] = c;
  }

  if (agora - tLeitura >= 200) {
    tLeitura = agora;
    lerSensores();
    gerirSirenesWW(agora);
  }

  if (agora - tEnvio >= 2000) {
    tEnvio = agora;
    enviarTelemetria();
  }

  if (agora - tLCD >= 500) {
    tLCD = agora;
    lcd.setCursor(0, 0); lcd.print("WW1:"); lcd.print(levelWW1); lcd.print("% ");
    lcd.setCursor(0, 1); lcd.print("WW2:"); lcd.print(levelWW2); lcd.print("% ");
  }
}`;

  const PROTOCOLO_SPEC = `/*
 * ESPECIFICAÇÃO DO PROTOCOLO ARDUINO MEGA 2560 & SCADA (HOSSIDEV SCADA)
 * Topologia:
 * - PRINCIPAL (Mega 2560): Monitora T1 & T2, USB 115200 bps ao PC, Serial1 (57600) e Serial2 (57600).
 * - PLACA2 (Mega 2560): Monitora T3 & T4, Serial1 a 57600 bps com a Placa Principal.
 * - PLACA3 (Mega 2560): Monitora T5 & T6, Serial1 a 57600 bps com a Placa Principal.
 *
 * 1. Comandos de Controlo Individual de Sirene (PC/SCADA -> Placa Principal via USB a 115200 baud):
 *    {"command":"SET_ALARM","tank":1,"action":"ON"}
 *    {"command":"SET_ALARM","tank":1,"action":"OFF"}
 *    - tank: 1 a 6
 *    - action: "ON" ou "OFF"
 *    - Resposta do Controlador:
 *      {"type":"ALARM_COMMAND_RESULT","tank":1,"action":"OFF","ok":true,"reason":"APPLIED"}
 *      Para tanques remotos (T3 a T6), a razão inicial é:
 *      {"type":"ALARM_COMMAND_RESULT","tank":3,"action":"OFF","ok":true,"reason":"SENT_TO_SLAVE"}
 *      e o estado físico é confirmado na próxima telemetria com "alarm":0,"alarm_muted":1.
 *
 * 2. Lógica Temporal Autónoma no Firmware:
 *    - Nível <= 30%: a sirene pode iniciar automaticamente.
 *    - Duração de cada emissão: máx. 2 minutos (120 s).
 *    - 1ª Repetição: 15 minutos (900 s) após o término da primeira emissão (se nível <= 30%).
 *    - Repetições seguintes: a cada 1 hora (3600 s) enquanto nível <= 30%.
 *    - Comando "Desativar sirene" (OFF): silencia imediatamente e impede novas emissões até nível > 30%.
 *    - Comando "Ativar sirene" (ON): pulso manual de até 2 minutos.
 *    - Nível > 30%: sirene cessa imediatamente e sistema é rearmado para futura descida.
 *
 * 3. Telemetria Unificada USB (JSON com newline):
 *    {"device":"kizomba","uptime":120,"tanks":[
 *      {"id":1,"level":70,"pump":0,"alarm":0,"alarm_muted":0},
 *      {"id":2,"level":20,"pump":1,"alarm":1,"alarm_muted":0},
 *      ...
 *    ]}
 *
 * 4. Frames entre Placas (UART a 57600 bps):
 *    <DATA|PLACA2|PRINCIPAL|35|T3=50;T4=70;P3=0;P4=1;A3=0;A4=1;M3=0;M4=0;F3=0;F4=0|C3D1>
 *    <CMD|PRINCIPAL|PLACA2|36|SET_ALARM=3,OFF|A1B2>
 */`;

  const ESP32_WIFI_SKETCH = `/*
 * Hossidi Water Monitor - Gateway ESP32 WiFi / HTTP Ingestion
 * Envia leituras diretamente para o Backend via POST /api/telemetry/ingest
 */

#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "SEU_WIFI_SSID";
const char* password = "SUA_SENHA_WIFI";
const char* serverUrl = "https://SEU_DOMINIO/api/telemetry/ingest";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi conectado!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String payload = "{\\"nodeId\\":1,\\"source\\":\\"http_ingest\\",\\"tanks\\":[{\\"id\\":1,\\"level\\":80,\\"pump\\":1,\\"sensors\\":[1,1,1,1,1,1,1,1,0,0],\\"fault\\":0}]}";
    int httpResponseCode = http.POST(payload);
    Serial.printf("Status HTTP: %d\\n", httpResponseCode);
    http.end();
  }
  delay(5000);
}`;

  return (
    <div
      id="arduinoBridgeModal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="glass-modal rounded-[2.5rem] w-full max-w-4xl overflow-hidden flex flex-col shadow-2xl border border-slate-800 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Firmware das 3 Placas Arduino & Comunicação
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Placa Principal (FW1, FW2) • Placa 2 (RW1, RW2) • Placa 3 (WW1, WW2)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-slate-900/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-4 pb-2 flex flex-wrap gap-2 border-b border-slate-800/60 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('placa_principal')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'placa_principal'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            <span>Placa Principal (Mestre)</span>
          </button>

          <button
            onClick={() => setActiveTab('placa_2')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'placa_2'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Placa 2 (RW1 & RW2)</span>
          </button>

          <button
            onClick={() => setActiveTab('placa_3')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'placa_3'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Placa 3 (WW1 & WW2)</span>
          </button>

          <button
            onClick={() => setActiveTab('protocolo')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'protocolo'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Protocolo SCADA & CRC</span>
          </button>

          <button
            onClick={() => setActiveTab('esp32_wifi')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'esp32_wifi'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Gateway WiFi / REST</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">
              {activeTab === 'placa_principal' && 'Firmware Placa Principal (Arduino Mega / ESP32):'}
              {activeTab === 'placa_2' && 'Firmware Placa 2 (Água Pré-Tratada - Tanques 3 e 4):'}
              {activeTab === 'placa_3' && 'Firmware Placa 3 (Água Bruta - Tanques 5 e 6):'}
              {activeTab === 'protocolo' && 'Estrutura de Mensagens com Delimitadores, CRC e ACK:'}
              {activeTab === 'esp32_wifi' && 'Gateway WiFi ESP32 (Ingestão HTTP REST):'}
            </span>

            <button
              onClick={() => {
                const text =
                  activeTab === 'placa_principal'
                    ? PLACA_PRINCIPAL_SKETCH
                    : activeTab === 'placa_2'
                    ? PLACA_2_SKETCH
                    : activeTab === 'placa_3'
                    ? PLACA_3_SKETCH
                    : activeTab === 'protocolo'
                    ? PROTOCOLO_SPEC
                    : ESP32_WIFI_SKETCH;
                copyCode(text, activeTab);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {copiedTab === activeTab ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Código</span>
                </>
              )}
            </button>
          </div>

          <div className="relative">
            <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-[360px] leading-relaxed">
              {activeTab === 'placa_principal' && PLACA_PRINCIPAL_SKETCH}
              {activeTab === 'placa_2' && PLACA_2_SKETCH}
              {activeTab === 'placa_3' && PLACA_3_SKETCH}
              {activeTab === 'protocolo' && PROTOCOLO_SPEC}
              {activeTab === 'esp32_wifi' && ESP32_WIFI_SKETCH}
            </pre>
          </div>

          <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-slate-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-cyan-300">Garantia de Não-Interrupção (Resiliência SCADA):</span>
              <p className="text-[11px] text-slate-400">
                1. <strong>Loop 100% não-bloqueante</strong>: Leituras e LCDs utilizam <code className="text-cyan-300">millis()</code>, eliminando delays.
                <br />
                2. <strong>Isolamento de falhas</strong>: Se a Placa 2 ou Placa 3 perder temporariamente o sinal, a Placa Principal mantém a comunicação com as demais placas e com a aplicação aberta.
                <br />
                3. <strong>Retenção de dados</strong>: Os cartões e gráficos NUNCA são apagados nem zerados; exibem a última leitura válida e o status de reconexão em andamento.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

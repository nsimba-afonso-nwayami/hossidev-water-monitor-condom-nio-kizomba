# Hossidi Water Monitor - Arquitetura e Firmware dos 6 Reservatórios

Este diretório contém os códigos-fonte corrigidos e definitivos para as 3 placas Arduino do sistema de monitoramento de água:

- **`placa_principal.ino`**: Placa Principal (Mestre - Água Tratada: FW1 e FW2).
- **`placa_2.ino`**: Placa 2 (Secundária 1 - Água Não Tratada: RW1 e RW2).
- **`placa_3.ino`**: Placa 3 (Secundária 2 - Água Bruta / Poço: WW1 e WW2).
- **`protocolo_hossidi.h`**: Cabeçalho com cálculo de integridade CRC-16 e montagem de pacotes com sequência (SEQ) e confirmação (ACK).

---

## 1. Topologia de Comunicação e Barramento

```
                       [ Computador / SCADA Web ]
                                   │
                           USB Serial 115200
                                   │
                                   ▼
                   ┌────────────────────────────────┐
                   │    PLACA PRINCIPAL (MESTRE)    │
                   │  - Tanques FW1 e FW2 (10+10)   │
                   │  - LCD 20x4 I2C                │
                   │  - Relés Bombas FW1 e FW2      │
                   └───────┬────────────────┬───────┘
                           │                │
                UART Serial1 (115200)    UART Serial2 (115200)
                (ou RS-485 / I2C)        (ou RS-485 / I2C)
                           │                │
                           ▼                ▼
             ┌──────────────────┐     ┌──────────────────┐
             │     PLACA 2      │     │     PLACA 3      │
             │ - Tanques RW1/RW2│     │ - Tanques WW1/WW2│
             │ - 10+10 Provas   │     │ - 10+10 Provas   │
             │ - LCD 16x2 I2C   │     │ - LCD 16x2 I2C   │
             │ - Relés Bombas   │     │ - Relés Bombas   │
             └──────────────────┘     └──────────────────┘
```

---

## 2. Pinos e Ligações Físicas

### Placa Principal (Arduino Mega 2560 ou ESP32)
* **Comunicação USB**: Porta Serial primária (D0/RX0, D1/TX0) ligada ao PC via cabo USB.
* **Comunicação Placa 2**: Serial1 (TX1 = Pino 18 ligado ao RX da Placa 2; RX1 = Pino 19 ligado ao TX da Placa 2; **GND comum interligado**).
* **Comunicação Placa 3**: Serial2 (TX2 = Pino 16 ligado ao RX da Placa 3; RX2 = Pino 17 ligado ao TX da Placa 3; **GND comum interligado**).
* **Barramento I2C (Display LCD)**: SDA = Pino 20, SCL = Pino 21, VCC = 5V, GND. Resistores de pull-up de 4.7kΩ recomendados.
* **Provas Ópticas Tanque 1 (FW1)**: Pinos 22 a 31 com `INPUT_PULLUP` ativado.
* **Provas Ópticas Tanque 2 (FW2)**: Pinos 32 a 41 com `INPUT_PULLUP` ativado.
* **Relés de Bomba**: Pino 42 (Bomba FW1) e Pino 43 (Bomba FW2).

### Placa 2 (Arduino Uno, Nano, Mega ou Pro Mini)
* **Comunicação UART**: TX (Pino 1) ligado ao RX1 da Placa Principal; RX (Pino 0) ligado ao TX1 da Placa Principal; **GND comum**.
* **Display LCD I2C**: SDA (Pino A4 no Uno/Nano), SCL (Pino A5 no Uno/Nano).
* **Provas Ópticas Tanque 3 (RW1)**: Pinos 2 a 11 com `INPUT_PULLUP`.
* **Provas Ópticas Tanque 4 (RW2)**: Pinos 12, 13, A0, A1, A2, A3, D14, D15, D16, D17 com `INPUT_PULLUP`.
* **Relés de Bomba**: Pino 18 (Bomba RW1) e Pino 19 (Bomba RW2).

### Placa 3 (Arduino Uno, Nano, Mega ou Pro Mini)
* **Comunicação UART**: TX (Pino 1) ligado ao RX2 da Placa Principal; RX (Pino 0) ligado ao TX2 da Placa Principal; **GND comum**.
* **Display LCD I2C**: SDA (Pino A4), SCL (Pino A5).
* **Provas Ópticas Tanque 5 (WW1)**: Pinos 2 a 11 com `INPUT_PULLUP`.
* **Provas Ópticas Tanque 6 (WW2)**: Pinos 12, 13, A0, A1, A2, A3, D14, D15, D16, D17 com `INPUT_PULLUP`.
* **Relés de Bomba**: Pino 18 (Bomba WW1) e Pino 19 (Bomba WW2).

---

## 3. Protocolo SCADA e Heartbeat

- Formato de Telemetria:
  `<DATA;PLACA2;SEQ=152;RW1=68;RW2=51;CRC=AB12>`
- Confirmação ACK:
  `<ACK;PLACA2;SEQ=152>`
- Heartbeat:
  `<HEARTBEAT;PLACA2;SEQ=153;STATUS=OK;RW1=68;RW2=51;CRC=...>`
- Estados da Placa:
  - `online`: resposta recebida em <= 3 segundos.
  - `sem resposta temporária`: 1 ciclo de heartbeat sem resposta (3s a 8s). Os dados permanecem visíveis.
  - `reconectando`: 2 ciclos sem resposta (8s a 20s). Retentativa automática de PING e POLL individual.
  - `offline`: declarado somente após 3 ausências consecutivas (> 20s).
- **Regra Fundamental**: A perda de sinal de uma placa **NUNCA zera nem apaga os cartões nem os gráficos**! O sistema mantém a última leitura válida visível com aviso claro do status.

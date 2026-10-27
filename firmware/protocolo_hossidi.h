#ifndef PROTOCOLO_HOSSIDI_H
#define PROTOCOLO_HOSSIDI_H

#include <Arduino.h>

/*
 * Hossidi Water Monitor - Protocolo de Comunicação SCADA
 * Formato de Mensagens: <TIPO;ORIGEM;CHAVE1=VAL1;...;CRC=XXXX>
 * Exemplo: <DATA;PLACA2;SEQ=152;RW1=68;RW2=51;CRC=AB12>
 * Resposta: <ACK;PLACA2;SEQ=152>
 */

// Cálculo de CRC-16 (Polinômio 0xA001 - Modbus Standard)
inline uint16_t calcularCRC16(const char* str, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint8_t)str[i];
    for (uint8_t j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc;
}

// Converte uint16 para string hexadecimal maiúscula de 4 caracteres
inline void crcParaHex(uint16_t crc, char* outHex) {
  sprintf(outHex, "%04X", crc);
}

// Monta pacote com delimitadores e CRC
inline void empacotarMensagem(const char* payload, char* bufferSaida, size_t bufferSize) {
  uint16_t crc = calcularCRC16(payload, strlen(payload));
  char crcHex[5];
  crcParaHex(crc, crcHex);
  snprintf(bufferSaida, bufferSize, "<%s;CRC=%s>", payload, crcHex);
}

// Monta resposta rápida de ACK
inline void montarACK(const char* idPlaca, uint16_t seq, char* bufferSaida, size_t bufferSize) {
  snprintf(bufferSaida, bufferSize, "<ACK;%s;SEQ=%u>", idPlaca, seq);
}

#endif // PROTOCOLO_HOSSIDI_H

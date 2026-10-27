/**
 * Protocol parser for Hossidev Water Monitor
 * Supports:
 * 1. Secondary boards payload string format: "T3=50;T4=70;P3=0;P4=1;F3=0;F4=0" or "T5=80;T6=30;P5=0;P6=1;F5=0;F6=0"
 * 2. Inter-board frames: <TIPO|ORIGEM|DESTINO|SEQUENCIA|PAYLOAD|CRC>
 */

export function calculateCrc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface ParsedSecondaryPayload {
  tanks: Array<{
    id: number;
    level?: number;
    pump?: number;
    fault?: number;
    sensors?: number[];
    fault_mask?: number[];
  }>;
  boot?: number;
  uptime?: number;
  rawParams: Record<string, string>;
  isValid: boolean;
  error?: string;
}

/**
 * Parses secondary board payloads:
 * e.g. "T3=50;T4=70;P3=0;P4=1;F3=0;F4=0" for node2 (PLACA2)
 * e.g. "T5=80;T6=30;P5=0;P6=1;F5=0;F6=0" for node3 (PLACA3)
 */
export function parseSecondaryPayload(
  payloadInput: string | unknown,
  nodeId: 2 | 3
): ParsedSecondaryPayload {
  const result: ParsedSecondaryPayload = {
    tanks: [],
    rawParams: {},
    isValid: true,
  };

  if (!payloadInput) {
    return result;
  }

  const payloadStr = typeof payloadInput === 'string' ? payloadInput.trim() : String(payloadInput).trim();
  if (!payloadStr) {
    return result;
  }

  const pairs = payloadStr.split(';');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }
    const key = trimmed.substring(0, eqIdx).trim().toUpperCase();
    const val = trimmed.substring(eqIdx + 1).trim();
    result.rawParams[key] = val;
  }

  // Parse BOOT or UPTIME if present in payload
  if (result.rawParams.BOOT !== undefined) {
    const b = parseInt(result.rawParams.BOOT, 10);
    if (!isNaN(b)) result.boot = b;
  }
  if (result.rawParams.UPTIME !== undefined) {
    const u = parseInt(result.rawParams.UPTIME, 10);
    if (!isNaN(u)) result.uptime = u;
  }

  // Node 2 (PLACA2) manages Tanques T3 (RW1) e T4 (RW2)
  if (nodeId === 2) {
    const targets = [3, 4] as const;
    for (const id of targets) {
      const levelKey = `T${id}`;
      const pumpKey = `P${id}`;
      const faultKey = `F${id}`;

      const levelRaw = result.rawParams[levelKey];
      const pumpRaw = result.rawParams[pumpKey];
      const faultRaw = result.rawParams[faultKey];

      if (levelRaw !== undefined || pumpRaw !== undefined || faultRaw !== undefined) {
        let level: number | undefined = undefined;
        let sensors: number[] | undefined = undefined;

        if (levelRaw !== undefined) {
          const parsedLevel = parseFloat(levelRaw);
          if (!isNaN(parsedLevel)) {
            level = Math.min(100, Math.max(0, Math.round(parsedLevel)));
            const activeProbes = Math.min(10, Math.max(0, Math.floor(level / 10)));
            sensors = Array.from({ length: 10 }, (_, i) => (i < activeProbes ? 1 : 0));
          } else {
            result.isValid = false;
            result.error = `Valor de nível não numérico para T${id}: '${levelRaw}'`;
          }
        }

        let pump: number | undefined = undefined;
        if (pumpRaw !== undefined) {
          const p = parseInt(pumpRaw, 10);
          if (!isNaN(p)) pump = p === 1 ? 1 : 0;
        }

        let fault: number | undefined = undefined;
        let fault_mask: number[] | undefined = undefined;
        if (faultRaw !== undefined) {
          const f = parseInt(faultRaw, 10);
          if (!isNaN(f)) {
            fault = f === 1 ? 1 : 0;
            fault_mask = Array.from({ length: 10 }, () => (fault === 1 ? 1 : 0));
          }
        }

        result.tanks.push({
          id,
          level,
          pump,
          fault,
          sensors,
          fault_mask,
        });
      }
    }
  }

  // Node 3 (PLACA3) manages Tanques T5 (WW1) e T6 (WW2)
  if (nodeId === 3) {
    const targets = [5, 6] as const;
    for (const id of targets) {
      const levelKey = `T${id}`;
      const pumpKey = `P${id}`;
      const faultKey = `F${id}`;

      const levelRaw = result.rawParams[levelKey];
      const pumpRaw = result.rawParams[pumpKey];
      const faultRaw = result.rawParams[faultKey];

      if (levelRaw !== undefined || pumpRaw !== undefined || faultRaw !== undefined) {
        let level: number | undefined = undefined;
        let sensors: number[] | undefined = undefined;

        if (levelRaw !== undefined) {
          const parsedLevel = parseFloat(levelRaw);
          if (!isNaN(parsedLevel)) {
            level = Math.min(100, Math.max(0, Math.round(parsedLevel)));
            const activeProbes = Math.min(10, Math.max(0, Math.floor(level / 10)));
            sensors = Array.from({ length: 10 }, (_, i) => (i < activeProbes ? 1 : 0));
          } else {
            result.isValid = false;
            result.error = `Valor de nível não numérico para T${id}: '${levelRaw}'`;
          }
        }

        let pump: number | undefined = undefined;
        if (pumpRaw !== undefined) {
          const p = parseInt(pumpRaw, 10);
          if (!isNaN(p)) pump = p === 1 ? 1 : 0;
        }

        let fault: number | undefined = undefined;
        let fault_mask: number[] | undefined = undefined;
        if (faultRaw !== undefined) {
          const f = parseInt(faultRaw, 10);
          if (!isNaN(f)) {
            fault = f === 1 ? 1 : 0;
            fault_mask = Array.from({ length: 10 }, () => (fault === 1 ? 1 : 0));
          }
        }

        result.tanks.push({
          id,
          level,
          pump,
          fault,
          sensors,
          fault_mask,
        });
      }
    }
  }

  return result;
}

export interface InterBoardFrame {
  type: string;
  source: 'PRINCIPAL' | 'PLACA2' | 'PLACA3' | string;
  destination: 'PRINCIPAL' | 'PLACA2' | 'PLACA3' | string;
  seq?: number;
  payloadStr: string;
  crc?: string;
  isValidCrc: boolean;
  boot?: number;
  uptime?: number;
  params: Record<string, string>;
}

/**
 * Parses inter-board frame format:
 * <TIPO|ORIGEM|DESTINO|SEQUENCIA|PAYLOAD|CRC>
 * e.g. <READY|PLACA2|PRINCIPAL|12|BOOT=12|A1B2>
 * e.g. <DATA|PLACA2|PRINCIPAL|35|T3=50;T4=70;P3=0;P4=1;F3=0;F4=0|C3D1>
 * e.g. <PONG|PLACA3|PRINCIPAL|80|BOOT=4;UPTIME=125|7FA2>
 * e.g. <ACK|PLACA2|PRINCIPAL|101||D8A0>
 * e.g. <NACK|PLACA3|PRINCIPAL|102|CRC_INVALIDO|12B4>
 */
export function parseInterBoardFrame(raw: string): InterBoardFrame | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) return null;

  const inner = trimmed.slice(1, -1);
  const parts = inner.split('|');

  if (parts.length < 5) {
    // Might be semicolon-delimited legacy frame <TYPE;ORIGIN;...>
    return null;
  }

  const type = parts[0].trim().toUpperCase();
  const source = parts[1].trim().toUpperCase();
  const destination = parts[2].trim().toUpperCase();
  const seqStr = parts[3].trim();
  const payloadStr = parts[4] !== undefined ? parts[4].trim() : '';
  const crc = parts[5] !== undefined ? parts[5].trim().toUpperCase() : undefined;

  let seq: number | undefined = undefined;
  if (seqStr) {
    const s = parseInt(seqStr, 10);
    if (!isNaN(s)) seq = s;
  }

  let isValidCrc = true;
  if (crc) {
    const contentBeforeCrc = inner.substring(0, inner.lastIndexOf('|'));
    const calculated = calculateCrc16(contentBeforeCrc);
    isValidCrc = calculated === crc || crc === '0000' || crc === 'FFFF';
  }

  const params: Record<string, string> = {};
  if (payloadStr) {
    const pairs = payloadStr.split(';');
    for (const p of pairs) {
      const eqIdx = p.indexOf('=');
      if (eqIdx !== -1) {
        params[p.substring(0, eqIdx).trim().toUpperCase()] = p.substring(eqIdx + 1).trim();
      } else if (p.trim()) {
        params[p.trim().toUpperCase()] = '1';
      }
    }
  }

  let boot: number | undefined = undefined;
  if (params.BOOT !== undefined) {
    const b = parseInt(params.BOOT, 10);
    if (!isNaN(b)) boot = b;
  }

  let uptime: number | undefined = undefined;
  if (params.UPTIME !== undefined) {
    const u = parseInt(params.UPTIME, 10);
    if (!isNaN(u)) uptime = u;
  }

  return {
    type,
    source,
    destination,
    seq,
    payloadStr,
    crc,
    isValidCrc,
    boot,
    uptime,
    params,
  };
}

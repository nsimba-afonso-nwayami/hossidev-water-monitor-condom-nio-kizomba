import { Router } from 'express';
import crypto from 'crypto';
import { loadDb, saveDb, TelemetryReadingRecord, LogRecord } from '../db';
import { authMiddleware, requireAdmin, AuthRequest } from '../auth';
import { processTankLevelAlert } from '../services/alertEngine';

const router = Router();

function calculateCrc16(str: string): string {
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

function parseHossidiAsciiFrame(rawInput: string) {
  if (typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  const match = trimmed.match(/^<([^>]+)>$/);
  if (!match) return null;

  const content = match[1];

  // 1. Pipe-delimited frame: <TIPO|ORIGEM|DESTINO|SEQUENCIA|PAYLOAD|CRC>
  if (content.includes('|')) {
    const parts = content.split('|');
    if (parts.length >= 5) {
      const type = parts[0].trim().toUpperCase();
      const origin = parts[1].trim().toUpperCase();
      const destination = parts[2].trim().toUpperCase();
      const seq = parts[3].trim();
      const payloadStr = parts[4] !== undefined ? parts[4].trim() : '';
      const crc = parts[5] !== undefined ? parts[5].trim().toUpperCase() : undefined;

      const params: Record<string, string> = {
        SEQ: seq,
        DESTINO: destination,
      };

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

      return {
        type,
        board: origin,
        destination,
        seq: parseInt(seq, 10) || 0,
        crc,
        params,
        isPipeFrame: true,
      };
    }
  }

  // 2. Semicolon-delimited legacy frame: <TIPO;PLACA;K=V;...>
  const parts = content.split(';');
  if (parts.length < 2) return null;
  const type = parts[0].toUpperCase();
  const board = parts[1].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 2; i < parts.length; i++) {
    const eqIdx = parts[i].indexOf('=');
    if (eqIdx !== -1) {
      const k = parts[i].substring(0, eqIdx).toUpperCase();
      const v = parts[i].substring(eqIdx + 1);
      params[k] = v;
    }
  }
  return { type, board, destination: 'PRINCIPAL', seq: 0, params, isPipeFrame: false };
}

// Ingestion endpoint for Arduino / ESP32 Gateway / Web Serial Client Bridge
// POST /api/telemetry/ingest
router.post('/ingest', (req, res) => {
  let payload = req.body;

  if (!payload) {
    return res.status(400).json({ error: 'Payload de telemetria vazio.' });
  }

  // Handle string frame or object with frame/text
  if (typeof payload === 'string' || (typeof payload === 'object' && (payload.frame || payload.raw || payload.text))) {
    const rawStr = typeof payload === 'string' ? payload : (payload.frame || payload.raw || payload.text);
    const parsedFrame = parseHossidiAsciiFrame(rawStr);
    if (parsedFrame) {
      const db = loadDb();
      const now = Date.now();
      const { type, board, params } = parsedFrame;

      let nodeId = 1;
      let nodeKey: 'node1' | 'node2' | 'node3' = 'node1';
      if (board.includes('PLACA2') || board.includes('NODE2') || board.includes('NO2')) {
        nodeId = 2;
        nodeKey = 'node2';
      } else if (board.includes('PLACA3') || board.includes('NODE3') || board.includes('NO3')) {
        nodeId = 3;
        nodeKey = 'node3';
      }

      if (db.nodes[nodeKey]) {
        db.nodes[nodeKey].status = 'online';
        db.nodes[nodeKey].communicationStatus = 'online';
        db.nodes[nodeKey].lastPing = now;
        db.nodes[nodeKey].lastHeartbeatAt = now;
        db.nodes[nodeKey].lastDataAt = now;
        db.nodes[nodeKey].packetCount += 1;
        db.nodes[nodeKey].reconnectAttempts = 0;
        db.nodes[nodeKey].consecutiveMissedHeartbeats = 0;
      }

      if (params.BOOT !== undefined) {
        const b = parseInt(params.BOOT, 10);
        if (!isNaN(b)) {
          db.nodes[nodeKey].bootCounter = b;
        }
      }

      const tanksToUpdate: Array<{ id: number; level: number; pump?: number; fault?: number }> = [];

      if (nodeId === 1) {
        if (params.FW1 !== undefined || params.T1 !== undefined) {
          tanksToUpdate.push({
            id: 1,
            level: Number(params.FW1 ?? params.T1),
            pump: params.P1 !== undefined ? Number(params.P1) : undefined,
            fault: params.F1 !== undefined ? Number(params.F1) : undefined,
          });
        }
        if (params.FW2 !== undefined || params.T2 !== undefined) {
          tanksToUpdate.push({
            id: 2,
            level: Number(params.FW2 ?? params.T2),
            pump: params.P2 !== undefined ? Number(params.P2) : undefined,
            fault: params.F2 !== undefined ? Number(params.F2) : undefined,
          });
        }
      } else if (nodeId === 2) {
        if (params.RW1 !== undefined || params.T3 !== undefined) {
          tanksToUpdate.push({
            id: 3,
            level: Number(params.RW1 ?? params.T3),
            pump: params.P3 !== undefined ? Number(params.P3) : undefined,
            fault: params.F3 !== undefined ? Number(params.F3) : undefined,
          });
        }
        if (params.RW2 !== undefined || params.T4 !== undefined) {
          tanksToUpdate.push({
            id: 4,
            level: Number(params.RW2 ?? params.T4),
            pump: params.P4 !== undefined ? Number(params.P4) : undefined,
            fault: params.F4 !== undefined ? Number(params.F4) : undefined,
          });
        }
      } else if (nodeId === 3) {
        if (params.WW1 !== undefined || params.T5 !== undefined) {
          tanksToUpdate.push({
            id: 5,
            level: Number(params.WW1 ?? params.T5),
            pump: params.P5 !== undefined ? Number(params.P5) : undefined,
            fault: params.F5 !== undefined ? Number(params.F5) : undefined,
          });
        }
        if (params.WW2 !== undefined || params.T6 !== undefined) {
          tanksToUpdate.push({
            id: 6,
            level: Number(params.WW2 ?? params.T6),
            pump: params.P6 !== undefined ? Number(params.P6) : undefined,
            fault: params.F6 !== undefined ? Number(params.F6) : undefined,
          });
        }
      }

      for (const t of tanksToUpdate) {
        const tank = db.currentTanks[t.id];
        if (tank && !isNaN(t.level)) {
          const previousLevel = tank.level;
          const lvl = Math.min(100, Math.max(0, Math.round(t.level)));
          const activeProbes = Math.min(10, Math.max(0, Math.floor(lvl / 10)));
          const sensors = Array.from({ length: 10 }, (_, i) => (i < activeProbes ? 1 : 0));
          tank.level = lvl;
          tank.lastValidLevel = lvl;
          tank.sensors = sensors;
          if (t.pump !== undefined) tank.pump = t.pump;
          if (t.fault !== undefined) tank.fault = t.fault;
          tank.lastUpdated = now;
          tank.lastValidTimestamp = now;
          tank.hasRealData = true;
          tank.isStale = false;
          if (tank.capacityLiters) {
            tank.lastValidLiters = Math.round((lvl / 100) * tank.capacityLiters);
          }

          // Evaluate low water level alert (transition <= 30% / rearm >= 35%)
          processTankLevelAlert(tank, previousLevel, lvl, db).catch((err) => {
            console.error('[AlertEngine] Error evaluating frame alert:', err);
          });
        }
      }

      saveDb();
      return res.status(200).json({
        success: true,
        type: 'frame_scada',
        ack: `<ACK;${board};SEQ=${params.SEQ || 0}>`,
        updatedTanks: tanksToUpdate.length,
      });
    }
  }

  const db = loadDb();
  const now = Date.now();
  const isoTime = new Date().toISOString();
  const timeStr = new Date().toLocaleTimeString();

  // Support Unified Arduino Master Gateway JSON:
  // e.g. { device: "kizomba", uptime: 120, node1: { status: "online", tanks: [...] }, node2: { ... }, node3: { ... } }
  // OR Single Node: { node: 1, tanks: [...] }
  // OR Flat Array: { tanks: [...] }
  // OR Single Tank: { id: 1, level: 75, sensors: [...] }

  const incomingTanks: Array<{
    id: number;
    level?: number;
    pump?: number;
    alarm?: boolean | number;
    alarm_muted?: boolean | number;
    sensors?: number[];
    fault?: number;
    fault_mask?: number[];
    nodeId?: number;
  }> = [];

  // 1. Check for node1, node2, node3 in payload
  for (const nodeKey of ['node1', 'node2', 'node3'] as const) {
    const nodeData = payload[nodeKey];
    if (nodeData && typeof nodeData === 'object') {
      const nId = nodeKey === 'node1' ? 1 : nodeKey === 'node2' ? 2 : 3;
      if (db.nodes[nodeKey]) {
        const isOnline = nodeData.status === 'online' || Array.isArray(nodeData.tanks);
        db.nodes[nodeKey].status = isOnline ? 'online' : 'offline';
        db.nodes[nodeKey].communicationStatus = isOnline ? 'online' : 'sem resposta temporária';
        db.nodes[nodeKey].lastPing = now;
        db.nodes[nodeKey].lastHeartbeatAt = now;
        db.nodes[nodeKey].lastDataAt = now;
        db.nodes[nodeKey].packetCount += 1;
        db.nodes[nodeKey].reconnectAttempts = 0;
        db.nodes[nodeKey].consecutiveMissedHeartbeats = 0;
      }
      if (Array.isArray(nodeData.tanks)) {
        for (const t of nodeData.tanks) {
          incomingTanks.push({ ...t, nodeId: nId });
        }
      }
    }
  }

  // 2. Check for direct tanks array or node property
  if (Array.isArray(payload.tanks)) {
    const defaultNodeId = Number(payload.node || payload.nodeId || 1);
    const nodeKey = `node${defaultNodeId}` as 'node1' | 'node2' | 'node3';
    if (db.nodes[nodeKey]) {
      db.nodes[nodeKey].status = 'online';
      db.nodes[nodeKey].communicationStatus = 'online';
      db.nodes[nodeKey].lastPing = now;
      db.nodes[nodeKey].lastHeartbeatAt = now;
      db.nodes[nodeKey].lastDataAt = now;
      db.nodes[nodeKey].packetCount += 1;
      db.nodes[nodeKey].reconnectAttempts = 0;
      db.nodes[nodeKey].consecutiveMissedHeartbeats = 0;
    }
    for (const t of payload.tanks) {
      incomingTanks.push({ ...t, nodeId: t.nodeId || defaultNodeId });
    }
  } else if (payload.id && (payload.level !== undefined || payload.sensors !== undefined)) {
    const defaultNodeId = Number(payload.node || payload.nodeId || 1);
    incomingTanks.push({ ...payload, nodeId: defaultNodeId });
  }

  let updatedCount = 0;

  for (const t of incomingTanks) {
    const tankId = Number(t.id);
    if (!db.currentTanks[tankId]) continue;

    const tank = db.currentTanks[tankId];
    const nId = t.nodeId || tank.nodeId || 1;

    // Compute actual 10-probe sensor array if passed, or synthesize from level
    let sensors = Array.isArray(t.sensors) && t.sensors.length === 10 ? t.sensors.map((v) => (v ? 1 : 0)) : null;
    let level = typeof t.level === 'number' && !isNaN(t.level) ? Math.min(100, Math.max(0, Math.round(t.level))) : null;

    if (sensors && level === null) {
      const activeCount = sensors.filter((s) => s === 1).length;
      level = activeCount * 10;
    } else if (level !== null && !sensors) {
      const activeProbes = Math.min(10, Math.max(0, Math.floor(level / 10)));
      sensors = Array.from({ length: 10 }, (_, i) => (i < activeProbes ? 1 : 0));
    } else if (!sensors && level === null) {
      continue;
    }

    const fault_mask = Array.isArray(t.fault_mask) && t.fault_mask.length === 10
      ? t.fault_mask
      : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    if (sensors) {
      for (let i = 0; i < 9; i++) {
        if (sensors[i] === 0 && sensors[i + 1] === 1) {
          fault_mask[i] = 1;
        }
      }
    }

    const hasFault = fault_mask.some((f) => f === 1) || Number(t.fault || 0) === 1 ? 1 : 0;
    const pumpState = Number(t.pump || 0) === 1 ? 1 : 0;
    const previousLevel = tank.level;

    tank.level = level!;
    tank.lastValidLevel = level!;
    tank.pump = pumpState;
    if (t.alarm !== undefined) {
      tank.alarm = typeof t.alarm === 'boolean' ? (t.alarm ? 1 : 0) : Number(t.alarm);
    }
    if (t.alarm_muted !== undefined) {
      tank.alarm_muted = typeof t.alarm_muted === 'boolean' ? (t.alarm_muted ? 1 : 0) : Number(t.alarm_muted);
    }
    tank.sensors = sensors!;
    tank.fault = hasFault;
    tank.fault_mask = fault_mask;
    tank.lastUpdated = now;
    tank.lastValidTimestamp = now;
    tank.hasRealData = true;
    tank.isStale = false;
    if (tank.capacityLiters) {
      tank.lastValidLiters = Math.round((level! / 100) * tank.capacityLiters);
    }

    // Evaluate low water level alert (transition <= 30% / rearm >= 35%)
    processTankLevelAlert(tank, previousLevel, level!, db).catch((err) => {
      console.error('[AlertEngine] Error evaluating json alert:', err);
    });

    // Record in historical telemetry database
    const historyEntry: TelemetryReadingRecord = {
      id: crypto.randomUUID(),
      timestamp: now,
      isoTime,
      nodeId: nId,
      tankId,
      level: level!,
      pump: pumpState,
      alarm: tank.alarm,
      alarm_muted: tank.alarm_muted,
      sensors: sensors!,
      fault: hasFault,
      fault_mask,
      source: payload.source || 'serial_bridge',
    };

    db.telemetryHistory.push(historyEntry);

    if (db.telemetryHistory.length > 10000) {
      db.telemetryHistory.splice(0, db.telemetryHistory.length - 10000);
    }

    updatedCount++;
  }

  // Add Log Entry
  const primaryNodeId = Number(payload.node || payload.nodeId || 1);
  const logItem: LogRecord = {
    id: crypto.randomUUID(),
    time: timeStr,
    type: 'rx',
    nodeId: primaryNodeId,
    text: `RX Arduino: ${updatedCount} reservatório(s) sincronizado(s).`,
    rawJson: JSON.stringify(payload),
  };

  db.logs.push(logItem);
  if (db.logs.length > 300) {
    db.logs.splice(0, db.logs.length - 300);
  }

  saveDb();

  res.status(200).json({
    success: true,
    message: 'Telemetria do Arduino processada e persistida com sucesso.',
    updatedTanks: updatedCount,
    timestamp: now,
  });
});

// GET /api/telemetry/current
// Returns current state filtered by user permissions
router.get('/current', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  const now = Date.now();

  // Check Watchdog and progressive communication status on each node independently
  const nodes = { ...db.nodes };
  for (const k of ['node1', 'node2', 'node3'] as const) {
    const node = nodes[k];
    if (!node.lastPing) {
      node.status = 'offline';
      node.communicationStatus = 'desconhecido';
    } else {
      const elapsed = now - node.lastPing;
      if (elapsed <= 4000) {
        node.status = 'online';
        node.communicationStatus = 'online';
        node.consecutiveMissedHeartbeats = 0;
        node.reconnectAttempts = 0;
      } else if (elapsed <= 10000) {
        node.status = 'online';
        node.communicationStatus = 'sem resposta temporária';
        node.consecutiveMissedHeartbeats = 1;
      } else if (elapsed <= 25000) {
        node.status = 'offline';
        node.communicationStatus = 'reconectando';
        node.consecutiveMissedHeartbeats = 2;
        node.reconnectAttempts = Math.min(5, (node.reconnectAttempts || 0) + 1);
      } else {
        node.status = 'offline';
        node.communicationStatus = 'offline';
        node.consecutiveMissedHeartbeats = 3;
      }
    }
  }

  // Filter tanks based on user permissions
  const permittedTanks: Record<number, any> = {};
  let totalCapacityLiters = 0;
  let currentTotalLiters = 0;
  let activePumps = 0;
  let totalFaultySensors = 0;
  let hasAnyRealData = false;
  let latestUpdateTimestamp: number | null = null;

  for (const idStr of Object.keys(db.currentTanks)) {
    const tankId = Number(idStr);
    const tank = db.currentTanks[tankId];

    // Check permission (default to all 6 tanks if not explicitly set)
    const userPermittedIds = Array.isArray(user.permittedTankIds) ? user.permittedTankIds : [1, 2, 3, 4, 5, 6];
    if (user.role !== 'admin' && !userPermittedIds.includes(tankId)) {
      continue;
    }

    const nodeKey = `node${tank.nodeId}` as 'node1' | 'node2' | 'node3';
    const nodeObj = nodes[nodeKey];
    const isNodeOnline = nodeObj && nodeObj.status === 'online';
    const boardCommStatus = nodeObj?.communicationStatus || (isNodeOnline ? 'online' : 'offline');
    const boardName = tank.nodeId === 1 ? 'Placa 1 (Principal)' : tank.nodeId === 2 ? 'Placa 2' : 'Placa 3';

    // RETAIN LAST VALID DATA: Never wipe out or clear the tank when communication is lost!
    const effectiveLevel = tank.level !== null ? tank.level : (tank.lastValidLevel ?? null);
    const hasData = effectiveLevel !== null;
    const isStale = !isNodeOnline;

    const tankCap = typeof tank.capacityLiters === 'number' ? tank.capacityLiters : null;
    const computedLiters = hasData && tankCap !== null
      ? Math.round((effectiveLevel! / 100) * tankCap)
      : null;

    let effectiveSensors = tank.sensors;
    if ((!effectiveSensors || effectiveSensors.length !== 10) && effectiveLevel !== null) {
      const activeProbes = Math.min(10, Math.max(0, Math.floor(effectiveLevel / 10)));
      effectiveSensors = Array.from({ length: 10 }, (_, i) => (i < activeProbes ? 1 : 0));
    } else if (!effectiveSensors) {
      effectiveSensors = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    let reconnectStatusMsg = '';
    if (boardCommStatus === 'reconectando') {
      reconnectStatusMsg = `Reconexão: em andamento (tentativa ${nodeObj?.reconnectAttempts || 1}/5)`;
    } else if (boardCommStatus === 'sem resposta temporária') {
      reconnectStatusMsg = 'Aguardando próximo ciclo de resposta...';
    } else if (boardCommStatus === 'offline') {
      reconnectStatusMsg = 'Sem comunicação. Tentando restabelecer link serial...';
    }

    const effectiveTank = {
      ...tank,
      level: effectiveLevel,
      lastValidLevel: effectiveLevel,
      currentLiters: computedLiters,
      lastValidLiters: computedLiters,
      capacityLiters: tankCap,
      capacity_value: tank.capacity_value ?? tankCap,
      capacity_unit: tank.capacity_unit || 'L',
      sensors: effectiveSensors,
      fault_mask: tank.fault_mask || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hasRealData: hasData,
      isStale,
      boardStatus: boardCommStatus,
      boardName,
      reconnectStatus: reconnectStatusMsg,
      lastValidTimestamp: tank.lastUpdated || tank.lastValidTimestamp || null,
    };

    permittedTanks[tankId] = effectiveTank;

    if (tankCap !== null) {
      totalCapacityLiters += tankCap;
    }

    if (hasData) {
      hasAnyRealData = true;
      if (computedLiters !== null) {
        currentTotalLiters += computedLiters;
      }
      if (effectiveTank.pump === 1 && !isStale) activePumps++;
      totalFaultySensors += effectiveTank.fault_mask.filter((f: number) => f === 1).length;

      if (!latestUpdateTimestamp || (effectiveTank.lastUpdated && effectiveTank.lastUpdated > latestUpdateTimestamp)) {
        latestUpdateTimestamp = effectiveTank.lastUpdated;
      }
    }
  }

  const isAnyNodeOnline = Object.values(nodes).some((n) => n.status === 'online');

  // Calculate percentage: if volumetric capacity is defined for any tank, use volume ratio;
  // otherwise, average the percentage levels of active tanks
  let totalPercentage = 0;
  if (totalCapacityLiters > 0) {
    totalPercentage = (currentTotalLiters / totalCapacityLiters) * 100;
  } else {
    const activeTanksList = Object.values(permittedTanks).filter((t: any) => t.hasRealData && t.level !== null);
    if (activeTanksList.length > 0) {
      const sumPct = activeTanksList.reduce((acc: number, t: any) => acc + (t.level || 0), 0);
      totalPercentage = sumPct / activeTanksList.length;
    }
  }

  const boardStatuses = {
    placaPrincipal: {
      status: nodes.node1.communicationStatus || 'offline',
      lastDataAt: nodes.node1.lastDataAt || nodes.node1.lastPing || null,
      lastHeartbeatAt: nodes.node1.lastHeartbeatAt || nodes.node1.lastPing || null,
      lastError: nodes.node1.lastError || null,
      reconnectAttempts: nodes.node1.reconnectAttempts || 0,
    },
    placa2: {
      status: nodes.node2.communicationStatus || 'offline',
      lastDataAt: nodes.node2.lastDataAt || nodes.node2.lastPing || null,
      lastHeartbeatAt: nodes.node2.lastHeartbeatAt || nodes.node2.lastPing || null,
      lastError: nodes.node2.lastError || null,
      reconnectAttempts: nodes.node2.reconnectAttempts || 0,
    },
    placa3: {
      status: nodes.node3.communicationStatus || 'offline',
      lastDataAt: nodes.node3.lastDataAt || nodes.node3.lastPing || null,
      lastHeartbeatAt: nodes.node3.lastHeartbeatAt || nodes.node3.lastPing || null,
      lastError: nodes.node3.lastError || null,
      reconnectAttempts: nodes.node3.reconnectAttempts || 0,
    },
  };

  res.json({
    hasRealData: hasAnyRealData,
    isOnline: isAnyNodeOnline,
    lastCommunication: latestUpdateTimestamp ? new Date(latestUpdateTimestamp).toLocaleTimeString() : null,
    lastCommunicationTimestamp: latestUpdateTimestamp,
    tanks: permittedTanks,
    nodes,
    boardStatuses,
    systemConfig: db.systemConfig,
    metrics: {
      totalCapacityLiters,
      currentTotalLiters,
      totalPercentage: Math.round(totalPercentage * 10) / 10,
      activePumps,
      totalFaultySensors,
      estimatedAutonomyHours: currentTotalLiters > 0 ? currentTotalLiters / 850 : 0,
      dailyConsumptionEstimateLiters: currentTotalLiters > 0 ? 18500 : 0,
    },
  });
});

// GET /api/telemetry/history
// Returns real history filtered by tank, period, and user permissions
router.get('/history', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();

  const tankIdParam = req.query.tankId ? Number(req.query.tankId) : null;
  const periodParam = (req.query.period as string) || '24h'; // '1h' | '6h' | '24h' | '7d' | 'all'

  const now = Date.now();
  let timeThreshold = 0;
  if (periodParam === '1h') timeThreshold = now - 1 * 60 * 60 * 1000;
  else if (periodParam === '6h') timeThreshold = now - 6 * 60 * 60 * 1000;
  else if (periodParam === '24h') timeThreshold = now - 24 * 60 * 60 * 1000;
  else if (periodParam === '7d') timeThreshold = now - 7 * 24 * 60 * 60 * 1000;

  let records = db.telemetryHistory.filter((r) => r.timestamp >= timeThreshold);

  // Filter by user's permitted tanks
  if (user.role !== 'admin') {
    records = records.filter((r) => user.permittedTankIds.includes(r.tankId));
  }

  // Filter by specific tank if requested
  if (tankIdParam) {
    if (user.role !== 'admin' && !user.permittedTankIds.includes(tankIdParam)) {
      return res.status(403).json({ error: 'Acesso não permitido a este reservatório.' });
    }
    records = records.filter((r) => r.tankId === tankIdParam);
  }

  // Optimize payload size and charting performance for large history datasets
  let finalRecords = records;
  const maxPoints = 500;
  if (records.length > maxPoints) {
    const step = (records.length - 1) / (maxPoints - 1);
    const sampled: typeof records = [];
    for (let i = 0; i < maxPoints; i++) {
      const idx = Math.min(records.length - 1, Math.round(i * step));
      sampled.push(records[idx]);
    }
    finalRecords = sampled;
  }

  res.json({
    totalRecords: records.length,
    returnedRecords: finalRecords.length,
    period: periodParam,
    tankId: tankIdParam,
    records: finalRecords,
  });
});

// POST /api/telemetry/command
// Sends command to Arduino
router.post('/command', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const { command, tankId, tank, action, nodeId, value } = req.body;
  const targetTankId = Number(tankId || tank);

  if (!command) {
    return res.status(400).json({ error: 'Comando não especificado.' });
  }

  // Handle Dedicated Siren / Alarm Control Command
  if (command === 'SET_ALARM') {
    if (!targetTankId || isNaN(targetTankId) || targetTankId < 1 || targetTankId > 6) {
      return res.status(400).json({
        type: 'ALARM_COMMAND_RESULT',
        tank: targetTankId || 0,
        action: action || 'UNKNOWN',
        ok: false,
        error: 'Identificador de tanque inválido (deve ser entre 1 e 6).',
      });
    }

    if (action !== 'ON' && action !== 'OFF') {
      return res.status(400).json({
        type: 'ALARM_COMMAND_RESULT',
        tank: targetTankId,
        action: action || 'UNKNOWN',
        ok: false,
        error: 'Ação de sirene inválida (deve ser "ON" ou "OFF").',
      });
    }

    // Permission check
    if (user.role !== 'admin' && !user.permittedTankIds.includes(targetTankId)) {
      return res.status(403).json({
        type: 'ALARM_COMMAND_RESULT',
        tank: targetTankId,
        action,
        ok: false,
        error: 'Permissão negada para comandar a sirene deste reservatório.',
      });
    }

    const db = loadDb();
    const timeStr = new Date().toLocaleTimeString();
    const currentTank = db.currentTanks[targetTankId];

    if (currentTank) {
      if (action === 'ON') {
        currentTank.alarm = 1;
        currentTank.alarm_muted = 0;
      } else {
        currentTank.alarm = 0;
        currentTank.alarm_muted = 1;
      }
      currentTank.lastUpdated = Date.now();
    }

    const isLocalNode = targetTankId <= 2;
    const reason = isLocalNode ? 'APPLIED' : 'SENT_TO_SLAVE';

    const logEntry: LogRecord = {
      id: crypto.randomUUID(),
      time: timeStr,
      type: 'tx',
      nodeId: targetTankId <= 2 ? 1 : targetTankId <= 4 ? 2 : 3,
      text: `TX [Operador: ${user.username}]: Comando SET_ALARM (Tanque #${targetTankId}, Ação: ${action}) enviado -> ${reason}.`,
      rawJson: JSON.stringify({ command: 'SET_ALARM', tank: targetTankId, action, reason, user: user.username }),
    };

    db.logs.push(logEntry);
    if (db.logs.length > 300) db.logs.splice(0, db.logs.length - 300);
    saveDb();

    return res.json({
      success: true,
      type: 'ALARM_COMMAND_RESULT',
      tank: targetTankId,
      action,
      ok: true,
      reason,
      message: isLocalNode
        ? `Sirene do Tanque #${targetTankId} ${action === 'ON' ? 'ativada' : 'desativada'} localmente.`
        : `Comando SET_ALARM ${action} encaminhado para a Placa ${targetTankId <= 4 ? 2 : 3}.`,
      timestamp: Date.now(),
    });
  }

  // Check tank permission if tankId is specified
  if (targetTankId && user.role !== 'admin' && !user.permittedTankIds.includes(targetTankId)) {
    return res.status(403).json({ error: 'Permissão negada para comandar este reservatório.' });
  }

  const db = loadDb();
  const timeStr = new Date().toLocaleTimeString();

  const logEntry: LogRecord = {
    id: crypto.randomUUID(),
    time: timeStr,
    type: 'tx',
    nodeId: nodeId ? Number(nodeId) : undefined,
    text: `TX [Operador: ${user.username}]: Comando "${command}" enviado ao barramento.`,
    rawJson: JSON.stringify({ command, tankId: targetTankId || undefined, nodeId, value, user: user.username }),
  };

  db.logs.push(logEntry);
  if (db.logs.length > 300) db.logs.splice(0, db.logs.length - 300);

  saveDb();

  res.json({
    success: true,
    message: `Comando "${command}" registrado e enfileirado para o Arduino.`,
    timestamp: Date.now(),
  });
});

// POST /api/telemetry/simulate
// Allows direct manual test/calibration of tank levels and sensor probes
router.post('/simulate', authMiddleware, (req: AuthRequest, res) => {
  const { tankId, level, pump, fault_mask } = req.body;
  if (!tankId) {
    return res.status(400).json({ error: 'tankId obrigatório.' });
  }

  const db = loadDb();
  const id = Number(tankId);
  const tank = db.currentTanks[id];

  if (!tank) {
    return res.status(404).json({ error: 'Reservatório não encontrado.' });
  }

  if (typeof level === 'number') {
    tank.level = Math.min(100, Math.max(0, Math.round(level)));
    const activeProbes = Math.min(10, Math.max(0, Math.floor(tank.level / 10)));
    tank.sensors = Array.from({ length: 10 }, (_, i) => (i < activeProbes ? 1 : 0));
  }

  if (typeof pump === 'number') {
    tank.pump = pump === 1 ? 1 : 0;
  }

  if (Array.isArray(fault_mask) && fault_mask.length === 10) {
    tank.fault_mask = fault_mask;
    tank.fault = fault_mask.some((f: number) => f === 1) ? 1 : 0;
  }

  tank.lastUpdated = Date.now();
  tank.hasRealData = true;

  saveDb();

  res.json({
    success: true,
    message: `Reservatório ${id} ajustado com sucesso.`,
    tank,
  });
});

// GET /api/telemetry/logs
router.get('/logs', authMiddleware, (_req, res) => {
  const db = loadDb();
  res.json({ logs: db.logs });
});

// DELETE /api/telemetry/logs
router.delete('/logs', authMiddleware, requireAdmin, (_req, res) => {
  const db = loadDb();
  db.logs = [
    {
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      type: 'system',
      text: 'Buffer de logs seriais limpo pelo administrador.',
    },
  ];
  saveDb();
  res.json({ success: true, message: 'Logs limpos com sucesso.' });
});

export default router;

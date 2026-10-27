import { Router } from 'express';
import crypto from 'crypto';
import { loadDb, saveDb, TelemetryReadingRecord, LogRecord } from '../db';
import { authMiddleware, AuthRequest } from '../auth';
import { processTankLevelAlert } from '../services/alertEngine';
import { sendEmailNotification, formatLowLevelEmail, maskEmailServer } from '../services/notificationService';
import { EmailNotification, TankAlert } from '../../src/types';

const router = Router();

// POST /api/sync/pull
// Returns server state for local IndexedDB synchronization
router.post('/pull', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  const now = Date.now();

  const permittedIds = user.role === 'admin'
    ? [1, 2, 3, 4, 5, 6]
    : (Array.isArray(user.permittedTankIds) && user.permittedTankIds.length > 0 ? user.permittedTankIds : [1, 2, 3, 4, 5, 6]);

  const filteredTanks: Record<number, any> = {};
  for (const [idStr, tank] of Object.entries(db.currentTanks)) {
    const id = Number(idStr);
    if (user.role === 'admin' || permittedIds.includes(id)) {
      filteredTanks[id] = { ...tank };
    }
  }

  // Last 100 telemetry records for permitted tanks
  const recentTelemetry = db.telemetryHistory
    .filter((r) => permittedIds.includes(r.tankId))
    .slice(-100);

  res.json({
    success: true,
    serverTimestamp: now,
    isoTime: new Date(now).toISOString(),
    tanks: filteredTanks,
    nodes: db.nodes,
    recentTelemetry,
    systemConfig: db.systemConfig,
    alerts: (db.tankAlerts || []).slice(0, 50),
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      permittedTankIds: user.permittedTankIds,
    },
  });
});

// POST /api/sync/push
// Receives batched pending operations from offline client, processes idempotently
router.post('/push', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const { operations } = req.body;

  if (!Array.isArray(operations)) {
    return res.status(400).json({ error: 'Formato inválido. "operations" deve ser um array.' });
  }

  const db = loadDb();
  const now = Date.now();
  const processedIds: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const op of operations) {
    try {
      if (!op || !op.id || !op.tipoOperacao) {
        continue;
      }

      // 1. Ingest Telemetry
      if (op.tipoOperacao === 'ingest_telemetry') {
        const p = op.dados;
        if (p) {
          const tankId = Number(p.tankId || p.id);
          if (db.currentTanks[tankId]) {
            const tank = db.currentTanks[tankId];
            const previousLevel = tank.level;
            if (typeof p.level === 'number') {
              tank.level = Math.min(100, Math.max(0, Math.round(p.level)));
            }
            if (Array.isArray(p.sensors) && p.sensors.length === 10) {
              tank.sensors = p.sensors;
            }
            if (Array.isArray(p.fault_mask) && p.fault_mask.length === 10) {
              tank.fault_mask = p.fault_mask;
              tank.fault = p.fault_mask.some((f: number) => f === 1) ? 1 : 0;
            }
            if (p.pump !== undefined) {
              tank.pump = p.pump === 1 ? 1 : 0;
            }
            tank.lastUpdated = p.timestamp || now;
            tank.hasRealData = true;

            // Trigger low level alert engine if level is valid
            if (tank.level !== null) {
              processTankLevelAlert(tank, previousLevel, tank.level, db).catch((err) => {
                console.error('[Sync] Erro no processamento de alerta ao sincronizar telemetria:', err);
              });
            }

            // Check if reading with op.id is already in telemetryHistory
            const alreadyRecorded = db.telemetryHistory.some((th) => th.id === op.id);
            if (!alreadyRecorded && tank.level !== null) {
              const cap = tank.capacityLiters || 20000;
              const currentLiters = Math.round((tank.level / 100) * cap);
              const reading: TelemetryReadingRecord = {
                id: op.id,
                tankId,
                nodeId: tank.nodeId,
                level: tank.level,
                pump: tank.pump,
                fault: tank.fault,
                sensors: tank.sensors,
                fault_mask: tank.fault_mask,
                timestamp: p.timestamp || now,
                isoTime: new Date(p.timestamp || now).toISOString(),
                source: (p.source || 'serial_bridge') as TelemetryReadingRecord['source'],
              };
              db.telemetryHistory.push(reading);
              if (db.telemetryHistory.length > 3000) {
                db.telemetryHistory.shift();
              }
            }
          }
        }
      }
      // 2. Hardware Pump Command
      else if (op.tipoOperacao === 'pump_command') {
        const { tankId, value } = op.dados || {};
        const tId = Number(tankId);
        const permittedIds = user.role === 'admin'
          ? [1, 2, 3, 4, 5, 6]
          : (Array.isArray(user.permittedTankIds) && user.permittedTankIds.length > 0 ? user.permittedTankIds : [1, 2, 3, 4, 5, 6]);

        if (!permittedIds.includes(tId)) {
          errors.push({ id: op.id, error: `Permissão negada: usuário ${user.username} não tem acesso ao reservatório T${tId}.` });
          continue;
        }

        if (db.currentTanks[tId]) {
          db.currentTanks[tId].pump = value === 1 ? 1 : 0;
          db.currentTanks[tId].lastUpdated = now;

          const alreadyLogged = db.logs.some((l) => l.id === op.id);
          if (!alreadyLogged) {
            db.logs.push({
              id: op.id,
              time: new Date(now).toLocaleTimeString(),
              type: 'tx',
              text: `[SINCRONIZAÇÃO OFFLINE] Comando de bomba T${tId} (${value === 1 ? 'LIGAR' : 'DESLIGAR'}) sincronizado por ${user.username}.`,
            });
          }
        }
      }
      // 3. Emergency Stop Lockout
      else if (op.tipoOperacao === 'emergency_stop') {
        const { lockout } = op.dados || {};
        const isLockout = lockout === true || lockout === 1;
        db.systemConfig.emergencyLockout = isLockout;
        if (isLockout) {
          for (const t of Object.values(db.currentTanks)) {
            t.pump = 0;
          }
        }

        const alreadyLogged = db.logs.some((l) => l.id === op.id);
        if (!alreadyLogged) {
          db.logs.push({
            id: op.id,
            time: new Date(now).toLocaleTimeString(),
            type: 'tx',
            text: `[SINCRONIZAÇÃO OFFLINE] Estado de Desarme de Emergência (${isLockout ? 'ATIVADO' : 'RESETADO'}) sincronizado por ${user.username}.`,
          });
        }
      }
      // 4. Update Tank Config
      else if (op.tipoOperacao === 'update_tank_config') {
        if (user.role === 'admin') {
          const { tankId, name, capacityLiters, capacity_unit, sector } = op.dados || {};
          const tId = Number(tankId);
          if (db.currentTanks[tId]) {
            if (name) db.currentTanks[tId].name = name;
            if (typeof capacityLiters === 'number') db.currentTanks[tId].capacityLiters = capacityLiters;
            if (capacity_unit) db.currentTanks[tId].capacity_unit = capacity_unit;
            if (sector) db.currentTanks[tId].sector = sector;
            db.currentTanks[tId].lastUpdated = now;
          }
        } else {
          errors.push({ id: op.id, error: 'Apenas administradores podem atualizar configurações de tanques.' });
          continue;
        }
      }
      // 5. Generic Event Log
      else if (op.tipoOperacao === 'log_event') {
        const { text, type } = op.dados || {};
        const alreadyLogged = db.logs.some((l) => l.id === op.id);
        if (!alreadyLogged) {
          db.logs.push({
            id: op.id,
            time: new Date(now).toLocaleTimeString(),
            type: type || 'system',
            text: `[OFFLINE] ${text}`,
          });
        }
      }
      // 6. Sync Alert Acknowledgment from Offline
      else if (op.tipoOperacao === 'acknowledge_alert') {
        const { alertId, username } = op.dados || {};
        if (!db.tankAlerts) db.tankAlerts = [];
        const alert = db.tankAlerts.find((a) => a.id === alertId);
        if (alert) {
          alert.status = 'acknowledged';
          alert.acknowledgedAt = new Date().toISOString();
          alert.acknowledgedBy = username || user.username;
          alert.updatedAt = new Date().toISOString();
        }
      }
      // 7. Sync Offline-Generated Low Level Alert & Dispatch Email Idempotently
      else if (op.tipoOperacao === 'offline_alert') {
        const { alert, recipient, idempotencyKey } = op.dados || {};
        if (alert && alert.id) {
          if (!db.tankAlerts) db.tankAlerts = [];
          if (!db.emailNotifications) db.emailNotifications = [];

          const existingAlert = db.tankAlerts.find((a) => a.id === alert.id);
          if (!existingAlert) {
            db.tankAlerts.unshift(alert);
            if (db.tankAlerts.length > 500) db.tankAlerts.splice(500);
          }

          // Idempotency check: EMAIL:{alertId}:{recipientId}
          const emailIdempotency = idempotencyKey || `EMAIL:${alert.id}:${recipient?.id || 'default'}`;
          const alreadyDispatched = db.emailNotifications.some(
            (e) => e.idempotencyKey === emailIdempotency || (e.alertId === alert.id && e.status === 'sent')
          );

          if (!alreadyDispatched && recipient?.email) {
            const nowIso = new Date().toISOString();
            const activeUserConfig = (db.userEmailConfigs || []).find((c) => c.enabled);
            const senderUserId = activeUserConfig ? activeUserConfig.userId : 'system';
            const senderEmail = activeUserConfig?.mailFrom || process.env.MAIL_FROM || 'etakizomba@gmail.com';

            const emailContent = formatLowLevelEmail({
              tankName: alert.tankName,
              tankId: alert.tankId,
              level: alert.levelAtTrigger,
              threshold: alert.thresholdPercent || 30,
              pumpState: 'Desligada',
              boardName: alert.sourceBoard || 'PRINCIPAL',
              lastReadingTime: new Date(alert.triggeredAt || nowIso).toLocaleString('pt-BR'),
              alertTime: new Date(alert.triggeredAt || nowIso).toLocaleString('pt-BR'),
              senderEmail,
            });

            const emailRecord: EmailNotification = {
              id: crypto.randomUUID(),
              alertId: alert.id,
              senderUserId,
              recipientId: recipient.id,
              senderEmailMasked: maskEmailServer(senderEmail),
              recipientEmailMasked: maskEmailServer(recipient.email),
              subject: emailContent.subject,
              providerMessageId: null,
              status: 'pending',
              errorCode: null,
              errorMessage: null,
              retryCount: 0,
              createdAt: nowIso,
              sentAt: null,
              deliveredAt: null,
              updatedAt: nowIso,

              idempotencyKey: emailIdempotency,
              tankId: alert.tankId,
              recipientName: recipient.name || 'Destinatário',
              senderEmail,
              emailMasked: maskEmailServer(recipient.email),
              provider: null,
              bodyPreview: emailContent.text.slice(0, 160),
              queuedAt: nowIso,
              failedAt: null,
            };

            db.emailNotifications.unshift(emailRecord);

            // Execute dispatch
            sendEmailNotification({
              to: recipient.email,
              subject: emailContent.subject,
              text: emailContent.text,
              html: emailContent.html,
              alertId: alert.id,
              recipientId: recipient.id,
              tankName: alert.tankName,
              senderUserId,
              userConfig: activeUserConfig || null,
            })
              .then((res) => {
                emailRecord.provider = res.provider;
                emailRecord.providerMessageId = res.providerMessageId;
                emailRecord.status = res.status;
                if (res.status === 'sent') emailRecord.sentAt = new Date().toISOString();
                if (res.error) emailRecord.errorMessage = res.error;

                const parentAlert = db.tankAlerts.find((a) => a.id === alert.id);
                if (parentAlert) {
                  parentAlert.emailNotificationStatus = res.status;
                  parentAlert.updatedAt = new Date().toISOString();
                }
                saveDb();
              })
              .catch((err) => {
                emailRecord.status = 'failed';
                emailRecord.errorMessage = err.message || String(err);
                const parentAlert = db.tankAlerts.find((a) => a.id === alert.id);
                if (parentAlert) {
                  parentAlert.emailNotificationStatus = 'failed';
                  parentAlert.updatedAt = new Date().toISOString();
                }
                saveDb();
              });
          }
        }
      }

      processedIds.push(op.id);
    } catch (err: any) {
      errors.push({ id: op.id, error: err.message || String(err) });
    }
  }

  saveDb();

  res.json({
    success: true,
    processedIds,
    errors,
    serverTimestamp: now,
  });
});

export default router;

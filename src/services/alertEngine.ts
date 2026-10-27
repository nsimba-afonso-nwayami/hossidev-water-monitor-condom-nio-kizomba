/**
 * Hossidev Water Monitor - Client-Side Offline-First Alert Engine
 * Evaluates tank levels in real time on incoming serial packets or local telemetry.
 * 1. Checks transition (> 30% -> <= 30%).
 * 2. Prevents duplicate alerts/popups while level <= 30%.
 * 3. Rearms when level recovers to >= 35%.
 * 4. Persists in IndexedDB (localDb) and triggers sound & pop-up.
 */

import { TankData, TankAlert, TankAlertState, EmailNotification } from '../types';
import { dbService, localDb } from '../db/localDb';
import { syncService } from './syncService';

// Cache of in-memory alert states per tank for microsecond lookups
const clientAlertStates = new Map<string, TankAlertState>();

export async function initClientAlertStates(): Promise<void> {
  try {
    const states = await localDb.tankAlertStates.toArray();
    for (const s of states) {
      clientAlertStates.set(s.tankId, s);
    }
  } catch (err) {
    console.warn('[ClientAlertEngine] Error loading alert states from IndexedDB:', err);
  }
}

export function getClientTankAlertState(tankId: string): TankAlertState {
  let s = clientAlertStates.get(tankId);
  if (!s) {
    s = {
      tankId,
      isLowLevelArmed: true,
      activeAlertId: null,
      activeCycleNumber: 0,
      lastLevel: null,
      lastAlertAt: null,
      recoveredAt: null,
      nextRecipientIndex: 0,
      updatedAt: new Date().toISOString(),
    };
    clientAlertStates.set(tankId, s);
  }
  return s;
}

export async function evaluateClientTankAlert(
  tank: TankData,
  previousLevel: number | null,
  currentLevel: number,
  onTriggerAlert?: (alert: TankAlert) => void
): Promise<{ newAlertCreated: boolean; alert?: TankAlert }> {
  const tankIdStr = String(tank.id);
  const state = getClientTankAlertState(tankIdStr);
  const settings = await dbService.getLocalAlertSettings(tankIdStr);

  const lowThreshold = settings.lowLevelThresholdPercent;
  const rearmThreshold = Math.max(settings.lowLevelThresholdPercent, settings.rearmThresholdPercent);
  const prevLvl = previousLevel !== null ? previousLevel : state.lastLevel;
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. RECOVERY / REARM CHECK (currentLevel >= rearmThreshold)
  if (currentLevel >= rearmThreshold) {
    if (state.activeAlertId) {
      const activeAlert = await localDb.tankAlerts.get(state.activeAlertId);
      if (activeAlert && activeAlert.status !== 'resolved') {
        activeAlert.status = 'resolved';
        activeAlert.resolvedAt = nowIso;
        activeAlert.resolvedReason = `Nível recuperado para ${currentLevel}% (acima do limite de rearmamento de ${rearmThreshold}%).`;
        activeAlert.updatedAt = nowIso;
        await localDb.tankAlerts.put(activeAlert);
      }
    }

    state.isLowLevelArmed = true;
    state.activeAlertId = null;
    state.recoveredAt = nowIso;
    state.lastLevel = currentLevel;
    state.updatedAt = nowIso;
    await localDb.tankAlertStates.put(state);
    return { newAlertCreated: false };
  }

  // 2. WHILE CURRENT LEVEL <= 30%: DO NOT DUPLICATE ALERTS
  if (!state.isLowLevelArmed || state.activeAlertId !== null) {
    state.lastLevel = currentLevel;
    state.updatedAt = nowIso;
    await localDb.tankAlertStates.put(state);
    return { newAlertCreated: false };
  }

  // 3. LOW LEVEL TRANSITION TRIGGER (> 30% -> <= 30%)
  const isTransition = prevLvl === null || prevLvl > lowThreshold;
  if (!isTransition || currentLevel > lowThreshold) {
    state.lastLevel = currentLevel;
    state.updatedAt = nowIso;
    await localDb.tankAlertStates.put(state);
    return { newAlertCreated: false };
  }

  // New Alert Cycle begins!
  const cycleNum = state.activeCycleNumber + 1;
  const alertId = 'loc_alert_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const idempotencyKey = `LOW_WATER_LEVEL:${tank.id}:${cycleNum}`;
  const sourceBoard =
    tank.nodeId === 1 ? 'PRINCIPAL' : tank.nodeId === 2 ? 'PLACA2' : 'PLACA3';

  // Round-robin recipient selection
  const activeRecipients = await dbService.getLocalRecipients(tankIdStr);
  let selectedRecipient = null;
  if (activeRecipients.length > 0) {
    const idx = state.nextRecipientIndex % activeRecipients.length;
    selectedRecipient = activeRecipients[idx];
    state.nextRecipientIndex = (idx + 1) % activeRecipients.length;
  }

  const alert: TankAlert = {
    id: alertId,
    idempotencyKey,
    tankId: tankIdStr,
    tankName: tank.name,
    sourceBoard,
    type: 'LOW_WATER_LEVEL',
    status: 'active',
    thresholdPercent: lowThreshold,
    resetThresholdPercent: rearmThreshold,
    levelAtTrigger: currentLevel,
    triggeredAt: nowIso,
    lastValidReadingAt: tank.lastValidTimestamp ? new Date(tank.lastValidTimestamp).toISOString() : nowIso,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedReason: null,
    activeCycleNumber: cycleNum,
    selectedRecipientId: selectedRecipient ? selectedRecipient.id : null,
    selectedRecipientName: selectedRecipient
      ? (selectedRecipient.name || selectedRecipient.email || 'Destinatário')
      : 'Nenhum destinatário de e-mail ativo configurado para este tanque.',
    popupShownAt: nowIso,
    soundPlayedAt: settings.soundEnabled ? nowIso : null,
    soundSilencedAt: null,
    soundSilencedBy: null,
    emailNotificationStatus: selectedRecipient?.email ? 'not_sent_offline' : 'not_applicable',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  state.isLowLevelArmed = false;
  state.activeAlertId = alertId;
  state.activeCycleNumber = cycleNum;
  state.lastAlertAt = nowIso;
  state.lastLevel = currentLevel;
  state.updatedAt = nowIso;

  await localDb.tankAlerts.put(alert);
  await localDb.tankAlertStates.put(state);

  // If email recipient is configured, record in local emailNotifications queue and create pending sync operation
  if (selectedRecipient?.email) {
    const emailNotif: EmailNotification = {
      id: 'loc_email_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      alertId,
      senderUserId: 'system',
      recipientId: selectedRecipient.id,
      senderEmailMasked: 'et***a@gmail.com',
      recipientEmailMasked: selectedRecipient.email,
      subject: `[ALERTA] Nível baixo de água — ${tank.name} (${currentLevel}%)`,
      providerMessageId: null,
      status: 'not_sent_offline',
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      createdAt: nowIso,
      sentAt: null,
      deliveredAt: null,
      updatedAt: nowIso,

      idempotencyKey: `EMAIL:${alertId}:${selectedRecipient.id}:offline`,
      tankId: tankIdStr,
      recipientName: selectedRecipient.name || 'Destinatário',
      senderEmail: 'etakizomba@gmail.com',
      emailMasked: selectedRecipient.email,
      provider: 'smtp_gmail',
      bodyPreview: `Hossidev Water Monitor: Foi detetado nível baixo de água no reservatório ${tank.name} (${currentLevel}%).`,
      queuedAt: nowIso,
      failedAt: null,
    };
    await localDb.emailNotifications.put(emailNotif);

    // Queue operation for background sync to server
    await localDb.pendingOperations.put({
      id: `op_alert_${alertId}`,
      tipoOperacao: 'offline_alert' as any,
      entidade: 'system',
      entidadeId: alertId,
      dados: {
        alert,
        recipient: selectedRecipient,
        idempotencyKey: `EMAIL:${alertId}:${selectedRecipient.id}`,
      },
      criadoEm: nowIso,
      atualizadoEm: nowIso,
      tentativas: 0,
      estado: 'pending',
    });

    // Auto-sync if currently online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncService.syncNow().catch(() => {});
    }
  }

  if (onTriggerAlert) {
    onTriggerAlert(alert);
  }

  return { newAlertCreated: true, alert };
}

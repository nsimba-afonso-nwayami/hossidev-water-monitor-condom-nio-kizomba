/**
 * Hossidev Water Monitor - Server Alert Engine
 * Evaluates water levels in real time on incoming readings:
 * 1. Detects low water level transition (> 30% -> <= 30%).
 * 2. Prevents duplicate alerts and notifications while level <= 30%.
 * 3. Rearms only when level recovers to >= 35% (configurable).
 * 4. Manages independent round-robin contact rotation per tank.
 * 5. Dispatches Email notifications with user/global SMTP and idempotency.
 * 6. Dispatches OS Web Push notifications to active user subscriptions.
 */

import crypto from 'crypto';
import { DatabaseSchema, TankRecord } from '../db';
import {
  TankAlert,
  TankAlertState,
  TankAlertSettings,
  AlertRecipient,
  EmailNotification,
} from '../../src/types';
import {
  sendEmailNotification,
  formatLowLevelEmail,
  maskEmailServer,
} from './notificationService';
import { sendPushNotification } from './pushService';

export function getOrCreateTankAlertSettings(tankId: string, db: DatabaseSchema): TankAlertSettings {
  if (!db.tankAlertSettings) {
    db.tankAlertSettings = {};
  }
  if (!db.tankAlertSettings[tankId]) {
    db.tankAlertSettings[tankId] = {
      tankId,
      lowLevelThresholdPercent: 30,
      rearmThresholdPercent: 35,
      notificationsEnabled: true,
      emailEnabled: true,
      soundEnabled: true,
      popupEnabled: true,
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    };
  }
  return db.tankAlertSettings[tankId];
}

export function getOrCreateTankAlertState(tankId: string, db: DatabaseSchema): TankAlertState {
  if (!db.tankAlertStates) {
    db.tankAlertStates = {};
  }
  if (!db.tankAlertStates[tankId]) {
    db.tankAlertStates[tankId] = {
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
  }
  return db.tankAlertStates[tankId];
}

/**
 * Evaluates real-time tank level against configured thresholds
 */
export async function processTankLevelAlert(
  tank: TankRecord,
  previousLevel: number | null,
  currentLevel: number,
  db: DatabaseSchema
): Promise<{ newAlertCreated: boolean; alert?: TankAlert }> {
  const tankIdStr = String(tank.id);
  const settings = getOrCreateTankAlertSettings(tankIdStr, db);
  const state = getOrCreateTankAlertState(tankIdStr, db);
  const now = new Date();
  const nowIso = now.toISOString();

  if (!db.tankAlerts) db.tankAlerts = [];
  if (!db.emailNotifications) db.emailNotifications = [];
  if (!db.alertRecipients) db.alertRecipients = [];
  if (!db.userEmailConfigs) db.userEmailConfigs = [];

  const lowThreshold = settings.lowLevelThresholdPercent;
  const rearmThreshold = Math.max(settings.lowLevelThresholdPercent, settings.rearmThresholdPercent);

  // Effective previous level reference
  const prevLvl = previousLevel !== null ? previousLevel : state.lastLevel;

  // 1. RECOVERY / REARM CHECK (currentLevel >= rearmThreshold)
  if (currentLevel >= rearmThreshold) {
    if (state.activeAlertId) {
      const activeAlert = db.tankAlerts.find((a) => a.id === state.activeAlertId);
      if (activeAlert && activeAlert.status !== 'resolved') {
        activeAlert.status = 'resolved';
        activeAlert.resolvedAt = nowIso;
        activeAlert.resolvedReason = `Nível recuperado para ${currentLevel}% (acima do limite de rearmamento de ${rearmThreshold}%).`;
        activeAlert.updatedAt = nowIso;
      }
    }

    state.isLowLevelArmed = true;
    state.activeAlertId = null;
    state.recoveredAt = nowIso;
    state.lastLevel = currentLevel;
    state.updatedAt = nowIso;
    return { newAlertCreated: false };
  }

  // 2. WHILE CURRENT LEVEL <= 30%: DO NOT DUPLICATE ALERTS
  // If the tank is already unarmed / has an active alert, update level and exit
  if (!state.isLowLevelArmed || state.activeAlertId !== null) {
    state.lastLevel = currentLevel;
    state.updatedAt = nowIso;
    return { newAlertCreated: false };
  }

  // 3. LOW LEVEL TRANSITION TRIGGER (> 30% -> <= 30%)
  // Trigger only if previously above threshold OR armed on fresh reading
  const isTransition = prevLvl === null || prevLvl > lowThreshold;
  if (!isTransition || currentLevel > lowThreshold) {
    state.lastLevel = currentLevel;
    state.updatedAt = nowIso;
    return { newAlertCreated: false };
  }

  // New Alert Cycle begins!
  const cycleNum = state.activeCycleNumber + 1;
  const alertId = crypto.randomUUID();
  const idempotencyKey = `LOW_WATER_LEVEL:${tank.id}:${cycleNum}`;

  // Source board identification
  const sourceBoard =
    tank.nodeId === 1 ? 'PRINCIPAL' : tank.nodeId === 2 ? 'PLACA2' : 'PLACA3';

  // 4. ROUND-ROBIN RECIPIENT ROTATION (Independent per tank)
  const activeCandidates = (db.alertRecipients || [])
    .filter((r) => {
      if (!r.enabled || !r.email) return false;
      if (r.tankId && r.tankId !== '' && r.tankId !== tankIdStr) return false;

      // Respect associated user status and tank permission associations
      const cleanEmail = r.email.trim().toLowerCase();
      const matchingUser = (db.users || []).find((u) => u.email.toLowerCase() === cleanEmail);
      if (matchingUser) {
        if (matchingUser.active === false) return false;
        if (Array.isArray(matchingUser.permittedTankIds) && !matchingUser.permittedTankIds.includes(tank.id)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  let selectedRecipient: AlertRecipient | null = null;
  if (activeCandidates.length > 0) {
    const idx = state.nextRecipientIndex % activeCandidates.length;
    selectedRecipient = activeCandidates[idx];
    // Advance recipient index for next cycle
    state.nextRecipientIndex = (idx + 1) % activeCandidates.length;
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
    emailNotificationStatus: 'not_applicable',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Update Tank Alert State: disarm until recovery to >= 35%
  state.isLowLevelArmed = false;
  state.activeAlertId = alertId;
  state.activeCycleNumber = cycleNum;
  state.lastAlertAt = nowIso;
  state.lastLevel = currentLevel;
  state.updatedAt = nowIso;

  // Add Alert to persistent list
  db.tankAlerts.unshift(alert);
  if (db.tankAlerts.length > 500) {
    db.tankAlerts.splice(500);
  }

  // 5. DISPATCH WEB PUSH NOTIFICATION TO ACTIVE USER SUBSCRIPTIONS
  sendPushNotification(null, {
    title: 'ALERTA — Nível baixo de água',
    body: `${tank.name} está em ${currentLevel}%. Verifique o sistema.`,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: `ALERT:${tankIdStr}:${cycleNum}`,
    data: {
      tankId: tankIdStr,
      alertId,
      url: `/#tank-${tankIdStr}`,
    },
  }).catch((err) => {
    console.warn('[AlertEngine] Aviso no despacho de notificação Push:', err?.message || err);
  });

  // 6. DISPATCH EMAIL NOTIFICATION
  if (settings.notificationsEnabled && settings.emailEnabled && selectedRecipient && selectedRecipient.email) {
    const pumpStateStr = tank.pump === 1 ? 'Ligada' : 'Desligada';
    const lastReadingStr = tank.lastValidTimestamp
      ? new Date(tank.lastValidTimestamp).toLocaleString('pt-BR')
      : now.toLocaleString('pt-BR');
    const alertTimeStr = now.toLocaleString('pt-BR');

    // System email provider settings
    const sysEmail = db.systemEmailSettings;
    const provider = sysEmail?.selectedProvider || 'corporate_hossidev';
    const isCorp = provider === 'corporate_hossidev';

    const senderEmail = isCorp
      ? sysEmail?.corporate?.fromAddress || 'water.report@hossidev.com'
      : sysEmail?.gmail?.fromAddress || 'etakizomba@gmail.com';
    const senderDisplayName = isCorp
      ? sysEmail?.corporate?.fromName || 'water.report.@hossidev.com'
      : sysEmail?.gmail?.fromName || 'Hossidev Water Monitor';
    const senderUserId = 'system';

    alert.emailNotificationStatus = 'pending';
    const emailContent = formatLowLevelEmail({
      tankName: tank.name,
      tankId: tankIdStr,
      level: currentLevel,
      threshold: lowThreshold,
      pumpState: pumpStateStr,
      boardName: sourceBoard,
      lastReadingTime: lastReadingStr,
      alertTime: alertTimeStr,
      senderEmail,
      senderDisplayName,
    });

    const emailRecordId = crypto.randomUUID();
    const emailIdempotency = `EMAIL:${alertId}:${selectedRecipient.id}:${provider}`;

    const emailRecord: EmailNotification = {
      id: emailRecordId,
      alertId,

      senderUserId,
      recipientId: selectedRecipient.id,
      senderEmailMasked: maskEmailServer(senderEmail),
      recipientEmailMasked: maskEmailServer(selectedRecipient.email),
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

      // Audit & table display fields
      idempotencyKey: emailIdempotency,
      tankId: tankIdStr,
      recipientName: selectedRecipient.name,
      senderEmail,
      emailMasked: maskEmailServer(selectedRecipient.email),
      provider: null,
      bodyPreview: emailContent.text.slice(0, 160),
      queuedAt: nowIso,
      failedAt: null,
    };

    db.emailNotifications.unshift(emailRecord);

    // Async dispatch
    sendEmailNotification({
      to: selectedRecipient.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      alertId,
      recipientId: selectedRecipient.id,
      tankName: tank.name,
      senderUserId,
      preferredProvider: provider,
    })
      .then((res) => {
        emailRecord.provider = res.provider;
        emailRecord.providerMessageId = res.providerMessageId;
        emailRecord.status = res.status;
        emailRecord.sentAt = res.status === 'sent' ? new Date().toISOString() : null;
        if (res.error) emailRecord.errorMessage = res.error;
        alert.emailNotificationStatus = res.status;
      })
      .catch((err) => {
        emailRecord.status = 'failed';
        emailRecord.errorMessage = err.message || String(err);
        alert.emailNotificationStatus = 'failed';
      });
  }

  return { newAlertCreated: true, alert };
}

/**
 * Hossidev Water Monitor - Alert System Router
 * REST API for Tank Low Level Alerts, Recipients, Settings,
 * User-Specific SMTP Configuration & Notification Logs.
 * (SMS functionality has been completely removed).
 */

import { Router } from 'express';
import crypto from 'crypto';
import { loadDb, saveDb } from '../db';
import { authMiddleware, requireAdmin, AuthRequest } from '../auth';
import {
  TankAlertSettings,
  AlertRecipient,
  UserEmailConfiguration,
  SafeUserEmailConfiguration,
  SystemEmailSettings,
  SafeSystemEmailSettings,
  EmailProviderType,
} from '../../src/types';
import {
  sendEmailNotification,
  formatLowLevelEmail,
  getNotificationConfigStatus,
  maskEmailServer,
  testUserSmtpConnection,
  testSystemEmailConnection,
} from '../services/notificationService';
import { encryptPassword } from '../services/cryptoService';
import { toSafeSystemEmailSettings } from '../db';

const router = Router();

// Helper to convert internal user config to safe frontend model (never reveals password)
function toSafeUserConfig(config: UserEmailConfiguration): SafeUserEmailConfiguration {
  return {
    id: config.id,
    userId: config.userId,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    hasPassword: Boolean(config.encryptedSmtpPassword),
    mailFrom: config.mailFrom,
    secure: config.secure,
    requireTls: config.requireTls,
    enabled: config.enabled,
    lastTestAt: config.lastTestAt,
    lastTestStatus: config.lastTestStatus,
    lastTestError: config.lastTestError,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

// ==========================================
// 1. ALERTS MANAGEMENT
// ==========================================

// GET /api/alerts
router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();

  if (!db.tankAlerts) db.tankAlerts = [];

  const permittedIds =
    user.role === 'admin'
      ? ['1', '2', '3', '4', '5', '6']
      : (user.permittedTankIds || []).map(String);

  let alerts = db.tankAlerts.filter((a) => permittedIds.includes(a.tankId));

  const statusParam = req.query.status as string;
  if (statusParam) {
    alerts = alerts.filter((a) => a.status === statusParam);
  }

  const tankIdParam = req.query.tankId as string;
  if (tankIdParam) {
    alerts = alerts.filter((a) => a.tankId === tankIdParam);
  }

  const activeCount = db.tankAlerts.filter(
    (a) => permittedIds.includes(a.tankId) && (a.status === 'active' || a.status === 'acknowledged')
  ).length;

  res.json({
    success: true,
    activeCount,
    total: alerts.length,
    alerts,
  });
});

// POST /api/alerts/:id/acknowledge
router.post('/:id/acknowledge', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const alertId = req.params.id;
  const db = loadDb();

  if (!db.tankAlerts) db.tankAlerts = [];
  const alert = db.tankAlerts.find((a) => a.id === alertId);

  if (!alert) {
    return res.status(404).json({ error: 'Alerta não encontrado.' });
  }

  const permittedIds =
    user.role === 'admin'
      ? ['1', '2', '3', '4', '5', '6']
      : (user.permittedTankIds || []).map(String);

  if (!permittedIds.includes(alert.tankId)) {
    return res.status(403).json({ error: 'Permissão negada para este reservatório.' });
  }

  const nowIso = new Date().toISOString();
  alert.status = 'acknowledged';
  alert.acknowledgedAt = nowIso;
  alert.acknowledgedBy = user.username;
  alert.updatedAt = nowIso;

  saveDb();

  res.json({
    success: true,
    message: `Alerta do tanque ${alert.tankName} reconhecido com sucesso por @${user.username}.`,
    alert,
  });
});

// POST /api/alerts/:id/silence
router.post('/:id/silence', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const alertId = req.params.id;
  const db = loadDb();

  if (!db.tankAlerts) db.tankAlerts = [];
  const alert = db.tankAlerts.find((a) => a.id === alertId);

  if (!alert) {
    return res.status(404).json({ error: 'Alerta não encontrado.' });
  }

  const nowIso = new Date().toISOString();
  alert.soundSilencedAt = nowIso;
  alert.soundSilencedBy = user.username;
  alert.updatedAt = nowIso;

  saveDb();

  res.json({
    success: true,
    message: 'Alarme sonoro silenciado com sucesso.',
    alert,
  });
});

// ==========================================
// 2. TANK ALERT SETTINGS
// ==========================================

// GET /api/alerts/settings
router.get('/settings', authMiddleware, (_req: AuthRequest, res) => {
  const db = loadDb();
  if (!db.tankAlertSettings) db.tankAlertSettings = {};

  const settingsList: TankAlertSettings[] = [];
  for (let i = 1; i <= 6; i++) {
    const idStr = String(i);
    if (!db.tankAlertSettings[idStr]) {
      db.tankAlertSettings[idStr] = {
        tankId: idStr,
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
    settingsList.push(db.tankAlertSettings[idStr]);
  }

  res.json({
    success: true,
    settings: settingsList,
  });
});

// PUT /api/alerts/settings/:tankId
router.put('/settings/:tankId', authMiddleware, requireAdmin, (req: AuthRequest, res) => {
  const user = req.user!;
  const tankId = req.params.tankId;
  const db = loadDb();
  if (!db.tankAlertSettings) db.tankAlertSettings = {};

  const {
    lowLevelThresholdPercent,
    rearmThresholdPercent,
    notificationsEnabled,
    emailEnabled,
    soundEnabled,
    popupEnabled,
  } = req.body;

  const low = typeof lowLevelThresholdPercent === 'number' ? Math.max(5, Math.min(80, lowLevelThresholdPercent)) : 30;
  const rearm = typeof rearmThresholdPercent === 'number' ? Math.max(low + 1, Math.min(95, rearmThresholdPercent)) : 35;

  db.tankAlertSettings[tankId] = {
    tankId,
    lowLevelThresholdPercent: low,
    rearmThresholdPercent: rearm,
    notificationsEnabled: Boolean(notificationsEnabled ?? true),
    emailEnabled: Boolean(emailEnabled ?? true),
    soundEnabled: Boolean(soundEnabled ?? true),
    popupEnabled: Boolean(popupEnabled ?? true),
    updatedAt: new Date().toISOString(),
    updatedBy: user.username,
  };

  saveDb(true);

  res.json({
    success: true,
    message: `Definições de alerta do Tanque ${tankId} atualizadas com sucesso.`,
    settings: db.tankAlertSettings[tankId],
  });
});

// ==========================================
// 3. USER-SPECIFIC EMAIL / SMTP CONFIGURATION
// Definições → Minha conta → Configuração de e-mail
// ==========================================

// GET /api/alerts/user-smtp
// Returns the currently authenticated user's email configuration (never reveals password)
router.get('/user-smtp', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  if (!db.userEmailConfigs) db.userEmailConfigs = [];

  const userConfig = db.userEmailConfigs.find((c) => c.userId === user.id);

  if (userConfig) {
    return res.json({
      success: true,
      config: toSafeUserConfig(userConfig),
      isConfigured: true,
    });
  }

  // Initial default values
  const defaultConfig: SafeUserEmailConfiguration = {
    id: '',
    userId: user.id,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: 'etakizomba@gmail.com',
    hasPassword: false,
    mailFrom: 'etakizomba@gmail.com',
    secure: false,
    requireTls: true,
    enabled: false,
    lastTestAt: null,
    lastTestStatus: null,
    lastTestError: null,
    createdAt: '',
    updatedAt: '',
  };

  res.json({
    success: true,
    config: defaultConfig,
    isConfigured: false,
  });
});

// POST /api/alerts/user-smtp
// Saves or updates the currently authenticated user's email configuration
router.post('/user-smtp', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    mailFrom,
    secure,
    requireTls,
    enabled,
  } = req.body;

  // Validations
  if (!smtpHost || typeof smtpHost !== 'string' || !smtpHost.trim()) {
    return res.status(400).json({ error: 'SMTP Host é obrigatório.' });
  }

  const portNum = Number(smtpPort);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return res.status(400).json({ error: 'Porta SMTP deve ser um número entre 1 e 65535.' });
  }

  if (!smtpUser || typeof smtpUser !== 'string' || !smtpUser.trim()) {
    return res.status(400).json({ error: 'SMTP User (utilizador) é obrigatório.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const cleanMailFrom = (mailFrom || smtpUser).trim();
  if (!emailRegex.test(cleanMailFrom) && !cleanMailFrom.includes('@')) {
    return res.status(400).json({ error: 'Endereço de e-mail do remetente (Mail From) inválido.' });
  }

  // Security validation: TLS or SSL required
  const isSecure = Boolean(secure);
  const isRequireTls = Boolean(requireTls);
  if (!isSecure && !isRequireTls && portNum !== 465) {
    return res.status(400).json({
      error: 'Por motivos de segurança, a autenticação SMTP requer conexão criptografada (STARTTLS ou SSL/TLS).',
    });
  }

  const db = loadDb();
  if (!db.userEmailConfigs) db.userEmailConfigs = [];

  const nowIso = new Date().toISOString();
  let userConfig = db.userEmailConfigs.find((c) => c.userId === user.id);

  if (userConfig) {
    userConfig.smtpHost = smtpHost.trim();
    userConfig.smtpPort = portNum;
    userConfig.smtpUser = smtpUser.trim();
    userConfig.mailFrom = cleanMailFrom;
    userConfig.secure = isSecure;
    userConfig.requireTls = isRequireTls;
    userConfig.enabled = Boolean(enabled);
    userConfig.updatedAt = nowIso;

    // Password handling: if new password provided, encrypt and store; if blank, keep existing
    if (typeof smtpPassword === 'string' && smtpPassword.trim().length > 0) {
      userConfig.encryptedSmtpPassword = encryptPassword(smtpPassword.trim());
    }
  } else {
    userConfig = {
      id: crypto.randomUUID(),
      userId: user.id,
      smtpHost: smtpHost.trim(),
      smtpPort: portNum,
      smtpUser: smtpUser.trim(),
      encryptedSmtpPassword:
        typeof smtpPassword === 'string' && smtpPassword.trim().length > 0
          ? encryptPassword(smtpPassword.trim())
          : null,
      mailFrom: cleanMailFrom,
      secure: isSecure,
      requireTls: isRequireTls,
      enabled: Boolean(enabled),
      lastTestAt: null,
      lastTestStatus: null,
      lastTestError: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.userEmailConfigs.push(userConfig);
  }

  saveDb(true);

  res.json({
    success: true,
    message: 'Configuração de e-mail salva com sucesso na sua conta.',
    config: toSafeUserConfig(userConfig),
  });
});

// POST /api/alerts/user-smtp/test
// Tests the authenticated user's SMTP configuration without exposing password
router.post('/user-smtp/test', authMiddleware, async (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  if (!db.userEmailConfigs) db.userEmailConfigs = [];

  let userConfig = db.userEmailConfigs.find((c) => c.userId === user.id);

  // If user passed form fields dynamically for unsaved testing
  const { smtpHost, smtpPort, smtpUser, smtpPassword, mailFrom, secure, requireTls } = req.body || {};

  if (smtpHost && smtpUser) {
    const portNum = Number(smtpPort || 587);
    const existingEncrypted = userConfig?.encryptedSmtpPassword || null;
    const encryptedPass =
      typeof smtpPassword === 'string' && smtpPassword.trim().length > 0
        ? encryptPassword(smtpPassword.trim())
        : existingEncrypted;

    userConfig = {
      id: userConfig?.id || crypto.randomUUID(),
      userId: user.id,
      smtpHost: smtpHost.trim(),
      smtpPort: portNum,
      smtpUser: smtpUser.trim(),
      encryptedSmtpPassword: encryptedPass,
      mailFrom: (mailFrom || smtpUser).trim(),
      secure: Boolean(secure),
      requireTls: Boolean(requireTls ?? true),
      enabled: true,
      lastTestAt: userConfig?.lastTestAt || null,
      lastTestStatus: userConfig?.lastTestStatus || null,
      lastTestError: userConfig?.lastTestError || null,
      createdAt: userConfig?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  if (!userConfig) {
    return res.status(400).json({ error: 'Nenhuma configuração SMTP encontrada para testar.' });
  }

  const recipientEmail = user.email || userConfig.smtpUser;
  const userName = user.name || user.username;

  const testResult = await testUserSmtpConnection({
    userConfig,
    recipientEmail,
    userName,
  });

  const nowIso = new Date().toISOString();
  // Update test status on saved config if exists
  const savedConfig = db.userEmailConfigs.find((c) => c.userId === user.id);
  if (savedConfig) {
    savedConfig.lastTestAt = nowIso;
    savedConfig.lastTestStatus = testResult.success ? 'success' : 'failed';
    savedConfig.lastTestError = testResult.success ? null : (testResult.error || testResult.message);
    savedConfig.updatedAt = nowIso;
    saveDb(true);
  }

  res.json({
    success: testResult.success,
    message: testResult.message,
    lastTestAt: nowIso,
  });
});

// DELETE /api/alerts/user-smtp
// Deletes or resets user's custom SMTP configuration
router.delete('/user-smtp', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  if (!db.userEmailConfigs) db.userEmailConfigs = [];

  const initialCount = db.userEmailConfigs.length;
  db.userEmailConfigs = db.userEmailConfigs.filter((c) => c.userId !== user.id);

  if (db.userEmailConfigs.length !== initialCount) {
    saveDb(true);
  }

  res.json({
    success: true,
    message: 'Configuração de e-mail removida da sua conta.',
  });
});

// ==========================================
// 4. RECIPIENTS MANAGEMENT (EMAIL ONLY)
// ==========================================

// GET /api/alerts/recipients
router.get('/recipients', authMiddleware, (_req: AuthRequest, res) => {
  const db = loadDb();
  if (!db.alertRecipients) db.alertRecipients = [];

  res.json({
    success: true,
    recipients: db.alertRecipients,
  });
});

// POST /api/alerts/recipients
router.post('/recipients', authMiddleware, requireAdmin, (req: AuthRequest, res) => {
  const { name, email, tankId, priority, enabled } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Endereço de e-mail válido é obrigatório.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const targetTankId = tankId ? String(tankId) : null;
  const db = loadDb();
  if (!db.alertRecipients) db.alertRecipients = [];

  // Check duplicates for the same tank
  const duplicate = db.alertRecipients.find((r) => {
    return r.email?.toLowerCase() === cleanEmail && r.tankId === targetTankId;
  });

  if (duplicate) {
    return res.status(400).json({
      error: `O e-mail ${cleanEmail} já está cadastrado para este reservatório.`,
    });
  }

  const nowIso = new Date().toISOString();
  const recipient: AlertRecipient = {
    id: crypto.randomUUID(),
    tankId: targetTankId,
    name: name?.trim() || null,
    email: cleanEmail,
    enabled: enabled !== false,
    priority: typeof priority === 'number' ? priority : db.alertRecipients.length + 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.alertRecipients.push(recipient);
  saveDb(true);

  res.status(201).json({
    success: true,
    message: 'Contacto de e-mail cadastrado com sucesso.',
    recipient,
  });
});

// PUT /api/alerts/recipients/:id
router.put('/recipients/:id', authMiddleware, requireAdmin, (req: AuthRequest, res) => {
  const id = req.params.id;
  const db = loadDb();
  if (!db.alertRecipients) db.alertRecipients = [];

  const recipient = db.alertRecipients.find((r) => r.id === id);
  if (!recipient) {
    return res.status(404).json({ error: 'Contacto não encontrado.' });
  }

  const { name, email, tankId, priority, enabled } = req.body;

  if (email) {
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Endereço de e-mail inválido.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const targetTankId = tankId !== undefined ? (tankId ? String(tankId) : null) : recipient.tankId;

    const duplicate = db.alertRecipients.find((r) => {
      return r.id !== id && r.email?.toLowerCase() === cleanEmail && r.tankId === targetTankId;
    });

    if (duplicate) {
      return res.status(400).json({
        error: `O e-mail ${cleanEmail} já está associado a este reservatório.`,
      });
    }

    recipient.email = cleanEmail;
  }

  if (name !== undefined) recipient.name = name?.trim() || null;
  if (tankId !== undefined) recipient.tankId = tankId ? String(tankId) : null;
  if (typeof priority === 'number') recipient.priority = priority;
  if (enabled !== undefined) recipient.enabled = Boolean(enabled);

  recipient.updatedAt = new Date().toISOString();
  saveDb(true);

  res.json({
    success: true,
    message: 'Contacto atualizado com sucesso.',
    recipient,
  });
});

// POST /api/alerts/recipients/:id/toggle
router.post('/recipients/:id/toggle', authMiddleware, requireAdmin, (req: AuthRequest, res) => {
  const id = req.params.id;
  const db = loadDb();
  if (!db.alertRecipients) db.alertRecipients = [];

  const recipient = db.alertRecipients.find((r) => r.id === id);
  if (!recipient) {
    return res.status(404).json({ error: 'Contacto não encontrado.' });
  }

  recipient.enabled = !recipient.enabled;
  recipient.updatedAt = new Date().toISOString();
  saveDb(true);

  res.json({
    success: true,
    message: `Contacto ${recipient.enabled ? 'ativado' : 'desativado'} com sucesso.`,
    recipient,
  });
});

// DELETE /api/alerts/recipients/:id
router.delete('/recipients/:id', authMiddleware, requireAdmin, (req: AuthRequest, res) => {
  const id = req.params.id;
  const db = loadDb();
  if (!db.alertRecipients) db.alertRecipients = [];

  const idx = db.alertRecipients.findIndex((r) => r.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Contacto não encontrado.' });
  }

  db.alertRecipients.splice(idx, 1);
  saveDb(true);

  res.json({
    success: true,
    message: 'Contacto removido com sucesso.',
  });
});

// ==========================================
// 4.5. SYSTEM-WIDE & CORPORATE EMAIL CONFIGURATION (ADMIN ONLY)
// ==========================================

// GET /api/alerts/system-email (Any authenticated user can read safe settings/active provider)
router.get('/system-email', authMiddleware, (_req: AuthRequest, res) => {
  const db = loadDb();
  if (!db.systemEmailSettings) {
    db.systemEmailSettings = {
      selectedProvider: (process.env.DEFAULT_EMAIL_PROVIDER as any) === 'gmail' ? 'gmail' : 'corporate_hossidev',
      corporate: {
        fromName: process.env.MAIL_FROM_NAME || 'water.report.@hossidev.com',
        fromAddress: process.env.MAIL_FROM_ADDRESS || 'water.report@hossidev.com',
        smtpHost: process.env.SMTP_HOST || 'mail.hossidev.com',
        smtpPort: Number(process.env.SMTP_PORT || 465),
        security: 'SSL',
        secure: true,
        smtpUser: process.env.SMTP_USER || 'water.report@hossidev.com',
        encryptedSmtpPassword: process.env.SMTP_PASSWORD ? encryptPassword(process.env.SMTP_PASSWORD) : null,
        lastTestAt: null,
        lastTestStatus: null,
        lastTestError: null,
        updatedAt: new Date().toISOString(),
      },
      gmail: {
        fromName: process.env.GMAIL_MAIL_FROM_NAME || 'Hossidev Water Monitor',
        fromAddress: process.env.GMAIL_MAIL_FROM_ADDRESS || process.env.GMAIL_SMTP_USER || 'etakizomba@gmail.com',
        smtpHost: process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com',
        smtpPort: Number(process.env.GMAIL_SMTP_PORT || 587),
        security: 'STARTTLS',
        secure: false,
        smtpUser: process.env.GMAIL_SMTP_USER || 'etakizomba@gmail.com',
        encryptedSmtpPassword: process.env.GMAIL_SMTP_PASSWORD ? encryptPassword(process.env.GMAIL_SMTP_PASSWORD) : null,
        lastTestAt: null,
        lastTestStatus: null,
        lastTestError: null,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };
    saveDb(true);
  }

  res.json({
    success: true,
    settings: toSafeSystemEmailSettings(db.systemEmailSettings),
  });
});

// PUT /api/alerts/system-email
router.put('/system-email', authMiddleware, requireAdmin, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  const body = req.body || {};

  if (!db.systemEmailSettings) {
    db.systemEmailSettings = {
      selectedProvider: 'corporate_hossidev',
      corporate: {
        fromName: 'water.report.@hossidev.com',
        fromAddress: 'water.report@hossidev.com',
        smtpHost: 'mail.hossidev.com',
        smtpPort: 465,
        security: 'SSL',
        secure: true,
        smtpUser: 'water.report@hossidev.com',
        encryptedSmtpPassword: null,
        lastTestAt: null,
        lastTestStatus: null,
        lastTestError: null,
        updatedAt: new Date().toISOString(),
      },
      gmail: {
        fromName: 'Hossidev Water Monitor',
        fromAddress: 'etakizomba@gmail.com',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        security: 'STARTTLS',
        secure: false,
        smtpUser: 'etakizomba@gmail.com',
        encryptedSmtpPassword: null,
        lastTestAt: null,
        lastTestStatus: null,
        lastTestError: null,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
      updatedBy: user.username,
    };
  }

  const current = db.systemEmailSettings;

  // Provider selection: 'gmail' or 'corporate_hossidev'
  if (body.selectedProvider === 'gmail' || body.selectedProvider === 'corporate_hossidev') {
    current.selectedProvider = body.selectedProvider;
  }

  // Update corporate section if provided
  if (body.corporate) {
    const c = body.corporate;
    if (c.fromName !== undefined) current.corporate.fromName = String(c.fromName).trim();
    if (c.fromAddress !== undefined) {
      const cleanFrom = String(c.fromAddress).trim().toLowerCase();
      if (!cleanFrom.includes('@') || cleanFrom.endsWith('.')) {
        return res.status(400).json({
          error: 'Endereço de e-mail do remetente inválido (não inclua pontos no final do domínio de e-mail).',
        });
      }
      current.corporate.fromAddress = cleanFrom;
    }
    if (c.smtpHost !== undefined) current.corporate.smtpHost = String(c.smtpHost).trim();
    if (c.smtpPort !== undefined) {
      const port = Number(c.smtpPort);
      if (isNaN(port) || port < 1 || port > 65535) {
        return res.status(400).json({ error: 'Porta SMTP corporativa inválida.' });
      }
      current.corporate.smtpPort = port;
      current.corporate.secure = port === 465 || c.security === 'SSL';
      current.corporate.security = current.corporate.secure ? 'SSL' : 'STARTTLS';
    }
    if (c.smtpUser !== undefined) current.corporate.smtpUser = String(c.smtpUser).trim();

    // Password handling: save encrypted with AES-256-GCM, never expose
    if (typeof c.smtpPassword === 'string' && c.smtpPassword.trim().length > 0) {
      current.corporate.encryptedSmtpPassword = encryptPassword(c.smtpPassword.trim());
    }
    current.corporate.updatedAt = new Date().toISOString();
  }

  // Update gmail section if provided
  if (body.gmail) {
    const g = body.gmail;
    if (g.fromName !== undefined) current.gmail.fromName = String(g.fromName).trim();
    if (g.fromAddress !== undefined) {
      const cleanGFrom = String(g.fromAddress).trim().toLowerCase();
      if (cleanGFrom.includes('@')) current.gmail.fromAddress = cleanGFrom;
    }
    if (g.smtpHost !== undefined) current.gmail.smtpHost = String(g.smtpHost).trim();
    if (g.smtpPort !== undefined) {
      const gPort = Number(g.smtpPort);
      if (!isNaN(gPort) && gPort >= 1 && gPort <= 65535) {
        current.gmail.smtpPort = gPort;
        current.gmail.secure = gPort === 465 || g.security === 'SSL';
        current.gmail.security = current.gmail.secure ? 'SSL' : 'STARTTLS';
      }
    }
    if (g.smtpUser !== undefined) current.gmail.smtpUser = String(g.smtpUser).trim();
    if (typeof g.smtpPassword === 'string' && g.smtpPassword.trim().length > 0) {
      current.gmail.encryptedSmtpPassword = encryptPassword(g.smtpPassword.trim());
    }
    current.gmail.updatedAt = new Date().toISOString();
  }

  current.updatedAt = new Date().toISOString();
  current.updatedBy = user.username;
  saveDb(true);

  res.json({
    success: true,
    message: 'Definições de e-mail e provedor guardadas com sucesso.',
    settings: toSafeSystemEmailSettings(current),
  });
});

// POST /api/alerts/system-email/test
// Real test dispatch: verifies TLS connection, tests authentication, attempts sending test mail
router.post('/system-email/test', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  const { provider, recipientEmail, corporateConfig, gmailConfig } = req.body || {};

  console.log('[DEBUG] Test SMTP - Body:', { provider, recipientEmail, hasCorporate: !!corporateConfig, hasGmail: !!gmailConfig });

  const cleanRecipient = String(recipientEmail || user.email || '').trim();
  if (!cleanRecipient || !cleanRecipient.includes('@')) {
    console.log('[DEBUG] Test SMTP - Email inválido:', cleanRecipient);
    return res.status(400).json({ error: 'Indique um endereço de e-mail válido para o teste.' });
  }

  const selectedProvider: EmailProviderType =
    provider === 'gmail' || provider === 'corporate_hossidev'
      ? provider
      : db.systemEmailSettings?.selectedProvider || 'corporate_hossidev';

  const customConfig = selectedProvider === 'corporate_hossidev' ? corporateConfig : gmailConfig;

  console.log('[DEBUG] Test SMTP - Provider:', selectedProvider, 'CustomConfig:', customConfig ? 'has config' : 'no config');

  const testResult = await testSystemEmailConnection({
    provider: selectedProvider,
    customConfig,
    recipientEmail: cleanRecipient,
    userName: user.name || user.username,
  });

  console.log('[DEBUG] Test SMTP - Result:', testResult);

  const nowIso = new Date().toISOString();
  if (db.systemEmailSettings) {
    const targetConfig =
      selectedProvider === 'corporate_hossidev' ? db.systemEmailSettings.corporate : db.systemEmailSettings.gmail;
    if (targetConfig) {
      targetConfig.lastTestAt = nowIso;
      targetConfig.lastTestStatus = testResult.success ? 'success' : 'failed';
      targetConfig.lastTestStage = testResult.stage;
      targetConfig.lastTestError = testResult.success ? null : testResult.message;
      targetConfig.lastTestCategory = testResult.errorCategory;
      targetConfig.lastTestDetails = testResult.errorDetails || null;
      targetConfig.lastTestRecipient = cleanRecipient;

      // Salvar a senha no banco após teste bem-sucedido
      if (testResult.success && customConfig && customConfig.smtpPassword) {
        targetConfig.encryptedSmtpPassword = encryptPassword(customConfig.smtpPassword.trim());
      }

      saveDb(true);
    }
  }

  // Also log the test attempt in notification history
  if (!db.emailNotifications) db.emailNotifications = [];
  db.emailNotifications.unshift({
    id: crypto.randomUUID(),
    alertId: `test_corp_${Date.now()}`,
    senderUserId: user.id,
    recipientId: `admin_${user.id}`,
    senderEmailMasked: maskEmailServer(testResult.sender),
    recipientEmailMasked: maskEmailServer(cleanRecipient),
    subject: '[TESTE] Hossidev Water Monitor — teste de notificação',
    providerMessageId: testResult.messageId || null,
    status: testResult.success ? 'sent' : 'failed',
    errorCode: testResult.errorCategory || null,
    errorMessage: testResult.success ? null : testResult.message,
    retryCount: 0,
    createdAt: nowIso,
    sentAt: testResult.success ? nowIso : null,
    deliveredAt: null,
    updatedAt: nowIso,
    idempotencyKey: `SYS_EMAIL_TEST:${Date.now()}:${cleanRecipient}`,
    tankId: '0',
    recipientName: `Administrador (@${user.username})`,
    senderEmail: testResult.sender,
    emailMasked: maskEmailServer(cleanRecipient),
    provider: selectedProvider,
    bodyPreview: `Teste operacional via ${selectedProvider}. ${testResult.message}`,
    queuedAt: nowIso,
    failedAt: testResult.success ? null : nowIso,
  });
  saveDb(true);

  return res.status(testResult.success ? 200 : 400).json({
    ...testResult,
    lastTestAt: nowIso,
  });
});

// ==========================================
// 5. TEST DISPATCHES (ADMIN ONLY WITH CONFIRMATION)
// ==========================================

// POST /api/alerts/test-email
router.post('/test-email', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  const user = req.user!;

  const { to, tankName } = req.body;

  if (!to || !to.includes('@')) {
    return res.status(400).json({ error: 'E-mail de destino inválido para teste.' });
  }

  const targetTank = tankName || 'Tanque FW1 (Teste)';
  const content = formatLowLevelEmail({
    tankName: targetTank,
    tankId: 'TEST-01',
    level: 28,
    threshold: 30,
    pumpState: 'Ligada',
    boardName: 'PRINCIPAL',
    lastReadingTime: new Date().toLocaleString('pt-BR'),
    alertTime: new Date().toLocaleString('pt-BR'),
    isTest: true,
  });

  const result = await sendEmailNotification({
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    alertId: `test_${Date.now()}`,
    recipientId: `admin_${user.id}`,
    tankName: targetTank,
  });

  const db = loadDb();
  if (!db.emailNotifications) db.emailNotifications = [];
  const nowIso = new Date().toISOString();

  db.emailNotifications.unshift({
    id: crypto.randomUUID(),
    alertId: `test_${Date.now()}`,
    senderUserId: user.id,
    recipientId: `admin_${user.id}`,
    senderEmailMasked: maskEmailServer(result.senderEmail),
    recipientEmailMasked: maskEmailServer(to),
    subject: content.subject,
    providerMessageId: result.providerMessageId,
    status: result.status,
    errorCode: null,
    errorMessage: result.error || null,
    retryCount: 0,
    createdAt: nowIso,
    sentAt: result.status === 'sent' ? nowIso : null,
    deliveredAt: null,
    updatedAt: nowIso,

    idempotencyKey: `TEST_EMAIL:${Date.now()}:${to}`,
    tankId: '0',
    recipientName: `Administrador (@${user.username})`,
    senderEmail: result.senderEmail,
    emailMasked: maskEmailServer(to),
    provider: result.provider,
    bodyPreview: content.text.slice(0, 160),
    queuedAt: nowIso,
    failedAt: result.status === 'failed' ? nowIso : null,
  });

  saveDb(true);

  res.json({
    success: result.status === 'sent' || result.status === 'queued',
    result,
    message: `E-mail de teste processado (${result.status}) via provedor [${result.provider}].`,
  });
});

// GET /api/alerts/config-status
router.get('/config-status', authMiddleware, (_req, res) => {
  const status = getNotificationConfigStatus();
  res.json({
    success: true,
    ...status,
  });
});

// ==========================================
// 6. NOTIFICATIONS LOGS & RETRY
// ==========================================

// GET /api/alerts/notifications
router.get('/notifications', authMiddleware, (req: AuthRequest, res) => {
  const db = loadDb();
  const emails = (db.emailNotifications || []).slice(0, 100);

  res.json({
    success: true,
    emails,
  });
});

// POST /api/alerts/notifications/:id/retry
router.post('/notifications/:id/retry', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  const notifId = req.params.id;
  const db = loadDb();

  if (!db.emailNotifications) db.emailNotifications = [];
  const emailRecord = db.emailNotifications.find((e) => e.id === notifId);

  if (!emailRecord) {
    return res.status(404).json({ error: 'Notificação não encontrada para reenvio.' });
  }

  const recipient = (db.alertRecipients || []).find((r) => r.id === emailRecord.recipientId);
  const toEmail = recipient?.email;

  if (!toEmail) {
    return res.status(400).json({ error: 'Endereço de e-mail do destinatário não encontrado para reenvio.' });
  }

  const targetTank = (db.currentTanks as any)?.[Number(emailRecord.tankId)]?.name || `Tanque ${emailRecord.tankId}`;
  const content = formatLowLevelEmail({
    tankName: targetTank,
    tankId: emailRecord.tankId || '1',
    level: 28,
    threshold: 30,
    pumpState: 'Desligada',
    boardName: 'PRINCIPAL',
    lastReadingTime: new Date().toLocaleString('pt-BR'),
    alertTime: new Date().toLocaleString('pt-BR'),
  });

  const activeUserConfig = (db.userEmailConfigs || []).find((c) => c.enabled);

  const result = await sendEmailNotification({
    to: toEmail,
    subject: emailRecord.subject || content.subject,
    text: content.text,
    html: content.html,
    alertId: emailRecord.alertId,
    recipientId: emailRecord.recipientId,
    tankName: targetTank,
    userConfig: activeUserConfig || null,
  });

  emailRecord.retryCount = (emailRecord.retryCount || 0) + 1;
  emailRecord.status = result.status;
  emailRecord.provider = result.provider;
  emailRecord.providerMessageId = result.providerMessageId;
  emailRecord.errorMessage = result.error || null;
  emailRecord.updatedAt = new Date().toISOString();
  if (result.status === 'sent') {
    emailRecord.sentAt = new Date().toISOString();
  }

  const parentAlert = (db.tankAlerts || []).find((a) => a.id === emailRecord.alertId);
  if (parentAlert) {
    parentAlert.emailNotificationStatus = result.status;
    parentAlert.updatedAt = new Date().toISOString();
  }

  saveDb(true);

  return res.json({
    success: result.status === 'sent' || result.status === 'queued',
    notification: emailRecord,
    message: `Reenvio de e-mail processado (${result.status}) via ${result.provider}.`,
  });
});

export default router;

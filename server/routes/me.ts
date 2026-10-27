import { Router } from 'express';
import crypto from 'crypto';
import { loadDb, saveDb } from '../db';
import { authMiddleware, AuthRequest } from '../auth';
import { UserSmtpConfiguration, SafeUserSmtpConfiguration } from '../../src/types';
import { encryptPassword, decryptPassword } from '../services/cryptoService';
import { testUserSmtpConnection } from '../services/notificationService';

const router = Router();

// Helper to convert internal user config to safe model without exposing secrets
function toSafeSmtpConfig(config: any): SafeUserSmtpConfiguration {
  const securityType: 'STARTTLS' | 'SSL' | 'NONE' =
    config.security || (config.secure || config.smtpPort === 465 ? 'SSL' : config.requireTls !== false ? 'STARTTLS' : 'NONE');

  return {
    id: config.id,
    userId: config.userId,
    smtpHost: config.smtpHost || '',
    smtpPort: config.smtpPort || 587,
    smtpUser: config.smtpUser || '',
    hasPassword: Boolean(config.encryptedSmtpPassword),
    mailFrom: config.mailFrom || config.smtpUser || '',
    security: securityType,
    secure: config.secure || securityType === 'SSL' || config.smtpPort === 465,
    requireTls: config.requireTls ?? securityType === 'STARTTLS',
    enabled: config.enabled !== false,
    lastTestAt: config.lastTestAt || null,
    lastTestStatus: config.lastTestStatus || null,
    lastTestError: config.lastTestError || null,
    createdAt: config.createdAt || '',
    updatedAt: config.updatedAt || '',
  };
}

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// In-memory rate limiting for SMTP testing to prevent duplicate concurrent clicks
const lastTestTimestamps = new Map<string, number>();

// ==========================================
// GET /api/me/smtp
// Retrieves the authenticated user's SMTP configuration
// ==========================================
router.get('/smtp', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  if (!db.userEmailConfigs) db.userEmailConfigs = [];

  const userConfig = db.userEmailConfigs.find((c: any) => c.userId === user.id);

  if (userConfig) {
    return res.json({
      success: true,
      config: toSafeSmtpConfig(userConfig),
      isConfigured: true,
    });
  }

  // Initial default values as specified
  const defaultConfig: SafeUserSmtpConfiguration = {
    id: '',
    userId: user.id,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: 'etakizomba@gmail.com',
    hasPassword: false,
    mailFrom: 'etakizomba@gmail.com',
    security: 'STARTTLS',
    secure: false,
    requireTls: true,
    enabled: true,
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

// ==========================================
// POST /api/me/smtp & PUT /api/me/smtp
// Creates or updates the authenticated user's SMTP configuration
// ==========================================
const saveHandler = (req: AuthRequest, res: any) => {
  const user = req.user!;
  const db = loadDb();
  if (!db.userEmailConfigs) db.userEmailConfigs = [];

  const {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    mailFrom,
    security,
    secure,
    requireTls,
    enabled,
  } = req.body;

  // 1. Validation
  const cleanHost = String(smtpHost || '').trim();
  if (!cleanHost) {
    return res.status(400).json({
      success: false,
      error: 'Servidor SMTP inválido.',
      message: 'Servidor SMTP inválido.',
    });
  }

  const portNum = Number(smtpPort);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return res.status(400).json({
      success: false,
      error: 'Porta SMTP inválida.',
      message: 'Porta SMTP inválida.',
    });
  }

  const cleanUser = String(smtpUser || '').trim();
  if (!cleanUser) {
    return res.status(400).json({
      success: false,
      error: 'Usuário SMTP obrigatório.',
      message: 'Usuário SMTP obrigatório.',
    });
  }

  const cleanMailFrom = String(mailFrom || cleanUser).trim();
  if (!isValidEmail(cleanMailFrom)) {
    return res.status(400).json({
      success: false,
      error: 'E-mail remetente inválido.',
      message: 'E-mail remetente inválido.',
    });
  }

  // Security parsing
  let normalizedSecurity: 'STARTTLS' | 'SSL' | 'NONE' = 'STARTTLS';
  if (security === 'SSL' || secure === true || portNum === 465) {
    normalizedSecurity = 'SSL';
  } else if (security === 'NONE') {
    normalizedSecurity = 'NONE';
  } else {
    normalizedSecurity = 'STARTTLS';
  }

  const isSecure = normalizedSecurity === 'SSL';
  const needTls = normalizedSecurity === 'STARTTLS';

  const existingIndex = db.userEmailConfigs.findIndex((c: any) => c.userId === user.id);
  const existingConfig = existingIndex >= 0 ? db.userEmailConfigs[existingIndex] : null;

  // Password Handling:
  // - Required on first configuration
  // - Optional on update: if empty or unchanged, preserve existing encrypted password
  let encryptedPassword = existingConfig ? existingConfig.encryptedSmtpPassword : null;

  if (typeof smtpPassword === 'string' && smtpPassword.trim().length > 0) {
    encryptedPassword = encryptPassword(smtpPassword.trim());
  } else if (!encryptedPassword) {
    return res.status(400).json({
      success: false,
      error: 'Senha SMTP obrigatória na primeira configuração.',
      message: 'Senha SMTP obrigatória na primeira configuração.',
    });
  }

  const nowIso = new Date().toISOString();

  const updatedRecord: any = {
    id: existingConfig ? existingConfig.id : crypto.randomUUID(),
    userId: user.id, // Strictly bound to authenticated session
    smtpHost: cleanHost,
    smtpPort: portNum,
    smtpUser: cleanUser,
    encryptedSmtpPassword: encryptedPassword,
    mailFrom: cleanMailFrom,
    security: normalizedSecurity,
    secure: isSecure,
    requireTls: needTls,
    enabled: enabled !== false,
    lastTestAt: existingConfig ? existingConfig.lastTestAt : null,
    lastTestStatus: existingConfig ? existingConfig.lastTestStatus : null,
    lastTestError: existingConfig ? existingConfig.lastTestError : null,
    createdAt: existingConfig ? existingConfig.createdAt : nowIso,
    updatedAt: nowIso,
  };

  if (existingIndex >= 0) {
    db.userEmailConfigs[existingIndex] = updatedRecord;
  } else {
    db.userEmailConfigs.push(updatedRecord);
  }

  saveDb();

  res.json({
    success: true,
    message: 'Configuração guardada com sucesso.',
    config: toSafeSmtpConfig(updatedRecord),
  });
};

router.post('/smtp', authMiddleware, saveHandler);
router.put('/smtp', authMiddleware, saveHandler);

// ==========================================
// DELETE /api/me/smtp
// Removes or clears user SMTP configuration
// ==========================================
router.delete('/smtp', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  if (!db.userEmailConfigs) db.userEmailConfigs = [];

  const initialLen = db.userEmailConfigs.length;
  db.userEmailConfigs = db.userEmailConfigs.filter((c: any) => c.userId !== user.id);

  if (db.userEmailConfigs.length !== initialLen) {
    saveDb();
  }

  res.json({
    success: true,
    message: 'Configuração SMTP removida com sucesso.',
  });
});

// ==========================================
// POST /api/me/smtp/test
// Tests SMTP connection and sends validation email
// ==========================================
router.post('/smtp/test', authMiddleware, async (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  if (!db.userEmailConfigs) db.userEmailConfigs = [];

  // Rate Limiting (Minimum 3 seconds between test clicks per user)
  const now = Date.now();
  const lastTest = lastTestTimestamps.get(user.id) || 0;
  if (now - lastTest < 3000) {
    return res.status(429).json({
      success: false,
      error: 'Aguarde alguns segundos antes de solicitar um novo teste.',
      message: 'Aguarde alguns segundos antes de solicitar um novo teste.',
    });
  }
  lastTestTimestamps.set(user.id, now);

  const existingConfig = db.userEmailConfigs.find((c: any) => c.userId === user.id);
  const {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    mailFrom,
    security,
  } = req.body || {};

  console.log('[DEBUG] User SMTP Test - Body:', { smtpHost, smtpPort, smtpUser, hasPassword: !!smtpPassword, mailFrom, security });
  console.log('[DEBUG] User SMTP Test - Existing Config:', existingConfig ? 'exists' : 'none');

  // Form config to test (from body or stored record)
  const testHost = String(smtpHost || existingConfig?.smtpHost || '').trim();
  const testPort = Number(smtpPort || existingConfig?.smtpPort || 587);
  const testUser = String(smtpUser || existingConfig?.smtpUser || '').trim();
  const testMailFrom = String(mailFrom || existingConfig?.mailFrom || testUser).trim();

  let testEncryptedPassword = existingConfig ? existingConfig.encryptedSmtpPassword : null;
  if (typeof smtpPassword === 'string' && smtpPassword.trim().length > 0) {
    testEncryptedPassword = encryptPassword(smtpPassword.trim());
  }

  console.log('[DEBUG] User SMTP Test - Test Config:', { testHost, testPort, testUser, hasEncryptedPassword: !!testEncryptedPassword });

  if (!testHost || !testUser || !testEncryptedPassword) {
    console.log('[DEBUG] User SMTP Test - Validation failed:', { hasHost: !!testHost, hasUser: !!testUser, hasPassword: !!testEncryptedPassword });
    return res.status(400).json({
      success: false,
      error: 'Não foi possível testar a configuração. Verifique o servidor, a porta, a segurança e as credenciais.',
      message: 'Não foi possível testar a configuração. Verifique o servidor, a porta, a segurança e as credenciais.',
    });
  }

  const isSecure = security === 'SSL' || testPort === 465;
  const isRequireTls = security === 'STARTTLS' || (!isSecure && security !== 'NONE');

  console.log('[DEBUG] User SMTP Test - Security config:', { security, isSecure, isRequireTls });

  const configToTest: any = {
    id: existingConfig?.id || 'temp-test',
    userId: user.id,
    smtpHost: testHost,
    smtpPort: testPort,
    smtpUser: testUser,
    encryptedSmtpPassword: testEncryptedPassword,
    mailFrom: testMailFrom,
    secure: isSecure,
    requireTls: isRequireTls,
    enabled: true,
    lastTestAt: null,
    lastTestStatus: null,
    lastTestError: null,
    createdAt: '',
    updatedAt: '',
  };

  const recipientEmail = user.email || testMailFrom;
  const nowIso = new Date().toISOString();

  console.log('[DEBUG] User SMTP Test - About to call testUserSmtpConnection with:', {
    recipientEmail,
    configToTest: {
      smtpHost: configToTest.smtpHost,
      smtpPort: configToTest.smtpPort,
      smtpUser: configToTest.smtpUser,
      hasPassword: !!configToTest.encryptedSmtpPassword,
    },
  });

  try {
    console.log('[DEBUG] User SMTP Test - Calling testUserSmtpConnection');
    const testResult = await testUserSmtpConnection({
      userConfig: configToTest,
      recipientEmail,
      userName: user.name || user.username,
    });

    console.log('[DEBUG] User SMTP Test - Result:', testResult);

    if (existingConfig) {
      existingConfig.lastTestAt = nowIso;
      existingConfig.lastTestStatus = testResult.success ? 'success' : 'failed';
      existingConfig.lastTestError = testResult.success ? null : testResult.error || 'Falha no teste';
      saveDb();
    }

    if (testResult.success) {
      return res.json({
        success: true,
        message: 'Configuração testada com sucesso. Verifique a sua caixa de entrada.',
        lastTestAt: nowIso,
        lastTestStatus: 'success',
      });
    } else {
      console.log('[DEBUG] User SMTP Test - Test failed, returning 400');
      return res.status(400).json({
        success: false,
        message: testResult.message || 'Não foi possível testar a configuração. Verifique o servidor, a porta, a segurança e as credenciais.',
        error: testResult.error,
        lastTestAt: nowIso,
        lastTestStatus: 'failed',
      });
    }
  } catch (err: any) {
    if (existingConfig) {
      existingConfig.lastTestAt = nowIso;
      existingConfig.lastTestStatus = 'failed';
      existingConfig.lastTestError = err.message || 'Erro inesperado';
      saveDb();
    }

    return res.status(400).json({
      success: false,
      message: 'Não foi possível testar a configuração. Verifique o servidor, a porta, a segurança e as credenciais.',
      lastTestAt: nowIso,
      lastTestStatus: 'failed',
    });
  }
});

export default router;

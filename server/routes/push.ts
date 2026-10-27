import { Router } from 'express';
import crypto from 'crypto';
import { loadDb, saveDb } from '../db';
import { authMiddleware, AuthRequest } from '../auth';
import { getVapidPublicKey, sendPushNotification } from '../services/pushService';
import { PushSubscriptionRecord } from '../../src/types';

const router = Router();

// GET /api/push/public-key
// Returns the public VAPID key so client can create subscription
router.get('/public-key', (_req, res) => {
  const publicKey = getVapidPublicKey();
  res.json({ success: true, publicKey });
});

// GET /api/push/status
// Returns subscription status for current user
router.get('/status', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const db = loadDb();
  if (!db.pushSubscriptions) db.pushSubscriptions = [];

  const userSubs = db.pushSubscriptions.filter(
    (s) => s.userId === user.id && s.active && s.permissionStatus === 'granted'
  );

  res.json({
    success: true,
    isSubscribed: userSubs.length > 0,
    devicesCount: userSubs.length,
    subscriptions: userSubs.map((s) => ({
      deviceId: s.deviceId,
      permissionStatus: s.permissionStatus,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
    })),
  });
});

// POST /api/push/subscribe
// Registers or updates a push subscription for the authenticated user and device
router.post('/subscribe', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const { deviceId, subscription, userAgent, permissionStatus } = req.body;

  if (!deviceId || !subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Dados de subscrição push inválidos.' });
  }

  const { endpoint, keys } = subscription;
  if (!keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Chaves de criptografia push ausentes.' });
  }

  const db = loadDb();
  if (!db.pushSubscriptions) db.pushSubscriptions = [];

  const nowIso = new Date().toISOString();
  let existing = db.pushSubscriptions.find((s) => s.userId === user.id && s.deviceId === deviceId);

  if (existing) {
    existing.endpoint = endpoint;
    existing.p256dh = keys.p256dh;
    existing.auth = keys.auth;
    existing.permissionStatus = permissionStatus || 'granted';
    existing.active = permissionStatus !== 'denied';
    existing.userAgent = userAgent || existing.userAgent || null;
    existing.updatedAt = nowIso;
  } else {
    const record: PushSubscriptionRecord = {
      id: crypto.randomUUID(),
      userId: user.id,
      deviceId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
      permissionStatus: permissionStatus || 'granted',
      active: permissionStatus !== 'denied',
      createdAt: nowIso,
      lastUsedAt: null,
      updatedAt: nowIso,
    };
    db.pushSubscriptions.push(record);
  }

  saveDb(true);

  res.json({
    success: true,
    message: 'Subscrição de notificações do sistema ativada com sucesso.',
  });
});

// POST /api/push/unsubscribe
// Deactivates push subscription for device
router.post('/unsubscribe', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: 'Identificador do dispositivo não informado.' });
  }

  const db = loadDb();
  if (!db.pushSubscriptions) db.pushSubscriptions = [];

  const sub = db.pushSubscriptions.find((s) => s.userId === user.id && s.deviceId === deviceId);
  if (sub) {
    sub.active = false;
    sub.permissionStatus = 'default';
    sub.updatedAt = new Date().toISOString();
    saveDb(true);
  }

  res.json({
    success: true,
    message: 'Notificações push desativadas para este dispositivo.',
  });
});

// POST /api/push/remove-device
// Completely removes device subscription
router.post('/remove-device', authMiddleware, (req: AuthRequest, res) => {
  const user = req.user!;
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: 'Identificador do dispositivo não informado.' });
  }

  const db = loadDb();
  if (!db.pushSubscriptions) db.pushSubscriptions = [];

  const initialLength = db.pushSubscriptions.length;
  db.pushSubscriptions = db.pushSubscriptions.filter(
    (s) => !(s.userId === user.id && s.deviceId === deviceId)
  );

  if (db.pushSubscriptions.length !== initialLength) {
    saveDb(true);
  }

  res.json({
    success: true,
    message: 'Dispositivo removido da lista de notificações com sucesso.',
  });
});

// POST /api/push/test
// Sends an immediate test push notification to user's devices
router.post('/test', authMiddleware, async (req: AuthRequest, res) => {
  const user = req.user!;
  const result = await sendPushNotification([user.id], {
    title: 'Hossidev Water Monitor',
    body: 'Teste de notificação do sistema recebido com sucesso!',
    data: {
      url: '/',
      timestamp: Date.now(),
    },
  });

  res.json({
    success: result.sent > 0,
    ...result,
    message: result.sent > 0
      ? 'Notificação enviada com sucesso para o dispositivo.'
      : 'Nenhum dispositivo ativo encontrado para receber notificações.',
  });
});

export default router;

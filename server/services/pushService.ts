import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { loadDb, saveDb } from '../db';
import { PushSubscriptionRecord } from '../../src/types';

/**
 * Hossidev Water Monitor - Web Push Service
 * Supports OS notifications via Service Worker, Push API, and VAPID.
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cachedVapidKeys: VapidKeys | null = null;

function getOrGenerateVapidKeys(): VapidKeys {
  if (cachedVapidKeys) return cachedVapidKeys;

  // 1. From environment variables
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && !process.env.VAPID_PUBLIC_KEY.startsWith('[')) {
    cachedVapidKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
    return cachedVapidKeys;
  }

  // 2. From persistent file
  if (fs.existsSync(VAPID_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
      if (data.publicKey && data.privateKey) {
        cachedVapidKeys = data;
        return cachedVapidKeys!;
      }
    } catch (err) {
      console.error('[PushService] Erro ao ler vapid.json:', err);
    }
  }

  // 3. Generate new persistent keypair
  const generated = webpush.generateVAPIDKeys();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(VAPID_FILE, JSON.stringify(generated, null, 2), 'utf8');
  } catch (err) {
    console.error('[PushService] Erro ao salvar vapid.json:', err);
  }

  cachedVapidKeys = generated;
  return cachedVapidKeys;
}

// Initialize web-push configuration
export function initPushService(): void {
  const keys = getOrGenerateVapidKeys();
  const subject = process.env.VAPID_SUBJECT || 'mailto:etakizomba@gmail.com';

  try {
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  } catch (err: any) {
    console.error('[PushService] Erro ao configurar VAPID:', err.message);
  }
}

export function getVapidPublicKey(): string {
  return getOrGenerateVapidKeys().publicKey;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    tankId?: string | number;
    alertId?: string;
    url?: string;
    timestamp?: number;
  };
}

/**
 * Dispatches web push notification to active subscriptions of given user IDs (or all active if userIds is empty)
 */
export async function sendPushNotification(
  userIds: string[] | null,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  initPushService();
  const db = loadDb();
  if (!db.pushSubscriptions || db.pushSubscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const activeSubscriptions = db.pushSubscriptions.filter((sub) => {
    if (!sub.active) return false;
    if (sub.permissionStatus === 'denied') return false;
    if (!userIds || userIds.length === 0) return true;
    return userIds.includes(sub.userId);
  });

  if (activeSubscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
    tag: payload.tag || `hossidev-alert-${Date.now()}`,
    data: {
      ...payload.data,
      url: payload.data?.url || '/',
      timestamp: Date.now(),
    },
  });

  let sent = 0;
  let failed = 0;
  let dbChanged = false;

  await Promise.all(
    activeSubscriptions.map(async (sub) => {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        await webpush.sendNotification(pushSubscription, payloadString, {
          TTL: 60 * 60 * 24, // 24 hours
        });

        sub.lastUsedAt = new Date().toISOString();
        sub.updatedAt = new Date().toISOString();
        sent++;
        dbChanged = true;
      } catch (err: any) {
        failed++;
        console.warn(`[PushService] Falha ao enviar push para endpoint ${sub.endpoint.slice(0, 30)}...:`, err.message);

        // If subscription is 410 Gone or 404 Not Found, deactivate it
        if (err.statusCode === 410 || err.statusCode === 404) {
          sub.active = false;
          sub.permissionStatus = 'denied';
          sub.updatedAt = new Date().toISOString();
          dbChanged = true;
        }
      }
    })
  );

  if (dbChanged) {
    saveDb(true);
  }

  return { sent, failed };
}

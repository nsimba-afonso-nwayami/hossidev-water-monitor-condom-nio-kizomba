/**
 * Hossidev Water Monitor - Client Web Push Notification Service
 * Manages Service Worker registration, PushManager subscriptions,
 * permission request by explicit user action, and server synchronization.
 */

import { api } from './api';

const DEVICE_ID_KEY = 'hossidev_push_device_id';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export const pushNotificationService = {
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  },

  getPermissionStatus(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  },

  async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported()) return null;
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js');
      }
      return reg;
    } catch (err) {
      console.warn('[PushNotificationService] Falha ao registrar Service Worker:', err);
      return null;
    }
  },

  /**
   * Requests permission explicitly from the user and registers push subscription
   */
  async requestPermissionAndSubscribe(): Promise<{
    success: boolean;
    permission: NotificationPermission;
    message: string;
  }> {
    if (!this.isSupported()) {
      return {
        success: false,
        permission: 'denied',
        message: 'Notificações push não são suportadas neste navegador ou dispositivo.',
      };
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return {
          success: false,
          permission,
          message:
            permission === 'denied'
              ? 'As notificações do sistema foram bloqueadas neste dispositivo. Ative-as nas definições do navegador ou sistema operativo.'
              : 'Permissão de notificação não concedida.',
        };
      }

      const reg = await this.getRegistration();
      if (!reg) {
        return {
          success: false,
          permission,
          message: 'Não foi possível inicializar o Service Worker para notificações.',
        };
      }

      // Fetch VAPID public key from backend
      const keyRes = await api.push.getPublicKey();
      if (!keyRes.success || !keyRes.publicKey) {
        return {
          success: false,
          permission,
          message: 'Chave pública VAPID do servidor indisponível.',
        };
      }

      const convertedKey = urlBase64ToUint8Array(keyRes.publicKey);

      // Check existing subscription or create new
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        });
      }

      const deviceId = getOrCreateDeviceId();
      const subJson = subscription.toJSON();

      // Sync subscription with backend
      await api.push.subscribe({
        deviceId,
        subscription: {
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
        },
        userAgent: navigator.userAgent,
        permissionStatus: 'granted',
      });

      return {
        success: true,
        permission: 'granted',
        message: 'Notificações do sistema ativadas com sucesso neste dispositivo!',
      };
    } catch (err: any) {
      console.error('[PushNotificationService] Erro ao subscrever push:', err);
      return {
        success: false,
        permission: this.getPermissionStatus(),
        message: err.message || 'Falha ao ativar notificações push.',
      };
    }
  },

  /**
   * Unsubscribes current device from push notifications
   */
  async unsubscribeDevice(): Promise<{ success: boolean; message: string }> {
    try {
      const deviceId = getOrCreateDeviceId();
      if (this.isSupported()) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await sub.unsubscribe().catch(() => {});
          }
        }
      }

      await api.push.unsubscribe({ deviceId }).catch(() => {});

      return {
        success: true,
        message: 'Notificações desativadas para este dispositivo.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Falha ao desativar notificações.',
      };
    }
  },

  /**
   * Completely removes this device from user's push subscriptions
   */
  async removeThisDevice(): Promise<{ success: boolean; message: string }> {
    try {
      const deviceId = getOrCreateDeviceId();
      if (this.isSupported()) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await sub.unsubscribe().catch(() => {});
          }
        }
      }

      await api.push.removeDevice({ deviceId });
      localStorage.removeItem(DEVICE_ID_KEY);

      return {
        success: true,
        message: 'Dispositivo removido da lista de notificações com sucesso.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Falha ao remover dispositivo.',
      };
    }
  },
};

import {
  AuthUser,
  TankData,
  NodeStatus,
  LogItem,
  UserManagementItem,
  CondominiumMetrics,
  SystemBoardStatuses,
  TankAlert,
  TankAlertSettings,
  AlertRecipient,
  SafeUserEmailConfiguration,
  SafeUserSmtpConfiguration,
  SafeSystemEmailSettings,
  EmailProviderType,
} from '../types';
import { authStorage } from './authStorage';
import { dbService } from '../db/localDb';
import { syncService } from './syncService';
import { INITIAL_TANKS } from '../data/tanksConfig';

export function getStoredToken(): string | null {
  return authStorage.getToken();
}

export function setStoredAuth(token: string, user: AuthUser, rememberMe: boolean = true): void {
  authStorage.saveSession(user, token, rememberMe);
}

export function getStoredUser(): AuthUser | null {
  return authStorage.getUser();
}

export function clearStoredAuth(): void {
  authStorage.clearSession();
}

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    authStorage.clearSession();
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.error || `Erro de requisição (${res.status})`, res.status);
  }

  return data as T;
}

export const api = {
  auth: {
    getStoredToken,
    getStoredUser,
    clearStoredAuth,

    login: async (
      identifier: string,
      password: string,
      rememberMe: boolean = true
    ): Promise<{ token: string; user: AuthUser; isOffline?: boolean }> => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (isOnline) {
        try {
          // Attempt Online Authentication with Backend
          const data = await request<{ token: string; user: AuthUser }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, password }),
          });

          // 1. Save in local session storage
          authStorage.saveSession(data.user, data.token, rememberMe);

          // 2. Persist in IndexedDB with secure salt+hash for offline availability
          await dbService.saveOrUpdateLocalUser(data.user, password, data.token);

          // 3. Trigger immediate background sync
          syncService.syncNow().catch((err) => console.warn('[Sync] Initial sync error:', err));

          return { ...data, isOffline: false };
        } catch (onlineErr: any) {
          // If server error is a real credentials error from a responding backend (401 / 400 with specific message)
          const msg = onlineErr.message || '';
          const status = onlineErr.status;
          const isExplicitCredentialError =
            (status === 401 || status === 400) &&
            (msg.includes('Senha incorreta') ||
              msg.includes('não encontrado') ||
              msg.includes('Credenciais inválidas') ||
              msg.includes('Informe usuário'));

          if (isExplicitCredentialError) {
            // Check if local database has this user or master admin credentials before failing completely
            try {
              const localUser = await dbService.verifyOfflineCredentials(identifier, password);
              const token = localUser.token || 'offline_local_token_' + Date.now();
              authStorage.saveSession(
                {
                  id: localUser.id,
                  username: localUser.username,
                  name: localUser.name,
                  email: localUser.email,
                  role: localUser.role,
                  permittedTankIds: localUser.permittedTankIds,
                },
                token,
                rememberMe
              );
              return {
                token,
                user: {
                  id: localUser.id,
                  username: localUser.username,
                  name: localUser.name,
                  email: localUser.email,
                  role: localUser.role,
                  permittedTankIds: localUser.permittedTankIds,
                },
                isOffline: true,
              };
            } catch {
              // If local check also fails or differs, throw the real credential error
              throw onlineErr;
            }
          }

          // If network / connectivity failure, 404 (e.g. Vercel static deployment without Node backend), or offline fallback
          console.warn('[Auth] Servidor backend inacessível ou estático, utilizando autenticação local:', onlineErr);
          const localUser = await dbService.verifyOfflineCredentials(identifier, password);
          const token = localUser.token || 'offline_local_token_' + Date.now();
          authStorage.saveSession(
            {
              id: localUser.id,
              username: localUser.username,
              name: localUser.name,
              email: localUser.email,
              role: localUser.role,
              permittedTankIds: localUser.permittedTankIds,
            },
            token,
            rememberMe
          );
          return {
            token,
            user: {
              id: localUser.id,
              username: localUser.username,
              name: localUser.name,
              email: localUser.email,
              role: localUser.role,
              permittedTankIds: localUser.permittedTankIds,
            },
            isOffline: true,
          };
        }
      } else {
        // Device is completely offline: Use local IndexedDB credential validation
        const localUser = await dbService.verifyOfflineCredentials(identifier, password);
        const token = localUser.token || 'offline_local_token_' + Date.now();
        authStorage.saveSession(
          {
            id: localUser.id,
            username: localUser.username,
            name: localUser.name,
            email: localUser.email,
            role: localUser.role,
            permittedTankIds: localUser.permittedTankIds,
          },
          token,
          rememberMe
        );
        return {
          token,
          user: {
            id: localUser.id,
            username: localUser.username,
            name: localUser.name,
            email: localUser.email,
            role: localUser.role,
            permittedTankIds: localUser.permittedTankIds,
          },
          isOffline: true,
        };
      }
    },

    register: async (payload: {
      username: string;
      name?: string;
      email: string;
      password: string;
      role?: 'admin' | 'user';
      permittedTankIds?: number[];
    }): Promise<{ token: string; user: AuthUser }> => {
      const data = await request<{ token: string; user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      authStorage.saveSession(data.user, data.token, true);
      return data;
    },

    getMe: async (): Promise<{ user: AuthUser }> => {
      try {
        const res = await request<{ user: AuthUser }>('/api/auth/me');
        if (res.user) {
          authStorage.updateSessionUser(res.user);
        }
        return res;
      } catch (err) {
        // If offline, check local storage
        const user = authStorage.getUser();
        if (user) {
          return { user };
        }
        throw err;
      }
    },

    logout: async (): Promise<void> => {
      try {
        await request('/api/auth/logout', { method: 'POST' });
      } catch {
        // Ignore network errors on logout
      } finally {
        authStorage.clearSession();
      }
    },
  },

  telemetry: {
    getCurrent: async (): Promise<{
      hasRealData: boolean;
      isOnline: boolean;
      lastCommunication: string | null;
      lastCommunicationTimestamp: number | null;
      tanks: Record<number, TankData>;
      nodes: {
        node1: NodeStatus;
        node2: NodeStatus;
        node3: NodeStatus;
      };
      systemConfig: {
        audioAlarmEnabled: boolean;
        emergencyLockout: boolean;
        watchdogTimeoutMs: number;
      };
      metrics: CondominiumMetrics;
      boardStatuses?: SystemBoardStatuses;
      isOfflineFallback?: boolean;
    }> => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (isOnline) {
        try {
          const data = await request<any>('/api/telemetry/current');
          if (data && data.tanks) {
            const tanksList: TankData[] = Object.values(data.tanks);
            // Cache latest tanks state into local IndexedDB
            dbService.saveTanks(tanksList, 'online', true).catch(() => {});
          }
          return { ...data, isOfflineFallback: false };
        } catch (err) {
          console.warn('[Telemetry] Falha de rede ao consultar servidor, recorrendo à base local IndexedDB:', err);
        }
      }

      // Offline Fallback: Load latest known tanks and state from IndexedDB
      const localTanks = await dbService.getTanks();
      const tanksRecord: Record<number, TankData> = {};

      const baseTanks = localTanks.length > 0 ? localTanks : INITIAL_TANKS;
      for (const t of baseTanks) {
        tanksRecord[t.id] = {
          id: t.id,
          name: t.name,
          grid: t.grid,
          sector: t.sector,
          sectorName: t.sectorName,
          nodeId: t.nodeId,
          capacity_value: t.capacity_value ?? t.capacityLiters,
          capacity_unit: t.capacity_unit || 'L',
          capacityLiters: t.capacityLiters,
          level: t.level,
          currentLiters: t.currentLiters ?? (t.level !== null && t.capacityLiters ? Math.round((t.level / 100) * t.capacityLiters) : 0),
          pump: t.pump || 0,
          fault: t.fault || 0,
          sensors: t.sensors || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          fault_mask: t.fault_mask || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          waterClass: t.waterClass,
          lastUpdated: t.lastUpdated,
          hasRealData: Boolean(t.hasRealData),
        };
      }

      const hasReal = Object.values(tanksRecord).some((t) => t.hasRealData && t.level !== null);

      return {
        hasRealData: hasReal,
        isOnline: false,
        lastCommunication: null,
        lastCommunicationTimestamp: null,
        tanks: tanksRecord,
        nodes: {
          node1: { id: 1, name: 'Node 1', label: 'Água Tratada', role: 'Tanques 1 e 2', busPort: 'COM3', status: 'offline', lastPing: null, packetCount: 0 },
          node2: { id: 2, name: 'Node 2', label: 'Água Pré-Tratada', role: 'Tanques 3 e 4', busPort: 'COM4', status: 'offline', lastPing: null, packetCount: 0 },
          node3: { id: 3, name: 'Node 3', label: 'Água Bruta', role: 'Tanques 5 e 6', busPort: 'COM5', status: 'offline', lastPing: null, packetCount: 0 },
        },
        systemConfig: {
          audioAlarmEnabled: true,
          emergencyLockout: false,
          watchdogTimeoutMs: 8000,
        },
        metrics: {
          totalCapacityLiters: 140000,
          currentTotalLiters: 0,
          totalPercentage: 0,
          activePumps: 0,
          totalFaultySensors: 0,
          estimatedAutonomyHours: 0,
          dailyConsumptionEstimateLiters: 28000,
        },
        isOfflineFallback: true,
      };
    },

    getHistory: async (params?: { tankId?: number; period?: string }): Promise<{
      totalRecords: number;
      period: string;
      tankId: number | null;
      records: Array<{
        id: string;
        timestamp: number;
        isoTime: string;
        nodeId: number;
        tankId: number;
        level: number;
        pump: number;
        sensors: number[];
        fault: number;
        fault_mask: number[];
        source: string;
      }>;
    }> => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (isOnline) {
        try {
          const query = new URLSearchParams();
          if (params?.tankId) query.append('tankId', String(params.tankId));
          if (params?.period) query.append('period', params.period);
          const qStr = query.toString() ? `?${query.toString()}` : '';
          const res = await request<any>(`/api/telemetry/history${qStr}`);
          return res;
        } catch {
          // Fallback to local
        }
      }

      // Offline History from IndexedDB
      const readings = await dbService.getRecentReadings(100, params?.tankId);
      return {
        totalRecords: readings.length,
        period: params?.period || '24h',
        tankId: params?.tankId || null,
        records: readings.map((r) => ({
          id: r.id,
          timestamp: r.timestamp,
          isoTime: r.isoTime,
          nodeId: r.nodeId,
          tankId: r.tankId,
          level: r.level,
          pump: r.pump,
          sensors: r.sensors,
          fault: r.fault,
          fault_mask: r.fault_mask,
          source: r.source,
        })),
      };
    },

    ingest: async (payload: {
      nodeId?: number;
      node?: number;
      tanks: Array<{
        id: number;
        level?: number;
        pump?: number;
        sensors?: number[];
        fault?: number;
        fault_mask?: number[];
      }>;
      device?: string;
      source?: string;
    }): Promise<{ success: boolean; updatedTanks: number; timestamp: number }> => {
      const now = Date.now();

      // Always save to IndexedDB first (Local-First Guarantee)
      if (Array.isArray(payload.tanks)) {
        for (const t of payload.tanks) {
          const tankId = Number(t.id);
          const levelVal = typeof t.level === 'number' ? t.level : 0;
          await dbService.saveReading(
            {
              tankId,
              nodeId: Number(payload.nodeId || payload.node || 1),
              level: levelVal,
              currentLiters: null,
              capacityLiters: null,
              pump: t.pump || 0,
              fault: t.fault || 0,
              sensors: t.sensors || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              fault_mask: t.fault_mask || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              timestamp: now,
              isoTime: new Date(now).toISOString(),
              source: (payload.source as any) || 'serial_bridge',
            },
            false // not synced yet
          );
        }
      }

      // If online, also dispatch to server
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (isOnline) {
        try {
          return await request('/api/telemetry/ingest', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        } catch {
          // Saved locally, will sync when online
        }
      }

      return {
        success: true,
        updatedTanks: payload.tanks?.length || 0,
        timestamp: now,
      };
    },

    sendCommand: async (cmd: {
      command: string;
      tankId?: number;
      nodeId?: number;
      value?: any;
    }): Promise<{ success: boolean; message: string }> => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      // Always record command as a local event and queue for sync
      const user = authStorage.getUser();
      await dbService.recordEvent({
        type: 'pump_command',
        description: `Comando ${cmd.command} para Tanque ${cmd.tankId || 'Geral'}`,
        userId: user?.id || 'local_op',
        userName: user?.name || 'Operador Local',
        origin: 'local',
        synced: false,
      });

      if (isOnline) {
        try {
          return await request('/api/telemetry/command', {
            method: 'POST',
            body: JSON.stringify(cmd),
          });
        } catch (err: any) {
          console.warn('[Telemetry] Comando salvo na fila offline após falha de envio:', err);
        }
      }

      // Queue in pendingOperations
      await dbService.enqueueOperation({
        tipoOperacao: cmd.command.includes('emergency') ? 'emergency_stop' : 'pump_command',
        entidade: 'tank',
        entidadeId: cmd.tankId || 0,
        dados: cmd,
      });

      return {
        success: true,
        message: `Comando "${cmd.command}" registrado e enfileirado localmente na base offline.`,
      };
    },

    sendAlarmCommand: async (
      tankId: number,
      action: 'ON' | 'OFF'
    ): Promise<{ success: boolean; message: string; ok?: boolean; reason?: string }> => {
      if (tankId < 1 || tankId > 6) {
        throw new Error('Identificador de tanque inválido (deve ser entre 1 e 6).');
      }
      if (action !== 'ON' && action !== 'OFF') {
        throw new Error('Ação de alarme inválida (deve ser ON ou OFF).');
      }

      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      const user = authStorage.getUser();

      await dbService.recordEvent({
        type: 'alarm',
        description: `Comando SET_ALARM ${action} para Tanque #${tankId}`,
        userId: user?.id || 'local_op',
        userName: user?.name || 'Operador Local',
        origin: 'local',
        synced: false,
      });

      if (isOnline) {
        try {
          return await request('/api/telemetry/command', {
            method: 'POST',
            body: JSON.stringify({
              command: 'SET_ALARM',
              tank: tankId,
              tankId,
              action,
            }),
          });
        } catch (err: any) {
          console.warn('[Telemetry] Falha ao enviar comando de alarme online, gravando na fila:', err);
        }
      }

      await dbService.enqueueOperation({
        tipoOperacao: 'alarm_command' as any,
        entidade: 'tank',
        entidadeId: tankId,
        dados: { command: 'SET_ALARM', tank: tankId, action },
      });

      return {
        success: true,
        message: `Comando SET_ALARM ${action} para Tanque #${tankId} registrado na fila offline.`,
      };
    },

    getLogs: async (): Promise<{ logs: LogItem[] }> => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (isOnline) {
        try {
          return await request('/api/telemetry/logs');
        } catch {}
      }
      // Return local events as logs
      const events = await dbService.recordEvent({
        type: 'sync',
        description: 'Consulta de logs em modo offline',
        userId: 'system',
        userName: 'Sistema',
        origin: 'local',
        synced: true,
      });
      return {
        logs: [
          {
            id: events.id,
            time: new Date().toLocaleTimeString(),
            type: 'system',
            text: 'Modo Offline: exibindo eventos locais armazenados no IndexedDB.',
          },
        ],
      };
    },

    clearLogs: async (): Promise<{ success: boolean }> => {
      try {
        return await request('/api/telemetry/logs', { method: 'DELETE' });
      } catch {
        return { success: true };
      }
    },
  },

  admin: {
    getUsers: async (): Promise<{ users: UserManagementItem[] }> => {
      return request('/api/admin/users');
    },
    createUser: async (payload: {
      username: string;
      name?: string;
      email: string;
      password: string;
      role: 'admin' | 'user';
      permittedTankIds: number[];
    }): Promise<{ success: boolean; user: UserManagementItem; message?: string }> => {
      return request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    updateUser: async (
      id: string,
      payload: {
        username?: string;
        name?: string;
        email?: string;
        role?: 'admin' | 'user';
        permittedTankIds?: number[];
        password?: string;
      }
    ): Promise<{ success: boolean; user: UserManagementItem; message?: string }> => {
      return request(`/api/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    resetPassword: async (id: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
      return request(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
    },
    deleteUser: async (id: string): Promise<{ success: boolean; message: string }> => {
      return request(`/api/admin/users/${id}`, {
        method: 'DELETE',
      });
    },
    getBackup: async (): Promise<any> => {
      return request('/api/admin/backup');
    },
    restoreBackup: async (backupPayload: any): Promise<{ success: boolean; message: string; stats?: any }> => {
      return request('/api/admin/restore', {
        method: 'POST',
        body: JSON.stringify(backupPayload),
      });
    },
    getStats: async (): Promise<{
      success: boolean;
      stats: {
        fileSizeBytes: number;
        usersCount: number;
        historyCount: number;
        logsCount: number;
        lastBackupAt?: string;
        uptimeSeconds: number;
      };
    }> => {
      return request('/api/admin/stats');
    },
    getConfig: async (): Promise<{
      success: boolean;
      config: {
        audioAlarmEnabled: boolean;
        emergencyLockout: boolean;
        watchdogTimeoutMs: number;
        dailyConsumptionEstimateLiters?: number;
        lowLevelAlertPercentage?: number;
        criticalLevelAlertPercentage?: number;
        condominiumName?: string;
        lastBackupAt?: string;
      };
    }> => {
      return request('/api/admin/config');
    },
    getTanks: async (): Promise<{
      success: boolean;
      tanks: Array<{
        id: number;
        name: string;
        grid: string;
        sector: string;
        sectorName: string;
        nodeId: number;
        capacityLiters: number;
        waterClass: string;
        defaultCapacityLiters: number;
      }>;
    }> => {
      return request('/api/admin/tanks');
    },
    updateTankCapacities: async (capacities: Record<number, number>): Promise<{
      success: boolean;
      message: string;
      updatedTanks: Record<number, number>;
      tanks: any;
    }> => {
      return request('/api/admin/tanks/capacities', {
        method: 'PUT',
        body: JSON.stringify({ capacities }),
      });
    },
    resetTankCapacities: async (): Promise<{
      success: boolean;
      message: string;
      tanks: any;
    }> => {
      return request('/api/admin/tanks/reset-capacities', {
        method: 'POST',
      });
    },
    updateConfig: async (configPayload: any): Promise<{
      success: boolean;
      message: string;
      config: any;
    }> => {
      return request('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify(configPayload),
      });
    },
  },

  sync: {
    syncNow: () => syncService.syncNow(),
    getOverview: () => syncService.getOverview(),
    retryFailed: () => syncService.retryFailed(),
    clearCompleted: () => syncService.clearCompleted(),
    exportLocalBackup: () => dbService.exportDatabaseBackup(),
    importLocalBackup: (json: string) => dbService.importDatabaseBackup(json),
    getStats: () => dbService.getDatabaseStats(),
  },

  alerts: {
    getAll: async (params?: { status?: string; tankId?: string }): Promise<{
      success: boolean;
      activeCount: number;
      total: number;
      alerts: TankAlert[];
    }> => {
      const q = new URLSearchParams();
      if (params?.status) q.append('status', params.status);
      if (params?.tankId) q.append('tankId', params.tankId);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      try {
        return await request(`/api/alerts${queryStr}`);
      } catch {
        // Offline fallback from local IndexedDB
        const localAlerts = await dbService.getLocalAlerts(params?.tankId, params?.status);
        const activeCount = localAlerts.filter((a) => a.status === 'active' || a.status === 'acknowledged').length;
        return {
          success: true,
          activeCount,
          total: localAlerts.length,
          alerts: localAlerts,
        };
      }
    },
    acknowledge: async (id: string): Promise<{ success: boolean; alert: TankAlert }> => {
      try {
        return await request(`/api/alerts/${id}/acknowledge`, { method: 'POST' });
      } catch {
        const u = authStorage.getUser();
        const local = await dbService.acknowledgeLocalAlert(id, u?.username || 'operador');
        if (!local) throw new Error('Alerta não encontrado localmente');
        return { success: true, alert: local };
      }
    },
    silence: async (id: string): Promise<{ success: boolean; alert: TankAlert }> => {
      return request(`/api/alerts/${id}/silence`, { method: 'POST' });
    },
    getSettings: async (): Promise<{ success: boolean; settings: Record<string, TankAlertSettings> }> => {
      return request('/api/alerts/settings');
    },
    updateSettings: async (
      tankId: string,
      data: Partial<TankAlertSettings>
    ): Promise<{ success: boolean; settings: TankAlertSettings }> => {
      return request(`/api/alerts/settings/${tankId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    getRecipients: async (): Promise<{ success: boolean; recipients: AlertRecipient[] }> => {
      try {
        return await request('/api/alerts/recipients');
      } catch {
        const local = await dbService.getLocalRecipients();
        return { success: true, recipients: local };
      }
    },
    createRecipient: async (
      data: Partial<AlertRecipient>
    ): Promise<{ success: boolean; recipient: AlertRecipient }> => {
      return request('/api/alerts/recipients', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    updateRecipient: async (
      id: string,
      data: Partial<AlertRecipient>
    ): Promise<{ success: boolean; recipient: AlertRecipient }> => {
      return request(`/api/alerts/recipients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    deleteRecipient: async (id: string): Promise<{ success: boolean }> => {
      return request(`/api/alerts/recipients/${id}`, { method: 'DELETE' });
    },
    toggleRecipient: async (id: string): Promise<{ success: boolean; recipient: AlertRecipient }> => {
      return request(`/api/alerts/recipients/${id}/toggle`, { method: 'POST' });
    },
    testEmail: async (
      to: string,
      tankName?: string
    ): Promise<{ success: boolean; message: string; result: any }> => {
      return request('/api/alerts/test-email', {
        method: 'POST',
        body: JSON.stringify({ to, tankName }),
      });
    },
    getNotifications: async (): Promise<{
      success: boolean;
      emails: any[];
    }> => {
      return request('/api/alerts/notifications');
    },
    retryNotification: async (
      id: string
    ): Promise<{ success: boolean; message: string; notification: any }> => {
      return request(`/api/alerts/notifications/${id}/retry`, {
        method: 'POST',
      });
    },
    getUserSmtp: async (): Promise<{
      success: boolean;
      config: SafeUserEmailConfiguration;
      isConfigured: boolean;
    }> => {
      return request('/api/alerts/user-smtp');
    },
    saveUserSmtp: async (
      data: Partial<SafeUserEmailConfiguration> & { smtpPassword?: string }
    ): Promise<{
      success: boolean;
      message: string;
      config: SafeUserEmailConfiguration;
    }> => {
      return request('/api/alerts/user-smtp', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    testUserSmtp: async (
      data?: Partial<SafeUserEmailConfiguration> & { smtpPassword?: string }
    ): Promise<{
      success: boolean;
      message: string;
      lastTestAt: string;
    }> => {
      return request('/api/alerts/user-smtp/test', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      });
    },
    deleteUserSmtp: async (): Promise<{ success: boolean; message: string }> => {
      return request('/api/alerts/user-smtp', { method: 'DELETE' });
    },
    getSystemEmailSettings: async (): Promise<{
      success: boolean;
      settings: SafeSystemEmailSettings;
    }> => {
      return request('/api/alerts/system-email');
    },
    updateSystemEmailSettings: async (
      data: any
    ): Promise<{
      success: boolean;
      message: string;
      settings: SafeSystemEmailSettings;
    }> => {
      return request('/api/alerts/system-email', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    testSystemEmailSettings: async (data: {
      provider: EmailProviderType;
      recipientEmail: string;
      corporateConfig?: any;
      gmailConfig?: any;
    }): Promise<{
      success: boolean;
      stage: string;
      message: string;
      messageId?: string;
      errorCategory?: string;
      errorDetails?: string;
      lastTestAt: string;
    }> => {
      return request('/api/alerts/system-email/test', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  },

  me: {
    getSmtp: async (): Promise<{
      success: boolean;
      config: SafeUserSmtpConfiguration;
      isConfigured: boolean;
    }> => {
      return request('/api/me/smtp');
    },
    saveSmtp: async (
      data: Partial<SafeUserSmtpConfiguration> & { smtpPassword?: string }
    ): Promise<{
      success: boolean;
      message: string;
      config: SafeUserSmtpConfiguration;
    }> => {
      return request('/api/me/smtp', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    updateSmtp: async (
      data: Partial<SafeUserSmtpConfiguration> & { smtpPassword?: string }
    ): Promise<{
      success: boolean;
      message: string;
      config: SafeUserSmtpConfiguration;
    }> => {
      return request('/api/me/smtp', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    testSmtp: async (
      data?: Partial<SafeUserSmtpConfiguration> & { smtpPassword?: string }
    ): Promise<{
      success: boolean;
      message: string;
      lastTestAt: string;
      lastTestStatus: string;
    }> => {
      return request('/api/me/smtp/test', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      });
    },
    deleteSmtp: async (): Promise<{ success: boolean; message: string }> => {
      return request('/api/me/smtp', { method: 'DELETE' });
    },
  },
  push: {
    getPublicKey: async (): Promise<{ success: boolean; publicKey: string }> => {
      return request('/api/push/public-key');
    },
    getStatus: async (): Promise<{
      success: boolean;
      isSubscribed: boolean;
      devicesCount: number;
      subscriptions: any[];
    }> => {
      return request('/api/push/status');
    },
    subscribe: async (data: {
      deviceId: string;
      subscription: any;
      userAgent?: string;
      permissionStatus?: string;
    }): Promise<{ success: boolean; message: string }> => {
      return request('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    unsubscribe: async (data: { deviceId: string }): Promise<{ success: boolean; message: string }> => {
      return request('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    removeDevice: async (data: { deviceId: string }): Promise<{ success: boolean; message: string }> => {
      return request('/api/push/remove-device', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    test: async (): Promise<{ success: boolean; message: string; sent: number; failed: number }> => {
      return request('/api/push/test', { method: 'POST' });
    },
  },
};

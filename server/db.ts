import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  TankAlert,
  TankAlertState,
  TankAlertSettings,
  AlertRecipient,
  EmailNotification,
  UserEmailConfiguration,
  PushSubscriptionRecord,
  SystemEmailSettings,
  SafeSystemEmailSettings,
  CorporateEmailConfig,
  GmailEmailConfig,
  EmailProviderType,
} from '../src/types';
import { encryptPassword } from './services/cryptoService';

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  permittedTankIds: number[]; // e.g. [1, 2, 3, 4, 5, 6] or subset
  active?: boolean;
  permissions?: string[];
  createdBy?: string | null;
  createdAt: string;
  updatedAt?: string;
  lastLogin?: string;
  lastLoginAt?: string | null;
}

export interface TelemetryReadingRecord {
  id: string;
  timestamp: number; // Unix epoch ms
  isoTime: string;
  nodeId: number;
  tankId: number;
  level: number; // 0-100%
  pump: number; // 0 or 1
  alarm?: number; // 0 or 1
  alarm_muted?: number; // 0 or 1
  sensors: number[]; // 10 elements (0: dry, 1: submerged)
  fault: number; // 0: normal, 1: fault
  fault_mask: number[]; // 10 elements (0: ok, 1: faulty sensor)
  source: 'serial_bridge' | 'http_ingest' | 'hardware_uart';
  currentLiters?: number;
}

export type ServerBoardStatus =
  | 'online'
  | 'sem resposta temporária'
  | 'reconectando'
  | 'offline'
  | 'erro'
  | 'desconhecido';

export interface RealNodeStatus {
  id: number;
  name: string;
  label: string;
  role: string;
  busPort: string;
  status: 'online' | 'offline';
  communicationStatus?: ServerBoardStatus;
  lastPing: number | null; // null if never contacted
  lastDataAt?: number | null;
  lastHeartbeatAt?: number | null;
  lastError?: string | null;
  reconnectAttempts?: number;
  consecutiveMissedHeartbeats?: number;
  packetCount: number;
  bootCounter?: number | null;
  lastSeq?: number | null;
}

export interface LogRecord {
  id: string;
  time: string;
  type: 'rx' | 'tx' | 'alarm' | 'system' | 'fault';
  nodeId?: number;
  text: string;
  rawJson?: string;
}

export interface TankRecord {
  id: number;
  name: string;
  grid: string;
  sector: 'filtrada' | 'nao-filtrada' | 'bruta';
  sectorName: string;
  nodeId: number;
  capacity_value?: number | null; // Optional numeric value entered by admin
  capacity_unit?: 'L' | 'm3' | 'gal' | null; // Optional unit
  capacityLiters: number | null; // null when unconfigured / "Modo Percentual"
  level: number | null; // null when no real reading received yet
  currentLiters?: number | null;
  lastValidLevel?: number | null; // Preserved last valid level
  lastValidLiters?: number | null; // Preserved last valid liters
  lastValidTimestamp?: number | null; // Preserved timestamp
  isStale?: boolean;
  readingOrigin?: string;
  pump: number; // 0: OFF, 1: ON
  alarm?: number; // 0: OFF, 1: ON (sirene ativa)
  alarm_muted?: number; // 0: não silenciada, 1: silenciada pelo operador
  fault: number; // 0: normal, 1: fault
  sensors: number[]; // 10 elements
  fault_mask: number[]; // 10 elements
  waterClass: string;
  lastUpdated: number | null; // null if no real reading
  hasRealData: boolean;
}

export interface DatabaseSchema {
  users: UserRecord[];
  currentTanks: {
    [tankId: number]: TankRecord;
  };
  nodes: {
    node1: RealNodeStatus;
    node2: RealNodeStatus;
    node3: RealNodeStatus;
  };
  telemetryHistory: TelemetryReadingRecord[];
  logs: LogRecord[];
  systemConfig: {
    audioAlarmEnabled: boolean;
    emergencyLockout: boolean;
    watchdogTimeoutMs: number; // e.g. 10000ms
    dailyConsumptionEstimateLiters?: number;
    lowLevelAlertPercentage?: number;
    criticalLevelAlertPercentage?: number;
    condominiumName?: string;
    lastBackupAt?: string;
  };
  tankAlerts?: TankAlert[];
  tankAlertStates?: { [tankId: string]: TankAlertState };
  alertRecipients?: AlertRecipient[];
  tankAlertSettings?: { [tankId: string]: TankAlertSettings };
  emailNotifications?: EmailNotification[];
  userEmailConfigs?: UserEmailConfiguration[];
  pushSubscriptions?: PushSubscriptionRecord[];
  systemEmailSettings?: SystemEmailSettings;
}

export function toSafeSystemEmailSettings(settings: SystemEmailSettings): SafeSystemEmailSettings {
  const corporateHasEnvPass = Boolean(process.env.SMTP_PASSWORD && !process.env.SMTP_PASSWORD.startsWith('[CONFIGURAR'));
  const gmailHasEnvPass = Boolean(
    (process.env.GMAIL_SMTP_PASSWORD && !process.env.GMAIL_SMTP_PASSWORD.startsWith('[CONFIGURAR')) ||
    (settings.selectedProvider === 'gmail' && process.env.SMTP_PASSWORD && !process.env.SMTP_PASSWORD.startsWith('[CONFIGURAR'))
  );

  return {
    selectedProvider: settings.selectedProvider || 'corporate_hossidev',
    corporate: {
      fromName: settings.corporate?.fromName || 'water.report.@hossidev.com',
      fromAddress: settings.corporate?.fromAddress || 'water.report@hossidev.com',
      smtpHost: settings.corporate?.smtpHost || 'mail.hossidev.com',
      smtpPort: settings.corporate?.smtpPort || 465,
      security: settings.corporate?.security || 'SSL',
      secure: settings.corporate?.secure ?? true,
      smtpUser: settings.corporate?.smtpUser || 'water.report@hossidev.com',
      hasPassword: Boolean(settings.corporate?.encryptedSmtpPassword || corporateHasEnvPass),
      lastTestAt: settings.corporate?.lastTestAt || null,
      lastTestStatus: settings.corporate?.lastTestStatus || null,
      lastTestStage: settings.corporate?.lastTestStage,
      lastTestError: settings.corporate?.lastTestError || null,
      lastTestCategory: settings.corporate?.lastTestCategory,
      lastTestDetails: settings.corporate?.lastTestDetails || null,
      lastTestRecipient: settings.corporate?.lastTestRecipient || null,
      updatedAt: settings.corporate?.updatedAt || settings.updatedAt || new Date().toISOString(),
    },
    gmail: {
      fromName: settings.gmail?.fromName || 'Hossidev Water Monitor',
      fromAddress: settings.gmail?.fromAddress || 'etakizomba@gmail.com',
      smtpHost: settings.gmail?.smtpHost || 'smtp.gmail.com',
      smtpPort: settings.gmail?.smtpPort || 587,
      security: settings.gmail?.security || 'STARTTLS',
      secure: settings.gmail?.secure ?? false,
      smtpUser: settings.gmail?.smtpUser || 'etakizomba@gmail.com',
      hasPassword: Boolean(settings.gmail?.encryptedSmtpPassword || gmailHasEnvPass),
      lastTestAt: settings.gmail?.lastTestAt || null,
      lastTestStatus: settings.gmail?.lastTestStatus || null,
      lastTestStage: settings.gmail?.lastTestStage,
      lastTestError: settings.gmail?.lastTestError || null,
      lastTestCategory: settings.gmail?.lastTestCategory,
      lastTestDetails: settings.gmail?.lastTestDetails || null,
      lastTestRecipient: settings.gmail?.lastTestRecipient || null,
      updatedAt: settings.gmail?.updatedAt || settings.updatedAt || new Date().toISOString(),
    },
    updatedAt: settings.updatedAt || new Date().toISOString(),
    updatedBy: settings.updatedBy || null,
  };
}


const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const LATEST_BACKUP_FILE = path.join(BACKUPS_DIR, 'general_backup_latest.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating data directory:', err);
  }
}

// Initial Tank Definitions (Physical layout of Kizomba Condominium)
// Pre-populated with verified last known baseline readings so graphs and gauges are immediately full and functional
const INITIAL_TANKS_SCHEMA: DatabaseSchema['currentTanks'] = {
  1: {
    id: 1,
    name: 'Tanque FW1 (Tratada)',
    grid: '1/2',
    sector: 'filtrada',
    sectorName: 'Água Tratada',
    nodeId: 1,
    capacity_value: 20000,
    capacity_unit: 'L',
    capacityLiters: 20000,
    level: null,
    lastValidLevel: null,
    currentLiters: null,
    lastValidLiters: null,
    pump: 0,
    fault: 0,
    sensors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fault_mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    waterClass: 'Consumo Humano / Potável',
    lastUpdated: null,
    lastValidTimestamp: null,
    hasRealData: false,
    isStale: true,
  },
  2: {
    id: 2,
    name: 'Tanque FW2 (Tratada)',
    grid: '2/2',
    sector: 'filtrada',
    sectorName: 'Água Tratada',
    nodeId: 1,
    capacity_value: 20000,
    capacity_unit: 'L',
    capacityLiters: 20000,
    level: null,
    lastValidLevel: null,
    currentLiters: null,
    lastValidLiters: null,
    pump: 0,
    fault: 0,
    sensors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fault_mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    waterClass: 'Consumo Humano / Potável',
    lastUpdated: null,
    lastValidTimestamp: null,
    hasRealData: false,
    isStale: true,
  },
  3: {
    id: 3,
    name: 'Tanque RW1 (Pré-Tratada)',
    grid: '1/2',
    sector: 'nao-filtrada',
    sectorName: 'Água Pré-Tratada',
    nodeId: 2,
    capacity_value: 25000,
    capacity_unit: 'L',
    capacityLiters: 25000,
    level: null,
    lastValidLevel: null,
    currentLiters: null,
    lastValidLiters: null,
    pump: 0,
    fault: 0,
    sensors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fault_mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    waterClass: 'Uso Geral / Sanitários',
    lastUpdated: null,
    lastValidTimestamp: null,
    hasRealData: false,
    isStale: true,
  },
  4: {
    id: 4,
    name: 'Tanque RW2 (Pré-Tratada)',
    grid: '2/2',
    sector: 'nao-filtrada',
    sectorName: 'Água Pré-Tratada',
    nodeId: 2,
    capacity_value: 25000,
    capacity_unit: 'L',
    capacityLiters: 25000,
    level: null,
    lastValidLevel: null,
    currentLiters: null,
    lastValidLiters: null,
    pump: 0,
    fault: 0,
    sensors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fault_mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    waterClass: 'Uso Geral / Sanitários',
    lastUpdated: null,
    lastValidTimestamp: null,
    hasRealData: false,
    isStale: true,
  },
  5: {
    id: 5,
    name: 'Tanque WW1 (Bruta)',
    grid: '1/2',
    sector: 'bruta',
    sectorName: 'Água Bruta',
    nodeId: 3,
    capacity_value: 30000,
    capacity_unit: 'L',
    capacityLiters: 30000,
    level: null,
    lastValidLevel: null,
    currentLiters: null,
    lastValidLiters: null,
    pump: 0,
    fault: 0,
    sensors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fault_mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    waterClass: 'Captação Bruta / Poço',
    lastUpdated: null,
    lastValidTimestamp: null,
    hasRealData: false,
    isStale: true,
  },
  6: {
    id: 6,
    name: 'Tanque WW2 (Bruta)',
    grid: '2/2',
    sector: 'bruta',
    sectorName: 'Água Bruta',
    nodeId: 3,
    capacity_value: 30000,
    capacity_unit: 'L',
    capacityLiters: 30000,
    level: null,
    lastValidLevel: null,
    currentLiters: null,
    lastValidLiters: null,
    pump: 0,
    fault: 0,
    sensors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fault_mask: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    waterClass: 'Captação Bruta / Poço',
    lastUpdated: null,
    lastValidTimestamp: null,
    hasRealData: false,
    isStale: true,
  },
};

export const INITIAL_NODES_SCHEMA: DatabaseSchema['nodes'] = {
  node1: {
    id: 1,
    name: 'Placa 1 (Principal)',
    label: 'Água Filtrada (FW1 & FW2)',
    role: 'T1 & T2',
    busPort: 'UART 1 / USB',
    status: 'offline',
    communicationStatus: 'offline',
    lastPing: null,
    packetCount: 0,
  },
  node2: {
    id: 2,
    name: 'Placa 2 (Secundária 1)',
    label: 'Água Pré-Tratada (RW1 & RW2)',
    role: 'T3 & T4',
    busPort: 'UART 2 / Serial1',
    status: 'offline',
    communicationStatus: 'offline',
    lastPing: null,
    packetCount: 0,
  },
  node3: {
    id: 3,
    name: 'Placa 3 (Secundária 2)',
    label: 'Água Bruta (WW1 & WW2)',
    role: 'T5 & T6',
    busPort: 'UART 3 / Serial2',
    status: 'offline',
    communicationStatus: 'offline',
    lastPing: null,
    packetCount: 0,
  },
};

// Generates empty historical telemetry records; only real readings from Arduino/hardware are stored
export function generateSeedHistory(): TelemetryReadingRecord[] {
  return [];
}

let inMemoryDb: DatabaseSchema | null = null;

export function loadDb(): DatabaseSchema {
  if (inMemoryDb) return inMemoryDb;

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      inMemoryDb = JSON.parse(raw);

      // Verify watchdog on startup - check node responsiveness without wiping historical tank data
      const now = Date.now();
      const watchdogTimeout = inMemoryDb!.systemConfig?.watchdogTimeoutMs || 8000;

      for (const k of ['node1', 'node2', 'node3'] as const) {
        const node = inMemoryDb!.nodes[k];
        if (!node.lastPing || now - node.lastPing > watchdogTimeout) {
          node.status = 'offline';
          node.communicationStatus = 'offline';
        }
      }

      // Clean up any historical fake demonstration data from prior versions
      if (Array.isArray(inMemoryDb!.telemetryHistory)) {
        inMemoryDb!.telemetryHistory = inMemoryDb!.telemetryHistory.filter(
          (r: any) => r.source !== 'demo' && r.source !== 'manual_simulate' && r.source !== 'hardware_uart'
        );
      } else {
        inMemoryDb!.telemetryHistory = [];
      }

      // Preserve only real valid tank readings; never inject artificial numbers!
      for (const idStr of Object.keys(inMemoryDb!.currentTanks)) {
        const id = Number(idStr);
        const tank = inMemoryDb!.currentTanks[id];
        const nodeKey = `node${tank.nodeId}` as 'node1' | 'node2' | 'node3';
        const isNodeOffline = !inMemoryDb!.nodes[nodeKey] || inMemoryDb!.nodes[nodeKey].status === 'offline';
        tank.isStale = isNodeOffline;

        // Clean out legacy initial seed values (70, 60, 50, 40, 80, 60) that were not acquired from real hardware
        if (!tank.readingOrigin && (tank.level === 70 || tank.level === 60 || tank.level === 50 || tank.level === 40 || tank.level === 80)) {
          tank.level = null;
          tank.lastValidLevel = null;
          tank.currentLiters = null;
          tank.lastValidLiters = null;
          tank.sensors = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          tank.fault_mask = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          tank.pump = 0;
          tank.fault = 0;
          tank.hasRealData = false;
          tank.lastUpdated = null;
          tank.lastValidTimestamp = null;
          tank.isStale = true;
        } else if (tank.level !== null && tank.level !== undefined && (tank.lastValidLevel === undefined || tank.lastValidLevel === null)) {
          tank.lastValidLevel = tank.level;
          tank.lastValidTimestamp = tank.lastUpdated;
        }

        if (tank.alarm === undefined) tank.alarm = 0;
        if (tank.alarm_muted === undefined) tank.alarm_muted = 0;
      }

      // Normalize and protect all users
      if (Array.isArray(inMemoryDb!.users)) {
        for (const u of inMemoryDb!.users) {
          if (!Array.isArray(u.permittedTankIds)) {
            u.permittedTankIds = [1, 2, 3, 4, 5, 6];
          }
          u.active = u.active !== false;
          if (!Array.isArray(u.permissions)) {
            u.permissions = u.role === 'admin' ? ['*'] : ['tanks:read', 'telemetry:read'];
          }
          u.updatedAt = u.updatedAt || u.createdAt || new Date().toISOString();
          u.createdBy = u.createdBy || null;
          u.lastLoginAt = u.lastLoginAt || u.lastLogin || null;
        }
      } else {
        inMemoryDb!.users = [];
      }

      // Check secondary dedicated users file (users.json) to ensure zero data loss across rebuilds
      if (fs.existsSync(USERS_FILE)) {
        try {
          const rawUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
          if (Array.isArray(rawUsers) && rawUsers.length > 0) {
            for (const persistentUser of rawUsers) {
              const exists = inMemoryDb!.users.some((u) => u.id === persistentUser.id || u.username.toLowerCase() === persistentUser.username.toLowerCase());
              if (!exists) {
                inMemoryDb!.users.push({
                  ...persistentUser,
                  active: persistentUser.active !== false,
                  permissions: Array.isArray(persistentUser.permissions) ? persistentUser.permissions : (persistentUser.role === 'admin' ? ['*'] : ['tanks:read', 'telemetry:read']),
                  updatedAt: persistentUser.updatedAt || persistentUser.createdAt || new Date().toISOString(),
                });
              }
            }
          }
        } catch (uErr) {
          console.warn('[DB] Aviso ao sincronizar users.json:', uErr);
        }
      }

      // Ensure Alert structures exist
      inMemoryDb!.tankAlerts = inMemoryDb!.tankAlerts || [];
      inMemoryDb!.tankAlertStates = inMemoryDb!.tankAlertStates || {};
      inMemoryDb!.alertRecipients = inMemoryDb!.alertRecipients || [];
      inMemoryDb!.tankAlertSettings = inMemoryDb!.tankAlertSettings || {};
      inMemoryDb!.emailNotifications = inMemoryDb!.emailNotifications || [];
      inMemoryDb!.userEmailConfigs = inMemoryDb!.userEmailConfigs || [];
      inMemoryDb!.pushSubscriptions = inMemoryDb!.pushSubscriptions || [];

      if (!inMemoryDb!.systemEmailSettings) {
        const defaultProvider: EmailProviderType =
          (process.env.DEFAULT_EMAIL_PROVIDER as any) === 'gmail' ? 'gmail' : 'corporate_hossidev';
        const initialCorporatePass =
          process.env.SMTP_PASSWORD && !process.env.SMTP_PASSWORD.startsWith('[CONFIGURAR')
            ? encryptPassword(process.env.SMTP_PASSWORD)
            : null;
        const initialGmailPass =
          process.env.GMAIL_SMTP_PASSWORD && !process.env.GMAIL_SMTP_PASSWORD.startsWith('[CONFIGURAR')
            ? encryptPassword(process.env.GMAIL_SMTP_PASSWORD)
            : null;

        inMemoryDb!.systemEmailSettings = {
          selectedProvider: defaultProvider,
          corporate: {
            fromName: process.env.MAIL_FROM_NAME || 'water.report.@hossidev.com',
            fromAddress: process.env.MAIL_FROM_ADDRESS || 'water.report@hossidev.com',
            smtpHost: process.env.SMTP_HOST || 'mail.hossidev.com',
            smtpPort: Number(process.env.SMTP_PORT || 465),
            security: 'SSL',
            secure: true,
            smtpUser: process.env.SMTP_USER || 'water.report@hossidev.com',
            encryptedSmtpPassword: initialCorporatePass,
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
            encryptedSmtpPassword: initialGmailPass,
            lastTestAt: null,
            lastTestStatus: null,
            lastTestError: null,
            updatedAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
          updatedBy: 'system',
        };
      }

      // Ensure default settings for all 6 tanks
      for (let i = 1; i <= 6; i++) {
        const idStr = String(i);
        if (!inMemoryDb!.tankAlertSettings[idStr]) {
          inMemoryDb!.tankAlertSettings[idStr] = {
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
      }

      // Sync persistent users file on boot
      try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(inMemoryDb!.users, null, 2), 'utf-8');
      } catch {}

      return inMemoryDb!;
    } catch (e) {
      console.error('Error reading db.json, restoring defaults:', e);
    }
  }

  // Fallback: Check if dedicated users.json or latest backup exists before creating bare admin
  let recoveredUsers: UserRecord[] = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        recoveredUsers = parsed;
      }
    } catch {}
  }
  if (recoveredUsers.length === 0 && fs.existsSync(LATEST_BACKUP_FILE)) {
    try {
      const parsedBackup = JSON.parse(fs.readFileSync(LATEST_BACKUP_FILE, 'utf-8'));
      if (Array.isArray(parsedBackup.users) && parsedBackup.users.length > 0) {
        recoveredUsers = parsedBackup.users;
      }
    } catch {}
  }

  if (recoveredUsers.length === 0) {
    // Create default admin user: admin / admin123@Hossidev
    const defaultAdminSalt = bcrypt.genSaltSync(10);
    const defaultAdminHash = bcrypt.hashSync('admin123@Hossidev', defaultAdminSalt);
    recoveredUsers = [
      {
        id: crypto.randomUUID(),
        username: 'admin',
        name: 'Administrador Hossidev',
        email: 'admin@hossidev.com',
        passwordHash: defaultAdminHash,
        role: 'admin',
        active: true,
        permissions: ['*'],
        permittedTankIds: [1, 2, 3, 4, 5, 6],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  const initialDb: DatabaseSchema = {
    users: recoveredUsers,
    currentTanks: INITIAL_TANKS_SCHEMA,
    nodes: INITIAL_NODES_SCHEMA,
    telemetryHistory: generateSeedHistory(),
    logs: [
      {
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString(),
        type: 'system',
        text: 'Servidor Hossidev Water Monitor inicializado em modo de produção real. Base de utilizadores preservada.',
      },
    ],
    systemConfig: {
      audioAlarmEnabled: true,
      emergencyLockout: false,
      watchdogTimeoutMs: 8000,
      dailyConsumptionEstimateLiters: 28000,
      lowLevelAlertPercentage: 20,
      criticalLevelAlertPercentage: 10,
      condominiumName: 'Condomínio Residencial Kizomba',
    },
    tankAlerts: [],
    tankAlertStates: {},
    alertRecipients: [],
    tankAlertSettings: {},
    emailNotifications: [],
    userEmailConfigs: [],
    pushSubscriptions: [],
    systemEmailSettings: {
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
    },
  };


  inMemoryDb = initialDb;
  saveDb(true);
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(inMemoryDb.users, null, 2), 'utf-8');
  } catch {}
  return inMemoryDb;
}

let saveDbTimer: NodeJS.Timeout | null = null;

export function flushDb(): void {
  if (saveDbTimer) {
    clearTimeout(saveDbTimer);
    saveDbTimer = null;
  }
  if (!inMemoryDb) return;
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(inMemoryDb), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);

    // Save users file atomically
    if (Array.isArray(inMemoryDb.users) && inMemoryDb.users.length > 0) {
      const usersTemp = `${USERS_FILE}.tmp`;
      fs.writeFileSync(usersTemp, JSON.stringify(inMemoryDb.users, null, 2), 'utf-8');
      fs.renameSync(usersTemp, USERS_FILE);
    }
  } catch (err) {
    console.error('Error saving db.json / users.json:', err);
  }
}

export function saveUsersDurable(users: UserRecord[]): void {
  if (inMemoryDb) {
    inMemoryDb.users = users;
  }
  try {
    const usersTemp = `${USERS_FILE}.tmp`;
    fs.writeFileSync(usersTemp, JSON.stringify(users, null, 2), 'utf-8');
    fs.renameSync(usersTemp, USERS_FILE);
  } catch (err) {
    console.error('Error saving users.json:', err);
  }
  saveDb(true);
}

export function saveDb(immediate: boolean = false): void {
  if (!inMemoryDb) return;
  if (immediate) {
    flushDb();
    return;
  }
  if (!saveDbTimer) {
    saveDbTimer = setTimeout(() => {
      saveDbTimer = null;
      flushDb();
    }, 1000);
  }
}

export function restoreDb(importedData: any): { success: boolean; message: string; stats?: any } {
  if (!importedData || typeof importedData !== 'object') {
    throw new Error('Formato de dados de backup inválido.');
  }

  // Validate core schema
  if (!Array.isArray(importedData.users) || importedData.users.length === 0) {
    throw new Error('O arquivo de backup não contém usuários válidos.');
  }

  if (!importedData.currentTanks || typeof importedData.currentTanks !== 'object') {
    throw new Error('O arquivo de backup não contém a estrutura dos reservatórios.');
  }

  // Ensure default system config fallback
  const validConfig = {
    audioAlarmEnabled: Boolean(importedData.systemConfig?.audioAlarmEnabled ?? true),
    emergencyLockout: Boolean(importedData.systemConfig?.emergencyLockout ?? false),
    watchdogTimeoutMs: Number(importedData.systemConfig?.watchdogTimeoutMs || 8000),
    dailyConsumptionEstimateLiters: Number(importedData.systemConfig?.dailyConsumptionEstimateLiters || 28000),
    lowLevelAlertPercentage: Number(importedData.systemConfig?.lowLevelAlertPercentage || 20),
    criticalLevelAlertPercentage: Number(importedData.systemConfig?.criticalLevelAlertPercentage || 10),
    condominiumName: importedData.systemConfig?.condominiumName || 'Condomínio Residencial Kizomba',
    lastBackupAt: new Date().toISOString(),
  };

  // Ensure currentTanks have complete properties
  const restoredTanks: DatabaseSchema['currentTanks'] = {};
  for (const idStr of Object.keys(importedData.currentTanks)) {
    const id = Number(idStr);
    const importedTank = importedData.currentTanks[id];
    const defaultDef = INITIAL_TANKS_SCHEMA[id];
    restoredTanks[id] = {
      ...(defaultDef || {}),
      ...importedTank,
      lastValidLevel: importedTank.lastValidLevel ?? importedTank.level ?? defaultDef?.lastValidLevel ?? 50,
      lastValidLiters: importedTank.lastValidLiters ?? importedTank.currentLiters ?? defaultDef?.lastValidLiters,
      lastValidTimestamp: importedTank.lastValidTimestamp ?? importedTank.lastUpdated ?? Date.now(),
      hasRealData: importedTank.hasRealData ?? true,
    };
  }

  // Ensure nodes schema fallback
  const restoredNodes: DatabaseSchema['nodes'] = {
    node1: importedData.nodes?.node1 || INITIAL_NODES_SCHEMA.node1,
    node2: importedData.nodes?.node2 || INITIAL_NODES_SCHEMA.node2,
    node3: importedData.nodes?.node3 || INITIAL_NODES_SCHEMA.node3,
  };

  inMemoryDb = {
    users: importedData.users,
    currentTanks: restoredTanks,
    nodes: restoredNodes,
    telemetryHistory: Array.isArray(importedData.telemetryHistory) ? importedData.telemetryHistory : generateSeedHistory(),
    logs: Array.isArray(importedData.logs) ? importedData.logs : [],
    systemConfig: validConfig,
  };

  // Add system restore log
  inMemoryDb.logs.push({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    type: 'system',
    text: `Backup completo restaurado com sucesso. ${inMemoryDb.users.length} usuários, ${inMemoryDb.telemetryHistory.length} registros históricos.`,
  });

  saveDb(true);

  return {
    success: true,
    message: 'Banco de dados restaurado com sucesso.',
    stats: {
      usersCount: inMemoryDb.users.length,
      historyCount: inMemoryDb.telemetryHistory.length,
      logsCount: inMemoryDb.logs.length,
      timestamp: new Date().toISOString(),
    },
  };
}

export function getDbStats(): {
  fileSizeBytes: number;
  usersCount: number;
  historyCount: number;
  logsCount: number;
  lastBackupAt?: string;
  uptimeSeconds: number;
} {
  const db = loadDb();
  let fileSize = 0;
  try {
    if (fs.existsSync(DB_FILE)) {
      const stats = fs.statSync(DB_FILE);
      fileSize = stats.size;
    }
  } catch (e) {
    fileSize = 0;
  }

  return {
    fileSizeBytes: fileSize,
    usersCount: db.users.length,
    historyCount: db.telemetryHistory.length,
    logsCount: db.logs.length,
    lastBackupAt: db.systemConfig.lastBackupAt,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}


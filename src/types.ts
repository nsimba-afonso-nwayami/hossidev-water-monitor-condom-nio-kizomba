export type SectorType = 'filtrada' | 'nao-filtrada' | 'bruta';
export type CapacityUnit = 'L' | 'm3' | 'gal';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  permittedTankIds: number[];
  assignedTankIds?: number[];
  active?: boolean;
  permissions?: string[];
}

export interface StoredSession {
  token: string;
  user: AuthUser;
  userId: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  assignedTankIds: number[];
  permittedTankIds: number[];
  rememberMe: boolean;
  loginTimestamp: number;
  expiresAt: number;
}

export type BoardCommunicationStatus =
  | 'online'
  | 'sem resposta temporária'
  | 'reconectando'
  | 'offline'
  | 'erro'
  | 'desconhecido';

export type BoardId = 'PRINCIPAL' | 'PLACA2' | 'PLACA3';

export type BoardStatus = 'online' | 'offline' | 'reconnecting' | 'unknown' | 'error';

export interface BoardState {
  id: BoardId;
  name: string;
  status: BoardStatus;
  lastMessageAt: string | null;
  lastDataAt: string | null;
  lastHeartbeatAt: string | null;
  bootCounter: number | null;
  lastSequence: number | null;
  lastError: string | null;
  reconnectAttempts: number;
  payload: unknown;
}

export interface BoardsMap {
  PRINCIPAL: BoardState;
  PLACA2: BoardState;
  PLACA3: BoardState;
}

export interface RebootEventRecord {
  id: string;
  timestamp: number;
  timeStr: string;
  board: BoardId;
  previousBoot: number | null;
  newBoot: number;
  lastReadingSummary?: string;
  communicationStatus: BoardStatus;
}

export interface TankState {
  id: number;
  name: string;
  level: number | null;
  pump: boolean | null;
  fault: boolean | null;
  sensors: number[];
  faultMask: number[];
  sourceBoard: BoardId;
  lastValidReadingAt: string | null;
  isStale: boolean;
  dataSource: 'live' | 'local-cache' | 'previous';
}

export interface BoardHealthRecord {
  status: BoardCommunicationStatus;
  lastDataAt: number | null;
  lastHeartbeatAt: number | null;
  lastError: string | null;
  reconnectAttempts: number;
  consecutiveMissedHeartbeats?: number;
  lastSeq?: number;
  bootCounter?: number | null;
}

export interface SystemBoardStatuses {
  placaPrincipal: BoardHealthRecord;
  placa2: BoardHealthRecord;
  placa3: BoardHealthRecord;
}

export interface TankData {
  id: number;
  name: string;
  grid: string;
  sector: SectorType;
  sectorName: string;
  nodeId: number;
  capacity_value?: number | null; // Optional: numeric capacity value
  capacity_unit?: CapacityUnit | null; // Optional: unit ('L', 'm3', 'gal')
  capacityLiters: number | null; // null when in 'Modo Percentual' (unconfigured)
  level: number | null; // null when no real reading received yet
  lastValidLevel?: number | null; // Preserved last valid level (0-100%)
  lastValidLiters?: number | null; // Preserved last valid volume in Liters
  lastValidTimestamp?: number | null; // Timestamp of last valid reading
  isStale?: boolean; // True when board loses communication but data is retained
  readingOrigin?: 'online' | 'local_serial' | 'cached' | 'hardware_uart';
  boardStatus?: BoardCommunicationStatus;
  boardName?: string;
  sourceBoard?: BoardId;
  reconnectStatus?: string;
  pump: number; // 0: OFF, 1: ON / Enchendo
  alarm?: number | boolean; // 0: OFF, 1: ON (sirene física tocando)
  alarm_muted?: number | boolean; // 0: Não silenciada, 1: Silenciada pelo operador
  alarmStatus?: 'ATIVA' | 'SILENCIADA' | 'EM ESPERA' | 'DESLIGADA POR NÍVEL RECUPERADO' | 'SEM COMUNICAÇÃO';
  fault: number; // 0: OK, 1: Fault detected
  sensors: number[]; // 10 elements (0: dry, 1: wet)
  fault_mask: number[]; // 10 elements (0: ok, 1: faulty)
  waterClass: string;
  lastUpdated?: number | null;
  hasRealData: boolean;
  currentLiters?: number | null;
  flowRateLpm?: number;
  assignedUsers?: Array<{ id: string; username: string; name: string }>;
  bootCounter?: number | null;
  dataSource?: 'live' | 'local-cache' | 'previous';
  lastValidReadingAt?: string | null;
}

export interface AlarmCommandResult {
  type: 'ALARM_COMMAND_RESULT';
  tank: number;
  action: 'ON' | 'OFF';
  ok: boolean;
  reason?: 'APPLIED' | 'SENT_TO_SLAVE' | string;
  error?: string;
  timestamp?: number;
}

export interface NodeStatus {
  id: number;
  name: string;
  label: string;
  role: string;
  busPort: string;
  status: 'online' | 'offline';
  communicationStatus?: BoardCommunicationStatus;
  lastPing: number | null;
  packetCount: number;
  tanks?: TankData[];
}

export interface SystemData {
  device: string;
  uptime: number;
  totalPackets: number;
  lastReceivedTime: number | null;
  isSerialConnected: boolean;
  isOnline: boolean;
  globalFaultCount: number;
  audioAlarmEnabled: boolean;
  emergencyLockout: boolean;
  nodes: {
    node1: NodeStatus;
    node2: NodeStatus;
    node3: NodeStatus;
  };
  boardStatuses?: SystemBoardStatuses;
  boards?: BoardsMap;
}

export interface LogItem {
  id: string;
  time: string;
  type: 'rx' | 'tx' | 'alarm' | 'system' | 'fault';
  nodeId?: number;
  text: string;
  rawJson?: string;
}

export interface HistoricalDataPoint {
  id?: string;
  time: string;
  timestamp: number;
  tankId?: number;
  level: number;
  pump: number;
  sensors?: number[];
  fault?: number;
  totalLiters?: number;
  source?: string;
}

export interface CondominiumMetrics {
  totalCapacityLiters: number;
  currentTotalLiters: number;
  totalPercentage: number;
  activePumps: number;
  totalFaultySensors: number;
  estimatedAutonomyHours: number;
  dailyConsumptionEstimateLiters: number;
}

export interface UserManagementItem {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  permittedTankIds: number[];
  active?: boolean;
  permissions?: string[];
  createdAt: string;
  updatedAt?: string;
  createdBy?: string | null;
  lastLogin?: string;
  lastLoginAt?: string | null;
}

// ==========================================
// OFFLINE-FIRST ARCHITECTURE TYPES
// ==========================================

export interface LocalUserRecord {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  permittedTankIds: number[];
  passwordSalt: string;
  passwordHash: string; // SHA-256 (password + salt), never plaintext
  token: string;
  active: boolean;
  firstOnlineLogin: string;
  lastOnlineLogin: string;
  lastOfflineLogin?: string | null;
  lastAccess: string;
  updatedAt: string;
}

export interface LocalTankRecord {
  id: number;
  name: string;
  grid: string;
  sector: SectorType;
  sectorName: string;
  nodeId: number;
  capacity_value?: number | null;
  capacity_unit?: CapacityUnit | null;
  capacityLiters: number | null;
  level: number | null;
  currentLiters?: number | null;
  pump: number;
  fault: number;
  sensors: number[];
  fault_mask: number[];
  waterClass: string;
  lastUpdated?: number | null;
  hasRealData: boolean;
  synced: boolean;
  readingOrigin: 'online' | 'local_serial' | 'cached';
  version: number;
  updatedAt: string;
}

export interface LocalReadingRecord {
  id: string; // UUID
  tankId: number;
  nodeId: number;
  level: number;
  currentLiters: number | null;
  capacityLiters: number | null;
  pump: number;
  fault: number;
  sensors: number[];
  fault_mask: number[];
  timestamp: number;
  isoTime: string;
  source: 'serial_bridge' | 'http_ingest' | 'manual_simulate' | 'online_sync';
  synced: boolean;
  createdAt: string;
}

export interface LocalEventRecord {
  id: string;
  tankId?: number;
  type: 'login' | 'logout' | 'pump_command' | 'emergency_stop' | 'config_change' | 'fault' | 'sync' | 'alarm' | 'alarm_command';
  description: string;
  userId: string;
  userName: string;
  eventDate: string;
  timestamp: number;
  origin: 'local' | 'remote';
  synced: boolean;
}

export type OperationType =
  | 'ingest_telemetry'
  | 'pump_command'
  | 'alarm_command'
  | 'emergency_stop'
  | 'update_tank_config'
  | 'log_event';

export type OperationStatus = 'pending' | 'syncing' | 'failed' | 'completed';

export interface PendingOperation {
  id: string; // Unique idempotent UUID
  tipoOperacao: OperationType;
  entidade: 'tank' | 'telemetry' | 'system' | 'event';
  entidadeId: string | number;
  dados: any;
  criadoEm: string;
  atualizadoEm: string;
  tentativas: number;
  últimoErro?: string | null;
  estado: OperationStatus;
}

export interface LocalConfigRecord {
  chave: string;
  valor: any;
  atualizadoEm: string;
}

export interface AuthSessionRecord {
  userId: string;
  username: string;
  localSessionId: string;
  expiresAt: number;
  lastOnlineLogin: string;
  lastOfflineLogin: string | null;
  permittedTankIds: number[];
  deviceId: string;
}

export type SyncStateName =
  | 'online'
  | 'offline'
  | 'sincronizando'
  | 'sincronizado'
  | 'pendente'
  | 'erro'
  | 'servidorIndisponivel'
  | 'sessaoExpirada';

export interface SyncOverview {
  state: SyncStateName;
  isOnline: boolean; // browser navigator.onLine
  isServerReachable: boolean; // ping to /api/health succeeded
  isSerialConnected: boolean; // Web Serial USB active
  lastSyncTime: number | null;
  pendingCount: number;
  failedCount: number;
  lastError: string | null;
  pingMs?: number;
}

// ==========================================
// USB SERIAL MANAGER TYPES
// ==========================================

export type UsbSerialConnectionState =
  | 'idle'
  | 'requestingPermission'
  | 'connecting'
  | 'connected'
  | 'reading'
  | 'reconnecting'
  | 'disconnected'
  | 'intentionalDisconnect'
  | 'error'
  | 'waitingForDevice'
  | 'unauthorized'
  | 'busy';

export interface UsbDeviceConfig {
  deviceId: string;
  friendlyName: string;
  usbVendorId?: number;
  usbProductId?: number;
  serialNumber?: string;
  manufacturer?: string;
  productName?: string;
  baudRate: number;
  dataBits: 7 | 8;
  parity: 'none' | 'even' | 'odd';
  stopBits: 1 | 2;
  flowControl: 'none' | 'hardware';
  lastConnectedAt?: string;
  autoReconnect: boolean;
}

export interface SerialDiagnosticsMetrics {
  totalPacketsReceived: number;
  totalPacketsInvalid: number;
  reconnectCount: number;
  readErrorCount: number;
  writeErrorCount: number;
  lastMessageTime: number | null;
  lastHeartbeatTime: number | null;
  lastHeartbeatStatus: 'ok' | 'timeout' | 'none';
  lastCommandSent?: string | null;
  lastCommandResult?: 'success' | 'failed' | 'timeout' | null;
  lastLatencyMs?: number | null;
  reconnectAttempt: number;
  nextReconnectInSec?: number | null;
  activePortInfo?: {
    usbVendorId?: number;
    usbProductId?: number;
    displayName: string;
  } | null;
  lastErrorText?: string | null;
  lastRawMessage?: string | null;
  lastMessageAt?: string | null;
  lastSequence?: number | null;
  uptimeSeconds?: number | null;
  bootCountPlaca2?: number | null;
  bootCountPlaca3?: number | null;
  invalidJsonCount?: number;
  timeoutCount?: number;
  rebootsDetectedCount?: number;
  rebootHistory?: RebootEventRecord[];
}

export interface SerialCommandRecord {
  id: string;
  command: string;
  tankId?: number;
  nodeId?: number;
  userId?: string;
  userName?: string;
  timestamp: number;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'timeout';
  attempt: number;
  result?: string;
  isPumpCommand?: boolean;
  isAlarmCommand?: boolean;
}

// ==========================================
// LOW WATER LEVEL ALERT & NOTIFICATION TYPES
// ==========================================

export type AlertType =
  | 'LOW_WATER_LEVEL'
  | 'SENSOR_FAULT'
  | 'BOARD_OFFLINE'
  | 'COMMUNICATION_ERROR';

export type AlertStatus =
  | 'active'
  | 'acknowledged'
  | 'resolved'
  | 'failed';

export interface TankAlertSettings {
  tankId: string;
  lowLevelThresholdPercent: number; // Default: 30
  rearmThresholdPercent: number; // Default: 35
  notificationsEnabled: boolean;
  emailEnabled: boolean;
  soundEnabled: boolean;
  popupEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AlertRecipient {
  id: string;
  tankId: string | null; // null: global recipient, or specific tank e.g. "1", "2"
  name: string | null;
  email: string | null;
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface TankAlert {
  id: string;
  idempotencyKey: string;
  tankId: string;
  tankName: string;
  sourceBoard: string;
  type: AlertType;
  status: AlertStatus;

  thresholdPercent: number;
  resetThresholdPercent: number;
  levelAtTrigger: number;

  triggeredAt: string;
  lastValidReadingAt: string | null;

  acknowledgedAt: string | null;
  acknowledgedBy: string | null;

  resolvedAt: string | null;
  resolvedReason: string | null;

  activeCycleNumber: number;

  selectedRecipientId: string | null;
  selectedRecipientName: string | null;

  popupShownAt: string | null;
  soundPlayedAt: string | null;
  soundSilencedAt: string | null;
  soundSilencedBy: string | null;

  emailNotificationStatus:
    | 'not_applicable'
    | 'pending'
    | 'queued'
    | 'sent'
    | 'delivered'
    | 'failed'
    | 'not_sent_offline';

  createdAt: string;
  updatedAt: string;
}

export interface TankAlertState {
  tankId: string;
  isLowLevelArmed: boolean;
  activeAlertId: string | null;
  activeCycleNumber: number;
  lastLevel: number | null;
  lastAlertAt: string | null;
  recoveredAt: string | null;
  nextRecipientIndex: number;
  updatedAt: string;
}

export type EmailStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'not_sent_offline'
  | 'cancelled';

export interface EmailNotification {
  id: string;
  alertId: string;
  senderUserId?: string;
  recipientId: string;
  senderEmailMasked?: string;
  recipientEmailMasked?: string;
  subject: string;
  providerMessageId: string | null;
  status: EmailStatus;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;

  // Additional fields for display & audit
  idempotencyKey?: string;
  tankId?: string;
  recipientName?: string | null;
  senderEmail?: string;
  emailMasked?: string;
  provider?: string | null;
  bodyPreview?: string;
  queuedAt?: string | null;
  failedAt?: string | null;
}

// User-specific SMTP Configuration
export interface UserSmtpConfiguration {
  id: string;
  userId: string;

  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  encryptedSmtpPassword: string | null;
  mailFrom: string;

  security?: 'STARTTLS' | 'SSL' | 'NONE';
  secure: boolean;
  requireTls: boolean;
  enabled: boolean;

  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestError: string | null;

  createdAt: string;
  updatedAt: string;
}

export type UserEmailConfiguration = UserSmtpConfiguration;

// Safe version exposed via API to frontend (never reveals password)
export interface SafeUserSmtpConfiguration {
  id: string;
  userId: string;

  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  hasPassword: boolean;
  mailFrom: string;

  security?: 'STARTTLS' | 'SSL' | 'NONE';
  secure: boolean;
  requireTls: boolean;
  enabled: boolean;

  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestError: string | null;

  createdAt: string;
  updatedAt: string;
}

export type SafeUserEmailConfiguration = SafeUserSmtpConfiguration;

// Web Push Subscription
export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  permissionStatus: 'granted' | 'denied' | 'default';
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  updatedAt: string;
}

// ==========================================
// SYSTEM-WIDE EMAIL & CORPORATE SMTP TYPES
// ==========================================

export type EmailProviderType = 'gmail' | 'corporate_hossidev';

export type SmtpTestStage =
  | 'saved'
  | 'auth_validated'
  | 'accepted_by_smtp'
  | 'failed'
  | 'delivered';

export type SmtpErrorCategory =
  | 'AUTENTICACAO'
  | 'LIGACAO_TIMEOUT'
  | 'CERTIFICADO_TLS'
  | 'REMETENTE_NAO_AUTORIZADO'
  | 'DESTINATARIO_INVALIDO'
  | 'ERRO_SMTP_GERAL';

export interface CorporateEmailConfig {
  fromName: string; // Ex: "water.report.@hossidev.com"
  fromAddress: string; // Ex: "water.report@hossidev.com"
  smtpHost: string; // Ex: "mail.hossidev.com"
  smtpPort: number; // 465
  security: 'SSL' | 'STARTTLS';
  secure: boolean;
  smtpUser: string; // Ex: "water.report@hossidev.com"
  encryptedSmtpPassword: string | null;
  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestStage?: SmtpTestStage;
  lastTestError: string | null;
  lastTestCategory?: SmtpErrorCategory;
  lastTestDetails?: string | null;
  lastTestRecipient?: string | null;
  updatedAt: string;
}

export interface GmailEmailConfig {
  fromName: string; // Ex: "Hossidev Water Monitor"
  fromAddress: string; // Ex: "etakizomba@gmail.com"
  smtpHost: string; // Ex: "smtp.gmail.com"
  smtpPort: number; // 587
  security: 'STARTTLS' | 'SSL';
  secure: boolean;
  smtpUser: string; // Ex: "etakizomba@gmail.com"
  encryptedSmtpPassword: string | null;
  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestStage?: SmtpTestStage;
  lastTestError: string | null;
  lastTestCategory?: SmtpErrorCategory;
  lastTestDetails?: string | null;
  lastTestRecipient?: string | null;
  updatedAt: string;
}

export interface SystemEmailSettings {
  selectedProvider: EmailProviderType;
  corporate: CorporateEmailConfig;
  gmail: GmailEmailConfig;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface SafeCorporateEmailConfig extends Omit<CorporateEmailConfig, 'encryptedSmtpPassword'> {
  hasPassword: boolean;
}

export interface SafeGmailEmailConfig extends Omit<GmailEmailConfig, 'encryptedSmtpPassword'> {
  hasPassword: boolean;
}

export interface SafeSystemEmailSettings {
  selectedProvider: EmailProviderType;
  corporate: SafeCorporateEmailConfig;
  gmail: SafeGmailEmailConfig;
  updatedAt: string;
  updatedBy?: string | null;
}



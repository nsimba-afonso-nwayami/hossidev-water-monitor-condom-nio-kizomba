import {
  UsbSerialConnectionState,
  UsbDeviceConfig,
  SerialDiagnosticsMetrics,
  SerialCommandRecord,
  SystemBoardStatuses,
  BoardHealthRecord,
  BoardCommunicationStatus,
  AlarmCommandResult,
} from '../types';
import { dbService } from '../db/localDb';

type StateListener = (state: UsbSerialConnectionState) => void;
type TelemetryListener = (data: any) => void;
type AlarmResultListener = (result: AlarmCommandResult) => void;
type LogListener = (log: { type: 'rx' | 'tx' | 'fault' | 'system'; text: string; rawJson?: string }) => void;
type MetricsListener = (metrics: SerialDiagnosticsMetrics) => void;
type BoardStatusListener = (statuses: SystemBoardStatuses) => void;

const STORAGE_KEY_CONFIG = 'hossidev_usb_device_config';
const BACKOFF_DELAYS = [1000, 2000, 5000, 10000, 30000]; // 1s, 2s, 5s, 10s, 30s
const MAX_FAST_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL_MS = 2000; // 2s heartbeat cycle
const HEARTBEAT_TIMEOUT_MS = 3000; // 3s response timeout
const NO_DATA_TIMEOUT_MS = 15000;

function calculateCrc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export class UsbSerialManager {
  private static instance: UsbSerialManager;

  private state: UsbSerialConnectionState = 'idle';
  private port: any = null; // SerialPort
  private reader: any = null; // ReadableStreamDefaultReader
  private writer: any = null; // WritableStreamDefaultWriter
  private sessionToken: number = 0;
  private isClosing: boolean = false;
  private isOpening: boolean = false;
  private isIntentionalDisconnect: boolean = false;

  private reconnectTimer: any = null;
  private countdownTimer: any = null;
  private heartbeatTimer: any = null;
  private lastPingSentAt: number | null = null;
  private noDataTimer: any = null;

  private reconnectAttempt: number = 0;
  private nextReconnectInSec: number | null = null;

  // Configuration
  private config: UsbDeviceConfig = {
    deviceId: 'placa-1',
    friendlyName: 'Placa 1 - Barramento Mestre USB',
    baudRate: 115200,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    flowControl: 'none',
    autoReconnect: true,
  };

  // Metrics
  private metrics: SerialDiagnosticsMetrics = {
    totalPacketsReceived: 0,
    totalPacketsInvalid: 0,
    reconnectCount: 0,
    readErrorCount: 0,
    writeErrorCount: 0,
    lastMessageTime: null,
    lastHeartbeatTime: null,
    lastHeartbeatStatus: 'none',
    lastCommandSent: null,
    lastCommandResult: null,
    lastLatencyMs: null,
    reconnectAttempt: 0,
    nextReconnectInSec: null,
    activePortInfo: null,
    lastErrorText: null,
  };

  // Independent Board Communication State
  private boardStatuses: SystemBoardStatuses = {
    placaPrincipal: {
      status: 'offline',
      lastDataAt: null,
      lastHeartbeatAt: null,
      lastError: null,
      reconnectAttempts: 0,
      consecutiveMissedHeartbeats: 0,
    },
    placa2: {
      status: 'offline',
      lastDataAt: null,
      lastHeartbeatAt: null,
      lastError: null,
      reconnectAttempts: 0,
      consecutiveMissedHeartbeats: 0,
    },
    placa3: {
      status: 'offline',
      lastDataAt: null,
      lastHeartbeatAt: null,
      lastError: null,
      reconnectAttempts: 0,
      consecutiveMissedHeartbeats: 0,
    },
  };

  private currentSeq: number = 100;

  // Command Queue
  private commandQueue: Array<{
    record: SerialCommandRecord;
    resolve: (val: boolean) => void;
  }> = [];
  private isProcessingQueue: boolean = false;

  // Listeners
  private stateListeners = new Set<StateListener>();
  private telemetryListeners = new Set<TelemetryListener>();
  private logListeners = new Set<LogListener>();
  private metricsListeners = new Set<MetricsListener>();
  private boardStatusListeners = new Set<BoardStatusListener>();
  private alarmResultListeners = new Set<AlarmResultListener>();

  private constructor() {
    this.loadSavedConfig();
    this.setupWebSerialEventListeners();
  }

  public static getInstance(): UsbSerialManager {
    if (!UsbSerialManager.instance) {
      UsbSerialManager.instance = new UsbSerialManager();
    }
    return UsbSerialManager.instance;
  }

  // --- CONFIGURATION PERSISTENCE ---

  private loadSavedConfig(): void {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.config = { ...this.config, ...parsed };
        }
      }
    } catch (e) {
      console.warn('[UsbSerialManager] Erro ao carregar config:', e);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
      }
      await dbService.setLocalConfig(STORAGE_KEY_CONFIG, this.config);
    } catch (e) {
      console.warn('[UsbSerialManager] Erro ao salvar config:', e);
    }
  }

  public updateConfig(newConfig: Partial<UsbDeviceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    this.notifyMetrics();
  }

  public getConfig(): UsbDeviceConfig {
    return { ...this.config };
  }

  public forgetSavedDevice(): void {
    this.config.usbVendorId = undefined;
    this.config.usbProductId = undefined;
    this.config.serialNumber = undefined;
    this.config.lastConnectedAt = undefined;
    this.metrics.activePortInfo = null;
    this.saveConfig();
    this.notifyLog('system', 'Dispositivo USB esquecido da memória do navegador.');
    this.notifyMetrics();
  }

  // --- BROWSER / NATIVE EVENTS ---

  private setupWebSerialEventListeners(): void {
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      // Connect Event: Triggered when a physical USB port is plugged into the machine
      // @ts-ignore
      navigator.serial.addEventListener('connect', async (event: any) => {
        const port = event.target;
        const portInfo = port?.getInfo ? port.getInfo() : {};
        this.notifyLog(
          'system',
          `[USB Plug] Dispositivo USB plugado: VID=0x${(portInfo.usbVendorId || 0).toString(16)} PID=0x${(portInfo.usbProductId || 0).toString(16)}`
        );

        // If we are waiting for this device or in disconnected state without intentional disconnect, auto-connect!
        if (
          !this.isIntentionalDisconnect &&
          this.config.autoReconnect &&
          (this.state === 'disconnected' ||
            this.state === 'waitingForDevice' ||
            this.state === 'error' ||
            this.state === 'idle')
        ) {
          const match = this.matchesSavedDevice(portInfo);
          if (match || !this.config.usbVendorId) {
            this.notifyLog('system', 'Dispositivo reconhecido correspondente à central. Iniciando conexão automática...');
            this.connectPort(port);
          }
        }
      });

      // Disconnect Event: Triggered when physical USB cable is pulled out
      // @ts-ignore
      navigator.serial.addEventListener('disconnect', async (event: any) => {
        this.notifyLog('fault', 'Dispositivo USB foi desconectado fisicamente do computador.');
        this.metrics.readErrorCount++;
        this.metrics.lastErrorText = 'Cabo USB desconectado fisicamente';

        if (this.state === 'connected' || this.state === 'reading' || this.state === 'connecting') {
          // Unintentional disconnect! Clean up locks and initiate auto-reconnect policy
          await this.closeConnection(false);
          this.startAutoReconnect('Cabo USB desconectado fisicamente');
        }
      });
    }
  }

  private matchesSavedDevice(portInfo: any): boolean {
    if (!portInfo) return false;
    if (this.config.usbVendorId && portInfo.usbVendorId) {
      if (this.config.usbVendorId !== portInfo.usbVendorId) return false;
    }
    if (this.config.usbProductId && portInfo.usbProductId) {
      if (this.config.usbProductId !== portInfo.usbProductId) return false;
    }
    return true;
  }

  // --- SUBSCRIPTIONS ---

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  public subscribeLogs(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  public subscribeMetrics(listener: MetricsListener): () => void {
    this.metricsListeners.add(listener);
    listener(this.getMetrics());
    return () => this.metricsListeners.delete(listener);
  }

  public subscribeBoardStatuses(listener: BoardStatusListener): () => void {
    this.boardStatusListeners.add(listener);
    listener(this.getBoardStatuses());
    return () => this.boardStatusListeners.delete(listener);
  }

  public subscribeAlarmResult(listener: AlarmResultListener): () => void {
    this.alarmResultListeners.add(listener);
    return () => this.alarmResultListeners.delete(listener);
  }

  public getBoardStatuses(): SystemBoardStatuses {
    return {
      placaPrincipal: { ...this.boardStatuses.placaPrincipal },
      placa2: { ...this.boardStatuses.placa2 },
      placa3: { ...this.boardStatuses.placa3 },
    };
  }

  private notifyBoardStatuses(): void {
    const copy = this.getBoardStatuses();
    this.boardStatusListeners.forEach((fn) => fn(copy));
  }

  private setState(newState: UsbSerialConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach((fn) => fn(newState));
      this.notifyMetrics();
    }
  }

  private notifyLog(type: 'rx' | 'tx' | 'fault' | 'system', text: string, rawJson?: string): void {
    this.logListeners.forEach((fn) => fn({ type, text, rawJson }));
  }

  private notifyMetrics(): void {
    const m = this.getMetrics();
    this.metricsListeners.forEach((fn) => fn(m));
  }

  public getState(): UsbSerialConnectionState {
    return this.state;
  }

  public getMetrics(): SerialDiagnosticsMetrics {
    return {
      ...this.metrics,
      reconnectAttempt: this.reconnectAttempt,
      nextReconnectInSec: this.nextReconnectInSec,
    };
  }

  // --- CONNECT / RECONNECT LOGIC ---

  /**
   * Request user permission for a new port and open connection.
   */
  public async requestAndConnect(baudRate?: number): Promise<boolean> {
    if (this.isOpening || this.state === 'connecting') {
      this.notifyLog('system', 'Tentativa de conexão já em andamento. Aguarde.');
      return false;
    }

    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      this.setState('unauthorized');
      this.notifyLog('fault', 'Web Serial API não é suportada neste navegador. Use Google Chrome ou Microsoft Edge.');
      return false;
    }

    this.isIntentionalDisconnect = false;
    this.clearTimers();
    this.setState('requestingPermission');

    try {
      // @ts-ignore
      const port = await navigator.serial.requestPort();
      if (!port) {
        this.setState('idle');
        return false;
      }

      if (baudRate) {
        this.config.baudRate = baudRate;
      }

      return await this.connectPort(port);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (err?.name === 'NotFoundError' || msg.includes('No port selected') || msg.includes('canceled')) {
        this.setState('idle');
        this.notifyLog('system', 'Seleção de porta cancelada pelo usuário.');
      } else if (err?.name === 'SecurityError' || msg.includes('disallowed') || msg.includes('permission')) {
        this.setState('unauthorized');
        this.notifyLog('fault', `Permissão USB negada pelo navegador: ${msg}`);
      } else {
        this.setState('error');
        this.metrics.lastErrorText = msg;
        this.notifyLog('fault', `Falha ao selecionar porta USB: ${msg}`);
      }
      return false;
    }
  }

  /**
   * Tries to find and automatically connect to the last authorized device.
   */
  public async connectSavedDevice(): Promise<boolean> {
    if (this.isOpening || this.state === 'connecting' || this.state === 'connected' || this.state === 'reading') {
      return false;
    }

    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      return false;
    }

    try {
      // @ts-ignore
      const authorizedPorts: any[] = await navigator.serial.getPorts();
      if (!authorizedPorts || authorizedPorts.length === 0) {
        this.notifyLog('system', 'Nenhuma porta serial previamente autorizada encontrada.');
        this.setState('disconnected');
        return false;
      }

      // Try to find matching port
      let targetPort: any = null;
      if (this.config.usbVendorId && this.config.usbProductId) {
        targetPort = authorizedPorts.find((p) => {
          const info = p.getInfo ? p.getInfo() : {};
          return info.usbVendorId === this.config.usbVendorId && info.usbProductId === this.config.usbProductId;
        });
      }

      // Fallback: if only 1 authorized port exists and no specific id is saved, pick it
      if (!targetPort && authorizedPorts.length === 1) {
        targetPort = authorizedPorts[0];
      }

      if (targetPort) {
        this.notifyLog('system', 'Última central autorizada localizada. Conectando...');
        return await this.connectPort(targetPort);
      } else {
        this.notifyLog('system', 'Último dispositivo gravado não está presente nas portas conectadas.');
        this.setState('waitingForDevice');
        return false;
      }
    } catch (e: any) {
      console.warn('[UsbSerialManager] Erro ao recuperar portas salvas:', e);
      this.setState('error');
      return false;
    }
  }

  /**
   * Opens and starts communication with a specific SerialPort instance.
   */
  private async connectPort(port: any): Promise<boolean> {
    if (this.isOpening) return false;
    this.isOpening = true;
    this.setState('connecting');

    try {
      // If port is already opened in a zombie state or another session, try to close it cleanly first
      if (this.port && this.port !== port) {
        await this.closeConnection(false);
      }

      const info = port.getInfo ? port.getInfo() : {};
      const vid = info.usbVendorId ? `0x${info.usbVendorId.toString(16)}` : 'N/A';
      const pid = info.usbProductId ? `0x${info.usbProductId.toString(16)}` : 'N/A';
      const displayName = `USB Serial (VID: ${vid}, PID: ${pid})`;

      // Open the port with strict parameters
      await port.open({
        baudRate: this.config.baudRate || 115200,
        dataBits: this.config.dataBits || 8,
        stopBits: this.config.stopBits || 1,
        parity: this.config.parity || 'none',
        flowControl: this.config.flowControl || 'none',
      });

      this.port = port;
      this.sessionToken = Date.now() + Math.random();
      this.reconnectAttempt = 0;
      this.nextReconnectInSec = null;
      this.isIntentionalDisconnect = false;

      // Update and save config
      if (info.usbVendorId) this.config.usbVendorId = info.usbVendorId;
      if (info.usbProductId) this.config.usbProductId = info.usbProductId;
      this.config.lastConnectedAt = new Date().toISOString();
      this.saveConfig();

      this.metrics.activePortInfo = {
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
        displayName,
      };
      this.metrics.lastErrorText = null;

      this.setState('connected');
      this.notifyLog('system', `Porta aberta com sucesso (${this.config.baudRate} bps, 8N1).`);

      // Start reader stream loop
      this.startReadLoop(this.sessionToken);

      // Start periodic heartbeat
      this.startHeartbeat();

      this.isOpening = false;
      return true;
    } catch (err: any) {
      this.isOpening = false;
      const msg = err?.message || String(err);
      this.metrics.lastErrorText = msg;

      if (msg.includes('already open') || msg.includes('already being used') || msg.includes('locked')) {
        this.setState('busy');
        this.notifyLog('fault', 'A porta serial já está aberta por outro componente ou processo.');
      } else {
        this.setState('error');
        this.notifyLog('fault', `Erro ao abrir porta serial: ${msg}`);
      }

      return false;
    }
  }

  // --- READ LOOP ---

  private async startReadLoop(currentSessionToken: number): Promise<void> {
    if (!this.port || !this.port.readable) return;

    this.setState('reading');

    try {
      // @ts-ignore
      const textDecoder = new TextDecoderStream();
      const readableClosed = this.port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      this.reader = reader;

      let lineBuffer = '';

      while (this.sessionToken === currentSessionToken && !this.isClosing) {
        const { value, done } = await reader.read();

        if (done) {
          this.notifyLog('system', 'Fluxo de leitura serial concluído (EOF).');
          break;
        }

        if (value) {
          lineBuffer += value;

          // Process all complete messages delimited by '\n' (supports both \r\n and \n)
          let newlineIndex: number;
          while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
            let rawLine = lineBuffer.substring(0, newlineIndex);
            lineBuffer = lineBuffer.substring(newlineIndex + 1);

            // Strip trailing carriage return if present
            if (rawLine.endsWith('\r')) {
              rawLine = rawLine.slice(0, -1);
            }

            // Isolate line processing in try-catch so no error halts reception
            try {
              this.handleIncomingLine(rawLine);
            } catch (lineErr) {
              console.warn('[UsbSerialManager] Erro não tratado ao processar linha recebida:', lineErr);
            }
          }

          // Buffer overflow protection: if buffer grows past 8192 bytes without a newline
          // (e.g. electrical noise, baud rate mismatch, or continuous binary stream),
          // safely resynchronize to the last token start without memory leaks
          if (lineBuffer.length > 8192) {
            const syncIdx = Math.max(lineBuffer.lastIndexOf('{'), lineBuffer.lastIndexOf('<'));
            if (syncIdx > 0) {
              lineBuffer = lineBuffer.substring(syncIdx);
            } else if (syncIdx === -1) {
              lineBuffer = '';
            }
          }
        }
      }

      await readableClosed.catch(() => {});
    } catch (err: any) {
      // Only process error if this session is still active and not intentionally closing
      if (this.sessionToken === currentSessionToken && !this.isClosing) {
        const msg = err?.message || String(err);
        this.metrics.readErrorCount++;
        this.metrics.lastErrorText = msg;
        this.notifyLog('fault', `Erro no stream de leitura: ${msg}`);

        // Involuntary disconnect / reader abort
        await this.closeConnection(false);
        this.startAutoReconnect('Erro no stream serial');
      }
    } finally {
      // Ensure reader lock is safely released
      try {
        if (this.reader) {
          this.reader.releaseLock();
          this.reader = null;
        }
      } catch (e) {
        console.warn('[UsbSerialManager] Erro ao liberar reader lock:', e);
      }
    }
  }

  private handleIncomingLine(line: string): void {
    const trimmed = line.trim();

    // 1. Ignore empty lines (whitespace, empty newlines) without logging or counting errors
    if (!trimmed || trimmed.length === 0) {
      return;
    }

    const now = Date.now();
    this.metrics.lastMessageTime = now;
    this.resetNoDataWatchdog();

    // 2. Check for bracketed SCADA frame: <...> (supports both pipe | and semicolon ; formats)
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      try {
        this.handleAsciiFrame(trimmed, now);
      } catch (frameErr: any) {
        this.metrics.totalPacketsInvalid++;
        this.notifyLog('fault', `Erro ao decodificar frame SCADA: ${frameErr?.message || String(frameErr)}`);
        this.notifyMetrics();
      }
      return;
    }

    // 3. Check for Heartbeat Pong in JSON
    if (trimmed.includes('"pong"') || trimmed.includes('"type":"pong"')) {
      this.metrics.lastHeartbeatTime = now;
      this.metrics.lastHeartbeatStatus = 'ok';
      if (this.lastPingSentAt) {
        this.metrics.lastLatencyMs = now - this.lastPingSentAt;
        this.lastPingSentAt = null;
      }
      this.markBoardAlive('placaPrincipal', now);
      this.notifyLog('rx', `[HEARTBEAT PONG] Placa Principal respondeu OK (${this.metrics.lastLatencyMs ?? 0}ms)`);
      this.notifyMetrics();
      return;
    }

    // 4. Parse Telemetry JSON (with resilient handling of malformed JSON)
    const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');

    try {
      const parsed = JSON.parse(trimmed);

      // Validate parsed object
      if (parsed && typeof parsed === 'object') {
        // 4a. Check for ALARM_COMMAND_RESULT in JSON
        if (parsed.type === 'ALARM_COMMAND_RESULT') {
          const actionStr = parsed.action === 'ON' ? 'ATIVAÇÃO' : 'DESATIVAÇÃO';
          const okStr = parsed.ok ? 'SUCESSO' : 'FALHA';
          const reasonStr = parsed.reason ? ` [Motivo: ${parsed.reason}]` : '';
          const errorStr = parsed.error ? ` [Erro: ${parsed.error}]` : '';
          this.notifyLog(
            parsed.ok ? 'rx' : 'fault',
            `[SIRENE] Resposta para Tanque #${parsed.tank}: ${actionStr} -> ${okStr}${reasonStr}${errorStr}`,
            trimmed
          );
          this.alarmResultListeners.forEach((fn) => {
            try {
              fn(parsed as AlarmCommandResult);
            } catch (e) {
              console.error('[UsbSerialManager] Erro no listener de resultado de alarme:', e);
            }
          });
          this.notifyMetrics();
          return;
        }

        this.metrics.totalPacketsReceived++;
        this.metrics.lastHeartbeatTime = now;
        this.metrics.lastHeartbeatStatus = 'ok';

        // Update specific board alive status based on JSON
        const nodeId = Number(parsed.node || parsed.nodeId || 1);
        if (nodeId === 1) this.markBoardAlive('placaPrincipal', now);
        else if (nodeId === 2) this.markBoardAlive('placa2', now);
        else if (nodeId === 3) this.markBoardAlive('placa3', now);

        if (parsed.node1) this.markBoardAlive('placaPrincipal', now);
        if (parsed.node2) this.markBoardAlive('placa2', now);
        if (parsed.node3) this.markBoardAlive('placa3', now);

        // Safely dispatch to telemetry subscribers
        this.telemetryListeners.forEach((fn) => {
          try {
            fn(parsed);
          } catch (listenerErr) {
            console.error('[UsbSerialManager] Erro no listener de telemetria:', listenerErr);
          }
        });

        this.notifyLog('rx', trimmed, trimmed);
        this.notifyMetrics();
        return;
      }
    } catch (jsonErr: any) {
      if (looksLikeJson) {
        // Explicitly malformed JSON: increment invalid metric, log descriptive warning, and DO NOT block reception
        this.metrics.totalPacketsInvalid++;
        const snippet = trimmed.length > 80 ? trimmed.substring(0, 80) + '...' : trimmed;
        this.notifyLog('fault', `[JSON Malformado ignorado]: ${jsonErr?.message || 'Sintaxe inválida'} | Payload: ${snippet}`);
        this.notifyMetrics();
        return;
      }
    }

    // 5. Raw or non-JSON line (e.g. boot messages, status logs from Arduino setup)
    this.notifyLog('rx', `[RAW] ${trimmed}`);
    this.notifyMetrics();
  }

  private handleAsciiFrame(frame: string, now: number): void {
    const inner = frame.slice(1, -1).trim();

    // 1. Pipe-delimited frame: <TIPO|ORIGEM|DESTINO|SEQUENCIA|PAYLOAD|CRC>
    if (inner.includes('|')) {
      const parts = inner.split('|');
      if (parts.length < 5) return;

      const type = parts[0].trim().toUpperCase();
      const origin = parts[1].trim().toUpperCase();
      const seqStr = parts[3].trim();
      const payloadStr = parts[4] !== undefined ? parts[4].trim() : '';
      const crc = parts[5] !== undefined ? parts[5].trim().toUpperCase() : undefined;

      const seq = seqStr ? Number(seqStr) : undefined;

      // Validate CRC if present
      if (crc && crc !== '0000' && crc !== 'FFFF') {
        const contentBeforeCrc = inner.substring(0, inner.lastIndexOf('|'));
        const calculated = calculateCrc16(contentBeforeCrc);
        if (crc !== calculated) {
          this.notifyLog('fault', `Checksum CRC mismatch no frame ${origin} (calc: ${calculated}, rcv: ${crc})`);
          this.metrics.totalPacketsInvalid++;
          return;
        }
      }

      let boardKey: 'placaPrincipal' | 'placa2' | 'placa3' = 'placaPrincipal';
      let nodeId = 1;
      if (origin.includes('PLACA2') || origin.includes('NODE2')) {
        boardKey = 'placa2';
        nodeId = 2;
      } else if (origin.includes('PLACA3') || origin.includes('NODE3')) {
        boardKey = 'placa3';
        nodeId = 3;
      }

      this.markBoardAlive(boardKey, now, seq);
      this.metrics.totalPacketsReceived++;

      // Parse payload key=value pairs
      const params: Record<string, string> = {};
      if (payloadStr) {
        const pairs = payloadStr.split(';');
        for (const p of pairs) {
          const eq = p.indexOf('=');
          if (eq !== -1) {
            params[p.substring(0, eq).trim().toUpperCase()] = p.substring(eq + 1).trim();
          } else if (p.trim()) {
            params[p.trim().toUpperCase()] = '1';
          }
        }
      }

      if (type === 'ACK') {
        this.notifyLog('rx', `[ACK RECEBIDO] ${origin} confirmou pacote SEQ=${seq ?? 'N/A'}`);
        return;
      }

      if (type === 'PONG' || type === 'READY' || type === 'HEARTBEAT') {
        const bootInfo = params.BOOT ? ` BOOT=${params.BOOT}` : '';
        this.notifyLog('rx', `[${type}] ${origin} comunicando OK (SEQ=${seq ?? 0}${bootInfo})`);
        return;
      }

      if (type === 'NACK') {
        this.notifyLog('fault', `[NACK RECEBIDO] ${origin} reportou erro: ${payloadStr || 'CRC_INVALIDO'}`);
        return;
      }

      if (type === 'DATA') {
        const tanks: Array<{ id: number; level: number; pump?: number; sensors?: number[] }> = [];

        const addTankIfValid = (id: number, rawLevel: string | undefined, rawPump: string | undefined) => {
          if (rawLevel !== undefined) {
            const num = Number(rawLevel);
            if (!isNaN(num)) {
              const level = Math.min(100, Math.max(0, Math.round(num)));
              const pump = rawPump !== undefined && !isNaN(Number(rawPump)) ? Number(rawPump) : undefined;
              tanks.push({ id, level, pump });
            }
          }
        };

        if (nodeId === 1) {
          addTankIfValid(1, params.FW1 ?? params.T1, params.P1);
          addTankIfValid(2, params.FW2 ?? params.T2, params.P2);
        } else if (nodeId === 2) {
          addTankIfValid(3, params.RW1 ?? params.T3, params.P3);
          addTankIfValid(4, params.RW2 ?? params.T4, params.P4);
        } else if (nodeId === 3) {
          addTankIfValid(5, params.WW1 ?? params.T5, params.P5);
          addTankIfValid(6, params.WW2 ?? params.T6, params.P6);
        }

        if (tanks.length > 0) {
          const telemetryPayload = {
            device: 'kizomba',
            node: nodeId,
            source: 'serial_bridge',
            seq,
            tanks,
          };

          this.telemetryListeners.forEach((fn) => {
            try {
              fn(telemetryPayload);
            } catch (err) {
              console.error('[UsbSerialManager] Erro no listener de telemetria:', err);
            }
          });

          this.notifyLog('rx', `[DADOS SCADA] ${origin}: ${tanks.map((t) => `T${t.id}=${t.level}%`).join(', ')}`);
          this.notifyMetrics();
        }
      }
      return;
    }

    // 2. Legacy Semicolon-delimited frame: <TYPE;BOARD;KEY=VAL;...;CRC=XXXX>
    const parts = inner.split(';');
    if (parts.length < 2) return;

    const type = parts[0].toUpperCase();
    const board = parts[1].toUpperCase();

    let boardKey: 'placaPrincipal' | 'placa2' | 'placa3' = 'placaPrincipal';
    let nodeId = 1;
    if (board.includes('PLACA2') || board.includes('NODE2') || board.includes('NO2')) {
      boardKey = 'placa2';
      nodeId = 2;
    } else if (board.includes('PLACA3') || board.includes('NODE3') || board.includes('NO3')) {
      boardKey = 'placa3';
      nodeId = 3;
    }

    const params: Record<string, string> = {};
    for (let i = 2; i < parts.length; i++) {
      const eq = parts[i].indexOf('=');
      if (eq !== -1) {
        params[parts[i].substring(0, eq).toUpperCase()] = parts[i].substring(eq + 1);
      }
    }

    const seq = params.SEQ ? Number(params.SEQ) : undefined;

    if (params.CRC) {
      const crcReceived = params.CRC.toUpperCase();
      const contentBeforeCrc = inner.substring(0, inner.lastIndexOf(';CRC='));
      const calculated = calculateCrc16(contentBeforeCrc);
      if (crcReceived !== calculated && crcReceived !== '0000') {
        this.notifyLog('fault', `Checksum CRC mismatch no frame ${board} (calc: ${calculated}, rcv: ${crcReceived})`);
        this.metrics.totalPacketsInvalid++;
        return;
      }
    }

    this.markBoardAlive(boardKey, now, seq);
    this.metrics.totalPacketsReceived++;

    if (type === 'ACK') {
      this.notifyLog('rx', `[ACK RECEBIDO] ${board} confirmou pacote SEQ=${seq ?? 'N/A'}`);
      return;
    }

    if (type === 'HEARTBEAT') {
      this.notifyLog('rx', `[HEARTBEAT] ${board} comunicando perfeitamente (SEQ=${seq ?? 0})`);
      if (seq !== undefined) {
        this.sendCommand(`<ACK;${board};SEQ=${seq}>`).catch(() => {});
      }
      return;
    }

    if (type === 'DATA') {
      if (seq !== undefined) {
        this.sendCommand(`<ACK;${board};SEQ=${seq}>`).catch(() => {});
      }

      const tanks: Array<{ id: number; level: number; pump?: number; sensors?: number[] }> = [];

      if (nodeId === 1) {
        if (params.FW1 !== undefined) tanks.push({ id: 1, level: Number(params.FW1) });
        if (params.FW2 !== undefined) tanks.push({ id: 2, level: Number(params.FW2) });
      } else if (nodeId === 2) {
        if (params.RW1 !== undefined) tanks.push({ id: 3, level: Number(params.RW1) });
        if (params.RW2 !== undefined) tanks.push({ id: 4, level: Number(params.RW2) });
      } else if (nodeId === 3) {
        if (params.WW1 !== undefined) tanks.push({ id: 5, level: Number(params.WW1) });
        if (params.WW2 !== undefined) tanks.push({ id: 6, level: Number(params.WW2) });
      }

      if (tanks.length > 0) {
        const telemetryPayload = {
          device: 'kizomba',
          node: nodeId,
          source: 'serial_bridge',
          seq,
          tanks,
        };

        this.telemetryListeners.forEach((fn) => {
          try {
            fn(telemetryPayload);
          } catch (err) {
            console.error('[UsbSerialManager] Erro no listener de telemetria:', err);
          }
        });

        this.notifyLog('rx', `[DADOS SCADA] ${board}: ${tanks.map((t) => `Tanque #${t.id}=${t.level}%`).join(', ')}`);
        this.notifyMetrics();
      }
    }
  }

  private markBoardAlive(boardKey: 'placaPrincipal' | 'placa2' | 'placa3', now: number, seq?: number): void {
    const prev = this.boardStatuses[boardKey];
    this.boardStatuses[boardKey] = {
      ...prev,
      status: 'online',
      lastDataAt: now,
      lastHeartbeatAt: now,
      lastError: null,
      reconnectAttempts: 0,
      consecutiveMissedHeartbeats: 0,
      lastSeq: seq ?? prev.lastSeq,
    };
    this.notifyBoardStatuses();
  }

  /**
   * Envia comando individual de sirene/alarme ao Arduino via Serial USB.
   * Formato: {"command":"SET_ALARM","tank":1,"action":"ON"}
   * Aguarda resposta com ALARM_COMMAND_RESULT ou confirmação de envio.
   */
  public async sendAlarmCommand(
    tank: number,
    action: 'ON' | 'OFF'
  ): Promise<AlarmCommandResult> {
    if (!tank || isNaN(tank) || tank < 1 || tank > 6) {
      return {
        type: 'ALARM_COMMAND_RESULT',
        tank: tank || 0,
        action,
        ok: false,
        error: 'Identificador de tanque inválido (deve ser entre 1 e 6).',
      };
    }

    if (action !== 'ON' && action !== 'OFF') {
      return {
        type: 'ALARM_COMMAND_RESULT',
        tank,
        action,
        ok: false,
        error: 'Ação de alarme inválida (deve ser "ON" ou "OFF").',
      };
    }

    if (this.state !== 'reading' && this.state !== 'connected') {
      return {
        type: 'ALARM_COMMAND_RESULT',
        tank,
        action,
        ok: false,
        error: 'Porta serial não conectada ao Arduino.',
      };
    }

    return new Promise<AlarmCommandResult>((resolve) => {
      let resolved = false;
      let unsubscribe: (() => void) | null = null;
      let timeoutId: any = null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (unsubscribe) unsubscribe();
      };

      unsubscribe = this.subscribeAlarmResult((result) => {
        if (!resolved && Number(result.tank) === tank) {
          resolved = true;
          cleanup();
          resolve(result);
        }
      });

      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          // Fallback se a resposta de hardware não vier em 3500ms
          const defaultReason = tank <= 2 ? 'APPLIED' : 'SENT_TO_SLAVE';
          resolve({
            type: 'ALARM_COMMAND_RESULT',
            tank,
            action,
            ok: true,
            reason: defaultReason,
          });
        }
      }, 3500);

      this.sendCommand(
        { command: 'SET_ALARM', tank, action },
        {
          isAlarmCommand: true,
          tankId: tank,
        }
      ).then((sentOk) => {
        if (!sentOk && !resolved) {
          resolved = true;
          cleanup();
          resolve({
            type: 'ALARM_COMMAND_RESULT',
            tank,
            action,
            ok: false,
            error: 'Falha ao transmitir linha JSON pela conexão serial.',
          });
        }
      });
    });
  }

  // --- WRITE / COMMAND QUEUE ---

  public async sendCommand(
    payload: string | object,
    metadata?: {
      isPumpCommand?: boolean;
      isAlarmCommand?: boolean;
      tankId?: number;
      nodeId?: number;
      userId?: string;
      userName?: string;
    }
  ): Promise<boolean> {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const commandText = str.endsWith('\n') ? str : str + '\n';

    const cmdRecord: SerialCommandRecord = {
      id: 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      command: str.trim(),
      tankId: metadata?.tankId,
      nodeId: metadata?.nodeId,
      userId: metadata?.userId,
      userName: metadata?.userName,
      timestamp: Date.now(),
      status: 'queued',
      attempt: 1,
      isPumpCommand: metadata?.isPumpCommand,
      isAlarmCommand: metadata?.isAlarmCommand,
    };

    return new Promise<boolean>((resolve) => {
      this.commandQueue.push({ record: cmdRecord, resolve });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    if (this.commandQueue.length === 0) return;

    this.isProcessingQueue = true;
    const item = this.commandQueue.shift()!;
    const { record, resolve } = item;

    record.status = 'sending';
    this.metrics.lastCommandSent = record.command;

    if (!this.port || !this.port.writable || this.state !== 'reading' && this.state !== 'connected') {
      record.status = 'failed';
      record.result = 'Porta serial não conectada';
      this.metrics.lastCommandResult = 'failed';
      this.metrics.writeErrorCount++;
      this.notifyLog('fault', `Comando abortado: Porta serial não está pronta. (${record.command})`);
      this.isProcessingQueue = false;
      resolve(false);
      this.processQueue();
      return;
    }

    let writer: any = null;
    let timer: any = null;

    try {
      // @ts-ignore
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
      writer = textEncoder.writable.getWriter();

      // Enforce 3000ms timeout
      const writePromise = writer.write(record.command + '\n');
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timeout de escrita (3s)')), 3000);
      });

      await Promise.race([writePromise, timeoutPromise]);
      clearTimeout(timer);

      record.status = 'sent';
      record.result = 'Transmitido com sucesso';
      this.metrics.lastCommandResult = 'success';

      const logPrefix = record.isAlarmCommand
        ? '[TX SIRENE]'
        : record.isPumpCommand
        ? '[TX BOMBA]'
        : '[TX SERIAL]';
      this.notifyLog('tx', `${logPrefix} ${record.command}`);
      this.notifyMetrics();

      await writer.close().catch(() => {});
      await writableStreamClosed.catch(() => {});

      resolve(true);
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      const msg = err?.message || String(err);
      record.status = 'failed';
      record.result = msg;
      this.metrics.lastCommandResult = 'failed';
      this.metrics.writeErrorCount++;
      this.notifyLog('fault', `Falha ao transmitir comando: ${msg}`);

      // Note: for safety reasons, we NEVER blindly auto-retry dangerous pump toggle commands
      if (record.isPumpCommand) {
        this.notifyLog(
          'fault',
          `SEGURANÇA: Comando de bomba retido sem reenvio automático para evitar choques no relé.`
        );
      }

      resolve(false);
    } finally {
      try {
        if (writer) {
          writer.releaseLock();
        }
      } catch (e) {
        console.warn('[UsbSerialManager] Erro ao liberar writer lock:', e);
      }
      this.isProcessingQueue = false;
      this.processQueue();
    }
  }

  // --- HEARTBEAT & NO-DATA WATCHDOG ---

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (this.state === 'reading' || this.state === 'connected') {
        const now = Date.now();
        this.lastPingSentAt = now;
        this.currentSeq = (this.currentSeq + 1) % 65535;

        // 1. Evaluate independent status for each of the 3 boards
        const boardKeys: Array<'placaPrincipal' | 'placa2' | 'placa3'> = ['placaPrincipal', 'placa2', 'placa3'];
        for (const key of boardKeys) {
          const board = this.boardStatuses[key];
          const lastActivity = Math.max(board.lastHeartbeatAt || 0, board.lastDataAt || 0);

          if (lastActivity === 0) {
            // Never received signal from this board yet
            board.status = 'sem resposta temporária';
          } else {
            const elapsed = now - lastActivity;
            if (elapsed <= HEARTBEAT_TIMEOUT_MS) {
              board.status = 'online';
              board.consecutiveMissedHeartbeats = 0;
              board.reconnectAttempts = 0;
            } else if (elapsed <= 8000) {
              // 1st stage: temporary lack of response
              board.status = 'sem resposta temporária';
              board.consecutiveMissedHeartbeats = 1;
            } else if (elapsed <= 20000) {
              // 2nd stage: attempting reconnect
              board.status = 'reconectando';
              board.consecutiveMissedHeartbeats = 2;
              board.reconnectAttempts = Math.min(5, board.reconnectAttempts + 1);
            } else {
              // 3rd stage: declared offline after consecutive failures
              board.status = 'offline';
              board.consecutiveMissedHeartbeats = 3;
            }
          }
        }

        this.notifyBoardStatuses();

        // 2. Dispatch Heartbeat ping to master board (handles broadcast/forwarding to secondary boards)
        // Sends both Hossidi ASCII frame protocol and JSON for universal compatibility
        this.sendCommand(`<PING;ALL;SEQ=${this.currentSeq}>`);
        this.sendCommand({ device: 'kizomba', cmd: 'ping', seq: this.currentSeq, t: now });

        // If placa2 or placa3 is specifically reconnecting or silent, send targeted poll frame
        if (this.boardStatuses.placa2.status === 'reconectando' || this.boardStatuses.placa2.status === 'sem resposta temporária') {
          this.sendCommand(`<POLL;PLACA2;SEQ=${this.currentSeq}>`);
        }
        if (this.boardStatuses.placa3.status === 'reconectando' || this.boardStatuses.placa3.status === 'sem resposta temporária') {
          this.sendCommand(`<POLL;PLACA3;SEQ=${this.currentSeq}>`);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetNoDataWatchdog(): void {
    if (this.noDataTimer) clearTimeout(this.noDataTimer);
    this.noDataTimer = setTimeout(() => {
      if (this.state === 'reading' || this.state === 'connected') {
        this.metrics.lastHeartbeatStatus = 'timeout';
        this.notifyLog(
          'fault',
          `AVISO: Nenhuma leitura ou ping recebido nos últimos ${NO_DATA_TIMEOUT_MS / 1000}s. Verifique o cabo ou firmware da placa.`
        );
        this.notifyMetrics();
      }
    }, NO_DATA_TIMEOUT_MS);
  }

  // --- AUTO-RECONNECT WITH PROGRESSIVE BACKOFF ---

  private startAutoReconnect(reason: string): void {
    if (this.isIntentionalDisconnect || !this.config.autoReconnect) {
      this.notifyLog('system', 'Reconexão automática suprimida (desconexão intencional ou desativada).');
      return;
    }

    this.reconnectAttempt++;
    this.metrics.reconnectCount++;

    if (this.reconnectAttempt > MAX_FAST_RECONNECT_ATTEMPTS) {
      this.setState('waitingForDevice');
      this.notifyLog(
        'system',
        'Limite de tentativas imediatas atingido. Aguardando conexão do barramento USB ou reconexão manual.'
      );
      // Keep slow background check every 30s
      this.scheduleReconnect(30000);
      return;
    }

    const delayIndex = Math.min(this.reconnectAttempt - 1, BACKOFF_DELAYS.length - 1);
    const delayMs = BACKOFF_DELAYS[delayIndex];

    this.setState('reconnecting');
    this.notifyLog(
      'system',
      `[Reconexão ${this.reconnectAttempt}/${MAX_FAST_RECONNECT_ATTEMPTS}] Tentando restabelecer conexão em ${delayMs / 1000}s... (${reason})`
    );

    this.scheduleReconnect(delayMs);
  }

  private scheduleReconnect(delayMs: number): void {
    this.clearTimers();
    let secondsLeft = Math.ceil(delayMs / 1000);
    this.nextReconnectInSec = secondsLeft;
    this.notifyMetrics();

    this.countdownTimer = setInterval(() => {
      secondsLeft--;
      this.nextReconnectInSec = Math.max(0, secondsLeft);
      this.notifyMetrics();
      if (secondsLeft <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    }, 1000);

    this.reconnectTimer = setTimeout(async () => {
      this.nextReconnectInSec = null;
      this.notifyMetrics();
      const ok = await this.connectSavedDevice();
      if (!ok && this.state !== 'connected' && this.state !== 'reading') {
        this.startAutoReconnect('Falha na tentativa anterior');
      }
    }, delayMs);
  }

  public async reconnectNow(): Promise<boolean> {
    this.clearTimers();
    this.isIntentionalDisconnect = false;
    this.reconnectAttempt = 0;
    this.nextReconnectInSec = null;
    this.notifyLog('system', 'Solicitação manual de reconexão imediata.');
    return await this.connectSavedDevice();
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.noDataTimer) {
      clearTimeout(this.noDataTimer);
      this.noDataTimer = null;
    }
  }

  // --- DISCONNECT / CLOSE CONNECTION ---

  /**
   * Idempotent, safe connection close routine.
   * Guarantees all locks (reader, writer) are strictly released in finally blocks.
   */
  public async closeConnection(isIntentional = true): Promise<void> {
    if (this.isClosing) return;
    this.isClosing = true;

    if (isIntentional) {
      this.isIntentionalDisconnect = true;
      this.clearTimers();
      this.reconnectAttempt = 0;
      this.nextReconnectInSec = null;
    }

    this.stopHeartbeat();
    this.sessionToken = 0; // Invalidate any running read loop immediately

    try {
      // 1. Cancel Reader
      if (this.reader) {
        try {
          await this.reader.cancel();
        } catch (e) {
          // Ignore abort errors
        } finally {
          try {
            this.reader.releaseLock();
          } catch (e) {}
          this.reader = null;
        }
      }

      // 2. Release Writer
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch (e) {}
        this.writer = null;
      }

      // 3. Close Port
      if (this.port) {
        try {
          await this.port.close();
        } catch (e) {
          console.warn('[UsbSerialManager] Erro ao fechar porta:', e);
        }
        this.port = null;
      }

      this.metrics.activePortInfo = null;
      this.setState(isIntentional ? 'intentionalDisconnect' : 'disconnected');
      this.notifyLog(
        'system',
        isIntentional ? 'Barramento USB desconectado pelo operador.' : 'Barramento USB liberado.'
      );
    } catch (err: any) {
      console.error('[UsbSerialManager] Exceção em closeConnection:', err);
      this.setState('error');
    } finally {
      this.isClosing = false;
      this.notifyMetrics();
    }
  }

  /**
   * Test communication with a PING packet.
   */
  public async testCommunication(): Promise<boolean> {
    this.notifyLog('system', 'Enviando teste de comunicação (PING) ao barramento...');
    const now = Date.now();
    this.lastPingSentAt = now;
    return await this.sendCommand({
      device: 'kizomba',
      cmd: 'ping',
      test: true,
      timestamp: now,
    });
  }
}

// Export singleton instance
export const usbSerialManager = UsbSerialManager.getInstance();

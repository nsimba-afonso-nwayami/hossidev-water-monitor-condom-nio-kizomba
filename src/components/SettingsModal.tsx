import React, { useState, useEffect } from 'react';
import {
  Settings,
  Users,
  Database,
  Sliders,
  UserPlus,
  Shield,
  Trash2,
  Edit3,
  Check,
  X,
  Lock,
  CheckSquare,
  Square,
  AlertCircle,
  RefreshCw,
  Download,
  Upload,
  HardDrive,
  Clock,
  Volume2,
  VolumeX,
  Search,
  KeyRound,
  FileCheck,
  AlertTriangle,
  Info,
  Droplets,
  Gauge,
  RotateCcw,
  Mail,
  MessageSquare,
  Send,
  CheckCircle2,
  ShieldAlert,
  Bell,
  Eye,
  EyeOff,
  UserCheck,
  Building2,
  Server,
} from 'lucide-react';
import { api } from '../services/api';
import {
  UserManagementItem,
  AuthUser,
  TankAlertSettings,
  AlertRecipient,
  EmailNotification,
  SafeUserSmtpConfiguration,
  SafeSystemEmailSettings,
  EmailProviderType,
} from '../types';
import { isValidEmail } from '../utils/validators';
import { dbService, localDb } from '../db/localDb';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser;
  onUserUpdated?: (updatedUser: AuthUser) => void;
  onSystemConfigChanged?: () => void;
}

const AVAILABLE_TANKS = [
  { id: 1, name: 'Tanque FW1 (Tratada)', sector: 'Tratada', sectorLabel: 'Água Tratada', capacity: '20.000 L', defaultCap: 20000 },
  { id: 2, name: 'Tanque FW2 (Tratada)', sector: 'Tratada', sectorLabel: 'Água Tratada', capacity: '20.000 L', defaultCap: 20000 },
  { id: 3, name: 'Tanque RW1 (Pré-Tratada)', sector: 'Pré-Tratada', sectorLabel: 'Água Pré-Tratada', capacity: '25.000 L', defaultCap: 25000 },
  { id: 4, name: 'Tanque RW2 (Pré-Tratada)', sector: 'Pré-Tratada', sectorLabel: 'Água Pré-Tratada', capacity: '25.000 L', defaultCap: 25000 },
  { id: 5, name: 'Tanque WW1 (Bruta)', sector: 'Bruta', sectorLabel: 'Água Bruta', capacity: '30.000 L', defaultCap: 30000 },
  { id: 6, name: 'Tanque WW2 (Bruta)', sector: 'Bruta', sectorLabel: 'Água Bruta', capacity: '30.000 L', defaultCap: 30000 },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
  onSystemConfigChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'my-account' | 'users' | 'tanks' | 'alerts' | 'backup' | 'system'>('my-account');

  // Minha Conta / Configuração SMTP State
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState<number>(587);
  const [smtpUser, setSmtpUser] = useState('etakizomba@gmail.com');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [mailFrom, setMailFrom] = useState('etakizomba@gmail.com');
  const [smtpSecurity, setSmtpSecurity] = useState<'STARTTLS' | 'SSL' | 'NONE'>('STARTTLS');
  const [smtpEnabled, setSmtpEnabled] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [isSmtpConfigured, setIsSmtpConfigured] = useState(false);
  const [smtpLastTestAt, setSmtpLastTestAt] = useState<string | null>(null);
  const [smtpLastTestStatus, setSmtpLastTestStatus] = useState<'success' | 'failed' | null>(null);
  const [smtpLastTestError, setSmtpLastTestError] = useState<string | null>(null);
  const [smtpUpdatedAt, setSmtpUpdatedAt] = useState<string | null>(null);
  const [loadingSmtp, setLoadingSmtp] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpSuccess, setSmtpSuccess] = useState<string | null>(null);
  const [smtpError, setSmtpError] = useState<string | null>(null);

  // Users State
  const [users, setUsers] = useState<UserManagementItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // New User Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [newPermittedTanks, setNewPermittedTanks] = useState<number[]>([1, 2, 3, 4, 5, 6]);

  // Edit User State (Full user data editing)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editPermittedTanks, setEditPermittedTanks] = useState<number[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset Password Quick Form
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null);
  const [quickNewPassword, setQuickNewPassword] = useState('');
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(null);

  // Tank Capacities State (Optional customization per tank)
  const [tankCapacities, setTankCapacities] = useState<{ [id: number]: number }>({
    1: 20000,
    2: 20000,
    3: 25000,
    4: 25000,
    5: 30000,
    6: 30000,
  });
  const [loadingTanks, setLoadingTanks] = useState(false);
  const [savingTanks, setSavingTanks] = useState(false);
  const [tanksSuccess, setTanksSuccess] = useState<string | null>(null);
  const [tanksError, setTanksError] = useState<string | null>(null);

  const totalCondoCapacity = (Object.values(tankCapacities) as number[]).reduce(
    (acc: number, val: number) => acc + (Number(val) || 0),
    0
  );

  // Backup & Restore State
  const [dbStats, setDbStats] = useState<{
    fileSizeBytes: number;
    usersCount: number;
    historyCount: number;
    logsCount: number;
    lastBackupAt?: string;
    uptimeSeconds: number;
  } | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<any | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // System Configuration State
  const [systemConfig, setSystemConfig] = useState({
    audioAlarmEnabled: true,
    emergencyLockout: false,
    watchdogTimeoutMs: 8000,
    dailyConsumptionEstimateLiters: 28000,
    lowLevelAlertPercentage: 20,
    criticalLevelAlertPercentage: 10,
    condominiumName: 'Condomínio Residencial Kizomba',
    lastBackupAt: '',
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Alerts & Contacts State
  const [tankAlertSettings, setTankAlertSettings] = useState<{ [tankId: string]: TankAlertSettings }>({});
  const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
  const [loadingAlertsData, setLoadingAlertsData] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertsSuccess, setAlertsSuccess] = useState<string | null>(null);

  // New Recipient Form State
  const [showAddRecipientForm, setShowAddRecipientForm] = useState(false);
  const [newRecipName, setNewRecipName] = useState('');
  const [newRecipEmail, setNewRecipEmail] = useState('');
  const [newRecipTankId, setNewRecipTankId] = useState<string>(''); // empty = all tanks
  const [newRecipPriority, setNewRecipPriority] = useState<number>(1);
  const [savingRecipient, setSavingRecipient] = useState<boolean>(false);

  // Subtab within Alerts: 'provider' (Provedor & E-mail Corporativo) | 'recipients' (E-mails & Destinatários) | 'limits' (Limites & Histerese) | 'history' (Histórico de Envios)
  const [alertsSubTab, setAlertsSubTab] = useState<'provider' | 'recipients' | 'limits' | 'history'>('provider');

  // System Email / Corporate Configuration State
  const [systemEmailSettings, setSystemEmailSettings] = useState<SafeSystemEmailSettings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<EmailProviderType>(() => {
    try {
      const cached = localStorage.getItem('hossidev_selected_email_provider');
      if (cached === 'gmail' || cached === 'corporate_hossidev') {
        return cached;
      }
    } catch {}
    return 'corporate_hossidev';
  });
  const [switchingProvider, setSwitchingProvider] = useState<EmailProviderType | null>(null);
  const [loadingSystemEmail, setLoadingSystemEmail] = useState(false);
  const [savingSystemEmail, setSavingSystemEmail] = useState(false);
  const [testingSystemEmail, setTestingSystemEmail] = useState(false);
  const [systemEmailSuccess, setSystemEmailSuccess] = useState<string | null>(null);
  const [systemEmailError, setSystemEmailError] = useState<string | null>(null);

  // Corporate Hossidev Form Fields
  const [corpFromName, setCorpFromName] = useState('water.report.@hossidev.com');
  const [corpFromAddress, setCorpFromAddress] = useState('water.report@hossidev.com');
  const [corpSmtpHost, setCorpSmtpHost] = useState('mail.hossidev.com');
  const [corpSmtpPort, setCorpSmtpPort] = useState(465);
  const [corpSmtpUser, setCorpSmtpUser] = useState('water.report@hossidev.com');
  const [corpSmtpPassword, setCorpSmtpPassword] = useState('');
  const [showCorpPassword, setShowCorpPassword] = useState(false);
  const [corpSecurity, setCorpSecurity] = useState<'SSL' | 'STARTTLS'>('SSL');
  const [corpHasPassword, setCorpHasPassword] = useState(false);
  const [corpLastTestAt, setCorpLastTestAt] = useState<string | null>(null);
  const [corpLastTestStatus, setCorpLastTestStatus] = useState<'success' | 'failed' | null>(null);
  const [corpLastTestStage, setCorpLastTestStage] = useState<string | null>(null);
  const [corpLastTestError, setCorpLastTestError] = useState<string | null>(null);
  const [corpLastTestDetails, setCorpLastTestDetails] = useState<string | null>(null);
  const [corpLastTestCategory, setCorpLastTestCategory] = useState<string | null>(null);

  // Dedicated Test Email input
  const [corpTestRecipient, setCorpTestRecipient] = useState('');
  const [corpTestFeedback, setCorpTestFeedback] = useState<{
    stage?: string;
    success?: boolean;
    message?: string;
    messageId?: string;
    category?: string;
    details?: string;
  } | null>(null);

  // Gmail Configuration Form Fields (Secondary / Fallback)
  const [gmailFromName, setGmailFromName] = useState('Hossidev Water Monitor');
  const [gmailFromAddress, setGmailFromAddress] = useState('etakizomba@gmail.com');
  const [gmailSmtpHost, setGmailSmtpHost] = useState('smtp.gmail.com');
  const [gmailSmtpPort, setGmailSmtpPort] = useState(587);
  const [gmailSmtpUser, setGmailSmtpUser] = useState('etakizomba@gmail.com');
  const [gmailSmtpPassword, setGmailSmtpPassword] = useState('');
  const [showGmailPassword, setShowGmailPassword] = useState(false);
  const [gmailHasPassword, setGmailHasPassword] = useState(false);
  const [showGmailSettings, setShowGmailSettings] = useState(false);


  // Edit Recipient Modal State
  const [editingRecipient, setEditingRecipient] = useState<AlertRecipient | null>(null);
  const [editRecipName, setEditRecipName] = useState('');
  const [editRecipEmail, setEditRecipEmail] = useState('');
  const [editRecipTankId, setEditRecipTankId] = useState<string>('');
  const [editRecipPriority, setEditRecipPriority] = useState<number>(1);
  const [editRecipEnabled, setEditRecipEnabled] = useState<boolean>(true);
  const [savingEditRecipient, setSavingEditRecipient] = useState<boolean>(false);

  // In-App Confirm Modals
  const [confirmTestModalOpen, setConfirmTestModalOpen] = useState(false);
  const [confirmDeleteRecipientId, setConfirmDeleteRecipientId] = useState<string | null>(null);

  // Notification Logs & History
  const [notificationLogs, setNotificationLogs] = useState<{ emails: EmailNotification[] }>({ emails: [] });
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'failed' | 'sent' | 'pending' | 'queued' | 'not_sent_offline'>('all');
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);

  // Test Dispatch State
  const [testEmailTo, setTestEmailTo] = useState('etakizomba@gmail.com');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  // Saving settings per tank
  const [savingTankSettingsId, setSavingTankSettingsId] = useState<string | null>(null);

  // Load Notification History
  const loadNotificationLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await api.alerts.getNotifications();
      if (res && res.emails) {
        setNotificationLogs({ emails: res.emails || [] });
      }
    } catch {
      // Fallback local IndexedDB
      const localEmails = await localDb.emailNotifications.reverse().limit(100).toArray();
      setNotificationLogs({ emails: localEmails });
    } finally {
      setLoadingLogs(false);
    }
  };

  // Load Alert Settings & Recipients
  const loadAlertsData = async () => {
    setLoadingAlertsData(true);
    setAlertsError(null);
    try {
      // 1. Settings from API or local fallback
      try {
        const settingsRes = await api.alerts.getSettings();
        if (settingsRes.settings) {
          setTankAlertSettings(settingsRes.settings);
          for (const s of Object.values(settingsRes.settings)) {
            await dbService.saveLocalAlertSettings(s);
          }
        }
      } catch {
        const localSettingsMap: { [id: string]: TankAlertSettings } = {};
        for (let i = 1; i <= 6; i++) {
          const s = await dbService.getLocalAlertSettings(String(i));
          localSettingsMap[String(i)] = s;
        }
        setTankAlertSettings(localSettingsMap);
      }

      // 2. Recipients from API or local fallback
      try {
        const recipRes = await api.alerts.getRecipients();
        if (recipRes.recipients) {
          setRecipients(recipRes.recipients);
          for (const r of recipRes.recipients) {
            await dbService.saveLocalRecipient(r);
          }
        }
      } catch {
        const localRecips = await dbService.getLocalRecipients();
        setRecipients(localRecips);
      }

      // 3. Load logs
      await loadNotificationLogs();

      // 4. Load system email & corporate SMTP config
      await loadSystemEmailSettings();
    } catch (err: any) {
      setAlertsError(err.message || 'Erro ao carregar configurações de alertas.');
    } finally {
      setLoadingAlertsData(false);
    }
  };

  const loadSystemEmailSettings = async () => {
    setLoadingSystemEmail(true);
    try {
      const res = await api.alerts.getSystemEmailSettings();
      if (res.success && res.settings) {
        setSystemEmailSettings(res.settings);
        const serverProvider = res.settings.selectedProvider || 'corporate_hossidev';
        setSelectedProvider(serverProvider);
        try {
          localStorage.setItem('hossidev_selected_email_provider', serverProvider);
        } catch {}

        if (res.settings.corporate) {
          setCorpFromName(res.settings.corporate.fromName || 'water.report.@hossidev.com');
          setCorpFromAddress(res.settings.corporate.fromAddress || 'water.report@hossidev.com');
          setCorpSmtpHost(res.settings.corporate.smtpHost || 'mail.hossidev.com');
          setCorpSmtpPort(res.settings.corporate.smtpPort || 465);
          setCorpSmtpUser(res.settings.corporate.smtpUser || 'water.report@hossidev.com');
          setCorpSecurity(res.settings.corporate.security || 'SSL');
          setCorpHasPassword(Boolean(res.settings.corporate.hasPassword));
          setCorpLastTestAt(res.settings.corporate.lastTestAt);
          setCorpLastTestStatus(res.settings.corporate.lastTestStatus);
          setCorpLastTestStage(res.settings.corporate.lastTestStage || null);
          setCorpLastTestError(res.settings.corporate.lastTestError);
          setCorpLastTestDetails(res.settings.corporate.lastTestDetails || null);
          setCorpLastTestCategory(res.settings.corporate.lastTestCategory || null);
        }

        if (res.settings.gmail) {
          setGmailFromName(res.settings.gmail.fromName || 'Hossidev Water Monitor');
          setGmailFromAddress(res.settings.gmail.fromAddress || 'etakizomba@gmail.com');
          setGmailSmtpHost(res.settings.gmail.smtpHost || 'smtp.gmail.com');
          setGmailSmtpPort(res.settings.gmail.smtpPort || 587);
          setGmailSmtpUser(res.settings.gmail.smtpUser || 'etakizomba@gmail.com');
          setGmailHasPassword(Boolean(res.settings.gmail.hasPassword));
        }
      }
    } catch (err: any) {
      console.warn('Erro ao carregar configurações de e-mail corporativo:', err);
    } finally {
      setLoadingSystemEmail(false);
    }
  };

  // Immediate persistence when clicking the provider card (persists across reload and closing)
  const handleSelectProvider = async (newProvider: EmailProviderType) => {
    if (currentUser.role !== 'admin') return;

    // Fast-path: optimistic UI update & localStorage persistence
    setSelectedProvider(newProvider);
    try {
      localStorage.setItem('hossidev_selected_email_provider', newProvider);
    } catch {}

    setSwitchingProvider(newProvider);
    setSystemEmailError(null);
    setSystemEmailSuccess(null);

    try {
      const res = await api.alerts.updateSystemEmailSettings({
        selectedProvider: newProvider,
      });

      if (res.success && res.settings) {
        setSystemEmailSettings(res.settings);
        const persisted = res.settings.selectedProvider || newProvider;
        setSelectedProvider(persisted);
        try {
          localStorage.setItem('hossidev_selected_email_provider', persisted);
        } catch {}

        const label =
          persisted === 'corporate_hossidev'
            ? 'E-mail Corporativo Hossidev (mail.hossidev.com:465)'
            : 'Gmail (smtp.gmail.com:587)';
        setSystemEmailSuccess(
          `Provedor Ativo gravado permanentemente como "${label}". Esta preferência fica guardada no servidor e no navegador, mantendo-se ativa mesmo ao recarregar ou fechar a página.`
        );
      }
    } catch (err: any) {
      console.error('Erro ao guardar provedor ativo no servidor:', err);
      setSystemEmailError(
        'Aviso: O provedor foi selecionado localmente, mas não pôde ser sincronizado com o servidor: ' +
          (err.message || 'Erro de rede')
      );
    } finally {
      setSwitchingProvider(null);
    }
  };

  const handleSaveSystemEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSystemEmail(true);
    setSystemEmailError(null);
    setSystemEmailSuccess(null);

    const cleanCorpFrom = corpFromAddress.trim().toLowerCase();
    if (!cleanCorpFrom || !cleanCorpFrom.includes('@') || cleanCorpFrom.endsWith('.')) {
      setSystemEmailError('Endereço de e-mail do remetente corporativo inválido. Verifique se digitou water.report@hossidev.com sem ponto final no domínio.');
      setSavingSystemEmail(false);
      return;
    }

    try {
      const payload: any = {
        selectedProvider,
        corporate: {
          fromName: corpFromName.trim(),
          fromAddress: cleanCorpFrom,
          smtpHost: corpSmtpHost.trim(),
          smtpPort: Number(corpSmtpPort),
          smtpUser: corpSmtpUser.trim(),
          security: corpSecurity,
          secure: corpSecurity === 'SSL' || Number(corpSmtpPort) === 465,
        },
        gmail: {
          fromName: gmailFromName.trim(),
          fromAddress: gmailFromAddress.trim().toLowerCase(),
          smtpHost: gmailSmtpHost.trim(),
          smtpPort: Number(gmailSmtpPort),
          smtpUser: gmailSmtpUser.trim(),
        },
      };

      if (corpSmtpPassword && corpSmtpPassword.trim().length > 0) {
        payload.corporate.smtpPassword = corpSmtpPassword.trim();
      }
      if (gmailSmtpPassword && gmailSmtpPassword.trim().length > 0) {
        payload.gmail.smtpPassword = gmailSmtpPassword.trim();
      }

      const res = await api.alerts.updateSystemEmailSettings(payload);
      if (res.success) {
        setSystemEmailSuccess('Configurações de e-mail e provedor guardadas com sucesso no servidor e persistentes no sistema.');
        setCorpSmtpPassword('');
        setGmailSmtpPassword('');
        if (res.settings) {
          setSystemEmailSettings(res.settings);
          if (res.settings.selectedProvider) {
            setSelectedProvider(res.settings.selectedProvider);
            try {
              localStorage.setItem('hossidev_selected_email_provider', res.settings.selectedProvider);
            } catch {}
          }
          setCorpHasPassword(Boolean(res.settings.corporate?.hasPassword));
          setGmailHasPassword(Boolean(res.settings.gmail?.hasPassword));
        }
      }
    } catch (err: any) {
      setSystemEmailError(err.message || 'Erro ao guardar configurações de e-mail.');
    } finally {
      setSavingSystemEmail(false);
    }
  };

  const handleTestCorporateConnection = async () => {
    setTestingSystemEmail(true);
    setSystemEmailError(null);
    setCorpTestFeedback(null);

    const targetRecipient = (corpTestRecipient || currentUser.email || 'water.report@hossidev.com').trim();
    if (!targetRecipient || !targetRecipient.includes('@')) {
      setSystemEmailError('Indique um endereço de e-mail válido para receber a mensagem de teste.');
      setTestingSystemEmail(false);
      return;
    }

    try {
      const customCorpConfig: any = {
        fromName: corpFromName.trim(),
        fromAddress: corpFromAddress.trim(),
        smtpHost: corpSmtpHost.trim(),
        smtpPort: Number(corpSmtpPort),
        smtpUser: corpSmtpUser.trim(),
        security: corpSecurity,
        secure: corpSecurity === 'SSL' || Number(corpSmtpPort) === 465,
      };
      if (corpSmtpPassword && corpSmtpPassword.trim()) {
        customCorpConfig.plainPassword = corpSmtpPassword.trim();
      }

      const res = await api.alerts.testSystemEmailSettings({
        provider: selectedProvider,
        recipientEmail: targetRecipient,
        corporateConfig: customCorpConfig,
      });

      setCorpTestFeedback({
        stage: res.stage,
        success: res.success,
        message: res.message,
        messageId: res.messageId,
        category: res.errorCategory,
        details: res.errorDetails,
      });

      setCorpLastTestAt(res.lastTestAt || new Date().toISOString());
      setCorpLastTestStatus(res.success ? 'success' : 'failed');
      setCorpLastTestStage(res.stage);
      setCorpLastTestError(res.success ? null : res.message);
      setCorpLastTestDetails(res.errorDetails || null);
      setCorpLastTestCategory(res.errorCategory || null);

      if (res.success) {
        setSystemEmailSuccess(`✓ Teste bem-sucedido: ${res.message}`);
      } else {
        setSystemEmailError(`Falha no teste: ${res.message}`);
      }
    } catch (err: any) {
      const msg = err.message || 'Erro ao realizar teste de conexão SMTP.';
      setSystemEmailError(msg);
      setCorpTestFeedback({
        stage: 'failed',
        success: false,
        message: msg,
      });
      setCorpLastTestStatus('failed');
      setCorpLastTestStage('failed');
    } finally {
      setTestingSystemEmail(false);
    }
  };


  const handleSaveTankSettings = async (tankId: string) => {
    const s = tankAlertSettings[tankId];
    if (!s) return;

    if (s.lowLevelThresholdPercent < 0 || s.lowLevelThresholdPercent > 100) {
      setAlertsError(`O limite de alerta do Tanque ${tankId} deve estar entre 0% e 100%.`);
      return;
    }
    if (s.rearmThresholdPercent < 0 || s.rearmThresholdPercent > 100) {
      setAlertsError(`O limite de rearmamento do Tanque ${tankId} deve estar entre 0% e 100%.`);
      return;
    }
    if (s.rearmThresholdPercent < s.lowLevelThresholdPercent) {
      setAlertsError(`O limite de rearmamento (${s.rearmThresholdPercent}%) deve ser maior ou igual ao limite de alerta (${s.lowLevelThresholdPercent}%).`);
      return;
    }

    setSavingTankSettingsId(tankId);
    setAlertsError(null);
    setAlertsSuccess(null);
    try {
      await api.alerts.updateSettings(tankId, s);
      await dbService.saveLocalAlertSettings(s);
      setAlertsSuccess(`Definições do Tanque ${tankId} guardadas com sucesso.`);
      setTimeout(() => setAlertsSuccess(null), 4000);
    } catch (err: any) {
      await dbService.saveLocalAlertSettings(s);
      setAlertsSuccess(`Definições salvas localmente (offline): ${err.message}`);
      setTimeout(() => setAlertsSuccess(null), 4000);
    } finally {
      setSavingTankSettingsId(null);
    }
  };

  const handleAddRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlertsError(null);
    setAlertsSuccess(null);

    // Validation
    if (!isValidEmail(newRecipEmail)) {
      setAlertsError('Informe um endereço de e-mail válido (ex: operador@condominio.ao).');
      return;
    }

    setSavingRecipient(true);
    try {
      const res = await api.alerts.createRecipient({
        tankId: newRecipTankId ? newRecipTankId : null,
        name: newRecipName.trim() || 'Contacto Operacional',
        email: newRecipEmail.trim().toLowerCase(),
        enabled: true,
        priority: Number(newRecipPriority) || 1,
      });

      if (res.recipient) {
        await dbService.saveLocalRecipient(res.recipient);
        setRecipients((prev) => [...prev, res.recipient]);
      }

      setAlertsSuccess('Contacto cadastrado com sucesso!');
      setShowAddRecipientForm(false);
      setNewRecipName('');
      setNewRecipEmail('');
      setTimeout(() => setAlertsSuccess(null), 4000);
    } catch (err: any) {
      setAlertsError(err.message || 'Erro ao cadastrar destinatário.');
    } finally {
      setSavingRecipient(false);
    }
  };

  const handleOpenEditRecipient = (r: AlertRecipient) => {
    setEditingRecipient(r);
    setEditRecipName(r.name || '');
    setEditRecipEmail(r.email || '');
    setEditRecipTankId(r.tankId || '');
    setEditRecipPriority(r.priority || 1);
    setEditRecipEnabled(r.enabled !== false);
  };

  const handleSaveEditRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecipient) return;

    if (!isValidEmail(editRecipEmail)) {
      setAlertsError('Informe um endereço de e-mail válido para este destinatário.');
      return;
    }

    setSavingEditRecipient(true);
    setAlertsError(null);
    try {
      const res = await api.alerts.updateRecipient(editingRecipient.id, {
        name: editRecipName.trim() || 'Contacto Operacional',
        email: editRecipEmail.trim().toLowerCase(),
        tankId: editRecipTankId ? editRecipTankId : null,
        priority: Number(editRecipPriority) || 1,
        enabled: editRecipEnabled,
      });

      if (res.recipient) {
        await dbService.saveLocalRecipient(res.recipient);
        setRecipients((prev) => prev.map((r) => (r.id === res.recipient.id ? res.recipient : r)));
      }

      setAlertsSuccess('Contacto atualizado com sucesso!');
      setEditingRecipient(null);
      setTimeout(() => setAlertsSuccess(null), 3000);
    } catch (err: any) {
      setAlertsError(err.message || 'Erro ao atualizar destinatário.');
    } finally {
      setSavingEditRecipient(false);
    }
  };

  const handleToggleRecipientActive = async (r: AlertRecipient) => {
    try {
      const newEnabled = !r.enabled;
      const res = await api.alerts.updateRecipient(r.id, { enabled: newEnabled });
      if (res.recipient) {
        await dbService.saveLocalRecipient(res.recipient);
        setRecipients((prev) => prev.map((item) => (item.id === r.id ? res.recipient : item)));
      }
      setAlertsSuccess(`Contacto ${newEnabled ? 'ativado' : 'desativado'} com sucesso.`);
      setTimeout(() => setAlertsSuccess(null), 3000);
    } catch (err: any) {
      setAlertsError(err.message || 'Erro ao alterar estado do contacto.');
    }
  };

  const handleDeleteRecipientClick = (id: string) => {
    setConfirmDeleteRecipientId(id);
  };

  const handleConfirmDeleteRecipient = async () => {
    if (!confirmDeleteRecipientId) return;
    const id = confirmDeleteRecipientId;
    try {
      await api.alerts.deleteRecipient(id);
      await dbService.deleteLocalRecipient(id);
      setRecipients((prev) => prev.filter((r) => r.id !== id));
      setAlertsSuccess('Contacto removido com sucesso.');
      setTimeout(() => setAlertsSuccess(null), 3000);
    } catch (err: any) {
      setAlertsError(err.message || 'Erro ao remover contacto.');
    } finally {
      setConfirmDeleteRecipientId(null);
    }
  };

  const handleOpenTestEmailConfirm = () => {
    if (!isValidEmail(testEmailTo)) {
      setTestFeedback('E-mail de destino inválido para teste.');
      return;
    }
    setTestFeedback(null);
    setConfirmTestModalOpen(true);
  };

  const handleExecuteTestEmail = async () => {
    setConfirmTestModalOpen(false);
    setTestEmailSending(true);
    setTestFeedback(null);
    try {
      const res = await api.alerts.testEmail(testEmailTo);
      setTestFeedback(res.message || 'E-mail de teste enviado com sucesso!');
      await loadNotificationLogs();
    } catch (err: any) {
      setTestFeedback(`Falha no teste de e-mail: ${err.message}`);
    } finally {
      setTestEmailSending(false);
    }
  };

  const handleRetryNotification = async (id: string) => {
    setRetryingLogId(id);
    try {
      const res = await api.alerts.retryNotification(id);
      setAlertsSuccess(res.message || 'Reenvio processado.');
      await loadNotificationLogs();
      setTimeout(() => setAlertsSuccess(null), 3000);
    } catch (err: any) {
      setAlertsError(err.message || 'Falha ao reenviar notificação.');
    } finally {
      setRetryingLogId(null);
    }
  };

  // Load Users List
  const loadUsers = async () => {
    setLoadingUsers(true);
    setUserError(null);
    try {
      const res = await api.admin.getUsers();
      setUsers(res.users);
    } catch (err: any) {
      setUserError(err.message || 'Erro ao carregar usuários.');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Load DB Stats
  const loadStats = async () => {
    try {
      const res = await api.admin.getStats();
      if (res.success) {
        setDbStats(res.stats);
      }
    } catch (err) {
      console.warn('Erro ao carregar estatísticas do banco:', err);
    }
  };

  // Load Tanks Configuration
  const loadTanks = async () => {
    setLoadingTanks(true);
    try {
      const res = await api.admin.getTanks();
      if (res.success && Array.isArray(res.tanks)) {
        const caps: Record<number, number> = {};
        for (const t of res.tanks) {
          caps[t.id] = t.capacityLiters || (t.id <= 2 ? 20000 : t.id <= 4 ? 25000 : 30000);
        }
        setTankCapacities(caps);
      }
    } catch (err) {
      console.warn('Erro ao carregar capacidades dos reservatórios:', err);
    } finally {
      setLoadingTanks(false);
    }
  };

  // Load System Config
  const loadConfig = async () => {
    setConfigLoading(true);
    try {
      const res = await api.admin.getConfig();
      if (res.success && res.config) {
        setSystemConfig((prev) => ({
          ...prev,
          ...res.config,
        }));
      }
    } catch (err: any) {
      setConfigError(err.message || 'Erro ao carregar definições do sistema.');
    } finally {
      setConfigLoading(false);
    }
  };

  // Load User SMTP Configuration
  const loadUserSmtpConfig = async () => {
    setLoadingSmtp(true);
    setSmtpError(null);
    try {
      const res = await api.me.getSmtp();
      if (res && res.config) {
        setSmtpHost(res.config.smtpHost || 'smtp.gmail.com');
        setSmtpPort(res.config.smtpPort || 587);
        setSmtpUser(res.config.smtpUser || 'etakizomba@gmail.com');
        setMailFrom(res.config.mailFrom || res.config.smtpUser || 'etakizomba@gmail.com');
        setSmtpSecurity(res.config.security || (res.config.smtpPort === 465 ? 'SSL' : 'STARTTLS'));
        setSmtpEnabled(res.config.enabled !== false);
        setHasStoredPassword(Boolean(res.config.hasPassword));
        setIsSmtpConfigured(Boolean(res.isConfigured));
        setSmtpLastTestAt(res.config.lastTestAt);
        setSmtpLastTestStatus(res.config.lastTestStatus);
        setSmtpLastTestError(res.config.lastTestError);
        setSmtpUpdatedAt(res.config.updatedAt);
        setSmtpPassword('');
      }
    } catch (err: any) {
      console.warn('Erro ao carregar configuração SMTP:', err);
    } finally {
      setLoadingSmtp(false);
    }
  };

  // Save User SMTP Configuration
  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpError(null);
    setSmtpSuccess(null);

    if (!smtpHost.trim()) {
      setSmtpError('Servidor SMTP inválido.');
      return;
    }

    const portNum = Number(smtpPort);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setSmtpError('Porta SMTP inválida.');
      return;
    }

    if (!smtpUser.trim()) {
      setSmtpError('Usuário SMTP obrigatório.');
      return;
    }

    if (!isValidEmail(mailFrom.trim())) {
      setSmtpError('E-mail remetente inválido.');
      return;
    }

    if (!hasStoredPassword && !smtpPassword.trim()) {
      setSmtpError('Senha SMTP obrigatória na primeira configuração.');
      return;
    }

    setSavingSmtp(true);
    try {
      const res = await api.me.saveSmtp({
        smtpHost: smtpHost.trim(),
        smtpPort: portNum,
        smtpUser: smtpUser.trim(),
        smtpPassword: smtpPassword.trim() || undefined,
        mailFrom: mailFrom.trim(),
        security: smtpSecurity,
        enabled: smtpEnabled,
      });

      setSmtpSuccess(res.message || 'Configuração guardada com sucesso.');
      setIsSmtpConfigured(true);
      setHasStoredPassword(true);
      setSmtpUpdatedAt(res.config?.updatedAt || new Date().toISOString());
      setSmtpPassword('');
    } catch (err: any) {
      setSmtpError(err.message || 'Não foi possível guardar a configuração.');
    } finally {
      setSavingSmtp(false);
    }
  };

  // Test User SMTP Configuration
  const handleTestSmtp = async () => {
    setSmtpError(null);
    setSmtpSuccess(null);

    if (!smtpHost.trim()) {
      setSmtpError('Servidor SMTP inválido.');
      return;
    }
    const portNum = Number(smtpPort);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setSmtpError('Porta SMTP inválida.');
      return;
    }
    if (!smtpUser.trim()) {
      setSmtpError('Usuário SMTP obrigatório.');
      return;
    }
    if (!isValidEmail(mailFrom.trim())) {
      setSmtpError('E-mail remetente inválido.');
      return;
    }
    if (!hasStoredPassword && !smtpPassword.trim()) {
      setSmtpError('Informe a senha SMTP antes de testar.');
      return;
    }

    setTestingSmtp(true);
    try {
      const res = await api.me.testSmtp({
        smtpHost: smtpHost.trim(),
        smtpPort: portNum,
        smtpUser: smtpUser.trim(),
        smtpPassword: smtpPassword.trim() || undefined,
        mailFrom: mailFrom.trim(),
        security: smtpSecurity,
      });

      setSmtpSuccess(res.message || 'Configuração testada com sucesso. Verifique a sua caixa de entrada.');
      setSmtpLastTestAt(res.lastTestAt || new Date().toISOString());
      setSmtpLastTestStatus('success');
      setSmtpLastTestError(null);
    } catch (err: any) {
      setSmtpError(err.message || 'Não foi possível testar a configuração. Verifique o servidor, a porta, a segurança e as credenciais.');
      setSmtpLastTestAt(new Date().toISOString());
      setSmtpLastTestStatus('failed');
      setSmtpLastTestError(err.message || 'Falha na conexão SMTP');
    } finally {
      setTestingSmtp(false);
    }
  };

  // Clear / Reset SMTP Configuration
  const handleClearSmtp = async () => {
    if (!window.confirm('Deseja realmente limpar e remover a configuração SMTP salva na sua conta?')) return;
    setSmtpError(null);
    setSmtpSuccess(null);
    try {
      await api.me.deleteSmtp();
      setSmtpHost('smtp.gmail.com');
      setSmtpPort(587);
      setSmtpUser('etakizomba@gmail.com');
      setMailFrom('etakizomba@gmail.com');
      setSmtpSecurity('STARTTLS');
      setSmtpEnabled(true);
      setSmtpPassword('');
      setHasStoredPassword(false);
      setIsSmtpConfigured(false);
      setSmtpLastTestAt(null);
      setSmtpLastTestStatus(null);
      setSmtpLastTestError(null);
      setSmtpSuccess('Configuração limpa com sucesso.');
    } catch (err: any) {
      setSmtpError(err.message || 'Erro ao limpar configuração.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUserSmtpConfig();
      loadSystemEmailSettings();
      if (currentUser.role === 'admin') {
        loadUsers();
        loadStats();
        loadConfig();
        loadTanks();
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  // Handle Save Tank Capacities
  const handleSaveTankCapacities = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingTanks(true);
    setTanksError(null);
    setTanksSuccess(null);
    try {
      const res = await api.admin.updateTankCapacities(tankCapacities);
      if (res.success) {
        setTanksSuccess('Capacidades volumétricas dos 6 reservatórios salvas e sincronizadas com sucesso no SCADA!');
        onSystemConfigChanged?.();
      }
    } catch (err: any) {
      setTanksError(err.message || 'Erro ao salvar capacidades dos reservatórios.');
    } finally {
      setSavingTanks(false);
    }
  };

  // Handle Reset Tank Capacities to Engineering Defaults
  const handleResetTankCapacities = async () => {
    setSavingTanks(true);
    setTanksError(null);
    setTanksSuccess(null);
    try {
      const res = await api.admin.resetTankCapacities();
      if (res.success) {
        setTankCapacities({
          1: 20000,
          2: 20000,
          3: 25000,
          4: 25000,
          5: 30000,
          6: 30000,
        });
        setTanksSuccess('Capacidades redefinidas para o padrão de projeto de engenharia (150.000 L total)!');
        onSystemConfigChanged?.();
      }
    } catch (err: any) {
      setTanksError(err.message || 'Erro ao redefinir capacidades.');
    } finally {
      setSavingTanks(false);
    }
  };

  // Handle Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);
    setUserSuccess(null);

    if (newUsername.trim().length < 3) {
      setUserError('O nome de usuário deve ter no mínimo 3 caracteres.');
      return;
    }

    if (newPassword.length < 6) {
      setUserError('A senha inicial deve ter no mínimo 6 caracteres.');
      return;
    }

    try {
      const res = await api.admin.createUser({
        username: newUsername.trim(),
        name: newName.trim() || newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        permittedTankIds: newRole === 'admin' ? [1, 2, 3, 4, 5, 6] : newPermittedTanks,
      });

      setUserSuccess(`Usuário @${newUsername.trim()} cadastrado com sucesso!`);
      setShowCreateForm(false);
      setNewUsername('');
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      setNewPermittedTanks([1, 2, 3, 4, 5, 6]);
      loadUsers();
      loadStats();
    } catch (err: any) {
      setUserError(err.message || 'Erro ao criar usuário.');
    }
  };

  // Start Editing User
  const handleStartEdit = (user: UserManagementItem) => {
    setEditingUserId(user.id);
    setEditUsername(user.username);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditPermittedTanks(user.permittedTankIds || [1, 2]);
    setEditPassword('');
    setUserError(null);
    setUserSuccess(null);
  };

  // Save Edited User Data
  const handleSaveEdit = async (userId: string) => {
    setUserError(null);
    setUserSuccess(null);
    setSavingEdit(true);

    try {
      const res = await api.admin.updateUser(userId, {
        username: editUsername.trim(),
        name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
        permittedTankIds: editRole === 'admin' ? [1, 2, 3, 4, 5, 6] : editPermittedTanks,
        password: editPassword.trim().length >= 6 ? editPassword.trim() : undefined,
      });

      setUserSuccess(`Dados de @${res.user.username} atualizados com sucesso!`);
      setEditingUserId(null);

      // If current logged-in user was updated, notify parent
      if (userId === currentUser.id && onUserUpdated) {
        onUserUpdated({
          ...currentUser,
          username: res.user.username,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
          permittedTankIds: res.user.permittedTankIds,
        });
      }

      loadUsers();
    } catch (err: any) {
      setUserError(err.message || 'Erro ao salvar alterações do usuário.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Quick Password Reset
  const handleQuickResetPassword = async (userId: string, username: string) => {
    if (!quickNewPassword || quickNewPassword.length < 6) {
      setUserError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setUserError(null);
    setUserSuccess(null);

    try {
      await api.admin.resetPassword(userId, quickNewPassword);
      setUserSuccess(`Senha do usuário @${username} redefinida com sucesso!`);
      setResetPwdUserId(null);
      setQuickNewPassword('');
    } catch (err: any) {
      setUserError(err.message || 'Erro ao redefinir senha.');
    }
  };

  // Delete User
  const handleDeleteUser = async (userId: string, username: string) => {
    setUserError(null);
    setUserSuccess(null);

    try {
      await api.admin.deleteUser(userId);
      setUserSuccess(`Usuário "@${username}" removido do sistema.`);
      setDeleteConfirmUserId(null);
      loadUsers();
      loadStats();
    } catch (err: any) {
      setUserError(err.message || 'Erro ao remover usuário.');
    }
  };

  // Toggle Tank Permission in List
  const toggleTankSelection = (tankId: number, currentList: number[], setter: (v: number[]) => void) => {
    if (currentList.includes(tankId)) {
      if (currentList.length === 1) {
        setUserError('O usuário deve ter permissão para pelo menos um reservatório.');
        return;
      }
      setter(currentList.filter((id) => id !== tankId));
    } else {
      setter([...currentList, tankId]);
    }
  };

  // Select all tanks
  const handleSelectAllTanks = (setter: (v: number[]) => void) => {
    setter([1, 2, 3, 4, 5, 6]);
  };

  // Download Backup JSON
  const handleDownloadBackup = async () => {
    setBackupLoading(true);
    try {
      const backupData = await api.admin.getBackup();
      const now = new Date();
      const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `hossidev-scada-backup-${dateStr}.json`;

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setUserSuccess(`Backup completo exportado com sucesso: ${filename}`);
      loadStats();
    } catch (err: any) {
      setRestoreError(err.message || 'Erro ao gerar arquivo de backup.');
    } finally {
      setBackupLoading(false);
    }
  };

  // Handle Restore File Selection
  const handleRestoreFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreError(null);
    setRestoreSuccess(null);
    setRestorePreview(null);

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setRestoreError('Por favor selecione um arquivo válido no formato .json');
      return;
    }

    setRestoreFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Formato de backup inválido.');
        }

        if (!Array.isArray(parsed.users) || !parsed.currentTanks) {
          throw new Error('O arquivo de backup não contém a estrutura compatível do Hossidev SCADA.');
        }

        setRestorePreview({
          version: parsed.metadata?.version || '2.x',
          exportedAt: parsed.metadata?.exportedAt || 'Desconhecida',
          usersCount: parsed.users?.length || 0,
          historyCount: parsed.telemetryHistory?.length || 0,
          logsCount: parsed.logs?.length || 0,
          data: parsed,
        });
      } catch (err: any) {
        setRestoreError(`Arquivo corrompido ou incompatível: ${err.message}`);
        setRestoreFile(null);
        setRestorePreview(null);
      }
    };
    reader.readAsText(file);
  };

  // Execute Restore
  const handleExecuteRestore = async () => {
    if (!restorePreview || !restorePreview.data) return;

    setRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(null);

    try {
      const res = await api.admin.restoreBackup(restorePreview.data);
      setRestoreSuccess(
        `Banco de dados restaurado com sucesso! (${res.stats?.usersCount || 0} usuários e ${res.stats?.historyCount || 0} registros históricos recuperados)`
      );
      setRestorePreview(null);
      setRestoreFile(null);
      loadUsers();
      loadStats();
      loadConfig();
      if (onSystemConfigChanged) onSystemConfigChanged();
    } catch (err: any) {
      setRestoreError(err.message || 'Falha ao restaurar banco de dados.');
    } finally {
      setRestoring(false);
    }
  };

  // Save System Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigSuccess(null);
    setConfigError(null);

    try {
      const res = await api.admin.updateConfig(systemConfig);
      setConfigSuccess('Definições do sistema atualizadas e salvas com sucesso!');
      if (onSystemConfigChanged) onSystemConfigChanged();
    } catch (err: any) {
      setConfigError(err.message || 'Erro ao salvar definições do sistema.');
    } finally {
      setConfigSaving(false);
    }
  };

  // Filtered Users List
  const filteredUsers = users.filter((u) => {
    if (!searchUser.trim()) return true;
    const q = searchUser.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div
      id="settingsManagementModal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="glass-modal rounded-[2.5rem] w-full max-w-4xl overflow-hidden flex flex-col shadow-2xl border border-slate-800 max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Definições do Sistema & Gestão de Usuários</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  ADMINISTRADOR
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Controle de perfis de operadores, parâmetros SCADA e backup completo
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-slate-900/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-slate-800/60 bg-slate-950/40 overflow-x-auto">
          {/* Minha Conta (Configuração SMTP) */}
          <button
            id="tab-my-account-smtp-btn"
            onClick={() => {
              setActiveTab('my-account');
              loadUserSmtpConfig();
              setSmtpError(null);
              setSmtpSuccess(null);
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'my-account'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Mail className="w-4 h-4 text-cyan-300" />
            <span>Minha conta (Configuração SMTP)</span>
          </button>

          {currentUser.role === 'admin' && (
            <>
              <button
                onClick={() => {
                  setActiveTab('users');
                  setUserError(null);
                  setUserSuccess(null);
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'users'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Gestão de Usuários ({users.length})</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('tanks');
                  loadTanks();
                  setTanksError(null);
                  setTanksSuccess(null);
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'tanks'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Droplets className="w-4 h-4" />
                <span>Capacidades dos Reservatórios</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              setActiveTab('alerts');
              loadAlertsData();
              setAlertsError(null);
              setAlertsSuccess(null);
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'alerts'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Alertas e Notificações</span>
          </button>

          {currentUser.role === 'admin' && (
            <>
              <button
                onClick={() => {
                  setActiveTab('system');
                  loadConfig();
                  setUserError(null);
                  setUserSuccess(null);
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'system'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Definições do SCADA</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('backup');
                  loadStats();
                  setUserError(null);
                  setUserSuccess(null);
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  activeTab === 'backup'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Backup & Restauração</span>
              </button>
            </>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* TAB 0: MINHA CONTA -> CONFIGURAÇÃO SMTP */}
          {activeTab === 'my-account' && (
            <div className="space-y-5">
              {/* Top Banner Card */}
              <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">Configuração SMTP</h3>
                    <p className="text-xs text-slate-400">
                      Defina os dados usados para enviar alertas e notificações por e-mail.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 ${
                      isSmtpConfigured && smtpEnabled
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : isSmtpConfigured
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSmtpConfigured && smtpEnabled
                          ? 'bg-emerald-400 animate-pulse'
                          : isSmtpConfigured
                          ? 'bg-amber-400'
                          : 'bg-slate-500'
                      }`}
                    />
                    {isSmtpConfigured
                      ? smtpEnabled
                        ? 'Configuração Ativa'
                        : 'Configuração Inativa'
                      : 'Não Configurado'}
                  </span>
                </div>
              </div>

              {/* Status & Diagnostic Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                    Estado da configuração
                  </span>
                  <span className="text-xs font-bold text-slate-200 mt-1 block font-mono">
                    {isSmtpConfigured
                      ? smtpEnabled
                        ? 'Ativo (Pronto)'
                        : 'Pausado (Inativo)'
                      : 'Aguardando configuração'}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                    Usuário Autenticado
                  </span>
                  <span className="text-xs font-bold text-cyan-300 mt-1 block truncate">
                    {currentUser.name} (@{currentUser.username})
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                    Última atualização
                  </span>
                  <span className="text-xs font-mono text-slate-300 mt-1 block">
                    {smtpUpdatedAt ? new Date(smtpUpdatedAt).toLocaleString('pt-BR') : 'Nunca atualizado'}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                    Resultado do último teste
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {smtpLastTestStatus === 'success' ? (
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sucesso
                      </span>
                    ) : smtpLastTestStatus === 'failed' ? (
                      <span className="text-xs text-rose-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Falha
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 font-mono">Nenhum teste</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Success / Error Alerts */}
              {smtpSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                  <span>{smtpSuccess}</span>
                </div>
              )}
              {smtpError && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                  <span>{smtpError}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSaveSmtp} className="glass-panel p-6 rounded-3xl space-y-5 border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Servidor SMTP */}
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Servidor SMTP <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.gmail.com"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-cyan-400 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Ex: smtp.gmail.com, smtp.office365.com, mail.seuservidor.com
                    </span>
                  </div>

                  {/* Porta SMTP */}
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Porta <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSmtpPort(val);
                        if (val === 465) {
                          setSmtpSecurity('SSL');
                        } else if (val === 587) {
                          setSmtpSecurity('STARTTLS');
                        }
                      }}
                      placeholder="587"
                      min={1}
                      max={65535}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-cyan-400 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Padrão: 587 (STARTTLS) ou 465 (SSL/TLS)
                    </span>
                  </div>

                  {/* Usuário SMTP */}
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Usuário SMTP <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="etakizomba@gmail.com"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-cyan-400 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Endereço de login da conta remetente
                    </span>
                  </div>

                  {/* Senha SMTP */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-300">
                        Senha SMTP {!hasStoredPassword && <span className="text-rose-400">*</span>}
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {showPassword ? (
                          <>
                            <EyeOff className="w-3 h-3" />
                            <span>Ocultar senha</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" />
                            <span>Mostrar senha</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        placeholder={hasStoredPassword ? '- - - - - - - -' : 'Digite a senha ou App Password'}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-cyan-400 font-mono tracking-wider"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {hasStoredPassword
                        ? 'Senha protegida e salva. Deixe em branco para manter a senha anterior.'
                        : 'Para o Gmail, utilize uma App Password (Senha de App de 16 caracteres).'}
                    </span>
                  </div>

                  {/* E-mail Remetente */}
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      E-mail remetente <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="email"
                      value={mailFrom}
                      onChange={(e) => setMailFrom(e.target.value)}
                      placeholder="etakizomba@gmail.com"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-cyan-400 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Endereço exibido no cabeçalho "From" das notificações
                    </span>
                  </div>

                  {/* Segurança SMTP */}
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Segurança
                    </label>
                    <select
                      value={smtpSecurity}
                      onChange={(e) => setSmtpSecurity(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
                    >
                      <option value="STARTTLS">STARTTLS (Recomendado para porta 587)</option>
                      <option value="SSL">SSL / TLS (Recomendado para porta 465)</option>
                      <option value="NONE">Sem segurança (Não recomendado em produção)</option>
                    </select>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Criptografia de transporte recomendada: STARTTLS (587) ou SSL (465)
                    </span>
                  </div>
                </div>

                {/* Ativar envio */}
                <div className="pt-2 border-t border-slate-800">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smtpEnabled}
                      onChange={(e) => setSmtpEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700 focus:ring-cyan-500 focus:ring-offset-slate-950"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">Ativar envio</span>
                      <span className="text-[11px] text-slate-400 block">
                        Permitir que este remetente seja utilizado para enviar os alertas automáticos do condomínio
                      </span>
                    </div>
                  </label>
                </div>

                {/* Botões de Ação */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={savingSmtp || testingSmtp}
                      className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {savingSmtp ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Guardar configuração</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleTestSmtp}
                      disabled={savingSmtp || testingSmtp}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white border border-cyan-500/30 transition-all text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      title="Testa a ligação com o servidor e envia um e-mail de teste para a sua conta"
                    >
                      {testingSmtp ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                          <span>Testando conexão...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 text-cyan-400" />
                          <span>Testar configuração SMTP</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isSmtpConfigured && (
                    <button
                      type="button"
                      onClick={handleClearSmtp}
                      disabled={savingSmtp || testingSmtp}
                      className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Limpar configuração</span>
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* TAB 1: USERS MANAGEMENT (CREATE AND EDIT USERS) */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Alert Messages */}
              {userError && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{userError}</span>
                </div>
              )}

              {userSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>{userSuccess}</span>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchUser}
                    onChange={(e) => setSearchUser(e.target.value)}
                    placeholder="Buscar por nome, login, e-mail..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-2xl bg-slate-900/90 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={loadUsers}
                    className="px-3 py-2 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowCreateForm(!showCreateForm);
                      setEditingUserId(null);
                    }}
                    className="px-4 py-2 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-950/40 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{showCreateForm ? 'Fechar Cadastro' : 'Cadastrar Novo Usuário'}</span>
                  </button>
                </div>
              </div>

              {/* CREATE USER DRAWER FORM */}
              {showCreateForm && (
                <form
                  onSubmit={handleCreateUser}
                  className="p-5 rounded-3xl bg-slate-900/90 border border-cyan-500/30 space-y-4 shadow-xl animate-in fade-in"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-cyan-400" />
                      <span>Cadastrar Novo Usuário / Operador no Sistema</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nome Completo *</label>
                      <input
                        type="text"
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ex: João da Silva"
                        className="w-full px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-slate-700 text-white text-xs focus:border-cyan-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Nome de Usuário (Login) *
                      </label>
                      <input
                        type="text"
                        required
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                        placeholder="Ex: joao_operador"
                        className="w-full px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-slate-700 text-white text-xs font-mono focus:border-cyan-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">E-mail *</label>
                      <input
                        type="email"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="joao@kizomba.com"
                        className="w-full px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-slate-700 text-white text-xs focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Senha Inicial *</label>
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-slate-700 text-white text-xs focus:border-cyan-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Função / Nível de Acesso</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setNewRole('user')}
                          className={`p-2 rounded-2xl border text-xs font-bold transition-all ${
                            newRole === 'user'
                              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400'
                          }`}
                        >
                          Usuário / Operador
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNewRole('admin');
                            setNewPermittedTanks([1, 2, 3, 4, 5, 6]);
                          }}
                          className={`p-2 rounded-2xl border text-xs font-bold transition-all ${
                            newRole === 'admin'
                              ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400'
                          }`}
                        >
                          Administrador Total
                        </button>
                      </div>
                    </div>
                  </div>

                  {newRole === 'user' && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                        <label className="block text-[11px] font-semibold text-slate-300">
                          Reservatórios Permitidos para este Operador:
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setNewPermittedTanks([1, 2, 3, 4, 5, 6])}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 cursor-pointer"
                          >
                            Todos (FW1-WW2)
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewPermittedTanks([1, 2])}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 cursor-pointer"
                          >
                            Tratada (FW1-FW2)
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewPermittedTanks([3, 4])}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 cursor-pointer"
                          >
                            Pré-Tratada (RW1-RW2)
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewPermittedTanks([5, 6])}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 cursor-pointer"
                          >
                            Bruta (WW1-WW2)
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewPermittedTanks([])}
                            className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            Limpar
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {AVAILABLE_TANKS.map((tank) => {
                          const isSelected = newPermittedTanks.includes(tank.id);
                          return (
                            <button
                              key={tank.id}
                              type="button"
                              onClick={() => toggleTankSelection(tank.id, newPermittedTanks, setNewPermittedTanks)}
                              className={`p-2.5 rounded-2xl border text-left text-xs flex items-center justify-between transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-bold">{tank.name}</span>
                                <span className="text-[10px] text-slate-400">{tank.sectorLabel}</span>
                              </div>
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600 flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="px-4 py-2 rounded-2xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/40 cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Cadastrar Usuário</span>
                    </button>
                  </div>
                </form>
              )}

              {/* USERS LIST CARDS */}
              <div className="space-y-3">
                {filteredUsers.length === 0 ? (
                  <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 text-center text-slate-400 text-xs">
                    Nenhum usuário encontrado com os filtros atuais.
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isEditing = editingUserId === user.id;
                    const isResettingPwd = resetPwdUserId === user.id;
                    const isSelf = user.id === currentUser.id;

                    return (
                      <div
                        key={user.id}
                        className={`p-4 rounded-3xl border transition-all ${
                          isEditing
                            ? 'bg-slate-950/90 border-cyan-500/50 shadow-xl shadow-cyan-950/20'
                            : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        {/* Normal User Card View */}
                        {!isEditing ? (
                          <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-3 rounded-2xl ${
                                    user.role === 'admin'
                                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                  }`}
                                >
                                  <Shield className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-white">{user.name}</span>
                                    <span className="text-xs text-cyan-400 font-mono">@{user.username}</span>
                                    {isSelf && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                        Sua Conta Atual
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-400 font-mono mt-0.5">{user.email}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center">
                                <span
                                  className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                                    user.role === 'admin'
                                      ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                      : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                                  }`}
                                >
                                  {user.role === 'admin' ? 'Administrador' : 'Operador'}
                                </span>

                                <button
                                  onClick={() => handleStartEdit(user)}
                                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Editar Todos os Dados do Usuário"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Editar Dados</span>
                                </button>

                                <button
                                  onClick={() => setResetPwdUserId(isResettingPwd ? null : user.id)}
                                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
                                  title="Redefinir Senha Rapidamente"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>

                                {!isSelf && (
                                  deleteConfirmUserId === user.id ? (
                                    <div className="flex items-center gap-1.5 animate-in fade-in">
                                      <button
                                        onClick={() => handleDeleteUser(user.id, user.username)}
                                        className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer transition-colors shadow-sm"
                                        title="Confirmar exclusão definitiva"
                                      >
                                        Excluir?
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirmUserId(null)}
                                        className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                                      >
                                        Não
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteConfirmUserId(user.id)}
                                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                                      title="Excluir Usuário"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )
                                )}
                              </div>
                            </div>

                            {/* Permitted Tanks List */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60 text-xs">
                              <span className="text-[11px] text-slate-400 font-medium mr-1">Permissões de Acesso:</span>
                              {user.role === 'admin' ? (
                                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                                  Acesso Total a Todos os 6 Reservatórios (SCADA & Definições)
                                </span>
                              ) : user.permittedTankIds && user.permittedTankIds.length > 0 ? (
                                user.permittedTankIds.map((tid) => (
                                  <span
                                    key={tid}
                                    className="text-[11px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/20"
                                  >
                                    T{tid} (
                                    {AVAILABLE_TANKS.find((t) => t.id === tid)?.sector || `Tanque ${tid}`})
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-amber-400 font-mono">Sem reservatórios liberados</span>
                              )}
                            </div>

                            {/* Inline Quick Password Reset Form */}
                            {isResettingPwd && (
                              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/40 flex flex-col sm:flex-row items-center gap-2 animate-in fade-in">
                                <KeyRound className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                <span className="text-xs text-slate-300 whitespace-nowrap">
                                  Nova senha para <b>@{user.username}</b>:
                                </span>
                                <input
                                  type="password"
                                  value={quickNewPassword}
                                  onChange={(e) => setQuickNewPassword(e.target.value)}
                                  placeholder="Mínimo 6 caracteres"
                                  className="w-full sm:w-48 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
                                />
                                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                  <button
                                    onClick={() => handleQuickResetPassword(user.id, user.username)}
                                    className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                                  >
                                    Salvar Senha
                                  </button>
                                  <button
                                    onClick={() => setResetPwdUserId(null)}
                                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* COMPLETE USER DATA EDITING FORM */
                          <div className="space-y-4 animate-in fade-in">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                              <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                                <Edit3 className="w-4 h-4" />
                                <span>Editando Dados Completos do Usuário @{user.username}</span>
                              </h4>
                              <button
                                onClick={() => setEditingUserId(null)}
                                className="text-slate-400 hover:text-white"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nome Completo</label>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-cyan-500 focus:outline-none"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                  Nome de Usuário (Login)
                                </label>
                                <input
                                  type="text"
                                  value={editUsername}
                                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-cyan-500 focus:outline-none"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-300 mb-1">E-mail</label>
                                <input
                                  type="email"
                                  value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-cyan-500 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Função</label>
                                <select
                                  value={editRole}
                                  onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')}
                                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-cyan-500"
                                >
                                  <option value="user">Usuário / Operador (Acesso Restrito)</option>
                                  <option value="admin">Administrador (Controle Total do SCADA)</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                  Nova Senha (deixe em branco para não alterar)
                                </label>
                                <input
                                  type="password"
                                  value={editPassword}
                                  onChange={(e) => setEditPassword(e.target.value)}
                                  placeholder="Mínimo 6 caracteres para alterar"
                                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-cyan-500 focus:outline-none"
                                />
                              </div>
                            </div>

                            {editRole === 'user' && (
                              <div>
                                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                                  <label className="block text-[11px] font-semibold text-slate-300">
                                    Reservatórios Autorizados para Visualização:
                                  </label>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => setEditPermittedTanks([1, 2, 3, 4, 5, 6])}
                                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 cursor-pointer"
                                    >
                                      Todos (FW1-WW2)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditPermittedTanks([1, 2])}
                                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 cursor-pointer"
                                    >
                                      Tratada (FW1-FW2)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditPermittedTanks([3, 4])}
                                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 cursor-pointer"
                                    >
                                      Pré-Tratada (RW1-RW2)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditPermittedTanks([5, 6])}
                                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 cursor-pointer"
                                    >
                                      Bruta (WW1-WW2)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditPermittedTanks([])}
                                      className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                                    >
                                      Limpar
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {AVAILABLE_TANKS.map((tank) => {
                                    const isSelected = editPermittedTanks.includes(tank.id);
                                    return (
                                      <button
                                        key={tank.id}
                                        type="button"
                                        onClick={() =>
                                          toggleTankSelection(tank.id, editPermittedTanks, setEditPermittedTanks)
                                        }
                                        className={`p-2.5 rounded-2xl border text-left text-xs flex items-center justify-between transition-all cursor-pointer ${
                                          isSelected
                                            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                                        }`}
                                      >
                                        <div className="flex flex-col">
                                          <span className="font-bold">{tank.name}</span>
                                          <span className="text-[10px] text-slate-400">{tank.sectorLabel}</span>
                                        </div>
                                        {isSelected ? (
                                          <CheckSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                                        ) : (
                                          <Square className="w-4 h-4 text-slate-600 flex-shrink-0" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                              <button
                                onClick={() => setEditingUserId(null)}
                                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleSaveEdit(user.id)}
                                disabled={savingEdit}
                                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-950/40"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{savingEdit ? 'Salvando...' : 'Salvar Dados do Usuário'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TANK CAPACITIES (OPTIONAL VOLUMETRIC CUSTOMIZATION) */}
          {activeTab === 'tanks' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Alert Messages */}
              {tanksError && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{tanksError}</span>
                </div>
              )}

              {tanksSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>{tanksSuccess}</span>
                </div>
              )}

              {/* Informative Header Banner */}
              <div className="p-4 rounded-3xl bg-cyan-950/30 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-300 mt-0.5 sm:mt-0">
                    <Droplets className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Capacidades Volumétricas dos Reservatórios</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                        Opcional / Personalizável
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                      Como administrador, você pode opcionalmente definir a capacidade volumétrica (em Litros) de cada reservatório conforme o volume físico real instalado. Os operadores autorizados visualizarão o volume e porcentagens recalculados em tempo real.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleResetTankCapacities}
                    disabled={savingTanks}
                    className="px-3.5 py-2 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    title="Restaurar valores nominais padrão de projeto (150.000 L)"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Padrão de Fábrica</span>
                  </button>
                </div>
              </div>

              {/* Real-time Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-3xl bg-slate-900/70 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
                    <Gauge className="w-4 h-4 text-cyan-400" />
                    <span>Total Condomínio</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-cyan-300">
                    {totalCondoCapacity.toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-normal text-slate-400">L</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {(totalCondoCapacity / 1000).toFixed(1)} m³ no total
                  </div>
                </div>

                <div className="p-4 rounded-3xl bg-slate-900/70 border border-cyan-900/40">
                  <div className="flex items-center gap-1.5 text-cyan-400 text-xs mb-1">
                    <Droplets className="w-4 h-4 text-cyan-400" />
                    <span>Água Tratada (FW1+FW2)</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-cyan-300">
                    {(Number(tankCapacities[1] || 0) + Number(tankCapacities[2] || 0)).toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-normal text-slate-400">L</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {((Number(tankCapacities[1] || 0) + Number(tankCapacities[2] || 0)) / 1000).toFixed(1)} m³ (Consumo Potável)
                  </div>
                </div>

                <div className="p-4 rounded-3xl bg-slate-900/70 border border-sky-900/40">
                  <div className="flex items-center gap-1.5 text-sky-400 text-xs mb-1">
                    <Droplets className="w-4 h-4 text-sky-400" />
                    <span>Pré-Tratada (RW1+RW2)</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-sky-300">
                    {(Number(tankCapacities[3] || 0) + Number(tankCapacities[4] || 0)).toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-normal text-slate-400">L</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {((Number(tankCapacities[3] || 0) + Number(tankCapacities[4] || 0)) / 1000).toFixed(1)} m³ (Uso Geral)
                  </div>
                </div>

                <div className="p-4 rounded-3xl bg-slate-900/70 border border-amber-900/40">
                  <div className="flex items-center gap-1.5 text-amber-400 text-xs mb-1">
                    <Droplets className="w-4 h-4 text-amber-400" />
                    <span>Água Bruta (WW1+WW2)</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-amber-300">
                    {(Number(tankCapacities[5] || 0) + Number(tankCapacities[6] || 0)).toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-normal text-slate-400">L</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {((Number(tankCapacities[5] || 0) + Number(tankCapacities[6] || 0)) / 1000).toFixed(1)} m³ (Captação Poço)
                  </div>
                </div>
              </div>

              {/* Tank Cards Grid */}
              <form onSubmit={handleSaveTankCapacities} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {AVAILABLE_TANKS.map((tank) => {
                    const currentCap = Number(tankCapacities[tank.id] ?? tank.defaultCap);
                    const isDefault = currentCap === tank.defaultCap;
                    const sectorColor =
                      tank.id <= 2
                        ? 'border-cyan-500/40 bg-cyan-950/20 text-cyan-300'
                        : tank.id <= 4
                        ? 'border-sky-500/40 bg-sky-950/20 text-sky-300'
                        : 'border-amber-500/40 bg-amber-950/20 text-amber-300';
                    const nodeLabel =
                      tank.id <= 2
                        ? 'Placa Nó 1 (Principal Tratada)'
                        : tank.id <= 4
                        ? 'Placa Nó 2 (Pré-Tratada)'
                        : 'Placa Nó 3 (Água Bruta Poço)';

                    return (
                      <div
                        key={tank.id}
                        className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                      >
                        {/* Tank Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-white font-mono text-xs font-bold flex items-center justify-center">
                                T{tank.id}
                              </span>
                              <h4 className="text-sm font-bold text-white">{tank.name}</h4>
                            </div>
                            <span className="text-[11px] text-slate-400 block mt-0.5">{nodeLabel}</span>
                          </div>

                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sectorColor}`}>
                            {tank.sector}
                          </span>
                        </div>

                        {/* Capacity Input Field */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-300">
                              Capacidade Máxima (Litros)
                            </label>
                            <span className="text-[11px] font-mono font-bold text-cyan-400">
                              {(currentCap / 1000).toLocaleString('pt-BR', {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}{' '}
                              m³
                            </span>
                          </div>

                          <div className="relative">
                            <input
                              type="number"
                              min={1000}
                              max={2000000}
                              step={500}
                              required
                              value={tankCapacities[tank.id] ?? tank.defaultCap}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setTankCapacities((prev) => ({
                                  ...prev,
                                  [tank.id]: val,
                                }));
                              }}
                              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-950/90 border border-slate-700 text-white text-sm font-mono focus:border-cyan-500 focus:outline-none pr-12"
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none">
                              L
                            </span>
                          </div>
                        </div>

                        {/* Presets and Defaults info */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                          <span className="text-slate-500">
                            Padrão: <span className="font-mono text-slate-400">{tank.defaultCap.toLocaleString('pt-BR')} L</span>
                          </span>

                          {!isDefault ? (
                            <button
                              type="button"
                              onClick={() =>
                                setTankCapacities((prev) => ({
                                  ...prev,
                                  [tank.id]: tank.defaultCap,
                                }))
                              }
                              className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                            >
                              Restaurar ({tank.defaultCap / 1000} m³)
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-emerald-400/80">✓ Valor Nominal</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Save Toolbar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-3xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">
                    <span className="text-white font-medium">Nota de Operação:</span> As alterações entram em vigor imediatamente para todos os operadores conectados ao SCADA.
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="submit"
                      disabled={savingTanks}
                      className="px-6 py-2.5 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer w-full sm:w-auto justify-center"
                    >
                      <Check className="w-4 h-4" />
                      <span>{savingTanks ? 'Salvando...' : 'Salvar Capacidades dos Reservatórios'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: BACKUP & RESTAURAÇÃO COMPLETA */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              {restoreError && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{restoreError}</span>
                </div>
              )}

              {restoreSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>{restoreSuccess}</span>
                </div>
              )}

              {/* Database Overview Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span>Usuários</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-white">{dbStats?.usersCount ?? users.length}</div>
                  <div className="text-[10px] text-slate-500">Contas cadastradas</div>
                </div>

                <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Database className="w-4 h-4 text-sky-400" />
                    <span>Telemetria Real</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-cyan-400">{dbStats?.historyCount ?? 0}</div>
                  <div className="text-[10px] text-slate-500">Leituras registradas</div>
                </div>

                <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    <span>Tamanho do DB</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-emerald-400">
                    {dbStats?.fileSizeBytes ? `${(dbStats.fileSizeBytes / 1024).toFixed(1)} KB` : 'Ativo'}
                  </div>
                  <div className="text-[10px] text-slate-500">Formato JSON Persistente</div>
                </div>

                <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Último Backup</span>
                  </div>
                  <div className="text-xs font-bold font-mono text-slate-200 mt-1">
                    {dbStats?.lastBackupAt ? new Date(dbStats.lastBackupAt).toLocaleDateString() : 'Não exportado'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {dbStats?.lastBackupAt ? new Date(dbStats.lastBackupAt).toLocaleTimeString() : 'Gere seu primeiro backup'}
                  </div>
                </div>
              </div>

              {/* BACKUP EXPORT SECTION */}
              <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Exportar Backup Completo do Sistema</h3>
                      <p className="text-xs text-slate-400 max-w-xl">
                        Gera um arquivo <code className="text-cyan-300 font-mono">.json</code> contendo todos os usuários e senhas criptografadas, leituras históricas dos 6 reservatórios, definições SCADA e logs de comunicação.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleDownloadBackup}
                    disabled={backupLoading}
                    className="px-5 py-2.5 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer flex-shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>{backupLoading ? 'Gerando...' : 'Baixar Backup Completo (.JSON)'}</span>
                  </button>
                </div>
              </div>

              {/* RESTORE SECTION */}
              <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Restaurar Banco de Dados a Partir de Backup</h3>
                    <p className="text-xs text-slate-400">
                      Carregue um arquivo de backup previamente exportado para recuperar dados de usuários e histórico.
                    </p>
                  </div>
                </div>

                {/* File Upload Drop Area */}
                <div className="p-6 rounded-2xl border-2 border-dashed border-slate-700 hover:border-cyan-500/50 bg-slate-950/60 flex flex-col items-center justify-center gap-3 transition-colors text-center">
                  <Upload className="w-8 h-8 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold text-slate-200">
                      Clique para selecionar o arquivo de backup ou arraste para cá
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Suporte a arquivos .json gerados pelo Hossidev SCADA</p>
                  </div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestoreFileSelected}
                    className="hidden"
                    id="backup-file-upload-input"
                  />
                  <label
                    htmlFor="backup-file-upload-input"
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer transition-colors"
                  >
                    Procurar Arquivo no Computador
                  </label>
                </div>

                {/* Restore Preview Summary */}
                {restorePreview && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/40 space-y-3 animate-in fade-in">
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                      <FileCheck className="w-4 h-4" />
                      <span>Arquivo de Backup Validado com Sucesso!</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Versão do Sistema:</span>
                        <span className="font-bold text-white font-mono">{restorePreview.version}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Usuários a Restaurar:</span>
                        <span className="font-bold text-cyan-400 font-mono">{restorePreview.usersCount} contas</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Registros Históricos:</span>
                        <span className="font-bold text-emerald-400 font-mono">{restorePreview.historyCount} leituras</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Data do Backup:</span>
                        <span className="font-bold text-slate-200 font-mono text-[11px]">
                          {new Date(restorePreview.exportedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <span className="text-xs text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        Esta operação substituirá os dados atuais em memória e no disco.
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setRestorePreview(null);
                            setRestoreFile(null);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleExecuteRestore}
                          disabled={restoring}
                          className="px-5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-950/40"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{restoring ? 'Restaurando...' : 'Confirmar e Restaurar Banco'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SYSTEM SCADA DEFINITIONS & PARAMETERS */}
          {activeTab === 'system' && (
            <form onSubmit={handleSaveConfig} className="space-y-4">
              {configError && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{configError}</span>
                </div>
              )}

              {configSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>{configSuccess}</span>
                </div>
              )}

              <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>Parâmetros de Operação & Telemetria do Condomínio</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Empreendimento</label>
                    <input
                      type="text"
                      value={systemConfig.condominiumName || ''}
                      onChange={(e) => setSystemConfig({ ...systemConfig, condominiumName: e.target.value })}
                      placeholder="Ex: Condomínio Residencial Kizomba"
                      className="w-full px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-slate-700 text-white text-xs focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Timeout do Watchdog Serial (ms)
                    </label>
                    <input
                      type="number"
                      min={2000}
                      max={60000}
                      step={500}
                      value={systemConfig.watchdogTimeoutMs}
                      onChange={(e) =>
                        setSystemConfig({ ...systemConfig, watchdogTimeoutMs: Number(e.target.value) })
                      }
                      className="w-full px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-slate-700 text-white text-xs font-mono focus:border-cyan-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500">
                      Tempo limite sem pacotes antes de marcar o nó da central como Offline (padrão: 8000ms).
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Estimativa de Consumo Diário do Condomínio (Litros/dia)
                    </label>
                    <input
                      type="number"
                      min={1000}
                      max={200000}
                      step={500}
                      value={systemConfig.dailyConsumptionEstimateLiters || 28000}
                      onChange={(e) =>
                        setSystemConfig({
                          ...systemConfig,
                          dailyConsumptionEstimateLiters: Number(e.target.value),
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-slate-700 text-white text-xs font-mono focus:border-cyan-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500">
                      Usado para estimar com precisão as horas de autonomia em tempo real.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Limiar de Nível Baixo de Alerta (%)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={50}
                      value={systemConfig.lowLevelAlertPercentage || 20}
                      onChange={(e) =>
                        setSystemConfig({
                          ...systemConfig,
                          lowLevelAlertPercentage: Number(e.target.value),
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-2xl bg-slate-950/90 border border-slate-700 text-white text-xs font-mono focus:border-cyan-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500">
                      Nível de reserva percentual para disparar alarme visual amarelo (padrão: 20%).
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                      {systemConfig.audioAlarmEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Sintetizador de Áudio & Sirene de Falhas</span>
                      <span className="text-[11px] text-slate-400">
                        Reproduz bips de aviso no navegador quando uma prova de nível for rompida ou o reservatório estiver crítico.
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setSystemConfig({
                        ...systemConfig,
                        audioAlarmEnabled: !systemConfig.audioAlarmEnabled,
                      })
                    }
                    className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
                      systemConfig.audioAlarmEnabled
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {systemConfig.audioAlarmEnabled ? 'Habilitado' : 'Desabilitado'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                      <Droplets className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Capacidade dos 6 Reservatórios (Opcional)</span>
                      <span className="text-[11px] text-slate-400">
                        Total atual configurado:{' '}
                        <span className="text-cyan-300 font-mono font-bold">
                          {totalCondoCapacity.toLocaleString('pt-BR')} Litros
                        </span>{' '}
                        ({(totalCondoCapacity / 1000).toFixed(1)} m³)
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('tanks');
                      setTanksError(null);
                      setTanksSuccess(null);
                    }}
                    className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 transition-colors cursor-pointer"
                  >
                    Ajustar Litragem
                  </button>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="submit"
                    disabled={configSaving}
                    className="px-6 py-2.5 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{configSaving ? 'Salvando...' : 'Salvar Definições no Servidor'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* TAB 5: ALERTAS & NOTIFICAÇÕES (E-MAILS & HISTÓRICO DE ENVIOS) */}
          {/* ============================================================== */}
          {activeTab === 'alerts' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header Box */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-rose-950/40 via-slate-900/80 to-slate-900/60 border border-rose-500/30">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <Mail className="w-6 h-6" />
                  </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-rose-300/80 mb-1">
                        <span>Definições</span>
                        <span className="text-slate-500">→</span>
                        <span>Alertas e notificações</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-white font-bold">E-mails</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-white">
                          Notificações e Alertas por E-mail
                        </h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          {selectedProvider === 'corporate_hossidev'
                            ? `Provedor Ativo: E-mail Corporativo Hossidev (${corpFromAddress || 'water.report@hossidev.com'})`
                            : `Provedor Ativo: Gmail (${gmailFromAddress || 'etakizomba@gmail.com'})`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Disparo automático quando reservatório ≤ 30%, pop-up em tempo real, histerese em 35% e alternância de destinatários por tanque.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={loadAlertsData}
                    disabled={loadingAlertsData}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-300 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                    title="Atualizar lista de destinatários, limites e histórico"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingAlertsData ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </button>
                </div>

                {/* Sub-tab Pill Navigation */}
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setAlertsSubTab('provider');
                      loadSystemEmailSettings();
                    }}
                    className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                      alertsSubTab === 'provider'
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                        : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Provedor & E-mail Corporativo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAlertsSubTab('recipients')}
                    className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                      alertsSubTab === 'recipients'
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                        : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Destinatários ({recipients.length})</span>
                  </button>

                <button
                  type="button"
                  onClick={() => setAlertsSubTab('limits')}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                    alertsSubTab === 'limits'
                      ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                      : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <Droplets className="w-3.5 h-3.5" />
                  <span>Limites & Histerese (≤30% / ≥35%)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAlertsSubTab('history');
                    loadNotificationLogs();
                  }}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                    alertsSubTab === 'history'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                      : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Histórico de Envios & Falhas ({notificationLogs.emails.length})</span>
                </button>
              </div>

              {/* Permission Banner for Operators & Viewers */}
              {currentUser.role !== 'admin' && (
                <div className="p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/30 flex items-center gap-2.5 text-amber-200 text-xs">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Perfil {currentUser.role === 'user' ? 'Operador' : 'Visualizador'}:</strong> Você pode acompanhar os alertas cadastrados e o histórico de entrega. A alteração de e-mails corporativos, limites e o envio de testes são restritos ao Administrador.
                  </span>
                </div>
              )}

              {/* Alerts Banners */}
              {(alertsError || systemEmailError) && (
                <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/50 flex items-center gap-2.5 text-rose-200 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{alertsError || systemEmailError}</span>
                </div>
              )}

              {(alertsSuccess || systemEmailSuccess) && (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 flex items-center gap-2.5 text-emerald-200 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{alertsSuccess || systemEmailSuccess}</span>
                </div>
              )}

              {/* SUB-TAB 0: PROVEDOR & CONTA CORPORATIVA HOSSIDEV */}
              {alertsSubTab === 'provider' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* SELEÇÃO DO PROVEDOR ATIVO (GMAIL VS CORPORATIVO HOSSIDEV) */}
                  <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                          <Server className="w-4 h-4 text-cyan-400" />
                          Provedor Ativo para Envio de Notificações
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Escolha o servidor utilizado para disparar os alertas por e-mail para todos os contatos cadastrados.
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-950 border border-slate-700 text-slate-300 self-start sm:self-auto">
                        Envio único • Sem duplicidade
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {/* Opção A: E-mail Corporativo Hossidev */}
                      <button
                        type="button"
                        onClick={() => handleSelectProvider('corporate_hossidev')}
                        disabled={currentUser.role !== 'admin' || switchingProvider !== null}
                        className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                          selectedProvider === 'corporate_hossidev'
                            ? 'bg-gradient-to-br from-cyan-950/40 to-slate-900 border-cyan-500/60 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-500/30'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 opacity-80'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-white flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-cyan-400" />
                              E-mail Corporativo Hossidev
                            </span>
                            {switchingProvider === 'corporate_hossidev' ? (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                Salvando...
                              </span>
                            ) : selectedProvider === 'corporate_hossidev' ? (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                                <Check className="w-3 h-3 text-emerald-400" />
                                ✓ Ativo (Permanente)
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-500">Inativo (Clique para ativar)</span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-cyan-300 font-bold mb-1">
                            {corpFromAddress || 'water.report@hossidev.com'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Servidor: <strong className="text-slate-300 font-mono">mail.hossidev.com:465</strong> (TLS implícito)
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                          <span className={corpHasPassword ? 'text-emerald-400 font-mono' : 'text-amber-400 font-mono'}>
                            {corpHasPassword ? '● Credencial configurada' : '○ Senha pendente'}
                          </span>
                          <span className="text-slate-500">Porta 465 SSL</span>
                        </div>
                      </button>

                      {/* Opção B: Gmail */}
                      <button
                        type="button"
                        onClick={() => handleSelectProvider('gmail')}
                        disabled={currentUser.role !== 'admin' || switchingProvider !== null}
                        className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                          selectedProvider === 'gmail'
                            ? 'bg-gradient-to-br from-rose-950/40 to-slate-900 border-rose-500/60 shadow-lg shadow-rose-950/30 ring-1 ring-rose-500/30'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 opacity-80'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-white flex items-center gap-2">
                              <Mail className="w-4 h-4 text-rose-400" />
                              Gmail
                            </span>
                            {switchingProvider === 'gmail' ? (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                Salvando...
                              </span>
                            ) : selectedProvider === 'gmail' ? (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                                <Check className="w-3 h-3 text-emerald-400" />
                                ✓ Ativo (Permanente)
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-500">Inativo (Clique para ativar)</span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-rose-300 font-bold mb-1">
                            {gmailFromAddress || 'etakizomba@gmail.com'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Servidor: <strong className="text-slate-300 font-mono">smtp.gmail.com:587</strong> (STARTTLS)
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                          <span className={gmailHasPassword ? 'text-emerald-400 font-mono' : 'text-amber-400 font-mono'}>
                            {gmailHasPassword ? '● Credencial configurada' : '○ Senha pendente'}
                          </span>
                          <span className="text-slate-500">Porta 587 TLS</span>
                        </div>
                      </button>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                      <div className="flex items-center gap-2 text-cyan-300 font-bold">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Persistência Permanente de Provedor</span>
                      </div>
                      <p className="text-slate-400 leading-relaxed">
                        Ao clicar e definir o provedor acima, a preferência é guardada imediatamente no servidor e no armazenamento local do navegador. O provedor escolhido <strong>permanece ativo mesmo se a página for recarregada ou fechada</strong>, mudando apenas se o utilizador clicar manualmente no outro provedor.
                      </p>
                    </div>
                  </div>

                  {/* FORMULÁRIO: CONTA CORPORATIVA HOSSIDEV */}
                  <form onSubmit={handleSaveSystemEmail} className="p-6 rounded-3xl bg-slate-900/90 border border-cyan-500/30 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-cyan-400" />
                          Configuração da Conta Corporativa Hossidev
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Parâmetros oficiais para envio SMTP com segurança TLS implícita na porta 465.
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                        TLS Implícito • Validação Estrita
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Nome de Apresentação */}
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">
                          Nome de Apresentação do Remetente <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={corpFromName}
                          onChange={(e) => setCorpFromName(e.target.value)}
                          disabled={currentUser.role !== 'admin'}
                          placeholder="water.report.@hossidev.com"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Nome exibido no cabeçalho do e-mail. Nota: O ponto no nome de apresentação não é acrescentado ao endereço real de e-mail.
                        </span>
                      </div>

                      {/* Endereço de E-mail do Remetente */}
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">
                          Endereço de E-mail do Remetente <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={corpFromAddress}
                          onChange={(e) => setCorpFromAddress(e.target.value)}
                          disabled={currentUser.role !== 'admin'}
                          placeholder="water.report@hossidev.com"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Endereço oficial de envio SMTP (sem ponto final antes de @hossidev.com).
                        </span>
                      </div>

                      {/* Servidor SMTP */}
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">
                          Servidor SMTP <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={corpSmtpHost}
                          onChange={(e) => setCorpSmtpHost(e.target.value)}
                          disabled={currentUser.role !== 'admin'}
                          placeholder="mail.hossidev.com"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Servidor de envio SMTP dedicado da Hossidev.
                        </span>
                      </div>

                      {/* Porta SMTP */}
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">
                          Porta SMTP <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          value={corpSmtpPort}
                          onChange={(e) => setCorpSmtpPort(Number(e.target.value))}
                          disabled={currentUser.role !== 'admin'}
                          placeholder="465"
                          min={1}
                          max={65535}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Porta 465 (TLS implícito desde o início da ligação).
                        </span>
                      </div>

                      {/* Nome de Utilizador */}
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1">
                          Nome de Utilizador (Autenticação) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={corpSmtpUser}
                          onChange={(e) => setCorpSmtpUser(e.target.value)}
                          disabled={currentUser.role !== 'admin'}
                          placeholder="water.report@hossidev.com"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Identificador de autenticação (pode ser ajustado caso o fornecedor use outro login).
                        </span>
                      </div>

                      {/* Palavra-passe */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-slate-300">
                            Palavra-passe no Servidor {!corpHasPassword && <span className="text-rose-400">*</span>}
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowCorpPassword(!showCorpPassword)}
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                          >
                            {showCorpPassword ? (
                              <>
                                <EyeOff className="w-3 h-3" />
                                <span>Ocultar</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-3 h-3" />
                                <span>Mostrar</span>
                              </>
                            )}
                          </button>
                        </div>
                        <input
                          type={showCorpPassword ? 'text' : 'password'}
                          value={corpSmtpPassword}
                          onChange={(e) => setCorpSmtpPassword(e.target.value)}
                          disabled={currentUser.role !== 'admin'}
                          placeholder={corpHasPassword ? '••••••••••••••••' : 'Digite a palavra-passe da conta'}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none tracking-wider"
                        />
                        <div className="flex items-center justify-between mt-1 text-[10px]">
                          <span className={corpHasPassword ? 'text-emerald-400' : 'text-amber-400'}>
                            {corpHasPassword
                              ? '✓ Salva de forma segura no servidor (AES-256). Deixe em branco para manter.'
                              : '⚠️ Não configurada. Digite para salvar com segurança.'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Nota Arquitetural: Distinção entre Envio SMTP e Receção IMAP */}
                    <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-1.5 text-xs text-slate-300">
                      <div className="flex items-center gap-2 text-cyan-400 font-bold">
                        <Info className="w-4 h-4" />
                        <span>Distinção de Protocolo: Envio SMTP vs. Receção IMAP</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        O objetivo desta implementação é enviar notificações operacionais através de <strong>SMTP</strong> (porta 465 com TLS implícito). Não está configurada a leitura da caixa de entrada via IMAP. A leitura ou sincronização de mensagens requer parâmetros próprios confirmados pelo fornecedor e permanece desacoplada.
                      </p>
                    </div>

                    {/* Botões de Ação do Formulário */}
                    {currentUser.role === 'admin' && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                        <button
                          type="submit"
                          disabled={savingSystemEmail || testingSystemEmail}
                          className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {savingSystemEmail ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Guardando...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Guardar configurações</span>
                            </>
                          )}
                        </button>

                        <span className="text-[11px] text-slate-400 font-mono">
                          Provedor Ativo: <strong className="text-white">{selectedProvider === 'corporate_hossidev' ? 'E-mail Corporativo' : 'Gmail'}</strong>
                        </span>
                      </div>
                    )}
                  </form>

                  {/* SECÇÃO: TESTES E TRATAMENTO DE FALHAS REAL */}
                  <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                          <Send className="w-4 h-4 text-emerald-400" />
                          Teste Real de Ligação & Disparo de E-mail
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Testa a ligação TLS, a validação de autenticação e despacha mensagem de validação para o endereço indicado pelo administrador.
                        </p>
                      </div>

                      <span className="text-[10px] font-mono text-slate-400">
                        Provedor testado: <strong className="text-cyan-300 font-sans">{selectedProvider === 'corporate_hossidev' ? 'Hossidev Corporativo' : 'Gmail'}</strong>
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="email"
                        placeholder="exemplo@hossidev.com ou seu email"
                        value={corpTestRecipient}
                        onChange={(e) => setCorpTestRecipient(e.target.value)}
                        disabled={testingSystemEmail || currentUser.role !== 'admin'}
                        className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleTestCorporateConnection}
                        disabled={testingSystemEmail || currentUser.role !== 'admin'}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {testingSystemEmail ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-white" />
                            <span>Testando Ligação...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Enviar e-mail de teste</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Diagnóstico detalhado do teste */}
                    {corpTestFeedback && (
                      <div
                        className={`p-4 rounded-2xl border text-xs space-y-2 ${
                          corpTestFeedback.success
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                            : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold">
                          {corpTestFeedback.success ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                          )}
                          <span>
                            {corpTestFeedback.success
                              ? 'Mensagem aceite pelo servidor SMTP'
                              : `Falha no envio (${corpTestFeedback.category || 'ERRO_SMTP'})`}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          {corpTestFeedback.message}
                        </p>
                        {corpTestFeedback.messageId && (
                          <div className="text-[10px] font-mono text-cyan-300">
                            Message-ID: {corpTestFeedback.messageId}
                          </div>
                        )}
                        {corpTestFeedback.details && (
                          <div className="text-[10px] font-mono text-slate-400 bg-slate-950/60 p-2 rounded-lg overflow-x-auto">
                            Detalhes técnicos: {corpTestFeedback.details}
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                          {corpTestFeedback.success
                            ? 'Nota de integridade: A indicação de "Entregue" depende da confirmação final do fornecedor de destino. O servidor SMTP de origem aceitou a mensagem para distribuição com sucesso.'
                            : 'Por favor, revise o utilizador, a palavra-passe ou o certificado TLS conforme o diagnóstico indicado acima.'}
                        </p>
                      </div>
                    )}

                    {/* Estado e data do último teste salvo */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Data do Último Teste</span>
                        <span className="text-white font-mono mt-0.5 block">
                          {corpLastTestAt ? new Date(corpLastTestAt).toLocaleString('pt-BR') : 'Nenhum teste recente'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Estado do Último Teste</span>
                        <span
                          className={`font-bold mt-0.5 block ${
                            corpLastTestStatus === 'success'
                              ? 'text-emerald-400'
                              : corpLastTestStatus === 'failed'
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {corpLastTestStatus === 'success'
                            ? 'Aceite pelo servidor SMTP'
                            : corpLastTestStatus === 'failed'
                            ? 'Falha reportada'
                            : 'Aguardando teste'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Estágio de Execução</span>
                        <span className="text-cyan-300 font-mono text-[11px] mt-0.5 block">
                          {corpLastTestStage || 'N/D'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SECÇÃO SECUNDÁRIA: INTEGRAÇÃO GMAIL (PRESERVADA) */}
                  <div className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300 text-xs font-bold">
                        <Mail className="w-4 h-4 text-rose-400" />
                        <span>Integração Gmail (Provedor Alternativo Preservado)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGmailSettings(!showGmailSettings)}
                        className="text-xs text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                      >
                        {showGmailSettings ? 'Ocultar Detalhes' : 'Ver Parâmetros do Gmail'}
                      </button>
                    </div>

                    {showGmailSettings && (
                      <div className="pt-3 border-t border-slate-800 space-y-3 animate-in fade-in duration-150">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Remetente Gmail</span>
                            <input
                              type="email"
                              value={gmailFromAddress}
                              onChange={(e) => setGmailFromAddress(e.target.value)}
                              disabled={currentUser.role !== 'admin'}
                              placeholder="etakizomba@gmail.com"
                              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Servidor & Porta</span>
                            <input
                              type="text"
                              value={`${gmailSmtpHost}:${gmailSmtpPort}`}
                              disabled
                              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 font-mono text-xs"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                              App Password do Gmail (16 caracteres)
                            </span>
                            <input
                              type={showGmailPassword ? 'text' : 'password'}
                              value={gmailSmtpPassword}
                              onChange={(e) => setGmailSmtpPassword(e.target.value)}
                              disabled={currentUser.role !== 'admin'}
                              placeholder={gmailHasPassword ? '••••••••••••••••' : 'Defina nova senha de app'}
                              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                            />
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              {gmailHasPassword ? '✓ Credencial Gmail configurada' : '○ Nenhuma senha cadastrada'}
                            </span>
                          </div>
                        </div>

                        {currentUser.role === 'admin' && (
                          <div className="flex justify-end pt-2">
                            <button
                              type="button"
                              onClick={handleSaveSystemEmail}
                              disabled={savingSystemEmail}
                              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
                            >
                              Atualizar Parâmetros do Gmail
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 1: RECIPIENTS & EMAIL MANAGEMENT */}
              {alertsSubTab === 'recipients' && (
                <div className="space-y-5 animate-in fade-in duration-150">

                  {/* Round-Robin Rules Banner */}
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold">
                      <RotateCcw className="w-4 h-4" />
                      <span>Regra de Alternância Rotativa por Tanque (Round-Robin)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Sempre que um reservatório atinge ≤ 30%, o sistema cria o alerta e envia o e-mail para o próximo destinatário ativo da lista.
                      <span className="text-cyan-300 block font-mono mt-1">
                        1.º alerta → e-mail 1 • 2.º alerta → e-mail 2 • 3.º alerta → e-mail 3 • 4.º alerta → volta ao e-mail 1.
                      </span>
                      Se um destinatário estiver inativo, o sistema avança para o próximo ativo. Se nenhum destinatário ativo estiver cadastrado, o alerta é registrado normalmente com o aviso correspondente.
                    </p>
                  </div>

                  {/* Header Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-400" />
                        Lista de Destinatários Configurados
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Gerencie contatos associados a tanques específicos ou a todos os reservatórios.
                      </p>
                    </div>

                    {currentUser.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => setShowAddRecipientForm(!showAddRecipientForm)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{showAddRecipientForm ? 'Cancelar' : '+ Adicionar E-mail'}</span>
                      </button>
                    )}
                  </div>

                  {/* Add Recipient Form */}
                  {showAddRecipientForm && currentUser.role === 'admin' && (
                    <form
                      onSubmit={handleAddRecipient}
                      className="p-5 rounded-3xl bg-slate-900/90 border border-emerald-500/40 space-y-4 animate-in slide-in-from-top-2 duration-200"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h5 className="text-xs font-bold text-white flex items-center gap-2">
                          <UserPlus className="w-4 h-4 text-emerald-400" />
                          Novo Destinatário de Alertas
                        </h5>
                        <span className="text-[10px] text-slate-400">Validação rigorosa contra duplicações</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                            Nome do Destinatário *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: Manuel Edson (Engenheiro Chefe)"
                            value={newRecipName}
                            onChange={(e) => setNewRecipName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                            Endereço de E-mail *
                          </label>
                          <input
                            type="email"
                            required
                            placeholder="destinatario@kizomba.ao"
                            value={newRecipEmail}
                            onChange={(e) => setNewRecipEmail(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                            Reservatório Associado
                          </label>
                          <select
                            value={newRecipTankId}
                            onChange={(e) => setNewRecipTankId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                          >
                            <option value="">Todos os Reservatórios (Global)</option>
                            {AVAILABLE_TANKS.map((t) => (
                              <option key={t.id} value={String(t.id)}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                            Ordem de Alternância (Prioridade)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={newRecipPriority}
                            onChange={(e) => setNewRecipPriority(Number(e.target.value))}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setShowAddRecipientForm(false)}
                          className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={savingRecipient}
                          className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{savingRecipient ? 'Guardando...' : 'Cadastrar Destinatário'}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Recipients Table */}
                  {recipients.length === 0 ? (
                    <div className="p-8 text-center rounded-3xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400">
                      Nenhum destinatário de e-mail cadastrado. Clique em "+ Adicionar E-mail" para configurar.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/40">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-mono">
                          <tr>
                            <th className="p-3.5">Nome & E-mail</th>
                            <th className="p-3.5">Reservatório</th>
                            <th className="p-3.5">Ordem Alternância</th>
                            <th className="p-3.5">Estado</th>
                            <th className="p-3.5 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                          {recipients.map((r) => {
                            const tankInfo = r.tankId ? AVAILABLE_TANKS.find((t) => String(t.id) === r.tankId) : null;
                            const isActive = r.enabled !== false;

                            return (
                              <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                                <td className="p-3.5">
                                  <div className="font-bold text-white">{r.name || 'Sem nome'}</div>
                                  <div className="text-cyan-300 font-mono text-[11px] flex items-center gap-1">
                                    <Mail className="w-3 h-3 text-cyan-400" />
                                    {r.email || 'Sem e-mail'}
                                  </div>
                                </td>
                                <td className="p-3.5">
                                  {tankInfo ? (
                                    <span className="text-white font-medium px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px]">
                                      {tankInfo.name}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-mono text-[11px] px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800">
                                      Todos os Tanques (Global)
                                    </span>
                                  )}
                                </td>
                                <td className="p-3.5 font-mono font-bold text-white">
                                  <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300">
                                    {r.priority || 1}.º na alternância
                                  </span>
                                </td>
                                <td className="p-3.5">
                                  {currentUser.role === 'admin' ? (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleRecipientActive(r)}
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                                        isActive
                                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                                      }`}
                                      title="Clique para ativar ou desativar este destinatário"
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                                      {isActive ? 'Ativo' : 'Inativo'}
                                    </button>
                                  ) : (
                                    <span
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                        isActive
                                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                          : 'bg-slate-800 text-slate-400 border-slate-700'
                                      }`}
                                    >
                                      {isActive ? 'Ativo' : 'Inativo'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                                  {currentUser.role === 'admin' ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditRecipient(r)}
                                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 cursor-pointer"
                                        title="Editar contacto"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRecipientClick(r.id)}
                                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 cursor-pointer"
                                        title="Remover contacto"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 italic">Somente leitura</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Test Email Section */}
                  <div className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                        <Send className="w-4 h-4" />
                        <span>Teste de Disparo de Notificação por E-mail</span>
                      </div>
                      <span className="text-[10px] text-slate-400">Exige confirmação do administrador</span>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      O teste enviará uma mensagem oficial com o assunto{' '}
                      <strong className="text-cyan-300 font-mono">[TESTE] Hossidev Water Monitor — teste de notificação</strong>{' '}
                      a partir de <strong className="text-white font-mono">etakizomba@gmail.com</strong>.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="email"
                        placeholder="destinatario@kizomba.ao"
                        value={testEmailTo}
                        onChange={(e) => setTestEmailTo(e.target.value)}
                        disabled={currentUser.role !== 'admin'}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono disabled:opacity-50"
                      />
                      <button
                        type="button"
                        disabled={testEmailSending || currentUser.role !== 'admin'}
                        onClick={handleOpenTestEmailConfirm}
                        className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{testEmailSending ? 'Enviando...' : 'Enviar E-mail de Teste'}</span>
                      </button>
                    </div>

                    {testFeedback && (
                      <div className="p-3 rounded-xl bg-slate-950 border border-cyan-500/40 text-cyan-200 text-xs font-mono">
                        {testFeedback}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: LIMITS & HYSTERESIS */}
              {alertsSubTab === 'limits' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-cyan-400" />
                        Limites de Alerta & Histerese por Reservatório
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Alerta disparado em ≤ 30%. O sistema não duplica mensagens enquanto permanecer ≤ 30%, e rearmará somente ao atingir ≥ 35%.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {AVAILABLE_TANKS.map((tank) => {
                      const idStr = String(tank.id);
                      const s = tankAlertSettings[idStr] || {
                        tankId: idStr,
                        lowLevelThresholdPercent: 30,
                        rearmThresholdPercent: 35,
                        notificationsEnabled: true,
                        emailEnabled: true,
                        soundEnabled: true,
                        popupEnabled: true,
                        updatedAt: '',
                        updatedBy: null,
                      };

                      const isSavingThis = savingTankSettingsId === idStr;

                      return (
                        <div
                          key={tank.id}
                          className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                              <div>
                                <strong className="text-white block font-bold">{tank.name}</strong>
                                <span className="text-[10px] text-cyan-400 font-mono">
                                  Nó {tank.id <= 2 ? '1 (Tratada)' : tank.id <= 4 ? '2 (Pré-Tratada)' : '3 (Bruta)'}
                                </span>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                                T{tank.id}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-3">
                              <div>
                                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                                  Alerta Baixo (%)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={s.lowLevelThresholdPercent}
                                  disabled={currentUser.role !== 'admin'}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setTankAlertSettings((prev) => ({
                                      ...prev,
                                      [idStr]: { ...s, lowLevelThresholdPercent: val },
                                    }));
                                  }}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-rose-300 font-mono font-bold text-sm focus:outline-none focus:border-rose-500 disabled:opacity-50"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                                  Rearme (%)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={s.rearmThresholdPercent}
                                  disabled={currentUser.role !== 'admin'}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setTankAlertSettings((prev) => ({
                                      ...prev,
                                      [idStr]: { ...s, rearmThresholdPercent: val },
                                    }));
                                  }}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-emerald-300 font-mono font-bold text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                                />
                              </div>
                            </div>

                            {/* Toggles */}
                            <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-800/80 text-[11px]">
                              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={s.soundEnabled}
                                  disabled={currentUser.role !== 'admin'}
                                  onChange={(e) =>
                                    setTankAlertSettings((prev) => ({
                                      ...prev,
                                      [idStr]: { ...s, soundEnabled: e.target.checked },
                                    }))
                                  }
                                  className="rounded text-rose-600 focus:ring-rose-500 bg-slate-950 border-slate-700"
                                />
                                <span>Alarme Som</span>
                              </label>

                              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={s.popupEnabled}
                                  disabled={currentUser.role !== 'admin'}
                                  onChange={(e) =>
                                    setTankAlertSettings((prev) => ({
                                      ...prev,
                                      [idStr]: { ...s, popupEnabled: e.target.checked },
                                    }))
                                  }
                                  className="rounded text-rose-600 focus:ring-rose-500 bg-slate-950 border-slate-700"
                                />
                                <span>Pop-up Tela</span>
                              </label>

                              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={s.emailEnabled}
                                  disabled={currentUser.role !== 'admin'}
                                  onChange={(e) =>
                                    setTankAlertSettings((prev) => ({
                                      ...prev,
                                      [idStr]: { ...s, emailEnabled: e.target.checked },
                                    }))
                                  }
                                  className="rounded text-cyan-600 focus:ring-cyan-500 bg-slate-950 border-slate-700"
                                />
                                <span>Notif. E-mail</span>
                              </label>
                            </div>
                          </div>

                          {currentUser.role === 'admin' && (
                            <div className="pt-2 border-t border-slate-800 flex justify-end">
                              <button
                                type="button"
                                disabled={isSavingThis}
                                onClick={() => handleSaveTankSettings(idStr)}
                                className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-950/40"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{isSavingThis ? 'Salvando...' : 'Salvar Limites'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: NOTIFICATION HISTORY & FAILURE RETRY */}
              {alertsSubTab === 'history' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-400" />
                        Histórico de Notificações & Estado de Envio
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Registos de envios, estado (pendente, enviado, entregue, falhou, offline), mensagens de erro e reenvio.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value as any)}
                        className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                      >
                        <option value="all">Todas ({notificationLogs.emails.length})</option>
                        <option value="failed">Apenas Falhas</option>
                        <option value="sent">Enviadas com Sucesso</option>
                        <option value="pending">Pendentes / Na Fila</option>
                        <option value="not_sent_offline">Pendentes (Offline)</option>
                      </select>

                      <button
                        type="button"
                        onClick={loadNotificationLogs}
                        disabled={loadingLogs}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-300 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                        <span>Atualizar</span>
                      </button>
                    </div>
                  </div>

                  {/* Logs Table */}
                  {(() => {
                    const filteredEmails = notificationLogs.emails.filter((item) => {
                      if (logFilter === 'all') return true;
                      if (logFilter === 'failed') return item.status === 'failed';
                      if (logFilter === 'sent') return item.status === 'sent' || item.status === 'delivered';
                      if (logFilter === 'pending') return item.status === 'pending' || item.status === 'queued';
                      if (logFilter === 'not_sent_offline') return item.status === 'not_sent_offline';
                      return true;
                    });

                    if (filteredEmails.length === 0) {
                      return (
                        <div className="p-8 text-center rounded-3xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400">
                          Nenhum registo de notificação por e-mail encontrado para o filtro selecionado.
                        </div>
                      );
                    }

                    return (
                      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/40">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-mono">
                            <tr>
                              <th className="p-3.5">Tanque</th>
                              <th className="p-3.5">Destinatário & Remetente</th>
                              <th className="p-3.5">Assunto</th>
                              <th className="p-3.5">Data / Hora</th>
                              <th className="p-3.5">Estado</th>
                              <th className="p-3.5">ID / Erro</th>
                              <th className="p-3.5 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80">
                            {filteredEmails.map((log) => {
                              const tankInfo = AVAILABLE_TANKS.find((t) => String(t.id) === log.tankId);
                              const formattedTime = log.sentAt || log.queuedAt || log.createdAt
                                ? new Date(log.sentAt || log.queuedAt || log.createdAt).toLocaleString('pt-BR')
                                : '—';

                              const isFailed = log.status === 'failed';
                              const isOffline = log.status === 'not_sent_offline';
                              const isPending = log.status === 'pending' || log.status === 'queued';
                              const canRetry = (isFailed || isOffline || isPending) && currentUser.role === 'admin';

                              return (
                                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="p-3.5 font-bold text-white whitespace-nowrap">
                                    {tankInfo ? tankInfo.name : `Tanque ${log.tankId}`}
                                  </td>
                                  <td className="p-3.5">
                                    <div className="font-medium text-white">{log.recipientName || 'Destinatário'}</div>
                                    <div className="text-cyan-300 font-mono text-[11px]">{log.emailMasked}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">De: {log.senderEmail || 'etakizomba@gmail.com'}</div>
                                  </td>
                                  <td className="p-3.5 max-w-xs truncate text-[11px] text-slate-300 font-sans" title={log.subject}>
                                    {log.subject}
                                  </td>
                                  <td className="p-3.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                                    {formattedTime}
                                  </td>
                                  <td className="p-3.5 font-mono whitespace-nowrap">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                        log.status === 'sent' || log.status === 'delivered'
                                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                          : log.status === 'failed'
                                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                          : log.status === 'not_sent_offline'
                                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                          : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                      }`}
                                    >
                                      {log.status === 'sent'
                                        ? 'enviado'
                                        : log.status === 'delivered'
                                        ? 'entregue'
                                        : log.status === 'failed'
                                        ? 'falhou'
                                        : log.status === 'not_sent_offline'
                                        ? 'offline (pendente)'
                                        : log.status === 'queued'
                                        ? 'na fila'
                                        : 'pendente'}
                                    </span>
                                  </td>
                                  <td className="p-3.5 text-[11px] max-w-xs font-mono">
                                    {log.errorMessage ? (
                                      <span className="text-rose-400 block truncate" title={log.errorMessage}>
                                        {log.errorMessage}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 block truncate" title={log.providerMessageId || 'ID'}>
                                        {log.providerMessageId ? log.providerMessageId.slice(0, 18) + '...' : '—'}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-slate-500 font-sans">
                                      Tentativas: {log.retryCount || 0}
                                    </span>
                                  </td>
                                  <td className="p-3.5 text-right whitespace-nowrap">
                                    {canRetry ? (
                                      <button
                                        type="button"
                                        disabled={retryingLogId === log.id}
                                        onClick={() => handleRetryNotification(log.id)}
                                        className="px-2.5 py-1 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 font-bold text-[10px] transition-all flex items-center gap-1 cursor-pointer ml-auto disabled:opacity-50"
                                      >
                                        <RefreshCw className={`w-3 h-3 ${retryingLogId === log.id ? 'animate-spin' : ''}`} />
                                        <span>{retryingLogId === log.id ? 'Reenviando...' : 'Reenviar'}</span>
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-600 font-mono">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* MODAL: EDITAR DESTINATÁRIO                                     */}
          {/* ============================================================== */}
          {editingRecipient && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-cyan-400" />
                    Editar Destinatário de Alerta
                  </h4>
                  <button
                    onClick={() => setEditingRecipient(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditRecipient} className="space-y-4 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Nome</label>
                    <input
                      type="text"
                      required
                      value={editRecipName}
                      onChange={(e) => setEditRecipName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Endereço de E-mail</label>
                    <input
                      type="email"
                      required
                      value={editRecipEmail}
                      onChange={(e) => setEditRecipEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Reservatório</label>
                      <select
                        value={editRecipTankId}
                        onChange={(e) => setEditRecipTankId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Todos (Global)</option>
                        {AVAILABLE_TANKS.map((t) => (
                          <option key={t.id} value={String(t.id)}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Ordem na Alternância</label>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={editRecipPriority}
                        onChange={(e) => setEditRecipPriority(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                      <input
                        type="checkbox"
                        checked={editRecipEnabled}
                        onChange={(e) => setEditRecipEnabled(e.target.checked)}
                        className="rounded text-emerald-500 focus:ring-emerald-500 bg-slate-950 border-slate-700"
                      />
                      <span>Destinatário Ativo na Alternância</span>
                    </label>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingRecipient(null)}
                      className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingEditRecipient}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{savingEditRecipient ? 'Guardando...' : 'Guardar Alterações'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* MODAL: CONFIRMAR EXCLUSÃO DE DESTINATÁRIO                      */}
          {/* ============================================================== */}
          {confirmDeleteRecipientId && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-center">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Confirmar Remoção</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Tem certeza de que deseja remover este destinatário da lista de notificações?
                  </p>
                </div>
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteRecipientId(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteRecipient}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer"
                  >
                    Sim, Remover
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* MODAL: CONFIRMAR ENVIO DE TESTE (EXIGÊNCIA DE CONFIRMAÇÃO)     */}
          {/* ============================================================== */}
          {confirmTestModalOpen && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    <Send className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Confirmar Envio de Teste</h4>
                    <p className="text-xs text-slate-400">Exige autorização explícita do administrador</p>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-sans">Remetente Oficial</span>
                    <strong className="text-white">etakizomba@gmail.com</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-sans">Destinatário do Teste</span>
                    <strong className="text-cyan-300">{testEmailTo}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-sans">Assunto da Mensagem</span>
                    <strong className="text-slate-300 font-sans">[TESTE] Hossidev Water Monitor — teste de notificação</strong>
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  O envio será processado via backend com segurança SMTP. Deseja prosseguir com o envio?
                </p>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setConfirmTestModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteTestEmail}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-950/40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirmar e Enviar</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Hossidev Water Monitor - Alerts & Notifications Modal
 * Dedicated SCADA view for viewing active, acknowledged, resolved alerts, email and push notification dispatch queues.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle,
  Volume2,
  VolumeX,
  RefreshCw,
  Mail,
  MessageSquare,
  Clock,
  ShieldAlert,
  Search,
  CheckCircle2,
  Layers,
  Send,
  AlertOctagon,
} from 'lucide-react';
import { TankAlert, AuthUser } from '../types';
import { api } from '../services/api';

interface AlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onOpenTank: (tankId: number) => void;
  onSilenceAlertSound?: (alertId: string) => void;
}

type TabType =
  | 'active'
  | 'acknowledged'
  | 'resolved'
  | 'history'
  | 'email'
  | 'pending';

export const AlertsModal: React.FC<AlertsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onOpenTank,
  onSilenceAlertSound,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [alerts, setAlerts] = useState<TankAlert[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tankFilter, setTankFilter] = useState<string>('all');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchAlertsData = async () => {
    setLoading(true);
    try {
      const res = await api.alerts.getAll();
      setAlerts(res.alerts || []);

      const notifs = await api.alerts.getNotifications();
      setEmailLogs(notifs.emails || []);
    } catch (err: any) {
      console.warn('Erro ao carregar alertas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAlertsData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAcknowledge = async (alertId: string) => {
    try {
      await api.alerts.acknowledge(alertId);
      setActionMessage('Alerta reconhecido com sucesso.');
      setTimeout(() => setActionMessage(null), 3000);
      fetchAlertsData();
    } catch (err: any) {
      setActionMessage(`Erro ao reconhecer alerta: ${err.message}`);
    }
  };

  const handleSilence = async (alertId: string) => {
    try {
      await api.alerts.silence(alertId);
      if (onSilenceAlertSound) onSilenceAlertSound(alertId);
      setActionMessage('Alarme sonoro silenciado.');
      setTimeout(() => setActionMessage(null), 3000);
      fetchAlertsData();
    } catch (err: any) {
      setActionMessage(`Erro: ${err.message}`);
    }
  };

  const handleRetryNotification = async (notificationId: string) => {
    setRetryingId(notificationId);
    try {
      const res = await api.alerts.retryNotification(notificationId);
      setActionMessage(res.message || 'Notificação reenviada com sucesso.');
      setTimeout(() => setActionMessage(null), 3000);
      fetchAlertsData();
    } catch (err: any) {
      setActionMessage(`Erro ao reenviar: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  // Filter alerts by tab and search
  const filteredAlerts = alerts.filter((a) => {
    if (activeTab === 'active' && a.status !== 'active') return false;
    if (activeTab === 'acknowledged' && a.status !== 'acknowledged') return false;
    if (activeTab === 'resolved' && a.status !== 'resolved') return false;
    if (activeTab === 'pending') {
      const hasPendingChannel =
        a.emailNotificationStatus === 'pending' ||
        a.emailNotificationStatus === 'queued' ||
        a.emailNotificationStatus === 'not_sent_offline';
      if (!hasPendingChannel) return false;
    }

    if (tankFilter !== 'all' && a.tankId !== tankFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = a.tankName.toLowerCase().includes(q);
      const matchId = a.tankId.includes(q);
      const matchBoard = a.sourceBoard.toLowerCase().includes(q);
      const matchRecipient = a.selectedRecipientName?.toLowerCase().includes(q);
      return matchName || matchId || matchBoard || matchRecipient;
    }

    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
            ATIVO
          </span>
        );
      case 'acknowledged':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            RECONHECIDO
          </span>
        );
      case 'resolved':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            RESOLVIDO
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-slate-800 text-slate-300">
            {status.toUpperCase()}
          </span>
        );
    }
  };

  return (
    <div
      id="alerts-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="glass-modal rounded-[2.5rem] w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Alertas e Notificações Operacionais
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Monitoramento de Nível Baixo (≤30%) • Alternância de Contactos • Fila Offline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAlertsData}
              disabled={loading}
              className="p-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border border-slate-800 transition-colors cursor-pointer"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-2xl bg-slate-900/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action toast message */}
        {actionMessage && (
          <div className="px-6 py-2 bg-cyan-950/60 border-b border-cyan-800 text-xs text-cyan-300 font-bold flex items-center justify-between">
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 px-6 pt-3 pb-2 border-b border-slate-800/80 bg-slate-950/40 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3.5 py-1.5 rounded-2xl font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
              activeTab === 'active'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
            <span>Alertas Ativos ({alerts.filter((a) => a.status === 'active').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('acknowledged')}
            className={`px-3.5 py-1.5 rounded-2xl font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
              activeTab === 'acknowledged'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5 text-cyan-300" />
            <span>Reconhecidos ({alerts.filter((a) => a.status === 'acknowledged').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('resolved')}
            className={`px-3.5 py-1.5 rounded-2xl font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
              activeTab === 'resolved'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            <span>Resolvidos ({alerts.filter((a) => a.status === 'resolved').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-2xl font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-indigo-300" />
            <span>Histórico ({alerts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('email')}
            className={`px-3.5 py-1.5 rounded-2xl font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
              activeTab === 'email'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Mail className="w-3.5 h-3.5 text-cyan-300" />
            <span>E-mails ({emailLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-1.5 rounded-2xl font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
              activeTab === 'pending'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-950/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5 text-amber-300" />
            <span>Pendências & Falhas</span>
          </button>
        </div>

        {/* Filters bar */}
        <div className="px-6 py-2.5 bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800/60 text-xs">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-slate-400 text-[11px]">Tanque:</span>
            <select
              value={tankFilter}
              onChange={(e) => setTankFilter(e.target.value)}
              className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none"
            >
              <option value="all">Todos os Tanques</option>
              <option value="1">Tanque 1 (FW1)</option>
              <option value="2">Tanque 2 (FW2)</option>
              <option value="3">Tanque 3 (RW1)</option>
              <option value="4">Tanque 4 (RW2)</option>
              <option value="5">Tanque 5 (WW1)</option>
              <option value="6">Tanque 6 (WW2)</option>
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar alerta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/40"
            />
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {activeTab === 'email' ? (
            /* E-MAIL LOGS TABLE */
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Histórico de Notificações por E-mail
              </h3>
              {emailLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs font-mono">
                  Nenhum envio de e-mail registrado.
                </div>
              ) : (
                <div className="space-y-2">
                  {emailLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-white">{log.subject}</span>
                          <span className="text-slate-400 text-[10px]">({log.emailMasked})</span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1">{log.bodyPreview}</p>
                        {log.errorMessage && (
                          <p className="text-[10px] text-rose-400 font-mono mt-0.5">{log.errorMessage}</p>
                        )}
                        <div className="text-[10px] text-slate-500 flex items-center gap-3">
                          <span>Data: {new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                          {log.provider && <span>Provedor: {log.provider}</span>}
                          {log.retryCount > 0 && <span>Tentativas: {log.retryCount}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                            log.status === 'sent' || log.status === 'delivered'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : log.status === 'pending' || log.status === 'queued'
                              ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          }`}
                        >
                          {log.status.toUpperCase()}
                        </span>
                        {currentUser?.role === 'admin' && (log.status === 'failed' || log.status === 'queued') && (
                          <button
                            type="button"
                            disabled={retryingId === log.id}
                            onClick={() => handleRetryNotification(log.id)}
                            className="px-2.5 py-1 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold cursor-pointer transition-all disabled:opacity-50"
                            title="Reenviar esta notificação agora"
                          >
                            {retryingId === log.id ? 'Reenviando...' : 'Reenviar'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ALERTS CARDS LIST */
            <div className="space-y-3">
              {filteredAlerts.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs font-mono">
                  Nenhum alerta registrado nesta categoria.
                </div>
              ) : (
                filteredAlerts.map((alert) => {
                  const isSilenced = Boolean(alert.soundSilencedAt);
                  const isAcknowledged = alert.status === 'acknowledged';
                  const isResolved = alert.status === 'resolved';

                  return (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-3xl border transition-all flex flex-col gap-3 ${
                        alert.status === 'active'
                          ? 'bg-rose-950/20 border-rose-500/40'
                          : alert.status === 'acknowledged'
                          ? 'bg-cyan-950/20 border-cyan-500/40'
                          : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          {getStatusBadge(alert.status)}
                          <span className="text-sm font-bold text-white">{alert.tankName}</span>
                          <span className="text-xs font-mono text-cyan-400 font-bold">
                            Nível: {alert.levelAtTrigger}%
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            (Lim: {alert.thresholdPercent}% / Rearme: {alert.resetThresholdPercent}%)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-mono">
                            Disparado em: {new Date(alert.triggeredAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      </div>

                      {/* Technical Grid Info */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-slate-950/50 p-2.5 rounded-2xl border border-slate-800/60">
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase font-sans">Placa</span>
                          <span className="text-slate-200">{alert.sourceBoard}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase font-sans">Destinatário</span>
                          <span className="text-slate-200 truncate block">
                            {alert.selectedRecipientName || 'Nenhum'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase font-sans">E-mail</span>
                          <span className="text-cyan-400">{alert.emailNotificationStatus}</span>
                        </div>
                      </div>

                      {/* Resolution / Ack footnotes */}
                      {(alert.acknowledgedBy || alert.resolvedReason) && (
                        <div className="text-[10px] font-mono text-slate-400 flex flex-wrap gap-4">
                          {alert.acknowledgedBy && (
                            <span>
                              Reconhecido por: <strong className="text-slate-200">@{alert.acknowledgedBy}</strong> em{' '}
                              {alert.acknowledgedAt ? new Date(alert.acknowledgedAt).toLocaleString('pt-BR') : ''}
                            </span>
                          )}
                          {alert.resolvedReason && (
                            <span className="text-emerald-400">
                              Resolvido: {alert.resolvedReason} em{' '}
                              {alert.resolvedAt ? new Date(alert.resolvedAt).toLocaleString('pt-BR') : ''}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/60">
                        <button
                          onClick={() => onOpenTank(Number(alert.tankId))}
                          className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold transition-all cursor-pointer"
                        >
                          Ver tanque
                        </button>

                        {!isResolved && !isAcknowledged && (
                          <button
                            onClick={() => handleAcknowledge(alert.id)}
                            className="px-3 py-1 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Reconhecer</span>
                          </button>
                        )}

                        {!isResolved && (
                          <button
                            onClick={() => handleSilence(alert.id)}
                            className={`px-3 py-1 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              isSilenced
                                ? 'bg-slate-800 text-slate-500 border-slate-700'
                                : 'bg-rose-950/40 hover:bg-rose-900/60 border-rose-500/40 text-rose-300'
                            }`}
                          >
                            {isSilenced ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5" />}
                            <span>{isSilenced ? 'Silenciado' : 'Silenciar som'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

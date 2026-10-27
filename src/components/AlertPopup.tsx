/**
 * Hossidev Water Monitor - Alert Popup Component
 * Non-blocking floating SCADA notification toast for low water level alerts (<= 30%).
 * Shows tank metrics, pump state, delivery status, audio silence & acknowledgment actions.
 */

import React from 'react';
import {
  AlertTriangle,
  Volume2,
  VolumeX,
  CheckCircle,
  Eye,
  X,
  Mail,
} from 'lucide-react';
import { TankAlert, AuthUser } from '../types';

interface AlertPopupProps {
  alerts: TankAlert[];
  currentUser: AuthUser | null;
  isOffline?: boolean;
  onClose: (alertId: string) => void;
  onAcknowledge: (alertId: string) => void;
  onSilenceSound: (alertId: string) => void;
  onOpenTank: (tankId: number) => void;
}

export const AlertPopup: React.FC<AlertPopupProps> = ({
  alerts,
  currentUser,
  isOffline = false,
  onClose,
  onAcknowledge,
  onSilenceSound,
  onOpenTank,
}) => {
  // Only display active or unacknowledged alerts that have not been closed visually
  if (!alerts || alerts.length === 0) return null;

  const formatEmailDeliveryState = (status: string, isChannelOffline: boolean) => {
    if (isChannelOffline || status === 'not_sent_offline') {
      return <span className="text-amber-400 font-mono font-bold">E-mail pendente — sem internet</span>;
    }
    switch (status) {
      case 'sent':
      case 'delivered':
        return <span className="text-emerald-400 font-mono font-bold">enviado</span>;
      case 'queued':
      case 'pending':
        return <span className="text-cyan-400 font-mono font-bold">pendente</span>;
      case 'failed':
        return <span className="text-rose-400 font-mono font-bold">falhou</span>;
      case 'not_applicable':
      default:
        return <span className="text-amber-300 font-mono text-[10px]">Nenhum destinatário de e-mail ativo</span>;
    }
  };

  return (
    <div
      id="hossidev-alert-popup-container"
      className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none select-none"
    >
      {alerts.slice(0, 3).map((alert) => {
        const isSilenced = Boolean(alert.soundSilencedAt);
        const isAcknowledged = alert.status === 'acknowledged';
        const formattedDate = alert.lastValidReadingAt
          ? new Date(alert.lastValidReadingAt).toLocaleString('pt-BR')
          : new Date(alert.triggeredAt).toLocaleString('pt-BR');

        return (
          <div
            key={alert.id}
            className="pointer-events-auto bg-[#0a1120]/95 backdrop-blur-xl border-2 border-rose-500/80 rounded-3xl p-5 shadow-[0_12px_40px_rgba(244,63,94,0.35)] animate-in slide-in-from-top-3 duration-300 flex flex-col gap-3.5 text-white"
          >
            {/* Header Title */}
            <div className="flex items-center justify-between border-b border-rose-500/30 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 shadow-[0_0_10px_#f43f5e]"></span>
                </span>
                <span className="text-xs font-black tracking-wider text-rose-400 uppercase font-mono flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  ALERTA DE NÍVEL BAIXO
                </span>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  {alert.levelAtTrigger}%
                </span>
                <button
                  onClick={() => onClose(alert.id)}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Fechar pop-up sem apagar o alerta"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Tanque</span>
                <strong className="text-white text-sm">{alert.tankName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Nível Atual</span>
                <strong className="text-rose-400 text-sm font-bold">{alert.levelAtTrigger}%</strong>{' '}
                <span className="text-slate-500 text-[10px]">(Lim: {alert.thresholdPercent}%)</span>
              </div>
              <div className="mt-1">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Placa de Origem</span>
                <span className="text-cyan-300 font-bold">{alert.sourceBoard}</span>
              </div>
              <div className="mt-1">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Última leitura</span>
                <span className="text-slate-300 text-[10px]">{formattedDate}</span>
              </div>
            </div>

            {/* Delivery Channels status */}
            <div className="text-[11px] flex flex-col gap-1 border-t border-slate-800/80 pt-2 text-slate-300">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  Estado do e-mail:
                </span>
                {formatEmailDeliveryState(alert.emailNotificationStatus, isOffline)}
              </div>
              {alert.selectedRecipientName && (
                <div className="text-[10px] text-slate-400 pt-0.5 truncate">
                  Destinatário: <span className="text-white font-medium">{alert.selectedRecipientName}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => onOpenTank(Number(alert.tankId))}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500 text-cyan-300 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-slate-800 transition-all cursor-pointer"
                title="Abrir detalhes do reservatório"
              >
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ver tanque</span>
              </button>

              <button
                disabled={isAcknowledged}
                onClick={() => onAcknowledge(alert.id)}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  isAcknowledged
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400 cursor-default'
                    : 'bg-indigo-600/20 hover:bg-indigo-600/40 border-indigo-500/40 text-indigo-300'
                }`}
                title={isAcknowledged ? 'Alerta já reconhecido' : 'Reconhecer alerta'}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{isAcknowledged ? 'Reconhecido' : 'Reconhecer'}</span>
              </button>

              <button
                onClick={() => onSilenceSound(alert.id)}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  isSilenced
                    ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-default'
                    : 'bg-rose-950/40 hover:bg-rose-900/60 border-rose-500/40 text-rose-300'
                }`}
                title={isSilenced ? 'Alarme já silenciado' : 'Silenciar som local'}
              >
                {isSilenced ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5 text-rose-400" />}
                <span>{isSilenced ? 'Silenciado' : 'Silenciar'}</span>
              </button>
            </div>
          </div>
        );
      })}

      {alerts.length > 3 && (
        <div className="pointer-events-auto bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-2 text-center text-xs text-rose-300 font-bold shadow-lg">
          + {alerts.length - 3} outros alertas ativos de nível baixo
        </div>
      )}
    </div>
  );
};

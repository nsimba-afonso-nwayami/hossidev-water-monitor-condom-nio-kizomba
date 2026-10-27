import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Droplets,
  Radio,
  Bell,
  Volume2,
  VolumeX,
  RefreshCw,
} from 'lucide-react';
import { TankData } from '../types';
import { SECTOR_INFO } from '../data/tanksConfig';

interface TankDetailModalProps {
  tank: TankData | null;
  isOpen: boolean;
  onClose: () => void;
  onTogglePumpOverride: (tankId: number) => void;
  onSetAlarm?: (
    tankId: number,
    action: 'ON' | 'OFF'
  ) => Promise<{ success: boolean; ok?: boolean; reason?: string; message?: string }>;
}

export const TankDetailModal: React.FC<TankDetailModalProps> = ({
  tank,
  isOpen,
  onClose,
  onTogglePumpOverride,
  onSetAlarm,
}) => {
  if (!isOpen || !tank) return null;

  const info = SECTOR_INFO[tank.sector] || {
    title: `Setor ${tank.sector}`,
  };

  const hasRealData = tank.hasRealData && tank.level !== null;
  const levelValue = hasRealData ? tank.level! : 0;
  const hasCapacityDefined = typeof tank.capacityLiters === 'number' && tank.capacityLiters > 0;
  const currentLiters = hasRealData && hasCapacityDefined
    ? Math.round((levelValue / 100) * tank.capacityLiters!)
    : null;
  const faultyCount = tank.fault_mask ? tank.fault_mask.filter((f) => f === 1).length : 0;
  const hasFault = faultyCount > 0 || tank.fault === 1;

  // Siren / Alarm State
  const isAlarmPhysicallyActive = Number(tank.alarm ?? 0) === 1 || tank.alarm === true;
  const isAlarmMuted = Number(tank.alarm_muted ?? 0) === 1 || tank.alarm_muted === true;

  const [alarmCommandPending, setAlarmCommandPending] = useState<'ON' | 'OFF' | null>(null);
  const [pendingSlaveAction, setPendingSlaveAction] = useState<'ON' | 'OFF' | null>(null);
  const [alarmFeedback, setAlarmFeedback] = useState<{
    type: 'sending' | 'sent_to_slave' | 'success' | 'error';
    text: string;
  } | null>(null);

  const feedbackTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (alarmFeedback?.type === 'sent_to_slave' && pendingSlaveAction) {
      const isConfirmed =
        (pendingSlaveAction === 'ON' && isAlarmPhysicallyActive) ||
        (pendingSlaveAction === 'OFF' && (!isAlarmPhysicallyActive || isAlarmMuted));

      if (isConfirmed) {
        setAlarmFeedback({
          type: 'success',
          text: `Telemetria confirmou: sirene ${isAlarmPhysicallyActive ? 'ativa' : 'desativada'}.`,
        });
        setPendingSlaveAction(null);
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => setAlarmFeedback(null), 3500);
      }
    }
  }, [tank.alarm, tank.alarm_muted, isAlarmPhysicallyActive, isAlarmMuted, pendingSlaveAction, alarmFeedback?.type]);

  const getSirenStateInfo = () => {
    if (!hasRealData || tank.isStale) {
      return {
        label: 'SEM COMUNICAÇÃO',
        desc: 'Aguardando telemetria recente da placa',
        badgeClass: 'bg-slate-800/80 text-slate-400 border-slate-700',
        dotClass: 'bg-slate-500',
      };
    }

    if (isAlarmPhysicallyActive) {
      return {
        label: 'ATIVA',
        desc: 'Sirene em emissão sonora contínua no reservatório (máx. 2 min)',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-lg animate-pulse',
        dotClass: 'bg-rose-400 animate-ping',
      };
    }

    if (isAlarmMuted) {
      return {
        label: 'SILENCIADA',
        desc: 'Silenciada manualmente pelo operador até o nível recuperar (>30%)',
        badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
        dotClass: 'bg-amber-400',
      };
    }

    if (levelValue <= 30) {
      return {
        label: 'EM ESPERA',
        desc: 'Nível crítico: em intervalo temporizado entre emissões (15 min / 1 h)',
        badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
        dotClass: 'bg-sky-400',
      };
    }

    return {
      label: 'DESLIGADA POR NÍVEL RECUPERADO',
      desc: 'Nível seguro (>30%): alarme desativado e pronto para rearmar',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      dotClass: 'bg-emerald-400',
    };
  };

  const sirenInfo = getSirenStateInfo();

  const handleAlarmAction = async (action: 'ON' | 'OFF') => {
    if (alarmCommandPending !== null || !onSetAlarm) return;

    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setAlarmCommandPending(action);
    setAlarmFeedback({
      type: 'sending',
      text: `Enviando comando para ${action === 'ON' ? 'ativar' : 'desativar'} sirene...`,
    });

    try {
      const res = await onSetAlarm(tank.id, action);
      if (res.reason === 'SENT_TO_SLAVE') {
        setPendingSlaveAction(action);
        setAlarmFeedback({
          type: 'sent_to_slave',
          text: `Comando enviado à Placa ${tank.nodeId} (aguardando telemetria)...`,
        });
      } else if (res.success && (res.reason === 'APPLIED' || res.ok)) {
        setPendingSlaveAction(null);
        setAlarmFeedback({
          type: 'success',
          text: `Sirene ${action === 'ON' ? 'ativada' : 'desativada'} no controlador.`,
        });
        feedbackTimerRef.current = setTimeout(() => setAlarmFeedback(null), 3500);
      } else {
        setPendingSlaveAction(null);
        setAlarmFeedback({
          type: 'error',
          text: res.message || 'Falha ao executar comando de sirene.',
        });
        feedbackTimerRef.current = setTimeout(() => setAlarmFeedback(null), 4500);
      }
    } catch (err: any) {
      setPendingSlaveAction(null);
      setAlarmFeedback({
        type: 'error',
        text: err?.message || 'Erro de comunicação ao enviar comando.',
      });
      feedbackTimerRef.current = setTimeout(() => setAlarmFeedback(null), 4500);
    } finally {
      setAlarmCommandPending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-modal rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">{tank.name}</h2>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  ID #{tank.id}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-slate-400">{info.title}</p>
                <span className="text-slate-600">•</span>
                <span className="text-xs font-mono text-slate-300">
                  {hasCapacityDefined
                    ? `Capacidade: ${tank.capacityLiters!.toLocaleString('pt-BR')} L`
                    : 'Modo Percentual (%)'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-slate-900/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-panel p-3.5 rounded-2xl flex flex-col">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Nível Real</span>
              <span className="text-xl font-bold font-mono text-cyan-400 mt-0.5">
                {hasRealData ? `${levelValue}%` : 'Sem leitura'}
              </span>
              <span className="text-[11px] text-slate-400">
                {!hasRealData
                  ? 'Aguardando dados da placa'
                  : hasCapacityDefined && currentLiters !== null
                  ? `${currentLiters.toLocaleString('pt-BR')} L`
                  : 'Modo Sensor %'}
              </span>
            </div>

            <div className="glass-panel p-3.5 rounded-2xl flex flex-col">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Bomba de Carga</span>
              <span
                className={`text-sm font-bold font-mono mt-0.5 ${
                  !hasRealData ? 'text-slate-500' : tank.pump === 1 ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {!hasRealData ? 'Estado desconhecido' : tank.pump === 1 ? 'A ENCHER...' : 'DESLIGADA'}
              </span>
              <span className="text-[11px] text-slate-400">
                Relé Nó #{tank.nodeId}
              </span>
            </div>

            <div className="glass-panel p-3.5 rounded-2xl flex flex-col">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Nó de Aquisição</span>
              <span className="text-sm font-bold text-white mt-0.5">Placa {tank.nodeId}</span>
              <span className="text-[11px] text-cyan-400 font-mono">UART 115200</span>
            </div>

            <div className="glass-panel p-3.5 rounded-2xl flex flex-col">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Integridade</span>
              <span
                className={`text-sm font-bold mt-0.5 ${
                  !hasRealData ? 'text-slate-500' : hasFault ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {!hasRealData ? 'Sem sinal' : hasFault ? `${faultyCount} Avaria(s)` : '100% Normal'}
              </span>
              <span className="text-[11px] text-slate-400">10 Provas Físicas</span>
            </div>
          </div>

          {/* 10 Sensors Diagnostic Table */}
          <div className="glass-panel rounded-3xl p-5 flex flex-col gap-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Leituras das 10 Provas Ópticas/Condutivas Reais
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">Entradas digitais dos sensores</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {Array.from({ length: 10 }, (_, i) => {
                const sensorNum = i + 1;
                const isSubmerged = hasRealData && tank.sensors && tank.sensors[i] === 1;
                const isFaulty = hasRealData && tank.fault_mask && tank.fault_mask[i] === 1;

                return (
                  <div
                    key={sensorNum}
                    className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                      !hasRealData
                        ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                        : isFaulty
                        ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 shadow-md shadow-rose-950/40'
                        : isSubmerged
                        ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold font-mono">S{sensorNum} ({sensorNum * 10}%)</span>
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          !hasRealData
                            ? 'bg-slate-700'
                            : isFaulty
                            ? 'bg-rose-500 animate-pulse'
                            : isSubmerged
                            ? 'bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]'
                            : 'bg-slate-700'
                        }`}
                      />
                    </div>
                    <span className="text-[10px] font-semibold">
                      {!hasRealData
                        ? '⚪ Sem sinal'
                        : isFaulty
                        ? '⚡ AVARIA FÍSICA'
                        : isSubmerged
                        ? '💧 Submerso'
                        : '⚪ Seco'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Manual Controls Grid: Bomba & Sirene */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bomba */}
            <div className="glass-panel rounded-3xl p-5 flex flex-col justify-between gap-3 shadow-sm">
              <div>
                <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                  Comando do Relé da Bomba
                </span>
                <p className="text-[11px] text-slate-400 mt-1">
                  Dispara instrução de comutação do relé físico na Placa {tank.nodeId}.
                </p>
              </div>

              <button
                onClick={() => onTogglePumpOverride(tank.id)}
                className={`w-full py-3 px-4 rounded-2xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
                  tank.pump === 1
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>{tank.pump === 1 ? 'Desligar Relé da Bomba' : 'Acionar Relé da Bomba'}</span>
              </button>
            </div>

            {/* Sirene / Alarme Físico */}
            <div className="glass-panel rounded-3xl p-5 flex flex-col justify-between gap-3 shadow-sm">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-cyan-400" />
                    Sirene do Tanque T{tank.id}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${sirenInfo.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${sirenInfo.dotClass}`} />
                    <span>{sirenInfo.label}</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Temporização no firmware (pulso de 2 min, repetição a 15 min e ciclos a cada 1 h).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id={`detail_t${tank.id}_btn_activate_alarm`}
                  disabled={isAlarmPhysicallyActive || alarmCommandPending !== null}
                  onClick={() => handleAlarmAction('ON')}
                  className={`flex-1 py-2.5 px-3 rounded-2xl font-bold font-mono text-xs border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    isAlarmPhysicallyActive
                      ? 'bg-rose-500/10 text-rose-400/50 border-rose-500/20 cursor-not-allowed opacity-50'
                      : alarmCommandPending === 'ON'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                      : 'bg-slate-900 hover:bg-cyan-500/15 text-cyan-300 border-slate-700 hover:border-cyan-500/40 active:scale-95'
                  }`}
                  title="Disparar pulso manual de até 2 minutos"
                >
                  {alarmCommandPending === 'ON' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                  <span>Ativar sirene</span>
                </button>

                <button
                  id={`detail_t${tank.id}_btn_deactivate_alarm`}
                  disabled={(!isAlarmPhysicallyActive && isAlarmMuted) || alarmCommandPending !== null}
                  onClick={() => handleAlarmAction('OFF')}
                  className={`flex-1 py-2.5 px-3 rounded-2xl font-bold font-mono text-xs border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    !isAlarmPhysicallyActive && isAlarmMuted
                      ? 'bg-amber-500/10 text-amber-400/50 border-amber-500/20 cursor-not-allowed opacity-50'
                      : alarmCommandPending === 'OFF'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                      : 'bg-slate-900 hover:bg-amber-500/15 text-amber-300 border-slate-700 hover:border-amber-500/40 active:scale-95'
                  }`}
                  title="Silenciar sirene até nível subir acima de 30%"
                >
                  {alarmCommandPending === 'OFF' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>Desativar sirene</span>
                </button>
              </div>

              {alarmFeedback && (
                <div
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-mono flex items-center justify-between gap-1.5 animate-in fade-in ${
                    alarmFeedback.type === 'sending'
                      ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                      : alarmFeedback.type === 'sent_to_slave'
                      ? 'bg-sky-500/10 border border-sky-500/30 text-sky-300'
                      : alarmFeedback.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  <span className="truncate">{alarmFeedback.text}</span>
                  <button
                    onClick={() => setAlarmFeedback(null)}
                    className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

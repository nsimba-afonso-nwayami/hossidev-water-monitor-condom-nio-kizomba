import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Maximize2,
  Radio,
  Clock,
  Cpu,
  RefreshCw,
  ShieldAlert,
  Volume2,
  VolumeX,
  Bell,
  BellRing,
} from 'lucide-react';
import { TankData } from '../types';

interface TankCardProps {
  tank: TankData;
  onOpenDetails: (tank: TankData) => void;
  onTogglePumpOverride: (tankId: number) => void;
  onSetAlarm?: (tankId: number, action: 'ON' | 'OFF') => Promise<{ success: boolean; ok?: boolean; reason?: string; message?: string }>;
}

export const TankCard = React.memo<TankCardProps>(({
  tank,
  onOpenDetails,
  onTogglePumpOverride,
  onSetAlarm,
}) => {
  const hasValidReading =
    (tank.level !== null && tank.level !== undefined) ||
    (tank.lastValidLevel !== null && tank.lastValidLevel !== undefined);
  const levelValue = tank.level !== null && tank.level !== undefined
    ? tank.level
    : (tank.lastValidLevel ?? 0);

  const isStale =
    tank.isStale === true ||
    (tank.boardStatus && tank.boardStatus !== 'online');

  const boardName =
    tank.boardName ||
    (tank.nodeId === 1 ? 'Placa Principal' : tank.nodeId === 2 ? 'Placa 2' : 'Placa 3');

  const boardStatus = tank.boardStatus || 'online';

  // Optional Volumetric Capacity calculations
  const hasCapacityDefined = typeof tank.capacityLiters === 'number' && tank.capacityLiters > 0;
  const currentLiters = hasValidReading && hasCapacityDefined
    ? Math.round((levelValue / 100) * tank.capacityLiters!)
    : null;
  const currentM3 = currentLiters !== null ? (currentLiters / 1000).toFixed(1) : null;
  const totalCapacityM3 = hasCapacityDefined ? (tank.capacityLiters! / 1000).toFixed(1) : null;

  const faultySensorsIndices = tank.fault_mask
    ? tank.fault_mask.reduce((acc: number[], val, idx) => (val === 1 ? [...acc, idx + 1] : acc), [])
    : [];

  const hasFault = faultySensorsIndices.length > 0 || tank.fault === 1;
  const isPumpActive = tank.pump === 1 && !isStale;

  // Format date and time of last reading
  const lastTimestamp = tank.lastValidTimestamp || tank.lastUpdated;
  const formattedLastReadingTime = lastTimestamp
    ? new Date(lastTimestamp).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Nunca recebida';

  const elapsedSec = lastTimestamp ? Math.max(0, Math.floor((Date.now() - lastTimestamp) / 1000)) : null;
  const ageDisplay = elapsedSec !== null
    ? elapsedSec < 60
      ? `há ${elapsedSec}s`
      : `há ${Math.floor(elapsedSec / 60)}min`
    : null;

  const getWaterGradientClass = () => {
    switch (tank.sector) {
      case 'filtrada':
        return 'water-gradient-filtrada';
      case 'nao-filtrada':
        return 'water-gradient-nao-filtrada';
      case 'bruta':
      default:
        return 'water-gradient-bruta';
    }
  };

  const getSectorBadgeColor = () => {
    switch (tank.sector) {
      case 'filtrada':
        return 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10';
      case 'nao-filtrada':
        return 'border-sky-500/30 text-sky-300 bg-sky-500/10';
      case 'bruta':
      default:
        return 'border-amber-500/30 text-amber-300 bg-amber-500/10';
    }
  };

  const getBoardStatusBadge = () => {
    switch (boardStatus) {
      case 'online':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          dot: 'bg-emerald-400',
          label: 'ONLINE',
        };
      case 'sem resposta temporária':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          dot: 'bg-amber-400 animate-pulse',
          label: 'SEM RESPOSTA TEMPORÁRIA',
        };
      case 'reconectando':
        return {
          bg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
          dot: 'bg-cyan-400 animate-ping',
          label: 'RECONECTANDO...',
        };
      case 'offline':
      case 'erro':
      default:
        return {
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
          dot: 'bg-rose-500',
          label: 'SEM COMUNICAÇÃO',
        };
    }
  };

  const boardBadge = getBoardStatusBadge();

  // Siren / Alarm status computation
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

  // When physical telemetry arrives confirming action for remote slave tanks, update feedback
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
    if (!hasValidReading || isStale) {
      return {
        label: 'SEM COMUNICAÇÃO',
        desc: 'Aguardando telemetria recente da placa',
        badgeClass: 'bg-slate-800/80 text-slate-400 border-slate-700',
        dotClass: 'bg-slate-500',
        textColor: 'text-slate-400',
        isRinging: false,
      };
    }

    if (isAlarmPhysicallyActive) {
      return {
        label: 'ATIVA',
        desc: 'Sirene em emissão sonora contínua no reservatório (máx. 2 min)',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-lg shadow-rose-950/40 animate-pulse',
        dotClass: 'bg-rose-400 animate-ping',
        textColor: 'text-rose-400',
        isRinging: true,
      };
    }

    if (isAlarmMuted) {
      return {
        label: 'SILENCIADA',
        desc: 'Silenciada manualmente pelo operador até o nível recuperar (>30%)',
        badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
        dotClass: 'bg-amber-400',
        textColor: 'text-amber-400',
        isRinging: false,
      };
    }

    if (levelValue <= 30) {
      return {
        label: 'EM ESPERA',
        desc: 'Nível crítico: em intervalo temporizado entre emissões (15 min / 1 h)',
        badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
        dotClass: 'bg-sky-400',
        textColor: 'text-sky-400',
        isRinging: false,
      };
    }

    return {
      label: 'DESLIGADA POR NÍVEL RECUPERADO',
      desc: 'Nível seguro (>30%): alarme desativado e pronto para rearmar',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      dotClass: 'bg-emerald-400',
      textColor: 'text-emerald-400',
      isRinging: false,
    };
  };

  const sirenInfo = getSirenStateInfo();

  const handleAlarmAction = async (action: 'ON' | 'OFF') => {
    if (alarmCommandPending !== null) return;
    if (!onSetAlarm) return;

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
    <div
      id={`tankCard_${tank.id}`}
      className={`relative glass-panel-interactive rounded-[2rem] p-5 sm:p-6 flex flex-col gap-3.5 transition-all duration-300 ${
        hasFault
          ? 'card-fault-glow bg-slate-950/80'
          : isStale
          ? 'border border-amber-500/30 bg-slate-950/90 shadow-lg'
          : 'hover:shadow-2xl hover:shadow-cyan-950/20 card-normal-glow'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              {tank.name}
            </h3>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${getSectorBadgeColor()}`}>
              ID #{tank.id}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400 font-medium">
            <span>Capacidade:</span>
            {hasCapacityDefined ? (
              <span className="text-slate-200 font-mono font-semibold">
                {currentLiters !== null && hasValidReading ? (
                  <>
                    <strong className="text-cyan-300">{currentLiters.toLocaleString('pt-BR')} L</strong> de {tank.capacityLiters!.toLocaleString('pt-BR')} L ({totalCapacityM3} m³)
                  </>
                ) : (
                  <>
                    <strong>{tank.capacityLiters!.toLocaleString('pt-BR')} L</strong> ({totalCapacityM3} m³)
                  </>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 text-[10px] font-mono font-bold">
                Modo Percentual (%)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!hasValidReading ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 font-mono">
              <Radio className="w-3 h-3 text-slate-500 animate-pulse" />
              <span>Sem leitura real disponível</span>
            </span>
          ) : isStale ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono" title="Comunicação temporariamente ausente: mantendo última leitura válida em memória">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>ÚLTIMA LEITURA VÁLIDA</span>
            </span>
          ) : hasFault ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 animate-pulse font-mono">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              <span>AVARIA ({faultySensorsIndices.length} PROVAS)</span>
            </span>
          ) : isPumpActive ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>A ENCHER</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-mono">
              <CheckCircle2 className="w-3 h-3 text-cyan-400" />
              <span>DADOS EM TEMPO REAL</span>
            </span>
          )}

          <button
            onClick={() => onOpenDetails(tank)}
            className="p-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border border-slate-800 transition-colors cursor-pointer"
            title="Inspecionar parâmetros e histórico do tanque"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Hardware Node Status & Data Age Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] font-mono">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Fonte:</span>
          <span className="text-slate-200 font-semibold">{boardName}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase ${boardBadge.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${boardBadge.dot}`} />
            {boardBadge.label}
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <Clock className="w-3 h-3 text-slate-500" />
          <span className="text-slate-300 font-medium">{formattedLastReadingTime}</span>
          {ageDisplay && (
            <span className={`px-1.5 py-0.2 rounded text-[10px] ${isStale ? 'text-amber-400 font-bold bg-amber-500/10' : 'text-slate-500'}`}>
              ({ageDisplay})
            </span>
          )}
        </div>
      </div>

      {/* Reconnection Alert Banner if Board is Reconnecting */}
      {isStale && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-[11px] text-amber-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            <span className="font-semibold">
              {tank.reconnectStatus || (hasValidReading ? `Dados anteriores — aguardando comunicação com ${boardName}` : `Aguardando dados da ${boardName}...`)}
            </span>
          </div>
          <span className="text-[10px] text-amber-300/80 font-mono">
            {hasValidReading ? 'Dados mantidos na tela' : 'Sem leitura disponível'}
          </span>
        </div>
      )}

      {/* Hydraulic Body Visualization: Visual Cylinder & Real Sensor Ladder */}
      <div className="flex items-center justify-between sm:justify-around gap-3 sm:gap-6 py-2 px-1">
        {/* Visual Tank Cylinder - Retains last valid level! */}
        <div className="relative flex flex-col items-center">
          {/* Tank Top Rim Indicator */}
          <div className="w-[92px] sm:w-[110px] h-3.5 rounded-t-full bg-slate-800/90 border-t border-x border-slate-700 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          </div>

          {/* Main Hydraulic Vessel */}
          <div className="relative w-[92px] sm:w-[110px] h-[190px] bg-slate-950/90 border-x border-b border-slate-800 rounded-b-3xl overflow-hidden flex flex-col-reverse shadow-inner">
            {/* Level Guide Grid Ticks */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 px-1.5 py-2 z-10">
              <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">100%</div>
              <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">75%</div>
              <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">50%</div>
              <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">25%</div>
              <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">0%</div>
            </div>

            {/* Rising Water Column - ALWAYS displays last valid level! */}
            <div
              id={`t${tank.id}Water`}
              className={`w-full ${getWaterGradientClass()} transition-all duration-700 ease-out relative ${
                isStale ? 'opacity-90 saturate-75' : ''
              }`}
              style={{ height: `${hasValidReading ? Math.min(100, Math.max(0, levelValue)) : 0}%` }}
            >
              {/* Wave surface shimmer */}
              {hasValidReading && levelValue > 0 && !isStale && (
                <div className="absolute -top-1 left-0 right-0 h-2 bg-white/40 blur-[1px] rounded-full animate-wave" />
              )}
              {isStale && levelValue > 0 && (
                <div className="absolute -top-1 left-0 right-0 h-1.5 bg-amber-300/40 blur-[1px] rounded-full" />
              )}

              {/* Sparkle bubbles when pump is running */}
              {hasValidReading && isPumpActive && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-bounce absolute bottom-2 left-3" />
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse absolute bottom-8 right-4" />
                  <div className="w-1 h-1 rounded-full bg-white animate-ping absolute bottom-14 left-6" />
                </div>
              )}
            </div>

            {/* Center Percentage Display over Water */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
              <span
                id={`t${tank.id}LevelText`}
                className={`text-lg sm:text-xl font-extrabold font-mono transition-colors text-center px-1 ${
                  hasValidReading
                    ? 'text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]'
                    : 'text-slate-500'
                }`}
              >
                {hasValidReading ? `${levelValue}%` : 'Sem leitura'}
              </span>
              <span
                className={`text-[10px] font-semibold font-mono ${
                  hasValidReading
                    ? isStale
                      ? 'text-amber-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]'
                      : 'text-cyan-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]'
                    : 'text-slate-600'
                }`}
              >
                {!hasValidReading
                  ? 'Aguardando placa'
                  : isStale
                  ? '(Retido)'
                  : hasCapacityDefined
                  ? `${currentM3} m³`
                  : 'Modo %'}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 font-mono mt-1.5 text-center">
            {!hasValidReading
              ? 'Aguardando dados da placa'
              : hasCapacityDefined && currentLiters !== null
              ? `${currentLiters.toLocaleString('pt-BR')} L`
              : `Nível: ${levelValue}%`}
          </div>
        </div>

        {/* 10-Level Optical Sensors Ladder (10% to 100%) */}
        <div className="flex flex-col gap-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5 flex items-center justify-between">
            <span>{hasValidReading ? 'Sensores Reais (10 Provas)' : 'Sensores: Aguardando dados'}</span>
          </div>

          <div
            id={`t${tank.id}SensorScale`}
            className="flex flex-col-reverse justify-between h-[190px] py-1 border-l border-slate-800 pl-3.5"
          >
            {Array.from({ length: 10 }, (_, i) => {
              const sensorNum = i + 1;
              const sensorIdx = i;
              const hasSensorsArray = Array.isArray(tank.sensors) && tank.sensors.length === 10;
              const isSubmerged = hasValidReading
                ? (hasSensorsArray ? tank.sensors[sensorIdx] === 1 : (levelValue !== null && sensorNum * 10 <= levelValue))
                : false;
              const isFaulty = hasValidReading && Array.isArray(tank.fault_mask) && tank.fault_mask[sensorIdx] === 1;

              return (
                <div
                  key={sensorNum}
                  id={`tank${tank.id}_sensor_${sensorNum}`}
                  className={`sensor-node flex items-center gap-2 ${
                    isFaulty ? 'fault' : isSubmerged ? 'active' : ''
                  }`}
                  title={`Sensor Físico S${sensorNum} (${sensorNum * 10}%): ${
                    !hasValidReading
                      ? 'Sensor inativo (Aguardando placa ligada)'
                      : isFaulty
                      ? 'AVARIA FÍSICA DETECTADA'
                      : isSubmerged
                      ? 'Submerso (Água em contato)'
                      : 'Seco'
                  }`}
                >
                  {/* Sensor Indicator Light */}
                  <div
                    className={`sensor-light w-3 h-3 rounded-full transition-all duration-300 ${
                      !hasValidReading
                        ? 'bg-slate-900 border border-slate-800'
                        : isFaulty
                        ? 'bg-rose-500 border border-white shadow-lg shadow-rose-500 animate-fault-pulse'
                        : isSubmerged
                        ? isStale
                          ? 'bg-amber-400 border border-white/80 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
                          : 'bg-cyan-400 border border-white/80 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                        : 'bg-slate-900 border border-slate-800'
                    }`}
                  />

                  {/* Sensor Text Label */}
                  <span
                    id={`tank${tank.id}_text_${sensorNum}`}
                    className={`text-[11px] font-mono transition-colors ${
                      !hasValidReading
                        ? 'text-slate-600'
                        : isFaulty
                        ? 'text-rose-400 font-bold'
                        : isSubmerged
                        ? isStale
                          ? 'text-amber-200 font-medium'
                          : 'text-slate-200 font-medium'
                        : 'text-slate-600'
                    }`}
                  >
                    {isFaulty ? (
                      <span className="flex items-center gap-1 font-bold">
                        S{sensorNum} (AVARIA)
                      </span>
                    ) : (
                      <span>{sensorNum * 10}%</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tank Metrics Footer Bento Strip */}
      <div className="grid grid-cols-2 gap-2.5 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            {hasCapacityDefined ? 'Volume Estimado' : 'Leitura de Nível'}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5 font-mono">
            {hasCapacityDefined ? (
              <>
                <span className="text-sm font-bold text-slate-100">
                  {hasValidReading && currentLiters !== null ? currentLiters.toLocaleString('pt-BR') : 'N/D'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">{hasValidReading ? 'Litros' : ''}</span>
              </>
            ) : (
              <>
                <span className="text-sm font-bold text-cyan-400">
                  {hasValidReading ? `${levelValue}%` : 'Sem leitura'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">{hasValidReading ? '(Sensor %)' : ''}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Bomba de Carga</span>
          <div className="flex items-center justify-between mt-0.5">
            <div className="flex items-center gap-1.5">
              <RotateCcw
                className={`w-3.5 h-3.5 ${
                  isPumpActive ? 'text-emerald-400 animate-spin' : 'text-slate-600'
                }`}
              />
              <span
                id={`t${tank.id}PumpText`}
                className={`text-xs font-bold font-mono ${
                  !hasValidReading ? 'text-slate-500' : isPumpActive ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {!hasValidReading ? 'Estado desconhecido' : isPumpActive ? 'A ENCHER...' : 'OFF'}
              </span>
            </div>

            {/* Hardware relay pump command */}
            <button
              onClick={() => onTogglePumpOverride(tank.id)}
              className={`text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-lg transition-all cursor-pointer ${
                isPumpActive
                  ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30'
                  : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30'
              }`}
              title="Comando do relé da bomba"
            >
              {isPumpActive ? 'Desligar' : 'Acionar'}
            </button>
          </div>
        </div>
      </div>

      {/* Dedicated Tank Siren / Alarm Control Strip */}
      <div
        id={`tankCard_${tank.id}_sirenSection`}
        className="bg-slate-950/85 p-3 rounded-2xl border border-slate-800/90 flex flex-col gap-2 transition-all"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Bell
              className={`w-3.5 h-3.5 ${
                sirenInfo.isRinging
                  ? 'text-rose-400 animate-bounce'
                  : 'text-slate-400'
              }`}
            />
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Sirene / Alarme Físico
            </span>
          </div>

          {/* Siren State Badge */}
          <span
            id={`t${tank.id}SirenBadge`}
            className={`inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full border transition-all ${sirenInfo.badgeClass}`}
            title={sirenInfo.desc}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${sirenInfo.dotClass}`} />
            <span>{sirenInfo.label}</span>
          </span>
        </div>

        {/* Buttons & Direct Trigger */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="text-[10px] text-slate-400 font-mono" title="Ciclo temporal autónomo gerido pelo firmware do Arduino">
            {isAlarmPhysicallyActive
              ? 'Emissão sonora ativa'
              : isAlarmMuted
              ? 'Silenciada pelo operador'
              : levelValue <= 30
              ? 'Aguardando ciclo (15m/1h)'
              : 'Rearmada (>30%)'}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Botão "Ativar sirene" */}
            <button
              id={`t${tank.id}BtnActivateAlarm`}
              disabled={isAlarmPhysicallyActive || alarmCommandPending !== null || !hasValidReading}
              onClick={() => handleAlarmAction('ON')}
              className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                isAlarmPhysicallyActive
                  ? 'bg-rose-500/10 text-rose-400/50 border-rose-500/20 cursor-not-allowed opacity-50'
                  : alarmCommandPending === 'ON'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                  : 'bg-slate-900 hover:bg-cyan-500/15 text-cyan-300 hover:text-cyan-200 border-slate-700 hover:border-cyan-500/40 active:scale-95'
              }`}
              title="Disparar pulso manual da sirene deste reservatório (até 2 minutos)"
            >
              {alarmCommandPending === 'ON' ? (
                <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
              ) : (
                <Volume2 className="w-3 h-3 text-cyan-400" />
              )}
              <span>Ativar sirene</span>
            </button>

            {/* Botão "Desativar sirene" */}
            <button
              id={`t${tank.id}BtnDeactivateAlarm`}
              disabled={(!isAlarmPhysicallyActive && isAlarmMuted) || alarmCommandPending !== null || !hasValidReading}
              onClick={() => handleAlarmAction('OFF')}
              className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                !isAlarmPhysicallyActive && isAlarmMuted
                  ? 'bg-amber-500/10 text-amber-400/50 border-amber-500/20 cursor-not-allowed opacity-50'
                  : alarmCommandPending === 'OFF'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                  : 'bg-slate-900 hover:bg-amber-500/15 text-amber-300 hover:text-amber-200 border-slate-700 hover:border-amber-500/40 active:scale-95'
              }`}
              title="Silenciar sirene deste reservatório até o nível d'água recuperar acima de 30%"
            >
              {alarmCommandPending === 'OFF' ? (
                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
              ) : (
                <VolumeX className="w-3 h-3 text-amber-400" />
              )}
              <span>Desativar sirene</span>
            </button>
          </div>
        </div>

        {/* Feedback de envio, sucesso ou erro */}
        {alarmFeedback && (
          <div
            id={`t${tank.id}AlarmFeedback`}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono flex items-center justify-between gap-1.5 transition-all animate-in fade-in duration-200 ${
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
              className="text-slate-400 hover:text-white text-[11px] p-0.5 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

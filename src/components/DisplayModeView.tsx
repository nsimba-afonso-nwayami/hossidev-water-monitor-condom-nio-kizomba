import React, { useState, useEffect } from 'react';
import {
  Maximize2,
  Minimize2,
  ArrowLeft,
  Droplets,
  Clock,
  Activity,
  Zap,
  Percent,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { TankData } from '../types';

interface DisplayModeViewProps {
  tanks: TankData[];
  onExit: () => void;
}

type PresentationMode = 'percentage' | 'normal';

export const DisplayModeView: React.FC<DisplayModeViewProps> = ({ tanks, onExit }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Presentation mode preference with local persistence (default: 'percentage')
  const [presentationMode, setPresentationMode] = useState<PresentationMode>(() => {
    try {
      const saved = localStorage.getItem('waterMonitor.displayMode');
      if (saved === 'percentage' || saved === 'normal') {
        return saved;
      }
    } catch {
      // localStorage may fail in restricted environments
    }
    return 'percentage';
  });

  const handlePresentationModeChange = (mode: PresentationMode) => {
    setPresentationMode(mode);
    try {
      localStorage.setItem('waterMonitor.displayMode', mode);
    } catch {}
  };

  // Clock tick every second for supervision time reference
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut listener: ESC to exit, F to toggle fullscreen, P/N to switch modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onExit();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'p' || e.key === 'P') {
        handlePresentationModeChange('percentage');
      } else if (e.key === 'n' || e.key === 'N') {
        handlePresentationModeChange('normal');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Helper for determining tank level status & theme
  const getLevelStatus = (level: number | null | undefined, hasReading: boolean) => {
    if (!hasReading || level === null || level === undefined) {
      return {
        label: 'Sem leitura',
        description: 'Sem leitura disponível',
        colorClass: 'text-slate-400',
        badgeBg: 'bg-slate-800/80 border-slate-700 text-slate-300',
        barGradient: 'from-slate-600 to-slate-700',
        cardBorder: 'border-slate-800/90',
        cardBg: 'bg-slate-900/60',
        glow: '',
      };
    }

    if (level <= 15) {
      return {
        label: 'Nível crítico',
        description: 'Crítico — Nível Muito Baixo',
        colorClass: 'text-rose-400',
        badgeBg: 'bg-rose-500/15 border-rose-500/40 text-rose-300 animate-pulse',
        barGradient: 'from-rose-600 via-rose-500 to-red-600',
        cardBorder: 'border-rose-500/50',
        cardBg: 'bg-gradient-to-b from-rose-950/20 via-slate-900/90 to-slate-950/95',
        glow: 'shadow-2xl shadow-rose-950/40 ring-1 ring-rose-500/30',
      };
    }

    if (level <= 30) {
      return {
        label: 'Nível baixo',
        description: 'Baixo — Requer Atenção',
        colorClass: 'text-amber-400',
        badgeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
        barGradient: 'from-amber-600 via-amber-500 to-yellow-600',
        cardBorder: 'border-amber-500/40',
        cardBg: 'bg-gradient-to-b from-amber-950/20 via-slate-900/90 to-slate-950/95',
        glow: 'shadow-2xl shadow-amber-950/30',
      };
    }

    if (level <= 75) {
      return {
        label: 'Nível normal',
        description: 'Normal — Faixa Adequada',
        colorClass: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
        barGradient: 'from-emerald-600 via-emerald-500 to-teal-600',
        cardBorder: 'border-emerald-500/30',
        cardBg: 'bg-gradient-to-b from-emerald-950/15 via-slate-900/90 to-slate-950/95',
        glow: 'shadow-2xl shadow-emerald-950/20',
      };
    }

    return {
      label: 'Nível alto',
      description: 'Alto — Reservatório Abastecido',
      colorClass: 'text-cyan-400',
      badgeBg: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
      barGradient: 'from-cyan-600 via-cyan-500 to-blue-600',
      cardBorder: 'border-cyan-500/30',
      cardBg: 'bg-gradient-to-b from-cyan-950/15 via-slate-900/90 to-slate-950/95',
      glow: 'shadow-2xl shadow-cyan-950/20',
    };
  };

  // Helper for pump status text & visual indicator
  const getPumpStatus = (pumpVal: number | undefined, hasReading: boolean) => {
    if (!hasReading || pumpVal === undefined) {
      return {
        text: 'Estado desconhecido',
        color: 'text-slate-500',
        dot: 'bg-slate-600',
      };
    }

    if (pumpVal === 1) {
      return {
        text: 'Bomba ligada',
        color: 'text-emerald-400 font-bold',
        dot: 'bg-emerald-400 animate-pulse',
      };
    }

    return {
      text: 'Bomba desligada',
      color: 'text-slate-400',
      dot: 'bg-slate-600',
    };
  };

  // Helper for optical sensors summary
  const getSensorsSummary = (tank: TankData, hasReading: boolean) => {
    if (!hasReading) {
      return {
        text: 'Sem leitura',
        colorClass: 'text-slate-500',
        functionalCount: 0,
        total: 10,
        hasFault: false,
      };
    }

    const faultyCount = Array.isArray(tank.fault_mask)
      ? tank.fault_mask.filter((f) => f === 1).length
      : 0;

    const functionalCount = Math.max(0, 10 - faultyCount);
    const hasFault = faultyCount > 0 || tank.fault === 1;

    if (hasFault) {
      return {
        text: `${functionalCount}/10 funcionais (${faultyCount} em avaria)`,
        colorClass: 'text-rose-400 font-semibold',
        functionalCount,
        total: 10,
        hasFault: true,
      };
    }

    return {
      text: '10/10 funcionais',
      colorClass: 'text-emerald-400 font-medium',
      functionalCount: 10,
      total: 10,
      hasFault: false,
    };
  };

  const getWaterGradientClass = (sector?: string) => {
    switch (sector) {
      case 'filtrada':
        return 'water-gradient-filtrada';
      case 'nao-filtrada':
        return 'water-gradient-nao-filtrada';
      case 'bruta':
      default:
        return 'water-gradient-bruta';
    }
  };

  return (
    <div
      id="display-mode-container"
      className="min-h-screen w-full bg-[#020617] text-slate-100 flex flex-col font-sans select-none antialiased"
    >
      {/* Top Supervision & Mode Switching Bar */}
      <header className="w-full bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
        {/* Left: Branding & Mode Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-[#081b36] border border-cyan-400/30 p-1 shadow-md flex-shrink-0">
            <img src="/icon.svg" alt="Hossidev Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span className="text-cyan-400 font-extrabold">Hossidev</span>
              <span className="text-slate-300 font-semibold">Modo de Exibição</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono hidden sm:block">
              Supervisão Contínua de Níveis e Reservatórios
            </p>
          </div>
        </div>

        {/* Center: Presentation Mode Selector & Digital Clock */}
        <div className="flex items-center gap-3 sm:gap-6 order-3 md:order-2 w-full md:w-auto justify-between md:justify-center">
          {/* Mode Switcher: Percentual vs Normal */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-2xl border border-slate-800 shadow-inner">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider px-2 hidden lg:inline">
              Visualização:
            </span>
            <button
              id="display-mode-btn-percentage"
              onClick={() => handlePresentationModeChange('percentage')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                presentationMode === 'percentage'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title="Modo Percentual: Apresentação simplificada e focada em percentual com leitura rápida à distância (Atalho: P)"
            >
              <Percent className="w-3.5 h-3.5 text-cyan-400" />
              <span>Percentual</span>
            </button>

            <button
              id="display-mode-btn-normal"
              onClick={() => handlePresentationModeChange('normal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                presentationMode === 'normal'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title="Modo Normal: Representação visual do vaso cilíndrico e escala com as 10 provas ópticas discretas (Atalho: N)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Normal</span>
            </button>
          </div>

          {/* Clock & Date */}
          <div className="flex items-center gap-2 font-mono text-center">
            <span className="text-sm sm:text-base font-bold text-slate-200 tracking-wider">
              {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-xs text-slate-500 hidden xl:inline">·</span>
            <span className="text-xs text-slate-400 hidden xl:inline">
              {currentTime.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Right: Fullscreen & Exit Controls */}
        <div className="flex items-center gap-2 sm:gap-3 order-2 md:order-3">
          <button
            onClick={toggleFullscreen}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            title="Alternar Tela Cheia (Atalho: F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-cyan-400" /> : <Maximize2 className="w-4 h-4 text-cyan-400" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Janela' : 'Tela Cheia'}</span>
          </button>

          <button
            onClick={onExit}
            className="px-3.5 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-950/50"
            title="Voltar ao Painel Normal (Atalho: Esc)"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
            <span className="hidden md:inline text-[10px] text-cyan-400/80 font-mono ml-1">[Esc]</span>
          </button>
        </div>
      </header>

      {/* Main Supervision Canvas */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
        {tanks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Droplets className="w-16 h-16 text-slate-600 mb-4 animate-pulse" />
            <h2 className="text-xl font-bold text-slate-300 mb-2">Aguardando dados dos tanques</h2>
            <p className="text-sm text-slate-500 max-w-md">
              Não existem leituras ativas ou dados disponíveis no momento. Conecte a central de sensores para iniciar a supervisão em tempo real.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 auto-rows-fr">
            {tanks.map((tank) => {
              const hasReading =
                (tank.level !== null && tank.level !== undefined) ||
                (tank.lastValidLevel !== null && tank.lastValidLevel !== undefined);
              const currentLevel = tank.level !== null && tank.level !== undefined
                ? tank.level
                : (tank.lastValidLevel ?? null);

              const status = getLevelStatus(currentLevel, hasReading);
              const pump = getPumpStatus(tank.pump, hasReading);
              const sensorsSummary = getSensorsSummary(tank, hasReading);

              // Stale check
              const isStale =
                tank.isStale === true ||
                (tank.boardStatus && tank.boardStatus !== 'online');

              // Volume calculations
              const hasCapacity = typeof tank.capacityLiters === 'number' && tank.capacityLiters > 0;
              const currentLiters = hasReading && hasCapacity && currentLevel !== null
                ? Math.round((currentLevel / 100) * tank.capacityLiters!)
                : null;

              // Timestamp formatting
              const timestamp = tank.lastValidTimestamp || tank.lastUpdated;
              const formattedTime = timestamp
                ? new Date(timestamp).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : null;
              const formattedDate = timestamp
                ? new Date(timestamp).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })
                : null;

              // -----------------------------------------------------------------
              // MODO PERCENTUAL (Apresentação simplificada, rápida e à distância)
              // -----------------------------------------------------------------
              if (presentationMode === 'percentage') {
                return (
                  <div
                    key={tank.id}
                    id={`displayTank_pct_${tank.id}`}
                    className={`rounded-3xl p-6 sm:p-7 flex flex-col justify-between border transition-all duration-300 ${status.cardBg} ${status.cardBorder} ${status.glow}`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                              {tank.name.replace(/\s*\(.*\)$/, '')}
                            </h2>
                            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-slate-800/90 border border-slate-700/80 text-cyan-300">
                              ID #{tank.id}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1 font-medium">
                            {tank.sectorName}
                          </p>
                        </div>

                        {/* State Badge with explicit text and high visibility */}
                        <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border ${status.badgeBg}`}>
                          {status.label}
                        </span>
                      </div>

                      {/* Primary Percentage Indicator: Large readable typography */}
                      <div className="my-6 flex items-baseline justify-between gap-4">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-5xl sm:text-6xl font-black font-mono tracking-tight ${status.colorClass}`}>
                            {hasReading && currentLevel !== null ? `${currentLevel}%` : '---'}
                          </span>
                          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                            Enchimento
                          </span>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                            Estado
                          </div>
                          <div className={`text-sm sm:text-base font-bold ${status.colorClass}`}>
                            {status.description}
                          </div>
                        </div>
                      </div>

                      {/* Prominent High-Visibility Level Bar */}
                      <div className="w-full bg-slate-950 rounded-2xl h-5 p-1 border border-slate-800/80 shadow-inner overflow-hidden mb-6">
                        <div
                          className={`h-full rounded-xl bg-gradient-to-r ${status.barGradient} transition-all duration-700 shadow-md`}
                          style={{ width: `${hasReading && currentLevel !== null ? Math.min(100, Math.max(0, currentLevel)) : 0}%` }}
                        />
                      </div>

                      {/* Bento Information Grid: Sensores, Volume, Capacidade, Bomba */}
                      <div className="grid grid-cols-2 gap-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800/70 text-xs">
                        {/* Estado dos Sensores (Resumido no Modo Percentual) */}
                        <div className="col-span-2 pb-2 border-b border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {sensorsSummary.hasFault ? (
                              <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            )}
                            <span className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider">
                              Sensores
                            </span>
                          </div>
                          <span className={`text-xs font-mono font-semibold ${sensorsSummary.colorClass}`}>
                            {sensorsSummary.text}
                          </span>
                        </div>

                        {/* Volume Atual */}
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider">
                            Volume Atual
                          </span>
                          <div className="text-base sm:text-lg font-bold font-mono text-white mt-0.5">
                            {hasReading && currentLiters !== null
                              ? `${currentLiters.toLocaleString('pt-BR')} L`
                              : hasReading
                              ? `${currentLevel}% (Modo %)`
                              : 'N/D'}
                          </div>
                        </div>

                        {/* Capacidade */}
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider">
                            Capacidade
                          </span>
                          <div className="text-base sm:text-lg font-bold font-mono text-slate-300 mt-0.5">
                            {hasCapacity
                              ? `${tank.capacityLiters!.toLocaleString('pt-BR')} L`
                              : 'Modo Percentual'}
                          </div>
                        </div>

                        {/* Bomba Associada */}
                        <div className="col-span-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-slate-400" />
                            <span className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider">
                              Bomba Associada
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${pump.dot}`} />
                            <span className={`text-xs ${pump.color}`}>
                              {pump.text}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Timestamp & Discrete State Indicator */}
                    <div className="mt-5 pt-3.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>
                          {formattedTime ? (
                            <>
                              <strong className="text-slate-300">{formattedTime}</strong>
                              <span className="text-slate-500 hidden sm:inline"> ({formattedDate})</span>
                            </>
                          ) : (
                            'Aguardando leitura'
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Activity className={`w-3.5 h-3.5 ${hasReading && !isStale ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <span className={hasReading && !isStale ? 'text-emerald-400 font-semibold' : 'text-amber-400/90 font-medium'}>
                          {hasReading && !isStale ? 'Dados atualizados' : hasReading ? 'Última leitura conhecida' : 'Sem sinal'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              // -----------------------------------------------------------------
              // MODO NORMAL (Apresentação detalhada com vaso cilíndrico e 10 provas)
              // -----------------------------------------------------------------
              return (
                <div
                  key={tank.id}
                  id={`displayTank_norm_${tank.id}`}
                  className={`rounded-3xl p-5 sm:p-6 flex flex-col justify-between border transition-all duration-300 ${status.cardBg} ${status.cardBorder} ${status.glow}`}
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                            {tank.name.replace(/\s*\(.*\)$/, '')}
                          </h2>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-800/90 border border-slate-700/80 text-cyan-300">
                            ID #{tank.id}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 font-medium">
                          {tank.sectorName}
                        </p>
                      </div>

                      <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wider border ${status.badgeBg}`}>
                        {status.label}
                      </span>
                    </div>

                    {/* Hydraulic Vessel + Optical Probes Ladder (10 Provas) */}
                    <div className="flex items-center justify-around gap-4 my-4 py-1">
                      {/* Visual Cylindrical Vessel */}
                      <div className="relative flex flex-col items-center">
                        <div className="w-[88px] sm:w-[100px] h-3 rounded-t-full bg-slate-800/90 border-t border-x border-slate-700 flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        </div>

                        <div className="relative w-[88px] sm:w-[100px] h-[180px] bg-slate-950/90 border-x border-b border-slate-800 rounded-b-2xl overflow-hidden flex flex-col-reverse shadow-inner">
                          {/* Grid Ticks */}
                          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 px-1.5 py-2 z-10">
                            <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">100%</div>
                            <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">75%</div>
                            <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">50%</div>
                            <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">25%</div>
                            <div className="w-full border-b border-dashed border-white text-[8px] text-right font-mono text-white">0%</div>
                          </div>

                          {/* Water Column */}
                          <div
                            className={`w-full ${getWaterGradientClass(tank.sector)} transition-all duration-700 ease-out relative ${
                              isStale ? 'opacity-90 saturate-75' : ''
                            }`}
                            style={{ height: `${hasReading && currentLevel !== null ? Math.min(100, Math.max(0, currentLevel)) : 0}%` }}
                          >
                            {hasReading && currentLevel !== null && currentLevel > 0 && !isStale && (
                              <div className="absolute -top-1 left-0 right-0 h-2 bg-white/40 blur-[1px] rounded-full animate-wave" />
                            )}
                            {isStale && currentLevel !== null && currentLevel > 0 && (
                              <div className="absolute -top-1 left-0 right-0 h-1.5 bg-amber-300/40 blur-[1px] rounded-full" />
                            )}
                          </div>

                          {/* Percentage Text Overlay */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
                            <span className="text-xl font-black font-mono text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                              {hasReading && currentLevel !== null ? `${currentLevel}%` : '---'}
                            </span>
                            <span className="text-[10px] font-semibold font-mono text-cyan-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                              {hasReading && currentLiters !== null
                                ? `${(currentLiters / 1000).toFixed(1)} m³`
                                : hasReading
                                ? 'Modo %'
                                : 'Sem sinal'}
                            </span>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-400 font-mono mt-1">
                          {hasReading && currentLiters !== null
                            ? `${currentLiters.toLocaleString('pt-BR')} L`
                            : hasReading
                            ? `Nível: ${currentLevel}%`
                            : 'Aguardando'}
                        </div>
                      </div>

                      {/* 10-Level Optical Sensors Ladder */}
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                          10 Provas Ópticas
                        </div>

                        <div className="flex flex-col-reverse justify-between h-[180px] py-1 border-l border-slate-800 pl-3">
                          {Array.from({ length: 10 }, (_, i) => {
                            const sensorNum = i + 1;
                            const sensorIdx = i;
                            const hasSensorsArray = Array.isArray(tank.sensors) && tank.sensors.length === 10;
                            const isSubmerged = hasReading
                              ? hasSensorsArray
                                ? tank.sensors[sensorIdx] === 1
                                : currentLevel !== null && sensorNum * 10 <= currentLevel
                              : false;
                            const isFaulty = hasReading && Array.isArray(tank.fault_mask) && tank.fault_mask[sensorIdx] === 1;

                            return (
                              <div
                                key={sensorNum}
                                className="flex items-center gap-2 text-[10px] font-mono"
                                title={`Sensor S${sensorNum} (${sensorNum * 10}%): ${
                                  !hasReading
                                    ? 'Sem leitura'
                                    : isFaulty
                                    ? 'AVARIA FÍSICA DETECTADA'
                                    : isSubmerged
                                    ? 'Submerso (Água em contato)'
                                    : 'Seco'
                                }`}
                              >
                                <div
                                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                                    !hasReading
                                      ? 'bg-slate-900 border border-slate-800'
                                      : isFaulty
                                      ? 'bg-rose-500 border border-white shadow-lg shadow-rose-500 animate-pulse'
                                      : isSubmerged
                                      ? isStale
                                        ? 'bg-amber-400 border border-white/80 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
                                        : 'bg-cyan-400 border border-white/80 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                                      : 'bg-slate-900 border border-slate-800'
                                  }`}
                                />
                                <span
                                  className={
                                    !hasReading
                                      ? 'text-slate-600'
                                      : isFaulty
                                      ? 'text-rose-400 font-bold'
                                      : isSubmerged
                                      ? 'text-slate-200 font-medium'
                                      : 'text-slate-500'
                                  }
                                >
                                  {isFaulty ? `S${sensorNum} (AVARIA)` : `S${sensorNum}: ${sensorNum * 10}%`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Bento Information Grid: Volume, Capacidade, Bomba */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-2xl border border-slate-800/70 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
                          Volume Atual
                        </span>
                        <div className="text-sm sm:text-base font-bold font-mono text-white mt-0.5">
                          {hasReading && currentLiters !== null
                            ? `${currentLiters.toLocaleString('pt-BR')} L`
                            : hasReading
                            ? `${currentLevel}% (Modo %)`
                            : 'N/D'}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
                          Capacidade Nominal
                        </span>
                        <div className="text-sm sm:text-base font-bold font-mono text-slate-300 mt-0.5">
                          {hasCapacity
                            ? `${tank.capacityLiters!.toLocaleString('pt-BR')} L`
                            : 'Modo Percentual'}
                        </div>
                      </div>

                      <div className="col-span-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
                            Bomba de Carga
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${pump.dot}`} />
                          <span className={`text-xs ${pump.color}`}>
                            {pump.text}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Timestamp & Discrete State Indicator */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        {formattedTime ? (
                          <>
                            <strong className="text-slate-300">{formattedTime}</strong>
                            <span className="text-slate-500 hidden sm:inline"> ({formattedDate})</span>
                          </>
                        ) : (
                          'Aguardando leitura'
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Activity className={`w-3.5 h-3.5 ${hasReading && !isStale ? 'text-emerald-400' : 'text-amber-400'}`} />
                      <span className={hasReading && !isStale ? 'text-emerald-400 font-semibold' : 'text-amber-400/90 font-medium'}>
                        {hasReading && !isStale ? 'Dados atualizados' : hasReading ? 'Última leitura conhecida' : 'Sem sinal'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

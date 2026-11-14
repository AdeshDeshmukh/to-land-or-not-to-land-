import { useState, useEffect } from 'react';
import { CANDIDATE_SITES } from './data/candidateSites';
import { assessLandingSiteRisk } from './engine/riskEngine';
import { CandidateSite, LanderProfile } from './types';
import { LunarGlobe3D } from './components/LunarGlobe3D';
import { LandingParametersPanel, DEFAULT_MISSION_PARAMETERS } from './components/LandingParametersPanel';
import { HorizonPlot } from './components/HorizonPlot';
import { ElevationProfile } from './components/ElevationProfile';
import { CountdownTimers } from './components/CountdownTimers';
import { Starfield } from './components/Starfield';
import { 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  Compass, 
  Sun, 
  Sliders,
  BarChart3,
  X,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Flame,
  Activity
} from 'lucide-react';

export default function App() {
  const [allSites] = useState<CandidateSite[]>(CANDIDATE_SITES);
  const [landingParams, setLandingParams] = useState<LanderProfile>(DEFAULT_MISSION_PARAMETERS);
  const [selectedSite, setSelectedSite] = useState<CandidateSite>(CANDIDATE_SITES[0]);
  const [simulatedDateOffset, setSimulatedDateOffset] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Left & Right drawer toggles for clean, centered map experience
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState<boolean>(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState<boolean>(false);

  // Synodic lunar day/night cycle animation loop (-14d to +14d)
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setSimulatedDateOffset(prev => {
        const next = Math.round((prev + 0.1 * playbackSpeed) * 10) / 10;
        if (next > 14) {
          return -14;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  // Simulate illumination shifts based on date offset
  const computedIllumination = Math.max(
    5,
    Math.min(100, Math.round(selectedSite.defaultIlluminationPct + Math.sin(simulatedDateOffset * 0.4) * 25))
  );

  const assessment = assessLandingSiteRisk(
    selectedSite, 
    computedIllumination, 
    selectedSite.defaultEarthLos, 
    landingParams
  );

  const getStatusBadge = (status: 'GREEN' | 'YELLOW' | 'RED') => {
    switch (status) {
      case 'GREEN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> GO / LOW RISK
          </span>
        );
      case 'YELLOW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> CAUTION / MODERATE
          </span>
        );
      case 'RED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5 text-rose-400" /> NO-GO / HAZARD
          </span>
        );
    }
  };

  return (
    <div className="h-screen w-screen bg-space-950 text-slate-100 flex flex-col font-sans relative overflow-hidden select-none">
      {/* Background Starfield */}
      <Starfield />

      {/* Centralized Clean Header */}
      <header className="border-b border-slate-800/80 bg-space-950/80 backdrop-blur-md px-6 py-3 flex flex-col items-center justify-center relative z-30 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-white text-center">
          To Land or Not to Land
        </h1>
        <p className="text-xs text-slate-400 text-center mt-0.5">
          Lunar Landing Site Risk Assessment & Decision Support
        </p>
      </header>

      {/* Main Interactive Stage with Centered 3D Lunar Globe */}
      <div className="flex-1 relative w-full h-full overflow-hidden">
        
        {/* Full Viewport 3D Lunar Globe (Center Stage) */}
        <div className="absolute inset-0 z-0">
          <LunarGlobe3D 
            sites={allSites} 
            selectedSite={selectedSite} 
            onSelectSite={(site) => {
              setSelectedSite(site);
              // Open right drawer when a site is selected so user sees assessment
              setIsRightDrawerOpen(true);
            }} 
            sunIlluminationOffset={simulatedDateOffset}
            lander={landingParams}
          />
        </div>

        {/* Floating Toggle Buttons on Viewport */}
        
        {/* Left Floating Trigger: Inputs & Controls */}
        <div className="absolute top-4 left-4 z-20">
          <button
            onClick={() => setIsLeftDrawerOpen(prev => !prev)}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold backdrop-blur-xl border transition-all shadow-2xl ${
              isLeftDrawerOpen
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
                : 'bg-space-900/80 text-slate-200 border-slate-700/80 hover:bg-space-900 hover:border-slate-600 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Inputs & Parameters</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          </button>
        </div>

        {/* Right Floating Trigger: Outputs & Analysis */}
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => setIsRightDrawerOpen(prev => !prev)}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold backdrop-blur-xl border transition-all shadow-2xl ${
              isRightDrawerOpen
                ? 'bg-space-900 text-white border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
                : 'bg-space-900/80 text-slate-200 border-slate-700/80 hover:bg-space-900 hover:border-slate-600 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span>Assessment & Telemetry</span>
            {getStatusBadge(assessment.overall_status)}
          </button>
        </div>

        {/* ========================================================= */}
        {/* LEFT DRAWER: INPUTS (Sites, Parameters, Cycle Simulator) */}
        {/* ========================================================= */}
        <aside 
          className={`absolute top-0 bottom-0 left-0 w-96 max-w-[90vw] z-30 bg-space-950/95 backdrop-blur-2xl border-r border-slate-800/90 p-5 overflow-y-auto space-y-4 shadow-2xl transition-transform duration-300 ease-in-out ${
            isLeftDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Mission Inputs
              </h2>
            </div>
            <button
              onClick={() => setIsLeftDrawerOpen(false)}
              className="p-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 1. Candidate Sites Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Compass className="w-3.5 h-3.5 text-cyan-400" /> Landing Sites ({allSites.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {allSites.map((site) => {
                const siteRisk = assessLandingSiteRisk(site, undefined, undefined, landingParams);
                const isSelected = site.id === selectedSite.id;
                return (
                  <button
                    key={site.id}
                    onClick={() => {
                      setSelectedSite(site);
                      setIsRightDrawerOpen(true);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-1 ${
                      isSelected 
                        ? 'bg-cyan-950/30 border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.15)]' 
                        : 'bg-space-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-space-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-slate-100">{site.name}</span>
                      {getStatusBadge(siteRisk.overall_status)}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                      <span>{site.region}</span>
                      <span>•</span>
                      <span>{site.coordinates.latitude}° N, {site.coordinates.longitude}° E</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Landing Safety Parameters Panel */}
          <LandingParametersPanel 
            parameters={landingParams} 
            onChange={setLandingParams} 
          />

          {/* 3. Launch Window Slip & Day/Night Animation */}
          <div className="bg-space-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5 font-mono uppercase">
                <Sun className="w-3.5 h-3.5 text-amber-400" /> Synodic Cycle Simulator
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                T {simulatedDateOffset >= 0 ? `+${simulatedDateOffset.toFixed(1)}` : simulatedDateOffset.toFixed(1)}d
              </span>
            </div>

            {/* Play/Pause & Speed Controller */}
            <div className="flex items-center justify-between bg-space-950/70 p-2 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsPlaying(prev => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium transition ${
                    isPlaying 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                      : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20'
                  }`}
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setSimulatedDateOffset(0);
                  }}
                  className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  title="Reset to T-0"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>

              {/* Speed Buttons */}
              <div className="flex items-center gap-1 text-[10px] font-mono">
                {[1, 2, 5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-1.5 py-0.5 rounded font-mono transition ${
                      playbackSpeed === speed
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            <input 
              type="range" 
              min="-14" 
              max="14" 
              step="0.1"
              value={simulatedDateOffset}
              onChange={(e) => {
                setIsPlaying(false);
                setSimulatedDateOffset(Number(e.target.value));
              }}
              className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-slate-400">
              <span>-14 Days</span>
              <span>Nominal (T-0)</span>
              <span>+14 Days</span>
            </div>

            {/* Quick Demo Presets */}
            <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80">
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setSimulatedDateOffset(0);
                  setSelectedSite(CANDIDATE_SITES[0]);
                }}
                className="px-2 py-1.5 rounded bg-space-950/60 hover:bg-slate-800 text-[10px] text-slate-200 border border-slate-800 flex items-center gap-1 font-mono"
              >
                <Zap className="w-3 h-3 text-cyan-400" />
                <span>Nominal (T-0)</span>
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setSimulatedDateOffset(6);
                  setSelectedSite(CANDIDATE_SITES[2]);
                }}
                className="px-2 py-1.5 rounded bg-space-950/60 hover:bg-slate-800 text-[10px] text-rose-300 border border-rose-500/30 flex items-center gap-1 font-mono"
              >
                <Flame className="w-3 h-3 text-rose-400" />
                <span>Shadow Trap (+6d)</span>
              </button>
            </div>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* RIGHT DRAWER: OUTPUTS (Telemetry, Risk Evaluation, Altimetry) */}
        {/* ========================================================= */}
        <aside 
          className={`absolute top-0 bottom-0 right-0 w-[500px] max-w-[92vw] z-30 bg-space-950/95 backdrop-blur-2xl border-l border-slate-800/90 p-5 overflow-y-auto space-y-4 shadow-2xl transition-transform duration-300 ease-in-out ${
            isRightDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Telemetry & Risk Assessment
              </h2>
            </div>
            <button
              onClick={() => setIsRightDrawerOpen(false)}
              className="p-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Top Banner: Site Status Summary */}
          <div className="bg-space-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 block">
                  {selectedSite.region} Target
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight">{selectedSite.name}</h3>
                <span className="text-xs text-slate-400 font-mono">
                  {selectedSite.coordinates.latitude}° N, {selectedSite.coordinates.longitude}° E • Elev: {selectedSite.coordinates.elevation_m} m
                </span>
              </div>
              <div className="shrink-0">{getStatusBadge(assessment.overall_status)}</div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed border-l-2 border-cyan-500/40 pl-2.5">
              {selectedSite.description}
            </p>

            <div className="bg-space-950/70 rounded-lg p-2.5 border border-slate-800/80 text-xs font-mono flex items-center gap-2 text-slate-300">
              <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{assessment.overall_reason}</span>
            </div>
          </div>

          {/* 4-Factor Engineering Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {assessment.factors.map((factor, idx) => {
              const isGreen = factor.level === 'GREEN';
              const isYellow = factor.level === 'YELLOW';
              return (
                <div 
                  key={idx}
                  className="bg-space-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">{factor.name}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                        isGreen ? 'bg-emerald-500/10 text-emerald-400' : isYellow ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {factor.level}
                      </span>
                    </div>
                    <div className="text-base font-bold font-mono text-white mb-1">{factor.value}</div>
                  </div>
                  <p className="text-[10px] text-slate-400 border-t border-slate-800/60 pt-1.5 leading-tight">
                    {factor.explanation}
                  </p>
                </div>
              );
            })}
          </div>

          {/* 2D Local Horizon & Elevation SkyPlot (Sun & Earth Angles) */}
          <HorizonPlot 
            site={selectedSite} 
            simulatedDateOffset={simulatedDateOffset} 
          />

          {/* Topographic Elevation Cross-Section Profile (2 km Altimetry Slice) */}
          <ElevationProfile 
            site={selectedSite} 
          />

          {/* Telemetry Survival & Countdown Timers */}
          <CountdownTimers 
            site={selectedSite}
            simulatedDateOffset={simulatedDateOffset}
            computedIllumination={computedIllumination}
            parameters={landingParams}
          />
        </aside>

      </div>
    </div>
  );
}

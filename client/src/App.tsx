import { useState, useEffect } from 'react';
import { CANDIDATE_SITES } from './data/candidateSites';
import { assessLandingSiteRisk } from './engine/riskEngine';
import { CandidateSite, LanderProfile } from './types';
import { LunarGlobe3D } from './components/LunarGlobe3D';
import { LandingParametersPanel, DEFAULT_MISSION_PARAMETERS } from './components/LandingParametersPanel';
import { CustomProbeModal } from './components/CustomProbeModal';
import { Starfield } from './components/Starfield';
import { HorizonPlot } from './components/HorizonPlot';
import { ElevationProfile } from './components/ElevationProfile';
import { CountdownTimers } from './components/CountdownTimers';
import { ComparisonModal } from './components/ComparisonModal';
import { 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  Compass, 
  Sun, 
  Radio, 
  Activity, 
  Moon, 
  Layers, 
  Zap, 
  Flame, 
  Clock,
  MapPin,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';

export default function App() {
  const [allSites, setAllSites] = useState<CandidateSite[]>(CANDIDATE_SITES);
  const [landingParams, setLandingParams] = useState<LanderProfile>(DEFAULT_MISSION_PARAMETERS);
  const [selectedSite, setSelectedSite] = useState<CandidateSite>(CANDIDATE_SITES[0]);
  const [simulatedDateOffset, setSimulatedDateOffset] = useState<number>(0); // Days offset
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isComparisonOpen, setIsComparisonOpen] = useState<boolean>(false);
  const [isProbeModalOpen, setIsProbeModalOpen] = useState<boolean>(false);
  const [probeCoords, setProbeCoords] = useState<{ lat: number; lon: number }>({ lat: -85, lon: 15 });
  const [currentTimeUTC, setCurrentTimeUTC] = useState<string>('');

  const handleProbeCoordinate = (lat: number, lon: number) => {
    setProbeCoords({ lat, lon });
    setIsProbeModalOpen(true);
  };

  const handleAddCustomSite = (newSite: CandidateSite) => {
    setAllSites(prev => [newSite, ...prev]);
    setSelectedSite(newSite);
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeUTC(now.toUTCString().slice(17, 25) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> GO / LOW RISK
          </span>
        );
      case 'YELLOW':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> CAUTION / MODERATE
          </span>
        );
      case 'RED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-4 h-4 text-rose-400" /> NO-GO / HAZARD
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-space-950 text-slate-100 flex flex-col font-sans relative overflow-x-hidden">
      {/* Background Deep Space Dynamic Starfield */}
      <Starfield />

      {/* Header */}
      <header className="border-b border-slate-800 bg-space-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <Moon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              To Land or Not to Land
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">NASA Space Apps 2026</span>
            </h1>
            <p className="text-xs text-slate-400">Lunar Landing Site Risk Assessment & Decision Support</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>MISSION CLOCK: {currentTimeUTC}</span>
          </div>

          <button
            onClick={() => {
              setProbeCoords({ lat: -85, lon: 15 });
              setIsProbeModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition shadow-sm font-sans font-medium"
            title="Probe custom coordinates anywhere on the Moon"
          >
            <MapPin className="w-4 h-4 text-cyan-400" />
            <span className="hidden md:inline">Probe Coordinates</span>
          </button>

          <button
            onClick={() => setIsComparisonOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white transition shadow-sm font-sans font-medium"
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>Compare Sites</span>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            NASA LOLA Grid: ACTIVE
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Vehicle & Site Selector */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          
          {/* Landing Safety Constraints & Parameters Panel */}
          <LandingParametersPanel 
            parameters={landingParams} 
            onChange={setLandingParams} 
          />

          <div className="bg-space-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-400" /> Landing Sites ({allSites.length})
              </h2>
              <button
                onClick={() => {
                  setProbeCoords({ lat: -85, lon: 15 });
                  setIsProbeModalOpen(true);
                }}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400 transition"
              >
                <MapPin className="w-3 h-3" /> + Custom Pin
              </button>
            </div>
            <div className="space-y-2">
              {allSites.map((site) => {
                const siteRisk = assessLandingSiteRisk(site, undefined, undefined, landingParams);
                const isSelected = site.id === selectedSite.id;
                return (
                  <button
                    key={site.id}
                    onClick={() => setSelectedSite(site)}
                    className={`w-full text-left p-3.5 rounded-lg border transition-all flex flex-col gap-1.5 ${
                      isSelected 
                        ? 'bg-cyan-950/20 border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.1)]' 
                        : 'bg-space-800/40 border-slate-800/80 hover:border-slate-700 hover:bg-space-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-100">{site.name}</span>
                      {getStatusBadge(siteRisk.overall_status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                      <span>{site.region}</span>
                      <span>•</span>
                      <span>{site.coordinates.latitude}° N, {site.coordinates.longitude}° E</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Launch Date Simulation Scrubber, Day/Night Animation & Presets */}
          <div className="bg-space-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-400" /> Launch Window Slip Simulator
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                T {simulatedDateOffset >= 0 ? `+${simulatedDateOffset.toFixed(1)}` : simulatedDateOffset.toFixed(1)} Days
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Simulate launch slips or play the synodic cycle to observe terminator shadow sweeps and solar power windows.
            </p>

            {/* Play/Pause & Speed Controller */}
            <div className="flex items-center justify-between mb-3 bg-space-950/70 p-2 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsPlaying(prev => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition shadow-sm ${
                    isPlaying 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                      : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20'
                  }`}
                  title={isPlaying ? "Pause synodic cycle animation" : "Play lunar day/night terminator sweep"}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Pause' : 'Play Cycle'}</span>
                </button>

                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setSimulatedDateOffset(0);
                  }}
                  className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition"
                  title="Reset to Nominal (T-0)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Speed Controller Pills */}
              <div className="flex items-center gap-1 text-[11px] font-mono">
                <span className="text-slate-400 mr-1 text-[10px]">Speed:</span>
                {[1, 2, 5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                      playbackSpeed === speed
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                        : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
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
              className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1 mb-4">
              <span>-14 Days</span>
              <span>Nominal (T-0)</span>
              <span>+14 Days</span>
            </div>

            {/* Quick Presets for Demo */}
            <div className="border-t border-slate-800/80 pt-3">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2">
                Quick Mission Presets (Demo)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setSimulatedDateOffset(0);
                    setSelectedSite(CANDIDATE_SITES[0]);
                  }}
                  className="px-2.5 py-1.5 rounded bg-slate-800/80 hover:bg-slate-800 text-[11px] text-slate-200 border border-slate-700/60 flex items-center gap-1.5 transition text-left"
                >
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Nominal Arrival</span>
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setSimulatedDateOffset(6);
                    setSelectedSite(CANDIDATE_SITES[2]);
                  }}
                  className="px-2.5 py-1.5 rounded bg-slate-800/80 hover:bg-slate-800 text-[11px] text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition text-left"
                >
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  <span>Shadow Trap (+6d)</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Deep Risk Factor Inspector */}
        <section className="lg:col-span-8 flex flex-col gap-5">
          
          {/* Interactive 3D Lunar Globe Viewport */}
          <LunarGlobe3D 
            sites={allSites} 
            selectedSite={selectedSite} 
            onSelectSite={setSelectedSite} 
            sunIlluminationOffset={simulatedDateOffset}
            lander={landingParams}
            onProbeCoordinate={handleProbeCoordinate}
          />

          {/* Top Banner: Site Status Summary */}
          <div className="bg-space-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">{selectedSite.region} Target</span>
                <h2 className="text-2xl font-bold text-white tracking-tight">{selectedSite.name}</h2>
              </div>
              <div>{getStatusBadge(assessment.overall_status)}</div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed mb-4 border-l-2 border-cyan-500/40 pl-3">
              {selectedSite.description}
            </p>

            <div className="bg-space-950/60 rounded-lg p-3.5 border border-slate-800/80 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-slate-300">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Assessment Summary: {assessment.overall_reason}</span>
              </div>
              <span className="text-[10px] text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded shrink-0 self-start sm:self-auto">
                Criteria: Max {landingParams.maxSlopeDeg}° Slope, Min {landingParams.minIlluminationPct}% Sun
              </span>
            </div>
          </div>

          {/* 4-Factor Engineering Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assessment.factors.map((factor, idx) => {
              const isGreen = factor.level === 'GREEN';
              const isYellow = factor.level === 'YELLOW';
              return (
                <div 
                  key={idx}
                  className="bg-space-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs uppercase font-mono tracking-wider text-slate-400">{factor.name}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        isGreen ? 'bg-emerald-500/10 text-emerald-400' : isYellow ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {factor.level}
                      </span>
                    </div>
                    <div className="text-xl font-bold font-mono text-white mb-2">{factor.value}</div>
                  </div>
                  <p className="text-xs text-slate-400 border-t border-slate-800/60 pt-2.5">
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
            lander={landingParams}
          />

          {/* Telemetry Bar */}
          <div className="bg-space-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              Elevation: <span className="text-slate-200">{selectedSite.coordinates.elevation_m} m</span>
            </div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              Direct Comms Link: <span className="text-slate-200">{selectedSite.defaultEarthLos ? 'Available' : 'Blocked by Terrain'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-cyan-400" />
              Illumination Window: <span className="text-slate-200">{computedIllumination}% Peak</span>
            </div>
          </div>

        </section>

      </main>

      {/* Multi-Site Comparison Modal Drawer */}
      <ComparisonModal
        sites={allSites}
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        onSelectSite={setSelectedSite}
        lander={landingParams}
      />

      {/* Custom Coordinate Probe Modal */}
      <CustomProbeModal
        isOpen={isProbeModalOpen}
        onClose={() => setIsProbeModalOpen(false)}
        onAddCustomSite={handleAddCustomSite}
        selectedLander={landingParams}
        initialLat={probeCoords.lat}
        initialLon={probeCoords.lon}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-space-950 px-6 py-4 text-center text-xs text-slate-400">
        NASA Space Apps Challenge 2026 • Team "To Land or Not to Land" • Developed with NASA LOLA, Moon Trek, and JPL Horizons data.
      </footer>
    </div>
  );
}


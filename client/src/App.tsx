import { useState } from 'react';
import { CANDIDATE_SITES } from './data/candidateSites';
import { assessLandingSiteRisk } from './engine/riskEngine';
import { CandidateSite } from './types';
import { LunarGlobe } from './components/LunarGlobe';
import { ShieldCheck, AlertTriangle, XCircle, Compass, Sun, Radio, Activity, Moon } from 'lucide-react';

export default function App() {
  const [selectedSite, setSelectedSite] = useState<CandidateSite>(CANDIDATE_SITES[0]);
  const [simulatedDateOffset, setSimulatedDateOffset] = useState<number>(0); // Days offset

  // Simulate illumination shifts based on date offset
  const computedIllumination = Math.max(
    5,
    Math.min(100, Math.round(selectedSite.defaultIlluminationPct + Math.sin(simulatedDateOffset * 0.4) * 25))
  );

  const assessment = assessLandingSiteRisk(selectedSite, computedIllumination, selectedSite.defaultEarthLos);

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
    <div className="min-h-screen bg-space-950 text-slate-100 flex flex-col font-sans">
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
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            NASA LOLA & Moon Trek Grid: ACTIVE
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Candidate Site Selector */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-space-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" /> Candidate Landing Sites
            </h2>
            <div className="space-y-2">
              {CANDIDATE_SITES.map((site) => {
                const siteRisk = assessLandingSiteRisk(site);
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

          {/* Launch Date Simulation Scrubber */}
          <div className="bg-space-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-400" /> Launch Window Slip Simulator
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                T {simulatedDateOffset >= 0 ? `+${simulatedDateOffset}` : simulatedDateOffset} Days
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Simulate launch slips to observe changes in solar illumination cycles and shadow traps.
            </p>
            <input 
              type="range" 
              min="-14" 
              max="14" 
              value={simulatedDateOffset}
              onChange={(e) => setSimulatedDateOffset(Number(e.target.value))}
              className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
              <span>-14 Days</span>
              <span>Nominal (T-0)</span>
              <span>+14 Days</span>
            </div>
          </div>
        </section>

        {/* Right Column: Deep Risk Factor Inspector */}
        <section className="lg:col-span-8 flex flex-col gap-5">
          
          {/* Interactive 3D/2.5D Lunar Globe Viewport */}
          <LunarGlobe 
            sites={CANDIDATE_SITES} 
            selectedSite={selectedSite} 
            onSelectSite={setSelectedSite} 
            sunIlluminationOffset={simulatedDateOffset}
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

            <div className="bg-space-950/60 rounded-lg p-3.5 border border-slate-800/80 text-xs font-mono flex items-center gap-2 text-slate-300">
              <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Assessment Summary: {assessment.overall_reason}</span>
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

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-space-950 px-6 py-4 text-center text-xs text-slate-400">
        NASA Space Apps Challenge 2026 • Team "To Land or Not to Land" • Developed with NASA LOLA, Moon Trek, and JPL Horizons data.
      </footer>
    </div>
  );
}


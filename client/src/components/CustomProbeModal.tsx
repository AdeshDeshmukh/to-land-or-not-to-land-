import React, { useState, useMemo } from 'react';
import { CandidateSite, LanderProfile } from '../types';
import { estimateLunarTerrain } from '../utils/lunarTelemetry';
import { assessLandingSiteRisk } from '../engine/riskEngine';
import { 
  MapPin, 
  X, 
  Compass, 
  Radio, 
  Sun, 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface CustomProbeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCustomSite: (site: CandidateSite) => void;
  selectedLander: LanderProfile;
  initialLat?: number;
  initialLon?: number;
}

export const CustomProbeModal: React.FC<CustomProbeModalProps> = ({
  isOpen,
  onClose,
  onAddCustomSite,
  selectedLander,
  initialLat = -85.0,
  initialLon = 15.0,
}) => {
  const [lat, setLat] = useState<number>(initialLat);
  const [lon, setLon] = useState<number>(initialLon);
  const [siteName, setSiteName] = useState<string>('Custom Artemis Scout');

  // Compute live estimated site and assessment based on inputs
  const estimatedSite = useMemo(() => {
    return estimateLunarTerrain(lat, lon, siteName);
  }, [lat, lon, siteName]);

  const assessment = useMemo(() => {
    return assessLandingSiteRisk(estimatedSite, undefined, undefined, selectedLander);
  }, [estimatedSite, selectedLander]);

  if (!isOpen) return null;

  const handleDeploy = () => {
    onAddCustomSite(estimatedSite);
    onClose();
  };

  const applyPreset = (presetName: string, presetLat: number, presetLon: number) => {
    setSiteName(presetName);
    setLat(presetLat);
    setLon(presetLon);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-space-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scaleIn">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Lunar Surface Coordinate Probe</h3>
              <p className="text-xs text-slate-400">Evaluate any arbitrary latitude/longitude on the Moon</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Famous Presets */}
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-2">
            Quick Historical & Scientific Presets:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset('Shackleton South Rim', -89.54, 0.0)}
              className="px-2.5 py-1 rounded bg-space-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 text-xs font-mono transition"
            >
              South Pole Rim (-89.5°)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('Apollo 11 Tranquillity', 0.67, 23.47)}
              className="px-2.5 py-1 rounded bg-space-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 text-xs font-mono transition"
            >
              Apollo 11 Mare (0.7°N)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('Tycho Central Peak', -43.31, -11.36)}
              className="px-2.5 py-1 rounded bg-space-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 text-xs font-mono transition"
            >
              Tycho Peak (-43.3°)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("Von Kármán (Far Side)", -45.45, 177.58)}
              className="px-2.5 py-1 rounded bg-space-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 text-xs font-mono transition"
            >
              Far Side Basin (177.6°E)
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="space-y-3 font-mono text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Target Mission Name</label>
            <input 
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full bg-space-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-sans focus:outline-none focus:border-cyan-500"
              placeholder="e.g. Artemis Landing Target Alpha"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Latitude (-90° to +90°)</label>
              <input 
                type="number"
                min="-90"
                max="90"
                step="0.01"
                value={lat}
                onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                className="w-full bg-space-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Longitude (-180° to +180°)</label>
              <input 
                type="number"
                min="-180"
                max="180"
                step="0.01"
                value={lon}
                onChange={(e) => setLon(parseFloat(e.target.value) || 0)}
                className="w-full bg-space-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Live Synthesized Telemetry & Evaluation Card */}
        <div className="bg-space-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Synthesized Telemetry ({estimatedSite.region})
            </span>
            {/* Live Verdict Badge */}
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border ${
              assessment.overall_status === 'GREEN' 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : assessment.overall_status === 'YELLOW'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              {assessment.overall_status === 'GREEN' && <ShieldCheck className="w-3.5 h-3.5" />}
              {assessment.overall_status === 'YELLOW' && <AlertTriangle className="w-3.5 h-3.5" />}
              {assessment.overall_status === 'RED' && <XCircle className="w-3.5 h-3.5" />}
              {assessment.overall_status} FOR {selectedLander.name.split(' ')[0]}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs font-mono text-slate-300">
            <div className="p-2 rounded bg-space-900 border border-slate-800/80">
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Compass className="w-3 h-3 text-cyan-400" /> Est. Slope
              </div>
              <div className="font-bold text-white mt-0.5">{estimatedSite.terrain.slope_deg}°</div>
            </div>

            <div className="p-2 rounded bg-space-900 border border-slate-800/80">
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Sun className="w-3 h-3 text-amber-400" /> Illumination
              </div>
              <div className="font-bold text-white mt-0.5">{estimatedSite.defaultIlluminationPct}%</div>
            </div>

            <div className="p-2 rounded bg-space-900 border border-slate-800/80">
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Radio className="w-3 h-3 text-cyan-400" /> Direct LOS
              </div>
              <div className={`font-bold mt-0.5 ${estimatedSite.defaultEarthLos ? 'text-emerald-400' : 'text-rose-400'}`}>
                {estimatedSite.defaultEarthLos ? 'Visible' : 'Far Side'}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-tight">
            {assessment.overall_reason}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-300 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeploy}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-cyan-500/25"
          >
            <span>Deploy Probe & Fly-To 3D</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};


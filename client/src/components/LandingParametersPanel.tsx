import React from 'react';
import { LanderProfile } from '../types';
import { Term } from './Glossary';
import { 
  Sliders, 
  RotateCcw, 
  Radio, 
  Sun, 
  Sparkles,
  Shield,
  Layers
} from 'lucide-react';

interface LandingParametersPanelProps {
  parameters: LanderProfile;
  onChange: (updated: LanderProfile) => void;
}

export const DEFAULT_MISSION_PARAMETERS: LanderProfile = {
  id: 'mission-parameters',
  name: 'Mission Safety Parameters',
  agency: 'Artemis Criteria',
  subtitle: 'Configured Landing Constraints',
  maxSlopeDeg: 8.0,
  minIlluminationPct: 65,
  requiresEarthLos: true,
  maxRoughness: 'MODERATE',
  payloadCapacityKg: 15000,
  crewCapacity: 4,
  description: 'Flight thresholds for terrain slope, solar illumination, and direct communications.',
};

export const LandingParametersPanel: React.FC<LandingParametersPanelProps> = ({
  parameters,
  onChange,
}) => {
  const handleUpdate = (field: keyof LanderProfile, value: any) => {
    onChange({
      ...parameters,
      [field]: value,
    });
  };

  const handleApplyPreset = (preset: {
    maxSlopeDeg: number;
    minIlluminationPct: number;
    requiresEarthLos: boolean;
    maxRoughness: 'LOW' | 'MODERATE' | 'HIGH';
  }) => {
    onChange({
      ...parameters,
      ...preset,
    });
  };

  const handleReset = () => {
    onChange(DEFAULT_MISSION_PARAMETERS);
  };

  return (
    <div className="bg-space-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3.5 backdrop-blur-md">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-semibold block leading-none">
              Safety Constraints
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight leading-tight mt-0.5">
              Landing Parameters
            </h3>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 transition"
          title="Reset to Artemis nominal defaults"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Interactive Controls */}
      <div className="space-y-3">
        
        {/* 1. Maximum Ground Slope Slider */}
        <div className="space-y-1 bg-space-950/60 p-2.5 rounded-lg border border-slate-800/70">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-cyan-400" /> Max Ground <Term k="slope">Slope</Term>:
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold">
              {parameters.maxSlopeDeg.toFixed(1)}°
            </span>
          </div>
          <input 
            type="range"
            min="3"
            max="20"
            step="0.5"
            value={parameters.maxSlopeDeg}
            onChange={(e) => handleUpdate('maxSlopeDeg', parseFloat(e.target.value))}
            className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>3° Strict</span>
            <span>8° Standard</span>
            <span>20° Max</span>
          </div>
        </div>

        {/* 2. Minimum Solar Illumination Slider */}
        <div className="space-y-1 bg-space-950/60 p-2.5 rounded-lg border border-slate-800/70">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-400" /> Min <Term k="illumination">Solar Flux</Term>:
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
              {parameters.minIlluminationPct}%
            </span>
          </div>
          <input 
            type="range"
            min="10"
            max="90"
            step="5"
            value={parameters.minIlluminationPct}
            onChange={(e) => handleUpdate('minIlluminationPct', parseInt(e.target.value, 10))}
            className="w-full accent-amber-400 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>10% Low</span>
            <span>50% Mid</span>
            <span>90% High</span>
          </div>
        </div>

        {/* 3. Direct-to-Earth (DTE) Comms Toggle */}
        <div className="bg-space-950/60 p-2.5 rounded-lg border border-slate-800/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <div>
              <span className="text-xs font-mono font-medium text-slate-200 block">
                <Term k="dte">Direct Earth Link (DTE)</Term>
              </span>
              <span className="text-[10px] text-slate-400 block">
                {parameters.requiresEarthLos ? 'Direct DSN required' : 'Relay supported'}
              </span>
            </div>
          </div>

          <button
            onClick={() => handleUpdate('requiresEarthLos', !parameters.requiresEarthLos)}
            className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition ${
              parameters.requiresEarthLos 
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' 
                : 'bg-slate-800 text-slate-400 border border-slate-700/60'
            }`}
          >
            {parameters.requiresEarthLos ? 'Required' : 'Optional'}
          </button>
        </div>

        {/* 4. Roughness Tolerance */}
        <div className="bg-space-950/60 p-2.5 rounded-lg border border-slate-800/70 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" /> <Term k="roughness">Roughness</Term> Limit:
            </span>
            <span className="text-slate-200 font-bold">{parameters.maxRoughness}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(['LOW', 'MODERATE', 'HIGH'] as const).map((level) => (
              <button
                key={level}
                onClick={() => handleUpdate('maxRoughness', level)}
                className={`py-1 px-1 rounded text-[10px] font-mono transition text-center ${
                  parameters.maxRoughness === level
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {level === 'LOW' ? 'Low' : level === 'MODERATE' ? 'Moderate' : 'High'}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Criteria Presets */}
        <div className="border-t border-slate-800/80 pt-2">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" /> Quick Presets
          </span>
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => handleApplyPreset({
                maxSlopeDeg: 5.0,
                minIlluminationPct: 75,
                requiresEarthLos: true,
                maxRoughness: 'LOW',
              })}
              className="px-1.5 py-1 rounded bg-slate-800/60 hover:bg-slate-800 text-[10px] text-slate-300 border border-slate-700/60 transition text-center font-mono"
            >
              Strict
            </button>
            <button
              onClick={() => handleApplyPreset({
                maxSlopeDeg: 8.0,
                minIlluminationPct: 65,
                requiresEarthLos: true,
                maxRoughness: 'MODERATE',
              })}
              className="px-1.5 py-1 rounded bg-slate-800/60 hover:bg-slate-800 text-[10px] text-cyan-300 border border-cyan-500/30 transition text-center font-mono"
            >
              Artemis
            </button>
            <button
              onClick={() => handleApplyPreset({
                maxSlopeDeg: 15.0,
                minIlluminationPct: 35,
                requiresEarthLos: false,
                maxRoughness: 'HIGH',
              })}
              className="px-1.5 py-1 rounded bg-slate-800/60 hover:bg-slate-800 text-[10px] text-slate-300 border border-slate-700/60 transition text-center font-mono"
            >
              Tolerant
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

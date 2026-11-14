import React, { useState } from 'react';
import { LanderProfile } from '../types';
import { 
  Sliders, 
  RotateCcw, 
  Radio, 
  Sun, 
  ChevronDown, 
  ChevronUp, 
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
  name: 'Custom Mission Parameters',
  agency: 'Artemis Criteria',
  subtitle: 'Configured Landing Constraints',
  maxSlopeDeg: 8.0,
  minIlluminationPct: 65,
  requiresEarthLos: true,
  maxRoughness: 'MODERATE',
  payloadCapacityKg: 15000,
  crewCapacity: 4,
  description: 'User-defined flight thresholds for terrain slope, solar illumination, and direct communications.',
};

export const LandingParametersPanel: React.FC<LandingParametersPanelProps> = ({
  parameters,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const handleUpdate = (field: keyof LanderProfile, value: any) => {
    onChange({
      ...parameters,
      [field]: value,
    });
  };

  const handleApplyPreset = (preset: {
    name: string;
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
    <div className="bg-space-900 border border-slate-800 rounded-xl p-4 shadow-lg transition-all space-y-4">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                Flight Safety Constraints
              </span>
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Landing Parameters
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 transition"
            title="Reset to Artemis nominal defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 transition"
            title={isExpanded ? "Collapse panel" : "Expand panel"}
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Interactive Controls */}
      {isExpanded && (
        <div className="space-y-4 animate-fadeIn">
          
          {/* 1. Maximum Ground Slope Slider */}
          <div className="space-y-1.5 bg-space-950/60 p-3 rounded-lg border border-slate-800/70">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-cyan-400" /> Max Ground Slope:
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
              className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>3° (Strict)</span>
              <span>8° (Artemis)</span>
              <span>15°+ (Extreme)</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight pt-1">
              Terrain exceeding this gradient triggers high tip-over risk during landing leg compression.
            </p>
          </div>

          {/* 2. Minimum Solar Illumination Slider */}
          <div className="space-y-1.5 bg-space-950/60 p-3 rounded-lg border border-slate-800/70">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-400" /> Min Solar Flux:
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
              className="w-full accent-amber-400 bg-slate-800 rounded-lg h-2 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>10% (Survival)</span>
              <span>50% (Standard)</span>
              <span>90% (Solar Peak)</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight pt-1">
              Minimum sunlight required to keep photovoltaic arrays and internal thermal heaters powered.
            </p>
          </div>

          {/* 3. Direct-to-Earth (DTE) Comms Toggle */}
          <div className="bg-space-950/60 p-3 rounded-lg border border-slate-800/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
                parameters.requiresEarthLos 
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' 
                  : 'bg-slate-800 text-slate-400'
              }`}>
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-mono font-medium text-slate-200 block">
                  Direct Earth Link (DTE)
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {parameters.requiresEarthLos ? 'Mandatory direct DSN lock' : 'Relay satellite acceptable'}
                </span>
              </div>
            </div>

            <button
              onClick={() => handleUpdate('requiresEarthLos', !parameters.requiresEarthLos)}
              className={`px-3 py-1 rounded text-xs font-mono font-semibold transition ${
                parameters.requiresEarthLos 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' 
                  : 'bg-slate-800 text-slate-400 border border-slate-700/60'
              }`}
            >
              {parameters.requiresEarthLos ? 'Required' : 'Optional'}
            </button>
          </div>

          {/* 4. Landing Gear Roughness Tolerance */}
          <div className="bg-space-950/60 p-3 rounded-lg border border-slate-800/70 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" /> Terrain Roughness Tolerance:
              </span>
              <span className="text-slate-300 font-bold">{parameters.maxRoughness}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['LOW', 'MODERATE', 'HIGH'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => handleUpdate('maxRoughness', level)}
                  className={`py-1 px-1.5 rounded text-[11px] font-mono transition text-center ${
                    parameters.maxRoughness === level
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {level === 'LOW' ? 'Low (Flat)' : level === 'MODERATE' ? 'Moderate' : 'High (Rugged)'}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Mission Presets */}
          <div className="border-t border-slate-800/80 pt-2.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" /> Quick Criteria Presets
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => handleApplyPreset({
                  name: 'Conservative Crewed',
                  maxSlopeDeg: 5.0,
                  minIlluminationPct: 75,
                  requiresEarthLos: true,
                  maxRoughness: 'LOW',
                })}
                className="px-2 py-1.5 rounded bg-slate-800/60 hover:bg-slate-800 text-[10px] text-slate-300 border border-slate-700/60 transition text-center font-mono"
              >
                Conservative
              </button>
              <button
                onClick={() => handleApplyPreset({
                  name: 'Artemis Baseline',
                  maxSlopeDeg: 8.0,
                  minIlluminationPct: 65,
                  requiresEarthLos: true,
                  maxRoughness: 'MODERATE',
                })}
                className="px-2 py-1.5 rounded bg-slate-800/60 hover:bg-slate-800 text-[10px] text-cyan-300 border border-cyan-500/30 transition text-center font-mono"
              >
                Artemis Std
              </button>
              <button
                onClick={() => handleApplyPreset({
                  name: 'Robotic Scout',
                  maxSlopeDeg: 15.0,
                  minIlluminationPct: 35,
                  requiresEarthLos: false,
                  maxRoughness: 'HIGH',
                })}
                className="px-2 py-1.5 rounded bg-slate-800/60 hover:bg-slate-800 text-[10px] text-slate-300 border border-slate-700/60 transition text-center font-mono"
              >
                High Tolerance
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

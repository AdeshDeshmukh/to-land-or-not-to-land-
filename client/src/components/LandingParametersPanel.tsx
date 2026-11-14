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
  maxSlopeDeg: 10.0,
  minIlluminationPct: 60,
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
    <div className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-4 space-y-3.5">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-white/[0.14] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[2px] bg-[#12141A] border border-white/[0.14] flex items-center justify-center text-[#9CA3AF]">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] font-semibold block leading-none">
              Safety Constraints
            </span>
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider leading-tight mt-0.5">
              Landing Parameters
            </h3>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="p-1.5 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] text-[#9CA3AF] hover:text-white border border-white/[0.14] transition"
          title="Reset to nominal Artemis criteria"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Interactive Controls */}
      <div className="space-y-2.5">
        
        {/* 1. Maximum Ground Slope Slider */}
        <div className="space-y-1.5 bg-black p-2.5 rounded-[2px] border border-white/[0.14]">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider">
            <span className="text-[#9CA3AF] flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#9CA3AF]" /> Max Ground <Term k="slope">Slope</Term>
            </span>
            <span className="px-2 py-0.5 rounded-[2px] bg-white/[0.08] text-white border border-white/20 font-bold tabular-nums">
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
            className="w-full"
          />
          <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider text-[#6B7280]">
            <span>3° Strict</span>
            <span>10° Standard</span>
            <span>20° Max</span>
          </div>
        </div>

        {/* 2. Minimum Solar Illumination Slider */}
        <div className="space-y-1.5 bg-black p-2.5 rounded-[2px] border border-white/[0.14]">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider">
            <span className="text-[#9CA3AF] flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-[#9CA3AF]" /> Min <Term k="illumination">Solar Flux</Term>
            </span>
            <span className="px-2 py-0.5 rounded-[2px] bg-white/[0.08] text-white border border-white/20 font-bold tabular-nums">
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
            className="w-full"
          />
          <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider text-[#6B7280]">
            <span>10% Low</span>
            <span>60% Mid</span>
            <span>90% High</span>
          </div>
        </div>

        {/* 3. Direct-to-Earth (DTE) Comms Toggle */}
        <div className="bg-black p-2.5 rounded-[2px] border border-white/[0.14] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider font-medium text-white block">
                <Term k="dte">Direct Earth Link (DTE)</Term>
              </span>
              <span className="text-[10px] font-mono text-[#6B7280] block">
                {parameters.requiresEarthLos ? 'Direct DSN required' : 'Relay supported'}
              </span>
            </div>
          </div>

          <button
            onClick={() => handleUpdate('requiresEarthLos', !parameters.requiresEarthLos)}
            className={`px-2.5 py-1 rounded-[2px] text-[10px] font-mono uppercase tracking-wider transition ${
              parameters.requiresEarthLos 
                ? 'bg-white text-black border border-white font-bold' 
                : 'bg-[#12141A] text-[#9CA3AF] border border-white/[0.14] hover:text-white hover:border-white/30'
            }`}
          >
            {parameters.requiresEarthLos ? 'Required' : 'Optional'}
          </button>
        </div>

        {/* 4. Roughness Tolerance */}
        <div className="bg-black p-2.5 rounded-[2px] border border-white/[0.14] space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider">
            <span className="text-[#9CA3AF] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#9CA3AF]" /> <Term k="roughness">Roughness</Term> Limit
            </span>
            <span className="text-white font-bold">{parameters.maxRoughness}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(['LOW', 'MODERATE', 'HIGH'] as const).map((level) => (
              <button
                key={level}
                onClick={() => handleUpdate('maxRoughness', level)}
                className={`py-1 px-1 rounded-[2px] text-[10px] font-mono uppercase tracking-wider transition text-center ${
                  parameters.maxRoughness === level
                    ? 'bg-white text-black border border-white font-bold'
                    : 'bg-[#12141A] text-[#9CA3AF] hover:text-white border border-white/[0.14] hover:border-white/30'
                }`}
              >
                {level === 'LOW' ? 'Low' : level === 'MODERATE' ? 'Moderate' : 'High'}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Criteria Presets */}
        <div className="border-t border-white/[0.14] pt-2.5">
          <span className="text-[10px] font-mono text-[#6B7280] uppercase tracking-wider block mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#9CA3AF]" /> Quick Presets
          </span>
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => handleApplyPreset({
                maxSlopeDeg: 5.0,
                minIlluminationPct: 75,
                requiresEarthLos: true,
                maxRoughness: 'LOW',
              })}
              className="px-1.5 py-1 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] text-[10px] text-[#9CA3AF] hover:text-white border border-white/[0.14] transition text-center font-mono uppercase tracking-wider"
            >
              Strict
            </button>
            <button
              onClick={() => handleApplyPreset({
                maxSlopeDeg: 10.0,
                minIlluminationPct: 60,
                requiresEarthLos: true,
                maxRoughness: 'MODERATE',
              })}
              className="px-1.5 py-1 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] text-[10px] text-white border border-white/30 transition text-center font-mono uppercase tracking-wider font-semibold"
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
              className="px-1.5 py-1 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] text-[10px] text-[#9CA3AF] hover:text-white border border-white/[0.14] transition text-center font-mono uppercase tracking-wider"
            >
              Tolerant
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

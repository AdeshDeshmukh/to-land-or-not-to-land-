import React from 'react';
import { LanderProfile } from '../types';
import { Term } from './Glossary';
import { 
  Sliders, 
  RotateCcw, 
  Radio, 
  Sun, 
  Shield
} from 'lucide-react';

interface LandingParametersPanelProps {
  parameters: LanderProfile;
  onChange: (updated: LanderProfile) => void;
  currentSiteSlopeDeg?: number;
  currentSiteIlluminationPct?: number;
  currentSiteName?: string;
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
  currentSiteSlopeDeg,
  currentSiteIlluminationPct,
  currentSiteName,
}) => {
  const handleUpdate = (field: keyof LanderProfile, value: any) => {
    onChange({
      ...parameters,
      [field]: value,
    });
  };

  const handleReset = () => {
    onChange(DEFAULT_MISSION_PARAMETERS);
  };

  // Slider progress percentages for styled gradient tracks
  const slopePct = Math.max(0, Math.min(100, ((parameters.maxSlopeDeg - 3) / (20 - 3)) * 100));
  const siteSlopeMarkerPct =
    currentSiteSlopeDeg !== undefined
      ? Math.max(0, Math.min(100, ((currentSiteSlopeDeg - 3) / (20 - 3)) * 100))
      : null;

  const fluxPct = Math.max(0, Math.min(100, ((parameters.minIlluminationPct - 10) / (90 - 10)) * 100));
  const siteFluxMarkerPct =
    currentSiteIlluminationPct !== undefined
      ? Math.max(0, Math.min(100, ((currentSiteIlluminationPct - 10) / (90 - 10)) * 100))
      : null;

  const slopePasses =
    currentSiteSlopeDeg === undefined || currentSiteSlopeDeg <= parameters.maxSlopeDeg;
  const fluxPasses =
    currentSiteIlluminationPct === undefined ||
    currentSiteIlluminationPct >= parameters.minIlluminationPct;

  return (
    <div className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-3.5 space-y-3">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-white/[0.14] pb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[2px] bg-[#12141A] border border-white/[0.14] flex items-center justify-center text-[#9CA3AF]">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[9px] font-mono uppercase tracking-wider text-[#6B7280] font-semibold block leading-none">
              Safety Constraints
            </span>
            <h3 className="text-[11px] font-mono font-bold text-white uppercase tracking-wider leading-tight mt-0.5">
              Landing Parameters
            </h3>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="p-1 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] text-[#9CA3AF] hover:text-white border border-white/[0.14] transition"
          title="Reset to nominal Artemis criteria"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      {/* Main Interactive Controls */}
      <div className="space-y-2.5">
        
        {/* 1. Maximum Ground Slope Slider with Live Site Marker */}
        <div className="space-y-1.5 bg-black p-2.5 rounded-[2px] border border-white/[0.14]">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider">
            <span className="text-[#9CA3AF] flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#38BDF8]" /> Max Ground <Term k="slope">Slope</Term>
            </span>
            <span className="px-2 py-0.5 rounded-[2px] bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/35 font-bold tabular-nums">
              ≤ {parameters.maxSlopeDeg.toFixed(1)}°
            </span>
          </div>

          <div className="relative pt-1 pb-1">
            <input 
              type="range"
              min="3"
              max="20"
              step="0.5"
              value={parameters.maxSlopeDeg}
              onChange={(e) => handleUpdate('maxSlopeDeg', parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, #38BDF8 0%, #10B981 ${slopePct}%, #14171F ${slopePct}%, #14171F 100%)`,
              }}
              className="w-full relative z-10"
            />
            {siteSlopeMarkerPct !== null && (
              <div
                style={{ left: `${siteSlopeMarkerPct}%` }}
                className="pointer-events-none absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center z-20"
                title={`${currentSiteName || 'Selected site'} actual slope: ${currentSiteSlopeDeg?.toFixed(1)}°`}
              >
                <span
                  className={`w-0.5 h-4 rounded-full ${slopePasses ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-[#6B7280]">
            <span>3° Strict</span>
            {currentSiteSlopeDeg !== undefined ? (
              <span className={slopePasses ? 'text-[#10B981]' : 'text-[#EF4444]'}>
                Site: {currentSiteSlopeDeg.toFixed(1)}°
              </span>
            ) : (
              <span>10° Std</span>
            )}
            <span>20° Max</span>
          </div>
        </div>

        {/* 2. Minimum Solar Illumination Slider with Live Site Marker */}
        <div className="space-y-1.5 bg-black p-2.5 rounded-[2px] border border-white/[0.14]">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider">
            <span className="text-[#9CA3AF] flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-[#F59E0B]" /> Min <Term k="illumination">Solar Flux</Term>
            </span>
            <span className="px-2 py-0.5 rounded-[2px] bg-[#F59E0B]/10 text-[#FBBF24] border border-[#F59E0B]/35 font-bold tabular-nums">
              ≥ {parameters.minIlluminationPct}%
            </span>
          </div>

          <div className="relative pt-1 pb-1">
            <input 
              type="range"
              min="10"
              max="90"
              step="5"
              value={parameters.minIlluminationPct}
              onChange={(e) => handleUpdate('minIlluminationPct', parseInt(e.target.value, 10))}
              style={{
                background: `linear-gradient(to right, #F59E0B 0%, #FBBF24 ${fluxPct}%, #14171F ${fluxPct}%, #14171F 100%)`,
              }}
              className="w-full relative z-10"
            />
            {siteFluxMarkerPct !== null && (
              <div
                style={{ left: `${siteFluxMarkerPct}%` }}
                className="pointer-events-none absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center z-20"
                title={`${currentSiteName || 'Selected site'} solar flux: ${currentSiteIlluminationPct}%`}
              >
                <span
                  className={`w-0.5 h-4 rounded-full ${fluxPasses ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-[#6B7280]">
            <span>10% Low</span>
            {currentSiteIlluminationPct !== undefined ? (
              <span className={fluxPasses ? 'text-[#10B981]' : 'text-[#EF4444]'}>
                Site: {currentSiteIlluminationPct}%
              </span>
            ) : (
              <span>60% Mid</span>
            )}
            <span>90% High</span>
          </div>
        </div>

        {/* 3. Direct-to-Earth (DTE) Comms Toggle */}
        <div className="bg-black p-2.5 rounded-[2px] border border-white/[0.14] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-[#38BDF8]" />
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
            type="button"
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

      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { LanderProfile } from '../types';
import { DEFAULT_LANDER_PROFILES } from '../data/landerProfiles';
import { 
  Rocket, 
  Sliders, 
  Radio, 
  ChevronDown, 
  Check, 
  X,
  Compass,
  Sun
} from 'lucide-react';

interface LanderSelectorProps {
  selectedLander: LanderProfile;
  onSelectLander: (lander: LanderProfile) => void;
}

export const LanderSelector: React.FC<LanderSelectorProps> = ({
  selectedLander,
  onSelectLander,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);

  // Custom lander configuration state
  const [customLander, setCustomLander] = useState<LanderProfile>({
    id: 'custom-vehicle',
    name: 'Custom Lander Concept',
    agency: 'User Experimental',
    subtitle: 'User-Defined Parameters',
    maxSlopeDeg: 9.0,
    minIlluminationPct: 60,
    requiresEarthLos: true,
    maxRoughness: 'MODERATE',
    payloadCapacityKg: 15000,
    crewCapacity: 2,
    description: 'Custom vehicle architecture with parameterized flight thresholds.',
  });

  const handleApplyCustom = () => {
    onSelectLander(customLander);
    setIsCustomModalOpen(false);
    setIsOpen(false);
  };

  return (
    <>
      {/* Lander Header Card / Trigger Button */}
      <div className="relative">
        <div 
          onClick={() => setIsOpen(prev => !prev)}
          className="bg-space-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 shadow-lg cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform shadow-[0_0_12px_rgba(6,182,212,0.15)]">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                  Active Vehicle Profile
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                  {selectedLander.agency}
                </span>
              </div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                {selectedLander.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Specs Pills */}
            <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
              <span className="px-2.5 py-1 rounded-md bg-space-950/80 border border-slate-800 text-slate-300">
                Max Slope: <strong className="text-cyan-300">{selectedLander.maxSlopeDeg}°</strong>
              </span>
              <span className="px-2.5 py-1 rounded-md bg-space-950/80 border border-slate-800 text-slate-300">
                Min Sun: <strong className="text-amber-300">{selectedLander.minIlluminationPct}%</strong>
              </span>
              <span className="px-2.5 py-1 rounded-md bg-space-950/80 border border-slate-800 text-slate-300">
                Crew: <strong className="text-emerald-300">{selectedLander.crewCapacity > 0 ? selectedLander.crewCapacity : 'Robotic'}</strong>
              </span>
            </div>

            <ChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-cyan-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 z-40 bg-space-900/95 backdrop-blur-xl border border-slate-800 rounded-xl p-3 shadow-2xl space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between px-2 py-1 text-xs font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800/80">
              <span>Choose Mission Architecture</span>
              <span>Tolerance Profiles</span>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              {DEFAULT_LANDER_PROFILES.map((lander) => {
                const isSelected = lander.id === selectedLander.id;
                return (
                  <button
                    key={lander.id}
                    onClick={() => {
                      onSelectLander(lander);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-cyan-950/30 border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                        : 'bg-space-800/40 border-slate-800/80 hover:bg-space-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{lander.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                          {lander.agency}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{lander.description}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-4 font-mono text-xs">
                      <div className="text-right">
                        <span className="text-slate-400">Slope: </span>
                        <span className="text-cyan-300 font-bold">&le; {lander.maxSlopeDeg}°</span>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Custom Vehicle Option */}
              <button
                onClick={() => setIsCustomModalOpen(true)}
                className={`w-full text-left p-3 rounded-lg border border-dashed transition-all flex items-center justify-between ${
                  selectedLander.id === 'custom-vehicle'
                    ? 'bg-cyan-950/30 border-cyan-500 text-cyan-300'
                    : 'bg-space-950/40 border-slate-700 hover:border-cyan-500/50 hover:bg-space-900/60 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="font-bold text-sm">Configure Custom Vehicle Specs...</span>
                    <span className="block text-xs text-slate-400">Customize max slope tolerance, illumination threshold, and comms needs</span>
                  </div>
                </div>
                <span className="text-xs font-mono px-2 py-1 rounded bg-slate-800 text-slate-300">
                  Custom Editor
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Custom Lander Editor Modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-space-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scaleIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Custom Vehicle Parameters</h3>
              </div>
              <button 
                onClick={() => setIsCustomModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Adjust the structural and operational thresholds below to simulate custom commercial, scientific, or future crewed lunar landing systems.
            </p>

            <div className="space-y-4 font-mono text-xs">
              {/* Vehicle Name Input */}
              <div>
                <label className="text-slate-400 block mb-1">Vehicle / Mission Name</label>
                <input 
                  type="text"
                  value={customLander.name}
                  onChange={(e) => setCustomLander({ ...customLander, name: e.target.value })}
                  className="w-full bg-space-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-sans focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Max Slope Slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-300 flex items-center gap-1.5 font-sans">
                    <Compass className="w-3.5 h-3.5 text-cyan-400" /> Max Touchdown Slope Angle
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold">
                    {customLander.maxSlopeDeg}°
                  </span>
                </div>
                <input 
                  type="range"
                  min="3"
                  max="20"
                  step="0.5"
                  value={customLander.maxSlopeDeg}
                  onChange={(e) => setCustomLander({ ...customLander, maxSlopeDeg: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-2 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>3° (Extremely Fragile)</span>
                  <span>10° (Standard)</span>
                  <span>20° (Extreme Rover)</span>
                </div>
              </div>

              {/* Min Illumination Slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-300 flex items-center gap-1.5 font-sans">
                    <Sun className="w-3.5 h-3.5 text-amber-400" /> Minimum Solar Illumination Required
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">
                    {customLander.minIlluminationPct}%
                  </span>
                </div>
                <input 
                  type="range"
                  min="15"
                  max="90"
                  step="5"
                  value={customLander.minIlluminationPct}
                  onChange={(e) => setCustomLander({ ...customLander, minIlluminationPct: parseInt(e.target.value, 10) })}
                  className="w-full accent-amber-400 bg-slate-800 rounded-lg h-2 cursor-pointer"
                />
              </div>

              {/* Direct Earth LOS Checkbox */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-space-950 border border-slate-800">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="text-white font-sans font-medium block">Mandatory Direct Earth LOS</span>
                    <span className="text-[11px] text-slate-400 font-sans">Requires uninterrupted line-of-sight to Earth (No relay)</span>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={customLander.requiresEarthLos}
                  onChange={(e) => setCustomLander({ ...customLander, requiresEarthLos: e.target.checked })}
                  className="w-4 h-4 accent-cyan-400 cursor-pointer"
                />
              </div>

              {/* Roughness Tolerance */}
              <div>
                <label className="text-slate-400 block mb-1.5 font-sans">Landing Gear Roughness Tolerance</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['LOW', 'MODERATE', 'HIGH'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCustomLander({ ...customLander, maxRoughness: r })}
                      className={`py-2 rounded-lg border text-xs font-semibold transition ${
                        customLander.maxRoughness === r
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                          : 'bg-space-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyCustom}
                className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-cyan-500/25"
              >
                Apply Parameters
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

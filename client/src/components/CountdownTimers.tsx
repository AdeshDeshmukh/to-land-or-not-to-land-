import React from 'react';
import { CandidateSite, LanderProfile } from '../types';
import { Term } from './Glossary';
import { 
  Sun, 
  Radio, 
  Battery, 
  BatteryCharging, 
  BatteryWarning, 
  Clock, 
  ShieldAlert, 
  Zap, 
  TrendingDown 
} from 'lucide-react';

interface CountdownTimersProps {
  site: CandidateSite;
  simulatedDateOffset: number;
  computedIllumination: number;
  parameters?: LanderProfile;
  lander?: LanderProfile;
}

export const CountdownTimers: React.FC<CountdownTimersProps> = ({
  site,
  simulatedDateOffset,
  computedIllumination,
  parameters,
  lander,
}) => {
  const activeParams = parameters || lander;
  const minIllum = activeParams?.minIlluminationPct ?? 30;
  const isSouthPole = site.coordinates.latitude < -80;
  const maxSunAngle = isSouthPole ? 3.8 : 75.0;

  // Current Sun elevation angle relative to local horizon
  const currentSunAngle = Math.sin((simulatedDateOffset * 2 * Math.PI) / 29.5) * maxSunAngle + (isSouthPole ? 0.8 : 35);
  const isSunlit = currentSunAngle > 0.3 && computedIllumination >= minIllum;

  // Calculate forward trajectory to find time to sunset / sunrise
  // Scan ahead up to 29.5 days (one full synodic month) in 0.1 day increments
  let hoursUntilSunset = 0;
  let hoursUntilSunrise = 0;
  let shadowDurationHours = 0;

  if (isSunlit) {
    // Currently illuminated: find how many hours until sunAngle drops below threshold
    for (let t = 0.1; t <= 29.5; t += 0.1) {
      const futureOffset = simulatedDateOffset + t;
      const angle = Math.sin((futureOffset * 2 * Math.PI) / 29.5) * maxSunAngle + (isSouthPole ? 0.8 : 35);
      const illum = Math.max(5, Math.min(100, Math.round(site.defaultIlluminationPct + Math.sin(futureOffset * 0.4) * 25)));
      if (angle <= 0.3 || illum < minIllum) {
        hoursUntilSunset = Math.round(t * 24);
        break;
      }
    }
  } else {
    // Currently in shadow: find how many hours until sunrise
    for (let t = 0.1; t <= 29.5; t += 0.1) {
      const futureOffset = simulatedDateOffset + t;
      const angle = Math.sin((futureOffset * 2 * Math.PI) / 29.5) * maxSunAngle + (isSouthPole ? 0.8 : 35);
      const illum = Math.max(5, Math.min(100, Math.round(site.defaultIlluminationPct + Math.sin(futureOffset * 0.4) * 25)));
      if (angle > 0.3 && illum >= minIllum) {
        hoursUntilSunrise = Math.round(t * 24);
        break;
      }
    }

    // Estimate how many hours site has been in shadow looking backwards
    for (let t = 0.1; t <= 14; t += 0.1) {
      const pastOffset = simulatedDateOffset - t;
      const angle = Math.sin((pastOffset * 2 * Math.PI) / 29.5) * maxSunAngle + (isSouthPole ? 0.8 : 35);
      const illum = Math.max(5, Math.min(100, Math.round(site.defaultIlluminationPct + Math.sin(pastOffset * 0.4) * 25)));
      if (angle > 0.3 && illum >= minIllum) {
        shadowDurationHours = Math.round(t * 24);
        break;
      }
      shadowDurationHours = Math.round(t * 24);
    }
  }

  // Earth Line of Sight and Comms Window
  const earthAngle = site.defaultEarthLos
    ? 12.5 + Math.sin(simulatedDateOffset * 0.4) * 4.2
    : -8.0 + Math.sin(simulatedDateOffset * 0.4) * 2.0;
  const isCommsLocked = earthAngle > 0.0 && site.defaultEarthLos;

  let commsRemainingHours = 0;
  if (isCommsLocked) {
    for (let t = 0.1; t <= 20; t += 0.1) {
      const futureOffset = simulatedDateOffset + t;
      const angle = 12.5 + Math.sin(futureOffset * 0.4) * 4.2;
      if (angle <= 0.0) {
        commsRemainingHours = Math.round(t * 24);
        break;
      }
      commsRemainingHours = Math.round(t * 24);
    }
  }

  // Battery State of Charge (SoC) Projection
  // Mission battery capacity provides ~72 hours of survival power when in shadow
  const maxBatteryHours = 72;
  let batterySoCPct = 100;
  if (!isSunlit) {
    const discharge = (shadowDurationHours / maxBatteryHours) * 100;
    batterySoCPct = Math.max(0, Math.min(100, Math.round(100 - discharge)));
  }

  // Shadow Hazard Severity
  const isShadowCrisis = !isSunlit && shadowDurationHours >= 48;
  const isBatteryLow = batterySoCPct < 30;

  return (
    <div className="bg-space-900 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-md space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              Telemetry Survival & Power / Comms Timers
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                LIVE TELEMETRY
              </span>
            </h3>
            <p className="text-xs text-slate-400">Real-time projection of solar line-of-sight, comms visibility, and battery longevity.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSunlit ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Zap className="w-3.5 h-3.5" /> Solar Generation ACTIVE
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium ${
              isShadowCrisis 
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' 
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
            }`}>
              <TrendingDown className="w-3.5 h-3.5" /> In Lunar Shadow
            </span>
          )}
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        
        {/* Metric 1: Solar Illumination & Sunset Countdown */}
        <div className={`p-4 rounded-xl border transition-all ${
          isSunlit 
            ? 'bg-space-950/70 border-slate-800/90' 
            : isShadowCrisis 
              ? 'bg-rose-950/20 border-rose-500/40' 
              : 'bg-amber-950/20 border-amber-500/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sun className="w-4 h-4 text-amber-400" />
              {isSunlit ? 'Time to Sunset' : 'Shadow Status'}
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
              isSunlit 
                ? hoursUntilSunset > 48 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                : 'bg-rose-500/10 text-rose-400'
            }`}>
              {isSunlit ? `${Math.round(computedIllumination)}% SUN` : 'SHADOW'}
            </span>
          </div>

          <div className="font-mono text-xl font-bold text-white mb-1">
            {isSunlit ? (
              <span>{hoursUntilSunset} hrs <span className="text-xs font-normal text-slate-400">({(hoursUntilSunset / 24).toFixed(1)} days)</span></span>
            ) : (
              <span className={isShadowCrisis ? 'text-rose-400 font-extrabold' : 'text-amber-400'}>
                {shadowDurationHours} hrs elapsed
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400">
            {isSunlit ? (
              <span>Continuous solar flux before terrain obstacle occultation.</span>
            ) : (
              <span>Estimated {hoursUntilSunrise} hrs until next sunrise window.</span>
            )}
          </p>
        </div>

        {/* Metric 2: Direct-to-Earth (DTE) Comms Window */}
        <div className={`p-4 rounded-xl border transition-all ${
          isCommsLocked 
            ? 'bg-space-950/70 border-slate-800/90' 
            : 'bg-rose-950/20 border-rose-500/40'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-cyan-400" />
              Direct Comms Link
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
              isCommsLocked ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }`}>
              {isCommsLocked ? 'DTE LOCKED' : 'BLACKOUT'}
            </span>
          </div>

          <div className="font-mono text-xl font-bold text-white mb-1">
            {isCommsLocked ? (
              <span>{commsRemainingHours >= 480 ? 'Continuous' : `${commsRemainingHours} hrs`}</span>
            ) : (
              <span className="text-rose-400">0 hrs (Occluded)</span>
            )}
          </div>

          <p className="text-xs text-slate-400">
            {isCommsLocked ? (
              <span>Unobstructed line-of-sight to NASA Deep Space Network (DSN).</span>
            ) : (
              <span>Crater rim walls block radio line-of-sight; orbital relay required.</span>
            )}
          </p>
        </div>

        {/* Metric 3: Battery State of Charge (SoC) Projection */}
        <div className={`p-4 rounded-xl border transition-all ${
          batterySoCPct > 50 
            ? 'bg-space-950/70 border-slate-800/90' 
            : isBatteryLow 
              ? 'bg-rose-950/20 border-rose-500/40' 
              : 'bg-amber-950/20 border-amber-500/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              {isSunlit ? (
                <BatteryCharging className="w-4 h-4 text-emerald-400" />
              ) : isBatteryLow ? (
                <BatteryWarning className="w-4 h-4 text-rose-400 animate-pulse" />
              ) : (
                <Battery className="w-4 h-4 text-amber-400" />
              )}
              <Term k="soc">Battery SoC Projection</Term>
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
              isSunlit 
                ? 'bg-emerald-500/10 text-emerald-400' 
                : isBatteryLow 
                  ? 'bg-rose-500/10 text-rose-400' 
                  : 'bg-amber-500/10 text-amber-400'
            }`}>
              {batterySoCPct}%
            </span>
          </div>

          <div className="font-mono text-xl font-bold text-white mb-1 flex items-baseline gap-2">
            <span>{batterySoCPct}%</span>
            <span className="text-xs font-normal text-slate-400">
              {isSunlit ? '(Trickle Charge)' : `(~${Math.round((batterySoCPct / 100) * maxBatteryHours)} hrs reserve)`}
            </span>
          </div>

          {/* Graphical Progress Bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden border border-slate-700/60">
            <div 
              className={`h-full transition-all duration-300 rounded-full ${
                batterySoCPct > 50 
                  ? 'bg-emerald-400' 
                  : batterySoCPct > 20 
                    ? 'bg-amber-400' 
                    : 'bg-rose-500 animate-pulse'
              }`}
              style={{ width: `${batterySoCPct}%` }}
            />
          </div>

          <p className="text-xs text-slate-400">
            {isSunlit ? (
              <span>Solar arrays powering avionics and avionics thermal heaters.</span>
            ) : (
              <span>Survival discharge under internal heating load.</span>
            )}
          </p>
        </div>

      </div>

      {/* Critical Shadow Trap Warning Banner */}
      {isShadowCrisis && (
        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs font-mono animate-fadeIn">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="text-rose-200 block text-xs">CRITICAL WARNING: <Term k="shadowTrap">SHADOW TRAP</Term> EXCEEDS 48 HOURS</strong>
            <p className="text-rose-300/90">
              Site has been in continuous darkness for {shadowDurationHours} hours. Battery reserve will be exhausted in ~{Math.round((batterySoCPct / 100) * maxBatteryHours)} hours, risking irreversible cryogenic freeze of propellant tanks and avionics.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

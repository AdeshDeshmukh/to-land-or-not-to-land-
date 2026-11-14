import React from 'react';
import { CandidateSite, LanderProfile } from '../types';
import { Term } from './Glossary';
import {
  computeSolarTelemetryAtTime,
  computeEarthTelemetryAtTime,
} from '../utils/lunarTelemetry';
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
  const { latitude, longitude } = site.coordinates;

  // Compute exact 3D sun & Earth horizon elevation aligned with globe shadows and plotter
  const currentSolar = computeSolarTelemetryAtTime(latitude, longitude, simulatedDateOffset, site);
  const currentEarth = computeEarthTelemetryAtTime(latitude, longitude, simulatedDateOffset, site);
  const isSunlit = currentSolar.isSunlit && computedIllumination >= minIllum * 0.5;

  // Scan ahead/back across one full 29.53d synodic cycle in 6-hour (0.25d) steps
  let hoursUntilSunset = 708;
  let hoursUntilSunrise = 708;
  let shadowDurationHours = 0;

  if (isSunlit) {
    for (let t = 0.25; t <= 29.5; t += 0.25) {
      const futureSolar = computeSolarTelemetryAtTime(latitude, longitude, simulatedDateOffset + t, site);
      if (!futureSolar.isSunlit || futureSolar.illuminationPct < minIllum * 0.5) {
        hoursUntilSunset = Math.round(t * 24);
        break;
      }
    }
  } else {
    for (let t = 0.25; t <= 29.5; t += 0.25) {
      const futureSolar = computeSolarTelemetryAtTime(latitude, longitude, simulatedDateOffset + t, site);
      if (futureSolar.isSunlit && futureSolar.illuminationPct >= minIllum * 0.5) {
        hoursUntilSunrise = Math.round(t * 24);
        break;
      }
    }

    for (let t = 0.25; t <= 14.75; t += 0.25) {
      const pastSolar = computeSolarTelemetryAtTime(latitude, longitude, simulatedDateOffset - t, site);
      if (pastSolar.isSunlit && pastSolar.illuminationPct >= minIllum * 0.5) {
        shadowDurationHours = Math.round(t * 24);
        break;
      }
      shadowDurationHours = Math.round(t * 24);
    }
  }

  // Earth Line of Sight and Comms Window
  const isCommsLocked = currentEarth.hasLos;

  let commsRemainingHours = 0;
  if (isCommsLocked) {
    for (let t = 0.25; t <= 20; t += 0.25) {
      const futureEarth = computeEarthTelemetryAtTime(latitude, longitude, simulatedDateOffset + t, site);
      if (!futureEarth.hasLos) {
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
    <div className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.14] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[2px] bg-black border border-white/[0.14] flex items-center justify-center text-white">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-white flex items-center gap-2">
              Telemetry Survival &amp; Power / Comms Timers
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-[2px] bg-black text-[#9CA3AF] border border-white/[0.14]">
                LIVE TELEMETRY
              </span>
            </h3>
            <p className="text-xs text-[#9CA3AF]">Real-time projection of solar line-of-sight, comms visibility, and battery longevity.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSunlit ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] text-[10px] font-mono uppercase tracking-wider font-medium bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30">
              <Zap className="w-3.5 h-3.5" /> Solar Generation ACTIVE
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] text-[10px] font-mono uppercase tracking-wider font-medium ${
              isShadowCrisis 
                ? 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/40' 
                : 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30'
            }`}>
              <TrendingDown className="w-3.5 h-3.5" /> In Lunar Shadow
            </span>
          )}
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        
        {/* Metric 1: Solar Illumination & Sunset Countdown */}
        <div className={`p-4 rounded-[2px] border transition-colors ${
          isSunlit 
            ? 'bg-black border-white/[0.14]' 
            : isShadowCrisis 
              ? 'bg-black border-[#EF4444]/40' 
              : 'bg-black border-[#F59E0B]/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-white" />
              {isSunlit ? 'Time to Sunset' : 'Shadow Status'}
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-[2px] font-bold ${
              isSunlit 
                ? hoursUntilSunset > 48 ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'
                : 'bg-[#EF4444]/10 text-[#EF4444]'
            }`}>
              {isSunlit ? `${Math.round(computedIllumination)}% SUN` : 'SHADOW'}
            </span>
          </div>

          <div className="font-mono text-xl font-bold text-white mb-1">
            {isSunlit ? (
              <span>{hoursUntilSunset} hrs <span className="text-xs font-normal text-[#6B7280]">({(hoursUntilSunset / 24).toFixed(1)} days)</span></span>
            ) : (
              <span className={isShadowCrisis ? 'text-[#EF4444] font-bold' : 'text-[#F59E0B]'}>
                {shadowDurationHours} hrs elapsed
              </span>
            )}
          </div>

          <p className="text-xs text-[#6B7280]">
            {isSunlit ? (
              <span>Continuous solar flux before terrain obstacle occultation.</span>
            ) : (
              <span>Estimated {hoursUntilSunrise} hrs until next sunrise window.</span>
            )}
          </p>
        </div>

        {/* Metric 2: Direct-to-Earth (DTE) Comms Window */}
        <div className={`p-4 rounded-[2px] border transition-colors ${
          isCommsLocked 
            ? 'bg-black border-white/[0.14]' 
            : 'bg-black border-[#EF4444]/40'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-white" />
              Direct Comms Link
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-[2px] font-bold ${
              isCommsLocked ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]'
            }`}>
              {isCommsLocked ? 'DTE LOCKED' : 'BLACKOUT'}
            </span>
          </div>

          <div className="font-mono text-xl font-bold text-white mb-1">
            {isCommsLocked ? (
              <span>{commsRemainingHours >= 480 ? 'Continuous' : `${commsRemainingHours} hrs`}</span>
            ) : (
              <span className="text-[#EF4444]">0 hrs (Occluded)</span>
            )}
          </div>

          <p className="text-xs text-[#6B7280]">
            {isCommsLocked ? (
              <span>Unobstructed line-of-sight to NASA Deep Space Network (DSN).</span>
            ) : (
              <span>Crater rim walls block radio line-of-sight; orbital relay required.</span>
            )}
          </p>
        </div>

        {/* Metric 3: Battery State of Charge (SoC) Projection */}
        <div className={`p-4 rounded-[2px] border transition-colors ${
          batterySoCPct > 50 
            ? 'bg-black border-white/[0.14]' 
            : isBatteryLow 
              ? 'bg-black border-[#EF4444]/40' 
              : 'bg-black border-[#F59E0B]/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1.5">
              {isSunlit ? (
                <BatteryCharging className="w-3.5 h-3.5 text-[#10B981]" />
              ) : isBatteryLow ? (
                <BatteryWarning className="w-3.5 h-3.5 text-[#EF4444]" />
              ) : (
                <Battery className="w-3.5 h-3.5 text-[#F59E0B]" />
              )}
              <Term k="soc">Battery SoC Projection</Term>
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-[2px] font-bold ${
              isSunlit 
                ? 'bg-[#10B981]/10 text-[#10B981]' 
                : isBatteryLow 
                  ? 'bg-[#EF4444]/10 text-[#EF4444]' 
                  : 'bg-[#F59E0B]/10 text-[#F59E0B]'
            }`}>
              {batterySoCPct}%
            </span>
          </div>

          <div className="font-mono text-xl font-bold text-white mb-1 flex items-baseline gap-2">
            <span>{batterySoCPct}%</span>
            <span className="text-xs font-normal text-[#6B7280]">
              {isSunlit ? '(Trickle Charge)' : `(~${Math.round((batterySoCPct / 100) * maxBatteryHours)} hrs reserve)`}
            </span>
          </div>

          {/* Graphical Progress Bar */}
          <div className="w-full bg-[#12141A] rounded-[1px] h-1.5 mb-2 overflow-hidden border border-white/[0.14]">
            <div 
              className={`h-full transition-all duration-300 rounded-[1px] ${
                batterySoCPct > 50 
                  ? 'bg-[#10B981]' 
                  : batterySoCPct > 20 
                    ? 'bg-[#F59E0B]' 
                    : 'bg-[#EF4444]'
              }`}
              style={{ width: `${batterySoCPct}%` }}
            />
          </div>

          <p className="text-xs text-[#6B7280]">
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
        <div className="flex items-start gap-3 p-3.5 rounded-[2px] bg-[#EF4444]/10 border border-[#EF4444]/40 text-[#EF4444] text-xs font-mono">
          <ShieldAlert className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="text-white block text-xs uppercase tracking-wider">CRITICAL WARNING: <Term k="shadowTrap">SHADOW TRAP</Term> EXCEEDS 48 HOURS</strong>
            <p className="text-[#9CA3AF]">
              Site has been in continuous darkness for {shadowDurationHours} hours. Battery reserve will be exhausted in ~{Math.round((batterySoCPct / 100) * maxBatteryHours)} hours, risking irreversible cryogenic freeze of propellant tanks and avionics.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

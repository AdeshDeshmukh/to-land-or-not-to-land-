import React from 'react';
import { CandidateSite } from '../types';
import { Sun, Radio, AlertOctagon } from 'lucide-react';
import { Term } from './Glossary';
import {
  computeSolarTelemetryAtTime,
  computeEarthTelemetryAtTime,
  formatMissionUtc,
} from '../utils/lunarTelemetry';

interface HorizonPlotProps {
  site: CandidateSite;
  simulatedDateOffset: number;
}

export const HorizonPlot: React.FC<HorizonPlotProps> = ({ site, simulatedDateOffset }) => {
  // Generate a 14-day synodic trajectory centered on active simulation time
  const days = Array.from({ length: 15 }, (_, i) => i - 7 + simulatedDateOffset);

  const isSouthPole = site.coordinates.latitude < -80;

  const trajectory = days.map((day) => {
    const solar = computeSolarTelemetryAtTime(
      site.coordinates.latitude,
      site.coordinates.longitude,
      day,
      site
    );
    const earth = computeEarthTelemetryAtTime(
      site.coordinates.latitude,
      site.coordinates.longitude,
      day,
      site
    );

    return {
      day,
      sunAngle: Math.round(solar.effectiveSunElevDeg * 10) / 10,
      earthAngle: Math.round(earth.effectiveEarthElevDeg * 10) / 10,
      isSunHazard: !solar.isSunlit,
      isCommsHazard: !earth.hasLos,
    };
  });

  const solarNow = computeSolarTelemetryAtTime(
    site.coordinates.latitude,
    site.coordinates.longitude,
    simulatedDateOffset,
    site
  );
  const earthNow = computeEarthTelemetryAtTime(
    site.coordinates.latitude,
    site.coordinates.longitude,
    simulatedDateOffset,
    site
  );
  const missionUtc = formatMissionUtc(simulatedDateOffset);

  const width = 600;
  const height = 180;
  const padding = 36;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  // Scale functions capturing deep night/crater shadows and grazing/equatorial solar arcs
  const minAngle = isSouthPole ? -15 : -75;
  const maxAngle = isSouthPole ? 16 : 85;

  const getY = (angle: number) => {
    const clamped = Math.max(minAngle, Math.min(maxAngle, angle));
    return padding + graphHeight - ((clamped - minAngle) / (maxAngle - minAngle)) * graphHeight;
  };

  const getX = (index: number) => {
    return padding + (index / (trajectory.length - 1)) * graphWidth;
  };

  const horizonY = getY(0);

  // Generate SVG path strings
  const sunPath = trajectory
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(point.sunAngle)}`)
    .join(' ');

  const earthPath = trajectory
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(point.earthAngle)}`)
    .join(' ');

  return (
    <div className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-white flex items-center gap-2">
            <Sun className="w-4 h-4 text-[#F59E0B]" /> 2D Local Horizon & Elevation Plot (Modeled)
          </h3>
          <p className="text-xs text-[#9CA3AF]">
            Local elevation angle above topographic horizon (0°) for Sun &amp; Earth across mission timeline. Earth drifts a few degrees because of <Term k="libration">lunar libration</Term>.
          </p>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-[#F59E0B]">
            <span className="w-2.5 h-0.5 bg-[#F59E0B]"></span>
            <Term k="sunElevation">Sun Elevation</Term> (Power)
          </div>
          <div className="flex items-center gap-1.5 text-white">
            <span className="w-2.5 h-0.5 bg-white"></span>
            Earth <Term k="los">LOS</Term> (Comms)
          </div>
        </div>
      </div>

      {/* SVG Canvas Chart */}
      <div className="relative w-full overflow-x-auto bg-black rounded-[2px] border border-white/[0.14] p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-[190px]">
          {/* Below Horizon Hazard Zone (Shaded Area) */}
          <rect
            x={padding}
            y={horizonY}
            width={graphWidth}
            height={height - padding - horizonY}
            fill="rgba(239, 68, 68, 0.08)"
          />

          {/* Local Topographic Horizon Line (0 deg) */}
          <line
            x1={padding}
            y1={horizonY}
            x2={width - padding}
            y2={horizonY}
            stroke="rgba(239, 68, 68, 0.5)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text
            x={padding + 6}
            y={horizonY - 4}
            fill="#EF4444"
            fontSize="9"
            fontFamily="monospace"
            className="select-none"
          >
            LOCAL TOPOGRAPHIC HORIZON (0° THRESHOLD)
          </text>

          {/* Grid lines */}
          <line
            x1={padding}
            y1={padding}
            x2={width - padding}
            y2={padding}
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="1"
          />

          {/* Earth Path */}
          <path d={earthPath} fill="none" stroke="#FFFFFF" strokeWidth="2" />

          {/* Sun Path */}
          <path d={sunPath} fill="none" stroke="#F59E0B" strokeWidth="2" />

          {/* Current Day Indicator Marker */}
          {trajectory.map((point, idx) => {
            if (point.day === simulatedDateOffset) {
              return (
                <g key={idx}>
                  <line
                    x1={getX(idx)}
                    y1={padding}
                    x2={getX(idx)}
                    y2={height - padding}
                    stroke="#FFFFFF"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    strokeOpacity="0.6"
                  />
                  <circle cx={getX(idx)} cy={getY(point.sunAngle)} r="4" fill="#F59E0B" />
                  <circle cx={getX(idx)} cy={getY(point.earthAngle)} r="4" fill="#FFFFFF" />
                  <text
                    x={getX(idx)}
                    y={padding - 6}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    CURRENT T{point.day >= 0 ? `+${point.day}` : point.day}d
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* X Axis Time Labels */}
          {trajectory.map((point, idx) => {
            if (idx % 2 === 0) {
              return (
                <text
                  key={idx}
                  x={getX(idx)}
                  y={height - padding + 15}
                  textAnchor="middle"
                  fill="#9CA3AF"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  T{point.day >= 0 ? `+${point.day}` : point.day}d
                </text>
              );
            }
            return null;
          })}
        </svg>
      </div>

      {/* Hazard Diagnostic Banner */}
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono border-t border-white/[0.14] pt-2.5 text-[#9CA3AF]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <AlertOctagon className={`w-3.5 h-3.5 ${solarNow.isSunlit ? 'text-[#10B981]' : 'text-[#EF4444]'}`} />
          <span>{missionUtc.fullUtc} ·</span>
          {solarNow.isSunlit ? (
            <span className="text-[#10B981] font-bold">
              SUNLIT (+{solarNow.effectiveSunElevDeg.toFixed(1)}° {isSouthPole ? 'Grazing' : 'Day'} Arc)
            </span>
          ) : (
            <span className="text-[#EF4444] font-bold">
              IN LUNAR SHADOW ({solarNow.effectiveSunElevDeg.toFixed(1)}° Below Horizon)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[#9CA3AF]">
          <Radio className="w-3.5 h-3.5 text-white" />
          <span>
            Direct Comm Link:{' '}
            <span className={earthNow.hasLos ? 'text-[#10B981] font-semibold' : 'text-[#EF4444] font-semibold'}>
              {earthNow.hasLos ? `LOCKED (${earthNow.effectiveEarthElevDeg.toFixed(1)}°)` : 'OCCLUDED'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { CandidateSite } from '../types';
import { Sun, Radio, AlertOctagon } from 'lucide-react';
import { Term } from './Glossary';

interface HorizonPlotProps {
  site: CandidateSite;
  simulatedDateOffset: number;
}

export const HorizonPlot: React.FC<HorizonPlotProps> = ({ site, simulatedDateOffset }) => {
  // Generate a 14-day synodic trajectory for Sun and Earth elevation angles
  const days = Array.from({ length: 15 }, (_, i) => i - 7 + simulatedDateOffset);

  // Compute elevation angles relative to local horizon (0 deg)
  // South pole has very low solar elevation (0-4 deg) vs Apollo equator (up to 90 deg)
  const isSouthPole = site.coordinates.latitude < -80;
  const maxSunAngle = isSouthPole ? 3.8 : 75.0;

  const trajectory = days.map((day) => {
    // Sun elevation angle oscillates with lunar day cycle (approx 29.5 days)
    const sunAngle = Math.sin((day * 2 * Math.PI) / 29.5) * maxSunAngle + (isSouthPole ? 0.8 : 35);
    // Earth stays relatively fixed in the sky from Moon due to tidal locking, with slight libration (~6 deg)
    const earthAngle = site.defaultEarthLos
      ? 12.5 + Math.sin(day * 0.4) * 4.2
      : -8.0 + Math.sin(day * 0.4) * 2.0;

    return {
      day,
      sunAngle: Math.round(sunAngle * 10) / 10,
      earthAngle: Math.round(earthAngle * 10) / 10,
      isSunHazard: sunAngle <= 0.5,
      isCommsHazard: earthAngle <= 0.0,
    };
  });

  const width = 600;
  const height = 180;
  const padding = 36;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  // Scale functions
  const minAngle = isSouthPole ? -10 : -15;
  const maxAngle = isSouthPole ? 18 : 85;

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
        <div className="flex items-center gap-1.5">
          <AlertOctagon className="w-3.5 h-3.5 text-[#F59E0B]" />
          <span>Operational Window Status:</span>
          {isSouthPole ? (
            <span className="text-[#F59E0B] font-bold">Low Grazing Angle (0°–4° Sun) • Severe Long Shadows</span>
          ) : (
            <span className="text-[#10B981] font-bold">Nominal High Solar Arc (Up to 75°) • Safe Power</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[#9CA3AF]">
          <Radio className="w-3.5 h-3.5 text-white" />
          <span>Direct Comm Link: {site.defaultEarthLos ? 'LOCKED (Continuous)' : 'INTERRUPTED'}</span>
        </div>
      </div>
    </div>
  );
};

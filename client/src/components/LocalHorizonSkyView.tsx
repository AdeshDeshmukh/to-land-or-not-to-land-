import React, { useMemo, useState } from 'react';
import { CandidateSite } from '../types';
import {
  computeEarthTelemetryAtTime,
  computeLocalHorizonProfile,
  computeSolarTelemetryAtTime,
} from '../utils/lunarTelemetry';
import { Compass, Eye, Globe, Sun } from 'lucide-react';

interface LocalHorizonSkyViewProps {
  site: CandidateSite;
  simulatedDateOffset: number;
}

type SkyViewMode = 'PANORAMA' | 'POLAR';

export const LocalHorizonSkyView: React.FC<LocalHorizonSkyViewProps> = ({
  site,
  simulatedDateOffset,
}) => {
  const [viewMode, setViewMode] = useState<SkyViewMode>('PANORAMA');

  const { latitude, longitude } = site.coordinates;
  const isPolar = Math.abs(latitude) >= 72;

  const solarNow = useMemo(
    () => computeSolarTelemetryAtTime(latitude, longitude, simulatedDateOffset, site),
    [latitude, longitude, simulatedDateOffset, site]
  );

  const earthNow = useMemo(
    () => computeEarthTelemetryAtTime(latitude, longitude, simulatedDateOffset, site),
    [latitude, longitude, simulatedDateOffset, site]
  );

  const horizonProfile = useMemo(
    () => computeLocalHorizonProfile(latitude, longitude, site),
    [latitude, longitude, site]
  );

  // Sample 1 full synodic cycle (29.5 days in 12h steps) for trajectory ribbons
  const cyclePoints = useMemo(() => {
    const pts: {
      day: number;
      sunAz: number;
      sunEl: number;
      earthAz: number;
      earthEl: number;
    }[] = [];
    for (let d = -14.5; d <= 14.75; d += 0.5) {
      const s = computeSolarTelemetryAtTime(latitude, longitude, d, site);
      const e = computeEarthTelemetryAtTime(latitude, longitude, d, site);
      pts.push({
        day: d,
        sunAz: s.sunAzimuthDeg,
        sunEl: s.rawSunElevDeg,
        earthAz: e.earthAzimuthDeg,
        earthEl: e.earthElevDeg,
      });
    }
    return pts;
  }, [latitude, longitude, site]);

  // Helper to build wrap-safe SVG path segments across 0°/360° boundary
  const buildWrappedPath = (
    points: { az: number; el: number }[],
    mapX: (az: number) => number,
    mapY: (el: number) => number
  ): string[] => {
    const segments: string[] = [];
    let current = '';
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const prev = i > 0 ? points[i - 1] : null;
      const x = mapX(pt.az);
      const y = mapY(pt.el);
      if (!prev || Math.abs(pt.az - prev.az) > 120) {
        if (current) segments.push(current);
        current = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      } else {
        current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    if (current) segments.push(current);
    return segments;
  };

  // Panoramic projection geometry (azimuth horizontal center = North 0°/360°? No: left=0°N, 90°E, 180°S, 270°W, 360°N OR center=0°N so Earth stays centered!)
  // Putting 180°S..270°W..0°N..90°E..180°S centers North (0°N) and Earth right in the middle of the panorama!
  const shiftAzCenterNorth = (azDeg: number) => ((azDeg + 180) % 360); // maps 180°S->0, 270°W->90, 0°N->180, 90°E->270

  const panoW = 600;
  const panoH = 196;
  const padL = 38;
  const padR = 16;
  const padT = 18;
  const padB = 26;
  const plotW = panoW - padL - padR;
  const plotH = panoH - padT - padB;

  const minEl = isPolar ? -12 : -65;
  const maxEl = isPolar ? 22 : 85;

  const mapPanoX = (azDeg: number) => padL + (shiftAzCenterNorth(azDeg) / 360) * plotW;
  const mapPanoY = (elDeg: number) => {
    const clamped = Math.max(minEl, Math.min(maxEl, elDeg));
    return padT + plotH - ((clamped - minEl) / (maxEl - minEl)) * plotH;
  };

  // Build ordered terrain skyline polygon left-to-right (S -> W -> N -> E -> S)
  const orderedHorizon = useMemo(() => {
    return horizonProfile
      .map((p) => ({ ...p, xOrder: shiftAzCenterNorth(p.azimuthDeg) }))
      .sort((a, b) => a.xOrder - b.xOrder);
  }, [horizonProfile]);

  const terrainLineD = useMemo(() => {
    if (orderedHorizon.length === 0) return '';
    const pts = orderedHorizon.map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${(padL + (p.xOrder / 360) * plotW).toFixed(1)} ${mapPanoY(p.cutoffDeg).toFixed(1)}`
    );
    const last = orderedHorizon[0];
    pts.push(
      `L ${(padL + plotW).toFixed(1)} ${mapPanoY(last.cutoffDeg).toFixed(1)}`
    );
    return pts.join(' ');
  }, [orderedHorizon]);

  const terrainFillD = terrainLineD
    ? `${terrainLineD} L ${(padL + plotW).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${padL.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
    : '';

  const horizon0Y = mapPanoY(0);
  const grazingTopY = mapPanoY(5);

  const sunOrbitSegments = useMemo(() => {
    const ordered = cyclePoints.map((p) => ({
      az: shiftAzCenterNorth(p.sunAz),
      el: p.sunEl,
    }));
    const segments: string[] = [];
    let current = '';
    for (let i = 0; i < ordered.length; i++) {
      const pt = ordered[i];
      const prev = i > 0 ? ordered[i - 1] : null;
      const x = padL + (pt.az / 360) * plotW;
      const y = mapPanoY(pt.el);
      if (!prev || Math.abs(pt.az - prev.az) > 120) {
        if (current) segments.push(current);
        current = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      } else {
        current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    if (current) segments.push(current);
    return segments;
  }, [cyclePoints, isPolar]);

  const earthOrbitSegments = useMemo(
    () =>
      buildWrappedPath(
        cyclePoints.map((p) => ({ az: p.earthAz, el: p.earthEl })),
        mapPanoX,
        mapPanoY
      ),
    [cyclePoints, isPolar]
  );

  // Also check instantaneous body visibility relative to horizon
  const sunX = mapPanoX(solarNow.sunAzimuthDeg);
  const sunY = mapPanoY(solarNow.rawSunElevDeg);
  const earthX = mapPanoX(earthNow.earthAzimuthDeg);
  const earthY = mapPanoY(earthNow.earthElevDeg);

  // Polar Dome geometry (radius maps zenith 90° -> center, 0° -> rHorizon, -15° -> rOuter)
  const domeR = 72;
  const domeCx = 140;
  const domeCy = 96;
  const mapPolar = (azDeg: number, elDeg: number) => {
    const clampedEl = Math.max(-15, Math.min(90, elDeg));
    const elSpan = isPolar ? 35 : 90;
    const normR =
      clampedEl >= 0
        ? Math.max(0.06, 1 - Math.min(elSpan, clampedEl) / elSpan) * (domeR * 0.84)
        : domeR * 0.84 + (Math.abs(clampedEl) / 15) * (domeR * 0.16);
    const rad = (azDeg * Math.PI) / 180;
    return {
      x: domeCx + Math.sin(rad) * normR,
      y: domeCy - Math.cos(rad) * normR,
    };
  };
  const sunPolar = mapPolar(solarNow.sunAzimuthDeg, solarNow.rawSunElevDeg);
  const earthPolar = mapPolar(earthNow.earthAzimuthDeg, earthNow.earthElevDeg);

  return (
    <div className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-4 space-y-3">
      {/* Header + Live Degree Readouts */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-white flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-[#38BDF8]" /> Local Lander Horizon &amp; Sky View
          </h3>
          <p className="text-[11px] text-[#9CA3AF] mt-0.5">
            Real-time Sun &amp; Earth position relative to local terrain horizon &amp; 5° grazing zone.
          </p>
        </div>

        {/* Mode Toggle: Panorama / Polar */}
        <div className="flex items-center gap-1 bg-black border border-white/[0.14] rounded-[2px] p-0.5 text-[9px] font-mono uppercase self-start shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('PANORAMA')}
            className={`px-2 py-0.5 rounded-[2px] whitespace-nowrap transition ${
              viewMode === 'PANORAMA'
                ? 'bg-white text-black font-bold'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            Panorama
          </button>
          <button
            type="button"
            onClick={() => setViewMode('POLAR')}
            className={`px-2 py-0.5 rounded-[2px] whitespace-nowrap transition ${
              viewMode === 'POLAR'
                ? 'bg-white text-black font-bold'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            Polar Dome
          </button>
        </div>
      </div>

      {/* Live Degree Pill Readout */}
      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono tabular-nums">
        <div className="bg-black border border-white/[0.14] rounded-[2px] px-2.5 py-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[#FBBF24] font-semibold">
            <Sun className="w-3.5 h-3.5 text-[#FACC15]" /> SUN
          </span>
          <span className="text-white font-bold">
            {solarNow.effectiveSunElevDeg >= 0 ? '+' : ''}
            {solarNow.effectiveSunElevDeg.toFixed(1)}°{' '}
            <span className="text-[#9CA3AF] font-normal">
              ({Math.round(solarNow.sunAzimuthDeg)}° {solarNow.sunCompass})
            </span>
          </span>
        </div>

        <div className="bg-black border border-white/[0.14] rounded-[2px] px-2.5 py-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[#38BDF8] font-semibold">
            <Globe className="w-3.5 h-3.5 text-[#38BDF8]" /> EARTH
          </span>
          <span className="text-white font-bold">
            {earthNow.effectiveEarthElevDeg >= 0 ? '+' : ''}
            {earthNow.effectiveEarthElevDeg.toFixed(1)}°{' '}
            <span className="text-[#9CA3AF] font-normal">
              ({Math.round(earthNow.earthAzimuthDeg)}° {earthNow.earthCompass})
            </span>
          </span>
        </div>
      </div>

      {/* Interactive Sky Canvas */}
      <div className="bg-black border border-white/[0.14] rounded-[2px] p-2 overflow-hidden">
        {viewMode === 'PANORAMA' ? (
          <svg viewBox={`0 0 ${panoW} ${panoH}`} className="w-full h-auto block select-none">
            <defs>
              <linearGradient id="skyDomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#050811" />
                <stop offset="100%" stopColor="#0C1322" />
              </linearGradient>
              <radialGradient id="sunGlowGrad">
                <stop offset="0%" stopColor="#FEF08A" stopOpacity="0.95" />
                <stop offset="45%" stopColor="#F59E0B" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="earthGlowGrad">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Night Sky Backdrop */}
            <rect x={padL} y={padT} width={plotW} height={plotH} fill="url(#skyDomeGrad)" />

            {/* Subtle 5° Grazing Comms & Solar Zone Band above 0° Horizon */}
            {grazingTopY < horizon0Y && (
              <rect
                x={padL}
                y={Math.max(padT, grazingTopY)}
                width={plotW}
                height={Math.max(0, horizon0Y - Math.max(padT, grazingTopY))}
                fill="rgba(56, 189, 248, 0.10)"
              />
            )}

            {/* 5° Grazing Zone upper boundary */}
            <line
              x1={padL}
              y1={grazingTopY}
              x2={padL + plotW}
              y2={grazingTopY}
              stroke="rgba(56, 189, 248, 0.35)"
              strokeDasharray="3 4"
              strokeWidth="1"
            />
            <text
              x={padL + plotW - 4}
              y={grazingTopY - 3}
              textAnchor="end"
              fill="#38BDF8"
              fontSize="8"
              fontFamily="monospace"
            >
              +5° GRAZING COMMS ZONE
            </text>

            {/* Mathematical 0° Horizon Line */}
            <line
              x1={padL}
              y1={horizon0Y}
              x2={padL + plotW}
              y2={horizon0Y}
              stroke="rgba(255, 255, 255, 0.35)"
              strokeDasharray="4 3"
              strokeWidth="1"
            />

            {/* Cardinal Azimuth Vertical Grid Lines */}
            {[
              { azShift: 0, label: 'S 180°' },
              { azShift: 90, label: 'W 270°' },
              { azShift: 180, label: 'N 0°' },
              { azShift: 270, label: 'E 90°' },
              { azShift: 360, label: 'S 180°' },
            ].map((tick, idx) => {
              const x = padL + (tick.azShift / 360) * plotW;
              return (
                <g key={idx}>
                  <line
                    x1={x}
                    y1={padT}
                    x2={x}
                    y2={padT + plotH}
                    stroke={tick.azShift === 180 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.08)'}
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={panoH - 8}
                    textAnchor={idx === 0 ? 'start' : idx === 4 ? 'end' : 'middle'}
                    fill={tick.azShift === 180 ? '#38BDF8' : '#6B7280'}
                    fontSize="8.5"
                    fontFamily="monospace"
                  >
                    {tick.label}
                  </text>
                </g>
              );
            })}

            {/* Elevation Y-axis Labels */}
            {(isPolar ? [-10, 0, 5, 15, 20] : [-40, 0, 30, 60]).map((el) => {
              const y = mapPanoY(el);
              return (
                <text
                  key={el}
                  x={padL - 5}
                  y={y + 3}
                  textAnchor="end"
                  fill={el === 0 ? '#E5E7EB' : '#6B7280'}
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  {el > 0 ? `+${el}°` : `${el}°`}
                </text>
              );
            })}

            {/* Earth Libration Loop Trajectory */}
            {earthOrbitSegments.map((d, i) => (
              <path
                key={`e-seg-${i}`}
                d={d}
                fill="none"
                stroke="rgba(56, 189, 248, 0.45)"
                strokeWidth="1.2"
                strokeDasharray="2 2"
              />
            ))}

            {/* Sun Synodic Arc Trajectory */}
            {sunOrbitSegments.map((d, i) => (
              <path
                key={`s-seg-${i}`}
                d={d}
                fill="none"
                stroke="rgba(250, 204, 21, 0.45)"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
            ))}

            {/* Shadowed Ground & Local Terrain Horizon Silhouette */}
            {terrainFillD && <path d={terrainFillD} fill="rgba(7, 9, 13, 0.90)" />}
            {terrainLineD && (
              <path
                d={terrainLineD}
                fill="none"
                stroke="rgba(203, 213, 225, 0.65)"
                strokeWidth="1.5"
              />
            )}
            <text
              x={padL + 6}
              y={Math.min(padT + plotH - 5, horizon0Y + 13)}
              fill="#6B7280"
              fontSize="8"
              fontFamily="monospace"
            >
              SHADOWED GROUND (&lt; 0° HORIZON)
            </text>

            {/* EARTH ICON at real azimuth/elevation */}
            <g transform={`translate(${earthX.toFixed(1)}, ${earthY.toFixed(1)})`}>
              <circle r="13" fill="url(#earthGlowGrad)" />
              <circle
                r="6.5"
                fill={earthNow.hasLos ? '#0EA5E9' : '#1E293B'}
                stroke={earthNow.hasLos ? '#E0F2FE' : '#EF4444'}
                strokeWidth="1.4"
              />
              <path
                d="M -2.5 -2 Q 0 0 2.5 -1 Q 3 2 0 3.2 Q -2.8 1.5 -2.5 -2 Z"
                fill={earthNow.hasLos ? '#34D399' : '#475569'}
                opacity="0.85"
              />
              <text
                x="0"
                y="-10"
                textAnchor="middle"
                fill={earthNow.hasLos ? '#7DD3FC' : '#F87171'}
                fontSize="8.5"
                fontWeight="bold"
                fontFamily="monospace"
              >
                EARTH {earthNow.effectiveEarthElevDeg >= 0 ? '+' : ''}
                {earthNow.effectiveEarthElevDeg.toFixed(1)}°
              </text>
            </g>

            {/* SUN ICON at real azimuth/elevation */}
            <g transform={`translate(${sunX.toFixed(1)}, ${sunY.toFixed(1)})`}>
              <circle r="15" fill="url(#sunGlowGrad)" />
              <circle
                r="5.5"
                fill={solarNow.isSunlit ? '#FEF08A' : '#451A03'}
                stroke={solarNow.isSunlit ? '#F59E0B' : '#EF4444'}
                strokeWidth="1.4"
              />
              {[0, 45, 90, 135].map((ang) => {
                const rad = (ang * Math.PI) / 180;
                return (
                  <line
                    key={ang}
                    x1={Math.cos(rad) * -8.5}
                    y1={Math.sin(rad) * -8.5}
                    x2={Math.cos(rad) * 8.5}
                    y2={Math.sin(rad) * 8.5}
                    stroke={solarNow.isSunlit ? '#FDE047' : '#92400E'}
                    strokeWidth="1"
                    opacity="0.8"
                  />
                );
              })}
              <text
                x="0"
                y="16"
                textAnchor="middle"
                fill={solarNow.isSunlit ? '#FEF08A' : '#F87171'}
                fontSize="8.5"
                fontWeight="bold"
                fontFamily="monospace"
              >
                SUN {solarNow.effectiveSunElevDeg >= 0 ? '+' : ''}
                {solarNow.effectiveSunElevDeg.toFixed(1)}°
              </text>
            </g>
          </svg>
        ) : (
          <svg viewBox="0 0 280 192" className="w-full max-h-[196px] block select-none">
            {/* Outer shadowed (< 0°) ring */}
            <circle
              cx={domeCx}
              cy={domeCy}
              r={domeR}
              fill="rgba(239, 68, 68, 0.06)"
              stroke="rgba(255, 255, 255, 0.14)"
              strokeWidth="1"
            />
            {/* 0° Horizon Ring */}
            <circle
              cx={domeCx}
              cy={domeCy}
              r={domeR * 0.84}
              fill="#070C16"
              stroke="rgba(255, 255, 255, 0.45)"
              strokeDasharray="3 2"
              strokeWidth="1.2"
            />
            {/* +5° Grazing Zone Ring */}
            <circle
              cx={domeCx}
              cy={domeCy}
              r={domeR * 0.84 * (1 - 5 / (isPolar ? 35 : 90))}
              fill="none"
              stroke="rgba(56, 189, 248, 0.35)"
              strokeDasharray="2 3"
              strokeWidth="1"
            />
            {/* Cardinal Crosshairs */}
            <line
              x1={domeCx}
              y1={domeCy - domeR}
              x2={domeCx}
              y2={domeCy + domeR}
              stroke="rgba(255, 255, 255, 0.10)"
            />
            <line
              x1={domeCx - domeR}
              y1={domeCy}
              x2={domeCx + domeR}
              y2={domeCy}
              stroke="rgba(255, 255, 255, 0.10)"
            />
            <text x={domeCx} y={domeCy - domeR - 5} textAnchor="middle" fill="#38BDF8" fontSize="9" fontFamily="monospace" fontWeight="bold">N 0°</text>
            <text x={domeCx + domeR + 6} y={domeCy + 3} textAnchor="start" fill="#9CA3AF" fontSize="9" fontFamily="monospace">E 90°</text>
            <text x={domeCx} y={domeCy + domeR + 12} textAnchor="middle" fill="#9CA3AF" fontSize="9" fontFamily="monospace">S 180°</text>
            <text x={domeCx - domeR - 6} y={domeCy + 3} textAnchor="end" fill="#9CA3AF" fontSize="9" fontFamily="monospace">W 270°</text>

            {/* Earth Plot */}
            <circle cx={earthPolar.x} cy={earthPolar.y} r="10" fill="rgba(56, 189, 248, 0.28)" />
            <circle
              cx={earthPolar.x}
              cy={earthPolar.y}
              r="5"
              fill={earthNow.hasLos ? '#0EA5E9' : '#334155'}
              stroke="#E0F2FE"
              strokeWidth="1.2"
            />
            <text
              x={earthPolar.x}
              y={earthPolar.y - 9}
              textAnchor="middle"
              fill="#7DD3FC"
              fontSize="8"
              fontFamily="monospace"
              fontWeight="bold"
            >
              EARTH
            </text>

            {/* Sun Plot */}
            <circle cx={sunPolar.x} cy={sunPolar.y} r="11" fill="rgba(250, 204, 21, 0.30)" />
            <circle
              cx={sunPolar.x}
              cy={sunPolar.y}
              r="5"
              fill={solarNow.isSunlit ? '#FEF08A' : '#451A03'}
              stroke="#F59E0B"
              strokeWidth="1.2"
            />
            <text
              x={sunPolar.x}
              y={sunPolar.y + 13}
              textAnchor="middle"
              fill="#FEF08A"
              fontSize="8"
              fontFamily="monospace"
              fontWeight="bold"
            >
              SUN
            </text>
          </svg>
        )}
      </div>

      {/* Footer Status Note */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[#9CA3AF]">
        <span className="flex items-center gap-1">
          <Eye className="w-3 h-3 text-white" /> Local relief cutoff: {solarNow.horizonCutoffDeg >= 0 ? `+${solarNow.horizonCutoffDeg.toFixed(1)}° wall` : `${solarNow.horizonCutoffDeg.toFixed(1)}° peak bonus`}
        </span>
        <span className={earthNow.effectiveEarthElevDeg >= 0 && earthNow.effectiveEarthElevDeg <= 5 ? 'text-[#38BDF8]' : 'text-[#9CA3AF]'}>
          {earthNow.hasLos
            ? earthNow.effectiveEarthElevDeg <= 5
              ? 'GRAZING DTE COMMS'
              : 'CLEAR SKY DTE'
            : 'TERRAIN OCCLUDED'}
        </span>
      </div>
    </div>
  );
};

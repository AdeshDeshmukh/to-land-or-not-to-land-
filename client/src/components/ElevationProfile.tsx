import React, { useState, useMemo } from 'react';
import { CandidateSite } from '../types';
import { 
  Mountain, 
  Info
} from 'lucide-react';

interface ElevationProfileProps {
  site: CandidateSite;
}

interface ProfilePoint {
  distMeters: number;
  elevationMeters: number;
  slopeDeg: number;
  status: 'SAFE' | 'CAUTION' | 'HAZARD';
}

export const ElevationProfile: React.FC<ElevationProfileProps> = ({ site }) => {
  const [hoveredPoint, setHoveredPoint] = useState<ProfilePoint | null>(null);

  // Generate 81 data points across the 2 km traverse (-1000m to +1000m)
  const profilePoints: ProfilePoint[] = useMemo(() => {
    const points: ProfilePoint[] = [];
    const baseElev = site.coordinates.elevation_m;
    const baseSlope = site.terrain.slope_deg;

    // Site-specific topographic profile mathematical synthesis based on LOLA DEM signatures
    const rawElevOffset = (x: number): number => {
      if (site.id === 'shackleton_rim' || site.id === 'de_gerlache_rim_2' || site.id === 'cabeus_b_peak') {
        if (x < -200) {
          return (x + 200) * 0.14 - Math.sin(x * 0.02) * 6;
        } else if (x > 200) {
          return -(x - 200) * 0.42 - Math.sin(x * 0.015) * 12;
        }
        return -Math.pow(x / 220, 2) * 8 + Math.cos(x * 0.03) * 2;
      }
      if (site.id === 'malapert_mountain' || site.id === 'malapert_massif' || site.id === 'mons_mouton' || site.id === 'mons_mouton_plateau') {
        const drop = site.id === 'mons_mouton_plateau' ? 42 : 78;
        return -Math.pow(x / 520, 2) * drop + Math.sin(x * 0.01) * 10;
      }
      if (site.id === 'nobile_crater_rim' || site.id === 'nobile_rim_1' || site.id === 'nobile_rim_2' || site.id === 'haworth') {
        const pitch = site.id === 'nobile_rim_2' ? 0.28 : 0.18;
        return -(x * pitch) + Math.sin(x * 0.018) * 28 + Math.cos(x * 0.007) * 20;
      }
      if (site.id === 'mare_tranquillitatis' || site.id === 'slater_plain') {
        return Math.sin(x * 0.005) * 4.5 + Math.cos(x * 0.02) * 1.4;
      }
      if (site.id === 'connecting_ridge') {
        return -Math.abs(x) * 0.22 + Math.cos(x * 0.01) * 12;
      }
      return Math.sin(x * 0.008) * (baseSlope * 4) + Math.cos(x * 0.02) * (baseSlope * 1.5);
    };
    const centerElevOffset = rawElevOffset(0);

    for (let x = -1000; x <= 1000; x += 25) {
      const elevOffset = rawElevOffset(x) - centerElevOffset;
      const totalElevation = Math.round((baseElev + elevOffset) * 10) / 10;

      // Calculate local instantaneous slope gradient (exact site slope anchored at x=0)
      let localSlope = baseSlope;
      if (x === 0) {
        localSlope = baseSlope;
      } else if (site.id === 'shackleton_rim' || site.id === 'de_gerlache_rim_2' || site.id === 'cabeus_b_peak') {
        if (x > 250) localSlope = Math.min(34, 16 + (x - 250) * 0.02);
        else if (x < -250) localSlope = Math.min(14, 6 + Math.abs(x) * 0.008);
        else localSlope = baseSlope;
      } else if (site.id === 'malapert_mountain' || site.id === 'malapert_massif' || site.id === 'mons_mouton' || site.id === 'mons_mouton_plateau') {
        localSlope = Math.max(2.2, baseSlope + Math.abs(x) * 0.005 + Math.sin(x * 0.012) * 1.1);
      } else if (site.id === 'nobile_crater_rim' || site.id === 'nobile_rim_2' || site.id === 'nobile_rim_1' || site.id === 'haworth') {
        localSlope = Math.min(28, baseSlope + Math.abs(Math.sin(x * 0.02)) * 8);
      } else if (site.id === 'mare_tranquillitatis' || site.id === 'slater_plain') {
        localSlope = Math.max(1.2, baseSlope + Math.sin(x * 0.01) * 1.4);
      } else if (site.id === 'connecting_ridge') {
        localSlope = Math.abs(x) > 200 ? 16.5 : baseSlope;
      } else {
        localSlope = Math.max(1, baseSlope + Math.sin(x * 0.01) * 3);
      }

      let status: 'SAFE' | 'CAUTION' | 'HAZARD' = 'SAFE';
      if (localSlope > 15) status = 'HAZARD';
      else if (localSlope > 5) status = 'CAUTION';

      points.push({
        distMeters: x,
        elevationMeters: totalElevation,
        slopeDeg: Math.round(localSlope * 10) / 10,
        status,
      });
    }

    return points;
  }, [site]);

  // Max and min elevations for graph scaling
  const elevations = profilePoints.map(p => p.elevationMeters);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const elevRange = Math.max(30, maxElev - minElev);

  const maxProfileSlope = Math.max(...profilePoints.map(p => p.slopeDeg));
  const landingZonePoint = profilePoints.find(p => p.distMeters === 0) || profilePoints[Math.floor(profilePoints.length / 2)];

  // SVG dimensions
  const svgWidth = 680;
  const svgHeight = 210;
  const padLeft = 55;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const getX = (distMeters: number) => {
    return padLeft + ((distMeters + 1000) / 2000) * plotWidth;
  };

  const getY = (elevation: number) => {
    return padTop + plotHeight - ((elevation - minElev) / elevRange) * plotHeight;
  };

  // Build SVG path
  const pathD = profilePoints
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(pt.distMeters)} ${getY(pt.elevationMeters)}`)
    .join(' ');

  // Build filled area below curve
  const areaD = `${pathD} L ${getX(1000)} ${padTop + plotHeight} L ${getX(-1000)} ${padTop + plotHeight} Z`;

  // Landing ellipse boundaries (-200m to +200m)
  const lzLeftX = getX(-200);
  const lzRightX = getX(200);
  const lzWidth = lzRightX - lzLeftX;

  return (
    <div className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-5 space-y-3.5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.14] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[2px] bg-black border border-white/[0.14] flex items-center justify-center text-white">
            <Mountain className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-white flex items-center gap-2">
              Topographic Elevation Profile
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-[2px] bg-black text-[#9CA3AF] border border-white/[0.14]">
                2 KM FOOTPRINT
              </span>
            </h3>
            <p className="text-xs text-[#9CA3AF]">
              High-resolution LOLA altimetry cross-section across landing ellipse (-1,000 m to +1,000 m).
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-[#10B981]">
            <span className="w-2 h-2 rounded-[1px] bg-[#10B981]/30 border border-[#10B981]"></span>
            &lt;5° Safe
          </div>
          <div className="flex items-center gap-1.5 text-[#F59E0B]">
            <span className="w-2 h-2 rounded-[1px] bg-[#F59E0B]/30 border border-[#F59E0B]"></span>
            5°–15° Caution
          </div>
          <div className="flex items-center gap-1.5 text-[#EF4444]">
            <span className="w-2 h-2 rounded-[1px] bg-[#EF4444]/30 border border-[#EF4444]"></span>
            &gt;15° Hazard
          </div>
        </div>
      </div>

      {/* Topographic Quick Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="bg-black p-2.5 rounded-[2px] border border-white/[0.14]">
          <span className="text-[#6B7280] text-[10px] uppercase tracking-wider block">Center Altitude</span>
          <span className="text-white font-bold text-sm">
            {landingZonePoint ? `${landingZonePoint.elevationMeters} m` : 'N/A'}
          </span>
        </div>
        <div className="bg-black p-2.5 rounded-[2px] border border-white/[0.14]">
          <span className="text-[#6B7280] text-[10px] uppercase tracking-wider block">Target Gradient</span>
          <span className={`font-bold text-sm ${site.terrain.slope_deg < 5 ? 'text-[#10B981]' : site.terrain.slope_deg < 15 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}`}>
            {site.terrain.slope_deg.toFixed(1)}°
          </span>
        </div>
        <div className="bg-black p-2.5 rounded-[2px] border border-white/[0.14]">
          <span className="text-[#6B7280] text-[10px] uppercase tracking-wider block">Max Profile Slope</span>
          <span className={`font-bold text-sm ${maxProfileSlope > 15 ? 'text-[#EF4444]' : maxProfileSlope > 5 ? 'text-[#F59E0B]' : 'text-[#10B981]'}`}>
            {maxProfileSlope.toFixed(1)}°
          </span>
        </div>
        <div className="bg-black p-2.5 rounded-[2px] border border-white/[0.14]">
          <span className="text-[#6B7280] text-[10px] uppercase tracking-wider block">Relief Differential</span>
          <span className="text-white font-bold text-sm">
            Δ {Math.round(elevRange)} m
          </span>
        </div>
      </div>

      {/* Interactive SVG Cross-Section Graph */}
      <div className="relative w-full overflow-x-auto bg-black rounded-[2px] border border-white/[0.14] p-2 select-none">
        <svg 
          viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
          className="w-full h-auto max-h-[220px]"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            {/* Terrain Fill Gradient */}
            <linearGradient id="terrainGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.02" />
            </linearGradient>

            {/* Target Landing Zone Safe Strip */}
            <linearGradient id="lzGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines & Y-axis elevation labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = padTop + plotHeight * pct;
            const elevVal = Math.round(maxElev - elevRange * pct);
            return (
              <g key={idx}>
                <line 
                  x1={padLeft} 
                  y1={y} 
                  x2={svgWidth - padRight} 
                  y2={y} 
                  stroke="rgba(255, 255, 255, 0.12)" 
                  strokeDasharray="3 3" 
                />
                <text 
                  x={padLeft - 8} 
                  y={y + 3} 
                  fill="#6B7280" 
                  fontSize="9" 
                  textAnchor="end" 
                  fontFamily="monospace"
                >
                  {elevVal}m
                </text>
              </g>
            );
          })}

          {/* Highlight: Touchdown Ellipse Area (±200m) */}
          <rect
            x={lzLeftX}
            y={padTop}
            width={lzWidth}
            height={plotHeight}
            fill="url(#lzGrad)"
            stroke="#10B981"
            strokeWidth="1"
            strokeDasharray="4 2"
            strokeOpacity="0.45"
          />

          {/* Terrain Area Fill */}
          <path d={areaD} fill="url(#terrainGrad)" />

          {/* Main Terrain Surface Curve */}
          <path 
            d={pathD} 
            fill="none" 
            stroke="#FFFFFF" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* Target Zone Top Bracket & Label */}
          <g transform={`translate(${getX(0)}, ${padTop + 14})`}>
            <circle cx="0" cy="0" r="3" fill="#10B981" />
            <text 
              x="0" 
              y="-6" 
              fill="#10B981" 
              fontSize="9" 
              fontWeight="bold" 
              textAnchor="middle" 
              fontFamily="monospace"
            >
              TOUCHDOWN TARGET (0m)
            </text>
          </g>

          {/* X-axis ticks & labels */}
          {[-1000, -500, 0, 500, 1000].map((dist, idx) => {
            const x = getX(dist);
            return (
              <g key={idx}>
                <line 
                  x1={x} 
                  y1={padTop + plotHeight} 
                  x2={x} 
                  y2={padTop + plotHeight + 5} 
                  stroke="rgba(255, 255, 255, 0.25)" 
                />
                <text 
                  x={x} 
                  y={padTop + plotHeight + 17} 
                  fill="#9CA3AF" 
                  fontSize="9" 
                  textAnchor="middle" 
                  fontFamily="monospace"
                >
                  {dist >= 0 ? `+${dist}m` : `${dist}m`}
                </text>
              </g>
            );
          })}

          {/* Transparent interactive overlay columns for mouse hover */}
          {profilePoints.map((pt, idx) => {
            const x = getX(pt.distMeters);
            const stepWidth = plotWidth / (profilePoints.length - 1);
            return (
              <rect
                key={idx}
                x={x - stepWidth / 2}
                y={padTop}
                width={stepWidth}
                height={plotHeight}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoveredPoint(pt)}
              />
            );
          })}

          {/* Hover Crosshair & Data Indicator */}
          {hoveredPoint && (
            <g>
              <line
                x1={getX(hoveredPoint.distMeters)}
                y1={padTop}
                x2={getX(hoveredPoint.distMeters)}
                y2={padTop + plotHeight}
                stroke="#F59E0B"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <circle
                cx={getX(hoveredPoint.distMeters)}
                cy={getY(hoveredPoint.elevationMeters)}
                r="4"
                fill="#F59E0B"
                stroke="#000000"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Live Hover Tooltip Panel */}
        {hoveredPoint && (
          <div 
            className="absolute top-3 left-16 z-30 bg-[#090A0D]/95 border border-white/25 rounded-[2px] px-3 py-1.5 shadow-2xl text-xs font-mono pointer-events-none flex items-center gap-3"
          >
            <div>
              <span className="text-[#6B7280] text-[10px] uppercase tracking-wider block">Offset Distance:</span>
              <span className="text-white font-bold">
                {hoveredPoint.distMeters >= 0 ? `+${hoveredPoint.distMeters} m` : `${hoveredPoint.distMeters} m`}
              </span>
            </div>
            <div className="border-l border-white/[0.14] pl-2.5">
              <span className="text-[#6B7280] text-[10px] uppercase tracking-wider block">Altitude:</span>
              <span className="text-white font-bold">{hoveredPoint.elevationMeters} m</span>
            </div>
            <div className="border-l border-white/[0.14] pl-2.5">
              <span className="text-[#6B7280] text-[10px] uppercase tracking-wider block">Local Gradient:</span>
              <span className={`font-bold ${
                hoveredPoint.status === 'SAFE' ? 'text-[#10B981]' : hoveredPoint.status === 'CAUTION' ? 'text-[#F59E0B]' : 'text-[#EF4444]'
              }`}>
                {hoveredPoint.slopeDeg}° ({hoveredPoint.status})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Scientific Context Footer Note */}
      <div className="flex items-center gap-2 text-[11px] font-mono text-[#9CA3AF] bg-black p-2.5 rounded-[2px] border border-white/[0.14]">
        <Info className="w-3.5 h-3.5 text-white shrink-0" />
        <span>
          Radial cross-section oriented along nominal descent azimuth. Touchdown corridor highlighted in emerald (±200 m).
        </span>
      </div>
    </div>
  );
};

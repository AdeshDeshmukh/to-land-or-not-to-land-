import React from 'react';
import { Database, FlaskConical } from 'lucide-react';

interface Source {
  name: string;
  detail: string;
  kind: 'data' | 'modeled';
  title: string;
}

const SOURCES: Source[] = [
  {
    name: 'NASA LRO LROC',
    detail: 'surface imagery',
    kind: 'data',
    title: 'Moon surface texture: LROC Wide Angle Camera mosaic (NASA SVS 4720, CGI Moon Kit).',
  },
  {
    name: 'NASA LRO LOLA',
    detail: 'elevation & slope',
    kind: 'data',
    title:
      'Globe relief and dynamic RYG overlay derived from the LOLA digital elevation model (NASA SVS 4720).',
  },
  {
    name: 'JPL Horizons',
    detail: 'Sun/Earth geometry',
    kind: 'modeled',
    title:
      'Reference ephemeris for Sun and Earth geometry. In this build, sun elevation, libration and illumination are simplified models, not live Horizons queries.',
  },
];

export const DataAttribution: React.FC = () => (
  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider">
    <span className="text-[#6B7280] mr-0.5">DATA</span>
    {SOURCES.map((s) => (
      <span
        key={s.name}
        title={s.title}
        className="flex items-center gap-1.5 rounded-[2px] border border-white/[0.14] bg-black px-2 py-0.5 text-[#9CA3AF] cursor-help"
      >
        {s.kind === 'data' ? (
          <Database className="w-3 h-3 text-white" />
        ) : (
          <FlaskConical className="w-3 h-3 text-[#F59E0B]" />
        )}
        <span className="font-semibold text-white">{s.name}</span>
        <span className="text-[#6B7280] lowercase tracking-normal">{s.detail}</span>
        <span
          className={`rounded-[2px] px-1 py-px text-[9px] font-bold uppercase border ${
            s.kind === 'data'
              ? 'bg-white/[0.08] text-white border-white/20'
              : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/35'
          }`}
        >
          {s.kind === 'data' ? 'NASA DATA' : 'MODELED'}
        </span>
      </span>
    ))}
  </div>
);

import React from 'react';
import { Database, FlaskConical } from 'lucide-react';

interface Source {
  name: string;
  detail: string;
  kind: 'data' | 'modeled';
  title: string;
}

/**
 * Each badge states exactly what the data is used for and whether the app shows
 * measured NASA data or a simplified model, so judges never have to guess.
 */
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
      'Globe relief and slope overlay derived from the LOLA digital elevation model (NASA SVS 4720). Global grid is coarse, so overlay shows regional slope.',
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
  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
    <span className="text-slate-500 uppercase tracking-wider mr-0.5">Data</span>
    {SOURCES.map((s) => (
      <span
        key={s.name}
        title={s.title}
        className="flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-space-900/80 px-2 py-0.5 text-slate-300 cursor-help"
      >
        {s.kind === 'data' ? (
          <Database className="w-3 h-3 text-cyan-400" />
        ) : (
          <FlaskConical className="w-3 h-3 text-amber-400" />
        )}
        <span className="font-semibold text-slate-100">{s.name}</span>
        <span className="text-slate-400">{s.detail}</span>
        <span
          className={`rounded px-1 py-px text-[9px] font-bold uppercase ${
            s.kind === 'data' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {s.kind === 'data' ? 'NASA data' : 'Modeled'}
        </span>
      </span>
    ))}
  </div>
);

import React, { useEffect } from 'react';
import { X, Scale } from 'lucide-react';
import { LanderProfile } from '../types';
import { RISK_THRESHOLDS } from '../engine/riskEngine';
import { Term, GlossaryKey } from './Glossary';

interface MethodologyModalProps {
  isOpen: boolean;
  onClose: () => void;
  parameters: LanderProfile;
}

interface Row {
  factor: string;
  term: GlossaryKey;
  ref: [string, string, string];
  live: [string, string, string];
  basis: string;
}

const T = RISK_THRESHOLDS;

function buildRows(p: LanderProfile): Row[] {
  const roughnessLive: Record<LanderProfile['maxRoughness'], [string, string, string]> = {
    LOW: ['LOW', 'MODERATE', 'HIGH'],
    MODERATE: ['LOW, MODERATE', '—', 'HIGH'],
    HIGH: ['LOW, MODERATE', 'HIGH', '—'],
  };

  return [
    {
      factor: 'Terrain slope',
      term: 'slope',
      ref: [`< ${T.slope.greenMax}°`, `${T.slope.greenMax}°–${T.slope.yellowMax}°`, `> ${T.slope.yellowMax}°`],
      live: [
        `< ${(p.maxSlopeDeg * 0.75).toFixed(1)}°`,
        `${(p.maxSlopeDeg * 0.75).toFixed(1)}°–${p.maxSlopeDeg.toFixed(1)}°`,
        `> ${p.maxSlopeDeg.toFixed(1)}°`,
      ],
      basis: 'LRO LOLA elevation model → derived slope',
    },
    {
      factor: 'Solar illumination',
      term: 'illumination',
      ref: [`≥ ${T.illumination.greenMin}%`, `${T.illumination.yellowMin}%–${T.illumination.greenMin}%`, `< ${T.illumination.yellowMin}%`],
      live: [
        `≥ ${p.minIlluminationPct}%`,
        `${Math.round(p.minIlluminationPct * 0.5)}%–${p.minIlluminationPct}%`,
        `< ${Math.round(p.minIlluminationPct * 0.5)}%`,
      ],
      basis: 'Sun-geometry model (JPL Horizons as reference)',
    },
    {
      factor: 'Surface roughness',
      term: 'roughness',
      ref: ['LOW', 'MODERATE', 'HIGH'],
      live: roughnessLive[p.maxRoughness],
      basis: 'Boulder / crater density classes (LROC imagery)',
    },
    {
      factor: 'Earth line of sight',
      term: 'los',
      ref: ['Direct link available', '—', 'Blocked'],
      live: p.requiresEarthLos
        ? ['Direct link available', '—', 'Blocked (direct link required)']
        : ['Direct link available', 'Blocked (relay needed)', '—'],
      basis: 'Earth visibility from the site (Earth–Moon geometry)',
    },
  ];
}

const CELL = [
  'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  'bg-amber-500/10 text-amber-300 border-amber-500/20',
  'bg-rose-500/10 text-rose-300 border-rose-500/20',
];

export const MethodologyModal: React.FC<MethodologyModalProps> = ({ isOpen, onClose, parameters }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const rows = buildRows(parameters);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Scoring methodology"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-space-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-800 bg-space-950/95 backdrop-blur px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Scale className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Scoring Methodology</h2>
              <p className="text-[11px] text-slate-400">How every Green / Yellow / Red rating is calculated</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-space-900 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left p-2.5">Factor</th>
                  <th className="p-2.5 text-emerald-400">Green</th>
                  <th className="p-2.5 text-amber-400">Yellow</th>
                  <th className="p-2.5 text-rose-400">Red</th>
                  <th className="text-left p-2.5">Data basis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {rows.map((row) => (
                  <React.Fragment key={row.factor}>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-100 align-top" rowSpan={2}>
                        <Term k={row.term}>{row.factor}</Term>
                      </td>
                      {row.ref.map((v, i) => (
                        <td key={i} className="p-1.5">
                          <div className={`rounded border px-2 py-1 text-center font-mono ${CELL[i]}`}>{v}</div>
                        </td>
                      ))}
                      <td className="p-2.5 text-slate-400 align-top" rowSpan={2}>{row.basis}</td>
                    </tr>
                    <tr>
                      {row.live.map((v, i) => (
                        <td key={i} className="p-1.5 pt-0">
                          <div className={`rounded border border-dashed px-2 py-1 text-center font-mono ${CELL[i]}`}>{v}</div>
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-4 text-[11px] text-slate-400">
            <span><span className="inline-block w-4 h-3 rounded-sm border border-slate-500 align-middle mr-1.5" />Solid = reference thresholds</span>
            <span><span className="inline-block w-4 h-3 rounded-sm border border-dashed border-slate-500 align-middle mr-1.5" />Dashed = active with your current Landing Parameters</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-slate-800 bg-space-900/60 p-3.5 space-y-1.5">
              <h3 className="font-bold text-white text-sm">Overall verdict</h3>
              <p className="text-slate-300 leading-relaxed">
                <span className="text-rose-300 font-semibold">Any Red</span> → NO-GO.{' '}
                <span className="text-amber-300 font-semibold">Any Yellow</span> (and no Red) → CAUTION.{' '}
                <span className="text-emerald-300 font-semibold">All Green</span> → GO.
              </p>
              <p className="text-slate-400 leading-relaxed">
                One critical failure disqualifies a site regardless of the others, mirroring real mission go/no-go criteria.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-space-900/60 p-3.5 space-y-1.5">
              <h3 className="font-bold text-white text-sm">How your sliders change the bands</h3>
              <p className="text-slate-300 leading-relaxed">
                Slope: Yellow begins at 75% of your max slope. Illumination: Yellow runs from 50% of your minimum up to the minimum. The Earth link check is yes/no in this build.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

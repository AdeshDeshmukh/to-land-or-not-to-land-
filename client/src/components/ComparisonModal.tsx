import React from 'react';
import { CandidateSite, LanderProfile } from '../types';
import { assessLandingSiteRisk } from '../engine/riskEngine';
import { X, Check, AlertTriangle, XCircle, ShieldCheck, Rocket } from 'lucide-react';

interface ComparisonModalProps {
  sites: CandidateSite[];
  isOpen: boolean;
  onClose: () => void;
  onSelectSite: (site: CandidateSite) => void;
  lander?: LanderProfile;
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({
  sites,
  isOpen,
  onClose,
  onSelectSite,
  lander,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-space-900 border border-slate-700/80 rounded-2xl max-w-5xl w-full p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Multi-Site Engineering Matrix Comparison
              </h2>
              {lander && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  <Rocket className="w-3 h-3" /> Profile: {lander.name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Side-by-side evaluation of terrain slope tilt risk, illumination windows, and communication lines evaluated against vehicle tolerances.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto flex-1 mt-4">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-space-950/60 text-slate-400">
                <th className="p-3">Landing Site</th>
                <th className="p-3">Overall Verdict</th>
                <th className="p-3">Coordinates</th>
                <th className="p-3">Slope (Limit: &le;{lander ? lander.maxSlopeDeg : 15}°)</th>
                <th className="p-3">Roughness</th>
                <th className="p-3">Solar Access</th>
                <th className="p-3">Earth Direct Link</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sites.map((site) => {
                const siteRisk = assessLandingSiteRisk(site, undefined, undefined, lander);
                const isGo = siteRisk.overall_status === 'GREEN';
                const isCaution = siteRisk.overall_status === 'YELLOW';
                const isNoGo = siteRisk.overall_status === 'RED';

                return (
                  <tr key={site.id} className="hover:bg-space-800/50 transition">
                    <td className="p-3 font-semibold text-white">
                      <div>{site.name}</div>
                      <div className="text-[10px] text-slate-400">{site.region}</div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                        isGo 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : isCaution 
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {isGo && <ShieldCheck className="w-3.5 h-3.5" />}
                        {isCaution && <AlertTriangle className="w-3.5 h-3.5" />}
                        {isNoGo && <XCircle className="w-3.5 h-3.5" />}
                        {siteRisk.overall_status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">
                      {site.coordinates.latitude}°, {site.coordinates.longitude}°
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          site.terrain.slope_deg <= (lander ? lander.maxSlopeDeg * 0.75 : 5)
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : site.terrain.slope_deg > (lander ? lander.maxSlopeDeg : 15)
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {site.terrain.slope_deg}°
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{site.terrain.roughness}</td>
                    <td className="p-3 text-amber-300">{site.defaultIlluminationPct}%</td>
                    <td className="p-3">
                      {site.defaultEarthLos ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Direct LOS
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1">
                          <X className="w-3.5 h-3.5" /> Relay Needed
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => {
                          onSelectSite(site);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition text-[11px]"
                      >
                        Inspect 3D
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>* Evaluated using NASA LRO LOLA topographical gradients and JPL Horizons telemetry.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Close Matrix
          </button>
        </div>
      </div>
    </div>
  );
};

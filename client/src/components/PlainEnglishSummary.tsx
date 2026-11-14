import React from 'react';
import { GraduationCap } from 'lucide-react';
import { CandidateSite, LanderProfile, RiskAssessment } from '../types';

interface PlainEnglishSummaryProps {
  site: CandidateSite;
  assessment: RiskAssessment;
  parameters: LanderProfile;
  illuminationPct: number;
}

const VERDICT: Record<string, string> = {
  GREEN: 'looks like a good place to land.',
  YELLOW: 'is possible, but needs extra care.',
  RED: 'is too risky with your current settings.',
};

/** Educator-mode card: the same assessment, explained without jargon. */
export const PlainEnglishSummary: React.FC<PlainEnglishSummaryProps> = ({
  site,
  assessment,
  parameters,
  illuminationPct,
}) => {
  const slope = site.terrain.slope_deg;
  const roughness = site.terrain.roughness.toLowerCase();
  const hasLos = site.defaultEarthLos;

  const lines: string[] = [
    `The ground here tilts about ${slope.toFixed(1)}°. Your limit is ${parameters.maxSlopeDeg.toFixed(1)}°; steeper than that and a lander could tip over.`,
    `The spot is in sunlight about ${illuminationPct}% of the time. You asked for at least ${parameters.minIlluminationPct}%, because solar panels only work in light.`,
    hasLos
      ? 'Earth is visible from here, so radio signals can travel straight home.'
      : parameters.requiresEarthLos
        ? 'Earth is hidden behind terrain, and you need a direct link, so this is a problem.'
        : 'Earth is hidden behind terrain, so messages would need to go through a relay satellite.',
    `The surface is ${roughness} in rockiness (boulders and small craters).`,
  ];

  return (
    <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-3.5 space-y-2">
      <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold font-mono uppercase tracking-wider">
        <GraduationCap className="w-4 h-4" /> In plain English
      </div>
      <p className="text-sm font-semibold text-white leading-snug">
        {site.name} {VERDICT[assessment.overall_status]}
      </p>
      <ul className="space-y-1.5 text-xs text-slate-300 leading-relaxed list-disc pl-4">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
};

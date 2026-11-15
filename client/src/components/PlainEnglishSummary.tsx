import React from 'react';
import { GraduationCap, Mountain, Radio, Sun } from 'lucide-react';
import { CandidateSite, LanderProfile, RiskAssessment } from '../types';

interface PlainEnglishSummaryProps {
  site: CandidateSite;
  assessment: RiskAssessment;
  parameters: LanderProfile;
  illuminationPct: number;
  hasEarthLos?: boolean;
  sunElevDeg?: number;
  earthElevDeg?: number;
}

const VERDICT: Record<string, string> = {
  GREEN: 'looks like a safe touchdown target right now.',
  YELLOW: 'is survivable, but operates near key safety margins.',
  RED: 'is unsafe with your current mission constraints.',
};

/** Educator-mode survival guide: explains why slope, solar grazing angle, and Earth LOS decide mission survival. */
export const PlainEnglishSummary: React.FC<PlainEnglishSummaryProps> = ({
  site,
  assessment,
  parameters,
  illuminationPct,
  hasEarthLos,
  sunElevDeg,
  earthElevDeg,
}) => {
  const slope = site.terrain.slope_deg;
  const roughness = site.terrain.roughness.toLowerCase();
  const hasLos = hasEarthLos !== undefined ? hasEarthLos : site.defaultEarthLos;
  const sunStr = sunElevDeg !== undefined ? `${sunElevDeg >= 0 ? '+' : ''}${sunElevDeg.toFixed(1)}°` : null;
  const earthStr = earthElevDeg !== undefined ? `${earthElevDeg >= 0 ? '+' : ''}${earthElevDeg.toFixed(1)}°` : null;

  const survivalCallouts = [
    {
      icon: Mountain,
      accent: 'text-emerald-300 border-emerald-400/25',
      title: '1. Slope & Tip-Over Physics',
      body: `This ground tilts ${slope.toFixed(1)}° with ${roughness} rockiness (limit: ${parameters.maxSlopeDeg.toFixed(1)}°). In weak 1/6th lunar gravity, steep slopes or unseen boulders can tip the lander during final braking—just like landing a tall table on a ramp.`,
    },
    {
      icon: Sun,
      accent: 'text-amber-300 border-amber-400/25',
      title: '2. Low Polar Sun & Shadow Traps',
      body: `Because the Moon tilts only ~1.54°, the South Pole Sun skims low along the horizon${sunStr ? ` (currently ${sunStr})` : ''}. Even small crater walls cast miles-long shadows (${illuminationPct}% sunlit). Long darkness drains batteries and can freeze electronics.`,
    },
    {
      icon: Radio,
      accent: 'text-sky-300 border-sky-400/25',
      title: '3. Earth Line-of-Sight & 0°–5° Grazing Link',
      body: `From the South Pole, Earth hangs low near the northern skyline${earthStr ? ` (${earthStr})` : ''}. Between 0° and 5° (yellow Grazing Zone), crater ridges and lunar wobble can interrupt direct radio links to Earth (${hasLos ? 'currently visible' : parameters.requiresEarthLos ? 'currently blocked' : 'blocked — relay needed'}).`,
    },
  ];

  return (
    <div
      data-testid="educator-plain-english-card"
      className="bg-black border border-sky-400/35 rounded-[2px] p-3.5 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.10] pb-2">
        <div className="flex items-center gap-2 text-sky-300 text-[10px] font-bold font-mono uppercase tracking-wider">
          <GraduationCap className="w-3.5 h-3.5 text-sky-300" /> Educator Mode · Plain-English Survival Guide
        </div>
      </div>
      <p className="text-xs font-semibold text-white leading-snug">
        {site.name} {VERDICT[assessment.overall_status]}
      </p>
      <div className="space-y-2">
        {survivalCallouts.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              className={`bg-[#090A0D] border rounded-[2px] p-2.5 space-y-1 ${c.accent}`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider">
                <Icon className="w-3 h-3 shrink-0" />
                <span>{c.title}</span>
              </div>
              <p className="text-[11px] text-[#D1D5DB] leading-relaxed font-sans">{c.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

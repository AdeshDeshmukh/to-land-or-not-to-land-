import React, { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

export type ViewMode = 'planner' | 'educator';

/** 'planner' = technical labels only. 'educator' = plain-English tooltips on jargon. */
export const ViewModeContext = createContext<ViewMode>('planner');

export const GLOSSARY = {
  slope: {
    label: 'Ground slope',
    plain:
      'How steeply the ground tilts. A lander on a steep slope can tip over. 5° is about a wheelchair ramp; 15° is like a very steep driveway.',
  },
  roughness: {
    label: 'Surface roughness',
    plain:
      'How many boulders and small craters are in the landing area. More rocks means a higher chance of damaging the lander’s legs.',
  },
  illumination: {
    label: 'Solar illumination',
    plain:
      'The share of time this spot is in sunlight. Solar panels only work in sunlight, and equipment can freeze in long shadow.',
  },
  los: {
    label: 'Line of sight (LOS)',
    plain:
      'Whether Earth is visible from the landing spot. If a hill blocks it, radio signals cannot go straight to Earth and a relay satellite is needed.',
  },
  dte: {
    label: 'Direct-to-Earth (DTE)',
    plain:
      'Sending radio signals straight to antennas on Earth (NASA’s Deep Space Network) instead of bouncing them through a relay satellite.',
  },
  sunElevation: {
    label: 'Solar elevation angle',
    plain:
      'How high the Sun is above the local horizon. Near the Moon’s poles it stays very low (0°–4°), so shadows are long and sunlight is weak.',
  },
  libration: {
    label: 'Lunar libration',
    plain:
      'A slow wobble of the Moon that lets us see slightly more than half of it from Earth. It makes Earth drift a few degrees in the lunar sky, which can cut or restore a radio link.',
  },
  soc: {
    label: 'Battery state of charge (SoC)',
    plain:
      'How full the battery is. In darkness it drains to keep the electronics warm, so a long night can empty it.',
  },
  shadowTrap: {
    label: 'Shadow trap',
    plain:
      'A long stretch of darkness. Past about 48 hours the battery may run out and equipment could freeze.',
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

const TOOLTIP_WIDTH = 270;

interface TermProps {
  k: GlossaryKey;
  children?: React.ReactNode;
}

/**
 * Wraps a technical term. In Educator mode it gets a dotted underline and a
 * plain-English tooltip (hover or keyboard focus). In Planner mode it renders as plain text.
 * The tooltip is portaled to <body> so drawer overflow/transform never clips it.
 */
export const Term: React.FC<TermProps> = ({ k, children }) => {
  const mode = useContext(ViewModeContext);
  const [tip, setTip] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const entry = GLOSSARY[k];
  const content = children ?? entry.label;

  if (mode !== 'educator') return <>{content}</>;

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(
      Math.max(8, r.left + r.width / 2 - TOOLTIP_WIDTH / 2),
      window.innerWidth - TOOLTIP_WIDTH - 8
    );
    const above = r.bottom > window.innerHeight - 150;
    setTip({ x, y: above ? r.top - 6 : r.bottom + 6, above });
  };

  return (
    <>
      <span
        tabIndex={0}
        className="border-b border-dotted border-white/60 cursor-help"
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setTip(null)}
      >
        {content}
      </span>
      {tip &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: tip.x,
              top: tip.y,
              width: TOOLTIP_WIDTH,
              transform: tip.above ? 'translateY(-100%)' : undefined,
            }}
            className="z-[100] pointer-events-none rounded-[2px] border border-white/25 bg-[#090A0D] p-2.5 shadow-2xl text-left normal-case tracking-normal font-sans"
          >
            <div className="text-[11px] font-mono uppercase tracking-wider font-bold text-white mb-1">{entry.label}</div>
            <div className="text-[11px] leading-snug text-[#9CA3AF] font-normal">{entry.plain}</div>
          </div>,
          document.body
        )}
    </>
  );
};

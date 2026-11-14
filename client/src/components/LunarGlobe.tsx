import React, { useRef, useEffect } from 'react';
import { CandidateSite } from '../types';

interface LunarGlobeProps {
  sites: CandidateSite[];
  selectedSite: CandidateSite;
  onSelectSite: (site: CandidateSite) => void;
  sunIlluminationOffset?: number; // Shifts terminator shadow
}

export const LunarGlobe: React.FC<LunarGlobeProps> = ({
  sites,
  selectedSite,
  onSelectSite,
  sunIlluminationOffset = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let rotation = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(centerX, centerY) * 0.78;

      // Outer Deep Space Ambient Glow
      const glowGrad = ctx.createRadialGradient(centerX, centerY, radius * 0.85, centerX, centerY, radius * 1.35);
      glowGrad.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
      glowGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.35, 0, Math.PI * 2);
      ctx.fill();

      // 1. Lunar Body (Sphere Base)
      const moonGrad = ctx.createRadialGradient(
        centerX - radius * 0.35,
        centerY - radius * 0.35,
        radius * 0.1,
        centerX,
        centerY,
        radius
      );
      moonGrad.addColorStop(0, '#E2E8F0'); // Bright highlands highlight
      moonGrad.addColorStop(0.4, '#94A3B8');
      moonGrad.addColorStop(0.8, '#475569');
      moonGrad.addColorStop(1, '#0F172A'); // Dark limb shadow

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = moonGrad;
      ctx.fill();

      // 2. Procedural Lunar Mare & Impact Basins
      const mareRegions = [
        { x: -0.25, y: -0.15, r: 0.35, shade: 'rgba(30, 41, 59, 0.45)' }, // Mare Tranquillitatis
        { x: 0.1, y: -0.3, r: 0.28, shade: 'rgba(30, 41, 59, 0.40)' },   // Mare Serenitatis
        { x: -0.45, y: 0.1, r: 0.42, shade: 'rgba(15, 23, 42, 0.50)' },   // Oceanus Procellarum
        { x: 0.35, y: 0.2, r: 0.22, shade: 'rgba(30, 41, 59, 0.35)' },    // Mare Crisium
        { x: 0.0, y: 0.75, r: 0.26, shade: 'rgba(15, 23, 42, 0.65)' },    // South Pole Aitken Basin
      ];

      mareRegions.forEach(mare => {
        ctx.fillStyle = mare.shade;
        ctx.beginPath();
        ctx.arc(
          centerX + mare.x * radius,
          centerY + mare.y * radius,
          mare.r * radius,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });

      // 3. Coordinate Graticule (Meridians & Latitude rings)
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.15)';
      ctx.lineWidth = 1;

      // Equator
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radius, radius * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();

      // South Pole Arctic Circle
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY + radius * 0.72, radius * 0.62, radius * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();

      // 4. Dynamic Solar Terminator Shadow (Driven by launch slip offset)
      const terminatorX = centerX + (sunIlluminationOffset * 4.5);
      const shadowGrad = ctx.createLinearGradient(terminatorX - radius, centerY, terminatorX + radius, centerY);
      shadowGrad.addColorStop(0, 'rgba(3, 7, 18, 0)');
      shadowGrad.addColorStop(0.55, 'rgba(3, 7, 18, 0.65)');
      shadowGrad.addColorStop(0.85, 'rgba(3, 7, 18, 0.95)');
      shadowGrad.addColorStop(1, 'rgba(3, 7, 18, 0.98)');
      ctx.fillStyle = shadowGrad;
      ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

      ctx.restore();

      // 5. Draw Candidate Site Markers (Projected onto 2.5D Sphere)
      sites.forEach(site => {
        // Map latitude (-90 to +90) and longitude to circular projection coordinates
        const latRad = (site.coordinates.latitude * Math.PI) / 180;
        const lonRad = ((site.coordinates.longitude - 20) * Math.PI) / 180;

        // Polar vs Equatorial projection handling
        const px = centerX + Math.cos(latRad) * Math.sin(lonRad) * (radius * 0.85);
        const py = centerY - Math.sin(latRad) * (radius * 0.85);

        const isSelected = site.id === selectedSite.id;

        // Pin Color based on risk
        let pinColor = '#10B981'; // Green
        if (site.terrain.slope_deg > 15 || !site.defaultEarthLos || site.defaultIlluminationPct < 30) {
          pinColor = '#EF4444'; // Red
        } else if (site.terrain.slope_deg >= 5 || site.defaultIlluminationPct < 70) {
          pinColor = '#F59E0B'; // Yellow
        }

        // Selection Pulse Ring
        if (isSelected) {
          ctx.strokeStyle = pinColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 11 + Math.sin(Date.now() * 0.006) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Pin Glow
        ctx.fillStyle = pinColor;
        ctx.shadowColor = pinColor;
        ctx.shadowBlur = isSelected ? 15 : 6;
        ctx.beginPath();
        ctx.arc(px, py, isSelected ? 6.5 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset

        // Label for Selected Site
        if (isSelected) {
          ctx.font = '11px monospace';
          ctx.fillStyle = '#F8FAFC';
          ctx.fillText(site.name, px + 12, py + 4);
        }
      });

      rotation += 0.001;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [sites, selectedSite, sunIlluminationOffset]);

  // Click detection on markers
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) * 0.78;

    sites.forEach(site => {
      const latRad = (site.coordinates.latitude * Math.PI) / 180;
      const lonRad = ((site.coordinates.longitude - 20) * Math.PI) / 180;
      const px = centerX + Math.cos(latRad) * Math.sin(lonRad) * (radius * 0.85);
      const py = centerY - Math.sin(latRad) * (radius * 0.85);

      const dist = Math.hypot(clickX - px, clickY - py);
      if (dist < 18) {
        onSelectSite(site);
      }
    });
  };

  return (
    <div className="relative w-full aspect-square max-h-[380px] flex items-center justify-center bg-space-950/80 rounded-xl border border-slate-800/80 p-2 overflow-hidden shadow-inner">
      <div className="absolute top-3 left-3 text-[10px] font-mono text-cyan-400 bg-space-900/90 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
        INTERACTIVE LUNAR ORBITAL PROJECTION (LOLA)
      </div>

      <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-400 bg-space-900/80 px-2 py-0.5 rounded border border-slate-800">
        Click pins to inspect landing site
      </div>

      <canvas
        ref={canvasRef}
        width={420}
        height={420}
        onClick={handleCanvasClick}
        className="cursor-pointer max-w-full max-h-full"
      />
    </div>
  );
};

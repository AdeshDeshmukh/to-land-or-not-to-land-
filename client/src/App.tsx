import { useState } from 'react';
import { CANDIDATE_SITES } from './data/candidateSites';
import { assessLandingSiteRisk } from './engine/riskEngine';
import {
  computeSiteIllumination,
  computeSiteEarthLos,
  estimateLunarTerrain,
  findBestSunWindowOffset,
  formatMissionUtc,
  parseMissionUtcInputs,
} from './utils/lunarTelemetry';
import { CandidateSite, LanderProfile } from './types';
import { LunarGlobe3D } from './components/LunarGlobe3D';
import { LandingParametersPanel, DEFAULT_MISSION_PARAMETERS } from './components/LandingParametersPanel';
import { LocalHorizonSkyView } from './components/LocalHorizonSkyView';
import { HorizonPlot } from './components/HorizonPlot';
import { ElevationProfile } from './components/ElevationProfile';
import { CountdownTimers, computeSiteSurvivalMetrics } from './components/CountdownTimers';
import { Starfield } from './components/Starfield';
import { DataAttribution } from './components/DataAttribution';
import { PlainEnglishSummary } from './components/PlainEnglishSummary';
import { Term, GlossaryKey, ViewMode, ViewModeContext } from './components/Glossary';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  GraduationCap,
  Plus,
  Radio,
  ShieldCheck,
  Sliders,
  Sun,
  X,
  XCircle,
} from 'lucide-react';

// Maps engine factor names to glossary terms
const FACTOR_TERM: Record<string, GlossaryKey> = {
  'Terrain Slope': 'slope',
  'Surface Roughness': 'roughness',
  'Solar Illumination': 'illumination',
  'Earth Line-of-Sight (LOS)': 'los',
};

export default function App() {
  const [allSites, setAllSites] = useState<CandidateSite[]>(CANDIDATE_SITES);
  const [landingParams, setLandingParams] = useState<LanderProfile>(DEFAULT_MISSION_PARAMETERS);
  const [selectedSite, setSelectedSite] = useState<CandidateSite>(CANDIDATE_SITES[0]);
  const [missionEpochOffset, setMissionEpochOffset] = useState<number>(0);
  const [simulatedDateOffset, setSimulatedDateOffset] = useState<number>(0);
  const [customLatInput, setCustomLatInput] = useState<string>(
    CANDIDATE_SITES[0].coordinates.latitude.toFixed(2)
  );
  const [customLonInput, setCustomLonInput] = useState<string>(
    CANDIDATE_SITES[0].coordinates.longitude.toFixed(2)
  );
  const [customNameInput, setCustomNameInput] = useState<string>('');
  const [customCoordError, setCustomCoordError] = useState<string>('');

  const nominalUtc = formatMissionUtc(missionEpochOffset);
  const missionUtc = formatMissionUtc(simulatedDateOffset);

  const handleSetMissionEpoch = (nextEpochOffset: number) => {
    const rounded = Number(nextEpochOffset.toFixed(4));
    setMissionEpochOffset(rounded);
    setSimulatedDateOffset(rounded);
  };

  const handleDeployCustomCoordinates = (
    lat: number,
    lon: number,
    customName?: string,
    sampledSlopeDeg?: number,
    sampledElevM?: number,
    options?: { openDrawer?: boolean }
  ) => {
    const newSite = estimateLunarTerrain(
      Number(lat.toFixed(2)),
      Number(lon.toFixed(2)),
      customName,
      sampledSlopeDeg,
      sampledElevM
    );
    setAllSites((prev) => {
      const presets = prev.slice(0, CANDIDATE_SITES.length);
      const custom = prev.slice(CANDIDATE_SITES.length);
      if (newSite.id === 'custom_surface_target') {
        const namedOnly = custom.filter((s) => s.id !== 'custom_surface_target').slice(-4);
        return [...presets, ...namedOnly, newSite];
      }
      return [...presets, ...custom.slice(-5), newSite];
    });
    setSelectedSite(newSite);
    setCustomLatInput(newSite.coordinates.latitude.toFixed(2));
    setCustomLonInput(newSite.coordinates.longitude.toFixed(2));
    setCustomNameInput('');
    setCustomCoordError('');
    if (options?.openDrawer) {
      setIsRightDrawerOpen(true);
    }
  };

  const handleSubmitDrawerCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(customLatInput);
    const lon = Number(customLonInput);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCustomCoordError('Latitude must be between -90° and +90°.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCustomCoordError('Longitude must be between -180° and +180°.');
      return;
    }
    handleDeployCustomCoordinates(
      lat,
      lon,
      customNameInput.trim() || undefined,
      undefined,
      undefined,
      { openDrawer: false }
    );
  };

  // Left & Right drawer toggles for clean, centered map experience
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState<boolean>(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('planner');
  const [compareSites, setCompareSites] = useState<CandidateSite[]>([]);
  const [assessmentDrawerMode, setAssessmentDrawerMode] = useState<'SINGLE' | 'COMPARE'>('SINGLE');

  const getCompareSiteKey = (site: CandidateSite): string =>
    site.id === 'custom_surface_target'
      ? `custom_${site.coordinates.latitude.toFixed(2)}_${site.coordinates.longitude.toFixed(2)}`
      : site.id;

  const isSiteInCompare = (site: CandidateSite): boolean => {
    const key = getCompareSiteKey(site);
    return compareSites.some((s) => s.id === key || s.id === site.id);
  };

  const handleToggleCompareSite = (site: CandidateSite) => {
    const key = getCompareSiteKey(site);
    setCompareSites((prev) => {
      const exists = prev.some((s) => s.id === key || s.id === site.id);
      if (exists) {
        return prev.filter((s) => s.id !== key && s.id !== site.id);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, { ...site, id: key }];
    });
  };

  const compareSiteIdsForGlobe = allSites
    .filter((s) => isSiteInCompare(s))
    .map((s) => s.id);

  const computedIllumination = computeSiteIllumination(selectedSite, simulatedDateOffset);
  const computedEarthLos = computeSiteEarthLos(selectedSite, simulatedDateOffset);
  const survivalMetrics = computeSiteSurvivalMetrics(
    selectedSite,
    simulatedDateOffset,
    computedIllumination,
    landingParams
  );
  const solarTelemetry = survivalMetrics.currentSolar;
  const earthTelemetry = survivalMetrics.currentEarth;

  const assessment = assessLandingSiteRisk(
    selectedSite,
    computedIllumination,
    computedEarthLos,
    landingParams
  );

  const sliderOffsetDays = Number((simulatedDateOffset - missionEpochOffset).toFixed(2));
  const clampedSliderOffsetDays = Math.max(-14, Math.min(14, sliderOffsetDays));
  const timeSliderPct = Math.max(0, Math.min(100, ((clampedSliderOffsetDays + 14) / 28) * 100));

  const getStatusBadge = (status: 'GREEN' | 'YELLOW' | 'RED') => {
    switch (status) {
      case 'GREEN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] font-mono text-[10px] uppercase tracking-wider font-semibold bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/40">
            <ShieldCheck className="w-3 h-3 text-[#10B981]" /> GO
          </span>
        );
      case 'YELLOW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] font-mono text-[10px] uppercase tracking-wider font-semibold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/40">
            <AlertTriangle className="w-3 h-3 text-[#F59E0B]" /> CAUTION
          </span>
        );
      case 'RED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] font-mono text-[10px] uppercase tracking-wider font-semibold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/40">
            <XCircle className="w-3 h-3 text-[#EF4444]" /> NO-GO
          </span>
        );
    }
  };

  return (
    <ViewModeContext.Provider value={viewMode}>
      <div
        className="fixed inset-0 w-full h-full bg-black text-white flex flex-col font-sans overflow-hidden select-none"
        style={{ overflow: 'clip' }}
      >
        {/* Background Monochrome Starfield */}
        <Starfield />

        {/* Centralized Obsidian Header with Directional Drawers & PLANNER | EDUCATOR Toggle */}
        <header className="border-b border-white/[0.14] bg-[#090A0D]/95 backdrop-blur-md px-4 sm:px-5 py-2 flex items-center justify-between gap-2 relative z-40 shrink-0">
          {/* Left Drawer Trigger */}
          <button
            type="button"
            data-testid="left-drawer-toggle-btn"
            onClick={() => setIsLeftDrawerOpen((prev) => !prev)}
            aria-expanded={isLeftDrawerOpen}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[2px] font-mono text-[11px] uppercase tracking-wider font-semibold border transition-all ${isLeftDrawerOpen
              ? 'bg-white text-black border-white'
              : 'bg-black text-[#D1D5DB] border-white/[0.18] hover:border-white/45 hover:text-white'
              }`}
            title="Open or collapse Target Coordinates, Landing Time & Safety Parameters"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Inputs &amp; Parameters</span>
            <span className="sm:hidden">Inputs</span>
            {isLeftDrawerOpen ? (
              <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            )}
          </button>

          {/* Centralized Header Title */}
          <div className="text-center px-2 sm:px-4 min-w-0">
            <h1 className="text-xs sm:text-sm md:text-base font-mono font-bold uppercase tracking-[0.2em] text-white leading-tight truncate">
              To Land or Not to Land
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] leading-tight mt-0.5 hidden md:block">
              Lunar Landing Site Navigator
            </p>
          </div>

          {/* Right Group: PLANNER | EDUCATOR Toggle + Right Drawer Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              data-testid="view-mode-toggle"
              className="flex items-center rounded-[2px] bg-black border border-white/[0.18] p-0.5 font-mono text-[10px] uppercase tracking-wider"
              role="group"
              aria-label="Interface Mode"
            >
              <button
                type="button"
                data-testid="mode-planner-btn"
                onClick={() => setViewMode('planner')}
                aria-pressed={viewMode === 'planner'}
                className={`px-2 py-1 rounded-[2px] transition ${viewMode === 'planner'
                  ? 'bg-white text-black font-bold'
                  : 'text-[#9CA3AF] hover:text-white'
                  }`}
                title="Planner Mode: Technical mission engineering telemetry"
              >
                Planner
              </button>
              <button
                type="button"
                data-testid="mode-educator-btn"
                onClick={() => setViewMode('educator')}
                aria-pressed={viewMode === 'educator'}
                className={`flex items-center gap-1 px-2 py-1 rounded-[2px] transition ${viewMode === 'educator'
                  ? 'bg-sky-300 text-black font-bold'
                  : 'text-[#9CA3AF] hover:text-white'
                  }`}
                title="Educator Mode: Plain-English explanations of slope, solar grazing angle, and Earth LOS"
              >
                <GraduationCap className="w-3 h-3" />
                <span>Educator</span>
              </button>
            </div>

            <button
              type="button"
              data-testid="right-drawer-toggle-btn"
              onClick={() => setIsRightDrawerOpen((prev) => !prev)}
              aria-expanded={isRightDrawerOpen}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[2px] font-mono text-[11px] uppercase tracking-wider font-semibold border transition-all ${isRightDrawerOpen
                ? 'bg-[#12141A] text-white border-white/50'
                : 'bg-black text-[#D1D5DB] border-white/[0.18] hover:border-white/45 hover:text-white'
                }`}
              title="Open or collapse Site Assessment & Side-by-Side Comparison"
            >
              {isRightDrawerOpen ? (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
              )}
              <BarChart3 className="w-3.5 h-3.5 text-white" />
              <span className="hidden sm:inline">Site Assessment</span>
              <span className="sm:hidden">Assessment</span>
              {getStatusBadge(assessment.overall_status)}
            </button>
          </div>
        </header>

        {/* Main Interactive Stage with Full-Viewport 3D Lunar Globe */}
        <div
          className="flex-1 relative w-full h-full overflow-hidden"
          style={{ overflow: 'clip' }}
        >
          {/* Full Viewport 3D Lunar Globe */}
          <div className="absolute inset-0 z-0">
            <LunarGlobe3D
              sites={allSites}
              selectedSite={selectedSite}
              onSelectSite={(site, options) => {
                setSelectedSite(site);
                if (options?.openDrawer) {
                  setIsRightDrawerOpen(true);
                }
              }}
              sunIlluminationOffset={simulatedDateOffset}
              lander={landingParams}
              onProbeCoordinate={handleDeployCustomCoordinates}
              missionEpochOffset={missionEpochOffset}
              onChangeDateOffset={(offset) => setSimulatedDateOffset(offset)}
              onChangeMissionEpoch={handleSetMissionEpoch}
              onOpenTelemetryDrawer={() => setIsRightDrawerOpen(true)}
              leftDrawerOpen={isLeftDrawerOpen}
              rightDrawerOpen={isRightDrawerOpen}
              rightDrawerWide={isRightDrawerOpen && assessmentDrawerMode === 'COMPARE'}
              compareSiteIds={compareSiteIdsForGlobe}
              onToggleCompareSite={handleToggleCompareSite}
              viewMode={viewMode}
            />
          </div>

          {/* ==================================================================== */}
          {/* LEFT DRAWER: MISSION INPUTS (Coordinates -> Landing Time -> Params)  */}
          {/* ==================================================================== */}
          <aside
            data-testid="left-inputs-drawer"
            className={`absolute top-0 bottom-0 left-0 w-96 max-w-[90vw] z-30 bg-[#090A0D]/95 backdrop-blur-xl border-r border-white/[0.14] p-4 overflow-y-auto space-y-3.5 transition-all duration-300 ease-in-out ${isLeftDrawerOpen ? 'translate-x-0 visible pointer-events-auto' : '-translate-x-full invisible pointer-events-none'
              }`}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-white/[0.14] pb-2.5">
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Inputs &amp; Parameters
                </h2>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setIsLeftDrawerOpen(false);
                }}
                className="p-1 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] border border-white/[0.14] text-[#9CA3AF] hover:text-white transition"
                aria-label="Close Inputs & Parameters drawer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 1. Target Coordinate Entry (Lat / Lon) */}
            <form
              onSubmit={handleSubmitDrawerCoordinates}
              className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-white/[0.1] pb-2">
                <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                  <Crosshair className="w-3.5 h-3.5 text-[#9CA3AF]" /> Target Coordinate Entry
                </h3>
                <span className="text-[9px] font-mono text-[#6B7280] uppercase">DEG (LOLA)</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="drawer-coord-lat" className="block text-[9px] font-mono text-[#9CA3AF] uppercase tracking-wider mb-1">
                    Latitude (-90..90)
                  </label>
                  <input
                    id="drawer-coord-lat"
                    type="number"
                    step="0.01"
                    min={-90}
                    max={90}
                    value={customLatInput}
                    onChange={(e) => setCustomLatInput(e.target.value)}
                    className="w-full px-2 py-1.5 bg-black border border-white/[0.14] rounded-[2px] text-xs font-mono text-white tabular-nums focus:outline-none focus:border-white/50"
                  />
                </div>
                <div>
                  <label htmlFor="drawer-coord-lon" className="block text-[9px] font-mono text-[#9CA3AF] uppercase tracking-wider mb-1">
                    Longitude (-180..180)
                  </label>
                  <input
                    id="drawer-coord-lon"
                    type="number"
                    step="0.01"
                    min={-180}
                    max={180}
                    value={customLonInput}
                    onChange={(e) => setCustomLonInput(e.target.value)}
                    className="w-full px-2 py-1.5 bg-black border border-white/[0.14] rounded-[2px] text-xs font-mono text-white tabular-nums focus:outline-none focus:border-white/50"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="drawer-coord-name" className="block text-[9px] font-mono text-[#9CA3AF] uppercase tracking-wider mb-1">
                  Site Designation (Optional)
                </label>
                <input
                  id="drawer-coord-name"
                  type="text"
                  placeholder="E.G. MALAPERT RIDGE / CABEUS RIM"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  className="w-full px-2 py-1.5 bg-black border border-white/[0.14] rounded-[2px] text-[10px] font-mono text-white uppercase tracking-wider placeholder:text-[#4B5563] focus:outline-none focus:border-white/50"
                />
              </div>

              {customCoordError && (
                <div className="text-[10px] font-mono text-[#EF4444]">
                  {customCoordError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-1.5 rounded-[2px] bg-white text-black hover:bg-neutral-200 font-mono text-[10px] font-bold uppercase tracking-widest transition"
              >
                Evaluate &amp; Deploy Coordinate
              </button>
            </form>

            {/* 2. Target Landing Time (Compact UTC Selector + Best Sun Window + Styled Slider) */}
            <div className="bg-[#090A0D] border border-white/[0.14] rounded-[2px] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/[0.1] pb-2">
                <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-[#9CA3AF]" /> Target Landing Time
                </h3>
                <span
                  data-testid="slider-offset-badge"
                  className="text-[10px] font-mono px-2 py-0.5 rounded-[2px] bg-black text-white border border-white/[0.14] tabular-nums"
                >
                  T {sliderOffsetDays >= 0 ? `+${sliderOffsetDays.toFixed(1)}` : sliderOffsetDays.toFixed(1)}d
                </span>
              </div>

              <div className="bg-black border border-white/[0.14] rounded-[2px] p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-[#9CA3AF]">
                  <span>Mission Epoch UTC</span>
                  <span data-testid="mission-epoch-utc-readout" className="text-white font-semibold tabular-nums">
                    {nominalUtc.fullUtc}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    aria-label="Simulation UTC Date"
                    type="date"
                    value={nominalUtc.dateStr}
                    onChange={(e) => {
                      const nextOffset = parseMissionUtcInputs(e.target.value, nominalUtc.timeStr);
                      if (nextOffset !== null) {
                        handleSetMissionEpoch(nextOffset);
                      }
                    }}
                    className="w-full px-2 py-1 bg-[#090A0D] border border-white/[0.14] rounded-[2px] text-[10px] font-mono text-white tabular-nums [color-scheme:dark] focus:outline-none focus:border-white/50"
                  />
                  <input
                    aria-label="Simulation UTC Time"
                    type="time"
                    value={nominalUtc.timeStr}
                    onChange={(e) => {
                      const nextOffset = parseMissionUtcInputs(nominalUtc.dateStr, e.target.value);
                      if (nextOffset !== null) {
                        handleSetMissionEpoch(nextOffset);
                      }
                    }}
                    className="w-full px-2 py-1 bg-[#090A0D] border border-white/[0.14] rounded-[2px] text-[10px] font-mono text-white tabular-nums [color-scheme:dark] focus:outline-none focus:border-white/50"
                  />
                </div>

                <div className="grid grid-cols-5 gap-1">
                  {[
                    { label: '-1D', delta: -1 },
                    { label: '-6H', delta: -0.25 },
                    { label: 'T0', delta: null as number | null },
                    { label: '+6H', delta: 0.25 },
                    { label: '+1D', delta: 1 },
                  ].map((step) => {
                    const isT0 = step.delta === null && Math.abs(sliderOffsetDays) < 0.02;
                    return (
                      <button
                        key={step.label}
                        type="button"
                        onClick={() => {
                          if (step.delta === null) {
                            if (Math.abs(sliderOffsetDays) >= 0.02) {
                              setSimulatedDateOffset(missionEpochOffset);
                            } else {
                              handleSetMissionEpoch(0);
                            }
                          } else {
                            handleSetMissionEpoch(missionEpochOffset + step.delta);
                          }
                        }}
                        className={`py-1 rounded-[2px] border text-[9px] font-mono uppercase transition ${isT0
                          ? 'bg-white text-black font-bold border-white'
                          : 'bg-[#12141A] hover:bg-white/15 border-white/[0.12] text-[#9CA3AF] hover:text-white'
                          }`}
                      >
                        {step.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-[#9CA3AF]">
                  <span>Target Window UTC</span>
                  <span data-testid="slider-target-utc" className="text-white font-semibold tabular-nums">
                    {missionUtc.fullUtc}
                  </span>
                </div>
                <input
                  aria-label="Target Landing Time Synodic Slider"
                  type="range"
                  min="-14"
                  max="14"
                  step="0.1"
                  value={clampedSliderOffsetDays}
                  onChange={(e) =>
                    setSimulatedDateOffset(Number((missionEpochOffset + Number(e.target.value)).toFixed(4)))
                  }
                  style={{
                    background: `linear-gradient(to right, #38BDF8 0%, #FBBF24 ${timeSliderPct}%, #1F2937 ${timeSliderPct}%, #1F2937 100%)`,
                  }}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-[#6B7280]">
                  <span>-14d</span>
                  <button
                    type="button"
                    data-testid="slider-nominal-label"
                    onClick={() => setSimulatedDateOffset(missionEpochOffset)}
                    className="text-[#D1D5DB] hover:text-white transition tabular-nums"
                    title="Click to reset slider to Nominal Mission Epoch (T-0)"
                  >
                    Nominal ({nominalUtc.dateStr} {nominalUtc.timeStr})
                  </button>
                  <span>+14d</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  data-testid="best-sun-window-btn"
                  onClick={() =>
                    setSimulatedDateOffset(
                      findBestSunWindowOffset(selectedSite, simulatedDateOffset, missionEpochOffset)
                    )
                  }
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[2px] bg-[#12141A] hover:bg-white/15 border border-amber-400/40 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-200 transition"
                  title="Jump to maximum solar elevation across the 28-day synodic cycle around the active Mission Epoch"
                >
                  <Sun className="w-3 h-3 text-amber-300" />
                  <span>Best Sun Window</span>
                </button>

                <div className="text-[9px] font-mono uppercase tracking-wider text-right tabular-nums">
                  <span
                    className={
                      solarTelemetry.isSunlit ? 'text-[#10B981] font-bold' : 'text-[#EF4444] font-bold'
                    }
                  >
                    SUN {solarTelemetry.effectiveSunElevDeg >= 0 ? '+' : ''}
                    {solarTelemetry.effectiveSunElevDeg.toFixed(1)}°
                  </span>
                  <span className="text-[#6B7280] block">
                    {computedEarthLos ? 'DTE LINK OK' : 'NO DIRECT DTE'}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Landing Safety Parameters Panel */}
            <LandingParametersPanel
              parameters={landingParams}
              onChange={setLandingParams}
              currentSiteSlopeDeg={selectedSite.terrain.slope_deg}
              currentSiteIlluminationPct={computedIllumination}
              currentSiteName={selectedSite.name}
            />

            {viewMode === 'educator' && (
              <div
                data-testid="educator-left-callout"
                className="bg-black border border-sky-400/35 rounded-[2px] p-3 space-y-1.5 text-[11px] font-sans text-[#D1D5DB]"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-sky-300">
                  <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                  <span>Why These Inputs Matter</span>
                </div>
                <p className="leading-snug">
                  <strong className="text-white">Max Ground Slope:</strong> Keeps the lander upright at touchdown.
                </p>
                <p className="leading-snug">
                  <strong className="text-white">Min Solar Flux:</strong> Prevents batteries from freezing under low grazing polar sunlight.
                </p>
                <p className="leading-snug">
                  <strong className="text-white">Direct Earth Link:</strong> Controls whether mission telemetry requires direct line-of-sight vs. an orbital relay.
                </p>
              </div>
            )}
          </aside>

          {/* ===================================================================== */}
          {/* RIGHT DRAWER: SITE ASSESSMENT (Single Site & Side-by-Side Compare)    */}
          {/* ===================================================================== */}
          <aside
            data-testid="right-assessment-drawer"
            className={`absolute top-0 bottom-0 right-0 z-30 bg-[#090A0D]/95 backdrop-blur-xl border-l border-white/[0.14] p-4 overflow-y-auto space-y-3.5 transition-all duration-300 ease-in-out ${assessmentDrawerMode === 'COMPARE'
              ? 'w-[740px] 2xl:w-[840px] max-w-[95vw]'
              : 'w-[500px] max-w-[92vw]'
              } ${isRightDrawerOpen ? 'translate-x-0 visible pointer-events-auto' : 'translate-x-full invisible pointer-events-none'
              }`}
          >
            {/* Drawer Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.14] pb-2.5">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Site Assessment
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                {(() => {
                  const inCompare = isSiteInCompare(selectedSite);
                  const queueFull = !inCompare && compareSites.length >= 3;
              return (
                <button
                  type="button"
                  data-testid="add-to-compare-btn"
                  disabled={queueFull}
                  onClick={() => handleToggleCompareSite(selectedSite)}
                  aria-pressed={inCompare}
                  className={`flex items-center gap-1 px-2 py-1 rounded-[2px] border text-[10px] font-mono uppercase tracking-wider font-semibold transition ${inCompare
                    ? 'bg-sky-500/20 border-sky-400/60 text-sky-200 hover:bg-sky-500/30'
                    : queueFull
                      ? 'bg-black/40 border-white/[0.08] text-[#4B5563] cursor-not-allowed'
                      : 'bg-[#12141A] hover:bg-white/15 border-white/25 text-white'
                    }`}
                  title={
                    inCompare
                      ? 'Remove current site from comparison queue'
                      : queueFull
                        ? 'Compare queue full (max 3 sites)'
                        : 'Queue current site for side-by-side comparison (max 3)'
                  }
                >
                  {inCompare ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  <span>{inCompare ? 'In Compare' : queueFull ? 'Queue Full (3/3)' : 'Add to Compare'}</span>
                </button>
              );
            })()}
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                setIsRightDrawerOpen(false);
              }}
              className="p-1 rounded-[2px] bg-[#12141A] hover:bg-[#1C1F26] border border-white/[0.14] text-[#9CA3AF] hover:text-white transition"
              aria-label="Close Site Assessment drawer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Drawer View Mode Switcher: SINGLE SITE | COMPARE (N) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex items-center rounded-[2px] bg-black border border-white/[0.14] p-0.5 font-mono text-[10px] uppercase tracking-wider"
            role="group"
            aria-label="Assessment Drawer Mode"
          >
            <button
              type="button"
              data-testid="drawer-mode-single-btn"
              onClick={() => setAssessmentDrawerMode('SINGLE')}
              aria-pressed={assessmentDrawerMode === 'SINGLE'}
              className={`px-2.5 py-1 rounded-[2px] transition ${assessmentDrawerMode === 'SINGLE'
                ? 'bg-white text-black font-bold'
                : 'text-[#9CA3AF] hover:text-white'
                }`}
            >
              Single Site
            </button>
            <button
              type="button"
              data-testid="drawer-mode-compare-btn"
              onClick={() => {
                if (compareSites.length === 0) {
                  const selectedKey = getCompareSiteKey(selectedSite);
                  const companion =
                    CANDIDATE_SITES.find((s) => s.id !== selectedKey && s.id !== selectedSite.id) ||
                    CANDIDATE_SITES[0];
                  setCompareSites([{ ...selectedSite, id: selectedKey }, companion]);
                }
                setAssessmentDrawerMode('COMPARE');
              }}
              aria-pressed={assessmentDrawerMode === 'COMPARE'}
              className={`px-2.5 py-1 rounded-[2px] transition ${assessmentDrawerMode === 'COMPARE'
                ? 'bg-white text-black font-bold'
                : 'text-[#9CA3AF] hover:text-white'
                }`}
            >
              Compare ({compareSites.length})
            </button>
          </div>

          {assessmentDrawerMode === 'COMPARE' && (
            <div className="flex items-center gap-2 text-[10px] font-mono">
              {compareSites.length < 3 && (
                <select
                  data-testid="compare-quick-add-select"
                  aria-label="Quick add site to comparison"
                  value=""
                  onChange={(e) => {
                    const picked = allSites.find((s) => s.id === e.target.value);
                    if (picked) handleToggleCompareSite(picked);
                  }}
                  className="px-2 py-1 bg-black border border-white/[0.18] rounded-[2px] text-[10px] font-mono text-white focus:outline-none focus:border-white/50"
                >
                  <option value="">+ Add site to compare ({compareSites.length}/3)...</option>
                  {allSites
                    .filter((s) => !isSiteInCompare(s))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({Math.abs(s.coordinates.latitude).toFixed(1)}°
                        {s.coordinates.latitude >= 0 ? 'N' : 'S'})
                      </option>
                    ))}
                </select>
              )}
              {compareSites.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCompareSites([])}
                  className="px-2 py-1 rounded-[2px] bg-[#12141A] hover:bg-white/15 border border-white/[0.14] text-[#9CA3AF] hover:text-white uppercase tracking-wider transition"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {assessmentDrawerMode === 'SINGLE' ? (
          <>
            {/* Top Banner: Site Status Summary */}
            <div className="bg-black border border-white/[0.14] rounded-[2px] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] block">
                    {selectedSite.region} Target
                  </span>
                  <h3 className="text-base font-bold text-white tracking-tight mt-0.5">{selectedSite.name}</h3>
                  <span className="text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                    {Math.abs(selectedSite.coordinates.latitude).toFixed(2)}° {selectedSite.coordinates.latitude >= 0 ? 'N' : 'S'}, {Math.abs(selectedSite.coordinates.longitude).toFixed(2)}° {selectedSite.coordinates.longitude >= 0 ? 'E' : 'W'} · ELEV {selectedSite.coordinates.elevation_m >= 0 ? `+${selectedSite.coordinates.elevation_m}` : selectedSite.coordinates.elevation_m}M
                  </span>
                </div>
                <div className="shrink-0">{getStatusBadge(assessment.overall_status)}</div>
              </div>

              <p className="text-xs text-[#9CA3AF] leading-relaxed border-l-2 border-white/30 pl-2.5">
                {selectedSite.description}
              </p>

              <div className="bg-[#090A0D] rounded-[2px] p-2.5 border border-white/[0.14] text-[11px] font-mono flex items-center gap-2 text-white">
                <Activity className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                <span>{assessment.overall_reason}</span>
              </div>
            </div>

            {/* Educator Mode Plain-English Survival Guide */}
            {viewMode === 'educator' && (
              <PlainEnglishSummary
                site={selectedSite}
                assessment={assessment}
                parameters={landingParams}
                illuminationPct={computedIllumination}
                hasEarthLos={computedEarthLos}
                sunElevDeg={solarTelemetry.effectiveSunElevDeg}
                earthElevDeg={earthTelemetry.effectiveEarthElevDeg}
              />
            )}

            {/* 4-Factor Engineering Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {assessment.factors.map((factor, idx) => {
                const isGreen = factor.level === 'GREEN';
                const isYellow = factor.level === 'YELLOW';
                return (
                  <div
                    key={idx}
                    className="bg-black border border-white/[0.14] rounded-[2px] p-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-[#9CA3AF]">
                          {FACTOR_TERM[factor.name] ? <Term k={FACTOR_TERM[factor.name]}>{factor.name}</Term> : factor.name}
                        </span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-[2px] border font-bold uppercase tracking-wider ${isGreen
                          ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/40'
                          : isYellow
                            ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/40'
                            : 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/40'
                          }`}>
                          {factor.level}
                        </span>
                      </div>
                      <div className="text-sm font-bold font-mono text-white mb-1 tabular-nums">{factor.value}</div>
                    </div>
                    <p className="text-[10px] text-[#6B7280] border-t border-white/[0.14] pt-1.5 leading-tight">
                      {factor.explanation}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Local Lander Horizon & Sky View (Real-time Sun & Earth Azimuth/Elevation) */}
            <LocalHorizonSkyView
              site={selectedSite}
              simulatedDateOffset={simulatedDateOffset}
            />

            {/* 2D Local Horizon & Elevation SkyPlot (Operational Window Chart) */}
            <HorizonPlot
              site={selectedSite}
              simulatedDateOffset={simulatedDateOffset}
            />

            {/* Topographic Elevation Cross-Section Profile (2 km Altimetry Slice) */}
            <ElevationProfile
              site={selectedSite}
            />

            {/* Telemetry Survival & Countdown Timers */}
            <CountdownTimers
              site={selectedSite}
              simulatedDateOffset={simulatedDateOffset}
              computedIllumination={computedIllumination}
              parameters={landingParams}
            />
          </>
        ) : (
          <div data-testid="site-comparison-panel" className="space-y-3">
            {compareSites.length === 0 ? (
              <div className="bg-black border border-white/[0.14] rounded-[2px] p-6 text-center space-y-3">
                <p className="text-xs font-mono text-[#9CA3AF]">
                  No sites queued for comparison. Queue up to 3 Artemis candidate sites or probed coordinates using <span className="text-white">+</span> in the site dropdown or <span className="text-white">+ Add to Compare</span> above.
                </p>
                <button
                  type="button"
                  onClick={() => handleToggleCompareSite(selectedSite)}
                  className="px-3 py-1.5 rounded-[2px] bg-white text-black font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-neutral-200 transition"
                >
                  + Add {selectedSite.name}
                </button>
              </div>
            ) : (
              <div
                data-testid="site-comparison-grid"
                className={`grid gap-3 ${compareSites.length === 1
                  ? 'grid-cols-1'
                  : compareSites.length === 2
                    ? 'grid-cols-1 md:grid-cols-2'
                    : 'grid-cols-1 md:grid-cols-3'
                  }`}
              >
                {compareSites.map((site) => {
                  const siteIllum = computeSiteIllumination(site, simulatedDateOffset);
                  const siteLos = computeSiteEarthLos(site, simulatedDateOffset);
                  const siteRisk = assessLandingSiteRisk(site, siteIllum, siteLos, landingParams);
                  const siteSurvival = computeSiteSurvivalMetrics(
                    site,
                    simulatedDateOffset,
                    siteIllum,
                    landingParams
                  );
                  const slopeFactor = siteRisk.factors[0];
                  const roughFactor = siteRisk.factors[1];
                  const solarFactor = siteRisk.factors[2];
                  const sunElev = siteSurvival.currentSolar.effectiveSunElevDeg;
                  const earthElev = siteSurvival.currentEarth.effectiveEarthElevDeg;

                  const earthTier = !siteLos
                    ? {
                      label: landingParams.requiresEarthLos ? 'NO DIRECT LOS' : 'RELAY NEEDED',
                      cls: landingParams.requiresEarthLos
                        ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/40'
                        : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/40',
                    }
                    : earthElev >= 5.0
                      ? {
                        label: 'CLEAR DTE (>5°)',
                        cls: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/40',
                      }
                      : {
                        label: 'GRAZING LOS (0°–5°)',
                        cls: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/40',
                      };

                  const levelChip = (level: 'GREEN' | 'YELLOW' | 'RED') =>
                    level === 'GREEN'
                      ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/40'
                      : level === 'YELLOW'
                        ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/40'
                        : 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/40';

                  const levelLabel = (level: 'GREEN' | 'YELLOW' | 'RED') =>
                    level === 'GREEN' ? 'GO' : level === 'YELLOW' ? 'CAUTION' : 'NO-GO';

                  return (
                    <div
                      key={site.id}
                      data-testid={`compare-col-${site.id}`}
                      className={`bg-black border rounded-[2px] p-3 flex flex-col justify-between space-y-2.5 ${site.id === getCompareSiteKey(selectedSite) || site.id === selectedSite.id
                        ? 'border-white/50'
                        : 'border-white/[0.14]'
                        }`}
                    >
                      {/* Column Header: Site Name & Coordinates + GO/CAUTION/NO-GO Badge */}
                      <div className="border-b border-white/[0.12] pb-2.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedSite(site)}
                            className="text-left min-w-0 group"
                            title="Focus single-site assessment on this target"
                          >
                            <span className="text-[9px] font-mono uppercase tracking-wider text-[#6B7280] block truncate">
                              {site.region}
                            </span>
                            <span className="text-sm font-bold text-white group-hover:underline block truncate">
                              {site.name}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleCompareSite(site)}
                            aria-label={`Remove ${site.name} from comparison`}
                            className="p-1 rounded-[2px] bg-[#12141A] hover:bg-white/15 border border-white/[0.14] text-[#9CA3AF] hover:text-white shrink-0 transition"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-[10px] font-mono text-[#9CA3AF] tabular-nums">
                          {Math.abs(site.coordinates.latitude).toFixed(2)}°{site.coordinates.latitude >= 0 ? 'N' : 'S'},{' '}
                          {Math.abs(site.coordinates.longitude).toFixed(2)}°{site.coordinates.longitude >= 0 ? 'E' : 'W'} ·{' '}
                          {site.coordinates.elevation_m >= 0 ? `+${site.coordinates.elevation_m}` : site.coordinates.elevation_m}M
                        </div>

                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-[9px] font-mono uppercase tracking-wider text-[#6B7280]">
                            Verdict
                          </span>
                          {getStatusBadge(siteRisk.overall_status)}
                        </div>
                      </div>

                      {/* Live Telemetry Rows */}
                      <div className="space-y-2 text-[10px] font-mono tabular-nums">
                        {/* 1. Terrain Slope */}
                        <div className="bg-[#090A0D] border border-white/[0.10] rounded-[2px] p-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-[#9CA3AF]">
                              <Term k="slope">Terrain Slope</Term>
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-[2px] border text-[8px] font-bold ${levelChip(slopeFactor.level)}`}>
                              {levelLabel(slopeFactor.level)}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-white mt-0.5">
                            {site.terrain.slope_deg.toFixed(1)}°{' '}
                            <span className="text-[9px] font-normal text-[#6B7280]">
                              (limit ≤{landingParams.maxSlopeDeg.toFixed(0)}°)
                            </span>
                          </div>
                        </div>

                        {/* 2. Surface Roughness */}
                        <div className="bg-[#090A0D] border border-white/[0.10] rounded-[2px] p-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-[#9CA3AF]">
                              <Term k="roughness">Roughness</Term>
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-[2px] border text-[8px] font-bold ${levelChip(roughFactor.level)}`}>
                              {levelLabel(roughFactor.level)}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-white mt-0.5">
                            {site.terrain.roughness}{' '}
                            <span className="text-[9px] font-normal text-[#6B7280]">
                              (max {landingParams.maxRoughness})
                            </span>
                          </div>
                        </div>

                        {/* 3. Solar Illumination % & Sun Elevation */}
                        <div className="bg-[#090A0D] border border-white/[0.10] rounded-[2px] p-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                              <Sun className="w-3 h-3 text-amber-300" />
                              <Term k="illumination">Solar Flux</Term>
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-[2px] border text-[8px] font-bold ${levelChip(solarFactor.level)}`}>
                              {levelLabel(solarFactor.level)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2 mt-0.5">
                            <span className="text-xs font-bold text-white">
                              {siteIllum}%{' '}
                              <span className="text-[9px] font-normal text-[#6B7280]">
                                (≥{landingParams.minIlluminationPct}%)
                              </span>
                            </span>
                            <span className={siteSurvival.isSunlit ? 'text-amber-300 text-[10px] font-semibold' : 'text-[#EF4444] text-[10px] font-semibold'}>
                              {sunElev >= 0 ? '+' : ''}
                              {sunElev.toFixed(1)}° EL
                            </span>
                          </div>
                        </div>

                        {/* 4. Earth LOS Status & Earth Elevation (preserving 0°–5° Grazing LOS yellow tier) */}
                        <div className="bg-[#090A0D] border border-white/[0.10] rounded-[2px] p-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                              <Radio className="w-3 h-3 text-sky-300" />
                              <Term k="los">Earth LOS</Term>
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-[2px] border text-[8px] font-bold ${earthTier.cls}`}>
                              {earthTier.label}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2 mt-0.5">
                            <span className="text-xs font-bold text-white">
                              EARTH {earthElev >= 0 ? '+' : ''}
                              {earthElev.toFixed(1)}°
                            </span>
                            <span className="text-[9px] text-[#6B7280]">
                              {earthElev >= 5 ? 'Above 5° zone' : earthElev >= 0 && siteLos ? '0°–5° grazing band' : 'Blocked'}
                            </span>
                          </div>
                        </div>

                        {/* 5. Time to Sunset / Clear DTE Window */}
                        <div className="bg-[#090A0D] border border-white/[0.10] rounded-[2px] p-2 space-y-1">
                          <div className="text-[9px] uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                            <Clock className="w-3 h-3 text-white" />
                            <span>Operational Windows</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-[#9CA3AF]">
                              {siteSurvival.isSunlit ? 'Time to Sunset' : 'Shadow Elapsed'}
                            </span>
                            <span className={`font-bold ${siteSurvival.isSunlit ? 'text-white' : 'text-[#EF4444]'}`}>
                              {siteSurvival.isSunlit
                                ? `${siteSurvival.hoursUntilSunset}h (${(siteSurvival.hoursUntilSunset / 24).toFixed(1)}d)`
                                : `${siteSurvival.shadowDurationHours}h (Sun +${siteSurvival.hoursUntilSunrise}h)`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-[#9CA3AF]">Clear DTE Window</span>
                            <span className={`font-bold ${siteSurvival.isCommsLocked ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                              {siteSurvival.isCommsLocked
                                ? siteSurvival.commsRemainingHours >= 480
                                  ? 'Continuous'
                                  : `${siteSurvival.commsRemainingHours} hrs`
                                : '0 hrs (Occluded)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSite(site);
                          setAssessmentDrawerMode('SINGLE');
                        }}
                        className="w-full py-1.5 rounded-[2px] bg-[#12141A] hover:bg-white/15 border border-white/[0.16] text-[10px] font-mono font-bold uppercase tracking-wider text-white transition"
                      >
                        Open Full Site View
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode === 'educator' && compareSites.length > 0 && (
              <div
                data-testid="educator-compare-callout"
                className="bg-black border border-sky-400/35 rounded-[2px] p-3 text-[11px] font-sans text-[#D1D5DB] space-y-1"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-sky-300">
                  <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                  <span>Educator Mode · Comparing Survival Trade-offs</span>
                </div>
                <p className="leading-snug">
                  Look for low <strong className="text-white">Terrain Slope</strong> (avoids lander tip-over), high <strong className="text-white">Solar Flux</strong> &amp; long <strong className="text-white">Time to Sunset</strong> (solar panels stay charged under grazing polar sunlight), and <strong className="text-white">CLEAR DTE (&gt;5°)</strong> over yellow <strong className="text-amber-300">0°–5° GRAZING LOS</strong> so Earth radio stays uninterrupted.
                </p>
              </div>
            )}
          </div>
        )}
      </aside>

    </div>

              {/* Footer: authoritative data attribution */ }
  <footer className="relative z-40 shrink-0 border-t border-white/[0.14] bg-[#090A0D]/95 backdrop-blur-md px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
    <DataAttribution />

    <span className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] hidden md:inline">
      Click anywhere on Moon to probe coordinates · Hover <span className="text-white">i</span> for Artemis &amp; RYG scoring info
    </span>
  </footer>
            </div >
          </ViewModeContext.Provider >
          );
}

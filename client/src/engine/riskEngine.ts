import { RiskLevel, RiskFactor, RiskAssessment, CandidateSite, LanderProfile } from '../types';

export const RISK_THRESHOLDS = {
  slope: {
    greenMax: 5.0,   // deg
    yellowMax: 15.0, // deg
  },
  illumination: {
    greenMin: 70, // percent
    yellowMin: 30, // percent
  }
};

export function evaluateSlope(slopeDeg: number, lander?: LanderProfile): RiskFactor {
  let level: RiskLevel = 'GREEN';
  const maxLimit = lander ? lander.maxSlopeDeg : RISK_THRESHOLDS.slope.yellowMax;
  const cautionThreshold = lander ? lander.maxSlopeDeg * 0.75 : RISK_THRESHOLDS.slope.greenMax;

  let explanation = lander
    ? `Safe: ${slopeDeg.toFixed(1)}° is well within ${lander.name} structural limit (<${maxLimit}°).`
    : `Safe: ${slopeDeg.toFixed(1)}° is well within landing gear tilt limits (<5°).`;

  if (slopeDeg > maxLimit) {
    level = 'RED';
    explanation = lander
      ? `Hazard: ${slopeDeg.toFixed(1)}° exceeds ${lander.name} maximum certified slope limit (${maxLimit}°). Severe tip-over risk.`
      : `Hazard: ${slopeDeg.toFixed(1)}° exceeds safe tilt margin (>15°), severe tip-over risk.`;
  } else if (slopeDeg >= cautionThreshold) {
    level = 'YELLOW';
    explanation = lander
      ? `Caution: ${slopeDeg.toFixed(1)}° approaches ${lander.name} operational limit (${maxLimit}°). Requires precision landing.`
      : `Caution: ${slopeDeg.toFixed(1)}° requires precise touchdown terrain clearance.`;
  }

  return {
    name: 'Terrain Slope',
    value: `${slopeDeg.toFixed(1)}°`,
    level,
    explanation,
  };
}

export function evaluateRoughness(
  roughness: 'LOW' | 'MODERATE' | 'HIGH', 
  detail: string,
  lander?: LanderProfile
): RiskFactor {
  let level: RiskLevel = 'GREEN';

  if (lander) {
    if (roughness === 'HIGH') {
      level = lander.maxRoughness === 'HIGH' ? 'YELLOW' : 'RED';
    } else if (roughness === 'MODERATE') {
      level = lander.maxRoughness === 'LOW' ? 'YELLOW' : 'GREEN';
    }
  } else {
    if (roughness === 'HIGH') level = 'RED';
    else if (roughness === 'MODERATE') level = 'YELLOW';
  }

  return {
    name: 'Surface Roughness',
    value: roughness,
    level,
    explanation: detail,
  };
}

export function evaluateIllumination(illuminationPct: number, lander?: LanderProfile): RiskFactor {
  let level: RiskLevel = 'GREEN';
  const minRequired = lander ? lander.minIlluminationPct : RISK_THRESHOLDS.illumination.greenMin;
  const criticalMin = lander ? lander.minIlluminationPct * 0.5 : RISK_THRESHOLDS.illumination.yellowMin;

  let explanation = `High solar illumination (${illuminationPct}%), sufficient for power generation.`;

  if (illuminationPct < criticalMin) {
    level = 'RED';
    explanation = lander
      ? `Critical shadow (${illuminationPct}%). Below ${lander.name} minimum survivable thermal/power limit (${minRequired}%).`
      : `Critical shadow (${illuminationPct}% sunlight). High risk of battery drain and cryogenic freeze.`;
  } else if (illuminationPct < minRequired) {
    level = 'YELLOW';
    explanation = lander
      ? `Marginal solar power (${illuminationPct}%). Requires active energy conservation for ${lander.name}.`
      : `Moderate sunlight (${illuminationPct}%). Requires power budgeting between cycles.`;
  }

  return {
    name: 'Solar Illumination',
    value: `${illuminationPct}%`,
    level,
    explanation,
  };
}

export function evaluateEarthLos(hasLos: boolean, lander?: LanderProfile): RiskFactor {
  const requiresLos = lander ? lander.requiresEarthLos : true;

  let level: RiskLevel = hasLos ? 'GREEN' : (requiresLos ? 'RED' : 'YELLOW');
  let explanation = hasLos
    ? 'Unobstructed direct line-of-sight communication link to NASA Deep Space Network.'
    : (requiresLos 
        ? `Critical: Direct comms link blocked by topography. Continuous Earth LOS mandatory for ${lander ? lander.name : 'crewed lander'}.`
        : `Notice: Direct Earth LOS blocked. Autonomous vehicle can buffer telemetry and utilize lunar relay satellites.`);

  return {
    name: 'Earth Line-of-Sight (LOS)',
    value: hasLos ? 'Direct LOS Available' : 'No Direct LOS (Relay Required)',
    level,
    explanation,
  };
}

export function assessLandingSiteRisk(
  site: CandidateSite, 
  currentIllumination?: number, 
  hasLos?: boolean,
  lander?: LanderProfile
): RiskAssessment {
  const illPct = currentIllumination !== undefined ? currentIllumination : site.defaultIlluminationPct;
  const los = hasLos !== undefined ? hasLos : site.defaultEarthLos;

  const slopeFactor = evaluateSlope(site.terrain.slope_deg, lander);
  const roughnessFactor = evaluateRoughness(site.terrain.roughness, site.terrain.roughness_detail, lander);
  const illuminationFactor = evaluateIllumination(illPct, lander);
  const losFactor = evaluateEarthLos(los, lander);

  const factors = [slopeFactor, roughnessFactor, illuminationFactor, losFactor];

  const hasRed = factors.some(f => f.level === 'RED');
  const hasYellow = factors.some(f => f.level === 'YELLOW');

  let overall_status: RiskLevel = 'GREEN';
  let overall_reason = lander
    ? `GO: Candidate site meets all certified flight tolerances for ${lander.name}.`
    : 'GO: All evaluated terrain and communication factors fall within safe landing margins.';

  if (hasRed) {
    const redFactor = factors.find(f => f.level === 'RED');
    overall_status = 'RED';
    overall_reason = `NO-GO: ${redFactor?.name} exceeds allowable mission thresholds for ${lander ? lander.name : 'mission profile'}.`;
  } else if (hasYellow) {
    const yellowFactor = factors.find(f => f.level === 'YELLOW');
    overall_status = 'YELLOW';
    overall_reason = `CAUTION: ${yellowFactor?.name} requires operational mitigation or precision guidance.`;
  }

  return {
    site_id: site.id,
    overall_status,
    overall_reason,
    factors,
  };
}

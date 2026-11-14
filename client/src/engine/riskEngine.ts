import { RiskLevel, RiskFactor, RiskAssessment, CandidateSite } from '../types';

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

export function evaluateSlope(slopeDeg: number): RiskFactor {
  let level: RiskLevel = 'GREEN';
  let explanation = `Safe: ${slopeDeg.toFixed(1)}° is well within lander tilt limits (<5°).`;

  if (slopeDeg > RISK_THRESHOLDS.slope.yellowMax) {
    level = 'RED';
    explanation = `Hazard: ${slopeDeg.toFixed(1)}° exceeds safe tilt margin (>15°), severe tip-over risk.`;
  } else if (slopeDeg >= RISK_THRESHOLDS.slope.greenMax) {
    level = 'YELLOW';
    explanation = `Caution: ${slopeDeg.toFixed(1)}° requires precise touchdown terrain clearance.`;
  }

  return {
    name: 'Terrain Slope',
    value: `${slopeDeg.toFixed(1)}°`,
    level,
    explanation,
  };
}

export function evaluateRoughness(roughness: 'LOW' | 'MODERATE' | 'HIGH', detail: string): RiskFactor {
  let level: RiskLevel = 'GREEN';
  if (roughness === 'HIGH') level = 'RED';
  else if (roughness === 'MODERATE') level = 'YELLOW';

  return {
    name: 'Surface Roughness',
    value: roughness,
    level,
    explanation: detail,
  };
}

export function evaluateIllumination(illuminationPct: number): RiskFactor {
  let level: RiskLevel = 'GREEN';
  let explanation = `High solar illumination (${illuminationPct}%), sufficient for mission power.`;

  if (illuminationPct < RISK_THRESHOLDS.illumination.yellowMin) {
    level = 'RED';
    explanation = `Critical shadow (${illuminationPct}% sunlight). High risk of battery drain and freeze.`;
  } else if (illuminationPct < RISK_THRESHOLDS.illumination.greenMin) {
    level = 'YELLOW';
    explanation = `Moderate sunlight (${illuminationPct}%). Requires power budgeting between cycles.`;
  }

  return {
    name: 'Solar Illumination',
    value: `${illuminationPct}%`,
    level,
    explanation,
  };
}

export function evaluateEarthLos(hasLos: boolean): RiskFactor {
  return {
    name: 'Earth Line-of-Sight (LOS)',
    value: hasLos ? 'Direct LOS Available' : 'No Direct LOS (Relay Required)',
    level: hasLos ? 'GREEN' : 'RED',
    explanation: hasLos 
      ? 'Unobstructed communication link to NASA Deep Space Network.' 
      : 'Earth blocked by lunar topography. Direct transmission impossible without relay.',
  };
}

export function assessLandingSiteRisk(site: CandidateSite, currentIllumination?: number, hasLos?: boolean): RiskAssessment {
  const illPct = currentIllumination !== undefined ? currentIllumination : site.defaultIlluminationPct;
  const los = hasLos !== undefined ? hasLos : site.defaultEarthLos;

  const slopeFactor = evaluateSlope(site.terrain.slope_deg);
  const roughnessFactor = evaluateRoughness(site.terrain.roughness, site.terrain.roughness_detail);
  const illuminationFactor = evaluateIllumination(illPct);
  const losFactor = evaluateEarthLos(los);

  const factors = [slopeFactor, roughnessFactor, illuminationFactor, losFactor];

  const hasRed = factors.some(f => f.level === 'RED');
  const hasYellow = factors.some(f => f.level === 'YELLOW');

  let overall_status: RiskLevel = 'GREEN';
  let overall_reason = 'GO: All evaluated terrain and communication factors fall within safe landing margins.';

  if (hasRed) {
    const redFactor = factors.find(f => f.level === 'RED');
    overall_status = 'RED';
    overall_reason = `NO-GO: ${redFactor?.name} exceeds allowable mission thresholds.`;
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


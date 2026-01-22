/**
 * Multi-Agent Risk Analysis System
 * Index file exporting all risk signal agents
 */

export { calculate as calculateChurn } from './churnAgent.js';
export { calculate as calculateCoverageGap } from './coverageGapAgent.js';
export { calculate as calculateIncidentHotspot } from './incidentHotspotAgent.js';
export { calculate as calculateFlakeProximity } from './flakeProximityAgent.js';
export { calculate as calculateDiffRisk } from './diffRiskAgent.js';
export { calculate as calculateTimePressure } from './timePressureAgent.js';

// Default export with all agents
import churnAgent from './churnAgent.js';
import coverageGapAgent from './coverageGapAgent.js';
import incidentHotspotAgent from './incidentHotspotAgent.js';
import flakeProximityAgent from './flakeProximityAgent.js';
import diffRiskAgent from './diffRiskAgent.js';
import timePressureAgent from './timePressureAgent.js';

export const agents = {
  churn: churnAgent,
  coverage_gap: coverageGapAgent,
  incident_hotspot: incidentHotspotAgent,
  flake_proximity: flakeProximityAgent,
  diff_risk: diffRiskAgent,
  time_pressure: timePressureAgent
};

export default agents;

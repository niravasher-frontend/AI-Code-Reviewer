/**
 * Incident Hotspot Agent
 * Signal 3: Checks if changed files have been involved in past incidents
 * Files with history of incidents = higher risk
 */

import { RISK_CONFIG } from '../riskConfig.js';

/**
 * Calculate incident hotspot score for changed files
 * @param {Array} files - Changed files in the PR
 * @param {Array} incidentHistory - Historical incident data
 * @returns {Object} Signal result with score, citations, and explanation
 */
export function calculate(files, incidentHistory = []) {
  const config = RISK_CONFIG.signals.incident_hotspot;
  const citations = [];
  let hotspotCount = 0;

  for (const file of files) {
    // Find incidents related to this file
    const relatedIncidents = incidentHistory.filter(incident =>
      incident.files?.includes(file.filename) &&
      isWithinDays(incident.date, config.lookbackDays)
    );

    if (relatedIncidents.length > 0) {
      const isHotspot = relatedIncidents.length >= config.hotspotThreshold;
      if (isHotspot) hotspotCount++;

      citations.push({
        file: file.filename,
        incidents: relatedIncidents.length,
        hotspot: isHotspot,
        recentIncidents: relatedIncidents.slice(0, 3).map(i => ({
          id: i.id,
          severity: i.severity,
          date: i.date
        }))
      });
    }
  }

  // Score based on hotspot ratio
  const score = files.length > 0 ? Math.min(hotspotCount / files.length, 1.0) : 0;

  return {
    signal: 'incident_hotspot',
    score: round(score),
    raw: { hotspotCount, totalFiles: files.length },
    citations,
    explanation: hotspotCount > 0
      ? `${hotspotCount} file(s) are incident hotspots with recent production issues`
      : 'No incident hotspots detected in changed files'
  };
}

// Utility functions
function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = (now - date) / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}

function round(num, decimals = 3) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export default { calculate };

/**
 * Coverage Gap Agent
 * Signal 2: Analyzes test coverage gaps in changed files
 * Low coverage in critical files = higher risk
 */

import { RISK_CONFIG } from '../riskConfig.js';

/**
 * Calculate coverage gap score for changed files
 * @param {Array} files - Changed files in the PR
 * @param {Object} coverageData - Coverage data by filename
 * @returns {Object} Signal result with score, citations, and explanation
 */
export function calculate(files, coverageData = {}) {
  const config = RISK_CONFIG.signals.coverage_gap;
  const citations = [];
  let uncoveredFiles = 0;
  let criticalUncovered = 0;

  for (const file of files) {
    const coverage = coverageData[file.filename] ?? null;
    const isCritical = config.criticalFilePatterns.some(p => 
      file.filename.toLowerCase().includes(p)
    );

    if (coverage === null) {
      uncoveredFiles++;
      citations.push({
        file: file.filename,
        coverage: 'unknown',
        critical: isCritical,
        note: 'No coverage data available'
      });
      if (isCritical) criticalUncovered++;
    } else if (coverage < config.minCoverageThreshold) {
      uncoveredFiles++;
      citations.push({
        file: file.filename,
        coverage: `${(coverage * 100).toFixed(1)}%`,
        critical: isCritical,
        note: `Below ${config.minCoverageThreshold * 100}% threshold`
      });
      if (isCritical) criticalUncovered++;
    }
  }

  // Score based on uncovered ratio + critical file penalty
  const uncoveredRatio = files.length > 0 ? uncoveredFiles / files.length : 0;
  const criticalPenalty = criticalUncovered * 0.2;
  const score = Math.min(uncoveredRatio + criticalPenalty, 1.0);

  return {
    signal: 'coverage_gap',
    score: round(score),
    raw: { uncoveredFiles, criticalUncovered, totalFiles: files.length },
    citations,
    explanation: uncoveredFiles > 0
      ? `${uncoveredFiles}/${files.length} files lack adequate coverage${criticalUncovered > 0 ? ` (${criticalUncovered} critical)` : ''}`
      : 'All files have adequate test coverage'
  };
}

function round(num, decimals = 3) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export default { calculate };

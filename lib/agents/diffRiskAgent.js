/**
 * Diff Risk Agent
 * Signal 5: Analyzes the nature of the diff itself for risk indicators
 * Large diffs, critical patterns, dangerous code = higher risk
 */

import { RISK_CONFIG } from '../riskConfig.js';

/**
 * Calculate diff risk score for the PR
 * @param {Array} files - Changed files in the PR with patches
 * @param {Object} pullRequest - PR metadata
 * @returns {Object} Signal result with score, citations, and explanation
 */
export function calculate(files, pullRequest = {}) {
  const config = RISK_CONFIG.signals.diff_risk;
  const citations = [];
  let riskFactors = 0;
  let criticalHits = [];
  let dangerousHits = [];

  // Calculate total diff size
  const totalAdditions = files.reduce((sum, f) => sum + (f.additions || 0), 0);
  const totalDeletions = files.reduce((sum, f) => sum + (f.deletions || 0), 0);
  const totalChanges = totalAdditions + totalDeletions;

  // Large diff penalty
  if (totalChanges > config.largeDiffThreshold) {
    riskFactors += 0.3;
    citations.push({
      type: 'large_diff',
      changes: totalChanges,
      threshold: config.largeDiffThreshold,
      note: `Large diff: ${totalChanges} lines changed (threshold: ${config.largeDiffThreshold})`
    });
  }

  // Scan for critical and dangerous patterns in patches
  for (const file of files) {
    const patch = file.patch || '';
    const filename = file.filename.toLowerCase();

    // Critical file patterns
    for (const pattern of config.criticalPatterns) {
      if (filename.includes(pattern) || patch.toLowerCase().includes(pattern)) {
        criticalHits.push({ file: file.filename, pattern });
      }
    }

    // Dangerous code patterns
    for (const pattern of config.dangerousPatterns) {
      if (patch.includes(pattern)) {
        dangerousHits.push({ file: file.filename, pattern });
      }
    }
  }

  if (criticalHits.length > 0) {
    riskFactors += 0.3;
    citations.push({
      type: 'critical_patterns',
      hits: criticalHits.slice(0, 5),
      note: `${criticalHits.length} critical pattern(s) detected`
    });
  }

  if (dangerousHits.length > 0) {
    riskFactors += 0.4;
    citations.push({
      type: 'dangerous_patterns',
      hits: dangerousHits.slice(0, 5),
      note: `${dangerousHits.length} dangerous pattern(s) detected`
    });
  }

  const score = Math.min(riskFactors, 1.0);

  return {
    signal: 'diff_risk',
    score: round(score),
    raw: { 
      totalChanges, 
      totalAdditions, 
      totalDeletions, 
      criticalHits: criticalHits.length, 
      dangerousHits: dangerousHits.length 
    },
    citations,
    explanation: riskFactors > 0
      ? `Diff risk factors: ${totalChanges} lines, ${criticalHits.length} critical, ${dangerousHits.length} dangerous patterns`
      : 'No significant diff risk factors detected'
  };
}

function round(num, decimals = 3) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export default { calculate };

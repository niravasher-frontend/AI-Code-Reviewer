/**
 * Churn Agent
 * Signal 1: Measures how frequently files have been changed recently
 * High churn = higher risk of bugs/instability
 */

import { RISK_CONFIG } from '../riskConfig.js';

/**
 * Calculate churn score for changed files
 * @param {Array} files - Changed files in the PR
 * @param {Array} commitHistory - Recent commit history
 * @returns {Object} Signal result with score, citations, and explanation
 */
export function calculate(files, commitHistory = []) {
  const config = RISK_CONFIG.signals.churn;
  const citations = [];
  let totalChurn = 0;
  let maxChurn = 0;

  for (const file of files) {
    // Count commits affecting this file in lookback period
    const fileCommits = commitHistory.filter(c => 
      c.files?.includes(file.filename) && 
      isWithinDays(c.date, config.lookbackDays)
    ).length;

    if (fileCommits > 0) {
      citations.push({
        file: file.filename,
        commits: fileCommits,
        note: fileCommits >= config.highChurnThreshold ? 'High churn file' : 'Normal churn'
      });
    }

    totalChurn += fileCommits;
    maxChurn = Math.max(maxChurn, fileCommits);
  }

  // Normalize: max churn of highChurnThreshold = 1.0
  const score = Math.min(maxChurn / config.highChurnThreshold, 1.0);

  return {
    signal: 'churn',
    score: round(score),
    raw: { totalChurn, maxChurn, fileCount: files.length },
    citations,
    explanation: maxChurn >= config.highChurnThreshold
      ? `High churn detected: ${maxChurn} changes in ${config.lookbackDays} days`
      : `Normal churn levels: ${maxChurn} changes in ${config.lookbackDays} days`
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

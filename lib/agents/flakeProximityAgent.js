/**
 * Flake Proximity Agent
 * Signal 4: Measures proximity to flaky/unstable tests or code
 * Changes near flaky tests = higher risk
 */

import { RISK_CONFIG } from '../riskConfig.js';

/**
 * Calculate flake proximity score for changed files
 * @param {Array} files - Changed files in the PR
 * @param {Object} flakeData - Flaky test data by filename
 * @returns {Object} Signal result with score, citations, and explanation
 */
export function calculate(files, flakeData = {}) {
  const config = RISK_CONFIG.signals.flake_proximity;
  const citations = [];
  let flakeProximityCount = 0;

  for (const file of files) {
    // Check if file is a test file
    const isTestFile = config.flakePatterns.some(p => 
      file.filename.toLowerCase().includes(p)
    );

    // Check if file has known flaky tests
    const flakeInfo = flakeData[file.filename];
    if (flakeInfo?.isFlaky) {
      flakeProximityCount++;
      citations.push({
        file: file.filename,
        isTestFile,
        flaky: true,
        flakeRate: flakeInfo.flakeRate,
        note: `Flaky test file with ${(flakeInfo.flakeRate * 100).toFixed(1)}% failure rate`
      });
    } else if (flakeInfo?.nearFlaky) {
      flakeProximityCount += 0.5;
      citations.push({
        file: file.filename,
        isTestFile,
        nearFlaky: true,
        note: 'Near flaky test code'
      });
    }
  }

  const score = files.length > 0 ? Math.min(flakeProximityCount / files.length, 1.0) : 0;

  return {
    signal: 'flake_proximity',
    score: round(score),
    raw: { flakeProximityCount, totalFiles: files.length },
    citations,
    explanation: flakeProximityCount > 0
      ? `${Math.ceil(flakeProximityCount)} file(s) near flaky/unstable code`
      : 'No flaky test proximity detected'
  };
}

function round(num, decimals = 3) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export default { calculate };

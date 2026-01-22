/**
 * Signal Calculators for Risk Analysis
 * Each signal returns a normalized score (0-1) with citations
 */

import { RISK_CONFIG } from './riskConfig.js';

/**
 * Signal 1: Churn Score
 * Measures how frequently files have been changed recently
 * High churn = higher risk of bugs/instability
 */
export function calculateChurnSignal(files, commitHistory = []) {
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

/**
 * Signal 2: Coverage Gap Score
 * Analyzes test coverage gaps in changed files
 */
export function calculateCoverageGapSignal(files, coverageData = {}) {
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

/**
 * Signal 3: Incident Hotspot Score
 * Checks if changed files have been involved in past incidents
 */
export function calculateIncidentHotspotSignal(files, incidentHistory = []) {
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

/**
 * Signal 4: Flake Proximity Score
 * Measures proximity to flaky/unstable tests or code
 */
export function calculateFlakeProximitySignal(files, flakeData = {}) {
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

/**
 * Signal 5: Diff Risk Score
 * Analyzes the nature of the diff itself for risk indicators
 */
export function calculateDiffRiskSignal(files, pullRequest = {}) {
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
    raw: { totalChanges, totalAdditions, totalDeletions, criticalHits: criticalHits.length, dangerousHits: dangerousHits.length },
    citations,
    explanation: riskFactors > 0
      ? `Diff risk factors: ${totalChanges} lines, ${criticalHits.length} critical, ${dangerousHits.length} dangerous patterns`
      : 'No significant diff risk factors detected'
  };
}

/**
 * Signal 6: Time Pressure Score
 * Analyzes time-based risk factors
 */
export function calculateTimePressureSignal(pullRequest = {}) {
  const config = RISK_CONFIG.signals.time_pressure;
  const citations = [];
  let timePressure = 0;

  const now = new Date();
  const prCreatedAt = pullRequest.created_at ? new Date(pullRequest.created_at) : now;
  const hour = prCreatedAt.getHours();
  const dayOfWeek = prCreatedAt.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Weekend penalty
  if (isWeekend) {
    timePressure += config.weekendRisk;
    citations.push({
      type: 'weekend',
      day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
      note: 'PR created on weekend - reduced review capacity'
    });
  }

  // Late night penalty
  if (hour >= config.rushHourEnd || hour < 6) {
    timePressure += config.lateNightRisk;
    citations.push({
      type: 'late_night',
      hour,
      note: `PR created at ${hour}:00 - late night changes`
    });
  } else if (hour >= config.rushHourStart) {
    timePressure += 0.2;
    citations.push({
      type: 'rush_hour',
      hour,
      note: `PR created at ${hour}:00 - rush hour`
    });
  }

  // Check if PR title/description suggests urgency
  const urgencyPatterns = ['urgent', 'hotfix', 'asap', 'emergency', 'critical fix'];
  const prText = `${pullRequest.title || ''} ${pullRequest.body || ''}`.toLowerCase();
  
  for (const pattern of urgencyPatterns) {
    if (prText.includes(pattern)) {
      timePressure += 0.3;
      citations.push({
        type: 'urgency_indicator',
        pattern,
        note: `PR contains urgency indicator: "${pattern}"`
      });
      break;
    }
  }

  const score = Math.min(timePressure, 1.0);

  return {
    signal: 'time_pressure',
    score: round(score),
    raw: { hour, dayOfWeek, isWeekend },
    citations,
    explanation: timePressure > 0
      ? `Time pressure factors detected: ${citations.map(c => c.type).join(', ')}`
      : 'No time pressure factors detected'
  };
}

// === Utility Functions ===

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

/**
 * Multi-Agent Risk Analysis Engine
 * Combines all signals into a comprehensive risk score
 * 
 * Formula: R = w1*churn + w2*coverage_gap + w3*incident_hotspot + w4*flake_proximity + w5*diff_risk + w6*time_pressure
 */

import { RISK_CONFIG, getRiskLevel, getRiskEmoji, validateWeights } from './riskConfig.js';
import {
  calculateChurn,
  calculateCoverageGap,
  calculateIncidentHotspot,
  calculateFlakeProximity,
  calculateDiffRisk,
  calculateTimePressure
} from './agents/index.js';

/**
 * Main Risk Analysis Function
 * Runs all signal agents and computes final risk score
 */
export async function analyzeRisk(params) {
  const {
    files,
    pullRequest,
    commitHistory = [],
    coverageData = {},
    incidentHistory = [],
    flakeData = {}
  } = params;

  const startTime = Date.now();
  const traceId = generateTraceId();

  // Validate configuration
  validateWeights();

  // Run all signal agents
  console.log('🔍 Running risk signal agents...');

  const signals = {
    churn: calculateChurn(files, commitHistory),
    coverage_gap: calculateCoverageGap(files, coverageData),
    incident_hotspot: calculateIncidentHotspot(files, incidentHistory),
    flake_proximity: calculateFlakeProximity(files, flakeData),
    diff_risk: calculateDiffRisk(files, pullRequest),
    time_pressure: calculateTimePressure(pullRequest)
  };

  // Calculate weighted risk score
  const weights = RISK_CONFIG.weights;
  const riskScore = 
    weights.churn * signals.churn.score +
    weights.coverage_gap * signals.coverage_gap.score +
    weights.incident_hotspot * signals.incident_hotspot.score +
    weights.flake_proximity * signals.flake_proximity.score +
    weights.diff_risk * signals.diff_risk.score +
    weights.time_pressure * signals.time_pressure.score;

  const riskLevel = getRiskLevel(riskScore);
  const riskEmoji = getRiskEmoji(riskLevel);

  // Generate mitigations based on high-scoring signals
  const mitigations = generateMitigations(signals);

  // Build audit trace
  const auditTrace = {
    traceId,
    timestamp: new Date().toISOString(),
    executionTimeMs: Date.now() - startTime,
    pullRequest: {
      number: pullRequest.number,
      title: pullRequest.title,
      author: pullRequest.user?.login
    },
    filesAnalyzed: files.length,
    formula: 'R = w1*churn + w2*coverage_gap + w3*incident_hotspot + w4*flake_proximity + w5*diff_risk + w6*time_pressure',
    weights: weights,
    signals: Object.fromEntries(
      Object.entries(signals).map(([key, sig]) => [key, {
        score: sig.score,
        explanation: sig.explanation,
        citationCount: sig.citations.length
      }])
    ),
    finalScore: round(riskScore),
    riskLevel,
    mitigationCount: mitigations.length
  };

  console.log(`✅ Risk analysis complete: ${riskEmoji} ${riskLevel} (${round(riskScore)})`);

  return {
    score: round(riskScore),
    level: riskLevel,
    emoji: riskEmoji,
    signals,
    mitigations,
    auditTrace,
    summary: buildRiskSummary(riskScore, riskLevel, riskEmoji, signals, mitigations, weights)
  };
}

/**
 * Generate mitigations for high-risk signals
 */
function generateMitigations(signals) {
  const mitigations = [];
  const mitigationConfig = RISK_CONFIG.mitigations;

  for (const [signalName, signal] of Object.entries(signals)) {
    if (signal.score >= 0.5) { // Trigger mitigations for signals >= 0.5
      const signalMitigations = mitigationConfig[signalName] || [];
      mitigations.push({
        signal: signalName,
        score: signal.score,
        requiresApproval: true, // Human-in-the-loop
        suggestions: signalMitigations,
        citations: signal.citations.slice(0, 3) // Top 3 citations
      });
    }
  }

  return mitigations;
}

/**
 * Build formatted risk summary for PR comment
 */
function buildRiskSummary(score, level, emoji, signals, mitigations, weights) {
  const lines = [];

  // Header
  lines.push(`## ${emoji} Risk Assessment: **${level}** (Score: ${round(score)})`);
  lines.push('');

  // Formula
  lines.push('### 📊 Risk Formula');
  lines.push('```');
  lines.push('R = w1×churn + w2×coverage_gap + w3×incident_hotspot + w4×flake_proximity + w5×diff_risk + w6×time_pressure');
  lines.push('');
  lines.push(`R = ${weights.churn}×${signals.churn.score} + ${weights.coverage_gap}×${signals.coverage_gap.score} + ${weights.incident_hotspot}×${signals.incident_hotspot.score} + ${weights.flake_proximity}×${signals.flake_proximity.score} + ${weights.diff_risk}×${signals.diff_risk.score} + ${weights.time_pressure}×${signals.time_pressure.score}`);
  lines.push(`R = ${round(score)}`);
  lines.push('```');
  lines.push('');

  // Signal breakdown
  lines.push('### 📈 Signal Breakdown');
  lines.push('');
  lines.push('| Signal | Weight | Score | Status | Explanation |');
  lines.push('|--------|--------|-------|--------|-------------|');

  for (const [name, signal] of Object.entries(signals)) {
    const weight = weights[name];
    const status = signal.score >= 0.5 ? '⚠️ High' : signal.score >= 0.3 ? '🔶 Medium' : '✅ Low';
    lines.push(`| ${formatSignalName(name)} | ${weight} | ${signal.score} | ${status} | ${signal.explanation} |`);
  }
  lines.push('');

  // Risk level explanation
  lines.push('### 🎯 Risk Levels');
  lines.push('- 🟢 **LOW** (0-0.3): Safe to merge with standard review');
  lines.push('- 🟡 **MEDIUM** (0.3-0.6): Requires additional attention');
  lines.push('- 🔴 **HIGH** (0.6+): Requires senior review and mitigations');
  lines.push('');

  // Mitigations (if any)
  if (mitigations.length > 0) {
    lines.push('### 🛡️ Recommended Mitigations');
    lines.push('');
    lines.push('> ⚠️ **Human Approval Required**: The following mitigations require human review before merge.');
    lines.push('');

    for (const mitigation of mitigations) {
      lines.push(`#### ${formatSignalName(mitigation.signal)} (Score: ${mitigation.score})`);
      for (const suggestion of mitigation.suggestions.slice(0, 2)) {
        lines.push(`- [ ] ${suggestion}`);
      }
      if (mitigation.citations.length > 0) {
        lines.push(`  - *Citation*: ${JSON.stringify(mitigation.citations[0])}`);
      }
      lines.push('');
    }
  }

  // Audit info
  lines.push('### 📋 Audit Trail');
  lines.push(`- **Analysis ID**: \`${generateTraceId()}\``);
  lines.push(`- **Timestamp**: ${new Date().toISOString()}`);
  lines.push(`- **Files Analyzed**: ${Object.values(signals)[0]?.raw?.totalFiles || 'N/A'}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format signal name for display
 */
function formatSignalName(name) {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate unique trace ID
 */
function generateTraceId() {
  return `risk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Round number to decimals
 */
function round(num, decimals = 3) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Export audit trace as JSON
 */
export function exportAuditTrace(analysis) {
  return JSON.stringify(analysis.auditTrace, null, 2);
}

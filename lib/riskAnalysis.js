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

// Dashboard API for logging
const DASHBOARD_API = 'https://ai-code-reviewer-beta-green.vercel.app/api/dashboard';

// Helper to send logs to dashboard
async function sendAgentLog(source, message, level = 'INFO') {
  try {
    await fetch(`${DASHBOARD_API}?action=add-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, message, level })
    });
  } catch (e) {
    // Ignore errors
  }
  console.log(`[${level}] [${source}] ${message}`);
}

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

  // Run all signal agents sequentially with 5s delay between each
  console.log('🔍 Running risk signal agents...');
  const signals = {};

  // Agent 1: Churn
  await sendAgentLog('ChurnAgent', '🔄 Starting analysis...');
  signals.churn = calculateChurn(files, commitHistory);
  await sendAgentLog('ChurnAgent', `✅ Complete - Score: ${signals.churn.score}`);
  await delay(5000);

  // Agent 2: Coverage Gap
  await sendAgentLog('CoverageGapAgent', '📊 Starting analysis...');
  signals.coverage_gap = calculateCoverageGap(files, coverageData);
  await sendAgentLog('CoverageGapAgent', `✅ Complete - Score: ${signals.coverage_gap.score}`);
  await delay(9000);

  // Agent 3: Incident Hotspot
  await sendAgentLog('IncidentHotspotAgent', '🔥 Starting analysis...');
  signals.incident_hotspot = calculateIncidentHotspot(files, incidentHistory);
  await sendAgentLog('IncidentHotspotAgent', `✅ Complete - Score: ${signals.incident_hotspot.score}`);
  await delay(6000);

  // Agent 4: Flake Proximity
  await sendAgentLog('FlakeProximityAgent', '❄️ Starting analysis...');
  signals.flake_proximity = calculateFlakeProximity(files, flakeData);
  await sendAgentLog('FlakeProximityAgent', `✅ Complete - Score: ${signals.flake_proximity.score}`);
  await delay(8000);

  // Agent 5: Diff Risk
  await sendAgentLog('DiffRiskAgent', '🔺 Starting analysis...');
  signals.diff_risk = calculateDiffRisk(files, pullRequest);
  await sendAgentLog('DiffRiskAgent', `✅ Complete - Score: ${signals.diff_risk.score}`);
  await delay(5000);

  // Agent 6: Time Pressure
  await sendAgentLog('TimePressureAgent', '⏰ Starting analysis...');
  signals.time_pressure = calculateTimePressure(pullRequest);
  await sendAgentLog('TimePressureAgent', `✅ Complete - Score: ${signals.time_pressure.score}`);

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

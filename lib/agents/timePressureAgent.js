/**
 * Time Pressure Agent
 * Signal 6: Analyzes time-based risk factors
 * Weekend/late night/urgent PRs = higher risk
 */

import { RISK_CONFIG } from '../riskConfig.js';

/**
 * Calculate time pressure score for the PR
 * @param {Object} pullRequest - PR metadata with created_at timestamp
 * @returns {Object} Signal result with score, citations, and explanation
 */
export function calculate(pullRequest = {}) {
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

function round(num, decimals = 3) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export default { calculate };

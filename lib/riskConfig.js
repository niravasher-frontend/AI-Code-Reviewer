/**
 * Risk Analysis Configuration
 * Multi-signal risk scoring with configurable weights
 */

export const RISK_CONFIG = {
  // Signal weights (must sum to 1.0 for normalized scoring)
  weights: {
    churn: 0.15,           // w1: File change frequency
    coverage_gap: 0.20,    // w2: Test coverage gaps
    incident_hotspot: 0.20, // w3: Past incident correlation
    flake_proximity: 0.10,  // w4: Proximity to flaky/unstable code
    diff_risk: 0.25,       // w5: Risk based on diff characteristics
    time_pressure: 0.10    // w6: Time-based risk factors
  },

  // Risk level thresholds
  thresholds: {
    LOW: 0.3,      // 0 - 0.3: Low risk
    MEDIUM: 0.6,   // 0.3 - 0.6: Medium risk
    HIGH: 1.0      // 0.6+: High risk
  },

  // Signal-specific configurations
  signals: {
    churn: {
      highChurnThreshold: 10,    // Files changed 10+ times in 30 days
      lookbackDays: 30
    },
    coverage_gap: {
      minCoverageThreshold: 0.7,  // 70% minimum coverage
      criticalFilePatterns: ['auth', 'payment', 'security', 'crypto']
    },
    incident_hotspot: {
      lookbackDays: 90,
      hotspotThreshold: 2         // 2+ incidents = hotspot
    },
    flake_proximity: {
      flakePatterns: ['test', 'spec', '__tests__'],
      proximityLines: 50
    },
    diff_risk: {
      largeDiffThreshold: 500,    // 500+ lines = large diff
      criticalPatterns: ['password', 'secret', 'key', 'token', 'auth', 'payment'],
      dangerousPatterns: ['eval', 'exec', 'dangerouslySetInnerHTML', 'innerHTML']
    },
    time_pressure: {
      rushHourStart: 17,          // 5 PM
      rushHourEnd: 23,            // 11 PM
      weekendRisk: 0.3,
      lateNightRisk: 0.5          // After 11 PM
    }
  },

  // Mitigation suggestions by risk type
  mitigations: {
    churn: [
      'Consider adding more comprehensive tests for frequently changed files',
      'Review if this file should be refactored to reduce change frequency',
      'Add code freeze consideration for this module'
    ],
    coverage_gap: [
      'Add unit tests for uncovered code paths',
      'Consider integration tests for critical flows',
      'Request coverage report before merge'
    ],
    incident_hotspot: [
      'Request additional reviewer familiar with past incidents',
      'Add monitoring/alerting for this component',
      'Consider feature flag for gradual rollout'
    ],
    flake_proximity: [
      'Review and stabilize nearby flaky tests',
      'Add retry logic or increase timeouts if applicable',
      'Consider quarantining unstable tests'
    ],
    diff_risk: [
      'Break down into smaller, focused PRs',
      'Add security review for sensitive changes',
      'Request architectural review for large changes'
    ],
    time_pressure: [
      'Consider delaying merge to regular hours',
      'Ensure on-call coverage before deploying',
      'Add rollback plan documentation'
    ]
  }
};

/**
 * Get risk level label from score
 */
export function getRiskLevel(score) {
  if (score < RISK_CONFIG.thresholds.LOW) return 'LOW';
  if (score < RISK_CONFIG.thresholds.MEDIUM) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Get risk level emoji
 */
export function getRiskEmoji(level) {
  const emojis = {
    LOW: '🟢',
    MEDIUM: '🟡',
    HIGH: '🔴'
  };
  return emojis[level] || '⚪';
}

/**
 * Validate weights sum to 1.0
 */
export function validateWeights() {
  const sum = Object.values(RISK_CONFIG.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    console.warn(`⚠️ Risk weights sum to ${sum}, should be 1.0`);
    return false;
  }
  return true;
}

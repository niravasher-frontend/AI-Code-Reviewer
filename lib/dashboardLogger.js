/**
 * Dashboard Logger
 * Sends logs to the dashboard API for real-time monitoring
 */

// In-memory log buffer (for serverless, logs are collected during request)
let logBuffer = [];
let reviewData = null;

const LOG_SOURCES = {
  WEBHOOK: 'webhook',
  GITHUB: 'github_client',
  PINECONE: 'pinecone_client',
  OPENAI: 'openai_client',
  CHURN_AGENT: 'ChurnAgent',
  COVERAGE_AGENT: 'CoverageAgent',
  INCIDENT_AGENT: 'IncidentAgent',
  FLAKE_AGENT: 'FlakeAgent',
  DIFF_AGENT: 'DiffRiskAgent',
  TIME_AGENT: 'TimeAgent'
};

/**
 * Add a log entry
 */
function log(source, message, level = 'INFO') {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message
  };
  
  logBuffer.push(entry);
  
  // Also log to console for Vercel logs
  const emoji = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : 'ℹ️';
  console.log(`${emoji} [${source}] ${message}`);
}

/**
 * Set review data to be sent to dashboard
 */
function setReview(data) {
  reviewData = {
    repo: data.repo,
    prNumber: data.prNumber,
    riskScore: Math.round(data.riskScore * 100), // Convert 0-1 to 0-100
    author: data.author,
    comments: data.comments || 0
  };
}

/**
 * Get all buffered logs
 */
function getLogs() {
  return [...logBuffer];
}

/**
 * Get review data
 */
function getReview() {
  return reviewData;
}

/**
 * Clear the buffer
 */
function clearBuffer() {
  logBuffer = [];
  reviewData = null;
}

/**
 * Send buffered data to dashboard API (call at end of request)
 * Note: In serverless, this might not complete if response is sent before
 * Use with caution or implement async background processing
 */
async function flushToDashboard(dashboardUrl) {
  if (!dashboardUrl) return;
  
  try {
    // Send logs
    for (const logEntry of logBuffer) {
      await fetch(`${dashboardUrl}/api/dashboard?action=add-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      });
    }
    
    // Send review if exists
    if (reviewData) {
      await fetch(`${dashboardUrl}/api/dashboard?action=add-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData)
      });
    }
  } catch (error) {
    console.error('Failed to send logs to dashboard:', error.message);
  }
  
  clearBuffer();
}

export {
  LOG_SOURCES,
  log,
  setReview,
  getLogs,
  getReview,
  clearBuffer,
  flushToDashboard
};

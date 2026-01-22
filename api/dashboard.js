/**
 * Dashboard API Endpoint
 * Provides data for the Agent Risk Monitor dashboard
 */

// In-memory storage for logs, reviews, and stats (replace with database in production)
// Note: Vercel serverless is stateless - this resets on each cold start
// For persistence, use Vercel KV, Upstash Redis, or a database

let logs = [
  {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    source: 'webhook',
    message: '👀 Dashboard connected - waiting for PR reviews...'
  }
];
let reviews = [];
let agentStats = {
  churn: { executions: 0, lastRun: null, status: 'Ready' },
  coverage_gap: { executions: 0, lastRun: null, status: 'Ready' },
  incident_hotspot: { executions: 0, lastRun: null, status: 'Ready' },
  flake_proximity: { executions: 0, lastRun: null, status: 'Ready' },
  diff_risk: { executions: 0, lastRun: null, status: 'Ready' },
  time_pressure: { executions: 0, lastRun: null, status: 'Ready' }
};

// Map agent names to display info
const agentDisplayInfo = {
  churn: { name: 'ChurnAgent', icon: '🔄', color: 'text-purple-400' },
  coverage_gap: { name: 'CoverageAgent', icon: '📊', color: 'text-blue-400' },
  incident_hotspot: { name: 'IncidentAgent', icon: '🔥', color: 'text-orange-400' },
  flake_proximity: { name: 'FlakeAgent', icon: '❄️', color: 'text-cyan-400' },
  diff_risk: { name: 'DiffRiskAgent', icon: '🔺', color: 'text-yellow-400' },
  time_pressure: { name: 'TimeAgent', icon: '⏰', color: 'text-green-400' }
};

export default async function handler(req, res) {
  // Enable CORS for dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'stats':
        return res.status(200).json(getStats());

      case 'agents':
        return res.status(200).json(getAgents());

      case 'reviews':
        return res.status(200).json(getReviews());

      case 'logs':
        const limit = parseInt(req.query.limit) || 100;
        return res.status(200).json(getLogs(limit));

      case 'add-log':
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        addLog(req.body);
        return res.status(200).json({ success: true });

      case 'add-review':
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        addReview(req.body);
        return res.status(200).json({ success: true });

      case 'update-agent':
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        updateAgent(req.body);
        return res.status(200).json({ success: true });

      case 'clear-logs':
        logs = [];
        return res.status(200).json({ success: true });

      default:
        return res.status(400).json({ error: 'Invalid action. Use: stats, agents, reviews, logs, add-log, add-review, update-agent, clear-logs' });
    }
  } catch (error) {
    console.error('Dashboard API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function getStats() {
  const totalReviews = reviews.length;
  const avgRiskScore = reviews.length > 0
    ? Math.round(reviews.reduce((sum, r) => sum + r.riskScore, 0) / reviews.length)
    : 0;
  const activeAgents = Object.values(agentStats).filter(a => a.status === 'Running').length || 6;

  return {
    totalReviews,
    avgRiskScore,
    logEntries: logs.length,
    activeAgents: 6
  };
}

function getAgents() {
  return Object.entries(agentStats).map(([key, stats], index) => ({
    id: String(index + 1),
    name: agentDisplayInfo[key].name,
    icon: agentDisplayInfo[key].icon,
    status: stats.status,
    color: agentDisplayInfo[key].color,
    lastExecution: stats.lastRun,
    executionCount: stats.executions
  }));
}

function getReviews() {
  return reviews.slice(-20).reverse().map((r, index) => ({
    id: String(index + 1),
    repo: r.repo,
    prNumber: r.prNumber,
    riskScore: r.riskScore,
    author: r.author,
    comments: r.comments || 0,
    timeAgo: getTimeAgo(r.timestamp)
  }));
}

function getLogs(limit) {
  return logs.slice(-limit).reverse().map((log, index) => ({
    id: String(index + 1),
    timestamp: log.timestamp,
    level: log.level,
    source: log.source,
    message: log.message
  }));
}

function addLog(logEntry) {
  logs.push({
    timestamp: new Date().toISOString(),
    level: logEntry.level || 'INFO',
    source: logEntry.source || 'webhook',
    message: logEntry.message
  });

  // Keep only last 500 logs
  if (logs.length > 500) {
    logs = logs.slice(-500);
  }
}

function addReview(review) {
  reviews.push({
    repo: review.repo,
    prNumber: review.prNumber,
    riskScore: review.riskScore,
    author: review.author,
    comments: review.comments || 0,
    timestamp: new Date().toISOString()
  });

  // Keep only last 50 reviews
  if (reviews.length > 50) {
    reviews = reviews.slice(-50);
  }
}

function updateAgent(data) {
  const { agent, status, execution } = data;
  if (agentStats[agent]) {
    agentStats[agent].status = status || agentStats[agent].status;
    if (execution) {
      agentStats[agent].executions++;
      agentStats[agent].lastRun = new Date().toISOString();
    }
  }
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
  return `${seconds}s`;
}

// Export helper functions to be used by webhook
export { addLog, addReview, updateAgent };

import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import { createEmbedding } from '../lib/embeddings.js';
import { queryVectors } from '../lib/pinecone.js';
import { analyzeRisk, exportAuditTrace } from '../lib/riskAnalysis.js';

// Dashboard API URL for logging
const DASHBOARD_API = 'https://ai-code-reviewer-beta-green.vercel.app/api/dashboard';

// Helper to send logs to dashboard
async function sendLog(source, message, level = 'INFO') {
  try {
    await fetch(`${DASHBOARD_API}?action=add-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, message, level })
    });
  } catch (e) {
    // Ignore errors - dashboard logging is optional
  }
  console.log(`[${level}] [${source}] ${message}`);
}

// Helper to send review to dashboard
async function sendReview(review) {
  try {
    await fetch(`${DASHBOARD_API}?action=add-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(review)
    });
  } catch (e) {
    // Ignore errors
  }
}

// Parse diff to map line numbers to diff positions
function parseDiffPositions(patch) {
  const lines = patch.split('\n');
  const positions = {};
  let diffPosition = 0;
  let currentNewLine = 0;

  for (const line of lines) {
    diffPosition++;
    
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    if (!line.startsWith('-') && !line.startsWith('+')) {
      currentNewLine++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      currentNewLine++;
      positions[currentNewLine] = diffPosition;
    }
  }

  return positions;
}

export default async function handler(req, res) {
  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.headers['x-github-event'];
  
  // Only process pull request events
  if (event !== 'pull_request') {
    return res.status(200).json({ message: 'Not a PR event' });
  }

  const { action, pull_request, repository } = req.body;
  
  // Only review when PR is opened or synchronized (new commits)
  if (!['opened', 'synchronize'].includes(action)) {
    return res.status(200).json({ message: 'No action needed' });
  }

  console.log(`🚀 Reviewing PR #${pull_request.number} in ${repository.full_name}`);

  // Start dashboard logging
  await sendLog('webhook', '════════════════════════════════════════════');
  await sendLog('webhook', `🚀 Starting review for ${repository.full_name}#${pull_request.number}`);

  try {
    await sendLog('github_client', 'Initializing GitHub client...');
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    await sendLog('github_client', 'GitHub client initialized successfully');

    // Get PR files
    await sendLog('github_client', `Fetching PR files: ${repository.full_name}#${pull_request.number}`);
    const { data: files } = await octokit.pulls.listFiles({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: pull_request.number
    });
    await sendLog('github_client', `Found ${files.length} files in PR`);

    // Filter out binary files and very large files
    const codeFiles = files.filter(file => 
      file.status !== 'removed' && 
      file.changes < 500 &&
      !file.filename.match(/\.(png|jpg|jpeg|gif|svg|ico|lock|min\.js)$/)
    );
    await sendLog('github_client', `Filtered to ${codeFiles.length} reviewable files`);

    if (codeFiles.length === 0) {
      await sendLog('webhook', '⚠️ No code files to review', 'WARN');
      return res.status(200).json({ message: 'No code files to review' });
    }

    // Extract diffs
    const validFiles = codeFiles
      .filter(file => file.patch)
      .map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch
      }));
    
    console.log(`📄 Extracted diffs for ${validFiles.length} files`);

    // === RISK ANALYSIS: Multi-signal risk scoring ===
    console.log('🔍 Running multi-agent risk analysis...');
    await sendLog('webhook', '🔍 Starting multi-agent risk analysis...');
    
    // Log each agent starting
    await sendLog('ChurnAgent', 'Analyzing code churn patterns...');
    await sendLog('CoverageGapAgent', 'Checking test coverage gaps...');
    await sendLog('IncidentHotspotAgent', 'Identifying incident hotspots...');
    await sendLog('FlakeProximityAgent', 'Detecting flaky test proximity...');
    await sendLog('DiffRiskAgent', 'Evaluating diff complexity...');
    await sendLog('TimePressureAgent', 'Assessing time pressure factors...');
    
    let riskAnalysis = null;
    try {
      riskAnalysis = await analyzeRisk({
        files: validFiles,
        pullRequest: pull_request,
        // These would come from external data sources in production
        commitHistory: [],
        coverageData: {},
        incidentHistory: [],
        flakeData: {}
      });
      
      // Log agent results
      for (const [name, signal] of Object.entries(riskAnalysis.signals)) {
        const agentName = name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, '') + 'Agent';
        await sendLog(agentName, `Score: ${signal.score} - ${signal.explanation.substring(0, 60)}...`);
      }
      
      await sendLog('webhook', `✅ Risk Analysis Complete: ${riskAnalysis.emoji} ${riskAnalysis.level} (${riskAnalysis.score})`);
      console.log(`✅ Risk analysis: ${riskAnalysis.emoji} ${riskAnalysis.level} (${riskAnalysis.score})`);
    } catch (riskError) {
      await sendLog('webhook', `⚠️ Risk analysis error: ${riskError.message}`, 'ERROR');
      console.error('⚠️ Risk analysis error:', riskError.message);
    }

    // === RAG: Retrieve relevant context ===
    await sendLog('pinecone_client', 'Querying knowledge base for relevant context...');
    let relevantContext = [];
    try {
      const queryText = `${pull_request.title} ${pull_request.body || ''} ${validFiles.map(f => f.filename).join(' ')}`;
      const queryEmbedding = await createEmbedding(queryText);
      relevantContext = await queryVectors(queryEmbedding, 10);
      await sendLog('pinecone_client', `Retrieved ${relevantContext.length} relevant context pieces`);
      console.log(`✅ Retrieved ${relevantContext.length} context pieces`);
    } catch (error) {
      await sendLog('pinecone_client', `Error: ${error.message}`, 'ERROR');
      console.error('⚠️ RAG error:', error.message);
    }

    // Build prompt for inline comments
    const contextString = relevantContext.length > 0
      ? relevantContext.map(m => m.metadata?.content || '').join('\n\n---\n\n')
      : 'No additional context available.';

    const diffString = validFiles.map(f => 
      `### File: ${f.filename} (${f.status}: +${f.additions}/-${f.deletions})\n\`\`\`diff\n${f.patch}\n\`\`\``
    ).join('\n\n');

    const prompt = `
You are a senior software engineer reviewing a pull request.
**IMPORTANT: Review ONLY the changes shown in the diff below. Return your review as JSON.**

## PR Information:
- **Title:** ${pull_request.title}
- **Description:** ${pull_request.body || 'No description provided'}

## Changes to Review (Diff):
Lines starting with + are additions (new code), lines starting with - are deletions (removed code).
The @@ markers show line numbers: @@ -old_start,old_count +new_start,new_count @@

${diffString}

## Relevant Codebase Context:
${contextString.substring(0, 2000)}

## OUTPUT FORMAT:
Return a JSON object with this EXACT structure:
{
  "summary": "2-3 sentence overall summary of the PR quality and main concerns",
  "inlineComments": [
    {
      "file": "path/to/file.js",
      "line": 42,
      "severity": "error|warning|suggestion|info",
      "comment": "DETAILED feedback for this line including:\\n- What the issue is\\n- Why it's a problem\\n- How to fix it (with code example if applicable)"
    }
  ]
}

## RULES:
1. Each inline comment must be DETAILED and COMPREHENSIVE - include the problem, why it matters, and the fix
2. Include code snippets in comments showing the correct approach when relevant
3. Each comment must reference a SPECIFIC line number where NEW code was ADDED (lines with +)
4. severity: "error" = bugs/security, "warning" = potential issues, "suggestion" = improvements, "info" = notes
5. Include 10-20 inline comments covering ALL important issues
6. Format comments in markdown (use code blocks, bold, etc.)
7. Be thorough - each comment should be self-contained with full context

Return ONLY valid JSON, no markdown code blocks, no extra text.
`;

    console.log('🤖 Calling OpenAI for inline review...');
    await sendLog('openai_client', 'Sending review request to GPT-5.1...');

    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: "You are a senior software engineer performing code reviews. Return ONLY valid JSON, no markdown."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 8000,
      temperature: 0.3
    });

    const rawResponse = completion.choices[0].message.content || '{}';
    await sendLog('openai_client', `Received response (${rawResponse.length} chars)`);
    
    // Parse JSON response
    let reviewData;
    try {
      let cleanJson = rawResponse.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      }
      reviewData = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError.message);
      // Fallback to single comment with raw response
      await octokit.issues.createComment({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: pull_request.number,
        body: `## 🤖 AI Code Review\n\n${rawResponse}\n\n---\n*🧠 Powered by GPT-5.1 + RAG*`
      });
      return res.status(200).json({ message: 'Review posted (fallback)' });
    }

    // Get latest commit SHA for inline comments
    const { data: prCommits } = await octokit.pulls.listCommits({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: pull_request.number
    });
    const latestCommitSha = prCommits[prCommits.length - 1].sha;

    // Build diff position map
    const diffPositionMap = {};
    for (const file of codeFiles) {
      if (file.patch) {
        diffPositionMap[file.filename] = parseDiffPositions(file.patch);
      }
    }

    // Convert inline comments to GitHub format
    const reviewComments = [];
    const inlineComments = reviewData.inlineComments || [];
    
    for (const comment of inlineComments) {
      const positions = diffPositionMap[comment.file];
      if (!positions) continue;

      const diffPosition = positions[comment.line];
      if (!diffPosition) continue;

      const severityEmoji = {
        'error': '🔴',
        'warning': '⚠️',
        'suggestion': '💡',
        'info': 'ℹ️'
      }[comment.severity] || '💬';

      reviewComments.push({
        path: comment.file,
        position: diffPosition,
        body: `${severityEmoji} **${comment.severity.toUpperCase()}**\n\n${comment.comment}`
      });
    }

    await sendLog('github_client', `Posting ${reviewComments.length} inline comments...`);
    console.log(`📝 Posting ${reviewComments.length} inline comments...`);

    const contextInfo = relevantContext.length > 0 
      ? ` | 📚 ${relevantContext.length} context pieces used`
      : '';

    // Build review body with risk analysis
    const riskSummary = riskAnalysis ? riskAnalysis.summary : '';
    const reviewBody = `## 🤖 AI Code Review\n\n**Summary:** ${reviewData.summary || 'Review complete.'}\n\n---\n\n${riskSummary}\n\n---\n*🧠 GPT-5.1 + RAG | ${validFiles.length} files reviewed${contextInfo}*`;

    if (reviewComments.length > 0) {
      await octokit.pulls.createReview({
        owner: repository.owner.login,
        repo: repository.name,
        pull_number: pull_request.number,
        commit_id: latestCommitSha,
        body: reviewBody,
        event: 'COMMENT',
        comments: reviewComments
      });
      await sendLog('github_client', '✅ Review posted to GitHub successfully!');
      console.log('✅ Inline review with risk analysis posted successfully!');
    } else {
      // No valid inline positions, post summary only
      await octokit.issues.createComment({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: pull_request.number,
        body: reviewBody
      });
      await sendLog('github_client', '✅ Summary posted (no inline positions matched)', 'WARN');
      console.log('✅ Summary with risk analysis posted (no inline positions matched).');
    }

    // Log audit trace
    if (riskAnalysis) {
      console.log('📋 Audit Trace:', exportAuditTrace(riskAnalysis));
    }

    // Send review to dashboard
    await sendReview({
      repo: repository.full_name,
      prNumber: pull_request.number,
      riskScore: riskAnalysis ? riskAnalysis.score : 0,
      author: pull_request.user.login,
      comments: reviewComments.length
    });

    await sendLog('webhook', `✅ Review complete for PR #${pull_request.number}`);
    await sendLog('webhook', '════════════════════════════════════════════');

    return res.status(200).json({ 
      message: 'Review posted successfully',
      filesReviewed: validFiles.length,
      inlineComments: reviewComments.length,
      ragEnabled: true,
      riskAnalysis: riskAnalysis ? {
        score: riskAnalysis.score,
        level: riskAnalysis.level,
        traceId: riskAnalysis.auditTrace?.traceId
      } : null
    });

  } catch (error) {
    await sendLog('webhook', `❌ Error: ${error.message}`, 'ERROR');
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process review',
      details: error.message 
    });
  }
}

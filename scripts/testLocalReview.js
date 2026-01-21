import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import { pipeline } from '@xenova/transformers';
import { Pinecone } from '@pinecone-database/pinecone';

// ========== CONFIGURATION ==========
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;

// ⚠️ UPDATE THESE WITH YOUR PR DETAILS
const REPO_OWNER = 'niravasher-frontend';  // Your GitHub username
const REPO_NAME = 'Smart-Payment'; // Your repo name
const PR_NUMBER = 3;               // The PR number to review

// ========== INITIALIZE CLIENTS ==========
console.log('🔧 Initializing clients...');

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });

// Embedding model
let embedder = null;
async function getEmbedder() {
  if (!embedder) {
    console.log('🔄 Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✅ Embedding model loaded!');
  }
  return embedder;
}

async function createEmbedding(text) {
  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Parse diff to map line numbers to diff positions
// GitHub requires "position" (line number in the diff), not actual file line numbers
function parseDiffPositions(patch) {
  const lines = patch.split('\n');
  const positions = {};
  let diffPosition = 0;
  let currentNewLine = 0;

  for (const line of lines) {
    diffPosition++;
    
    // Parse @@ -old_start,old_count +new_start,new_count @@ markers
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10) - 1; // -1 because we'll increment on next line
      continue;
    }

    // Context line (unchanged) - exists in both old and new
    if (!line.startsWith('-') && !line.startsWith('+')) {
      currentNewLine++;
    }
    // Added line - only in new file
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      currentNewLine++;
      positions[currentNewLine] = diffPosition;  // Map new file line number to diff position
    }
    // Removed line - only in old file (don't increment currentNewLine)
    // We don't map these since they're not in the new file
  }

  return positions;
}

// ========== MAIN REVIEW FUNCTION ==========
async function runLocalReview() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 STARTING LOCAL CODE REVIEW');
  console.log('='.repeat(60));
  console.log(`📋 Repository: ${REPO_OWNER}/${REPO_NAME}`);
  console.log(`🔢 PR Number: ${PR_NUMBER}`);
  console.log('='.repeat(60) + '\n');

  try {
    // Step 1: Get PR details
    console.log('📥 Step 1: Fetching PR details...');
    const { data: pullRequest } = await octokit.pulls.get({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      pull_number: PR_NUMBER
    });
    console.log(`✅ PR Title: "${pullRequest.title}"`);
    console.log(`   PR State: ${pullRequest.state}`);
    console.log(`   PR Author: ${pullRequest.user.login}`);

    // Step 2: Get PR files
    console.log('\n📂 Step 2: Fetching PR files...');
    const { data: files } = await octokit.pulls.listFiles({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      pull_number: PR_NUMBER
    });
    console.log(`✅ Found ${files.length} files in PR`);

    // Filter files
    const codeFiles = files.filter(file => 
      file.status !== 'removed' && 
      file.changes < 500 &&
      !file.filename.match(/\.(png|jpg|jpeg|gif|svg|ico|lock|min\.js)$/)
    );
    console.log(`   Filtered to ${codeFiles.length} code files`);

    if (codeFiles.length === 0) {
      console.log('⚠️ No code files to review!');
      return;
    }

    // Step 3: Extract diffs only (no full file fetch needed)
    console.log('\n📄 Step 3: Extracting diffs from PR...');
    const fileDiffs = codeFiles
      .filter(file => file.patch) // Only files with actual changes
      .map(file => {
        console.log(`   ✅ ${file.filename} (+${file.additions}/-${file.deletions})`);
        return {
          filename: file.filename,
          status: file.status, // added, modified, removed
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch // This is the diff!
        };
      });

    const validFiles = fileDiffs;
    console.log(`✅ Extracted diffs for ${validFiles.length} files`);

    // Step 4: Query knowledge base
    console.log('\n🔍 Step 4: Querying knowledge base (Pinecone)...');
    let relevantContext = [];
    try {
      // Build query from PR info
      const queryText = `${pullRequest.title} ${pullRequest.body || ''} ${validFiles.map(f => f.filename).join(' ')}`;
      console.log(`   Query: "${queryText.substring(0, 100)}..."`);

      // Create embedding
      const queryEmbedding = await createEmbedding(queryText);
      console.log(`   ✅ Created query embedding (${queryEmbedding.length} dimensions)`);

      // Query Pinecone
      const index = pinecone.Index('codebase-embedding-384');
      const queryResponse = await index.query({
        vector: queryEmbedding,
        topK: 10,
        includeMetadata: true
      });

      relevantContext = queryResponse.matches || [];
      console.log(`✅ Retrieved ${relevantContext.length} relevant context pieces`);
      
      if (relevantContext.length > 0) {
        console.log('   Top matches:');
        relevantContext.slice(0, 3).forEach((match, i) => {
          console.log(`   ${i + 1}. ${match.id} (score: ${match.score?.toFixed(3)})`);
        });
      }
    } catch (error) {
      console.error('⚠️ Error querying knowledge base:', error.message);
    }

    // Step 5: Build prompt
    console.log('\n📝 Step 5: Building review prompt...');
    
    // Build context string from Pinecone results
    const contextString = relevantContext.length > 0
      ? relevantContext.map(m => m.metadata?.content || '').join('\n\n---\n\n')
      : 'No additional context available.';

    // Build diff string - focus ONLY on the changes
    const diffString = validFiles.map(f => 
      `### File: ${f.filename} (${f.status}: +${f.additions}/-${f.deletions})\n\`\`\`diff\n${f.patch}\n\`\`\``
    ).join('\n\n');

    const prompt = `
You are a senior software engineer reviewing a pull request.
**IMPORTANT: Review ONLY the changes shown in the diff below. Return your review as JSON.**

## PR Information:
- **Title:** ${pullRequest.title}
- **Description:** ${pullRequest.body || 'No description provided'}

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

    console.log(`✅ Prompt built (${prompt.length} chars)`);
    console.log('   Preview:', prompt.substring(0, 200) + '...');

    // Step 6: Call OpenAI
    console.log('\n🤖 Step 6: Calling OpenAI (gpt-5.1) for review...');
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
    console.log(`✅ Received response (${rawResponse.length} chars)`);
    
    // Parse JSON response
    let reviewData;
    try {
      // Clean up response - remove markdown code blocks if present
      let cleanJson = rawResponse.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      }
      reviewData = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('❌ Failed to parse JSON response:', parseError.message);
      console.log('Raw response:', rawResponse);
      return;
    }

    console.log('\n' + '-'.repeat(60));
    console.log('📋 PARSED REVIEW:');
    console.log('-'.repeat(60));
    console.log(`Summary: ${reviewData.summary}`);
    console.log(`Inline Comments: ${reviewData.inlineComments?.length || 0}`);
    reviewData.inlineComments?.forEach((c, i) => {
      console.log(`  ${i + 1}. [${c.severity}] ${c.file}:${c.line}`);
      console.log(`      ${c.comment.substring(0, 100)}...`);
    });
    console.log('-'.repeat(60) + '\n');

    // Step 7: Post to GitHub
    console.log('💬 Step 7: Posting review to GitHub...');
    
    // Get the latest commit SHA for the PR
    const { data: prCommits } = await octokit.pulls.listCommits({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      pull_number: PR_NUMBER
    });
    const latestCommitSha = prCommits[prCommits.length - 1].sha;
    console.log(`   Using commit SHA: ${latestCommitSha}`);

    // Build diff position map for each file
    const diffPositionMap = {};
    for (const file of codeFiles) {
      if (file.patch) {
        diffPositionMap[file.filename] = parseDiffPositions(file.patch);
      }
    }

    // Convert inline comments to GitHub review comments format
    const reviewComments = [];
    const inlineComments = reviewData.inlineComments || [];
    
    for (const comment of inlineComments) {
      const positions = diffPositionMap[comment.file];
      if (!positions) {
        console.log(`   ⚠️ Skipping comment for ${comment.file} - file not in diff`);
        continue;
      }

      // Find the position in the diff for this line
      const diffPosition = positions[comment.line];
      if (!diffPosition) {
        console.log(`   ⚠️ Skipping comment for ${comment.file}:${comment.line} - line not in diff`);
        continue;
      }

      const severityEmoji = {
        'error': '🔴',
        'warning': '⚠️',
        'suggestion': '💡',
        'info': 'ℹ️'
      }[comment.severity] || '💬';

      reviewComments.push({
        path: comment.file,
        position: diffPosition,  // Position in the diff, not the file
        body: `${severityEmoji} **${comment.severity.toUpperCase()}**\n\n${comment.comment}`
      });
    }

    console.log(`   📝 Posting ${reviewComments.length} inline comments...`);

    const contextInfo = relevantContext.length > 0 
      ? ` | 📚 ${relevantContext.length} context pieces used`
      : '';

    if (reviewComments.length > 0) {
      await octokit.pulls.createReview({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        pull_number: PR_NUMBER,
        commit_id: latestCommitSha,
        body: `## 🤖 AI Code Review\n\n**Summary:** ${reviewData.summary}\n\n---\n*🧠 GPT-5.1 + RAG | ${validFiles.length} files reviewed${contextInfo}*`,
        event: 'COMMENT',
        comments: reviewComments
      });
      console.log('✅ Inline review posted successfully!');
    } else {
      console.log('⚠️ No inline comments matched diff positions');
    }

    console.log(`🔗 View at: https://github.com/${REPO_OWNER}/${REPO_NAME}/pull/${PR_NUMBER}`);

  } catch (error) {
    console.error('\n❌ ERROR:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    
    if (error.response) {
      console.error('   Response Status:', error.response.status);
      console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run it!
runLocalReview();

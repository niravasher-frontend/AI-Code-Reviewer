import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import { pipeline } from '@xenova/transformers';
import { Pinecone } from '@pinecone-database/pinecone';

// ========== CONFIGURATION ==========
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENAI_API_KEY = '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';
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;

// ⚠️ UPDATE THESE WITH YOUR PR DETAILS
const REPO_OWNER = 'niravasher-frontend';  // Your GitHub username
const REPO_NAME = 'Smart-Payment'; // Your repo name
const PR_NUMBER = 2;               // The PR number to review

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

    // Step 3: Get file contents
    console.log('\n📄 Step 3: Fetching file contents...');
    const fileContents = await Promise.all(
      codeFiles.map(async (file) => {
        try {
          const { data } = await octokit.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: file.filename,
            ref: pullRequest.head.sha
          });
          
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          console.log(`   ✅ ${file.filename} (${content.length} chars)`);
          return {
            filename: file.filename,
            patch: file.patch,
            content: content
          };
        } catch (error) {
          console.error(`   ❌ Error fetching ${file.filename}:`, error.message);
          return null;
        }
      })
    );

    const validFiles = fileContents.filter(f => f !== null);
    console.log(`✅ Retrieved ${validFiles.length} file contents`);

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

    // Build files string
    const filesString = validFiles.map(f => 
      `### File: ${f.filename}\n\`\`\`\n${f.patch || f.content.substring(0, 1000)}\n\`\`\``
    ).join('\n\n');

    const prompt = `
You are a senior software engineer reviewing a pull request.

## PR Information:
- **Title:** ${pullRequest.title}
- **Description:** ${pullRequest.body || 'No description provided'}
- **Author:** ${pullRequest.user.login}

## Files Changed:
${filesString}

## Relevant Codebase Context:
${contextString.substring(0, 3000)}

## Your Task:
Please provide a thorough code review focusing on:
1. **Code Quality:** Best practices, readability, maintainability
2. **Potential Bugs:** Logic errors, edge cases, error handling
3. **Security:** Any security concerns or vulnerabilities
4. **Performance:** Any performance implications
5. **Suggestions:** Specific improvements with code examples

Be constructive, specific, and helpful. Reference line numbers when possible.
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
          content: "You are a senior software engineer performing code reviews. Be helpful, specific, and constructive."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 8000,
      temperature: 0.3
    });

    console.log('   Full API response:', JSON.stringify(completion, null, 2));
    
    const reviewComment = completion.choices[0].message.content || 'No review generated';
    console.log(`✅ Received review (${reviewComment.length} chars)`);
    console.log('\n' + '-'.repeat(60));
    console.log('📋 GENERATED REVIEW:');
    console.log('-'.repeat(60));
    console.log(reviewComment);
    console.log('-'.repeat(60) + '\n');

    // Step 7: Post comment to GitHub
    console.log('💬 Step 7: Posting review comment to GitHub...');
    
    const contextInfo = relevantContext.length > 0 
      ? `\n*📚 Analyzed with ${relevantContext.length} pieces of codebase context*`
      : '';

    await octokit.issues.createComment({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: PR_NUMBER,
      body: `## 🤖 AI Code Review (RAG-Enhanced)\n\n${reviewComment}\n\n---\n*🧠 Powered by GPT-5.1 + Knowledge Base | Context-Aware Review*${contextInfo}`
    });

    console.log('✅ Review comment posted successfully!');
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

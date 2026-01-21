import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import { createEmbedding } from '../lib/embeddings.js';
import { queryVectors } from '../lib/pinecone.js';
import { buildReviewPrompt, buildContextQuery } from '../lib/promptBuilder.js';

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

  try {
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });

    const openai = new OpenAI({
      apiKey: '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'
    });

    // Get PR files
    const { data: files } = await octokit.pulls.listFiles({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: pull_request.number
    });

    // Filter out binary files and very large files
    const codeFiles = files.filter(file => 
      file.status !== 'removed' && 
      file.changes < 500 &&
      !file.filename.match(/\.(png|jpg|jpeg|gif|svg|ico|lock|min\.js)$/)
    );

    if (codeFiles.length === 0) {
      return res.status(200).json({ message: 'No code files to review' });
    }

    // Get file contents
    const fileContents = await Promise.all(
      codeFiles.map(async (file) => {
        try {
          const { data } = await octokit.repos.getContent({
            owner: repository.owner.login,
            repo: repository.name,
            path: file.filename,
            ref: pull_request.head.sha
          });
          
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          return {
            filename: file.filename,
            patch: file.patch,
            content: content
          };
        } catch (error) {
          console.error(`Error fetching ${file.filename}:`, error.message);
          return null;
        }
      })
    );

    const validFiles = fileContents.filter(f => f !== null);

    // === RAG ENHANCEMENT: Retrieve relevant context from knowledge base ===
    console.log('🔍 Querying knowledge base for relevant context...');
    
    let relevantContext = [];
    try {
      // Build semantic query from PR info
      const contextQueryText = buildContextQuery(pull_request, validFiles);
      
      // Create embedding for the query
      const queryEmbedding = await createEmbedding(contextQueryText);
      
      // Query Pinecone for top 10 most relevant pieces of context
      relevantContext = await queryVectors(queryEmbedding, 10);
      
      console.log(`✅ Retrieved ${relevantContext.length} relevant context pieces`);
    } catch (error) {
      console.error('⚠️ Error retrieving context from knowledge base:', error.message);
      // Continue without context if retrieval fails
    }

    // Build context-aware prompt using our prompt builder
    const prompt = buildReviewPrompt({
      pullRequest: pull_request,
      files: validFiles,
      relevantContext: relevantContext
    });

    console.log('🤖 Sending request to OpenAI with enhanced context...');

    // Call OpenAI with enhanced prompt
    const completion = await openai.chat.completions.create({
      model: "all-MiniLM-L6-v2",
      messages: [
        {
          role: "system",
          content: "You are a senior software engineer performing code reviews. You have access to the codebase context and documentation. Be helpful, specific, constructive, and leverage the provided context to make informed recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 8000, // GPT-5.1 needs more tokens for reasoning + output
      temperature: 0.3
    });

    const reviewComment = completion.choices[0].message.content;

    // Build review metadata
    const contextInfo = relevantContext.length > 0 
      ? `\n*📚 Analyzed with ${relevantContext.length} pieces of codebase context*`
      : '';

    // Post review comment
    await octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: pull_request.number,
      body: `## 🤖 AI Code Review (RAG-Enhanced)\n\n${reviewComment}\n\n---\n*🧠 Powered by GPT-4 + Knowledge Base | Context-Aware Review*${contextInfo}`
    });

    console.log('✅ Review posted successfully!');

    return res.status(200).json({ 
      message: 'Review posted successfully',
      filesReviewed: validFiles.length,
      contextPiecesUsed: relevantContext.length,
      ragEnabled: true
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process review',
      details: error.message 
    });
  }
}
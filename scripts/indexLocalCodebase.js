import { Pinecone } from '@pinecone-database/pinecone';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import ignore from 'ignore';
import { pipeline } from '@xenova/transformers';

// ⚠️ HARDCODED CREDENTIALS - Only Pinecone needed now
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });

// Initialize the embedding model (will download on first run)
let embedder = null;
async function getEmbedder() {
  if (!embedder) {
    console.log('🔄 Loading all-MiniLM-L6-v2 model (first run may take a moment)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✅ Model loaded successfully!');
  }
  return embedder;
}

// Configuration
const REPO_PATH = '/Users/niravashar/Downloads/SmartPayments'; // Path to your repo to index
const INDEX_NAME = 'codebase-embedding-384';
const BATCH_SIZE = 100;
const CHUNK_SIZE = 1000;

const CODE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.go',
  '.rs', '.rb', '.php', '.cs', '.swift', '.kt', '.scala', '.md', '.json'
];

function loadGitignore(repoPath) {
  const gitignorePath = path.join(repoPath, '.gitignore');
  const ig = ignore();
  
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
  }
  
  ig.add([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    '.vercel',
    '*.log'
  ]);
  
  return ig;
}

function chunkContent(content, filePath, maxChars = CHUNK_SIZE) {
  console.log(`  🔍 Chunking file: ${filePath} (${content.length} chars)`);
  const chunks = [];
  const lines = content.split('\n');
  let currentChunk = '';
  let startLine = 1;
  let currentLine = 1;
  
  for (const line of lines) {
    if ((currentChunk + line).length > maxChars && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        startLine,
        endLine: currentLine - 1,
        filePath
      });
      currentChunk = line + '\n';
      startLine = currentLine;
    } else {
      currentChunk += line + '\n';
    }
    currentLine++;
  }
  
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      startLine,
      endLine: currentLine - 1,
      filePath
    });
  }
  
  console.log(`  ✂️  Created ${chunks.length} chunks from ${filePath}`);
  return chunks;
}

async function createEmbedding(text) {
  try {
    console.log(`  🤖 Creating embedding for text (${text.length} chars)...`);
    
    const model = await getEmbedder();
    const output = await model(text, { pooling: 'mean', normalize: true });
    
    // Convert to regular array
    const embedding = Array.from(output.data);
    
    console.log(`  ✅ Embedding created successfully (${embedding.length} dimensions)`);
    return embedding;
  } catch (error) {
    console.error(`  ❌ Failed to create embedding:`, error.message);
    throw error;
  }
}

async function indexFile(filePath, repoPath) {
  const relativePath = path.relative(repoPath, filePath);
  console.log(`\n📄 Processing file: ${relativePath}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  console.log(`  📖 Read file content: ${content.length} characters`);
  
  const ext = path.extname(filePath);
  
  let fileType = 'code';
  if (ext === '.md') fileType = 'documentation';
  else if (ext === '.json') fileType = 'config';
  
  console.log(`  📁 File type: ${fileType} (${ext})`);
  
  const chunks = chunkContent(content, relativePath);
  const vectors = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`\n  📦 Processing chunk ${i + 1}/${chunks.length} (lines ${chunk.startLine}-${chunk.endLine})`);
    
    const contextText = `
File: ${relativePath}
Type: ${fileType}
Lines: ${chunk.startLine}-${chunk.endLine}
Content:
${chunk.content}
    `.trim();
    
    console.log(`  📝 Context text prepared (${contextText.length} chars)`);
    
    const embedding = await createEmbedding(contextText);
    
    const vectorId = `${relativePath}:${chunk.startLine}-${chunk.endLine}`;
    console.log(`  🎯 Creating vector with ID: ${vectorId}`);
    
    vectors.push({
      id: vectorId,
      values: embedding,
      metadata: {
        filePath: relativePath,
        fileType,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content.slice(0, 2000),
        extension: ext
      }
    });
    
    console.log(`  ✅ Vector created successfully`);
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log(`  📊 Total vectors created for this file: ${vectors.length}`);
  return vectors;
}

async function indexCodebase() {
  console.log('🚀 Starting codebase indexing...\n');
  console.log(`📂 Repository path: ${REPO_PATH}`);
  console.log(`📊 Index name: ${INDEX_NAME}`);
  console.log(`⚙️  Batch size: ${BATCH_SIZE}`);
  console.log(`⚙️  Chunk size: ${CHUNK_SIZE}\n`);
  
  // Check if repo path exists
  if (!fs.existsSync(REPO_PATH)) {
    console.error(`❌ Repository path does not exist: ${REPO_PATH}`);
    throw new Error(`Repository path not found: ${REPO_PATH}`);
  }
  
  console.log('🔌 Initializing Pinecone index...');
  const index = pinecone.index(INDEX_NAME);
  console.log('✅ Pinecone index initialized\n');
  
  console.log('📝 Loading .gitignore patterns...');
  const ig = loadGitignore(REPO_PATH);
  console.log('✅ .gitignore loaded\n');
  
  const pattern = `**/*{${CODE_EXTENSIONS.join(',')}}`;
  console.log(`🔍 Searching for files with pattern: ${pattern}`);
  const files = await glob(pattern, {
    cwd: REPO_PATH,
    absolute: true,
    ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
  });
  
  console.log(`📁 Found ${files.length} files before filtering\n`);
  
  const filteredFiles = files.filter(file => {
    const relativePath = path.relative(REPO_PATH, file);
    const shouldInclude = !ig.ignores(relativePath);
    if (!shouldInclude) {
      console.log(`  ⏭️  Skipping ignored file: ${relativePath}`);
    }
    return shouldInclude;
  });
  
  console.log(`\n📁 Final count: ${filteredFiles.length} files to index\n`);
  
  if (filteredFiles.length === 0) {
    console.warn('⚠️  No files found to index!');
    return;
  }
  
  let allVectors = [];
  let processedFiles = 0;
  let totalChunks = 0;
  
  for (const file of filteredFiles) {
    try {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📄 File ${processedFiles + 1}/${filteredFiles.length}: ${path.relative(REPO_PATH, file)}`);
      console.log('='.repeat(80));
      
      const vectors = await indexFile(file, REPO_PATH);
      
      console.log(`\n  ✅ Successfully processed file with ${vectors.length} vectors`);
      allVectors.push(...vectors);
      totalChunks += vectors.length;
      processedFiles++;
      
      console.log(`\n  📊 Progress: ${processedFiles}/${filteredFiles.length} files, ${totalChunks} total chunks`);
      
      if (allVectors.length >= BATCH_SIZE) {
        console.log(`\n📤 Batch size reached (${allVectors.length} vectors), uploading to Pinecone...`);
        try {
          await index.upsert(allVectors);
          console.log(`✅ Successfully uploaded batch to Pinecone`);
          allVectors = [];
        } catch (error) {
          console.error(`❌ Failed to upload batch to Pinecone:`, error.message);
          if (error.response) {
            console.error(`📋 Pinecone Error Details:`, error.response.data);
          }
          throw error;
        }
      }
    } catch (error) {
      console.error(`\n❌ Error processing ${file}:`);
      console.error(`   Message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      console.log(`\n⏭️  Continuing with next file...\n`);
    }
  }
  
  if (allVectors.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📤 Uploading final batch of ${allVectors.length} vectors to Pinecone...`);
    try {
      await index.upsert(allVectors);
      console.log(`✅ Successfully uploaded final batch`);
    } catch (error) {
      console.error(`❌ Failed to upload final batch:`, error.message);
      if (error.response) {
        console.error(`📋 Pinecone Error Details:`, error.response.data);
      }
      throw error;
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Indexing complete!');
  console.log(`📊 Summary:`);
  console.log(`   - Processed files: ${processedFiles}/${filteredFiles.length}`);
  console.log(`   - Total chunks created: ${totalChunks}`);
  
  try {
    console.log('\n📈 Fetching index statistics from Pinecone...');
    const stats = await index.describeIndexStats();
    console.log(`✅ Total vectors in index: ${stats.totalRecordCount}`);
    console.log(`📋 Index stats:`, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error(`⚠️  Failed to fetch index stats:`, error.message);
  }
  console.log('='.repeat(80));
}

indexCodebase().catch((error) => {
  console.error('\n❌ FATAL ERROR:');
  console.error('='.repeat(80));
  console.error(`Message: ${error.message}`);
  console.error(`Stack: ${error.stack}`);
  if (error.response) {
    console.error(`Response data:`, error.response.data);
  }
  console.error('='.repeat(80));
  process.exit(1);
});
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createEmbedding, prepareCodeForEmbedding } from '../lib/embeddings.js';
import { upsertVectors, getIndexStats } from '../lib/pinecone.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Configuration
const REPO_OWNER = 'niravashar-frontend';
const REPO_NAME = 'Smart-Payment';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// File extensions to index (focus on React/JS/TS)
const VALID_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.json', '.css', '.scss',
  '.html', '.md'
];

// Files/folders to skip
const IGNORE_PATTERNS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  'package-lock.json',
  '.min.js',
  '.min.css',
  '.map'
];

/**
 * Check if file should be indexed
 */
function shouldIndexFile(filename) {
  // Check if file has valid extension
  const hasValidExt = VALID_EXTENSIONS.some(ext => filename.endsWith(ext));
  if (!hasValidExt) return false;

  // Check if file matches ignore patterns
  const shouldIgnore = IGNORE_PATTERNS.some(pattern => 
    filename.includes(pattern)
  );
  
  return !shouldIgnore;
}

/**
 * Fetch all files from GitHub repository
 */
async function fetchRepoFiles(octokit, owner, repo, path = '') {
  console.log(`📂 Fetching files from: ${path || 'root'}...`);
  
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
    });

    let files = [];

    for (const item of data) {
      if (item.type === 'file' && shouldIndexFile(item.path)) {
        files.push(item);
      } else if (item.type === 'dir' && !IGNORE_PATTERNS.some(p => item.path.includes(p))) {
        // Recursively fetch files from subdirectories
        const subFiles = await fetchRepoFiles(octokit, owner, repo, item.path);
        files = files.concat(subFiles);
      }
    }

    return files;
  } catch (error) {
    console.error(`❌ Error fetching ${path}:`, error.message);
    return [];
  }
}

/**
 * Fetch file content from GitHub
 */
async function fetchFileContent(octokit, owner, repo, file) {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: file.path,
    });

    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Error fetching content for ${file.path}:`, error.message);
    return null;
  }
}

/**
 * Process and index a batch of files
 */
async function indexFiles(files, octokit, owner, repo) {
  console.log(`\n🔄 Processing ${files.length} files...`);
  
  const vectors = [];
  let processedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    try {
      console.log(`  📄 Processing: ${file.path}`);
      
      // Fetch file content
      const content = await fetchFileContent(octokit, owner, repo, file);
      
      if (!content) {
        skippedCount++;
        continue;
      }

      // Skip very large files (> 50KB)
      if (content.length > 50000) {
        console.log(`    ⚠️  Skipping (too large): ${file.path}`);
        skippedCount++;
        continue;
      }

      // Prepare content for embedding
      const preparedText = prepareCodeForEmbedding(content, file.path);

      // Create embedding
      const embedding = await createEmbedding(preparedText);

      // Create vector object for Pinecone
      const vector = {
        id: `code-${file.sha}`, // Use file SHA as unique ID
        values: embedding,
        metadata: {
          type: 'code',
          filename: file.path,
          size: file.size,
          content: content.substring(0, 2000), // Store first 2000 chars for context
          url: file.html_url,
          sha: file.sha,
          indexedAt: new Date().toISOString(),
        }
      };

      vectors.push(vector);
      processedCount++;

      // Upsert in batches of 50 to avoid memory issues
      if (vectors.length >= 50) {
        console.log(`\n  💾 Uploading batch of ${vectors.length} vectors to Pinecone...`);
        await upsertVectors(vectors);
        vectors.length = 0; // Clear the array
      }

    } catch (error) {
      console.error(`    ❌ Error processing ${file.path}:`, error.message);
      skippedCount++;
    }
  }

  // Upsert remaining vectors
  if (vectors.length > 0) {
    console.log(`\n  💾 Uploading final batch of ${vectors.length} vectors to Pinecone...`);
    await upsertVectors(vectors);
  }

  return { processedCount, skippedCount };
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting Codebase Indexing...\n');

  // Validate environment variables
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN not found in environment variables');
  }
  if (!REPO_OWNER || !REPO_NAME) {
    throw new Error('TARGET_REPO_OWNER and TARGET_REPO_NAME must be set');
  }

  console.log(`📦 Target Repository: ${REPO_OWNER}/${REPO_NAME}\n`);

  // Initialize Octokit
  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  // Verify repository access
  try {
    await octokit.repos.get({ owner: REPO_OWNER, repo: REPO_NAME });
    console.log('✅ Repository access verified\n');
  } catch (error) {
    throw new Error(`Cannot access repository: ${error.message}`);
  }

  // Fetch all files from repository
  console.log('📥 Fetching repository files...\n');
  const files = await fetchRepoFiles(octokit, REPO_OWNER, REPO_NAME);
  console.log(`\n✅ Found ${files.length} files to index\n`);

  if (files.length === 0) {
    console.log('⚠️  No files found to index. Check your repository and filters.');
    return;
  }

  // Index files
  const { processedCount, skippedCount } = await indexFiles(files, octokit, REPO_OWNER, REPO_NAME);

  // Get final stats
  console.log('\n📊 Getting index statistics...');
  const stats = await getIndexStats();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ INDEXING COMPLETE!');
  console.log('='.repeat(60));
  console.log(`📈 Files processed: ${processedCount}`);
  console.log(`⏭️  Files skipped: ${skippedCount}`);
  console.log(`💾 Total vectors in index: ${stats.totalRecordCount || 0}`);
  console.log('='.repeat(60) + '\n');
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal Error:', error.message);
  process.exit(1);
});

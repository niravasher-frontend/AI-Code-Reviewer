import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createEmbedding, prepareDocForEmbedding } from '../lib/embeddings.js';
import { upsertVectors, getIndexStats } from '../lib/pinecone.js';
import { glob } from 'glob';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Documentation directory
const DOCS_DIR = path.join(__dirname, '..', 'docs');

/**
 * Parse markdown file into sections
 * Each section (separated by ## headers) will be indexed separately
 */
function parseMarkdownSections(content, filename) {
  const sections = [];
  
  // Split by h2 headers (##)
  const parts = content.split(/^## /gm);
  
  if (parts.length === 1) {
    // No sections, treat entire content as one
    sections.push({
      title: filename.replace('.md', ''),
      content: content.trim(),
    });
  } else {
    // First part is before any h2 (might be h1 or intro)
    if (parts[0].trim()) {
      sections.push({
        title: filename.replace('.md', '') + ' - Introduction',
        content: parts[0].trim(),
      });
    }
    
    // Process h2 sections
    for (let i = 1; i < parts.length; i++) {
      const lines = parts[i].split('\n');
      const sectionTitle = lines[0].trim();
      const sectionContent = lines.slice(1).join('\n').trim();
      
      if (sectionContent) {
        sections.push({
          title: `${filename.replace('.md', '')} - ${sectionTitle}`,
          content: sectionContent,
        });
      }
    }
  }
  
  return sections;
}

/**
 * Read and parse all documentation files
 */
async function readDocumentationFiles() {
  console.log(`📂 Reading documentation from: ${DOCS_DIR}\n`);
  
  // Create docs directory if it doesn't exist
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    console.log('📁 Created docs/ directory');
    console.log('ℹ️  Please add your documentation files (.md, .txt) to the docs/ folder\n');
    return [];
  }

  // Find all markdown and text files
  const patterns = [
    path.join(DOCS_DIR, '**/*.md'),
    path.join(DOCS_DIR, '**/*.txt'),
  ];

  let allFiles = [];
  for (const pattern of patterns) {
    const files = await glob(pattern);
    allFiles = allFiles.concat(files);
  }

  if (allFiles.length === 0) {
    console.log('⚠️  No documentation files found in docs/ directory');
    console.log('ℹ️  Add .md or .txt files to docs/ and run this script again\n');
    return [];
  }

  console.log(`✅ Found ${allFiles.length} documentation file(s)\n`);

  const allSections = [];

  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const filename = path.basename(filePath);
      
      console.log(`  📄 Processing: ${filename}`);

      if (filePath.endsWith('.md')) {
        // Parse markdown into sections
        const sections = parseMarkdownSections(content, filename);
        console.log(`    📑 Found ${sections.length} section(s)`);
        
        sections.forEach(section => {
          allSections.push({
            ...section,
            filename,
            filepath: filePath,
          });
        });
      } else {
        // Treat entire text file as one section
        allSections.push({
          title: filename.replace('.txt', ''),
          content: content.trim(),
          filename,
          filepath: filePath,
        });
        console.log(`    📑 Added as single section`);
      }
    } catch (error) {
      console.error(`    ❌ Error reading ${filePath}:`, error.message);
    }
  }

  return allSections;
}

/**
 * Index documentation sections
 */
async function indexDocumentation(sections) {
  console.log(`\n🔄 Indexing ${sections.length} documentation section(s)...\n`);
  
  const vectors = [];
  let processedCount = 0;

  for (const section of sections) {
    try {
      console.log(`  📝 Indexing: ${section.title}`);
      
      // Prepare content for embedding
      const preparedText = prepareDocForEmbedding(section.content, section.title);

      // Create embedding
      const embedding = await createEmbedding(preparedText);

      // Create vector object for Pinecone
      const vector = {
        id: `doc-${Buffer.from(section.title).toString('base64').substring(0, 50)}-${Date.now()}`,
        values: embedding,
        metadata: {
          type: 'documentation',
          title: section.title,
          filename: section.filename,
          content: section.content.substring(0, 2000), // Store first 2000 chars
          indexedAt: new Date().toISOString(),
        }
      };

      vectors.push(vector);
      processedCount++;

      // Upsert in batches of 20
      if (vectors.length >= 20) {
        console.log(`\n  💾 Uploading batch of ${vectors.length} vectors to Pinecone...`);
        await upsertVectors(vectors);
        vectors.length = 0;
      }

    } catch (error) {
      console.error(`    ❌ Error indexing ${section.title}:`, error.message);
    }
  }

  // Upsert remaining vectors
  if (vectors.length > 0) {
    console.log(`\n  💾 Uploading final batch of ${vectors.length} vectors to Pinecone...`);
    await upsertVectors(vectors);
  }

  return processedCount;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting Documentation Indexing...\n');
  console.log('='.repeat(60) + '\n');

  // Read documentation files
  const sections = await readDocumentationFiles();

  if (sections.length === 0) {
    console.log('ℹ️  No documentation to index. Exiting.\n');
    return;
  }

  // Index documentation
  const processedCount = await indexDocumentation(sections);

  // Get final stats
  console.log('\n📊 Getting index statistics...');
  const stats = await getIndexStats();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ DOCUMENTATION INDEXING COMPLETE!');
  console.log('='.repeat(60));
  console.log(`📈 Sections indexed: ${processedCount}`);
  console.log(`💾 Total vectors in index: ${stats.totalRecordCount || 0}`);
  console.log('='.repeat(60) + '\n');
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal Error:', error.message);
  process.exit(1);
});

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createEmbedding } from '../lib/embeddings.js';
import { queryVectors, getIndexStats } from '../lib/pinecone.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

/**
 * Display search results in a formatted way
 */
function displayResults(results, query) {
  console.log('\n' + '='.repeat(80));
  console.log(`🔍 Query: "${query}"`);
  console.log('='.repeat(80) + '\n');

  if (results.length === 0) {
    console.log('❌ No results found\n');
    return;
  }

  results.forEach((result, index) => {
    const metadata = result.metadata || {};
    const score = (result.score * 100).toFixed(2);
    
    console.log(`📌 Result ${index + 1} (Similarity: ${score}%)`);
    console.log('─'.repeat(80));
    
    if (metadata.type === 'code') {
      console.log(`📄 Type: Code`);
      console.log(`📁 File: ${metadata.filename || 'Unknown'}`);
      console.log(`🔗 URL: ${metadata.url || 'N/A'}`);
      console.log(`📊 Size: ${metadata.size || 'N/A'} bytes`);
    } else if (metadata.type === 'documentation') {
      console.log(`📄 Type: Documentation`);
      console.log(`📋 Title: ${metadata.title || 'Unknown'}`);
      console.log(`📁 File: ${metadata.filename || 'Unknown'}`);
    }
    
    console.log(`🕐 Indexed: ${metadata.indexedAt || 'N/A'}`);
    
    if (metadata.content) {
      const preview = metadata.content.length > 300 
        ? metadata.content.substring(0, 300) + '...' 
        : metadata.content;
      console.log(`\n📝 Content Preview:\n${preview}`);
    }
    
    console.log('\n');
  });
}

/**
 * Test retrieval with a query
 */
async function testQuery(query, topK = 5, filterType = null) {
  try {
    // Create embedding for the query
    console.log('🔄 Creating query embedding...');
    const queryEmbedding = await createEmbedding(query);
    
    // Query Pinecone
    console.log('🔍 Searching Pinecone...');
    const filter = filterType ? { type: filterType } : {};
    const results = await queryVectors(queryEmbedding, topK, filter);
    
    // Display results
    displayResults(results, query);
    
    return results;
  } catch (error) {
    console.error('❌ Error during query:', error.message);
    throw error;
  }
}

/**
 * Run multiple test queries
 */
async function runTestSuite() {
  console.log('🧪 Starting RAG System Test Suite\n');
  
  // Get index stats first
  console.log('📊 Fetching index statistics...\n');
  const stats = await getIndexStats();
  
  console.log('='.repeat(80));
  console.log('INDEX STATISTICS');
  console.log('='.repeat(80));
  console.log(`💾 Total Vectors: ${stats.totalRecordCount || 0}`);
  console.log(`📦 Dimension: ${stats.dimension || 'N/A'}`);
  console.log('='.repeat(80));

  if (!stats.totalRecordCount || stats.totalRecordCount === 0) {
    console.log('\n⚠️  Index is empty! Please run indexing scripts first:');
    console.log('   npm run index:codebase');
    console.log('   npm run index:docs\n');
    return;
  }

  // Test queries
  const testQueries = [
    {
      name: 'General Code Search',
      query: 'React component that handles user authentication',
      topK: 3,
    },
    {
      name: 'Documentation Search',
      query: 'business logic and requirements',
      topK: 3,
      filter: 'documentation',
    },
    {
      name: 'Code Pattern Search',
      query: 'API calls and error handling',
      topK: 3,
      filter: 'code',
    },
    {
      name: 'Specific Feature',
      query: 'state management and hooks',
      topK: 3,
    },
  ];

  console.log('\n🚀 Running Test Queries...\n');

  for (const test of testQueries) {
    console.log(`\n${'▶'.repeat(40)}`);
    console.log(`TEST: ${test.name}`);
    console.log('▶'.repeat(40));
    
    await testQuery(test.query, test.topK, test.filter);
    
    // Small delay between queries
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ TEST SUITE COMPLETE');
  console.log('='.repeat(80) + '\n');
}

/**
 * Interactive mode - query from command line
 */
async function interactiveMode() {
  const query = process.argv.slice(2).join(' ');
  
  if (!query) {
    console.log('❌ Please provide a query');
    console.log('Usage: npm run test:retrieval -- your search query here\n');
    return;
  }

  console.log('🔍 Interactive Query Mode\n');
  await testQuery(query, 5);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    // Interactive mode with query
    await interactiveMode();
  } else {
    // Run full test suite
    await runTestSuite();
  }
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal Error:', error.message);
  process.exit(1);
});

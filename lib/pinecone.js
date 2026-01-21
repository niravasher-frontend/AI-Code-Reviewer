import { Pinecone } from '@pinecone-database/pinecone';

let pineconeClient = null;
let pineconeIndex = null;

/**
 * Initialize Pinecone client (singleton pattern)
 * @returns {Promise<Pinecone>} Pinecone client instance
 */
export async function initPinecone() {
  if (pineconeClient) {
    console.log('♻️  [pinecone.js] Using existing Pinecone client');
    return pineconeClient;
  }

  console.log('🔌 [pinecone.js] Initializing new Pinecone client...');
  const apiKey = process.env.PINECONE_API_KEY;
  
  if (!apiKey || apiKey === 'your-pinecone-api-key-here') {
    console.error('❌ [pinecone.js] Pinecone API key is missing or invalid!');
    throw new Error('Pinecone API key not configured');
  }
  
  console.log('✅ [pinecone.js] Pinecone API key found (length: ' + apiKey.length + ')');

  pineconeClient = new Pinecone({
    apiKey: apiKey,
  });

  console.log('✅ [pinecone.js] Pinecone client initialized successfully');
  return pineconeClient;
}

/**
 * Get Pinecone index instance
 * @returns {Promise<Index>} Pinecone index instance
 */
export async function getPineconeIndex() {
  if (pineconeIndex) {
    console.log('♻️  [pinecone.js] Using existing Pinecone index');
    return pineconeIndex;
  }

  const indexName = 'codebase-embedding-384';
  console.log(`🔌 [pinecone.js] Getting Pinecone index: ${indexName}`);
  
  const client = await initPinecone();
  pineconeIndex = client.index(indexName);

  console.log('✅ [pinecone.js] Pinecone index retrieved successfully');
  return pineconeIndex;
}

/**
 * Upsert vectors to Pinecone
 * @param {Array} vectors - Array of vector objects with id, values, and metadata
 * @returns {Promise<void>}
 */
export async function upsertVectors(vectors) {
  console.log(`📤 [pinecone.js] Starting upsert of ${vectors.length} vectors...`);
  
  const index = await getPineconeIndex();
  
  // Pinecone has a limit on batch size, so we chunk if needed
  const BATCH_SIZE = 100;
  const totalBatches = Math.ceil(vectors.length / BATCH_SIZE);
  
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    
    console.log(`📦 [pinecone.js] Upserting batch ${batchNum}/${totalBatches} (${batch.length} vectors)...`);
    
    try {
      await index.upsert(batch);
      console.log(`✅ [pinecone.js] Batch ${batchNum}/${totalBatches} upserted successfully`);
    } catch (error) {
      console.error(`❌ [pinecone.js] Failed to upsert batch ${batchNum}:`, error.message);
      if (error.response) {
        console.error('📋 [pinecone.js] API Response:', error.response.data);
      }
      throw error;
    }
  }
  
  console.log(`✅ [pinecone.js] All vectors upserted successfully`);
}

/**
 * Query Pinecone for similar vectors
 * @param {Array<number>} queryEmbedding - Query vector embedding
 * @param {number} topK - Number of results to return
 * @param {Object} filter - Optional metadata filter
 * @returns {Promise<Array>} Array of matching results with metadata
 */
export async function queryVectors(queryEmbedding, topK = 5, filter = {}) {
  console.log(`🔍 [pinecone.js] Querying vectors (topK: ${topK}, filter: ${JSON.stringify(filter)})...`);
  
  const index = await getPineconeIndex();
  
  const queryRequest = {
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  };

  if (Object.keys(filter).length > 0) {
    queryRequest.filter = filter;
    console.log(`🔧 [pinecone.js] Applied filter:`, filter);
  }

  try {
    const results = await index.query(queryRequest);
    console.log(`✅ [pinecone.js] Query returned ${results.matches?.length || 0} matches`);
    return results.matches || [];
  } catch (error) {
    console.error('❌ [pinecone.js] Query failed:', error.message);
    throw error;
  }
}

/**
 * Delete all vectors from the index (use with caution!)
 * @returns {Promise<void>}
 */
export async function clearIndex() {
  const index = await getPineconeIndex();
  await index.deleteAll();
  console.log('🗑️  Index cleared');
}

/**
 * Get index statistics
 * @returns {Promise<Object>} Index stats
 */
export async function getIndexStats() {
  console.log('📊 [pinecone.js] Fetching index statistics...');
  
  try {
    const index = await getPineconeIndex();
    const stats = await index.describeIndexStats();
    console.log('✅ [pinecone.js] Index stats retrieved:', JSON.stringify(stats, null, 2));
    return stats;
  } catch (error) {
    console.error('❌ [pinecone.js] Failed to get index stats:', error.message);
    throw error;
  }
}

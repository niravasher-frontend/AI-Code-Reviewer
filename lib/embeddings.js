import { pipeline } from '@xenova/transformers';

let embedder = null;

/**
 * Initialize embedding model (singleton pattern)
 * @returns {Promise} Embedding pipeline instance
 */
export async function initEmbedder() {
  if (embedder) {
    console.log('♻️  Using existing embedder');
    return embedder;
  }

  console.log('🔌 Initializing all-MiniLM-L6-v2 embedder (first run downloads model)...');
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('✅ Embedder initialized successfully');
  return embedder;
}

/**
 * Create embeddings for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<Array<number>>} Embedding vector (384 dimensions for all-MiniLM-L6-v2)
 */
export async function createEmbedding(text) {
  const model = await initEmbedder();
  
  console.log(`🤖 [embeddings.js] Creating embedding for text (${text.length} chars)...`);
  
  try {
    const output = await model(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);

    console.log(`✅ [embeddings.js] Embedding created (dimensions: ${embedding.length})`);
    return embedding;
  } catch (error) {
    console.error('❌ [embeddings.js] Error creating embedding:', error.message);
    throw error;
  }
}

/**
 * Create embeddings for multiple texts in batch
 * @param {Array<string>} texts - Array of texts to embed
 * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
 */
export async function createEmbeddings(texts) {
  const model = await initEmbedder();
  
  console.log(`🤖 [embeddings.js] Creating embeddings for ${texts.length} texts...`);
  
  const allEmbeddings = [];

  // Process each text individually (local model is fast enough)
  for (let i = 0; i < texts.length; i++) {
    console.log(`📦 [embeddings.js] Processing ${i + 1}/${texts.length}...`);
    
    try {
      const output = await model(texts[i], { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);
      allEmbeddings.push(embedding);
      
      console.log(`✅ [embeddings.js] Embedding ${i + 1}/${texts.length} completed`);
    } catch (error) {
      console.error(`❌ [embeddings.js] Error creating embedding for text ${i + 1}:`, error.message);
      throw error;
    }
  }

  console.log(`✅ [embeddings.js] All embeddings created: ${allEmbeddings.length} total`);
  return allEmbeddings;
}

/**
 * Truncate text to fit within token limits
 * Rough estimate: 1 token ≈ 4 characters
 * @param {string} text - Text to truncate
 * @param {number} maxTokens - Maximum tokens (default 8000 for embeddings)
 * @returns {string} Truncated text
 */
export function truncateText(text, maxTokens = 8000) {
  const maxChars = maxTokens * 4; // Rough estimate
  
  if (text.length <= maxChars) {
    return text;
  }

  return text.substring(0, maxChars) + '\n... (truncated)';
}

/**
 * Prepare code text for embedding by cleaning and formatting
 * @param {string} code - Raw code text
 * @param {string} filename - File name/path
 * @returns {string} Prepared text for embedding
 */
export function prepareCodeForEmbedding(code, filename) {
  // Add filename as context
  let prepared = `File: ${filename}\n\n${code}`;
  
  // Truncate if too long
  prepared = truncateText(prepared);
  
  return prepared;
}

/**
 * Prepare documentation text for embedding
 * @param {string} content - Documentation content
 * @param {string} title - Document title or section
 * @returns {string} Prepared text for embedding
 */
export function prepareDocForEmbedding(content, title) {
  let prepared = `Documentation: ${title}\n\n${content}`;
  prepared = truncateText(prepared);
  return prepared;
}

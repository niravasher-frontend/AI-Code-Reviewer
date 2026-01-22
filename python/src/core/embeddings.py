"""
Embedding model operations using sentence-transformers.
Singleton pattern for model initialization, batch embedding support.
"""

import logging
import threading
from typing import List, Optional

from sentence_transformers import SentenceTransformer

from src.config import (
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS,
    MAX_TOKENS,
    CHARS_PER_TOKEN,
)

logger = logging.getLogger(__name__)

# Singleton pattern with thread safety
_embedder: Optional[SentenceTransformer] = None
_lock = threading.Lock()


def get_embedder() -> SentenceTransformer:
    """
    Get or initialize the embedding model (singleton pattern).
    Thread-safe initialization with double-check locking.

    Returns:
        SentenceTransformer: The embedding model instance.
    """
    global _embedder

    if _embedder is not None:
        logger.debug("Using existing embedder")
        return _embedder

    with _lock:
        # Double-check after acquiring lock
        if _embedder is None:
            logger.info(f"Initializing {EMBEDDING_MODEL} embedder (first run downloads model)...")
            _embedder = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Embedder initialized successfully")

    return _embedder


def create_embedding(text: str) -> List[float]:
    """
    Create embedding for a single text.

    Args:
        text: Text to embed.

    Returns:
        List of floats representing the embedding vector (384 dimensions).

    Raises:
        Exception: If embedding creation fails.
    """
    model = get_embedder()

    logger.debug(f"Creating embedding for text ({len(text)} chars)...")

    try:
        # sentence-transformers returns numpy array, normalize=True by default
        embedding = model.encode(text, normalize_embeddings=True)
        embedding_list = embedding.tolist()

        logger.debug(f"Embedding created (dimensions: {len(embedding_list)})")

        if len(embedding_list) != EMBEDDING_DIMENSIONS:
            logger.warning(
                f"Unexpected embedding dimensions: {len(embedding_list)} "
                f"(expected {EMBEDDING_DIMENSIONS})"
            )

        return embedding_list
    except Exception as e:
        logger.error(f"Error creating embedding: {e}")
        raise


def create_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Create embeddings for multiple texts in batch.

    Args:
        texts: List of texts to embed.

    Returns:
        List of embedding vectors.

    Raises:
        Exception: If embedding creation fails.
    """
    model = get_embedder()

    logger.info(f"Creating embeddings for {len(texts)} texts...")

    try:
        # sentence-transformers supports batch encoding efficiently
        embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        embeddings_list = [emb.tolist() for emb in embeddings]

        logger.info(f"All embeddings created: {len(embeddings_list)} total")
        return embeddings_list
    except Exception as e:
        logger.error(f"Error creating batch embeddings: {e}")
        raise


def truncate_text(text: str, max_tokens: int = MAX_TOKENS) -> str:
    """
    Truncate text to fit within token limits.
    Rough estimate: 1 token ≈ 4 characters.

    Args:
        text: Text to truncate.
        max_tokens: Maximum tokens (default 8000 for embeddings).

    Returns:
        Truncated text if necessary, otherwise original text.
    """
    max_chars = max_tokens * CHARS_PER_TOKEN

    if len(text) <= max_chars:
        return text

    return text[:max_chars] + "\n... (truncated)"


def prepare_code_for_embedding(code: str, filename: str) -> str:
    """
    Prepare code text for embedding by adding context and formatting.

    Args:
        code: Raw code text.
        filename: File name/path for context.

    Returns:
        Prepared text for embedding.
    """
    prepared = f"File: {filename}\n\n{code}"
    prepared = truncate_text(prepared)
    return prepared


def prepare_doc_for_embedding(content: str, title: str) -> str:
    """
    Prepare documentation text for embedding.

    Args:
        content: Documentation content.
        title: Document title or section name.

    Returns:
        Prepared text for embedding.
    """
    prepared = f"Documentation: {title}\n\n{content}"
    prepared = truncate_text(prepared)
    return prepared

"""
Pinecone vector database operations.
Singleton pattern for client/index initialization, batch upsert support.
"""

import logging
import math
from typing import Any, Dict, List, Optional

from pinecone import Pinecone

from src.config import get_settings, PINECONE_BATCH_SIZE

logger = logging.getLogger(__name__)

# Singleton instances
_pinecone_client: Optional[Pinecone] = None
_pinecone_index: Optional[Any] = None


def init_pinecone() -> Pinecone:
    """
    Initialize Pinecone client (singleton pattern).

    Returns:
        Pinecone client instance.

    Raises:
        ValueError: If API key is not configured.
    """
    global _pinecone_client

    if _pinecone_client is not None:
        logger.debug("Using existing Pinecone client")
        return _pinecone_client

    logger.info("Initializing new Pinecone client...")
    settings = get_settings()
    api_key = settings.pinecone_api_key

    if not api_key or api_key == "your-pinecone-api-key-here":
        logger.error("Pinecone API key is missing or invalid!")
        raise ValueError("Pinecone API key not configured")

    logger.debug(f"Pinecone API key found (length: {len(api_key)})")

    _pinecone_client = Pinecone(api_key=api_key)

    logger.info("Pinecone client initialized successfully")
    return _pinecone_client


def get_pinecone_index() -> Any:
    """
    Get Pinecone index instance (singleton pattern).

    Returns:
        Pinecone index instance.
    """
    global _pinecone_index

    if _pinecone_index is not None:
        logger.debug("Using existing Pinecone index")
        return _pinecone_index

    settings = get_settings()
    index_name = settings.pinecone_index_name

    logger.info(f"Getting Pinecone index: {index_name}")

    client = init_pinecone()
    _pinecone_index = client.Index(index_name)

    logger.info("Pinecone index retrieved successfully")
    return _pinecone_index


def upsert_vectors(vectors: List[Dict[str, Any]]) -> None:
    """
    Upsert vectors to Pinecone in batches.

    Args:
        vectors: List of vector objects with id, values, and metadata.
            Each vector should have:
            - id: str - Unique identifier
            - values: List[float] - Embedding vector
            - metadata: Dict - Searchable metadata

    Raises:
        Exception: If upsert fails.
    """
    logger.info(f"Starting upsert of {len(vectors)} vectors...")

    index = get_pinecone_index()

    total_batches = math.ceil(len(vectors) / PINECONE_BATCH_SIZE)

    for i in range(0, len(vectors), PINECONE_BATCH_SIZE):
        batch = vectors[i : i + PINECONE_BATCH_SIZE]
        batch_num = (i // PINECONE_BATCH_SIZE) + 1

        logger.info(f"Upserting batch {batch_num}/{total_batches} ({len(batch)} vectors)...")

        try:
            index.upsert(vectors=batch)
            logger.info(f"Batch {batch_num}/{total_batches} upserted successfully")
        except Exception as e:
            logger.error(f"Failed to upsert batch {batch_num}: {e}")
            raise

    logger.info("All vectors upserted successfully")


def query_vectors(
    query_embedding: List[float],
    top_k: int = 5,
    filter: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Query Pinecone for similar vectors.

    Args:
        query_embedding: Query vector embedding.
        top_k: Number of results to return.
        filter: Optional metadata filter.

    Returns:
        List of matching results with metadata.

    Raises:
        Exception: If query fails.
    """
    filter = filter or {}
    logger.info(f"Querying vectors (topK: {top_k}, filter: {filter})...")

    index = get_pinecone_index()

    query_params = {
        "vector": query_embedding,
        "top_k": top_k,
        "include_metadata": True,
    }

    if filter:
        query_params["filter"] = filter
        logger.debug(f"Applied filter: {filter}")

    try:
        results = index.query(**query_params)
        matches = results.get("matches", [])
        logger.info(f"Query returned {len(matches)} matches")
        return matches
    except Exception as e:
        logger.error(f"Query failed: {e}")
        raise


def clear_index() -> None:
    """
    Delete all vectors from the index.
    Use with caution - this is irreversible!
    """
    index = get_pinecone_index()
    index.delete(delete_all=True)
    logger.warning("Index cleared")


def get_index_stats() -> Dict[str, Any]:
    """
    Get index statistics.

    Returns:
        Dict containing index stats (totalRecordCount, dimension, etc.)

    Raises:
        Exception: If stats retrieval fails.
    """
    logger.info("Fetching index statistics...")

    try:
        index = get_pinecone_index()
        stats = index.describe_index_stats()
        logger.info(f"Index stats retrieved: {stats}")
        return stats
    except Exception as e:
        logger.error(f"Failed to get index stats: {e}")
        raise

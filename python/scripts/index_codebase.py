#!/usr/bin/env python3
"""
Index a GitHub repository into Pinecone vector database.
Fetches all code files and creates embeddings for semantic search.
"""

import logging
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

from src.config import (
    get_settings,
    CODE_BATCH_SIZE,
    MAX_FILE_SIZE,
    VALID_INDEX_EXTENSIONS,
    IGNORE_PATTERNS,
    METADATA_CONTENT_LENGTH,
)
from src.core.embeddings import create_embedding, prepare_code_for_embedding
from src.core.github_client import (
    get_repository,
    verify_repo_access,
    fetch_repo_files,
    get_file_content,
)
from src.core.pinecone_client import upsert_vectors, get_index_stats

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def index_files(files: list, owner: str, repo: str) -> dict:
    """
    Process and index a list of files.

    Args:
        files: List of file objects from GitHub.
        owner: Repository owner.
        repo: Repository name.

    Returns:
        Dict with processedCount and skippedCount.
    """
    logger.info(f"Processing {len(files)} files...")

    vectors = []
    processed_count = 0
    skipped_count = 0

    for file in files:
        file_path = file.get("path", "")
        try:
            logger.info(f"  Processing: {file_path}")

            # Fetch file content
            content = get_file_content(owner, repo, file_path)

            if not content:
                skipped_count += 1
                continue

            # Skip very large files
            if len(content) > MAX_FILE_SIZE:
                logger.warning(f"    Skipping (too large): {file_path}")
                skipped_count += 1
                continue

            # Prepare content for embedding
            prepared_text = prepare_code_for_embedding(content, file_path)

            # Create embedding
            embedding = create_embedding(prepared_text)

            # Create vector object for Pinecone
            vector = {
                "id": f"code-{file.get('sha', '')}",
                "values": embedding,
                "metadata": {
                    "type": "code",
                    "filename": file_path,
                    "size": file.get("size", 0),
                    "content": content[:METADATA_CONTENT_LENGTH],
                    "url": file.get("html_url", ""),
                    "sha": file.get("sha", ""),
                    "indexedAt": datetime.utcnow().isoformat(),
                },
            }

            vectors.append(vector)
            processed_count += 1

            # Upsert in batches
            if len(vectors) >= CODE_BATCH_SIZE:
                logger.info(f"  Uploading batch of {len(vectors)} vectors to Pinecone...")
                upsert_vectors(vectors)
                vectors.clear()

        except Exception as e:
            logger.error(f"    Error processing {file_path}: {e}")
            skipped_count += 1

    # Upsert remaining vectors
    if vectors:
        logger.info(f"  Uploading final batch of {len(vectors)} vectors to Pinecone...")
        upsert_vectors(vectors)

    return {"processedCount": processed_count, "skippedCount": skipped_count}


def main():
    """Main function to index a GitHub repository."""
    logger.info("Starting Codebase Indexing...")
    logger.info("=" * 60)

    settings = get_settings()

    # Validate configuration
    if not settings.target_repo_owner or not settings.target_repo_name:
        logger.error("TARGET_REPO_OWNER and TARGET_REPO_NAME must be set in environment")
        sys.exit(1)

    owner = settings.target_repo_owner
    repo = settings.target_repo_name

    logger.info(f"Target Repository: {owner}/{repo}")

    # Verify repository access
    try:
        verify_repo_access(owner, repo)
        logger.info("Repository access verified")
    except Exception as e:
        logger.error(f"Cannot access repository: {e}")
        sys.exit(1)

    # Fetch all files from repository
    logger.info("Fetching repository files...")
    files = fetch_repo_files(
        owner,
        repo,
        valid_extensions=VALID_INDEX_EXTENSIONS,
        ignore_patterns=IGNORE_PATTERNS,
    )
    logger.info(f"Found {len(files)} files to index")

    if not files:
        logger.warning("No files found to index. Check your repository and filters.")
        return

    # Index files
    result = index_files(files, owner, repo)

    # Get final stats
    logger.info("Getting index statistics...")
    stats = get_index_stats()

    logger.info("=" * 60)
    logger.info("INDEXING COMPLETE!")
    logger.info("=" * 60)
    logger.info(f"Files processed: {result['processedCount']}")
    logger.info(f"Files skipped: {result['skippedCount']}")
    logger.info(f"Total vectors in index: {stats.get('total_vector_count', 0)}")
    logger.info("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"Fatal Error: {e}")
        sys.exit(1)

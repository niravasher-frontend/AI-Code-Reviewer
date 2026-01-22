#!/usr/bin/env python3
"""
Index a local repository into Pinecone vector database.
Reads files from filesystem, chunks them, and creates embeddings.
"""

import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
import pathspec

from src.config import (
    get_settings,
    PINECONE_BATCH_SIZE,
    CHUNK_SIZE,
    VALID_CODE_EXTENSIONS,
    METADATA_CONTENT_LENGTH,
)
from src.core.embeddings import create_embedding
from src.core.pinecone_client import get_pinecone_index, get_index_stats

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Default ignore patterns
DEFAULT_IGNORES = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    ".vercel",
    "__pycache__",
    ".pytest_cache",
    "venv",
    ".venv",
    "*.log",
    "*.pyc",
]


def load_gitignore(repo_path: Path) -> pathspec.PathSpec:
    """
    Load .gitignore patterns from repository.

    Args:
        repo_path: Path to repository root.

    Returns:
        PathSpec object for matching ignored files.
    """
    patterns = list(DEFAULT_IGNORES)

    gitignore_path = repo_path / ".gitignore"
    if gitignore_path.exists():
        with open(gitignore_path, "r") as f:
            gitignore_content = f.read()
            patterns.extend(gitignore_content.splitlines())

    return pathspec.PathSpec.from_lines("gitwildmatch", patterns)


def chunk_content(content: str, file_path: str, max_chars: int = CHUNK_SIZE) -> List[Dict[str, Any]]:
    """
    Split file content into chunks with line number tracking.

    Args:
        content: File content.
        file_path: Relative file path.
        max_chars: Maximum characters per chunk.

    Returns:
        List of chunk objects with content, startLine, endLine, filePath.
    """
    logger.debug(f"  Chunking file: {file_path} ({len(content)} chars)")

    chunks = []
    lines = content.split("\n")
    current_chunk = ""
    start_line = 1
    current_line = 1

    for line in lines:
        if len(current_chunk + line) > max_chars and current_chunk:
            chunks.append({
                "content": current_chunk.strip(),
                "startLine": start_line,
                "endLine": current_line - 1,
                "filePath": file_path,
            })
            current_chunk = line + "\n"
            start_line = current_line
        else:
            current_chunk += line + "\n"
        current_line += 1

    if current_chunk.strip():
        chunks.append({
            "content": current_chunk.strip(),
            "startLine": start_line,
            "endLine": current_line - 1,
            "filePath": file_path,
        })

    logger.debug(f"  Created {len(chunks)} chunks from {file_path}")
    return chunks


def get_file_type(extension: str) -> str:
    """Get file type from extension."""
    if extension == ".md":
        return "documentation"
    elif extension == ".json":
        return "config"
    else:
        return "code"


def index_file(file_path: Path, repo_path: Path) -> List[Dict[str, Any]]:
    """
    Index a single file into vectors.

    Args:
        file_path: Absolute path to file.
        repo_path: Repository root path.

    Returns:
        List of vector objects.
    """
    relative_path = str(file_path.relative_to(repo_path))
    logger.info(f"Processing file: {relative_path}")

    content = file_path.read_text(encoding="utf-8", errors="ignore")
    logger.debug(f"  Read file content: {len(content)} characters")

    ext = file_path.suffix.lower()
    file_type = get_file_type(ext)

    logger.debug(f"  File type: {file_type} ({ext})")

    chunks = chunk_content(content, relative_path)
    vectors = []

    for i, chunk in enumerate(chunks):
        logger.debug(f"  Processing chunk {i + 1}/{len(chunks)} (lines {chunk['startLine']}-{chunk['endLine']})")

        context_text = f"""File: {relative_path}
Type: {file_type}
Lines: {chunk['startLine']}-{chunk['endLine']}
Content:
{chunk['content']}""".strip()

        embedding = create_embedding(context_text)

        vector_id = f"{relative_path}:{chunk['startLine']}-{chunk['endLine']}"

        vectors.append({
            "id": vector_id,
            "values": embedding,
            "metadata": {
                "filePath": relative_path,
                "fileType": file_type,
                "startLine": chunk["startLine"],
                "endLine": chunk["endLine"],
                "content": chunk["content"][:METADATA_CONTENT_LENGTH],
                "extension": ext,
            },
        })

        # Small delay to prevent rate limiting
        time.sleep(0.05)

    logger.info(f"  Created {len(vectors)} vectors")
    return vectors


def find_code_files(repo_path: Path, ignore_spec: pathspec.PathSpec) -> List[Path]:
    """
    Find all code files in repository.

    Args:
        repo_path: Repository root path.
        ignore_spec: PathSpec for ignored files.

    Returns:
        List of file paths.
    """
    files = []

    for ext in VALID_CODE_EXTENSIONS:
        pattern = f"**/*{ext}"
        for file_path in repo_path.glob(pattern):
            relative_path = str(file_path.relative_to(repo_path))
            if not ignore_spec.match_file(relative_path):
                files.append(file_path)
            else:
                logger.debug(f"  Skipping ignored file: {relative_path}")

    return files


def index_codebase(repo_path: str):
    """
    Index entire local codebase.

    Args:
        repo_path: Path to local repository.
    """
    logger.info("Starting codebase indexing...")
    logger.info(f"Repository path: {repo_path}")
    logger.info(f"Batch size: {PINECONE_BATCH_SIZE}")
    logger.info(f"Chunk size: {CHUNK_SIZE}")

    repo_path = Path(repo_path)

    if not repo_path.exists():
        logger.error(f"Repository path does not exist: {repo_path}")
        raise FileNotFoundError(f"Repository path not found: {repo_path}")

    # Initialize Pinecone
    logger.info("Initializing Pinecone index...")
    index = get_pinecone_index()
    logger.info("Pinecone index initialized")

    # Load gitignore
    logger.info("Loading .gitignore patterns...")
    ignore_spec = load_gitignore(repo_path)
    logger.info(".gitignore loaded")

    # Find files
    logger.info("Searching for code files...")
    files = find_code_files(repo_path, ignore_spec)
    logger.info(f"Found {len(files)} files to index")

    if not files:
        logger.warning("No files found to index!")
        return

    all_vectors = []
    processed_files = 0
    total_chunks = 0

    for file_path in files:
        try:
            logger.info("=" * 80)
            logger.info(f"File {processed_files + 1}/{len(files)}: {file_path.relative_to(repo_path)}")

            vectors = index_file(file_path, repo_path)

            all_vectors.extend(vectors)
            total_chunks += len(vectors)
            processed_files += 1

            logger.info(f"  Progress: {processed_files}/{len(files)} files, {total_chunks} total chunks")

            if len(all_vectors) >= PINECONE_BATCH_SIZE:
                logger.info(f"Batch size reached ({len(all_vectors)} vectors), uploading to Pinecone...")
                index.upsert(vectors=all_vectors)
                logger.info("Successfully uploaded batch to Pinecone")
                all_vectors.clear()

        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")
            logger.info("Continuing with next file...")

    # Upload remaining vectors
    if all_vectors:
        logger.info("=" * 80)
        logger.info(f"Uploading final batch of {len(all_vectors)} vectors to Pinecone...")
        index.upsert(vectors=all_vectors)
        logger.info("Successfully uploaded final batch")

    logger.info("=" * 80)
    logger.info("Indexing complete!")
    logger.info(f"Summary:")
    logger.info(f"   - Processed files: {processed_files}/{len(files)}")
    logger.info(f"   - Total chunks created: {total_chunks}")

    try:
        logger.info("Fetching index statistics from Pinecone...")
        stats = get_index_stats()
        logger.info(f"Total vectors in index: {stats.get('total_vector_count', 0)}")
    except Exception as e:
        logger.warning(f"Failed to fetch index stats: {e}")

    logger.info("=" * 80)


def main():
    """Main entry point."""
    settings = get_settings()

    # Get repo path from environment or command line
    repo_path = settings.local_repo_path

    if len(sys.argv) > 1:
        repo_path = sys.argv[1]

    if not repo_path:
        logger.error("No repository path provided.")
        logger.info("Usage: python index_local_codebase.py <repo_path>")
        logger.info("Or set LOCAL_REPO_PATH in environment variables.")
        sys.exit(1)

    index_codebase(repo_path)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"FATAL ERROR: {e}")
        sys.exit(1)

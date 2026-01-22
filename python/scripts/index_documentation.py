#!/usr/bin/env python3
"""
Index documentation files into Pinecone vector database.
Parses markdown files into sections for granular indexing.
"""

import base64
import logging
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

from src.config import DOCS_BATCH_SIZE, METADATA_CONTENT_LENGTH
from src.core.embeddings import create_embedding, prepare_doc_for_embedding
from src.core.pinecone_client import upsert_vectors, get_index_stats

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Documentation directory (relative to project root)
DOCS_DIR = Path(__file__).parent.parent.parent / "docs"


def parse_markdown_sections(content: str, filename: str) -> List[Dict[str, Any]]:
    """
    Parse markdown file into sections.
    Each section (separated by ## headers) will be indexed separately.

    Args:
        content: Markdown file content.
        filename: File name.

    Returns:
        List of section objects with title and content.
    """
    sections = []
    base_name = filename.replace(".md", "")

    # Split by h2 headers (##)
    parts = re.split(r"^## ", content, flags=re.MULTILINE)

    if len(parts) == 1:
        # No sections, treat entire content as one
        sections.append({
            "title": base_name,
            "content": content.strip(),
        })
    else:
        # First part is before any h2 (might be h1 or intro)
        if parts[0].strip():
            sections.append({
                "title": f"{base_name} - Introduction",
                "content": parts[0].strip(),
            })

        # Process h2 sections
        for part in parts[1:]:
            lines = part.split("\n")
            section_title = lines[0].strip()
            section_content = "\n".join(lines[1:]).strip()

            if section_content:
                sections.append({
                    "title": f"{base_name} - {section_title}",
                    "content": section_content,
                })

    return sections


def read_documentation_files() -> List[Dict[str, Any]]:
    """
    Read and parse all documentation files.

    Returns:
        List of section objects with title, content, filename, filepath.
    """
    logger.info(f"Reading documentation from: {DOCS_DIR}")

    # Create docs directory if it doesn't exist
    if not DOCS_DIR.exists():
        DOCS_DIR.mkdir(parents=True)
        logger.info("Created docs/ directory")
        logger.info("Please add your documentation files (.md, .txt) to the docs/ folder")
        return []

    # Find all markdown and text files
    all_files = list(DOCS_DIR.glob("**/*.md")) + list(DOCS_DIR.glob("**/*.txt"))

    if not all_files:
        logger.warning("No documentation files found in docs/ directory")
        logger.info("Add .md or .txt files to docs/ and run this script again")
        return []

    logger.info(f"Found {len(all_files)} documentation file(s)")

    all_sections = []

    for file_path in all_files:
        try:
            content = file_path.read_text(encoding="utf-8")
            filename = file_path.name

            logger.info(f"  Processing: {filename}")

            if file_path.suffix == ".md":
                # Parse markdown into sections
                sections = parse_markdown_sections(content, filename)
                logger.info(f"    Found {len(sections)} section(s)")

                for section in sections:
                    all_sections.append({
                        **section,
                        "filename": filename,
                        "filepath": str(file_path),
                    })
            else:
                # Treat entire text file as one section
                all_sections.append({
                    "title": filename.replace(".txt", ""),
                    "content": content.strip(),
                    "filename": filename,
                    "filepath": str(file_path),
                })
                logger.info("    Added as single section")

        except Exception as e:
            logger.error(f"    Error reading {file_path}: {e}")

    return all_sections


def index_documentation(sections: List[Dict[str, Any]]) -> int:
    """
    Index documentation sections into Pinecone.

    Args:
        sections: List of section objects.

    Returns:
        Number of processed sections.
    """
    logger.info(f"Indexing {len(sections)} documentation section(s)...")

    vectors = []
    processed_count = 0

    for section in sections:
        try:
            logger.info(f"  Indexing: {section['title']}")

            # Prepare content for embedding
            prepared_text = prepare_doc_for_embedding(section["content"], section["title"])

            # Create embedding
            embedding = create_embedding(prepared_text)

            # Create unique ID using base64 encoded title
            title_encoded = base64.b64encode(section["title"].encode()).decode()[:50]
            vector_id = f"doc-{title_encoded}-{int(datetime.utcnow().timestamp() * 1000)}"

            # Create vector object for Pinecone
            vector = {
                "id": vector_id,
                "values": embedding,
                "metadata": {
                    "type": "documentation",
                    "title": section["title"],
                    "filename": section["filename"],
                    "content": section["content"][:METADATA_CONTENT_LENGTH],
                    "indexedAt": datetime.utcnow().isoformat(),
                },
            }

            vectors.append(vector)
            processed_count += 1

            # Upsert in batches
            if len(vectors) >= DOCS_BATCH_SIZE:
                logger.info(f"  Uploading batch of {len(vectors)} vectors to Pinecone...")
                upsert_vectors(vectors)
                vectors.clear()

        except Exception as e:
            logger.error(f"    Error indexing {section['title']}: {e}")

    # Upsert remaining vectors
    if vectors:
        logger.info(f"  Uploading final batch of {len(vectors)} vectors to Pinecone...")
        upsert_vectors(vectors)

    return processed_count


def main():
    """Main function to index documentation."""
    logger.info("Starting Documentation Indexing...")
    logger.info("=" * 60)

    # Read documentation files
    sections = read_documentation_files()

    if not sections:
        logger.info("No documentation to index. Exiting.")
        return

    # Index documentation
    processed_count = index_documentation(sections)

    # Get final stats
    logger.info("Getting index statistics...")
    stats = get_index_stats()

    logger.info("=" * 60)
    logger.info("DOCUMENTATION INDEXING COMPLETE!")
    logger.info("=" * 60)
    logger.info(f"Sections indexed: {processed_count}")
    logger.info(f"Total vectors in index: {stats.get('total_vector_count', 0)}")
    logger.info("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"Fatal Error: {e}")
        sys.exit(1)

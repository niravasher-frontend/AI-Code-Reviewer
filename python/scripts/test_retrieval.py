#!/usr/bin/env python3
"""
Test RAG retrieval system.
Run predefined test queries or interactive queries against Pinecone.
"""

import logging
import sys
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

from src.core.embeddings import create_embedding
from src.core.pinecone_client import query_vectors, get_index_stats

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Content preview length
PREVIEW_LENGTH = 300


def display_results(results: List[Dict[str, Any]], query: str) -> None:
    """
    Display search results in a formatted way.

    Args:
        results: List of search results from Pinecone.
        query: The search query.
    """
    print("\n" + "=" * 80)
    print(f'Query: "{query}"')
    print("=" * 80 + "\n")

    if not results:
        print("No results found\n")
        return

    for index, result in enumerate(results):
        metadata = result.get("metadata", {})
        score = result.get("score", 0)
        score_pct = f"{score * 100:.2f}"

        print(f"Result {index + 1} (Similarity: {score_pct}%)")
        print("-" * 80)

        result_type = metadata.get("type", "unknown")

        if result_type == "code":
            print(f"Type: Code")
            print(f"File: {metadata.get('filename', 'Unknown')}")
            print(f"URL: {metadata.get('url', 'N/A')}")
            print(f"Size: {metadata.get('size', 'N/A')} bytes")
        elif result_type == "documentation":
            print(f"Type: Documentation")
            print(f"Title: {metadata.get('title', 'Unknown')}")
            print(f"File: {metadata.get('filename', 'Unknown')}")
        else:
            # Local codebase format
            print(f"Type: {metadata.get('fileType', 'Unknown')}")
            print(f"File: {metadata.get('filePath', 'Unknown')}")
            if metadata.get("startLine"):
                print(f"Lines: {metadata.get('startLine')}-{metadata.get('endLine')}")

        print(f"Indexed: {metadata.get('indexedAt', 'N/A')}")

        content = metadata.get("content", "")
        if content:
            preview = content[:PREVIEW_LENGTH] + "..." if len(content) > PREVIEW_LENGTH else content
            print(f"\nContent Preview:\n{preview}")

        print("\n")


def test_query(
    query: str,
    top_k: int = 5,
    filter_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Test retrieval with a query.

    Args:
        query: Search query.
        top_k: Number of results to return.
        filter_type: Optional filter for type (code/documentation).

    Returns:
        List of search results.
    """
    try:
        # Create embedding for the query
        print("Creating query embedding...")
        query_embedding = create_embedding(query)

        # Query Pinecone
        print("Searching Pinecone...")
        filter_dict = {"type": filter_type} if filter_type else None
        results = query_vectors(query_embedding, top_k=top_k, filter=filter_dict)

        # Display results
        display_results(results, query)

        return results
    except Exception as e:
        print(f"Error during query: {e}")
        raise


def run_test_suite() -> None:
    """Run multiple test queries."""
    print("Starting RAG System Test Suite\n")

    # Get index stats first
    print("Fetching index statistics...\n")
    stats = get_index_stats()

    print("=" * 80)
    print("INDEX STATISTICS")
    print("=" * 80)
    print(f"Total Vectors: {stats.get('total_vector_count', 0)}")
    print(f"Dimension: {stats.get('dimension', 'N/A')}")
    print("=" * 80)

    total_count = stats.get("total_vector_count", 0)
    if not total_count:
        print("\nIndex is empty! Please run indexing scripts first:")
        print("   python scripts/index_codebase.py")
        print("   python scripts/index_documentation.py\n")
        return

    # Test queries
    test_queries = [
        {
            "name": "General Code Search",
            "query": "React component that handles user authentication",
            "top_k": 3,
            "filter": None,
        },
        {
            "name": "Documentation Search",
            "query": "business logic and requirements",
            "top_k": 3,
            "filter": "documentation",
        },
        {
            "name": "Code Pattern Search",
            "query": "API calls and error handling",
            "top_k": 3,
            "filter": "code",
        },
        {
            "name": "Specific Feature",
            "query": "state management and hooks",
            "top_k": 3,
            "filter": None,
        },
    ]

    print("\nRunning Test Queries...\n")

    for test in test_queries:
        print(f"\n{'>' * 40}")
        print(f"TEST: {test['name']}")
        print(">" * 40)

        test_query(test["query"], test["top_k"], test["filter"])

        # Small delay between queries
        time.sleep(1)

    print("\n" + "=" * 80)
    print("TEST SUITE COMPLETE")
    print("=" * 80 + "\n")


def interactive_mode() -> None:
    """Interactive mode - query from command line."""
    query = " ".join(sys.argv[1:])

    if not query:
        print("Please provide a query")
        print("Usage: python test_retrieval.py <your search query here>\n")
        return

    print("Interactive Query Mode\n")
    test_query(query, top_k=5)


def main():
    """Main function."""
    args = sys.argv[1:]

    if args:
        # Interactive mode with query
        interactive_mode()
    else:
        # Run full test suite
        run_test_suite()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"Fatal Error: {e}")
        sys.exit(1)

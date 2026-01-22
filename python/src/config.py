"""
Configuration management using Pydantic Settings.
Loads environment variables and provides type-safe configuration.
"""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # GitHub
    github_token: str
    github_webhook_secret: Optional[str] = None

    # OpenAI
    openai_api_key: str

    # Pinecone
    pinecone_api_key: str
    pinecone_index_name: str = "codebase-embedding-384"

    # Target Repository (for indexing)
    target_repo_owner: Optional[str] = None
    target_repo_name: Optional[str] = None

    # Local repo path (for local indexing)
    local_repo_path: Optional[str] = None


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Constants - preserved from Node.js implementation

# Embedding Model
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIMENSIONS = 384

# Batch Sizes
CODE_BATCH_SIZE = 50
PINECONE_BATCH_SIZE = 100
DOCS_BATCH_SIZE = 20

# OpenAI Settings
OPENAI_MODEL = "gpt-5"
OPENAI_MAX_TOKENS = 8000
OPENAI_TEMPERATURE = 0.3

# RAG Settings
CONTEXT_TOP_K = 10
MAX_FILE_CHANGES = 500
MAX_FILE_SIZE = 50000  # 50KB
CHUNK_SIZE = 1000

# Text Processing
MAX_TOKENS = 8000
CHARS_PER_TOKEN = 4  # Rough estimate: 1 token ≈ 4 characters
MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN

# Content Preview Limits
CONTEXT_PREVIEW_LENGTH = 1000
FILE_CONTENT_PREVIEW_LENGTH = 2000
METADATA_CONTENT_LENGTH = 2000

# File Extensions
VALID_CODE_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".cpp", ".c",
    ".go", ".rs", ".rb", ".php", ".cs", ".swift", ".kt", ".scala",
    ".json", ".css", ".scss", ".html", ".md"
}

VALID_INDEX_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", ".html", ".md"
}

# Ignore Patterns
IGNORE_PATTERNS = {
    "node_modules", "dist", "build", ".git", "coverage",
    "package-lock.json", ".min.js", ".min.css", ".map",
    ".next", ".vercel", "__pycache__", ".pytest_cache",
    "venv", ".venv", "env", ".env"
}

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".lock", ".woff", ".woff2", ".ttf", ".eot", ".pdf"
}

# Language Mapping for Syntax Highlighting
LANGUAGE_MAP = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".py": "python",
    ".java": "java",
    ".go": "go",
    ".rb": "ruby",
    ".php": "php",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".json": "json",
    ".md": "markdown",
    ".cpp": "cpp",
    ".c": "c",
    ".rs": "rust",
    ".swift": "swift",
    ".kt": "kotlin",
}

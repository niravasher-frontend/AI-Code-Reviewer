"""
FastAPI application entry point.
AI Code Reviewer - RAG-enhanced code review system.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.webhook import router as webhook_router
from src.api.schemas import HealthResponse
from src.core.embeddings import get_embedder

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    Preloads the embedding model on startup to avoid cold start delays.
    """
    logger.info("Starting AI Code Reviewer...")

    # Preload embedding model
    logger.info("Preloading embedding model...")
    try:
        get_embedder()
        logger.info("Embedding model loaded successfully")
    except Exception as e:
        logger.warning(f"Could not preload embedding model: {e}")

    yield

    logger.info("Shutting down AI Code Reviewer...")


app = FastAPI(
    title="AI Code Reviewer",
    description="RAG-enhanced AI-powered code review system for GitHub pull requests",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(webhook_router, prefix="/api", tags=["webhook"])


@app.get("/", response_model=HealthResponse, tags=["health"])
async def root():
    """Root endpoint - health check."""
    return HealthResponse(status="healthy")


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    """Health check endpoint."""
    return HealthResponse(status="healthy")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

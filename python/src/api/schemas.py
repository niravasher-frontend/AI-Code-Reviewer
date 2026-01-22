"""
Pydantic models for request/response validation.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class GitHubUser(BaseModel):
    """GitHub user information."""

    login: str


class GitHubHead(BaseModel):
    """GitHub PR head information."""

    sha: str
    ref: Optional[str] = None


class PullRequest(BaseModel):
    """GitHub pull request information."""

    number: int
    title: str
    body: Optional[str] = None
    user: Optional[GitHubUser] = None
    head: Optional[GitHubHead] = None


class RepositoryOwner(BaseModel):
    """GitHub repository owner."""

    login: str


class Repository(BaseModel):
    """GitHub repository information."""

    name: str
    owner: RepositoryOwner


class WebhookPayload(BaseModel):
    """GitHub webhook payload for pull_request events."""

    action: str
    pull_request: Optional[PullRequest] = None
    repository: Optional[Repository] = None


class ReviewResponse(BaseModel):
    """Response from the webhook handler."""

    message: str
    files_reviewed: Optional[int] = None
    context_pieces_used: Optional[int] = None
    rag_enabled: Optional[bool] = None


class ErrorResponse(BaseModel):
    """Error response."""

    error: str
    details: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    version: str = "1.0.0"

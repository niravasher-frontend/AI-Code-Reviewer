"""
Pydantic models for request/response validation.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ============================================
# R³ Risk Radar Models
# ============================================

class RiskLevel(str, Enum):
    """Risk level classification."""
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"


class Severity(str, Enum):
    """Comment severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskSignal(BaseModel):
    """Individual risk signal from an agent."""
    name: str
    score: int = Field(ge=0, le=100)
    evidence: str
    details: Optional[Dict[str, Any]] = None


class InlineComment(BaseModel):
    """Inline comment to post on a specific line."""
    path: str
    line: int
    body: str
    severity: Severity = Severity.MEDIUM
    agent: str = "CodeAgent"


class AgentResult(BaseModel):
    """Result from an individual agent."""
    agent_name: str
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time_ms: Optional[int] = None


class RiskAssessment(BaseModel):
    """Complete risk assessment."""
    total_score: int = Field(ge=0, le=100)
    level: RiskLevel
    signals: List[RiskSignal]
    top_factors: List[str] = []


class AuditTrace(BaseModel):
    """Audit trace for compliance and debugging."""
    audit_id: str
    timestamp: datetime
    repository: str
    pr_number: int
    pr_author: str
    risk_score: int
    risk_level: RiskLevel
    signals: List[RiskSignal]
    inline_comments_count: int
    agents_used: List[str]
    execution_time_ms: int


class R3ReviewResponse(BaseModel):
    """Enhanced response with risk data."""
    message: str
    files_reviewed: int
    risk_score: int
    risk_level: RiskLevel
    signals: List[RiskSignal]
    inline_comments_count: int
    audit_id: str
    rag_enabled: bool = True


# ============================================
# Original Models
# ============================================


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

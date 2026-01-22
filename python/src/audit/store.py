"""
Audit trail storage for R³ reviews.

Saves JSON audit traces for compliance and debugging.
"""

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

from src.api.schemas import AuditTrace, RiskSignal, RiskLevel

logger = logging.getLogger(__name__)

# Default audit storage path
AUDIT_PATH = Path("./audits")


def save_audit_trace(
    repository: str,
    pr_number: int,
    pr_author: str,
    risk_score: int,
    risk_level: RiskLevel,
    signals: List[RiskSignal],
    inline_comments_count: int,
    agents_used: List[str],
    execution_time_ms: int,
) -> str:
    """
    Save an audit trace to disk.

    Args:
        repository: Repository name (owner/repo)
        pr_number: PR number
        pr_author: PR author username
        risk_score: Overall risk score (0-100)
        risk_level: Risk level enum
        signals: List of risk signals
        inline_comments_count: Number of inline comments posted
        agents_used: List of agent names that ran
        execution_time_ms: Total execution time

    Returns:
        Audit ID
    """
    # Generate unique audit ID
    audit_id = str(uuid.uuid4())[:8]
    timestamp = datetime.utcnow()

    # Create audit trace
    audit = AuditTrace(
        audit_id=audit_id,
        timestamp=timestamp,
        repository=repository,
        pr_number=pr_number,
        pr_author=pr_author,
        risk_score=risk_score,
        risk_level=risk_level,
        signals=signals,
        inline_comments_count=inline_comments_count,
        agents_used=agents_used,
        execution_time_ms=execution_time_ms,
    )

    # Ensure audit directory exists
    AUDIT_PATH.mkdir(parents=True, exist_ok=True)

    # Create filename with timestamp
    filename = f"{audit_id}_{timestamp.strftime('%Y%m%d_%H%M%S')}.json"
    filepath = AUDIT_PATH / filename

    # Save as JSON
    try:
        with open(filepath, "w") as f:
            json.dump(audit.model_dump(mode="json"), f, indent=2, default=str)

        logger.info(f"Audit trace saved: {filepath}")

    except Exception as e:
        logger.error(f"Failed to save audit trace: {e}")

    return audit_id


def get_audit_trace(audit_id: str) -> Optional[AuditTrace]:
    """
    Retrieve an audit trace by ID.

    Args:
        audit_id: Audit ID to retrieve

    Returns:
        AuditTrace if found, None otherwise
    """
    # Find file matching audit ID
    for filepath in AUDIT_PATH.glob(f"{audit_id}*.json"):
        try:
            with open(filepath, "r") as f:
                data = json.load(f)
                return AuditTrace(**data)
        except Exception as e:
            logger.error(f"Failed to load audit trace {filepath}: {e}")

    return None


def list_audits(
    repository: Optional[str] = None,
    pr_number: Optional[int] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    List recent audit traces.

    Args:
        repository: Filter by repository (optional)
        pr_number: Filter by PR number (optional)
        limit: Maximum number of results

    Returns:
        List of audit summary dictionaries
    """
    audits = []

    if not AUDIT_PATH.exists():
        return audits

    # Get all audit files, sorted by modification time
    files = sorted(
        AUDIT_PATH.glob("*.json"),
        key=lambda x: x.stat().st_mtime,
        reverse=True,
    )

    for filepath in files[:limit * 2]:  # Read extra in case of filtering
        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            # Apply filters
            if repository and data.get("repository") != repository:
                continue
            if pr_number and data.get("pr_number") != pr_number:
                continue

            audits.append({
                "audit_id": data.get("audit_id"),
                "timestamp": data.get("timestamp"),
                "repository": data.get("repository"),
                "pr_number": data.get("pr_number"),
                "risk_score": data.get("risk_score"),
                "risk_level": data.get("risk_level"),
            })

            if len(audits) >= limit:
                break

        except Exception as e:
            logger.warning(f"Failed to read audit {filepath}: {e}")

    return audits

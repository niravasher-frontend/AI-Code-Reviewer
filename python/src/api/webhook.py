"""
GitHub webhook handler for pull request events.
Processes PRs using R³ multi-agent system for risk-aware reviews.
"""

import hmac
import hashlib
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request

from src.config import get_settings, CONTEXT_TOP_K
from src.core.embeddings import create_embedding
from src.core.github_client import (
    get_pr_files,
    get_file_content,
    post_review_with_inline_comments,
    filter_pr_files,
)
from src.core.pinecone_client import query_vectors
from src.core.prompt_builder import build_context_query
from src.api.schemas import ReviewResponse, R3ReviewResponse, ErrorResponse
from src.agents.orchestrator import Orchestrator

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize orchestrator
orchestrator = Orchestrator()


def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Verify GitHub webhook signature.

    Args:
        payload: Raw request body.
        signature: X-Hub-Signature-256 header value.
        secret: Webhook secret.

    Returns:
        True if signature is valid.
    """
    if not signature or not secret:
        return False

    expected = "sha256=" + hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


@router.post(
    "/webhook",
    response_model=R3ReviewResponse,
    responses={
        200: {"model": R3ReviewResponse},
        405: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def handle_webhook(
    request: Request,
    x_github_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
) -> R3ReviewResponse:
    """
    Handle GitHub webhook events for pull requests.

    Uses R³ multi-agent system to:
    1. Calculate risk signals (churn, complexity, incidents, etc.)
    2. Perform AI-powered code review
    3. Scan for security vulnerabilities
    4. Post summary + inline comments to PR
    5. Save audit trace
    """
    settings = get_settings()

    # Get raw body for signature verification
    body = await request.body()

    # Verify webhook signature if secret is configured
    if settings.github_webhook_secret:
        if not verify_webhook_signature(
            body, x_hub_signature_256 or "", settings.github_webhook_secret
        ):
            logger.warning("Invalid webhook signature")
            raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse JSON body
    payload = await request.json()

    # Only process pull request events
    if x_github_event != "pull_request":
        logger.info(f"Ignoring non-PR event: {x_github_event}")
        return R3ReviewResponse(
            message="Not a PR event",
            files_reviewed=0,
            risk_score=0,
            risk_level="Low",
            signals=[],
            inline_comments_count=0,
            audit_id="",
        )

    action = payload.get("action", "")
    pull_request = payload.get("pull_request", {})
    repository = payload.get("repository", {})

    # Only review when PR is opened, reopened, or synchronized (new commits)
    if action not in ["opened", "synchronize", "reopened"]:
        logger.info(f"No action needed for: {action}")
        return R3ReviewResponse(
            message="No action needed",
            files_reviewed=0,
            risk_score=0,
            risk_level="Low",
            signals=[],
            inline_comments_count=0,
            audit_id="",
        )

    try:
        owner = repository.get("owner", {}).get("login", "")
        repo_name = repository.get("name", "")
        pr_number = pull_request.get("number", 0)
        head_sha = pull_request.get("head", {}).get("sha", "")
        pr_author = pull_request.get("user", {}).get("login", "unknown")

        logger.info("=" * 60)
        logger.info(f"🎯 R³ Processing PR: {owner}/{repo_name}#{pr_number}")
        logger.info("=" * 60)

        # Get PR files
        files = get_pr_files(owner, repo_name, pr_number)

        # Filter to reviewable code files
        code_files = filter_pr_files(files)

        if not code_files:
            logger.info("No code files to review")
            return R3ReviewResponse(
                message="No code files to review",
                files_reviewed=0,
                risk_score=0,
                risk_level="Low",
                signals=[],
                inline_comments_count=0,
                audit_id="",
            )

        # Get file contents
        valid_files = []
        for file in code_files:
            filename = file.get("filename", "")
            try:
                content = get_file_content(owner, repo_name, filename, ref=head_sha)
                if content:
                    valid_files.append({
                        "filename": filename,
                        "patch": file.get("patch"),
                        "content": content,
                        "status": file.get("status"),
                        "additions": file.get("additions", 0),
                        "deletions": file.get("deletions", 0),
                    })
            except Exception as e:
                logger.error(f"Error fetching {filename}: {e}")

        if not valid_files:
            logger.warning("Could not fetch any file contents")
            return R3ReviewResponse(
                message="Could not fetch file contents",
                files_reviewed=0,
                risk_score=0,
                risk_level="Low",
                signals=[],
                inline_comments_count=0,
                audit_id="",
            )

        # RAG Enhancement: Retrieve relevant context from knowledge base
        logger.info("Querying knowledge base for relevant context...")

        relevant_context = []
        try:
            # Build semantic query from PR info
            context_query_text = build_context_query(pull_request, valid_files)

            # Create embedding for the query
            query_embedding = create_embedding(context_query_text)

            # Query Pinecone for top K most relevant pieces of context
            relevant_context = query_vectors(query_embedding, top_k=CONTEXT_TOP_K)

            logger.info(f"Retrieved {len(relevant_context)} relevant context pieces")
        except Exception as e:
            logger.warning(f"Error retrieving context from knowledge base: {e}")
            # Continue without context if retrieval fails

        # Build context for R³ agents
        pr_context = {
            "owner": owner,
            "repo": repo_name,
            "pr_number": pr_number,
            "author": pr_author,
            "head_sha": head_sha,
            "files": valid_files,
            "rag_context": relevant_context,
            "pr_title": pull_request.get("title", ""),
            "pr_body": pull_request.get("body", ""),
        }

        # Run R³ multi-agent review
        logger.info("Running R³ multi-agent review...")
        result = await orchestrator.review_pr(pr_context)

        # Post review with inline comments
        logger.info("Posting review to GitHub...")

        inline_comments_data = [
            {
                "path": c.path,
                "line": c.line,
                "body": c.body,
            }
            for c in result["inline_comments"]
        ]

        review_result = post_review_with_inline_comments(
            owner=owner,
            repo=repo_name,
            pr_number=pr_number,
            summary=result["summary_comment"],
            inline_comments=inline_comments_data,
            head_sha=head_sha,
        )

        logger.info(f"✅ Review posted: {review_result.get('url', 'N/A')}")

        return R3ReviewResponse(
            message="R³ review posted successfully",
            files_reviewed=len(valid_files),
            risk_score=result["risk_score"],
            risk_level=result["risk_level"].value,
            signals=result["signals"],
            inline_comments_count=len(result["inline_comments"]),
            audit_id=result["audit_id"],
            rag_enabled=True,
        )

    except Exception as e:
        logger.error(f"Error processing review: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process review: {str(e)}",
        )


# Legacy endpoint for backward compatibility
@router.post("/webhook/legacy", response_model=ReviewResponse)
async def handle_webhook_legacy(
    request: Request,
    x_github_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
) -> ReviewResponse:
    """Legacy webhook handler without R³ risk analysis."""
    # This can be implemented if needed for fallback
    return ReviewResponse(
        message="Legacy endpoint - use /webhook for R³ reviews",
        files_reviewed=0,
    )

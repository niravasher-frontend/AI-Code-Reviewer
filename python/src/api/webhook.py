"""
GitHub webhook handler for pull request events.
Processes PRs, retrieves context via RAG, and posts AI-powered reviews.
"""

import hmac
import hashlib
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from openai import OpenAI

from src.config import (
    get_settings,
    OPENAI_MODEL,
    OPENAI_MAX_TOKENS,
    OPENAI_TEMPERATURE,
    CONTEXT_TOP_K,
)
from src.core.embeddings import create_embedding
from src.core.github_client import (
    get_pr_files,
    get_file_content,
    post_review_comment,
    filter_pr_files,
)
from src.core.pinecone_client import query_vectors
from src.core.prompt_builder import build_review_prompt, build_context_query
from src.api.schemas import ReviewResponse, ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter()


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
    response_model=ReviewResponse,
    responses={
        200: {"model": ReviewResponse},
        405: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def handle_webhook(
    request: Request,
    x_github_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
) -> ReviewResponse:
    """
    Handle GitHub webhook events for pull requests.

    Processes pull_request events when a PR is opened or synchronized,
    retrieves relevant context from the knowledge base, generates an
    AI-powered code review, and posts it as a comment on the PR.
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
        return ReviewResponse(message="Not a PR event")

    action = payload.get("action", "")
    pull_request = payload.get("pull_request", {})
    repository = payload.get("repository", {})

    # Only review when PR is opened, reopened, or synchronized (new commits)
    if action not in ["opened", "synchronize", "reopened"]:
        logger.info(f"No action needed for: {action}")
        return ReviewResponse(message="No action needed")

    try:
        owner = repository.get("owner", {}).get("login", "")
        repo_name = repository.get("name", "")
        pr_number = pull_request.get("number", 0)
        head_sha = pull_request.get("head", {}).get("sha", "")

        logger.info(f"Processing PR: {owner}/{repo_name}#{pr_number}")

        # Initialize OpenAI client
        openai_client = OpenAI(api_key=settings.openai_api_key)

        # Get PR files
        files = get_pr_files(owner, repo_name, pr_number)

        # Filter to reviewable code files
        code_files = filter_pr_files(files)

        if not code_files:
            logger.info("No code files to review")
            return ReviewResponse(message="No code files to review")

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
                    })
            except Exception as e:
                logger.error(f"Error fetching {filename}: {e}")

        if not valid_files:
            logger.warning("Could not fetch any file contents")
            return ReviewResponse(message="Could not fetch file contents")

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

        # Build context-aware prompt
        prompt = build_review_prompt(
            pull_request=pull_request,
            files=valid_files,
            relevant_context=relevant_context,
        )

        logger.info(f"Sending request to OpenAI ({OPENAI_MODEL})...")

        # Call OpenAI with enhanced prompt
        completion = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior software engineer performing code reviews. "
                        "You have access to the codebase context and documentation. "
                        "Be helpful, specific, constructive, and leverage the provided "
                        "context to make informed recommendations."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            max_completion_tokens=OPENAI_MAX_TOKENS,
        )

        review_comment = completion.choices[0].message.content

        # Build review metadata
        context_info = ""
        if relevant_context:
            context_info = f"\n*Analyzed with {len(relevant_context)} pieces of codebase context*"

        # Format final comment
        final_comment = (
            f"## AI Code Review (RAG-Enhanced)\n\n"
            f"{review_comment}\n\n"
            f"---\n"
            f"*Powered by GPT-4 + Knowledge Base | Context-Aware Review*{context_info}"
        )

        # Post review comment
        post_review_comment(owner, repo_name, pr_number, final_comment)

        logger.info("Review posted successfully!")

        return ReviewResponse(
            message="Review posted successfully",
            files_reviewed=len(valid_files),
            context_pieces_used=len(relevant_context),
            rag_enabled=True,
        )

    except Exception as e:
        logger.error(f"Error processing review: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process review: {str(e)}",
        )

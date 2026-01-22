"""
Prompt construction for code review.
Builds context-aware prompts using retrieved knowledge base results.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from src.config import (
    CONTEXT_PREVIEW_LENGTH,
    FILE_CONTENT_PREVIEW_LENGTH,
    LANGUAGE_MAP,
)


def build_review_prompt(
    pull_request: Dict[str, Any],
    files: List[Dict[str, Any]],
    relevant_context: List[Dict[str, Any]],
) -> str:
    """
    Build a context-aware prompt for code review.

    Args:
        pull_request: GitHub PR object with title, body, user info.
        files: List of changed files with content/patch.
        relevant_context: Relevant code/docs from knowledge base.

    Returns:
        Formatted prompt string for LLM.
    """
    context_section = _build_context_section(relevant_context)
    files_section = _build_files_section(files)

    pr_title = pull_request.get("title", "")
    pr_body = pull_request.get("body") or "No description provided"
    pr_author = pull_request.get("user", {}).get("login", "Unknown")

    return f"""You are a senior software engineer performing a comprehensive code review. You have access to the existing codebase context and documentation to make informed decisions.

## REVIEW GUIDELINES
Focus on these key areas:
1. **Code Quality**: Logic errors, potential bugs, edge cases, error handling
2. **Security**: Vulnerabilities, input validation, authentication/authorization issues
3. **Performance**: Inefficiencies, unnecessary re-renders, memory leaks, optimization opportunities
4. **Best Practices**: Design patterns, SOLID principles, DRY, maintainability
5. **React/JS Specific**: Hook usage, component structure, state management, prop drilling
6. **Style & Readability**: Naming conventions, code organization, documentation
7. **Business Logic**: Alignment with documented requirements and patterns

## EXISTING CODEBASE CONTEXT
{context_section}

## PULL REQUEST DETAILS
**Title**: {pr_title}
**Description**: {pr_body}
**Author**: {pr_author}

## FILES CHANGED
{files_section}

## REVIEW INSTRUCTIONS
1. Analyze each file in the context of the existing codebase patterns
2. Provide specific, actionable feedback with line references where possible
3. If code follows existing patterns and is good, acknowledge it briefly
4. Be constructive and helpful, not just critical
5. Prioritize security and correctness over style preferences

## OUTPUT FORMAT
Structure your review as follows:

**File: [filename]**
- ✅ **Good**: [What's done well]
- ⚠️ **Concern**: [Issue description] - [Suggestion for fix]
- 🔴 **Critical**: [Serious issue] - [Required fix]

Only include files that need feedback. Be concise but specific."""


def _build_context_section(relevant_context: List[Dict[str, Any]]) -> str:
    """
    Build the context section from retrieved knowledge base results.

    Args:
        relevant_context: List of context objects from Pinecone.

    Returns:
        Formatted context section string.
    """
    if not relevant_context:
        return "No specific codebase context available for this change."

    context_pieces = []

    for index, ctx in enumerate(relevant_context):
        metadata = ctx.get("metadata", {})
        score = ctx.get("score")
        score_str = f"{score * 100:.1f}" if score else "N/A"

        piece = f"### Context {index + 1} (Relevance: {score_str}%)"

        ctx_type = metadata.get("type", "")
        if ctx_type == "code":
            filename = metadata.get("filename", "Unknown")
            piece += f"\n**File**: {filename}"
            piece += "\n**Type**: Code\n"
        elif ctx_type == "documentation":
            title = metadata.get("title", "Documentation")
            piece += f"\n**Source**: {title}"
            piece += "\n**Type**: Documentation\n"

        content = metadata.get("content", "")
        if content:
            # Truncate context if too long
            if len(content) > CONTEXT_PREVIEW_LENGTH:
                content = content[:CONTEXT_PREVIEW_LENGTH] + "..."
            piece += f"\n{content}"

        context_pieces.append(piece)

    return "\n\n---\n\n".join(context_pieces)


def _build_files_section(files: List[Dict[str, Any]]) -> str:
    """
    Build the files section with PR changes.

    Args:
        files: List of file objects with filename, status, patch, content.

    Returns:
        Formatted files section string.
    """
    sections = []

    for file in files:
        filename = file.get("filename", "unknown")
        section = f"### {filename}"

        status = file.get("status")
        if status:
            section += f" ({status})"

        section += "\n"

        # Prefer patch (shows only changes) over full content
        patch = file.get("patch")
        content = file.get("content")

        if patch:
            section += f"```diff\n{patch}\n```"
        elif content:
            # If no patch available, show truncated content
            if len(content) > FILE_CONTENT_PREVIEW_LENGTH:
                content = content[:FILE_CONTENT_PREVIEW_LENGTH] + "\n... (truncated)"
            language = get_language_from_filename(filename)
            section += f"```{language}\n{content}\n```"

        sections.append(section)

    return "\n\n".join(sections)


def get_language_from_filename(filename: str) -> str:
    """
    Get language identifier for syntax highlighting based on filename.

    Args:
        filename: File name or path.

    Returns:
        Language identifier string for markdown code blocks.
    """
    ext = Path(filename).suffix.lower()
    return LANGUAGE_MAP.get(ext, "")


def build_context_query(
    pull_request: Dict[str, Any],
    files: List[Dict[str, Any]],
) -> str:
    """
    Build query text for retrieving relevant context from knowledge base.

    Args:
        pull_request: GitHub PR object.
        files: List of changed files.

    Returns:
        Query text for semantic search.
    """
    title = pull_request.get("title", "")
    description = pull_request.get("body", "")
    filenames = ", ".join(f.get("filename", "") for f in files)

    # Combine PR info to create a semantic query
    return f"{title}\n{description}\nFiles changed: {filenames}"

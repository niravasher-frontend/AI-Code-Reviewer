"""
GitHub API client wrapper using PyGithub.
Provides cleaner interface for PR operations and repository access.
"""

import base64
import logging
from typing import Any, Dict, List, Optional

from github import Github, GithubException
from github.Repository import Repository

from src.config import get_settings, IGNORE_PATTERNS, VALID_INDEX_EXTENSIONS, BINARY_EXTENSIONS, MAX_FILE_CHANGES

logger = logging.getLogger(__name__)

# Singleton instance
_github_client: Optional[Github] = None


def get_github_client() -> Github:
    """
    Get or initialize the GitHub client (singleton pattern).

    Returns:
        Github client instance.
    """
    global _github_client

    if _github_client is not None:
        logger.debug("Using existing GitHub client")
        return _github_client

    settings = get_settings()
    logger.info("Initializing GitHub client...")
    _github_client = Github(settings.github_token)
    logger.info("GitHub client initialized successfully")

    return _github_client


def get_repository(owner: str, repo: str) -> Repository:
    """
    Get a GitHub repository.

    Args:
        owner: Repository owner.
        repo: Repository name.

    Returns:
        Repository object.

    Raises:
        GithubException: If repository cannot be accessed.
    """
    client = get_github_client()
    return client.get_repo(f"{owner}/{repo}")


def verify_repo_access(owner: str, repo: str) -> bool:
    """
    Verify access to a GitHub repository.

    Args:
        owner: Repository owner.
        repo: Repository name.

    Returns:
        True if repository is accessible.

    Raises:
        GithubException: If repository cannot be accessed.
    """
    try:
        repository = get_repository(owner, repo)
        logger.info(f"Repository access verified: {repository.full_name}")
        return True
    except GithubException as e:
        logger.error(f"Cannot access repository {owner}/{repo}: {e}")
        raise


def get_pr_files(owner: str, repo: str, pr_number: int) -> List[Dict[str, Any]]:
    """
    Get list of files changed in a pull request.

    Args:
        owner: Repository owner.
        repo: Repository name.
        pr_number: Pull request number.

    Returns:
        List of file objects with filename, status, changes, patch.
    """
    logger.info(f"Fetching PR files: {owner}/{repo}#{pr_number}")

    repository = get_repository(owner, repo)
    pull_request = repository.get_pull(pr_number)

    files = []
    for f in pull_request.get_files():
        files.append({
            "filename": f.filename,
            "status": f.status,
            "changes": f.changes,
            "additions": f.additions,
            "deletions": f.deletions,
            "patch": f.patch if hasattr(f, "patch") else None,
            "sha": f.sha,
        })

    logger.info(f"Found {len(files)} files in PR")
    return files


def get_file_content(owner: str, repo: str, path: str, ref: Optional[str] = None) -> Optional[str]:
    """
    Get content of a file from a repository.

    Args:
        owner: Repository owner.
        repo: Repository name.
        path: File path.
        ref: Git reference (commit SHA, branch). Defaults to default branch.

    Returns:
        Decoded file content as string, or None if retrieval fails.
    """
    try:
        repository = get_repository(owner, repo)

        if ref:
            file_content = repository.get_contents(path, ref=ref)
        else:
            file_content = repository.get_contents(path)

        # Handle case where path is a directory (returns list)
        if isinstance(file_content, list):
            logger.warning(f"Path {path} is a directory, not a file")
            return None

        # Decode base64 content
        content = base64.b64decode(file_content.content).decode("utf-8")
        return content

    except GithubException as e:
        logger.error(f"Error fetching {path}: {e}")
        return None
    except Exception as e:
        logger.error(f"Error decoding {path}: {e}")
        return None


def post_review_comment(owner: str, repo: str, pr_number: int, body: str) -> Dict[str, Any]:
    """
    Post a comment on a pull request.

    Args:
        owner: Repository owner.
        repo: Repository name.
        pr_number: Pull request number (issue number).
        body: Comment body (markdown).

    Returns:
        Comment object with id, url, etc.
    """
    logger.info(f"Posting review comment to {owner}/{repo}#{pr_number}")

    repository = get_repository(owner, repo)
    issue = repository.get_issue(pr_number)
    comment = issue.create_comment(body)

    logger.info(f"Review comment posted: {comment.html_url}")
    return {
        "id": comment.id,
        "url": comment.html_url,
        "body": comment.body,
    }


def get_pr_details(owner: str, repo: str, pr_number: int) -> Dict[str, Any]:
    """
    Get pull request details.

    Args:
        owner: Repository owner.
        repo: Repository name.
        pr_number: Pull request number.

    Returns:
        Dict with PR details (title, body, user, state, head sha).
    """
    repository = get_repository(owner, repo)
    pr = repository.get_pull(pr_number)

    return {
        "number": pr.number,
        "title": pr.title,
        "body": pr.body,
        "state": pr.state,
        "user": {
            "login": pr.user.login,
        },
        "head": {
            "sha": pr.head.sha,
            "ref": pr.head.ref,
        },
        "base": {
            "ref": pr.base.ref,
        },
    }


def fetch_repo_files(
    owner: str,
    repo: str,
    path: str = "",
    valid_extensions: Optional[set] = None,
    ignore_patterns: Optional[set] = None,
) -> List[Dict[str, Any]]:
    """
    Recursively fetch all files from a GitHub repository.

    Args:
        owner: Repository owner.
        repo: Repository name.
        path: Directory path to start from (empty string for root).
        valid_extensions: Set of valid file extensions to include.
        ignore_patterns: Set of patterns to ignore.

    Returns:
        List of file objects with path, size, sha, html_url.
    """
    valid_extensions = valid_extensions or VALID_INDEX_EXTENSIONS
    ignore_patterns = ignore_patterns or IGNORE_PATTERNS

    logger.info(f"Fetching files from: {path or 'root'}...")

    try:
        repository = get_repository(owner, repo)
        contents = repository.get_contents(path)

        # Handle single file case
        if not isinstance(contents, list):
            contents = [contents]

        files = []

        for item in contents:
            # Check ignore patterns
            if any(pattern in item.path for pattern in ignore_patterns):
                continue

            if item.type == "file":
                # Check valid extensions
                ext = "." + item.name.split(".")[-1].lower() if "." in item.name else ""
                if ext in valid_extensions:
                    files.append({
                        "path": item.path,
                        "name": item.name,
                        "size": item.size,
                        "sha": item.sha,
                        "html_url": item.html_url,
                    })

            elif item.type == "dir":
                # Recursively fetch subdirectory
                sub_files = fetch_repo_files(
                    owner, repo, item.path, valid_extensions, ignore_patterns
                )
                files.extend(sub_files)

        return files

    except GithubException as e:
        logger.error(f"Error fetching {path}: {e}")
        return []


def post_review_with_inline_comments(
    owner: str,
    repo: str,
    pr_number: int,
    summary: str,
    inline_comments: List[Dict[str, Any]],
    head_sha: str,
) -> Dict[str, Any]:
    """
    Post a PR review with inline comments on specific lines.

    Args:
        owner: Repository owner.
        repo: Repository name.
        pr_number: Pull request number.
        summary: Summary comment body (markdown).
        inline_comments: List of inline comment dicts with:
            - path: File path
            - line: Line number (in the diff, not file)
            - body: Comment body
        head_sha: Commit SHA to attach review to.

    Returns:
        Dict with review info (id, url).
    """
    logger.info(f"Posting review with {len(inline_comments)} inline comments")

    repository = get_repository(owner, repo)
    pr = repository.get_pull(pr_number)

    # Format comments for PyGithub
    # PyGithub expects: path, position (line in diff), body
    # But we'll use the simpler single-comment review approach

    try:
        # First, try to create a review with inline comments
        if inline_comments:
            # PyGithub's create_review expects comments in specific format
            comments = []
            for comment in inline_comments:
                # GitHub API requires 'position' or 'line' for the diff
                # We'll use 'line' which is the line in the new file
                comments.append({
                    "path": comment["path"],
                    "line": comment["line"],
                    "body": comment["body"],
                })

            try:
                # Create review with inline comments
                review = pr.create_review(
                    body=summary,
                    event="COMMENT",  # COMMENT, APPROVE, or REQUEST_CHANGES
                    comments=comments,
                )

                logger.info(f"Review created with inline comments: {review.html_url}")
                return {
                    "id": review.id,
                    "url": review.html_url,
                    "comments_count": len(comments),
                }
            except GithubException as e:
                # If inline comments fail (e.g., line not in diff),
                # fall back to posting summary + individual comments
                logger.warning(f"Inline comments failed: {e}, falling back to individual comments")

                # Post summary as PR comment
                issue = repository.get_issue(pr_number)
                comment = issue.create_comment(summary)

                # Post inline comments individually
                successful_comments = 0
                for ic in inline_comments:
                    try:
                        pr.create_review_comment(
                            body=ic["body"],
                            commit=pr.get_commits().reversed[0],  # Latest commit
                            path=ic["path"],
                            line=ic["line"],
                        )
                        successful_comments += 1
                    except Exception as ce:
                        logger.warning(f"Could not post comment on {ic['path']}:{ic['line']}: {ce}")

                return {
                    "id": comment.id,
                    "url": comment.html_url,
                    "comments_count": successful_comments,
                    "fallback": True,
                }
        else:
            # No inline comments, just post summary
            issue = repository.get_issue(pr_number)
            comment = issue.create_comment(summary)

            logger.info(f"Review comment posted: {comment.html_url}")
            return {
                "id": comment.id,
                "url": comment.html_url,
                "comments_count": 0,
            }

    except GithubException as e:
        logger.error(f"Error posting review: {e}")

        # Final fallback: just post the summary
        try:
            issue = repository.get_issue(pr_number)
            comment = issue.create_comment(summary)
            return {
                "id": comment.id,
                "url": comment.html_url,
                "comments_count": 0,
                "error": str(e),
            }
        except Exception as final_e:
            logger.error(f"Complete failure posting review: {final_e}")
            raise


def filter_pr_files(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filter PR files to only include reviewable code files.

    Args:
        files: List of file objects from get_pr_files.

    Returns:
        Filtered list of code files.
    """
    filtered = []

    for file in files:
        filename = file.get("filename", "")
        status = file.get("status", "")
        changes = file.get("changes", 0)

        # Skip removed files
        if status == "removed":
            continue

        # Skip very large files
        if changes >= MAX_FILE_CHANGES:
            logger.debug(f"Skipping large file: {filename} ({changes} changes)")
            continue

        # Skip binary files
        ext = "." + filename.split(".")[-1].lower() if "." in filename else ""
        if ext in BINARY_EXTENSIONS:
            logger.debug(f"Skipping binary file: {filename}")
            continue

        filtered.append(file)

    logger.info(f"Filtered {len(files)} files to {len(filtered)} reviewable files")
    return filtered

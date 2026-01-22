"""
Code Agent - GPT-5 powered code quality review.

This agent analyzes code changes and provides:
- Code quality feedback
- Best practice suggestions
- Bug detection
- Inline comments on specific lines
"""

import json
import logging
from typing import Any, Dict, List

from openai import OpenAI

from src.agents.base import BaseAgent
from src.api.schemas import InlineComment, Severity
from src.config import get_settings, OPENAI_MODEL, OPENAI_MAX_TOKENS

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert code reviewer focused on code quality.

Analyze the provided code changes and identify issues related to:
1. Code logic and potential bugs
2. Error handling
3. Edge cases
4. Code style and readability
5. Best practices and patterns
6. Performance concerns

For each issue found, provide:
- The exact file path
- The line number where the issue occurs
- A clear explanation of the issue
- A suggested fix with code example
- Severity: "low", "medium", "high", or "critical"

IMPORTANT: You MUST respond with valid JSON in this exact format:
{
  "comments": [
    {
      "path": "src/example.py",
      "line": 45,
      "body": "**Issue Title**\\n\\nExplanation of the issue.\\n\\n💡 **Suggestion:**\\n```python\\n# suggested fix\\n```",
      "severity": "medium"
    }
  ],
  "summary": "Brief summary of findings"
}

If no issues are found, return: {"comments": [], "summary": "No issues found"}
"""


class CodeAgent(BaseAgent):
    """
    Agent that performs GPT-5 powered code review.

    Analyzes code quality and returns inline comments.
    """

    def __init__(self):
        super().__init__("CodeAgent")
        settings = get_settings()
        self.client = OpenAI(api_key=settings.openai_api_key)

    async def analyze(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze code quality and return inline comments.

        Args:
            context: PR context with files and RAG context

        Returns:
            Dictionary with inline comments and summary
        """
        files = context.get("files", [])
        rag_context = context.get("rag_context", [])

        if not files:
            return {"comments": [], "summary": "No files to review"}

        # Build the prompt with code context
        user_prompt = self._build_prompt(files, rag_context)

        try:
            # Call GPT-5
            self.logger.info(f"Calling {OPENAI_MODEL} for code review...")

            response = self.client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                max_completion_tokens=OPENAI_MAX_TOKENS,
                response_format={"type": "json_object"},
            )

            result_text = response.choices[0].message.content

            # Parse JSON response
            result = json.loads(result_text)

            # Convert to InlineComment objects
            comments = []
            for comment_data in result.get("comments", []):
                try:
                    comment = InlineComment(
                        path=comment_data["path"],
                        line=comment_data["line"],
                        body=self._format_comment_body(comment_data),
                        severity=Severity(comment_data.get("severity", "medium")),
                        agent="CodeAgent",
                    )
                    comments.append(comment)
                except Exception as e:
                    self.logger.warning(f"Failed to parse comment: {e}")

            return {
                "comments": [c.model_dump() for c in comments],
                "summary": result.get("summary", ""),
                "raw_response": result,
            }

        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse GPT response as JSON: {e}")
            return {"comments": [], "summary": "Failed to parse response", "error": str(e)}

        except Exception as e:
            self.logger.error(f"Code review failed: {e}")
            return {"comments": [], "summary": "Review failed", "error": str(e)}

    def _build_prompt(
        self, files: List[Dict], rag_context: List[Dict]
    ) -> str:
        """
        Build the user prompt with file changes and context.
        """
        prompt_parts = []

        # Add RAG context if available
        if rag_context:
            prompt_parts.append("## Relevant Codebase Context\n")
            for ctx in rag_context[:5]:  # Limit context pieces
                source = ctx.get("metadata", {}).get("filename", "unknown")
                content = ctx.get("metadata", {}).get("content", "")[:500]
                prompt_parts.append(f"**{source}:**\n```\n{content}\n```\n")
            prompt_parts.append("\n---\n")

        # Add files to review
        prompt_parts.append("## Files to Review\n")

        for file_info in files:
            filename = file_info.get("filename", "unknown")
            content = file_info.get("content", "")
            patch = file_info.get("patch", "")
            status = file_info.get("status", "modified")

            prompt_parts.append(f"\n### {filename} ({status})\n")

            # Include patch (diff) if available
            if patch:
                prompt_parts.append(f"**Changes (diff):**\n```diff\n{patch[:2000]}\n```\n")

            # Include full content for context
            if content:
                # Get file extension for syntax highlighting
                ext = "." + filename.split(".")[-1] if "." in filename else ""
                lang = self._get_language(ext)
                prompt_parts.append(f"**Full file:**\n```{lang}\n{content[:3000]}\n```\n")

        prompt_parts.append("\nAnalyze the above code and provide inline comments in JSON format.")

        return "\n".join(prompt_parts)

    def _format_comment_body(self, comment_data: Dict) -> str:
        """
        Format the comment body with emoji indicators.
        """
        severity = comment_data.get("severity", "medium")
        body = comment_data.get("body", "")

        # Add severity emoji
        emoji_map = {
            "critical": "🔴",
            "high": "🟠",
            "medium": "🟡",
            "low": "🟢",
        }
        emoji = emoji_map.get(severity, "🟡")

        return f"{emoji} **Code Agent**\n\n{body}"

    def _get_language(self, ext: str) -> str:
        """
        Get syntax highlighting language for file extension.
        """
        lang_map = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".jsx": "javascript",
            ".tsx": "typescript",
            ".java": "java",
            ".go": "go",
            ".rs": "rust",
            ".rb": "ruby",
            ".php": "php",
            ".css": "css",
            ".html": "html",
            ".json": "json",
            ".md": "markdown",
            ".c": "c",
            ".cpp": "cpp",
        }
        return lang_map.get(ext, "")

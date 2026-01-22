"""
Security Agent - GPT-5 powered security vulnerability scanner.

This agent analyzes code changes for security issues:
- SQL injection
- XSS vulnerabilities
- Hardcoded secrets
- Authentication/Authorization issues
- Input validation problems
- OWASP Top 10 vulnerabilities
"""

import json
import logging
from typing import Any, Dict, List

from openai import OpenAI

from src.agents.base import BaseAgent
from src.api.schemas import InlineComment, Severity
from src.config import get_settings, OPENAI_MODEL, OPENAI_MAX_TOKENS

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert security auditor performing a security review.

Analyze the provided code changes for security vulnerabilities including:
1. **Injection Attacks**: SQL injection, command injection, XSS
2. **Authentication Issues**: Weak auth, session management flaws
3. **Authorization Issues**: Missing access controls, privilege escalation
4. **Sensitive Data Exposure**: Hardcoded secrets, API keys, passwords
5. **Input Validation**: Missing or insufficient validation
6. **Cryptography**: Weak algorithms, improper implementation
7. **Error Handling**: Information leakage through errors
8. **OWASP Top 10**: Any relevant vulnerabilities

For each security issue found, provide:
- The exact file path
- The line number where the issue occurs
- A clear explanation of the vulnerability
- The potential impact
- A secure code example to fix it
- Severity: "low", "medium", "high", or "critical"

IMPORTANT: You MUST respond with valid JSON in this exact format:
{
  "findings": [
    {
      "path": "src/example.py",
      "line": 45,
      "issue": "SQL Injection Vulnerability",
      "description": "User input is directly concatenated into SQL query without sanitization.",
      "impact": "Attackers could execute arbitrary SQL commands.",
      "fix": "```python\\ncursor.execute(\\"SELECT * FROM users WHERE id = %s\\", (user_id,))\\n```",
      "severity": "critical"
    }
  ],
  "summary": "Found X security issues: Y critical, Z high"
}

If no security issues are found, return: {"findings": [], "summary": "No security issues found"}

Be thorough but avoid false positives. Only report real security concerns.
"""


class SecurityAgent(BaseAgent):
    """
    Agent that performs GPT-5 powered security scanning.

    Identifies security vulnerabilities and returns inline comments.
    """

    def __init__(self):
        super().__init__("SecurityAgent")
        settings = get_settings()
        self.client = OpenAI(api_key=settings.openai_api_key)

    async def analyze(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Scan code for security vulnerabilities.

        Args:
            context: PR context with files

        Returns:
            Dictionary with security findings as inline comments
        """
        files = context.get("files", [])

        if not files:
            return {"comments": [], "summary": "No files to scan"}

        # Build the prompt
        user_prompt = self._build_prompt(files)

        try:
            # Call GPT-5
            self.logger.info(f"Calling {OPENAI_MODEL} for security scan...")

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

            # Convert findings to InlineComment objects
            comments = []
            for finding in result.get("findings", []):
                try:
                    comment = InlineComment(
                        path=finding["path"],
                        line=finding["line"],
                        body=self._format_security_comment(finding),
                        severity=Severity(finding.get("severity", "high")),
                        agent="SecurityAgent",
                    )
                    comments.append(comment)
                except Exception as e:
                    self.logger.warning(f"Failed to parse finding: {e}")

            return {
                "comments": [c.model_dump() for c in comments],
                "summary": result.get("summary", ""),
                "findings_count": len(comments),
                "raw_response": result,
            }

        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse GPT response as JSON: {e}")
            return {"comments": [], "summary": "Failed to parse response", "error": str(e)}

        except Exception as e:
            self.logger.error(f"Security scan failed: {e}")
            return {"comments": [], "summary": "Scan failed", "error": str(e)}

    def _build_prompt(self, files: List[Dict]) -> str:
        """
        Build the security scan prompt.
        """
        prompt_parts = [
            "## Security Scan Request\n",
            "Analyze the following code changes for security vulnerabilities.\n",
            "---\n",
        ]

        for file_info in files:
            filename = file_info.get("filename", "unknown")
            content = file_info.get("content", "")
            patch = file_info.get("patch", "")

            prompt_parts.append(f"\n### {filename}\n")

            # Include patch (diff) for focused analysis
            if patch:
                prompt_parts.append(f"**Changes:**\n```diff\n{patch[:2500]}\n```\n")

            # Include full content for context
            if content:
                ext = "." + filename.split(".")[-1] if "." in filename else ""
                lang = self._get_language(ext)
                prompt_parts.append(f"**Full file:**\n```{lang}\n{content[:4000]}\n```\n")

        prompt_parts.append("\n---\n")
        prompt_parts.append("Identify any security vulnerabilities and respond in JSON format.")

        return "\n".join(prompt_parts)

    def _format_security_comment(self, finding: Dict) -> str:
        """
        Format security finding as a comment body.
        """
        severity = finding.get("severity", "high")
        issue = finding.get("issue", "Security Issue")
        description = finding.get("description", "")
        impact = finding.get("impact", "")
        fix = finding.get("fix", "")

        # Severity emoji
        emoji_map = {
            "critical": "🔴",
            "high": "🟠",
            "medium": "🟡",
            "low": "🟢",
        }
        emoji = emoji_map.get(severity, "🟠")

        parts = [
            f"{emoji} **Security Agent** - {issue}",
            "",
            description,
        ]

        if impact:
            parts.extend(["", f"**Impact:** {impact}"])

        if fix:
            parts.extend(["", "**Recommended Fix:**", fix])

        return "\n".join(parts)

    def _get_language(self, ext: str) -> str:
        """
        Get syntax highlighting language.
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
        }
        return lang_map.get(ext, "")

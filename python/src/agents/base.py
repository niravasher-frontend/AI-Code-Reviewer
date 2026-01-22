"""
Base agent class for all R³ agents.
"""

import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from src.api.schemas import AgentResult

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """
    Abstract base class for all R³ agents.

    Each agent specializes in a specific aspect of PR review:
    - RiskAgent: Calculates risk signals
    - ComplexityAgent: Analyzes code complexity
    - CodeAgent: Reviews code quality
    - SecurityAgent: Scans for vulnerabilities
    """

    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"r3.{name}")

    @abstractmethod
    async def analyze(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze the PR context and return results.

        Args:
            context: Dictionary containing PR information:
                - owner: Repository owner
                - repo: Repository name
                - pr_number: PR number
                - author: PR author
                - files: List of file dicts with filename, content, patch, etc.
                - rag_context: Retrieved context from knowledge base

        Returns:
            Dictionary with agent-specific results
        """
        pass

    async def run(self, context: Dict[str, Any]) -> AgentResult:
        """
        Execute the agent with error handling and timing.

        Args:
            context: PR context dictionary

        Returns:
            AgentResult with success status, data, and timing
        """
        start_time = time.time()

        try:
            self.logger.info(f"Starting {self.name} analysis...")

            data = await self.analyze(context)

            execution_time = int((time.time() - start_time) * 1000)
            self.logger.info(f"{self.name} completed in {execution_time}ms")

            return AgentResult(
                agent_name=self.name,
                success=True,
                data=data,
                execution_time_ms=execution_time,
            )

        except Exception as e:
            execution_time = int((time.time() - start_time) * 1000)
            self.logger.error(f"{self.name} failed: {e}")

            return AgentResult(
                agent_name=self.name,
                success=False,
                error=str(e),
                execution_time_ms=execution_time,
            )

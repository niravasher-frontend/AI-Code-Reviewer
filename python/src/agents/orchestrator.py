"""
Orchestrator - Coordinates all R³ agents.

This is the main entry point for the multi-agent system.
It runs agents in parallel, handles errors gracefully,
and produces the final review output.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List

from src.agents.base import BaseAgent
from src.agents.risk_agent import RiskAgent
from src.agents.complexity_agent import ComplexityAgent
from src.agents.code_agent import CodeAgent
from src.agents.security_agent import SecurityAgent
from src.agents.synthesizer import Synthesizer
from src.api.schemas import (
    AgentResult,
    RiskSignal,
    InlineComment,
    RiskLevel,
)
from src.audit.store import save_audit_trace

logger = logging.getLogger(__name__)


class Orchestrator:
    """
    Orchestrates all R³ agents for PR review.

    Runs agents in parallel and synthesizes results.
    """

    def __init__(self):
        self.logger = logging.getLogger("r3.Orchestrator")

        # Initialize agents
        self.risk_agent = RiskAgent()
        self.complexity_agent = ComplexityAgent()
        self.code_agent = CodeAgent()
        self.security_agent = SecurityAgent()

        # Synthesizer for combining results
        self.synthesizer = Synthesizer()

    async def review_pr(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run full PR review with all agents.

        Args:
            context: PR context dictionary containing:
                - owner: Repository owner
                - repo: Repository name
                - pr_number: PR number
                - author: PR author
                - files: List of file dicts
                - rag_context: Retrieved codebase context

        Returns:
            Dictionary with:
                - risk_score: Overall risk score (0-100)
                - risk_level: Risk level string
                - summary_comment: Markdown summary to post
                - inline_comments: List of inline comments
                - audit_id: Audit trace ID
                - signals: List of risk signals
        """
        start_time = time.time()

        self.logger.info("=" * 50)
        self.logger.info("🎯 R³ Release Risk Radar - Starting Review")
        self.logger.info("=" * 50)

        owner = context.get("owner", "")
        repo = context.get("repo", "")
        pr_number = context.get("pr_number", 0)
        author = context.get("author", "unknown")

        self.logger.info(f"PR: {owner}/{repo}#{pr_number} by {author}")
        self.logger.info(f"Files: {len(context.get('files', []))}")

        # Run agents in parallel
        self.logger.info("Running agents in parallel...")

        agent_results = await self._run_agents_parallel(context)

        # Extract results from each agent
        risk_data = self._get_agent_data(agent_results, "RiskAgent")
        complexity_data = self._get_agent_data(agent_results, "ComplexityAgent")
        code_data = self._get_agent_data(agent_results, "CodeAgent")
        security_data = self._get_agent_data(agent_results, "SecurityAgent")

        # Log agent statuses
        for result in agent_results:
            status = "✅" if result.success else "❌"
            self.logger.info(
                f"  {status} {result.agent_name}: {result.execution_time_ms}ms"
            )

        # Synthesize results
        self.logger.info("Synthesizing results...")

        synthesis = self.synthesizer.synthesize(
            risk_data=risk_data,
            complexity_data=complexity_data,
            code_comments=code_data,
            security_findings=security_data,
            context=context,
        )

        risk_assessment = synthesis["risk_assessment"]
        inline_comments = synthesis["inline_comments"]

        # Calculate total execution time
        execution_time_ms = int((time.time() - start_time) * 1000)

        # Save audit trace
        agents_used = [r.agent_name for r in agent_results if r.success]

        audit_id = save_audit_trace(
            repository=f"{owner}/{repo}",
            pr_number=pr_number,
            pr_author=author,
            risk_score=risk_assessment.total_score,
            risk_level=risk_assessment.level,
            signals=risk_assessment.signals,
            inline_comments_count=len(inline_comments),
            agents_used=agents_used,
            execution_time_ms=execution_time_ms,
        )

        # Add audit ID to summary
        summary_with_audit = (
            synthesis["summary_comment"] +
            f"\n*Audit ID: {audit_id}*"
        )

        self.logger.info("=" * 50)
        self.logger.info(f"✅ Review complete in {execution_time_ms}ms")
        self.logger.info(f"   Risk Score: {risk_assessment.total_score}/100 ({risk_assessment.level.value})")
        self.logger.info(f"   Inline Comments: {len(inline_comments)}")
        self.logger.info(f"   Audit ID: {audit_id}")
        self.logger.info("=" * 50)

        return {
            "risk_score": risk_assessment.total_score,
            "risk_level": risk_assessment.level,
            "summary_comment": summary_with_audit,
            "inline_comments": inline_comments,
            "audit_id": audit_id,
            "signals": [s.model_dump() for s in risk_assessment.signals],
            "execution_time_ms": execution_time_ms,
            "agents_used": agents_used,
        }

    async def _run_agents_parallel(
        self, context: Dict[str, Any]
    ) -> List[AgentResult]:
        """
        Run all agents in parallel.
        """
        tasks = [
            self.risk_agent.run(context),
            self.complexity_agent.run(context),
            self.code_agent.run(context),
            self.security_agent.run(context),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Convert exceptions to failed AgentResults
        agent_results = []
        agent_names = ["RiskAgent", "ComplexityAgent", "CodeAgent", "SecurityAgent"]

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                self.logger.error(f"{agent_names[i]} raised exception: {result}")
                agent_results.append(AgentResult(
                    agent_name=agent_names[i],
                    success=False,
                    error=str(result),
                ))
            else:
                agent_results.append(result)

        return agent_results

    def _get_agent_data(
        self, results: List[AgentResult], agent_name: str
    ) -> Dict[str, Any]:
        """
        Extract data from a specific agent's result.
        """
        for result in results:
            if result.agent_name == agent_name and result.success:
                return result.data or {}

        return {}


# Convenience function for webhook integration
async def run_r3_review(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run R³ review - convenience function for webhook.

    Args:
        context: PR context

    Returns:
        Review results
    """
    orchestrator = Orchestrator()
    return await orchestrator.review_pr(context)

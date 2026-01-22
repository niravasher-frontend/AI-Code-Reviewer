"""
Synthesizer - Combines outputs from all agents into final review.

This module:
- Calculates weighted risk score
- Merges inline comments from all agents
- Generates the summary markdown comment
- Prepares the final review output
"""

import logging
from typing import Any, Dict, List

from src.api.schemas import (
    RiskSignal,
    RiskLevel,
    RiskAssessment,
    InlineComment,
    Severity,
)

logger = logging.getLogger(__name__)

# Risk signal weights for scoring
SIGNAL_WEIGHTS = {
    "Code Churn": 0.20,
    "Author Experience": 0.15,
    "Incident History": 0.15,
    "PR Scope": 0.15,
    "File Hotspots": 0.15,
    "Code Complexity": 0.20,
}


class Synthesizer:
    """
    Combines all agent outputs into a cohesive review.
    """

    def __init__(self):
        self.logger = logging.getLogger("r3.Synthesizer")

    def synthesize(
        self,
        risk_data: Dict[str, Any],
        complexity_data: Dict[str, Any],
        code_comments: Dict[str, Any],
        security_findings: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Synthesize all agent outputs into final review.

        Args:
            risk_data: Output from RiskAgent
            complexity_data: Output from ComplexityAgent
            code_comments: Output from CodeAgent
            security_findings: Output from SecurityAgent
            context: Original PR context

        Returns:
            Dictionary with:
            - risk_assessment: Overall risk score and breakdown
            - summary_comment: Markdown summary for PR
            - inline_comments: All inline comments to post
        """
        # 1. Collect all risk signals
        signals = self._collect_signals(risk_data, complexity_data)

        # 2. Calculate overall risk score
        risk_assessment = self._calculate_risk_assessment(signals)

        # 3. Merge all inline comments
        inline_comments = self._merge_comments(code_comments, security_findings)

        # 4. Generate summary markdown
        summary_comment = self._generate_summary(
            risk_assessment,
            inline_comments,
            context,
        )

        return {
            "risk_assessment": risk_assessment,
            "summary_comment": summary_comment,
            "inline_comments": inline_comments,
            "signals": signals,
        }

    def _collect_signals(
        self,
        risk_data: Dict[str, Any],
        complexity_data: Dict[str, Any],
    ) -> List[RiskSignal]:
        """
        Collect all risk signals from agent outputs.
        """
        signals = []

        # Signals from RiskAgent
        for signal_dict in risk_data.get("signals", []):
            try:
                signal = RiskSignal(**signal_dict)
                signals.append(signal)
            except Exception as e:
                self.logger.warning(f"Invalid signal: {e}")

        # Signal from ComplexityAgent
        complexity_signal = complexity_data.get("signal")
        if complexity_signal:
            try:
                signals.append(RiskSignal(**complexity_signal))
            except Exception as e:
                self.logger.warning(f"Invalid complexity signal: {e}")

        return signals

    def _calculate_risk_assessment(
        self, signals: List[RiskSignal]
    ) -> RiskAssessment:
        """
        Calculate weighted risk score from all signals.
        """
        if not signals:
            return RiskAssessment(
                total_score=0,
                level=RiskLevel.LOW,
                signals=[],
                top_factors=[],
            )

        # Calculate weighted average
        weighted_sum = 0
        total_weight = 0

        for signal in signals:
            weight = SIGNAL_WEIGHTS.get(signal.name, 0.1)
            weighted_sum += signal.score * weight
            total_weight += weight

        if total_weight > 0:
            total_score = int(weighted_sum / total_weight)
        else:
            total_score = int(sum(s.score for s in signals) / len(signals))

        # Ensure score is in valid range
        total_score = max(0, min(100, total_score))

        # Determine risk level
        level = self._get_risk_level(total_score)

        # Get top risk factors (highest scoring signals)
        sorted_signals = sorted(signals, key=lambda s: s.score, reverse=True)
        top_factors = [
            f"{s.name}: {s.evidence}"
            for s in sorted_signals[:3]
            if s.score >= 50
        ]

        return RiskAssessment(
            total_score=total_score,
            level=level,
            signals=signals,
            top_factors=top_factors,
        )

    def _get_risk_level(self, score: int) -> RiskLevel:
        """
        Convert numeric score to risk level.
        """
        if score < 25:
            return RiskLevel.LOW
        elif score < 50:
            return RiskLevel.MEDIUM
        elif score < 75:
            return RiskLevel.HIGH
        else:
            return RiskLevel.CRITICAL

    def _merge_comments(
        self,
        code_comments: Dict[str, Any],
        security_findings: Dict[str, Any],
    ) -> List[InlineComment]:
        """
        Merge inline comments from all agents.
        """
        comments = []

        # Comments from CodeAgent
        for comment_dict in code_comments.get("comments", []):
            try:
                comment = InlineComment(**comment_dict)
                comments.append(comment)
            except Exception as e:
                self.logger.warning(f"Invalid code comment: {e}")

        # Comments from SecurityAgent
        for comment_dict in security_findings.get("comments", []):
            try:
                comment = InlineComment(**comment_dict)
                comments.append(comment)
            except Exception as e:
                self.logger.warning(f"Invalid security comment: {e}")

        # Sort by severity (critical first) then by file
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        comments.sort(
            key=lambda c: (severity_order.get(c.severity.value, 2), c.path, c.line)
        )

        return comments

    def _generate_summary(
        self,
        risk_assessment: RiskAssessment,
        inline_comments: List[InlineComment],
        context: Dict[str, Any],
    ) -> str:
        """
        Generate the markdown summary comment.
        """
        level_emoji = {
            RiskLevel.LOW: "🟢",
            RiskLevel.MEDIUM: "🟡",
            RiskLevel.HIGH: "🟠",
            RiskLevel.CRITICAL: "🔴",
        }

        signal_emoji = {
            "Code Churn": "🔄",
            "Author Experience": "👤",
            "Incident History": "🐛",
            "PR Scope": "📏",
            "File Hotspots": "🔥",
            "Code Complexity": "📊",
        }

        emoji = level_emoji.get(risk_assessment.level, "🟡")

        # Build summary
        lines = [
            "## 🎯 R³ Release Risk Radar",
            "",
            f"### {emoji} Risk Score: {risk_assessment.total_score}/100 ({risk_assessment.level.value})",
            "",
            "| Signal | Score | Evidence |",
            "|--------|-------|----------|",
        ]

        # Add signal rows
        for signal in risk_assessment.signals:
            sig_emoji = signal_emoji.get(signal.name, "📌")
            lines.append(
                f"| {sig_emoji} {signal.name} | {signal.score}/100 | {signal.evidence[:50]}{'...' if len(signal.evidence) > 50 else ''} |"
            )

        lines.append("")

        # Add top risk factors if any
        if risk_assessment.top_factors:
            lines.append("### ⚠️ Top Risk Factors")
            for i, factor in enumerate(risk_assessment.top_factors, 1):
                lines.append(f"{i}. {factor}")
            lines.append("")

        # Add inline comments summary
        if inline_comments:
            # Count by severity
            severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for comment in inline_comments:
                severity_counts[comment.severity.value] += 1

            lines.append("### 📝 Review Comments")
            lines.append(f"Found **{len(inline_comments)}** issues:")

            if severity_counts["critical"] > 0:
                lines.append(f"- 🔴 Critical: {severity_counts['critical']}")
            if severity_counts["high"] > 0:
                lines.append(f"- 🟠 High: {severity_counts['high']}")
            if severity_counts["medium"] > 0:
                lines.append(f"- 🟡 Medium: {severity_counts['medium']}")
            if severity_counts["low"] > 0:
                lines.append(f"- 🟢 Low: {severity_counts['low']}")

            lines.append("")
            lines.append("*See inline comments for details*")
            lines.append("")
        else:
            lines.append("### ✅ No Issues Found")
            lines.append("The code looks good! No inline comments to add.")
            lines.append("")

        # Footer
        lines.extend([
            "---",
            f"*R³ Release Risk Radar | Multi-Agent AI Review*",
        ])

        return "\n".join(lines)

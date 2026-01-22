"""
Complexity Agent - Analyzes code complexity using Python AST.

This agent calculates REAL complexity metrics:
- Cyclomatic complexity
- Nesting depth
- Function/class counts
- Lines of code
"""

import ast
import re
from typing import Any, Dict, List

from src.agents.base import BaseAgent
from src.api.schemas import RiskSignal


class ComplexityAgent(BaseAgent):
    """
    Agent that analyzes code complexity using AST parsing.

    Uses Python's ast module for Python files.
    Falls back to heuristic analysis for other languages.
    """

    def __init__(self):
        super().__init__("ComplexityAgent")

    async def analyze(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze code complexity for all PR files.

        Args:
            context: PR context with files

        Returns:
            Dictionary with complexity metrics and risk signal
        """
        files = context.get("files", [])
        file_metrics = []
        total_complexity = 0
        total_files = 0

        for file_info in files:
            filename = file_info.get("filename", "")
            content = file_info.get("content", "")

            if not content:
                continue

            # Analyze based on file type
            if filename.endswith(".py"):
                metrics = self._analyze_python(content, filename)
            else:
                metrics = self._analyze_heuristic(content, filename)

            file_metrics.append(metrics)
            total_complexity += metrics.get("complexity_score", 0)
            total_files += 1

        # Calculate overall complexity score
        if total_files > 0:
            avg_complexity = total_complexity / total_files
        else:
            avg_complexity = 0

        # Convert to risk score (0-100)
        risk_score = min(int(avg_complexity * 5), 100)  # Scale factor

        signal = RiskSignal(
            name="Code Complexity",
            score=risk_score,
            evidence=self._build_evidence(file_metrics, avg_complexity),
            details={
                "files_analyzed": total_files,
                "average_complexity": round(avg_complexity, 2),
                "file_metrics": file_metrics,
            },
        )

        return {
            "signal": signal.model_dump(),
            "file_metrics": file_metrics,
            "average_complexity": avg_complexity,
        }

    def _analyze_python(self, code: str, filename: str) -> Dict[str, Any]:
        """
        Analyze Python code using AST.

        Args:
            code: Python source code
            filename: File name for reporting

        Returns:
            Dictionary with complexity metrics
        """
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            self.logger.warning(f"Could not parse {filename}: {e}")
            return self._analyze_heuristic(code, filename)

        metrics = {
            "filename": filename,
            "language": "python",
            "lines": len(code.splitlines()),
            "functions": 0,
            "classes": 0,
            "branches": 0,  # if/elif/else
            "loops": 0,  # for/while
            "try_blocks": 0,
            "max_nesting": 0,
        }

        # Count constructs
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                metrics["functions"] += 1
            elif isinstance(node, ast.ClassDef):
                metrics["classes"] += 1
            elif isinstance(node, (ast.If, ast.IfExp)):
                metrics["branches"] += 1
            elif isinstance(node, (ast.For, ast.While)):
                metrics["loops"] += 1
            elif isinstance(node, ast.Try):
                metrics["try_blocks"] += 1

        # Calculate nesting depth
        metrics["max_nesting"] = self._calculate_nesting_depth(tree)

        # Calculate cyclomatic complexity estimate
        # CC = 1 + branches + loops
        metrics["cyclomatic_complexity"] = (
            1 + metrics["branches"] + metrics["loops"]
        )

        # Calculate overall complexity score (0-20 scale)
        metrics["complexity_score"] = self._calculate_complexity_score(metrics)

        return metrics

    def _analyze_heuristic(self, code: str, filename: str) -> Dict[str, Any]:
        """
        Heuristic-based analysis for non-Python files.

        Uses regex patterns to estimate complexity.
        """
        lines = code.splitlines()

        metrics = {
            "filename": filename,
            "language": "other",
            "lines": len(lines),
            "functions": len(re.findall(
                r'\bdef\b|\bfunction\b|\bfunc\b|=>|->.*\{', code
            )),
            "classes": len(re.findall(r'\bclass\b', code)),
            "branches": len(re.findall(
                r'\bif\b|\belse\b|\belif\b|\belse if\b|\bswitch\b|\bcase\b|\?\s*:', code
            )),
            "loops": len(re.findall(r'\bfor\b|\bwhile\b|\bloop\b', code)),
            "try_blocks": len(re.findall(r'\btry\b|\bcatch\b|\bexcept\b', code)),
        }

        # Estimate nesting from indentation
        max_indent = 0
        for line in lines:
            if line.strip():
                indent = len(line) - len(line.lstrip())
                # Assume 2 or 4 space indent
                indent_level = indent // 2 if indent % 4 != 0 else indent // 4
                max_indent = max(max_indent, indent_level)

        metrics["max_nesting"] = min(max_indent, 10)  # Cap at 10

        # Estimate cyclomatic complexity
        metrics["cyclomatic_complexity"] = (
            1 + metrics["branches"] + metrics["loops"]
        )

        metrics["complexity_score"] = self._calculate_complexity_score(metrics)

        return metrics

    def _calculate_nesting_depth(self, tree: ast.AST) -> int:
        """
        Calculate maximum nesting depth in AST.
        """
        max_depth = 0

        def visit(node: ast.AST, depth: int = 0):
            nonlocal max_depth
            max_depth = max(max_depth, depth)

            for child in ast.iter_child_nodes(node):
                if isinstance(child, (ast.If, ast.For, ast.While, ast.Try, ast.With)):
                    visit(child, depth + 1)
                else:
                    visit(child, depth)

        visit(tree)
        return max_depth

    def _calculate_complexity_score(self, metrics: Dict) -> float:
        """
        Calculate overall complexity score (0-20 scale).
        """
        score = 0

        # Lines of code factor
        lines = metrics.get("lines", 0)
        if lines > 500:
            score += 5
        elif lines > 200:
            score += 3
        elif lines > 100:
            score += 1

        # Cyclomatic complexity factor
        cc = metrics.get("cyclomatic_complexity", 0)
        if cc > 20:
            score += 6
        elif cc > 10:
            score += 4
        elif cc > 5:
            score += 2

        # Nesting depth factor
        nesting = metrics.get("max_nesting", 0)
        if nesting > 5:
            score += 5
        elif nesting > 3:
            score += 3
        elif nesting > 2:
            score += 1

        # Function count factor (too many = complex)
        funcs = metrics.get("functions", 0)
        if funcs > 20:
            score += 4
        elif funcs > 10:
            score += 2

        return min(score, 20)

    def _build_evidence(
        self, file_metrics: List[Dict], avg_complexity: float
    ) -> str:
        """
        Build human-readable evidence string.
        """
        if not file_metrics:
            return "No files analyzed"

        # Find most complex file
        most_complex = max(
            file_metrics,
            key=lambda x: x.get("complexity_score", 0)
        )

        parts = []

        if avg_complexity > 10:
            parts.append("High complexity detected")
        elif avg_complexity > 5:
            parts.append("Moderate complexity")
        else:
            parts.append("Low complexity")

        cc = most_complex.get("cyclomatic_complexity", 0)
        nesting = most_complex.get("max_nesting", 0)

        if cc > 10:
            parts.append(f"cyclomatic: {cc}")
        if nesting > 3:
            parts.append(f"nesting depth: {nesting}")

        return ", ".join(parts)

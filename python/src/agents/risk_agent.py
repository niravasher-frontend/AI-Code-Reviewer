"""
Risk Agent - Calculates risk signals from PR metadata and mock data.

This agent generates risk scores based on:
- Code churn (derived from file count and mock history)
- Author experience (mock familiarity data)
- Incident history (mock Jira incidents)
- PR scope (real PR size metrics)
"""

import random
from typing import Any, Dict, List

from src.agents.base import BaseAgent
from src.api.schemas import RiskSignal
from src.mock_data.incidents import (
    find_matching_incidents,
    get_hotspot_score,
    MOCK_AUTHOR_HISTORY,
)


class RiskAgent(BaseAgent):
    """
    Agent that calculates risk signals for a PR.

    Uses mock data for demo, but real PR metadata for realistic scoring.
    """

    def __init__(self):
        super().__init__("RiskAgent")

    async def analyze(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze PR context and return risk signals.

        Args:
            context: PR context with files, author, etc.

        Returns:
            Dictionary with risk signals and overall assessment
        """
        files = context.get("files", [])
        author = context.get("author", "unknown")
        filenames = [f.get("filename", "") for f in files]

        # Calculate each risk signal
        signals = []

        # 1. Code Churn Signal
        churn_signal = self._calculate_churn(filenames, files)
        signals.append(churn_signal)

        # 2. Author Experience Signal
        author_signal = self._calculate_author_experience(author, filenames)
        signals.append(author_signal)

        # 3. Incident History Signal
        incident_signal = self._calculate_incident_history(filenames)
        signals.append(incident_signal)

        # 4. PR Scope Signal
        scope_signal = self._calculate_pr_scope(files)
        signals.append(scope_signal)

        # 5. File Hotspots Signal
        hotspot_signal = self._calculate_hotspots(filenames)
        signals.append(hotspot_signal)

        return {
            "signals": [s.model_dump() for s in signals],
            "filenames": filenames,
            "author": author,
        }

    def _calculate_churn(
        self, filenames: List[str], files: List[Dict]
    ) -> RiskSignal:
        """
        Calculate code churn risk based on file activity.

        Higher churn in 'hot' directories = higher risk.
        """
        hot_dirs = ["auth", "payment", "api", "core", "security"]
        hot_file_count = sum(
            1 for f in filenames if any(d in f.lower() for d in hot_dirs)
        )

        # Base score from file count + hot area bonus
        base_score = min(len(filenames) * 10, 50)
        hot_bonus = hot_file_count * 15

        # Add some randomness for demo variety
        random_factor = random.randint(-5, 10)

        score = min(base_score + hot_bonus + random_factor, 100)
        score = max(score, 10)  # Minimum score of 10

        # Mock commit data
        mock_commits = random.randint(5, 20)

        return RiskSignal(
            name="Code Churn",
            score=score,
            evidence=f"{len(filenames)} files changed, {hot_file_count} in high-activity areas",
            details={
                "files_changed": len(filenames),
                "hot_area_files": hot_file_count,
                "commits_last_30_days": mock_commits,
                "unique_authors": random.randint(2, 5),
            },
        )

    def _calculate_author_experience(
        self, author: str, filenames: List[str]
    ) -> RiskSignal:
        """
        Calculate author experience risk.

        New authors to an area = higher risk.
        """
        experienced_paths = MOCK_AUTHOR_HISTORY.get("experienced_authors", {})

        # Check if author is known and experienced with these paths
        author_paths = experienced_paths.get(author.lower(), [])

        is_experienced = any(
            any(path in filename.lower() for path in author_paths)
            for filename in filenames
        )

        if is_experienced:
            score = random.randint(15, 35)
            evidence = f"Author {author} has prior experience in this area"
            prior_commits = random.randint(10, 30)
        else:
            score = MOCK_AUTHOR_HISTORY.get("default_experience_score", 65)
            score += random.randint(-10, 10)
            score = min(max(score, 30), 90)
            evidence = f"Author {author} is new to this area of the codebase"
            prior_commits = random.randint(0, 3)

        return RiskSignal(
            name="Author Experience",
            score=score,
            evidence=evidence,
            details={
                "author": author,
                "prior_commits_to_area": prior_commits,
                "is_experienced": is_experienced,
            },
        )

    def _calculate_incident_history(self, filenames: List[str]) -> RiskSignal:
        """
        Calculate incident history risk based on mock Jira data.
        """
        matched_incidents = find_matching_incidents(filenames)

        if not matched_incidents:
            return RiskSignal(
                name="Incident History",
                score=random.randint(5, 20),
                evidence="No related incidents found in history",
                details={"incidents": [], "incident_count": 0},
            )

        # Score based on number and severity of incidents
        base_score = 30
        for incident in matched_incidents:
            if incident["severity"] == "critical":
                base_score += 25
            elif incident["severity"] == "high":
                base_score += 15
            else:
                base_score += 10

        score = min(base_score, 100)

        incident_keys = [i["key"] for i in matched_incidents]

        return RiskSignal(
            name="Incident History",
            score=score,
            evidence=f"{len(matched_incidents)} related incident(s): {', '.join(incident_keys)}",
            details={
                "incidents": matched_incidents,
                "incident_count": len(matched_incidents),
            },
        )

    def _calculate_pr_scope(self, files: List[Dict]) -> RiskSignal:
        """
        Calculate PR scope risk based on size.

        Larger PRs = higher risk.
        """
        file_count = len(files)
        total_additions = sum(f.get("additions", 0) for f in files)
        total_deletions = sum(f.get("deletions", 0) for f in files)
        total_changes = total_additions + total_deletions

        # Score based on size
        if file_count <= 3 and total_changes < 100:
            score = random.randint(10, 25)
            size_label = "Small"
        elif file_count <= 7 and total_changes < 300:
            score = random.randint(25, 45)
            size_label = "Medium"
        elif file_count <= 15 and total_changes < 700:
            score = random.randint(45, 65)
            size_label = "Large"
        else:
            score = random.randint(65, 85)
            size_label = "Very Large"

        return RiskSignal(
            name="PR Scope",
            score=score,
            evidence=f"{size_label} PR: {file_count} files, {total_changes} lines changed",
            details={
                "files_count": file_count,
                "additions": total_additions,
                "deletions": total_deletions,
                "total_changes": total_changes,
                "size_label": size_label,
            },
        )

    def _calculate_hotspots(self, filenames: List[str]) -> RiskSignal:
        """
        Calculate file hotspot risk.

        Files in known problematic areas = higher risk.
        """
        hotspot_files = []

        for filename in filenames:
            hotspot = get_hotspot_score(filename)
            if hotspot:
                hotspot_files.append({
                    "file": filename,
                    "hotspot": hotspot,
                })

        if not hotspot_files:
            return RiskSignal(
                name="File Hotspots",
                score=random.randint(5, 20),
                evidence="No files in known hotspot areas",
                details={"hotspots": []},
            )

        # Average hotspot churn scores
        avg_churn = sum(
            h["hotspot"]["churn_score"] for h in hotspot_files
        ) / len(hotspot_files)

        score = min(int(avg_churn), 100)

        hotspot_names = list(set(h["hotspot"]["pattern"] for h in hotspot_files))

        return RiskSignal(
            name="File Hotspots",
            score=score,
            evidence=f"{len(hotspot_files)} file(s) in hotspot areas: {', '.join(hotspot_names)}",
            details={
                "hotspots": hotspot_files,
                "hotspot_areas": hotspot_names,
            },
        )

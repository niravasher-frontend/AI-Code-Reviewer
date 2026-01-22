"""
Mock data for simulating Jira incidents and git history.

This data is used for hackathon demo purposes.
In production, this would come from real Jira and Git APIs.
"""

from typing import Dict, List, Optional

# Mock Jira incidents - matched against file paths
MOCK_INCIDENTS = [
    {
        "key": "JIRA-456",
        "summary": "Authentication bypass vulnerability in login flow",
        "priority": "P1",
        "severity": "critical",
        "keywords": ["auth", "login", "security", "user", "password", "token"],
        "resolved_days_ago": 30,
        "root_cause": "Missing input validation",
    },
    {
        "key": "JIRA-789",
        "summary": "Payment processing timeout under load",
        "priority": "P2",
        "severity": "high",
        "keywords": ["payment", "transaction", "checkout", "stripe", "billing"],
        "resolved_days_ago": 45,
        "root_cause": "Database connection pool exhaustion",
    },
    {
        "key": "JIRA-234",
        "summary": "Memory leak in data processing pipeline",
        "priority": "P2",
        "severity": "high",
        "keywords": ["utils", "helper", "process", "data", "transform"],
        "resolved_days_ago": 15,
        "root_cause": "Unclosed file handles",
    },
    {
        "key": "JIRA-567",
        "summary": "XSS vulnerability in user profile page",
        "priority": "P1",
        "severity": "critical",
        "keywords": ["profile", "user", "display", "render", "html", "template"],
        "resolved_days_ago": 60,
        "root_cause": "Unsanitized user input in template",
    },
    {
        "key": "JIRA-890",
        "summary": "API rate limiting not enforced",
        "priority": "P2",
        "severity": "medium",
        "keywords": ["api", "endpoint", "route", "controller", "request"],
        "resolved_days_ago": 20,
        "root_cause": "Middleware misconfiguration",
    },
]

# Mock file hotspots - directories/files known to be problematic
MOCK_HOTSPOTS = {
    "auth/": {"churn_score": 85, "bug_count": 5, "last_incident": "JIRA-456"},
    "auth": {"churn_score": 85, "bug_count": 5, "last_incident": "JIRA-456"},
    "login": {"churn_score": 80, "bug_count": 4, "last_incident": "JIRA-456"},
    "security": {"churn_score": 75, "bug_count": 3, "last_incident": "JIRA-456"},
    "payment/": {"churn_score": 70, "bug_count": 3, "last_incident": "JIRA-789"},
    "payment": {"churn_score": 70, "bug_count": 3, "last_incident": "JIRA-789"},
    "transaction": {"churn_score": 65, "bug_count": 2, "last_incident": "JIRA-789"},
    "checkout": {"churn_score": 60, "bug_count": 2, "last_incident": "JIRA-789"},
    "api/": {"churn_score": 55, "bug_count": 2, "last_incident": "JIRA-890"},
    "utils/": {"churn_score": 45, "bug_count": 1, "last_incident": "JIRA-234"},
    "helpers": {"churn_score": 40, "bug_count": 1, "last_incident": "JIRA-234"},
}

# Mock author contribution history
MOCK_AUTHOR_HISTORY = {
    # Authors who are "experienced" with certain paths
    "experienced_authors": {
        "senior-dev": ["src/", "api/", "core/", "auth/", "payment/"],
        "backend-lead": ["api/", "database/", "models/"],
        "security-team": ["auth/", "security/", "crypto/"],
    },
    # Default: assume author is new to area (for demo purposes)
    "default_experience_score": 65,  # Medium-high risk for unknown authors
}


def find_matching_incidents(filenames: List[str]) -> List[Dict]:
    """
    Find mock incidents that match the given filenames.

    Args:
        filenames: List of file paths from the PR

    Returns:
        List of matching incident dictionaries
    """
    matched = []
    filenames_lower = [f.lower() for f in filenames]

    for incident in MOCK_INCIDENTS:
        for keyword in incident["keywords"]:
            if any(keyword in filename for filename in filenames_lower):
                if incident not in matched:
                    matched.append(incident)
                break

    return matched


def get_hotspot_score(filename: str) -> Optional[Dict]:
    """
    Check if a file is in a known hotspot area.

    Args:
        filename: File path to check

    Returns:
        Hotspot info dict or None
    """
    filename_lower = filename.lower()

    for hotspot_pattern, hotspot_info in MOCK_HOTSPOTS.items():
        if hotspot_pattern in filename_lower:
            return {
                "pattern": hotspot_pattern,
                **hotspot_info,
            }

    return None

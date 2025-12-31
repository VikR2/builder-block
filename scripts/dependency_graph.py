"""
Dependency Graph Analysis for Trading Strategy Skills

This module provides utilities for analyzing skill dependencies,
detecting circular dependencies, and ensuring proper execution order.

USAGE:
    from dependency_graph import (
        build_dependency_graph,
        detect_circular_dependencies,
        topological_sort,
        find_missing_dependencies,
        analyze_coverage
    )

    # Build graph from skills list
    skills = [{"slug": "cisd", "dependencies": '["sweep"]'}, ...]
    graph = build_dependency_graph(skills)

    # Check for cycles
    cycles = detect_circular_dependencies(graph)

    # Get execution order
    order = topological_sort(graph)

    # Find missing deps
    missing = find_missing_dependencies(skills, all_skills)

    # Analyze coverage
    coverage = analyze_coverage(skills)
"""

import json
from collections import defaultdict, deque
from typing import Any


# Category mappings for coverage analysis
COVERAGE_CATEGORIES = {
    "bias": ["Market Analysis"],
    "entry": ["Entry Patterns"],
    "exit": ["Risk Management", "Trade Management"],
    "risk": ["Risk Management"],
    "time": ["Trade Management"],
}

# Required categories for a complete strategy
REQUIRED_CATEGORIES = ["entry", "risk"]
RECOMMENDED_CATEGORIES = ["bias", "exit", "time"]


def build_dependency_graph(skills: list[dict]) -> dict[str, list[str]]:
    """
    Build an adjacency list representing skill dependencies.

    Args:
        skills: List of skill dicts with 'slug' and 'dependencies' fields.
                dependencies can be a JSON string or list.

    Returns:
        Dict mapping each skill slug to list of its dependencies.

    Example:
        >>> skills = [
        ...     {"slug": "cisd", "dependencies": '["sweep"]'},
        ...     {"slug": "sweep", "dependencies": "[]"}
        ... ]
        >>> build_dependency_graph(skills)
        {'cisd': ['sweep'], 'sweep': []}
    """
    graph = {}

    for skill in skills:
        slug = skill.get("slug", "")
        if not slug:
            continue

        deps = skill.get("dependencies", [])

        # Parse JSON string if needed
        if isinstance(deps, str):
            try:
                deps = json.loads(deps) if deps else []
            except json.JSONDecodeError:
                deps = []

        # Ensure deps is a list
        if deps is None:
            deps = []

        graph[slug] = list(deps)

    return graph


def detect_circular_dependencies(graph: dict[str, list[str]]) -> list[list[str]]:
    """
    Find all circular dependencies in the graph using DFS.

    Args:
        graph: Adjacency list mapping skill slugs to dependencies.

    Returns:
        List of cycles, where each cycle is a list of skill slugs.

    Example:
        >>> graph = {"a": ["b"], "b": ["c"], "c": ["a"]}
        >>> detect_circular_dependencies(graph)
        [['a', 'b', 'c', 'a']]
    """
    cycles = []
    visited = set()
    rec_stack = set()
    path = []

    def dfs(node: str) -> bool:
        visited.add(node)
        rec_stack.add(node)
        path.append(node)

        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                if dfs(neighbor):
                    return True
            elif neighbor in rec_stack:
                # Found cycle - extract it from path
                cycle_start = path.index(neighbor)
                cycle = path[cycle_start:] + [neighbor]
                cycles.append(cycle)
                return True

        path.pop()
        rec_stack.remove(node)
        return False

    for node in graph:
        if node not in visited:
            dfs(node)

    return cycles


def topological_sort(graph: dict[str, list[str]]) -> list[str]:
    """
    Return skills in execution order using Kahn's algorithm.
    Dependencies come before dependents.

    Args:
        graph: Adjacency list mapping skill slugs to dependencies.

    Returns:
        List of skill slugs in topological order (deps first).
        Returns empty list if cycle detected.

    Example:
        >>> graph = {"cisd": ["sweep"], "sweep": [], "breakeven": []}
        >>> topological_sort(graph)
        ['sweep', 'breakeven', 'cisd']
    """
    # Build reverse graph (dependents) and in-degree count
    in_degree = defaultdict(int)
    reverse_graph = defaultdict(list)

    # Initialize all nodes
    for node in graph:
        if node not in in_degree:
            in_degree[node] = 0

    # Count incoming edges (dependencies)
    for node, deps in graph.items():
        for dep in deps:
            reverse_graph[dep].append(node)
            in_degree[node] += 1
            # Ensure dep is in in_degree even if not in graph
            if dep not in in_degree:
                in_degree[dep] = 0

    # Start with nodes that have no dependencies
    queue = deque([node for node, degree in in_degree.items() if degree == 0])
    result = []

    while queue:
        node = queue.popleft()
        result.append(node)

        # Reduce in-degree for dependents
        for dependent in reverse_graph[node]:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    # If result doesn't contain all nodes, there's a cycle
    if len(result) != len(in_degree):
        return []

    return result


def find_missing_dependencies(
    selected_skills: list[dict], all_skills: list[dict]
) -> list[str]:
    """
    Find dependencies that are referenced but not in selected skills.

    Args:
        selected_skills: Skills that have been selected for the strategy.
        all_skills: Complete list of all available skills in database.

    Returns:
        List of missing dependency slugs.

    Example:
        >>> selected = [{"slug": "cisd", "dependencies": '["sweep"]'}]
        >>> all_skills = [{"slug": "sweep"}, {"slug": "cisd"}]
        >>> find_missing_dependencies(selected, all_skills)
        ['sweep']  # sweep is needed but not selected
    """
    selected_slugs = {s.get("slug") for s in selected_skills if s.get("slug")}
    all_slugs = {s.get("slug") for s in all_skills if s.get("slug")}
    missing = []

    for skill in selected_skills:
        deps = skill.get("dependencies", [])

        if isinstance(deps, str):
            try:
                deps = json.loads(deps) if deps else []
            except json.JSONDecodeError:
                deps = []

        if deps is None:
            deps = []

        for dep in deps:
            if dep not in selected_slugs:
                if dep in all_slugs:
                    # Dependency exists but not selected
                    if dep not in missing:
                        missing.append(dep)
                else:
                    # Dependency doesn't exist in database at all
                    if dep not in missing:
                        missing.append(dep)

    return missing


def analyze_coverage(skills: list[dict]) -> dict[str, Any]:
    """
    Analyze skill coverage across required strategy categories.

    Args:
        skills: List of skill dicts with 'category' field.

    Returns:
        Dict with coverage analysis:
        - categories: Dict mapping category to bool (covered or not)
        - covered: List of covered categories
        - missing: List of missing categories
        - score: Coverage percentage
        - is_complete: True if all required categories covered

    Example:
        >>> skills = [
        ...     {"category": "Entry Patterns"},
        ...     {"category": "Risk Management"}
        ... ]
        >>> analyze_coverage(skills)
        {
            'categories': {'bias': False, 'entry': True, 'exit': True, 'risk': True, 'time': False},
            'covered': ['entry', 'exit', 'risk'],
            'missing': ['bias', 'time'],
            'score': 60,
            'is_complete': True  # entry + risk are required
        }
    """
    # Get all categories from skills
    skill_categories = {s.get("category", "") for s in skills}

    # Check coverage for each category
    coverage = {}
    covered = []
    missing = []

    for cat_name, cat_values in COVERAGE_CATEGORIES.items():
        is_covered = any(sc in cat_values for sc in skill_categories)
        coverage[cat_name] = is_covered

        if is_covered:
            covered.append(cat_name)
        else:
            missing.append(cat_name)

    # Calculate score
    total = len(COVERAGE_CATEGORIES)
    score = int((len(covered) / total) * 100) if total > 0 else 0

    # Check if complete (all required categories covered)
    is_complete = all(coverage.get(req, False) for req in REQUIRED_CATEGORIES)

    return {
        "categories": coverage,
        "covered": covered,
        "missing": missing,
        "score": score,
        "is_complete": is_complete,
        "required": REQUIRED_CATEGORIES,
        "recommended": RECOMMENDED_CATEGORIES,
    }


def get_skills_by_category(skills: list[dict]) -> dict[str, list[dict]]:
    """
    Group skills by their category.

    Args:
        skills: List of skill dicts.

    Returns:
        Dict mapping category names to lists of skills.
    """
    by_category = defaultdict(list)

    for skill in skills:
        category = skill.get("category", "Uncategorized")
        by_category[category].append(skill)

    return dict(by_category)


def generate_execution_report(skills: list[dict]) -> dict[str, Any]:
    """
    Generate a complete analysis report for a set of skills.

    Args:
        skills: List of skill dicts.

    Returns:
        Complete analysis including graph, cycles, order, coverage.
    """
    graph = build_dependency_graph(skills)
    cycles = detect_circular_dependencies(graph)
    order = topological_sort(graph)
    coverage = analyze_coverage(skills)
    by_category = get_skills_by_category(skills)

    return {
        "dependency_graph": graph,
        "circular_dependencies": cycles,
        "execution_order": order,
        "coverage": coverage,
        "skills_by_category": by_category,
        "has_cycles": len(cycles) > 0,
        "is_valid": len(cycles) == 0 and coverage["is_complete"],
    }


# CLI interface for testing
if __name__ == "__main__":
    import argparse
    import sqlite3
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Analyze skill dependencies")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path(__file__).parent.parent / "data" / "builder.db",
        help="Path to builder.db",
    )
    parser.add_argument(
        "--skills",
        nargs="+",
        help="Skill slugs to analyze (default: all)",
    )
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="text",
        help="Output format",
    )

    args = parser.parse_args()

    # Load skills from database
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    if args.skills:
        placeholders = ",".join("?" * len(args.skills))
        query = f"SELECT * FROM skills WHERE slug IN ({placeholders})"
        rows = conn.execute(query, args.skills).fetchall()
    else:
        rows = conn.execute("SELECT * FROM skills").fetchall()

    skills = [dict(row) for row in rows]
    conn.close()

    # Generate report
    report = generate_execution_report(skills)

    if args.format == "json":
        print(json.dumps(report, indent=2))
    else:
        print(f"=== Dependency Analysis ({len(skills)} skills) ===\n")

        print("Execution Order:")
        for i, slug in enumerate(report["execution_order"], 1):
            print(f"  {i}. {slug}")

        if report["circular_dependencies"]:
            print("\nCircular Dependencies (ERROR):")
            for cycle in report["circular_dependencies"]:
                print(f"  - {' -> '.join(cycle)}")

        print(f"\nCoverage: {report['coverage']['score']}%")
        print(f"  Covered: {', '.join(report['coverage']['covered'])}")
        print(f"  Missing: {', '.join(report['coverage']['missing'])}")

        print(f"\nValid: {report['is_valid']}")

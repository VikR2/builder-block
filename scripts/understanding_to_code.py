#!/usr/bin/env python3
"""
Understanding to Code Generator

Converts accumulated understanding from reflective analysis into executable
NinjaTrader C# strategy code.

This bridges the gap between:
- Reflective analysis (conceptual understanding)
- Skills database (implementation code snippets)
- Generated strategy (executable C# code)

USAGE:
    from understanding_to_code import generate_strategy_from_understanding

    code = generate_strategy_from_understanding(
        understanding=analyzer.get_accumulated_understanding(),
        db_path=Path("data/builder.db"),
        strategy_name="MyStrategy",
    )
"""

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from datetime import datetime


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class SkillImplementation:
    """A skill with its implementation code."""
    id: int
    name: str
    category: str
    code_snippet: str
    variables_required: list[str]
    dependencies: list[str]


@dataclass
class StrategyComponents:
    """Components needed to generate a strategy."""
    state_machine: list[str]
    entry_skills: list[SkillImplementation]
    exit_skills: list[SkillImplementation]
    management_skills: list[SkillImplementation]
    context_skills: list[SkillImplementation]
    parameters: dict
    variables: set[str]


# =============================================================================
# Skills Database Interface
# =============================================================================

class SkillsRepository:
    """Repository for fetching skills with their implementations."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._conn = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def get_skill_by_id(self, skill_id: int) -> Optional[SkillImplementation]:
        """Fetch a skill by ID with its implementation."""
        conn = self._get_conn()
        row = conn.execute("""
            SELECT id, name, category, code_snippet, variables_required, dependencies
            FROM skills
            WHERE id = ?
        """, (skill_id,)).fetchone()

        if not row:
            return None

        return SkillImplementation(
            id=row["id"],
            name=row["name"],
            category=row["category"],
            code_snippet=row["code_snippet"] or "",
            variables_required=json.loads(row["variables_required"] or "[]"),
            dependencies=json.loads(row["dependencies"] or "[]"),
        )

    def get_skills_by_category(self, category: str) -> list[SkillImplementation]:
        """Fetch all skills in a category."""
        conn = self._get_conn()
        rows = conn.execute("""
            SELECT id, name, category, code_snippet, variables_required, dependencies
            FROM skills
            WHERE category = ?
        """, (category,)).fetchall()

        return [
            SkillImplementation(
                id=row["id"],
                name=row["name"],
                category=row["category"],
                code_snippet=row["code_snippet"] or "",
                variables_required=json.loads(row["variables_required"] or "[]"),
                dependencies=json.loads(row["dependencies"] or "[]"),
            )
            for row in rows
        ]

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None


# =============================================================================
# State Machine Mapping
# =============================================================================

# Map context roles to state machine states
ROLE_TO_STATE = {
    "context_setup": "SCANNING_FOR_CONTEXT",
    "entry_trigger": "WAITING_FOR_ENTRY",
    "risk_management": "MANAGING_RISK",
    "exit_rule": "MANAGING_EXIT",
}

# Map categories to code sections
CATEGORY_TO_SECTION = {
    "Entry Patterns": "entry",
    "Market Structure": "context",
    "Market Analysis": "context",
    "Risk Management": "management",
    "Trade Management": "management",
    "Exit Patterns": "exit",
}


def build_state_machine(strategy_flow: list[str]) -> list[str]:
    """
    Convert strategy flow into state machine states.

    Example:
        ["context_setup", "entry_trigger", "risk_management"]
        ->
        ["SCANNING_FOR_CONTEXT", "WAITING_FOR_ENTRY", "MANAGING_TRADE"]
    """
    states = ["WAITING_FOR_SESSION"]

    for role in strategy_flow:
        state = ROLE_TO_STATE.get(role, "PROCESSING")
        if state not in states:
            states.append(state)

    states.append("MANAGING_TRADE")
    states.append("TRADE_COMPLETE")

    return states


# =============================================================================
# Code Generation
# =============================================================================

def generate_state_enum(states: list[str]) -> str:
    """Generate the StrategyState enum."""
    state_values = ",\n    ".join(states)
    return f"""public enum StrategyState
{{
    {state_values}
}}"""


def generate_variables(components: StrategyComponents) -> str:
    """Generate variable declarations from skill requirements."""
    # Collect all required variables
    all_vars = set()
    for skill in components.entry_skills + components.exit_skills + components.management_skills:
        all_vars.update(skill.variables_required)

    # Add common variables
    common_vars = [
        "private StrategyState currentState;",
        "private int tradeDirection;  // 1 = long, -1 = short",
        "private double entryPrice;",
        "private double stopLoss;",
        "private double takeProfit;",
        "private bool tradeTaken;",
    ]

    # Add extracted parameters as variables
    param_vars = []
    for param_name, param_value in components.parameters.items():
        if isinstance(param_value, (int, float)):
            param_vars.append(f"private double {param_name} = {param_value};")
        elif isinstance(param_value, str):
            param_vars.append(f"private string {param_name} = \"{param_value}\";")

    return "\n".join(common_vars + param_vars)


def generate_state_handler(state: str, skills: list[SkillImplementation]) -> str:
    """Generate code for a single state handler."""
    if not skills:
        return f"""case StrategyState.{state}:
    // No skills matched for this state
    break;"""

    skill_code = []
    for skill in skills:
        if skill.code_snippet:
            # Indent the code snippet
            indented = "\n    ".join(skill.code_snippet.split("\n"))
            skill_code.append(f"// {skill.name}\n    {indented}")

    combined = "\n\n    ".join(skill_code) if skill_code else "// TODO: Implement"

    return f"""case StrategyState.{state}:
    {combined}
    break;"""


def generate_on_bar_update(components: StrategyComponents) -> str:
    """Generate the OnBarUpdate method with state machine."""
    state_handlers = []

    # Generate handler for each state
    for state in components.state_machine:
        if state == "WAITING_FOR_SESSION":
            handler = """case StrategyState.WAITING_FOR_SESSION:
    if (IsInTradingSession())
    {
        currentState = StrategyState.SCANNING_FOR_CONTEXT;
    }
    break;"""
        elif state == "SCANNING_FOR_CONTEXT":
            handler = generate_state_handler(state, components.context_skills)
        elif state == "WAITING_FOR_ENTRY":
            handler = generate_state_handler(state, components.entry_skills)
        elif state == "MANAGING_TRADE":
            handler = generate_state_handler(state, components.management_skills)
        elif state == "TRADE_COMPLETE":
            handler = """case StrategyState.TRADE_COMPLETE:
    if (Position.MarketPosition == MarketPosition.Flat)
    {
        currentState = StrategyState.WAITING_FOR_SESSION;
        tradeTaken = false;
    }
    break;"""
        else:
            handler = generate_state_handler(state, [])

        state_handlers.append(handler)

    handlers_code = "\n\n            ".join(state_handlers)

    return f"""protected override void OnBarUpdate()
{{
    if (CurrentBar < 20) return;

    switch (currentState)
    {{
            {handlers_code}
    }}
}}"""


def generate_helper_methods() -> str:
    """Generate common helper methods."""
    return """private bool IsInTradingSession()
{
    int hour = Time[0].Hour;
    return hour >= TradeStartHour && hour < TradeEndHour;
}

private void TriggerEntry(int direction)
{
    tradeDirection = direction;

    if (direction == 1)
    {
        EnterLong("Long Entry");
    }
    else
    {
        EnterShort("Short Entry");
    }

    currentState = StrategyState.MANAGING_TRADE;
    tradeTaken = true;
}

private void ResetDailyState()
{
    currentState = StrategyState.WAITING_FOR_SESSION;
    tradeTaken = false;
    tradeDirection = 0;
    entryPrice = 0;
    stopLoss = 0;
    takeProfit = 0;
}"""


def generate_strategy_code(
    strategy_name: str,
    components: StrategyComponents,
    source_info: Optional[dict] = None,
) -> str:
    """Generate complete NinjaTrader strategy code."""

    # Generate code sections
    state_enum = generate_state_enum(components.state_machine)
    variables = generate_variables(components)
    on_bar_update = generate_on_bar_update(components)
    helpers = generate_helper_methods()

    # Build header comment
    source_comment = ""
    if source_info:
        source_comment = f"""
// Source: {source_info.get('url', 'Unknown')}
// Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}
// Skills Used: {', '.join(str(s.id) for s in components.entry_skills + components.context_skills)}
"""

    return f"""#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion
{source_comment}
namespace NinjaTrader.NinjaScript.Strategies
{{
    public class {strategy_name} : Strategy
    {{
        #region State Enum
        {state_enum}
        #endregion

        #region Variables
        {variables}
        #endregion

        #region Parameters
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Trade Start Hour", Order = 1, GroupName = "Time Settings")]
        public int TradeStartHour {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Trade End Hour", Order = 2, GroupName = "Time Settings")]
        public int TradeEndHour {{ get; set; }}

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "Target R Multiple", Order = 3, GroupName = "Risk Settings")]
        public double TargetRMultiple {{ get; set; }}
        #endregion

        protected override void OnStateChange()
        {{
            if (State == State.SetDefaults)
            {{
                Description = "Strategy generated from video analysis";
                Name = "{strategy_name}";
                Calculate = Calculate.OnBarClose;
                EntriesPerDirection = 1;
                EntryHandling = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy = true;
                ExitOnSessionCloseSeconds = 30;
                IsFillLimitOnTouch = false;
                MaximumBarsLookBack = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution = OrderFillResolution.Standard;
                Slippage = 0;
                StartBehavior = StartBehavior.WaitUntilFlat;
                TimeInForce = TimeInForce.Gtc;
                TraceOrders = false;
                RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade = 20;

                // Default parameter values
                TradeStartHour = 9;
                TradeEndHour = 16;
                TargetRMultiple = 2.0;
            }}
            else if (State == State.Configure)
            {{
                // Add additional data series if needed
            }}
            else if (State == State.DataLoaded)
            {{
                ResetDailyState();
            }}
        }}

        {on_bar_update}

        #region Helper Methods
        {helpers}
        #endregion
    }}
}}
"""


# =============================================================================
# Main Entry Point
# =============================================================================

def generate_strategy_from_understanding(
    understanding: dict,
    db_path: Path,
    strategy_name: str,
    source_info: Optional[dict] = None,
) -> str:
    """
    Generate NinjaTrader strategy code from accumulated understanding.

    Args:
        understanding: AccumulatedUnderstanding as dict (from reflective analyzer)
        db_path: Path to skills database
        strategy_name: Name for the generated strategy class
        source_info: Optional source metadata (url, title, etc.)

    Returns:
        Complete NinjaTrader C# strategy code
    """
    repo = SkillsRepository(db_path)

    try:
        # Build state machine from strategy flow
        strategy_flow = understanding.get("strategy_flow", [])
        state_machine = build_state_machine(strategy_flow)

        # Fetch skills by ID
        matched_skill_ids = understanding.get("matched_skills", [])
        skills = [repo.get_skill_by_id(sid) for sid in matched_skill_ids]
        skills = [s for s in skills if s is not None]

        # Categorize skills
        entry_skills = [s for s in skills if "Entry" in s.category or "Pattern" in s.category]
        exit_skills = [s for s in skills if "Exit" in s.category]
        management_skills = [s for s in skills if "Management" in s.category]
        context_skills = [s for s in skills if "Structure" in s.category or "Analysis" in s.category]

        # If no exit skills, use default
        if not exit_skills:
            # Create a placeholder exit skill
            exit_skills = []

        # If no management skills, use default
        if not management_skills:
            management_skills = []

        # Build components
        components = StrategyComponents(
            state_machine=state_machine,
            entry_skills=entry_skills,
            exit_skills=exit_skills,
            management_skills=management_skills,
            context_skills=context_skills,
            parameters=understanding.get("parameters", {}),
            variables=set(),
        )

        # Generate code
        code = generate_strategy_code(strategy_name, components, source_info)

        return code

    finally:
        repo.close()


# =============================================================================
# CLI for Testing
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate strategy from understanding")
    parser.add_argument("understanding_file", type=Path, help="JSON file with accumulated understanding")
    parser.add_argument("--db", type=Path, default=Path("data/builder.db"), help="Skills database path")
    parser.add_argument("--name", default="GeneratedStrategy", help="Strategy class name")
    parser.add_argument("--output", "-o", type=Path, help="Output .cs file")
    args = parser.parse_args()

    if not args.understanding_file.exists():
        print(f"Error: {args.understanding_file} does not exist")
        exit(1)

    if not args.db.exists():
        print(f"Error: Database {args.db} does not exist")
        exit(1)

    # Load understanding
    data = json.loads(args.understanding_file.read_text())
    understanding = data.get("accumulated_understanding", data)

    print(f"Generating strategy: {args.name}")
    print(f"Strategy flow: {understanding.get('strategy_flow', [])}")
    print(f"Matched skills: {understanding.get('matched_skills', [])}")

    # Generate code
    code = generate_strategy_from_understanding(
        understanding=understanding,
        db_path=args.db,
        strategy_name=args.name,
    )

    if args.output:
        args.output.write_text(code)
        print(f"\nSaved to {args.output}")
    else:
        print("\n" + "=" * 60)
        print(code)

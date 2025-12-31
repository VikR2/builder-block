"""
Strategy Composition Engine

Composes fully functional NinjaTrader strategies from skill code snippets.
This module builds production-ready strategies by:
1. Dynamically extracting variables and code from ALL selected skills
2. Organizing code by category (bias, entry, risk, management)
3. Generating proper variable declarations and reset methods
"""

import sqlite3
import json
from pathlib import Path
from datetime import datetime
import re


# Category to phase mapping - determines where code snippets go
CATEGORY_PHASES = {
    "Market Analysis": "bias",
    "Market Structure": "setup",
    "Entry Patterns": "entry",
    "Risk Management": "risk",
    "Trade Management": "management",
}

# Default variable types based on common naming patterns
VARIABLE_TYPE_PATTERNS = [
    (r"^is[A-Z]|^has[A-Z]|^can[A-Z]|Set$|Detected$|Triggered$|Valid$|Bullish$|Bearish$", "bool"),
    (r"Bar$|Count$|Direction$|Stage$|Index$", "int"),
    (r"High$|Low$|Price$|Level$|Open$|Close$|Size$|Pct$|Ratio$", "double"),
    (r"Date$|Time$", "DateTime"),
    (r"Name$|Id$|Type$", "string"),
]


def infer_variable_type(var_name: str) -> str:
    """Infer C# type from variable name patterns."""
    for pattern, var_type in VARIABLE_TYPE_PATTERNS:
        if re.search(pattern, var_name):
            return var_type
    return "double"  # Default to double for trading values


def sanitize_name(name: str) -> str:
    """Sanitize name for use as C# identifier."""
    safe = re.sub(r'[^a-zA-Z0-9]', '', name.title().replace(' ', ''))
    if safe and safe[0].isdigit():
        safe = 'Strategy' + safe
    return safe or 'GeneratedStrategy'


def parse_json_field(field_value: str) -> list:
    """Safely parse a JSON field that might be a string or None."""
    if not field_value:
        return []
    try:
        return json.loads(field_value)
    except (json.JSONDecodeError, TypeError):
        return []


def get_skills_from_db(slugs: list, db_path: Path = None) -> list:
    """Fetch full skill data from database by slugs."""
    if db_path is None:
        db_path = Path(__file__).parent.parent / "data" / "builder.db"

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    placeholders = ','.join(['?'] * len(slugs))
    cursor.execute(f"""
        SELECT id, name, slug, category, description,
               code_snippet, variables_required, dependencies
        FROM skills WHERE slug IN ({placeholders})
    """, slugs)

    skills = []
    for row in cursor.fetchall():
        skills.append({
            'id': row['id'],
            'name': row['name'],
            'slug': row['slug'],
            'category': row['category'],
            'description': row['description'],
            'code_snippet': row['code_snippet'] or '',
            'variables_required': parse_json_field(row['variables_required']),
            'dependencies': parse_json_field(row['dependencies']),
        })

    conn.close()
    return skills


def is_valid_csharp_identifier(name: str) -> bool:
    """Check if a string is a valid C# identifier."""
    if not name or ' ' in name:
        return False
    # Must start with letter or underscore
    if not (name[0].isalpha() or name[0] == '_'):
        return False
    # Must be alphanumeric or underscore
    return all(c.isalnum() or c == '_' for c in name)


# Variables that are already declared in the template (skip these)
TEMPLATE_VARIABLES = {
    'tradeDirection', 'entryPrice', 'stopLoss', 'takeProfit', 'tradeTaken',
    'activeOrderName', 'breakevenSet', 'currentDate', 'pmBias',
    # Properties (not fields)
    'PremarketStartHour', 'PremarketEndHour', 'RangeStartHour', 'RangeStartMinute',
    'RangeEndHour', 'RangeEndMinute', 'ExecutionEndHour', 'ExecutionEndMinute',
    'SessionEndHour', 'MaxStopTicks', 'TakeProfitTicks', 'BreakevenTicks',
    'MinRangeTicks', 'StopBufferTicks', 'BullishThreshold', 'BearishThreshold',
    'EnableDebug',
}


def extract_all_variables(skills: list) -> dict:
    """Extract all unique variables from skills, organized by skill."""
    all_vars = {}
    seen = set()

    for skill in skills:
        vars_required = skill.get('variables_required', [])
        for var in vars_required:
            # Skip invalid identifiers, duplicates, and template variables
            if not is_valid_csharp_identifier(var):
                continue
            if var in seen or var in TEMPLATE_VARIABLES:
                continue
            seen.add(var)
            var_type = infer_variable_type(var)
            all_vars[var] = {
                'type': var_type,
                'from_skill': skill['slug'],
                'category': skill['category']
            }

    return all_vars


def generate_variable_declarations(variables: dict) -> str:
    """Generate C# variable declarations organized by category."""
    by_category = {}
    for var_name, var_info in variables.items():
        category = var_info['category']
        if category not in by_category:
            by_category[category] = []
        by_category[category].append((var_name, var_info['type']))

    lines = []
    for category, vars in sorted(by_category.items()):
        lines.append(f"\n        // {category} Variables")
        for var_name, var_type in sorted(vars):
            default = "false" if var_type == "bool" else "0" if var_type in ("int", "double") else "null"
            if var_type == "DateTime":
                default = "DateTime.MinValue"
            elif var_type == "string":
                default = '""'
            lines.append(f"        private {var_type} {var_name};")

    return "\n".join(lines)


def generate_reset_code(variables: dict) -> str:
    """Generate reset code for all variables."""
    lines = []
    by_category = {}

    for var_name, var_info in variables.items():
        category = var_info['category']
        if category not in by_category:
            by_category[category] = []
        by_category[category].append((var_name, var_info['type']))

    for category, vars in sorted(by_category.items()):
        lines.append(f"            // {category} reset")
        for var_name, var_type in sorted(vars):
            if var_type == "bool":
                lines.append(f"            {var_name} = false;")
            elif var_type == "int":
                lines.append(f"            {var_name} = 0;")
            elif var_type == "double":
                lines.append(f"            {var_name} = 0.0;")
            elif var_type == "DateTime":
                lines.append(f"            {var_name} = DateTime.MinValue;")
            elif var_type == "string":
                lines.append(f'            {var_name} = "";')

    return "\n".join(lines)


def organize_skills_by_phase(skills: list) -> dict:
    """Organize skills into execution phases based on category."""
    phases = {
        "bias": [],      # Market Analysis - runs in pre-market
        "setup": [],     # Market Structure - runs during range building
        "entry": [],     # Entry Patterns - runs during execution
        "risk": [],      # Risk Management - runs with position
        "management": [] # Trade Management - runs throughout
    }

    for skill in skills:
        category = skill['category']
        phase = CATEGORY_PHASES.get(category, "entry")
        if skill['code_snippet']:
            phases[phase].append(skill)

    return phases


def generate_phase_code(phase_skills: list, phase_name: str) -> str:
    """Generate code section for a specific phase."""
    if not phase_skills:
        return ""

    lines = []
    for skill in phase_skills:
        lines.append(f"""
            //------------------------------------------------------------------
            // {skill['name']}
            // {skill['description'][:80]}...
            //------------------------------------------------------------------
            {skill['code_snippet']}
""")

    return "\n".join(lines)


def compose_strategy_from_skills(
    name: str,
    description: str,
    matched_skills: list,
    concepts: dict,
    url: str,
    db_path: Path = None
) -> str:
    """
    Compose a complete NinjaTrader strategy from skill code snippets.

    IMPROVED: Now dynamically integrates ALL skills from the database,
    extracting variables and code from each skill's database fields.
    """
    safe_name = sanitize_name(name)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Get full skill data from DB using slugs
    slugs = [s.get('slug') for s in matched_skills if s.get('slug')]
    skills = get_skills_from_db(slugs, db_path)

    # Extract all variables from all skills (core vars are in template already)
    all_variables = extract_all_variables(skills)

    # Generate variable declarations
    variables_section = generate_variable_declarations(all_variables)

    # Generate reset code
    resets_section = generate_reset_code(all_variables)

    # Organize skills by phase
    phases = organize_skills_by_phase(skills)

    # Generate code for each phase
    bias_code = generate_phase_code(phases['bias'], 'bias')
    setup_code = generate_phase_code(phases['setup'], 'setup')
    entry_code = generate_phase_code(phases['entry'], 'entry')
    risk_code = generate_phase_code(phases['risk'], 'risk')
    management_code = generate_phase_code(phases['management'], 'management')

    # Build skill comments
    skill_comments = []
    for skill in skills:
        has_code = "+" if skill.get('code_snippet') else "o"
        skill_comments.append(f"//   [{has_code}] {skill['name']} ({skill['category']})")
    skill_section = "\n".join(skill_comments) if skill_comments else "//   (none matched)"

    # Build concept comments
    concept_comments = []
    for category, keywords in concepts.items():
        if isinstance(keywords, list):
            concept_comments.append(f"//   {category}: {', '.join(keywords)}")
        else:
            concept_comments.append(f"//   {category}: {keywords}")
    concept_section = "\n".join(concept_comments) if concept_comments else "//   (none detected)"

    # Check if we have breakeven skill
    has_breakeven = any(s['slug'] in ('automatic-breakeven-stop', 'breakeven') for s in skills)
    be_call = "ManageBreakeven();" if has_breakeven else ""

    breakeven_method = """
        private void ManageBreakeven()
        {
            if (Position.MarketPosition == MarketPosition.Flat) { breakevenSet = false; return; }
            if (breakevenSet) return;

            double profit = Position.MarketPosition == MarketPosition.Long
                ? Close[0] - Position.AveragePrice : Position.AveragePrice - Close[0];

            if (profit / TickSize >= BreakevenTicks)
            {
                breakevenSet = true;
                SetStopLoss(activeOrderName, CalculationMode.Price, Position.AveragePrice, false);
                if (EnableDebug) Print(">>> BE SET @ " + Position.AveragePrice.ToString("F2"));
            }
        }""" if has_breakeven else ""

    # Build the full strategy
    code = f'''//
// {safe_name}Strategy
//
// Generated from: {url}
// Generated at: {timestamp}
//
// Concepts detected:
{concept_section}
//
// Skills integrated ({len(skills)} total):
{skill_section}
//

#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.SuperDom;
using NinjaTrader.Gui.Tools;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.Core.FloatingPoint;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Strategies
{{
    public class {safe_name}Strategy : Strategy
    {{
        #region Enums
        public enum BiasType {{ Neutral, Bullish, Bearish }}
        #endregion

        #region Variables
        // Core Position Management
        private int tradeDirection;  // 1 = long, -1 = short
        private double entryPrice;
        private double stopLoss;
        private double takeProfit;
        private bool tradeTaken;
        private string activeOrderName;
        private bool breakevenSet;
        private DateTime currentDate;
        private BiasType pmBias;
{variables_section}
        #endregion

        protected override void OnStateChange()
        {{
            if (State == State.SetDefaults)
            {{
                Description = @"{description}";
                Name = "{safe_name}";
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
                TraceOrders = true;
                RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade = 20;
                IsInstantiatedOnEachOptimizationIteration = true;

                // Time Settings
                PremarketStartHour = 3;
                PremarketEndHour = 7;
                RangeStartHour = 7;
                RangeStartMinute = 0;
                RangeEndHour = 7;
                RangeEndMinute = 40;
                ExecutionEndHour = 9;
                ExecutionEndMinute = 30;
                SessionEndHour = 16;

                // Risk Settings
                MaxStopTicks = 200;
                TakeProfitTicks = 120;
                MinRangeTicks = 20;
                BreakevenTicks = 80;
                StopBufferTicks = 3;

                // Bias Settings
                BullishThreshold = 55.0;
                BearishThreshold = 45.0;

                EnableDebug = true;
            }}
            else if (State == State.DataLoaded)
            {{
                ClearOutputWindow();
                Print("=== {safe_name}Strategy LOADED ===");
            }}
        }}

        protected override void OnBarUpdate()
        {{
            if (CurrentBar < BarsRequiredToTrade) return;
            if (State == State.Realtime && IsFirstTickOfBar == false) return;

            DateTime barTime = Time[0];
            int hour = barTime.Hour;
            int minute = barTime.Minute;
            int currentMins = hour * 60 + minute;

            // Daily state reset
            if (barTime.Date != currentDate)
            {{
                ResetDailyState();
                currentDate = barTime.Date;
                if (EnableDebug) Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
            }}

            // Time windows
            int rangeStartMins = RangeStartHour * 60 + RangeStartMinute;
            int rangeEndMins = RangeEndHour * 60 + RangeEndMinute;
            int execEndMins = ExecutionEndHour * 60 + ExecutionEndMinute;

            bool inPremarket = hour >= PremarketStartHour && hour < PremarketEndHour;
            bool inRangeBuild = currentMins >= rangeStartMins && currentMins < rangeEndMins;
            bool inExecution = currentMins >= rangeEndMins && currentMins < execEndMins;
            bool inSession = hour >= RangeStartHour && hour < SessionEndHour;

            // Candle properties (commonly used)
            bool is_bullish = Close[0] > Open[0];
            bool is_bearish = Close[0] < Open[0];

            //==============================================================================
            // PHASE 1: PRE-MARKET BIAS CALCULATION
            //==============================================================================
            if (inPremarket)
            {{
{bias_code}
            }}

            //==============================================================================
            // PHASE 2: RANGE/STRUCTURE BUILDING
            //==============================================================================
            if (inRangeBuild)
            {{
{setup_code}
            }}

            //==============================================================================
            // PHASE 3: EXECUTION WINDOW - ENTRY DETECTION
            //==============================================================================
            if (!inExecution)
            {{
                {be_call}
                // Exit positions outside session
                if (!inSession && Position.MarketPosition != MarketPosition.Flat)
                {{
                    if (Position.MarketPosition == MarketPosition.Long) ExitLong();
                    else ExitShort();
                }}
                return;
            }}

            // Already traded today
            if (tradeTaken) {{ {be_call} return; }}

            // Already in position
            if (Position.MarketPosition != MarketPosition.Flat) {{ {be_call} return; }}

            // Bias-based direction filter
            bool allowLong = pmBias == BiasType.Bullish || pmBias == BiasType.Neutral;
            bool allowShort = pmBias == BiasType.Bearish || pmBias == BiasType.Neutral;

            //------------------------------------------------------------------
            // ENTRY PATTERN DETECTION
            //------------------------------------------------------------------
{entry_code}

            //------------------------------------------------------------------
            // ENTRY EXECUTION (if entry conditions met)
            //------------------------------------------------------------------
            if (tradeDirection != 0 && !tradeTaken)
            {{
                double stopDistance = tradeDirection == 1
                    ? Close[0] - stopLoss
                    : stopLoss - Close[0];
                double stopDistanceTicks = stopDistance / TickSize;

                if (EnableDebug)
                    Print(Time[0].ToString("HH:mm") + " | ENTRY SIGNAL | Dir:" + tradeDirection + " StopDist:" + stopDistanceTicks.ToString("F0"));

                if (stopDistanceTicks <= MaxStopTicks && stopDistanceTicks > 0)
                {{
                    // Add buffer to stop
                    if (tradeDirection == 1)
                        stopLoss -= StopBufferTicks * TickSize;
                    else
                        stopLoss += StopBufferTicks * TickSize;

                    entryPrice = Close[0];
                    takeProfit = tradeDirection == 1
                        ? Close[0] + (TakeProfitTicks * TickSize)
                        : Close[0] - (TakeProfitTicks * TickSize);
                    breakevenSet = false;
                    tradeTaken = true;

                    if (tradeDirection == 1)
                    {{
                        activeOrderName = "L";
                        EnterLong(activeOrderName);
                        Print(">>> LONG @ " + entryPrice.ToString("F2") + " SL:" + stopLoss.ToString("F2") + " TP:" + takeProfit.ToString("F2"));
                    }}
                    else
                    {{
                        activeOrderName = "S";
                        EnterShort(activeOrderName);
                        Print(">>> SHORT @ " + entryPrice.ToString("F2") + " SL:" + stopLoss.ToString("F2") + " TP:" + takeProfit.ToString("F2"));
                    }}
                }}
            }}
        }}
{breakeven_method}

        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {{
            if (marketPosition == MarketPosition.Long || marketPosition == MarketPosition.Short)
            {{
                SetStopLoss(execution.Order.Name, CalculationMode.Price, stopLoss, false);
                SetProfitTarget(execution.Order.Name, CalculationMode.Price, takeProfit);
            }}
        }}

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {{
            if (marketPosition == MarketPosition.Flat)
            {{
                breakevenSet = false;
                // Allow new trades after position closes
                // tradeTaken = false;  // Uncomment to allow multiple trades per day
            }}
        }}

        private void ResetDailyState()
        {{
            // Core reset
            tradeDirection = 0;
            entryPrice = 0;
            stopLoss = 0;
            takeProfit = 0;
            tradeTaken = false;
            activeOrderName = "";
            breakevenSet = false;
            pmBias = BiasType.Neutral;

{resets_section}
        }}

        #region Properties
        // Time Settings
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Premarket Start Hour", Order = 1, GroupName = "1. Time Settings")]
        public int PremarketStartHour {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Premarket End Hour", Order = 2, GroupName = "1. Time Settings")]
        public int PremarketEndHour {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Range Start Hour", Order = 3, GroupName = "1. Time Settings")]
        public int RangeStartHour {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name = "Range Start Minute", Order = 4, GroupName = "1. Time Settings")]
        public int RangeStartMinute {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Range End Hour", Order = 5, GroupName = "1. Time Settings")]
        public int RangeEndHour {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name = "Range End Minute", Order = 6, GroupName = "1. Time Settings")]
        public int RangeEndMinute {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Execution End Hour", Order = 7, GroupName = "1. Time Settings")]
        public int ExecutionEndHour {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name = "Execution End Minute", Order = 8, GroupName = "1. Time Settings")]
        public int ExecutionEndMinute {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Session End Hour", Order = 9, GroupName = "1. Time Settings")]
        public int SessionEndHour {{ get; set; }}

        // Risk Management
        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Max Stop (Ticks)", Order = 1, GroupName = "2. Risk Management")]
        public int MaxStopTicks {{ get; set; }}

        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Take Profit (Ticks)", Order = 2, GroupName = "2. Risk Management")]
        public int TakeProfitTicks {{ get; set; }}

        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Breakeven Threshold (Ticks)", Order = 3, GroupName = "2. Risk Management")]
        public int BreakevenTicks {{ get; set; }}

        [NinjaScriptProperty]
        [Range(1, 500)]
        [Display(Name = "Min Range Size (Ticks)", Order = 4, GroupName = "2. Risk Management")]
        public int MinRangeTicks {{ get; set; }}

        [NinjaScriptProperty]
        [Range(0, 20)]
        [Display(Name = "Stop Buffer (Ticks)", Order = 5, GroupName = "2. Risk Management")]
        public int StopBufferTicks {{ get; set; }}

        // Bias Settings
        [NinjaScriptProperty]
        [Range(50, 70)]
        [Display(Name = "Bullish Threshold %", Order = 1, GroupName = "3. Bias Settings")]
        public double BullishThreshold {{ get; set; }}

        [NinjaScriptProperty]
        [Range(30, 50)]
        [Display(Name = "Bearish Threshold %", Order = 2, GroupName = "3. Bias Settings")]
        public double BearishThreshold {{ get; set; }}

        // Debug
        [NinjaScriptProperty]
        [Display(Name = "Enable Debug", Order = 1, GroupName = "4. Debug")]
        public bool EnableDebug {{ get; set; }}
        #endregion
    }}
}}
'''
    return code


def print_composition_report(skills: list, variables: dict) -> None:
    """Print a report of what was composed."""
    print("\n" + "=" * 60)
    print("STRATEGY COMPOSITION REPORT")
    print("=" * 60)

    print(f"\nSkills integrated: {len(skills)}")
    for skill in skills:
        has_code = "✓" if skill.get('code_snippet') else "○"
        vars_count = len(skill.get('variables_required', []))
        print(f"  [{has_code}] {skill['name']} ({vars_count} vars)")

    print(f"\nTotal variables: {len(variables)}")
    by_category = {}
    for var_name, var_info in variables.items():
        cat = var_info['category']
        if cat not in by_category:
            by_category[cat] = 0
        by_category[cat] += 1

    for cat, count in sorted(by_category.items()):
        print(f"  {cat}: {count} vars")

    print("=" * 60)


# CLI interface for testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python strategy_composer.py <slug1> <slug2> ...")
        print("Example: python strategy_composer.py liquidity-sweep-detection cisd-pattern")
        sys.exit(1)

    slugs = sys.argv[1:]
    db_path = Path(__file__).parent.parent / "data" / "builder.db"

    skills = get_skills_from_db(slugs, db_path)
    if not skills:
        print(f"No skills found for slugs: {slugs}")
        sys.exit(1)

    matched_skills = [{'slug': s['slug'], 'name': s['name'], 'category': s['category']} for s in skills]

    code = compose_strategy_from_skills(
        name="Test Strategy",
        description="Test strategy from CLI",
        matched_skills=matched_skills,
        concepts={'test': ['test']},
        url="cli://test",
        db_path=db_path
    )

    output_path = Path("scripts-output/Strategies/TestStrategy.cs")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(code, encoding='utf-8')

    variables = extract_all_variables(skills)
    print_composition_report(skills, variables)
    print(f"\nStrategy saved to: {output_path}")

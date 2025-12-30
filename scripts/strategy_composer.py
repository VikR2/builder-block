"""
Strategy Composition Engine

Composes fully functional NinjaTrader strategies from skill code snippets.
This module builds production-ready strategies like 740.cs by:
1. Determining which components to include based on matched skills
2. Fetching code snippets from the database
3. Composing variables, logic, properties, and reset methods
"""

import sqlite3
from pathlib import Path
from datetime import datetime
import re


# Define which skills are required for different strategy components
STRATEGY_COMPONENTS = {
    "bias": {
        "skills": ["Pre-market Bias Calculation (VWAP-POC)"],
        "required_for": "market_analysis",
        "variables": """
        // Pre-market Bias State
        private double pmHigh;
        private double pmLow;
        private double pmVWAP_num;
        private double pmVWAP_den;
        private double pmPOC;
        private double pmPocPct;
        private BiasType pmBias;
        private bool pmDataCollected;
        private bool pmBiasCalculated;""",
        "reset": """
            // Pre-market reset
            pmHigh = 0;
            pmLow = 0;
            pmVWAP_num = 0;
            pmVWAP_den = 0;
            pmPOC = 0;
            pmPocPct = 50.0;
            pmBias = BiasType.Neutral;
            pmDataCollected = false;
            pmBiasCalculated = false;""",
        "properties": """
        // Bias Settings
        [NinjaScriptProperty]
        [Range(50, 70)]
        [Display(Name = "Bullish Threshold %", Order = 1, GroupName = "3. Bias Settings")]
        public double BullishThreshold { get; set; }

        [NinjaScriptProperty]
        [Range(30, 50)]
        [Display(Name = "Bearish Threshold %", Order = 2, GroupName = "3. Bias Settings")]
        public double BearishThreshold { get; set; }""",
        "defaults": """
                // Bias Settings
                BullishThreshold = 55.0;
                BearishThreshold = 45.0;"""
    },
    "range": {
        "skills": ["Range Building (Opening Range)"],
        "required_for": "market_structure",
        "variables": """
        // Range Building State
        private double rangeHigh;
        private double rangeLow;
        private double equilibrium;
        private bool rangeSet;""",
        "reset": """
            // Range reset
            rangeHigh = 0;
            rangeLow = 0;
            equilibrium = 0;
            rangeSet = false;""",
        "properties": """
        [NinjaScriptProperty]
        [Range(1, 500)]
        [Display(Name = "Min Range Size (Ticks)", Order = 4, GroupName = "2. Risk Management")]
        public int MinRangeTicks { get; set; }""",
        "defaults": """
                MinRangeTicks = 20;      // Minimum range size to trade"""
    },
    "sweep": {
        "skills": ["Liquidity Sweep Detection"],
        "required_for": "entry_patterns",
        "variables": """
        // Sweep State (Scenario A)
        private bool highSwept;
        private bool lowSwept;
        private double sweepPrice;
        private int sweepBar;
        private int sweepDirection;  // 1 = long setup, -1 = short setup
        private double refCandleOpen;
        private bool cisd_triggered;""",
        "reset": """
            // Scenario A reset
            highSwept = false;
            lowSwept = false;
            sweepPrice = 0;
            sweepBar = 0;
            sweepDirection = 0;
            refCandleOpen = 0;
            cisd_triggered = false;"""
    },
    "cisd": {
        "skills": ["CISD Pattern (Change in State of Delivery)"],
        "required_for": "entry_patterns",
        "depends_on": ["sweep"]
    },
    "breakout": {
        "skills": ["Breakout Pullback Pattern", "Range Breakout Detection"],
        "required_for": "entry_patterns",
        "variables": """
        // Breakout + Pullback State (Scenario B)
        private bool breakoutDetected;
        private bool pullbackDetected;
        private double breakoutRefCandleOpen;
        private int breakoutDirection;  // 1 = bullish breakout, -1 = bearish breakout""",
        "reset": """
            // Scenario B reset
            breakoutDetected = false;
            pullbackDetected = false;
            breakoutRefCandleOpen = 0;
            breakoutDirection = 0;"""
    },
    "fvg": {
        "skills": ["Fair Value Gap"],
        "required_for": "entry_patterns",
        "variables": """
        // Fair Value Gap State
        private double fvgHigh;
        private double fvgLow;
        private bool fvgDetected;
        private int fvgDirection;  // 1 = bullish FVG, -1 = bearish FVG""",
        "reset": """
            // FVG reset
            fvgHigh = 0;
            fvgLow = 0;
            fvgDetected = false;
            fvgDirection = 0;"""
    },
    "order_block": {
        "skills": ["Order Block"],
        "required_for": "entry_patterns",
        "variables": """
        // Order Block State
        private double obHigh;
        private double obLow;
        private bool obDetected;
        private int obDirection;  // 1 = bullish OB, -1 = bearish OB""",
        "reset": """
            // Order Block reset
            obHigh = 0;
            obLow = 0;
            obDetected = false;
            obDirection = 0;"""
    },
    "breakeven": {
        "skills": ["Automatic Breakeven Stop"],
        "required_for": "risk_management",
        "variables": """
        // Breakeven State
        private bool breakevenSet;""",
        "reset": """
            breakevenSet = false;""",
        "properties": """
        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Breakeven Threshold (Ticks)", Order = 3, GroupName = "2. Risk Management")]
        public int BreakevenTicks { get; set; }""",
        "defaults": """
                BreakevenTicks = 80;     // Move to BE after this profit"""
    },
    "position": {
        "skills": [],  # Always included
        "required_for": "core",
        "variables": """
        // Position Management
        private int tradeDirection;  // 1 = long, -1 = short
        private double entryPrice;
        private double stopLoss;
        private double takeProfit;
        private bool tradeTaken;
        private string activeOrderName;""",
        "reset": """
            // Position reset
            tradeDirection = 0;
            entryPrice = 0;
            stopLoss = 0;
            takeProfit = 0;
            tradeTaken = false;
            activeOrderName = "";"""
    },
    "time_windows": {
        "skills": ["Time-based Session Windows"],
        "required_for": "trade_management",
        "variables": """
        // Tracking
        private DateTime currentDate;""",
        "reset": "",
        "properties": """
        // Time Settings
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Premarket Start Hour", Order = 1, GroupName = "1. Time Settings")]
        public int PremarketStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Premarket End Hour", Order = 2, GroupName = "1. Time Settings")]
        public int PremarketEndHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Range Start Hour", Order = 3, GroupName = "1. Time Settings")]
        public int RangeStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name = "Range Start Minute", Order = 4, GroupName = "1. Time Settings")]
        public int RangeStartMinute { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Range End Hour", Order = 5, GroupName = "1. Time Settings")]
        public int RangeEndHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name = "Range End Minute", Order = 6, GroupName = "1. Time Settings")]
        public int RangeEndMinute { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Execution End Hour", Order = 7, GroupName = "1. Time Settings")]
        public int ExecutionEndHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name = "Execution End Minute", Order = 8, GroupName = "1. Time Settings")]
        public int ExecutionEndMinute { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Session End Hour", Order = 9, GroupName = "1. Time Settings")]
        public int SessionEndHour { get; set; }""",
        "defaults": """
                // Time Settings (chart timezone - adjust if needed)
                PremarketStartHour = 3;
                PremarketEndHour = 7;
                RangeStartHour = 7;
                RangeStartMinute = 0;
                RangeEndHour = 7;
                RangeEndMinute = 40;
                ExecutionEndHour = 9;
                ExecutionEndMinute = 30;
                SessionEndHour = 16;"""
    }
}


def sanitize_name(name: str) -> str:
    """Sanitize name for use as C# identifier."""
    safe = re.sub(r'[^a-zA-Z0-9]', '', name.title().replace(' ', ''))
    if safe and safe[0].isdigit():
        safe = 'Strategy' + safe
    return safe or 'GeneratedStrategy'


def get_skills_with_code(skill_ids: list = None, db_path: Path = None) -> dict:
    """Fetch skills from database with their code snippets."""
    if db_path is None:
        db_path = Path(__file__).parent.parent / "data" / "builder.db"

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    if skill_ids:
        placeholders = ','.join('?' * len(skill_ids))
        cursor.execute(f"""
            SELECT id, name, category, description, code_snippet
            FROM skills WHERE id IN ({placeholders})
        """, skill_ids)
    else:
        cursor.execute("""
            SELECT id, name, category, description, code_snippet
            FROM skills WHERE code_snippet IS NOT NULL
        """)

    skills = {}
    for row in cursor.fetchall():
        skills[row['name']] = {
            'id': row['id'],
            'name': row['name'],
            'category': row['category'],
            'description': row['description'],
            'code_snippet': row['code_snippet']
        }

    conn.close()
    return skills


def analyze_strategy_gaps(matched_skills: list, concepts: dict) -> dict:
    """Analyze which components are present and missing for a complete strategy."""
    skill_names = {s.get('name', '') for s in matched_skills}

    present = []
    missing = []
    recommended = []

    for component_name, component in STRATEGY_COMPONENTS.items():
        component_skills = component.get('skills', [])
        if not component_skills:
            present.append(component_name)
            continue

        has_component = any(skill in skill_names for skill in component_skills)

        if has_component:
            present.append(component_name)
        else:
            required_for = component.get('required_for', '')
            if required_for in concepts and concepts[required_for]:
                missing.append({
                    'component': component_name,
                    'skills': component_skills,
                    'reason': f"Detected '{required_for}' concepts but missing implementation"
                })
            else:
                recommended.append({
                    'component': component_name,
                    'skills': component_skills,
                    'reason': f"Would enhance strategy with {component_name} functionality"
                })

    min_requirements = {
        'entry': any(c in present for c in ['sweep', 'cisd', 'breakout', 'fvg', 'order_block']),
        'risk': True,
        'structure': 'range' in present or 'time_windows' in present
    }

    return {
        'present': present,
        'missing': missing,
        'recommended': recommended,
        'min_requirements': min_requirements,
        'is_complete': min_requirements['entry'] and min_requirements['structure']
    }


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

    This function builds a production-ready strategy by:
    1. Determining which components to include based on matched skills
    2. Fetching code snippets from the database
    3. Composing variables, logic, properties, and reset methods
    """
    safe_name = sanitize_name(name)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    skill_ids = [s.get('id') for s in matched_skills if s.get('id')]
    skills_with_code = get_skills_with_code(skill_ids, db_path)
    skill_names = set(skills_with_code.keys())

    # Determine components to include
    components_to_include = ['position', 'time_windows']

    for component_name, component in STRATEGY_COMPONENTS.items():
        if component_name in components_to_include:
            continue
        component_skills = component.get('skills', [])
        if any(skill in skill_names for skill in component_skills):
            components_to_include.append(component_name)
            if 'depends_on' in component:
                for dep in component['depends_on']:
                    if dep not in components_to_include:
                        components_to_include.append(dep)

    # Build skill comments
    skill_comments = []
    for skill in matched_skills[:10]:
        has_code = "+" if skill.get('name') in skills_with_code else "o"
        skill_comments.append(f"//   [{has_code}] {skill['name']} ({skill['category']})")
    skill_section = "\n".join(skill_comments) if skill_comments else "//   (none matched)"

    # Build concept comments
    concept_comments = []
    for category, keywords in concepts.items():
        concept_comments.append(f"//   {category}: {', '.join(keywords)}")
    concept_section = "\n".join(concept_comments) if concept_comments else "//   (none detected)"

    # Collect variables
    variables = []
    for comp in components_to_include:
        if comp in STRATEGY_COMPONENTS and 'variables' in STRATEGY_COMPONENTS[comp]:
            variables.append(STRATEGY_COMPONENTS[comp]['variables'])
    variables_section = "\n".join(variables)

    # Collect defaults
    defaults = []
    for comp in components_to_include:
        if comp in STRATEGY_COMPONENTS and 'defaults' in STRATEGY_COMPONENTS[comp]:
            defaults.append(STRATEGY_COMPONENTS[comp]['defaults'])
    defaults_section = "\n".join(defaults)

    # Collect properties
    properties = []
    for comp in components_to_include:
        if comp in STRATEGY_COMPONENTS and 'properties' in STRATEGY_COMPONENTS[comp]:
            properties.append(STRATEGY_COMPONENTS[comp]['properties'])
    properties_section = "\n".join(properties)

    # Collect resets
    resets = []
    for comp in components_to_include:
        if comp in STRATEGY_COMPONENTS and 'reset' in STRATEGY_COMPONENTS[comp]:
            reset_code = STRATEGY_COMPONENTS[comp]['reset']
            if reset_code.strip():
                resets.append(reset_code)
    resets_section = "\n".join(resets)

    # Get bias and range logic from skills
    bias_logic = ""
    range_logic = ""
    if "Pre-market Bias Calculation (VWAP-POC)" in skills_with_code:
        bias_logic = skills_with_code["Pre-market Bias Calculation (VWAP-POC)"]["code_snippet"]
    if "Range Building (Opening Range)" in skills_with_code:
        range_logic = skills_with_code["Range Building (Opening Range)"]["code_snippet"]

    # Build entry logic
    entry_sections = []

    if "Liquidity Sweep Detection" in skills_with_code:
        sweep_code = skills_with_code["Liquidity Sweep Detection"]["code_snippet"]
        entry_sections.append(f"""
            //==============================================================================
            // SCENARIO A: SWEEP + CISD (Reversal Pattern)
            //==============================================================================

            {sweep_code}""")

        if "CISD Pattern (Change in State of Delivery)" in skills_with_code:
            cisd_code = skills_with_code["CISD Pattern (Change in State of Delivery)"]["code_snippet"]
            entry_sections.append(f"""
            // CISD Detection after sweep
            if (sweepDirection != 0 && CurrentBar > sweepBar)
            {{
                {cisd_code}

                // ENTRY - Scenario A
                if (cisd_valid)
                {{
                    double stopDistance = tradeDirection == 1 ? Close[0] - sweepPrice : sweepPrice - Close[0];
                    double stopDistanceTicks = stopDistance / TickSize;

                    if (EnableDebug)
                        Print(Time[0].ToString("HH:mm") + " | [A] ENTRY | StopDist:" + stopDistanceTicks.ToString("F0"));

                    if (stopDistanceTicks <= MaxStopTicks && stopDistanceTicks > 0)
                    {{
                        entryPrice = Close[0];
                        stopLoss = sweepPrice;
                        takeProfit = tradeDirection == 1 ? Close[0] + (TakeProfitTicks * TickSize) : Close[0] - (TakeProfitTicks * TickSize);
                        breakevenSet = false;
                        tradeTaken = true;

                        if (tradeDirection == 1)
                        {{
                            activeOrderName = "L";
                            EnterLong(activeOrderName);
                            Print(">>> [A] LONG @ " + entryPrice.ToString("F2"));
                        }}
                        else
                        {{
                            activeOrderName = "S";
                            EnterShort(activeOrderName);
                            Print(">>> [A] SHORT @ " + entryPrice.ToString("F2"));
                        }}
                        return;
                    }}
                }}
            }}""")

    if "Breakout Pullback Pattern" in skills_with_code or "Range Breakout Detection" in skills_with_code:
        entry_sections.append("""
            //==============================================================================
            // SCENARIO B: BREAKOUT + PULLBACK (Continuation Pattern)
            //==============================================================================

            if (!breakoutDetected && sweepDirection == 0)
            {
                if (allowLong && High[0] > rangeHigh)
                {
                    breakoutDetected = true;
                    breakoutDirection = 1;
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | [B] BREAKOUT HIGH");
                }
                if (allowShort && Low[0] < rangeLow)
                {
                    breakoutDetected = true;
                    breakoutDirection = -1;
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | [B] BREAKOUT LOW");
                }
            }

            if (breakoutDetected && !pullbackDetected)
            {
                if (breakoutDirection == 1 && Low[0] < rangeHigh)
                {
                    pullbackDetected = true;
                    breakoutRefCandleOpen = 0;
                }
                if (breakoutDirection == -1 && High[0] > rangeLow)
                {
                    pullbackDetected = true;
                    breakoutRefCandleOpen = 0;
                }
            }

            if (pullbackDetected)
            {
                if (breakoutDirection == 1 && is_bearish) breakoutRefCandleOpen = Open[0];
                if (breakoutDirection == -1 && is_bullish) breakoutRefCandleOpen = Open[0];

                bool breakout_cisd = false;
                if (breakoutDirection == 1 && breakoutRefCandleOpen > 0 && Close[0] > breakoutRefCandleOpen)
                {
                    breakout_cisd = true;
                    tradeDirection = 1;
                }
                if (breakoutDirection == -1 && breakoutRefCandleOpen > 0 && Close[0] < breakoutRefCandleOpen)
                {
                    breakout_cisd = true;
                    tradeDirection = -1;
                }

                if (breakout_cisd)
                {
                    double stopPrice = tradeDirection == 1 ? rangeLow : rangeHigh;
                    double stopDist = tradeDirection == 1 ? Close[0] - stopPrice : stopPrice - Close[0];

                    if (stopDist / TickSize <= MaxStopTicks && stopDist > 0)
                    {
                        entryPrice = Close[0];
                        stopLoss = stopPrice;
                        takeProfit = tradeDirection == 1 ? Close[0] + (TakeProfitTicks * TickSize) : Close[0] - (TakeProfitTicks * TickSize);
                        breakevenSet = false;
                        tradeTaken = true;

                        activeOrderName = tradeDirection == 1 ? "L_BO" : "S_BO";
                        if (tradeDirection == 1) EnterLong(activeOrderName);
                        else EnterShort(activeOrderName);
                        Print(">>> [B] " + (tradeDirection == 1 ? "LONG" : "SHORT") + " @ " + entryPrice.ToString("F2"));
                    }
                }
            }""")

    entry_logic = "\n".join(entry_sections)

    # Breakeven method
    breakeven_method = ""
    if 'breakeven' in components_to_include:
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
        }"""

    be_call = "ManageBreakeven();" if 'breakeven' in components_to_include else ""

    code = f'''//
// {safe_name}Strategy
//
// Generated from YouTube: {url}
// Generated at: {timestamp}
//
// Concepts detected:
{concept_section}
//
// Skills used ([+] = has code, [o] = reference only):
{skill_section}
//
// Components: {', '.join(components_to_include)}
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

{defaults_section}

                MaxStopTicks = 200;
                TakeProfitTicks = 120;
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

            if (barTime.Date != currentDate)
            {{
                ResetDailyState();
                currentDate = barTime.Date;
                if (EnableDebug) Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
            }}

            int rangeStartMins = RangeStartHour * 60 + RangeStartMinute;
            int rangeEndMins = RangeEndHour * 60 + RangeEndMinute;
            int execEndMins = ExecutionEndHour * 60 + ExecutionEndMinute;

            bool inPremarket = hour >= PremarketStartHour && hour < PremarketEndHour;
            bool inRangeBuild = currentMins >= rangeStartMins && currentMins < rangeEndMins;
            bool inExecution = currentMins >= rangeEndMins && currentMins < execEndMins;
            bool inSession = hour >= RangeStartHour && hour < SessionEndHour;

            //==============================================================================
            // PRE-MARKET BIAS
            //==============================================================================
            {bias_logic}

            //==============================================================================
            // RANGE BUILDING
            //==============================================================================
            {range_logic}

            //==============================================================================
            // EXECUTION WINDOW
            //==============================================================================
            if (!inExecution || !rangeSet)
            {{
                {be_call}
                if (!inSession && Position.MarketPosition != MarketPosition.Flat)
                {{
                    if (Position.MarketPosition == MarketPosition.Long) ExitLong();
                    else ExitShort();
                }}
                return;
            }}

            if (tradeTaken) {{ {be_call} return; }}
            if (Position.MarketPosition != MarketPosition.Flat) {{ {be_call} return; }}

            double rangeSizeTicks = (rangeHigh - rangeLow) / TickSize;
            if (rangeSizeTicks < MinRangeTicks) return;

            bool allowLong = pmBias == BiasType.Bullish || pmBias == BiasType.Neutral;
            bool allowShort = pmBias == BiasType.Bearish || pmBias == BiasType.Neutral;
            bool is_bullish = Close[0] > Open[0];
            bool is_bearish = Close[0] < Open[0];

{entry_logic}
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
            if (marketPosition == MarketPosition.Flat) breakevenSet = false;
        }}

        private void ResetDailyState()
        {{
{resets_section}
        }}

        #region Properties
        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Max Stop (Ticks)", Order = 1, GroupName = "2. Risk Management")]
        public int MaxStopTicks {{ get; set; }}

        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Take Profit (Ticks)", Order = 2, GroupName = "2. Risk Management")]
        public int TakeProfitTicks {{ get; set; }}

{properties_section}

        [NinjaScriptProperty]
        [Display(Name = "Enable Debug", Order = 1, GroupName = "4. Debug")]
        public bool EnableDebug {{ get; set; }}
        #endregion
    }}
}}
'''
    return code


def print_gap_analysis(gaps: dict) -> None:
    """Print gap analysis for user review."""
    print("\n" + "=" * 60)
    print("STRATEGY COMPOSITION ANALYSIS")
    print("=" * 60)

    print(f"\nPresent components: {', '.join(gaps['present'])}")

    if gaps['missing']:
        print("\n[!] MISSING (detected but no code):")
        for m in gaps['missing']:
            print(f"    - {m['component']}: {m['reason']}")
            print(f"      Skills needed: {', '.join(m['skills'])}")

    if gaps['recommended']:
        print("\n[?] RECOMMENDED (would enhance strategy):")
        for r in gaps['recommended'][:3]:  # Top 3
            print(f"    - {r['component']}: {r['reason']}")

    print(f"\nMinimum requirements met: {gaps['is_complete']}")
    print("=" * 60)

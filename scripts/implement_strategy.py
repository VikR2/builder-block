#!/usr/bin/env python3
"""
Model-Aware Strategy Implementation Script

Generates NinjaTrader 8 C# strategies from complete models (skill_combinations).
Uses a MODEL-FIRST approach - understanding how skills work together as a coherent
trading system, not just concatenating code snippets.

Usage:
    python scripts/implement_strategy.py --model-id 5 --output-name TTrades4HPO3Strategy
    python scripts/implement_strategy.py --sad data/architectures/2026-01-05-ttrades-4h-po3.md
"""

import argparse
import json
import sqlite3
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple


class ModelAwareGenerator:
    """Generate NT8 strategies from complete models, not individual skills."""

    def __init__(self, db_path: str = "data/builder.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row

    def load_model(self, model_id: int) -> Dict[str, Any]:
        """Load complete model from skill_combinations."""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT
                id, name, description, skill_ids,
                trade_flow_rules, state_machine_spec, skill_contexts,
                context_annotations, typical_use_case, complexity
            FROM skill_combinations
            WHERE id = ?
        """, (model_id,))

        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Model {model_id} not found")

        model = dict(row)

        # Parse JSON fields
        for field in ['skill_ids', 'trade_flow_rules', 'state_machine_spec',
                      'skill_contexts', 'context_annotations']:
            if model.get(field):
                try:
                    model[field] = json.loads(model[field])
                except json.JSONDecodeError:
                    model[field] = {}

        return model

    def load_skills_for_model(self, skill_ids: List[int], skill_contexts: Dict) -> Dict[int, Dict]:
        """Load skills with their model context."""
        if not skill_ids:
            return {}

        cursor = self.conn.cursor()
        placeholders = ','.join(['?' for _ in skill_ids])
        cursor.execute(f"""
            SELECT id, name, slug, category, description,
                   code_snippet, variables_required, dependencies
            FROM skills
            WHERE id IN ({placeholders})
        """, skill_ids)

        skills = {}
        for row in cursor.fetchall():
            skill = dict(row)
            skill_id = str(skill['id'])

            # Add model context for this skill
            if skill_id in skill_contexts:
                skill['model_context'] = skill_contexts[skill_id]
            else:
                skill['model_context'] = {}

            # Parse JSON fields
            for field in ['variables_required', 'dependencies']:
                if skill.get(field):
                    try:
                        skill[field] = json.loads(skill[field])
                    except (json.JSONDecodeError, TypeError):
                        skill[field] = []

            skills[skill['id']] = skill

        return skills

    def generate_state_enum(self, state_machine_spec: Dict) -> str:
        """Generate C# enum from model's state machine specification."""
        states = state_machine_spec.get('states', [])
        if not states:
            return """public enum StrategyState
        {
            Idle,
            WaitingForSetup,
            EntryReady,
            InPosition,
            TradeComplete
        }"""

        enum_members = ',\n            '.join(states)
        return f"""public enum StrategyState
        {{
            {enum_members}
        }}"""

    def generate_state_transitions(self, state_machine_spec: Dict) -> str:
        """Generate state transition logic from model spec."""
        transitions = state_machine_spec.get('transitions', {})
        if not transitions:
            return "// No state transitions defined in model"

        code_lines = []
        code_lines.append("// State transitions from model spec")
        code_lines.append("switch (currentState)")
        code_lines.append("{")

        for state, trans_list in transitions.items():
            code_lines.append(f"    case StrategyState.{state}:")
            for trans in trans_list:
                to_state = trans.get('to', 'Idle')
                condition = trans.get('on', 'default')

                # Generate condition check
                condition_var = self._condition_to_variable(condition)
                code_lines.append(f"        if ({condition_var})")
                code_lines.append(f"        {{")
                code_lines.append(f'            TransitionTo(StrategyState.{to_state}, "{condition}");')
                code_lines.append(f"        }}")
            code_lines.append("        break;")

        code_lines.append("}")

        return '\n            '.join(code_lines)

    def _condition_to_variable(self, condition: str) -> str:
        """Convert condition name to C# variable check."""
        condition_map = {
            'daily_analyzed': 'dailyBiasSet',
            'small_wick': 'wickClassification == WickType.Small',
            'large_wick': 'wickClassification == WickType.Large',
            'cisd_confirmed': 'cisd_confirmed',
            'c1_close': 'c1_closed',
            'c2_wick_size': 'c2_analyzed',
            'new_4h': 'IsNew4HCandle()',
        }
        return condition_map.get(condition, f'{condition}_signal')

    def generate_phase_logic(self, trade_flow_rules: Dict, skills: Dict, phase: str) -> str:
        """Generate code for a specific phase from trade_flow_rules."""
        phase_rules = trade_flow_rules.get(phase, [])
        if not phase_rules:
            return f"// No {phase} rules defined in model"

        code_lines = []
        code_lines.append(f"// {phase.upper()} PHASE (from model trade_flow_rules)")

        if isinstance(phase_rules, list):
            for rule in phase_rules:
                skill_slug = rule.get('skill', '')
                output = rule.get('output', '')
                trigger = rule.get('trigger', '')

                code_lines.append(f"// Skill: {skill_slug}")
                if output:
                    code_lines.append(f"// Output: {output}")
                if trigger:
                    code_lines.append(f"// Trigger: {trigger}")
                code_lines.append(f"// TODO: Inject code from skill '{skill_slug}'")
                code_lines.append("")

        elif isinstance(phase_rules, dict):
            # Entry phase has sub-scenarios (small_wick, large_wick)
            for scenario, rules in phase_rules.items():
                code_lines.append(f"// Scenario: {scenario}")
                if isinstance(rules, list):
                    for rule in rules:
                        skill_slug = rule.get('skill', '')
                        required = rule.get('required', False)
                        code_lines.append(f"//   - {skill_slug} (required: {required})")
                code_lines.append("")

        return '\n            '.join(code_lines)

    def generate_variables(self, skills: Dict, state_machine_spec: Dict) -> str:
        """Generate variable declarations from skills and model."""
        variables = []

        # Core state variable
        variables.append("private StrategyState currentState = StrategyState." +
                        (state_machine_spec.get('states', ['Idle'])[0]) + ";")
        variables.append("")

        # Standard trading variables
        variables.append("// Bias")
        variables.append("private BiasType dailyBias = BiasType.Neutral;")
        variables.append("private bool dailyBiasSet = false;")
        variables.append("")

        variables.append("// POI (Points of Interest)")
        variables.append("private double pdh, pdl, pwh, pwl;")
        variables.append("private double currentPOI;")
        variables.append("")

        variables.append("// CISD Pattern")
        variables.append("private bool cisd_confirmed = false;")
        variables.append("private double cisd_level;")
        variables.append("private int cisd_bar;")
        variables.append("")

        variables.append("// Candle Classification")
        variables.append("private WickType wickClassification = WickType.None;")
        variables.append("private bool c1_closed = false;")
        variables.append("private bool c2_analyzed = false;")
        variables.append("")

        variables.append("// Position Management")
        variables.append("private double entryPrice;")
        variables.append("private double stopPrice;")
        variables.append("private double targetPrice;")
        variables.append("private bool positionOpen = false;")

        return '\n        '.join(variables)

    def generate_helper_enums(self) -> str:
        """Generate standard helper enums."""
        return """public enum BiasType { Neutral, Bullish, Bearish }
        public enum WickType { None, Small, Large }
        public enum POIType { None, PDH, PDL, PWH, PWL, OrderBlock, FVG }"""

    def generate_strategy(self, model: Dict, output_name: str) -> Tuple[str, str]:
        """Generate complete strategy from model."""
        skill_ids = model.get('skill_ids', [])
        skill_contexts = model.get('skill_contexts', {})
        state_machine = model.get('state_machine_spec', {})
        trade_flow = model.get('trade_flow_rules', {})
        context = model.get('context_annotations', {})

        # Load skills with model context
        skills = self.load_skills_for_model(skill_ids, skill_contexts)

        # Build code sections
        class_name = output_name.replace(' ', '').replace('-', '')
        description = model.get('description', 'Model-generated strategy')

        # Generate state enum
        state_enum = self.generate_state_enum(state_machine)
        helper_enums = self.generate_helper_enums()

        # Generate variables
        variables = self.generate_variables(skills, state_machine)

        # Generate phase logic
        bias_logic = self.generate_phase_logic(trade_flow, skills, 'pre_market')
        setup_logic = self.generate_phase_logic(trade_flow, skills, 'setup')
        entry_logic = self.generate_phase_logic(trade_flow, skills, 'entry')
        exit_logic = self.generate_phase_logic(trade_flow, skills, 'exit')

        # Generate state transitions
        state_transitions = self.generate_state_transitions(state_machine)

        # Session info from context_annotations
        sessions = context.get('session_restrictions', {})
        htf_info = context.get('htf_timeframes', {})

        # Build strategy code
        strategy_code = self._build_strategy_template(
            class_name=class_name,
            description=description,
            model_id=model['id'],
            model_name=model['name'],
            state_enum=state_enum,
            helper_enums=helper_enums,
            variables=variables,
            bias_logic=bias_logic,
            setup_logic=setup_logic,
            entry_logic=entry_logic,
            exit_logic=exit_logic,
            state_transitions=state_transitions,
            sessions=sessions,
            htf_info=htf_info
        )

        # Generate changelog
        changelog = self._generate_changelog(
            class_name=class_name,
            model=model,
            skills=skills
        )

        return strategy_code, changelog

    def _build_strategy_template(self, **kwargs) -> str:
        """Build the complete strategy file."""
        return f'''#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

//==============================================================================
// MODEL-GENERATED STRATEGY
// Model ID: {kwargs['model_id']}
// Model Name: {kwargs['model_name']}
// Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
//
// This strategy was generated from a complete model specification.
// State machine, phase logic, and constraints are derived from model intent.
//==============================================================================

namespace NinjaTrader.NinjaScript.Strategies
{{
    public class {kwargs['class_name']} : Strategy
    {{
        #region Enums
        {kwargs['state_enum']}

        {kwargs['helper_enums']}
        #endregion

        #region Variables
        {kwargs['variables']}

        // Tracking
        private DateTime currentDate;
        private string activeOrderName;
        #endregion

        protected override void OnStateChange()
        {{
            if (State == State.SetDefaults)
            {{
                Description = @"{kwargs['description'][:200]}";
                Name = "{kwargs['class_name']}";

                Calculate = Calculate.OnBarClose;
                EntriesPerDirection = 1;
                EntryHandling = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy = true;
                ExitOnSessionCloseSeconds = 30;
                MaximumBarsLookBack = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution = OrderFillResolution.Standard;
                StartBehavior = StartBehavior.WaitUntilFlat;
                TimeInForce = TimeInForce.Gtc;
                TraceOrders = true;
                RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade = 20;
                IsInstantiatedOnEachOptimizationIteration = true;

                // Default parameters
                RiskPerTrade = 1.0;
                TargetMultiple = 2.0;
                MaxStopLossTicks = 100;
                EnableDebug = true;
            }}
            else if (State == State.DataLoaded)
            {{
                ClearOutputWindow();
                Print("========================================");
                Print("{kwargs['class_name']} LOADED");
                Print("Model: {kwargs['model_name']}");
                Print("Instrument: " + Instrument.FullName);
                Print("========================================");
            }}
        }}

        protected override void OnBarUpdate()
        {{
            if (CurrentBar < BarsRequiredToTrade)
                return;

            // Real-time: only process on bar close
            if (State == State.Realtime && IsFirstTickOfBar == false)
                return;

            DateTime barTime = Time[0];

            // New day reset
            if (barTime.Date != currentDate)
            {{
                ResetDailyState();
                currentDate = barTime.Date;
                if (EnableDebug)
                    Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
            }}

            //------------------------------------------------------------------
            // STATE MACHINE (from model spec)
            //------------------------------------------------------------------
            {kwargs['state_transitions']}

            //------------------------------------------------------------------
            // BIAS PHASE
            //------------------------------------------------------------------
            {kwargs['bias_logic']}

            //------------------------------------------------------------------
            // SETUP PHASE
            //------------------------------------------------------------------
            {kwargs['setup_logic']}

            //------------------------------------------------------------------
            // ENTRY PHASE
            //------------------------------------------------------------------
            {kwargs['entry_logic']}

            //------------------------------------------------------------------
            // EXIT PHASE
            //------------------------------------------------------------------
            {kwargs['exit_logic']}
        }}

        #region Helper Methods
        private void TransitionTo(StrategyState newState, string reason)
        {{
            if (EnableDebug)
                Print($"[STATE] {{currentState}} -> {{newState}} ({{reason}})");
            currentState = newState;
        }}

        private void ResetDailyState()
        {{
            // Reset state machine to initial state
            currentState = StrategyState.{kwargs['state_enum'].split('{')[1].split(',')[0].strip() if '{' in kwargs['state_enum'] else 'Idle'};

            // Reset bias
            dailyBias = BiasType.Neutral;
            dailyBiasSet = false;

            // Reset CISD
            cisd_confirmed = false;
            cisd_level = 0;
            cisd_bar = 0;

            // Reset candle classification
            wickClassification = WickType.None;
            c1_closed = false;
            c2_analyzed = false;

            // Reset position tracking
            positionOpen = false;
            activeOrderName = "";

            if (EnableDebug)
                Print("[RESET] Daily state cleared");
        }}

        private bool IsNew4HCandle()
        {{
            // Check if current bar starts a new 4H period
            int hour = Time[0].Hour;
            return hour == 2 || hour == 6 || hour == 10 || hour == 14;
        }}
        #endregion

        #region Order Handlers
        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {{
            if (EnableDebug)
                Print($"{{time:HH:mm:ss}} | FILL: {{execution.Order.Name}} | {{marketPosition}} | Qty:{{quantity}} @ {{price:F2}}");

            if (execution.Order.Name.Contains("Entry"))
            {{
                positionOpen = true;
                entryPrice = price;
            }}
            else if (execution.Order.Name.Contains("Stop") || execution.Order.Name.Contains("Target"))
            {{
                positionOpen = false;
                TransitionTo(StrategyState.TRADE_COMPLETE, "position_closed");
            }}
        }}

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {{
            if (EnableDebug)
                Print($"POSITION: {{marketPosition}} | Qty:{{quantity}} @ {{averagePrice:F2}}");

            if (marketPosition == MarketPosition.Flat)
            {{
                positionOpen = false;
            }}
        }}
        #endregion

        #region Properties
        [NinjaScriptProperty]
        [Range(0.1, 10)]
        [Display(Name = "Risk Per Trade %", Order = 1, GroupName = "1. Risk")]
        public double RiskPerTrade {{ get; set; }}

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "Target Multiple (R)", Order = 2, GroupName = "1. Risk")]
        public double TargetMultiple {{ get; set; }}

        [NinjaScriptProperty]
        [Range(10, 500)]
        [Display(Name = "Max Stop Loss Ticks", Order = 3, GroupName = "1. Risk")]
        public int MaxStopLossTicks {{ get; set; }}

        [NinjaScriptProperty]
        [Display(Name = "Enable Debug Output", Order = 99, GroupName = "99. Debug")]
        public bool EnableDebug {{ get; set; }}
        #endregion
    }}
}}
'''

    def _generate_changelog(self, class_name: str, model: Dict, skills: Dict) -> str:
        """Generate changelog documenting skill composition."""
        skill_contexts = model.get('skill_contexts', {})

        # Group skills by phase
        phases = {'bias': [], 'setup': [], 'confirmation': [], 'entry': [], 'management': [], 'exit': []}
        for skill_id, skill in skills.items():
            ctx = skill.get('model_context', {})
            phase = ctx.get('phase', 'other')
            if phase in phases:
                phases[phase].append(skill)

        lines = [
            f"# {class_name} - Generation Changelog",
            "",
            f"**Model ID:** {model['id']}",
            f"**Model Name:** {model['name']}",
            f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## Model Intent",
            "",
            model.get('description', 'No description'),
            "",
            "## Skills by Phase",
            ""
        ]

        for phase, phase_skills in phases.items():
            if phase_skills:
                lines.append(f"### {phase.title()} Phase")
                for skill in phase_skills:
                    ctx = skill.get('model_context', {})
                    required = ctx.get('required', False)
                    order = ctx.get('order', 0)
                    notes = ctx.get('notes', '')

                    req_str = " **(required)**" if required else ""
                    notes_str = f" - {notes}" if notes else ""
                    lines.append(f"- #{skill['id']} {skill['name']}{req_str}{notes_str}")
                lines.append("")

        lines.extend([
            "## State Machine",
            "",
            "States from model:",
        ])

        states = model.get('state_machine_spec', {}).get('states', [])
        for state in states:
            lines.append(f"- {state}")

        lines.extend([
            "",
            "## Constraints",
            "",
        ])

        annotations = model.get('context_annotations', {})
        constraints = annotations.get('constraints', []) if isinstance(annotations, dict) else []
        for constraint in constraints:
            lines.append(f"- {constraint}")

        return '\n'.join(lines)

    def save_output(self, strategy_code: str, changelog: str, output_name: str, output_dir: str = "scripts-output/Strategies"):
        """Save generated files."""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # Save strategy
        cs_path = output_path / f"{output_name}.cs"
        cs_path.write_text(strategy_code, encoding='utf-8')
        print(f"Strategy saved: {cs_path}")

        # Save changelog
        changelog_path = output_path / f"{output_name}_changelog.md"
        changelog_path.write_text(changelog, encoding='utf-8')
        print(f"Changelog saved: {changelog_path}")

        return cs_path, changelog_path


def main():
    parser = argparse.ArgumentParser(description="Generate NT8 strategy from model")
    parser.add_argument('--model-id', type=int, help='Model ID from skill_combinations')
    parser.add_argument('--sad', type=str, help='Path to SAD file (extracts model from SAD)')
    parser.add_argument('--output-name', type=str, help='Output class name')
    parser.add_argument('--output-dir', type=str, default='scripts-output/Strategies')
    parser.add_argument('--db', type=str, default='data/builder.db')

    args = parser.parse_args()

    if not args.model_id and not args.sad:
        print("Error: Either --model-id or --sad is required")
        parser.print_help()
        return 1

    generator = ModelAwareGenerator(args.db)

    try:
        if args.model_id:
            model = generator.load_model(args.model_id)
            output_name = args.output_name or model['name'].replace(' ', '')

            print(f"Generating strategy from model #{args.model_id}: {model['name']}")
            print(f"Skills: {len(model.get('skill_ids', []))}")
            print(f"States: {len(model.get('state_machine_spec', {}).get('states', []))}")

            strategy_code, changelog = generator.generate_strategy(model, output_name)
            generator.save_output(strategy_code, changelog, output_name, args.output_dir)

            print("\nGeneration complete!")
            print(f"Note: This is an MVP. Phase logic has TODOs for skill code injection.")

        else:
            print("SAD-based generation not yet implemented")
            print("Use --model-id to generate from a registered model")
            return 1

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit(main())

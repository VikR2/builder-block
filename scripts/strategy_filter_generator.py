#!/usr/bin/env python3
"""
Strategy Filter Generator for NinjaTrader Optimization

Takes analysis recommendations and generates C# filter code to inject into strategies.
Focus on finding better opportunities (not just reducing trades):
- Duration filter: Hold trades longer to capture full moves
- Time-window filter: Focus on highest-probability hours
- Parameter optimization: Adjust stop/profit ticks based on MAE/MFE

USAGE:
    python scripts/strategy_filter_generator.py \\
        --recommendations recommendations.json \\
        --strategy TTradesReversalV2Strategy.cs \\
        --output TTradesReversalV2Strategy_v2.cs
"""

import argparse
import json
import re
from pathlib import Path
from typing import Optional


class StrategyFilterGenerator:
    """Generates C# filter code for NinjaTrader strategies"""

    def __init__(self, strategy_path: str, recommendations: dict):
        self.strategy_path = Path(strategy_path)
        self.recommendations = recommendations
        self.strategy_code = self.strategy_path.read_text(encoding='utf-8')
        self.changes_made = []

    def generate_optimized_strategy(self) -> str:
        """Generate optimized strategy with filters and parameter adjustments"""

        code = self.strategy_code

        # Add new properties
        code = self._add_filter_properties(code)

        # Add filter logic in OnBarUpdate
        code = self._add_filter_logic(code)

        # Add position tracking for duration filter
        code = self._add_position_tracking(code)

        # Adjust default parameter values based on recommendations
        code = self._adjust_default_parameters(code)

        return code

    def _add_filter_properties(self, code: str) -> str:
        """Add new NinjaScript properties for filters"""

        filters = self.recommendations.get('filters_to_add', {})
        new_properties = []

        # Duration filter property
        if 'min_hold_bars' in filters:
            new_properties.append('''
        // Optimization Filter: Minimum Hold Duration
        [NinjaScriptProperty]
        [Range(1, 50)]
        [Display(Name = "Minimum Hold Bars", Order = 1, GroupName = "5. Optimization Filters")]
        public int MinimumHoldBars { get; set; }''')

        # Time window filter properties
        if 'focus_hours' in filters:
            new_properties.append('''
        // Optimization Filter: Entry Time Window
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Entry Start Hour", Order = 2, GroupName = "5. Optimization Filters")]
        public int EntryStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Entry End Hour", Order = 3, GroupName = "5. Optimization Filters")]
        public int EntryEndHour { get; set; }''')

        # Day-of-week filter properties
        if 'disable_days' in filters:
            new_properties.append('''
        // Optimization Filter: Day-of-Week Trading
        [NinjaScriptProperty]
        [Display(Name = "Enable Monday", Order = 4, GroupName = "5. Optimization Filters")]
        public bool EnableMonday { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Tuesday", Order = 5, GroupName = "5. Optimization Filters")]
        public bool EnableTuesday { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Wednesday", Order = 6, GroupName = "5. Optimization Filters")]
        public bool EnableWednesday { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Thursday", Order = 7, GroupName = "5. Optimization Filters")]
        public bool EnableThursday { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Friday", Order = 8, GroupName = "5. Optimization Filters")]
        public bool EnableFriday { get; set; }''')

        # Loss streak limiter
        if 'max_consecutive_losses' in filters:
            new_properties.append('''
        // Optimization Filter: Loss Streak Limiter
        [NinjaScriptProperty]
        [Range(1, 20)]
        [Display(Name = "Max Consecutive Losses", Order = 9, GroupName = "5. Optimization Filters")]
        public int MaxConsecutiveLosses { get; set; }''')

        if new_properties:
            # Find the #region Properties section and add at the end before #endregion
            # Look for pattern: #region Properties ... #endregion
            pattern = r'(#region Properties.*?)(#endregion)'
            match = re.search(pattern, code, re.DOTALL)
            if match:
                properties_section = match.group(1)
                insert_pos = match.start(2)
                new_code = '\n'.join(new_properties) + '\n        '
                code = code[:insert_pos] + new_code + code[insert_pos:]
                self.changes_made.append(f"Added {len(new_properties)} filter property blocks")
            else:
                # Fallback: Add before final closing brace of class
                pattern = r'(\s+}\s*}\s*)$'
                match = re.search(pattern, code)
                if match:
                    insert_pos = match.start()
                    new_code = '\n\n        #region Optimization Filters\n' + '\n'.join(new_properties) + '\n        #endregion\n'
                    code = code[:insert_pos] + new_code + code[insert_pos:]
                    self.changes_made.append(f"Added {len(new_properties)} filter property blocks")

        return code

    def _add_filter_logic(self, code: str) -> str:
        """Add filter logic to OnBarUpdate before entry execution"""

        filters = self.recommendations.get('filters_to_add', {})

        filter_checks = []

        # Time window filter
        if 'focus_hours' in filters:
            filter_checks.append('''
            // Optimization: Entry time window filter
            if (hour < EntryStartHour || hour >= EntryEndHour)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP: Outside entry window");
                // Don't return - allow position management but block new entries
                if (Position.MarketPosition == MarketPosition.Flat) return;
            }''')

        # Day-of-week filter
        if 'disable_days' in filters:
            filter_checks.append('''
            // Optimization: Day-of-week filter
            DayOfWeek dayOfWeek = barTime.DayOfWeek;
            bool dayAllowed = (dayOfWeek == DayOfWeek.Monday && EnableMonday) ||
                              (dayOfWeek == DayOfWeek.Tuesday && EnableTuesday) ||
                              (dayOfWeek == DayOfWeek.Wednesday && EnableWednesday) ||
                              (dayOfWeek == DayOfWeek.Thursday && EnableThursday) ||
                              (dayOfWeek == DayOfWeek.Friday && EnableFriday);
            if (!dayAllowed && Position.MarketPosition == MarketPosition.Flat)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP: " + dayOfWeek + " trading disabled");
                return;
            }''')

        # Loss streak limiter
        if 'max_consecutive_losses' in filters:
            filter_checks.append('''
            // Optimization: Loss streak limiter
            if (consecutiveLossCount >= MaxConsecutiveLosses && Position.MarketPosition == MarketPosition.Flat)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP: Loss streak limit (" + consecutiveLossCount + " losses)");
                return;
            }''')

        if filter_checks:
            # Find the start of execution window section and insert filters
            pattern = r'(if \(!inExecution\))'
            filter_code = '\n'.join(filter_checks) + '\n\n            '
            code = re.sub(pattern, filter_code + r'\1', code, count=1)
            self.changes_made.append(f"Added {len(filter_checks)} filter checks to OnBarUpdate")

        return code

    def _add_position_tracking(self, code: str) -> str:
        """Add position tracking variables for duration filter and loss streak"""

        filters = self.recommendations.get('filters_to_add', {})

        new_vars = []

        if 'min_hold_bars' in filters:
            new_vars.append('        private int barsInPosition;')

        if 'max_consecutive_losses' in filters:
            new_vars.append('        private int consecutiveLossCount;')

        if new_vars:
            # Find Variables region and add after existing variables
            pattern = r'(#region Variables.*?)(#endregion)'
            match = re.search(pattern, code, re.DOTALL)
            if match:
                insert_text = '\n\n        // Optimization tracking variables\n' + '\n'.join(new_vars) + '\n        '
                code = code[:match.end(1)] + insert_text + code[match.end(1):]
                self.changes_made.append("Added position tracking variables")

        # Add OnPositionUpdate logic for loss streak tracking
        if 'max_consecutive_losses' in filters:
            position_update_addition = '''
            // Track consecutive losses for streak limiter
            if (marketPosition == MarketPosition.Flat && Position.Quantity == 0)
            {
                double pnl = Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, Close[0]);
                if (pnl < 0)
                    consecutiveLossCount++;
                else if (pnl > 0)
                    consecutiveLossCount = 0;
            }'''

            # Find OnPositionUpdate and add logic
            pattern = r'(protected override void OnPositionUpdate.*?\{)'
            code = re.sub(pattern, r'\1' + position_update_addition, code, count=1, flags=re.DOTALL)
            self.changes_made.append("Added loss streak tracking to OnPositionUpdate")

        return code

    def _adjust_default_parameters(self, code: str) -> str:
        """Adjust default parameter values based on recommendations"""

        filters = self.recommendations.get('filters_to_add', {})
        params = self.recommendations.get('parameter_adjustments', {})

        # Set defaults in SetDefaults section
        defaults_additions = []

        if 'min_hold_bars' in filters:
            min_bars = filters['min_hold_bars']
            defaults_additions.append(f'                MinimumHoldBars = {min_bars};')

        if 'focus_hours' in filters:
            hours = filters['focus_hours']
            if hours:
                defaults_additions.append(f'                EntryStartHour = {min(hours)};')
                defaults_additions.append(f'                EntryEndHour = {max(hours) + 1};')

        if 'disable_days' in filters:
            disable_days = [d.lower() for d in filters['disable_days']]
            defaults_additions.append(f'                EnableMonday = {"false" if "monday" in disable_days else "true"};')
            defaults_additions.append(f'                EnableTuesday = {"false" if "tuesday" in disable_days else "true"};')
            defaults_additions.append(f'                EnableWednesday = {"false" if "wednesday" in disable_days else "true"};')
            defaults_additions.append(f'                EnableThursday = {"false" if "thursday" in disable_days else "true"};')
            defaults_additions.append(f'                EnableFriday = {"false" if "friday" in disable_days else "true"};')

        if 'max_consecutive_losses' in filters:
            max_losses = filters['max_consecutive_losses']
            defaults_additions.append(f'                MaxConsecutiveLosses = {max_losses};')

        if defaults_additions:
            # Find EnableDebug = true; and add after it
            pattern = r'(EnableDebug = true;)'
            additions = '\n\n                // Optimization filter defaults\n' + '\n'.join(defaults_additions)
            code = re.sub(pattern, r'\1' + additions, code, count=1)
            self.changes_made.append("Set optimization filter defaults")

        return code

    def get_changes_summary(self) -> list[str]:
        """Return list of changes made"""
        return self.changes_made


def generate_parameter_optimization_report(strategy_path: str, metrics: dict) -> str:
    """Generate report on which parameters could be optimized in NinjaTrader"""

    report = []
    report.append("\n" + "="*60)
    report.append("PARAMETER OPTIMIZATION SUGGESTIONS")
    report.append("="*60)

    # Read strategy to find current defaults
    code = Path(strategy_path).read_text(encoding='utf-8')

    # Extract current parameters
    current_params = {}
    param_patterns = [
        (r'MaxStopTicks\s*=\s*(\d+)', 'MaxStopTicks'),
        (r'TakeProfitTicks\s*=\s*(\d+)', 'TakeProfitTicks'),
        (r'BreakevenTicks\s*=\s*(\d+)', 'BreakevenTicks'),
        (r'MinRangeTicks\s*=\s*(\d+)', 'MinRangeTicks'),
        (r'StopBufferTicks\s*=\s*(\d+)', 'StopBufferTicks'),
    ]

    for pattern, name in param_patterns:
        match = re.search(pattern, code)
        if match:
            current_params[name] = int(match.group(1))

    report.append("\nCurrent Parameter Values:")
    for name, value in current_params.items():
        report.append(f"  {name}: {value}")

    # Optimization suggestions based on metrics
    report.append("\nOptimization Ranges to Test in NinjaTrader:")

    if 'avg_bars_held' in metrics:
        avg_bars = metrics['avg_bars_held']
        report.append(f"\n1. BREAKEVEN TIMING (current: {current_params.get('BreakevenTicks', 'N/A')})")
        report.append(f"   - Avg bars held: {avg_bars:.1f}")
        report.append(f"   - Test range: 60-120 ticks")
        report.append(f"   - Rationale: Trades need time to develop")

    if 'max_drawdown' in metrics:
        dd = metrics['max_drawdown']
        report.append(f"\n2. STOP LOSS (current: {current_params.get('MaxStopTicks', 'N/A')})")
        report.append(f"   - Max drawdown: ${dd:,.0f}")
        report.append(f"   - Test range: 150-250 ticks")
        report.append(f"   - Consider: Wider stops may improve win rate")

    if 'profit_factor' in metrics:
        pf = metrics['profit_factor']
        report.append(f"\n3. TAKE PROFIT (current: {current_params.get('TakeProfitTicks', 'N/A')})")
        report.append(f"   - Profit factor: {pf:.2f}")
        report.append(f"   - Test range: 100-200 ticks")
        report.append(f"   - Consider: Trailing stop vs fixed target")

    report.append("\n4. NINJATRADER OPTIMIZATION STEPS:")
    report.append("   a) Open Strategy in NinjaTrader")
    report.append("   b) Right-click chart > Strategy > Optimize")
    report.append("   c) Select parameters to optimize")
    report.append("   d) Set ranges and step sizes")
    report.append("   e) Run optimization with Walk-Forward enabled")

    return '\n'.join(report)


def main():
    parser = argparse.ArgumentParser(
        description='Generate optimized NinjaTrader strategy with filters'
    )
    parser.add_argument('--recommendations', '-r', required=True,
                        help='Path to recommendations JSON from backtest_analyzer')
    parser.add_argument('--strategy', '-s', required=True,
                        help='Path to source strategy .cs file')
    parser.add_argument('--output', '-o',
                        help='Output path for optimized strategy')
    parser.add_argument('--param-report', action='store_true',
                        help='Generate parameter optimization report only')

    args = parser.parse_args()

    # Load recommendations
    with open(args.recommendations, 'r') as f:
        data = json.load(f)

    recommendations = data.get('recommendations', data)
    metrics = data.get('metrics', {})

    # Generate parameter optimization report if requested
    if args.param_report:
        report = generate_parameter_optimization_report(args.strategy, metrics)
        print(report)
        return

    # Generate optimized strategy
    print(f"Loading strategy: {args.strategy}")
    print(f"Applying recommendations from: {args.recommendations}")

    generator = StrategyFilterGenerator(args.strategy, recommendations)
    optimized_code = generator.generate_optimized_strategy()

    # Determine output path
    output_path = args.output
    if not output_path:
        strategy_path = Path(args.strategy)
        output_path = strategy_path.parent / f"{strategy_path.stem}_optimized{strategy_path.suffix}"

    # Write optimized strategy
    Path(output_path).write_text(optimized_code, encoding='utf-8')

    print(f"\nOptimized strategy written to: {output_path}")
    print("\nChanges made:")
    for change in generator.get_changes_summary():
        print(f"  - {change}")

    # Also show parameter optimization suggestions
    report = generate_parameter_optimization_report(args.strategy, metrics)
    print(report)


if __name__ == '__main__':
    main()

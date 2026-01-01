#!/usr/bin/env python3
"""
Backtest Analyzer for NinjaTrader Strategy Optimization

Parses NinjaTrader Grid CSV exports and generates:
- Performance metrics (win rate, profit factor, etc.)
- Time-based analysis (hour, day-of-week patterns)
- Duration analysis (bars held vs performance)
- MAE/MFE analysis (entry/exit optimization)
- Recommendations JSON for filter generator

USAGE:
    python scripts/backtest_analyzer.py "NinjaTrader Grid 2025-12-31.csv"
    python scripts/backtest_analyzer.py --help
"""

import argparse
import csv
import json
import re
import sqlite3
from collections import defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional


@dataclass
class Trade:
    """Represents a single trade from backtest"""
    trade_number: int
    instrument: str
    account: str
    strategy: str
    market_pos: str  # "Long" or "Short"
    qty: int
    entry_price: float
    exit_price: float
    entry_time: datetime
    exit_time: datetime
    entry_name: str
    exit_name: str
    profit: float
    cum_profit: float
    mae: float  # Maximum Adverse Excursion
    mfe: float  # Maximum Favorable Excursion
    etd: float  # End Trade Drawdown
    bars: int


@dataclass
class AnalysisMetrics:
    """Analysis output metrics"""
    # Basic stats
    total_trades: int
    winning_trades: int
    losing_trades: int
    breakeven_trades: int
    win_rate: float
    loss_rate: float

    # Profit metrics
    total_profit: float
    gross_profit: float
    gross_loss: float
    profit_factor: float
    avg_trade: float
    avg_win: float
    avg_loss: float
    win_loss_ratio: float

    # Drawdown
    max_drawdown: float
    max_drawdown_pct: float

    # Duration stats
    avg_bars_held: float
    avg_bars_winners: float
    avg_bars_losers: float

    # MAE/MFE
    avg_mae: float
    avg_mfe: float
    avg_mae_winners: float
    avg_mae_losers: float

    # Loss streaks
    max_consecutive_losses: int
    avg_loss_streak: float


@dataclass
class TimeAnalysis:
    """Time-based performance breakdown"""
    by_hour: dict  # hour -> {trades, wins, total_pnl, avg_pnl}
    by_day_of_week: dict  # day -> {trades, wins, total_pnl, avg_pnl}


@dataclass
class DurationAnalysis:
    """Trade duration analysis"""
    quick_trades: dict  # 1-5 bars
    medium_trades: dict  # 6-15 bars
    long_trades: dict  # 16+ bars


@dataclass
class Recommendations:
    """Optimization recommendations"""
    filters_to_add: dict
    parameter_adjustments: dict
    analysis_notes: list


@dataclass
class ProblemPattern:
    """Represents an identified problem pattern for strategy iteration"""
    pattern_type: str  # "mfe_reversal", "time_cluster", "loss_streak", "session_issue"
    severity: str  # "HIGH", "MEDIUM", "LOW"
    impact: float  # Dollar impact
    trades_affected: list  # List of trade numbers
    description: str
    details: dict  # Pattern-specific details
    recommended_skill: str  # Skill from nt-skills database
    expected_recovery: float  # Expected $ improvement


def parse_money(value: str) -> float:
    """Parse money value like '($590.00)' or '$1,970.00' or plain '590.00'"""
    if not value or value.strip() == '':
        return 0.0
    # Remove $ and commas
    clean = value.replace('$', '').replace(',', '').strip()
    # Handle parentheses for negative values
    if clean.startswith('(') and clean.endswith(')'):
        return -float(clean[1:-1])
    return float(clean)


def parse_profit(value: str) -> float:
    """Alias for parse_money for backward compatibility"""
    return parse_money(value)


def parse_datetime(value: str) -> datetime:
    """Parse datetime like '1/2/2025 8:40:00 AM'"""
    return datetime.strptime(value, "%m/%d/%Y %I:%M:%S %p")


def load_trades_from_csv(csv_path: str) -> list[Trade]:
    """Load trades from NinjaTrader Grid CSV export"""
    trades = []

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Skip empty rows
            if not row.get('Trade number'):
                continue

            try:
                trade = Trade(
                    trade_number=int(row['Trade number']),
                    instrument=row['Instrument'],
                    account=row['Account'],
                    strategy=row['Strategy'],
                    market_pos=row['Market pos.'],
                    qty=int(row['Qty']),
                    entry_price=float(row['Entry price']),
                    exit_price=float(row['Exit price']),
                    entry_time=parse_datetime(row['Entry time']),
                    exit_time=parse_datetime(row['Exit time']),
                    entry_name=row['Entry name'],
                    exit_name=row['Exit name'],
                    profit=parse_money(row['Profit']),
                    cum_profit=parse_money(row['Cum. net profit']),
                    mae=parse_money(row['MAE']),
                    mfe=parse_money(row['MFE']),
                    etd=parse_money(row['ETD']),
                    bars=int(row['Bars'])
                )
                trades.append(trade)
            except (ValueError, KeyError) as e:
                print(f"Warning: Skipping row due to parse error: {e}")
                continue

    return trades


def calculate_metrics(trades: list[Trade]) -> AnalysisMetrics:
    """Calculate core analysis metrics"""
    if not trades:
        raise ValueError("No trades to analyze")

    # Basic counts
    total = len(trades)
    winners = [t for t in trades if t.profit > 0]
    losers = [t for t in trades if t.profit < 0]
    breakeven = [t for t in trades if t.profit == 0]

    # Profit calculations
    gross_profit = sum(t.profit for t in winners)
    gross_loss = abs(sum(t.profit for t in losers))
    total_profit = sum(t.profit for t in trades)

    # Profit factor (handle division by zero)
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')

    # Averages
    avg_trade = total_profit / total if total > 0 else 0
    avg_win = gross_profit / len(winners) if winners else 0
    avg_loss = gross_loss / len(losers) if losers else 0
    win_loss_ratio = avg_win / avg_loss if avg_loss > 0 else float('inf')

    # Drawdown calculation
    peak = 0
    max_dd = 0
    for t in trades:
        peak = max(peak, t.cum_profit)
        dd = peak - t.cum_profit
        max_dd = max(max_dd, dd)

    # Max drawdown percentage (relative to peak)
    max_dd_pct = (max_dd / peak * 100) if peak > 0 else 0

    # Duration stats
    avg_bars = sum(t.bars for t in trades) / total
    avg_bars_win = sum(t.bars for t in winners) / len(winners) if winners else 0
    avg_bars_loss = sum(t.bars for t in losers) / len(losers) if losers else 0

    # MAE/MFE
    avg_mae = sum(t.mae for t in trades) / total
    avg_mfe = sum(t.mfe for t in trades) / total
    avg_mae_win = sum(t.mae for t in winners) / len(winners) if winners else 0
    avg_mae_loss = sum(t.mae for t in losers) / len(losers) if losers else 0

    # Loss streaks
    streaks = []
    current_streak = 0
    for t in trades:
        if t.profit < 0:
            current_streak += 1
        else:
            if current_streak > 0:
                streaks.append(current_streak)
            current_streak = 0
    if current_streak > 0:
        streaks.append(current_streak)

    max_streak = max(streaks) if streaks else 0
    avg_streak = sum(streaks) / len(streaks) if streaks else 0

    return AnalysisMetrics(
        total_trades=total,
        winning_trades=len(winners),
        losing_trades=len(losers),
        breakeven_trades=len(breakeven),
        win_rate=len(winners) / total * 100,
        loss_rate=len(losers) / total * 100,
        total_profit=total_profit,
        gross_profit=gross_profit,
        gross_loss=gross_loss,
        profit_factor=profit_factor,
        avg_trade=avg_trade,
        avg_win=avg_win,
        avg_loss=avg_loss,
        win_loss_ratio=win_loss_ratio,
        max_drawdown=max_dd,
        max_drawdown_pct=max_dd_pct,
        avg_bars_held=avg_bars,
        avg_bars_winners=avg_bars_win,
        avg_bars_losers=avg_bars_loss,
        avg_mae=avg_mae,
        avg_mfe=avg_mfe,
        avg_mae_winners=avg_mae_win,
        avg_mae_losers=avg_mae_loss,
        max_consecutive_losses=max_streak,
        avg_loss_streak=avg_streak
    )


def analyze_by_time(trades: list[Trade]) -> TimeAnalysis:
    """Analyze performance by hour and day of week"""

    by_hour = defaultdict(lambda: {'trades': 0, 'wins': 0, 'total_pnl': 0.0})
    by_dow = defaultdict(lambda: {'trades': 0, 'wins': 0, 'total_pnl': 0.0})

    for t in trades:
        hour = t.entry_time.hour
        dow = t.entry_time.strftime('%A')  # Full day name

        by_hour[hour]['trades'] += 1
        by_hour[hour]['total_pnl'] += t.profit
        if t.profit > 0:
            by_hour[hour]['wins'] += 1

        by_dow[dow]['trades'] += 1
        by_dow[dow]['total_pnl'] += t.profit
        if t.profit > 0:
            by_dow[dow]['wins'] += 1

    # Calculate averages and win rates
    for hour, stats in by_hour.items():
        stats['avg_pnl'] = stats['total_pnl'] / stats['trades'] if stats['trades'] > 0 else 0
        stats['win_rate'] = stats['wins'] / stats['trades'] * 100 if stats['trades'] > 0 else 0

    for dow, stats in by_dow.items():
        stats['avg_pnl'] = stats['total_pnl'] / stats['trades'] if stats['trades'] > 0 else 0
        stats['win_rate'] = stats['wins'] / stats['trades'] * 100 if stats['trades'] > 0 else 0

    return TimeAnalysis(
        by_hour=dict(by_hour),
        by_day_of_week=dict(by_dow)
    )


def analyze_by_duration(trades: list[Trade]) -> DurationAnalysis:
    """Analyze performance by trade duration (bars held)"""

    quick = {'trades': 0, 'wins': 0, 'total_pnl': 0.0, 'bars_range': '1-5'}
    medium = {'trades': 0, 'wins': 0, 'total_pnl': 0.0, 'bars_range': '6-15'}
    long = {'trades': 0, 'wins': 0, 'total_pnl': 0.0, 'bars_range': '16+'}

    for t in trades:
        if t.bars <= 5:
            bucket = quick
        elif t.bars <= 15:
            bucket = medium
        else:
            bucket = long

        bucket['trades'] += 1
        bucket['total_pnl'] += t.profit
        if t.profit > 0:
            bucket['wins'] += 1

    # Calculate win rates and averages
    for bucket in [quick, medium, long]:
        bucket['win_rate'] = bucket['wins'] / bucket['trades'] * 100 if bucket['trades'] > 0 else 0
        bucket['avg_pnl'] = bucket['total_pnl'] / bucket['trades'] if bucket['trades'] > 0 else 0

    return DurationAnalysis(
        quick_trades=quick,
        medium_trades=medium,
        long_trades=long
    )


def detect_mfe_reversals(trades: list[Trade], metrics: AnalysisMetrics = None) -> Optional[ProblemPattern]:
    """
    Detect trades where MFE reached profit but exited at loss.
    These are trades that "left money on the table" and reversed.

    Args:
        trades: List of trades to analyze
        metrics: Analysis metrics for data-driven thresholds

    Returns:
        ProblemPattern if significant reversals found, None otherwise
    """
    # Data-driven thresholds based on average trade size
    avg_trade = abs(metrics.avg_trade) if metrics else 200
    high_threshold = avg_trade * 15  # HIGH = 15x avg trade impact
    med_threshold = avg_trade * 5    # MEDIUM = 5x avg trade impact
    reversals = []
    total_left_on_table = 0

    for t in trades:
        if t.profit >= 0:
            continue  # Only looking at losers

        # Calculate approximate risk (using MAE as proxy if no stop info)
        # MFE reversal = trade reached profit but ended as loss
        risk_approx = abs(t.profit) + t.mfe  # Risk ≈ final loss + what we gave back

        if risk_approx > 0:
            mfe_r = t.mfe / risk_approx
        else:
            mfe_r = 0

        # If MFE was significant (reached profit) but we lost
        if t.mfe > abs(t.profit) * 0.5:  # MFE was at least half of what we lost
            reversals.append({
                'trade': t.trade_number,
                'mfe': t.mfe,
                'profit': t.profit,
                'entry_time': t.entry_time.strftime("%Y-%m-%d %H:%M"),
                'direction': t.market_pos
            })
            total_left_on_table += t.mfe + abs(t.profit)  # What we could have had

    if len(reversals) < 2:
        return None

    # Severity based on impact (data-driven thresholds)
    impact = sum(r['mfe'] for r in reversals)
    severity = "HIGH" if impact > high_threshold else "MEDIUM" if impact > med_threshold else "LOW"

    # Expected recovery = 50% of MFE (conservative - partial profits)
    expected_recovery = impact * 0.5

    return ProblemPattern(
        pattern_type="mfe_reversal",
        severity=severity,
        impact=-impact,
        trades_affected=[r['trade'] for r in reversals],
        description=f"{len(reversals)} trades reached profit but reversed to loss",
        details={
            'reversals': reversals,
            'total_left_on_table': total_left_on_table,
            'avg_mfe_at_reversal': impact / len(reversals)
        },
        recommended_skill="partial-profits, trailing-stop-protected-swings",
        expected_recovery=expected_recovery
    )


def detect_time_clusters(
    trades: list[Trade],
    metrics: AnalysisMetrics = None,
    min_trades: int = 3,
    max_win_rate: float = 25.0
) -> Optional[ProblemPattern]:
    """
    Detect hours with consistently poor performance.

    Args:
        trades: List of trades to analyze
        metrics: Analysis metrics for data-driven thresholds
        min_trades: Minimum trades in hour to consider (default 3)
        max_win_rate: Win rate below this = problem (default 25%)

    Returns:
        ProblemPattern if problem hour found, None otherwise
    """
    # Data-driven: min_loss = 2x average loser (scales with instrument)
    avg_loss = abs(metrics.avg_loss) if metrics else 500
    min_loss = avg_loss * 2
    by_hour = defaultdict(lambda: {'trades': [], 'wins': 0, 'total_pnl': 0.0})

    for t in trades:
        hour = t.entry_time.hour
        by_hour[hour]['trades'].append(t)
        by_hour[hour]['total_pnl'] += t.profit
        if t.profit > 0:
            by_hour[hour]['wins'] += 1

    worst_hour = None
    worst_impact = 0

    for hour, stats in by_hour.items():
        n_trades = len(stats['trades'])
        if n_trades < min_trades:
            continue

        win_rate = (stats['wins'] / n_trades) * 100
        total_loss = stats['total_pnl']

        # Check if this hour meets problem criteria
        if win_rate <= max_win_rate and total_loss < -min_loss:
            if total_loss < worst_impact:
                worst_impact = total_loss
                worst_hour = {
                    'hour': hour,
                    'trades': n_trades,
                    'wins': stats['wins'],
                    'win_rate': win_rate,
                    'total_pnl': total_loss,
                    'trade_numbers': [t.trade_number for t in stats['trades']]
                }

    if worst_hour is None:
        return None

    severity = "HIGH" if abs(worst_impact) > 5000 else "MEDIUM" if abs(worst_impact) > 2000 else "LOW"

    # Expected recovery: If we fade, we flip the losses to wins
    expected_recovery = abs(worst_impact) * 2  # Flip from -X to +X

    return ProblemPattern(
        pattern_type="time_cluster",
        severity=severity,
        impact=worst_impact,
        trades_affected=worst_hour['trade_numbers'],
        description=f"{worst_hour['hour']}:00 hour has {worst_hour['win_rate']:.0f}% win rate ({worst_hour['wins']}/{worst_hour['trades']} trades)",
        details={
            'hour': worst_hour['hour'],
            'trades': worst_hour['trades'],
            'wins': worst_hour['wins'],
            'win_rate': worst_hour['win_rate'],
            'total_pnl': worst_hour['total_pnl']
        },
        recommended_skill="fade-strategy, time-based-filter",
        expected_recovery=expected_recovery
    )


def detect_session_issues(trades: list[Trade], metrics: AnalysisMetrics = None) -> Optional[ProblemPattern]:
    """
    Detect if PM session performs significantly worse than AM session.

    Args:
        trades: List of trades to analyze
        metrics: Analysis metrics for data-driven thresholds

    Returns:
        ProblemPattern if session disparity found, None otherwise
    """
    # Data-driven severity thresholds
    avg_trade = abs(metrics.avg_trade) if metrics else 200
    high_threshold = avg_trade * 15
    med_threshold = avg_trade * 5

    am_trades = []  # 9 AM - 12 PM
    pm_trades = []  # 1 PM - 4 PM

    for t in trades:
        hour = t.entry_time.hour
        if 9 <= hour < 12:
            am_trades.append(t)
        elif 13 <= hour < 16:
            pm_trades.append(t)

    if len(am_trades) < 5 or len(pm_trades) < 5:
        return None

    am_wins = sum(1 for t in am_trades if t.profit > 0)
    pm_wins = sum(1 for t in pm_trades if t.profit > 0)

    am_win_rate = am_wins / len(am_trades) * 100
    pm_win_rate = pm_wins / len(pm_trades) * 100

    am_pnl = sum(t.profit for t in am_trades)
    pm_pnl = sum(t.profit for t in pm_trades)

    # Check if PM is significantly worse
    if pm_win_rate < am_win_rate - 20 and pm_pnl < 0:
        severity = "HIGH" if abs(pm_pnl) > high_threshold else "MEDIUM" if abs(pm_pnl) > med_threshold else "LOW"

        return ProblemPattern(
            pattern_type="session_issue",
            severity=severity,
            impact=pm_pnl,
            trades_affected=[t.trade_number for t in pm_trades if t.profit < 0],
            description=f"PM session ({pm_win_rate:.0f}% WR) underperforms AM ({am_win_rate:.0f}% WR)",
            details={
                'am_trades': len(am_trades),
                'am_win_rate': am_win_rate,
                'am_pnl': am_pnl,
                'pm_trades': len(pm_trades),
                'pm_win_rate': pm_win_rate,
                'pm_pnl': pm_pnl
            },
            recommended_skill="session-exit-filter",
            expected_recovery=abs(pm_pnl)
        )

    return None


def detect_loss_streaks(trades: list[Trade], max_acceptable: int = 5) -> Optional[ProblemPattern]:
    """
    Detect significant loss streaks that suggest systemic issues.

    Args:
        trades: List of trades to analyze
        max_acceptable: Streak length above this is a problem (default 5)

    Returns:
        ProblemPattern if significant streaks found, None otherwise
    """
    streaks = []
    current_streak_trades = []
    current_streak_loss = 0

    for t in trades:
        if t.profit < 0:
            current_streak_trades.append(t)
            current_streak_loss += t.profit
        else:
            if len(current_streak_trades) >= 3:
                streaks.append({
                    'length': len(current_streak_trades),
                    'trades': [tt.trade_number for tt in current_streak_trades],
                    'loss': current_streak_loss
                })
            current_streak_trades = []
            current_streak_loss = 0

    # Handle streak at end
    if len(current_streak_trades) >= 3:
        streaks.append({
            'length': len(current_streak_trades),
            'trades': [tt.trade_number for tt in current_streak_trades],
            'loss': current_streak_loss
        })

    if not streaks:
        return None

    max_streak = max(streaks, key=lambda s: s['length'])

    if max_streak['length'] <= max_acceptable:
        return None

    total_streak_loss = sum(s['loss'] for s in streaks)
    severity = "HIGH" if max_streak['length'] >= 8 else "MEDIUM" if max_streak['length'] >= 5 else "LOW"

    return ProblemPattern(
        pattern_type="loss_streak",
        severity=severity,
        impact=total_streak_loss,
        trades_affected=max_streak['trades'],
        description=f"Max loss streak of {max_streak['length']} trades (${abs(max_streak['loss']):,.0f} lost)",
        details={
            'max_streak_length': max_streak['length'],
            'max_streak_loss': max_streak['loss'],
            'all_streaks': streaks,
            'avg_streak_length': sum(s['length'] for s in streaks) / len(streaks)
        },
        recommended_skill="daily-loss-limit, max-trades-per-day",
        expected_recovery=abs(total_streak_loss) * 0.3  # 30% recovery by cutting streaks
    )


def detect_all_problems(trades: list[Trade], metrics: AnalysisMetrics = None) -> list[ProblemPattern]:
    """
    Run all problem detection algorithms and return sorted list.

    Args:
        trades: List of trades to analyze
        metrics: Analysis metrics for data-driven thresholds

    Returns:
        List of ProblemPatterns sorted by severity and impact
    """
    problems = []

    # Run all detectors with metrics for data-driven thresholds
    mfe_problem = detect_mfe_reversals(trades, metrics)
    if mfe_problem:
        problems.append(mfe_problem)

    time_problem = detect_time_clusters(trades, metrics)
    if time_problem:
        problems.append(time_problem)

    session_problem = detect_session_issues(trades, metrics)
    if session_problem:
        problems.append(session_problem)

    streak_problem = detect_loss_streaks(trades)
    if streak_problem:
        problems.append(streak_problem)

    # Sort by severity (HIGH first) then by impact
    severity_order = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
    problems.sort(key=lambda p: (severity_order.get(p.severity, 3), p.impact))

    return problems


def generate_iteration_report(trades: list[Trade], metrics: AnalysisMetrics) -> dict:
    """
    Generate a complete iteration analysis report for the strategy-iterator agent.

    Returns:
        Dict containing analysis summary, problems, and recommendations
    """
    problems = detect_all_problems(trades, metrics)

    report = {
        'analysis_summary': {
            'total_trades': metrics.total_trades,
            'win_rate': metrics.win_rate,
            'profit_factor': metrics.profit_factor,
            'total_profit': metrics.total_profit,
            'max_drawdown': metrics.max_drawdown,
            'avg_trade': metrics.avg_trade
        },
        'problems_identified': [
            {
                'rank': i + 1,
                'pattern': p.pattern_type,
                'severity': p.severity,
                'impact': p.impact,
                'trades_affected': len(p.trades_affected),
                'description': p.description,
                'details': p.details,
                'recommended_skill': p.recommended_skill,
                'expected_recovery': p.expected_recovery
            }
            for i, p in enumerate(problems)
        ],
        'total_expected_improvement': sum(p.expected_recovery for p in problems),
        'recommendation_summary': {
            p.pattern_type: {
                'skill': p.recommended_skill,
                'expected_recovery': p.expected_recovery
            }
            for p in problems
        }
    }

    return report


def generate_recommendations(
    metrics: AnalysisMetrics,
    time_analysis: TimeAnalysis,
    duration_analysis: DurationAnalysis
) -> Recommendations:
    """Generate optimization recommendations based on analysis"""

    filters = {}
    params = {}
    notes = []

    # Duration filter recommendation
    quick = duration_analysis.quick_trades
    long = duration_analysis.long_trades

    if quick['win_rate'] < 10 and long['win_rate'] > 20:
        filters['min_hold_bars'] = 10
        notes.append(f"Quick trades (1-5 bars) have {quick['win_rate']:.1f}% win rate vs {long['win_rate']:.1f}% for long trades (16+ bars)")

    # Time-based filter recommendations
    best_hours = []
    worst_hours = []
    for hour, stats in time_analysis.by_hour.items():
        if stats['trades'] >= 5:  # Minimum sample size
            if stats['total_pnl'] > 0:
                best_hours.append((hour, stats['total_pnl']))
            else:
                worst_hours.append((hour, stats['total_pnl']))

    if best_hours:
        best_hours.sort(key=lambda x: x[1], reverse=True)
        filters['focus_hours'] = [h[0] for h in best_hours[:2]]
        notes.append(f"Best performing hours: {', '.join(str(h[0]) for h in best_hours[:3])}")

    # Day-of-week filter
    losing_days = []
    for dow, stats in time_analysis.by_day_of_week.items():
        if stats['trades'] >= 5 and stats['total_pnl'] < -500:  # Significant losses
            losing_days.append(dow)

    if losing_days:
        filters['disable_days'] = losing_days
        notes.append(f"Days with significant losses: {', '.join(losing_days)}")

    # Loss streak limiter
    if metrics.max_consecutive_losses >= 10:
        filters['max_consecutive_losses'] = min(7, metrics.max_consecutive_losses // 3)
        notes.append(f"Max loss streak of {metrics.max_consecutive_losses} suggests adding streak limiter")

    # Parameter adjustments based on MAE/MFE
    if metrics.avg_mae_winners < metrics.avg_mae_losers * 0.5:
        notes.append(f"Winners have lower MAE (${metrics.avg_mae_winners:.0f}) than losers (${metrics.avg_mae_losers:.0f}) - entries are good")

    if metrics.avg_mfe > metrics.avg_win * 1.5:
        params['consider_trailing_stop'] = True
        notes.append(f"Avg MFE (${metrics.avg_mfe:.0f}) exceeds avg win (${metrics.avg_win:.0f}) - leaving profit on table")

    return Recommendations(
        filters_to_add=filters,
        parameter_adjustments=params,
        analysis_notes=notes
    )


def print_report(
    metrics: AnalysisMetrics,
    time_analysis: TimeAnalysis,
    duration_analysis: DurationAnalysis,
    recommendations: Recommendations
):
    """Print formatted analysis report"""

    print("\n" + "="*60)
    print("BACKTEST ANALYSIS REPORT")
    print("="*60)

    print("\n--- PERFORMANCE SUMMARY ---")
    print(f"Total Trades:     {metrics.total_trades}")
    print(f"Win Rate:         {metrics.win_rate:.1f}% ({metrics.winning_trades} wins)")
    print(f"Loss Rate:        {metrics.loss_rate:.1f}% ({metrics.losing_trades} losses)")
    print(f"Breakeven:        {metrics.breakeven_trades}")

    print(f"\nTotal Profit:     ${metrics.total_profit:,.2f}")
    print(f"Gross Profit:     ${metrics.gross_profit:,.2f}")
    print(f"Gross Loss:       ${metrics.gross_loss:,.2f}")
    print(f"Profit Factor:    {metrics.profit_factor:.2f}")

    print(f"\nAvg Trade:        ${metrics.avg_trade:,.2f}")
    print(f"Avg Winner:       ${metrics.avg_win:,.2f}")
    print(f"Avg Loser:        ${metrics.avg_loss:,.2f}")
    print(f"Win/Loss Ratio:   {metrics.win_loss_ratio:.2f}x")

    print(f"\nMax Drawdown:     ${metrics.max_drawdown:,.2f}")

    print("\n--- DURATION ANALYSIS ---")
    for name, data in [
        ('Quick (1-5 bars)', duration_analysis.quick_trades),
        ('Medium (6-15 bars)', duration_analysis.medium_trades),
        ('Long (16+ bars)', duration_analysis.long_trades)
    ]:
        print(f"{name:20} | Trades: {data['trades']:3} | Win%: {data['win_rate']:5.1f}% | P&L: ${data['total_pnl']:>10,.2f}")

    print("\n--- HOUR ANALYSIS ---")
    for hour in sorted(time_analysis.by_hour.keys()):
        stats = time_analysis.by_hour[hour]
        if stats['trades'] >= 3:
            print(f"Hour {hour:02d}:00  | Trades: {stats['trades']:3} | Win%: {stats['win_rate']:5.1f}% | P&L: ${stats['total_pnl']:>10,.2f}")

    print("\n--- DAY OF WEEK ANALYSIS ---")
    day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    for dow in day_order:
        if dow in time_analysis.by_day_of_week:
            stats = time_analysis.by_day_of_week[dow]
            print(f"{dow:12} | Trades: {stats['trades']:3} | Win%: {stats['win_rate']:5.1f}% | P&L: ${stats['total_pnl']:>10,.2f}")

    print("\n--- LOSS STREAK ANALYSIS ---")
    print(f"Max Consecutive Losses: {metrics.max_consecutive_losses}")
    print(f"Avg Loss Streak:        {metrics.avg_loss_streak:.1f}")

    print("\n--- MAE/MFE ANALYSIS ---")
    print(f"Avg MAE (All):      ${metrics.avg_mae:,.2f}")
    print(f"Avg MAE (Winners):  ${metrics.avg_mae_winners:,.2f}")
    print(f"Avg MAE (Losers):   ${metrics.avg_mae_losers:,.2f}")
    print(f"Avg MFE:            ${metrics.avg_mfe:,.2f}")

    print("\n" + "="*60)
    print("RECOMMENDATIONS")
    print("="*60)

    if recommendations.filters_to_add:
        print("\nFilters to Add:")
        for key, value in recommendations.filters_to_add.items():
            print(f"  - {key}: {value}")

    if recommendations.parameter_adjustments:
        print("\nParameter Adjustments:")
        for key, value in recommendations.parameter_adjustments.items():
            print(f"  - {key}: {value}")

    print("\nAnalysis Notes:")
    for note in recommendations.analysis_notes:
        print(f"  - {note}")

    print("\n" + "="*60)


def save_recommendations(
    recommendations: Recommendations,
    metrics: AnalysisMetrics,
    output_path: str
):
    """Save recommendations to JSON file"""
    data = {
        'recommendations': {
            'filters_to_add': recommendations.filters_to_add,
            'parameter_adjustments': recommendations.parameter_adjustments,
            'analysis_notes': recommendations.analysis_notes
        },
        'metrics': {
            'total_trades': metrics.total_trades,
            'win_rate': metrics.win_rate,
            'profit_factor': metrics.profit_factor,
            'total_profit': metrics.total_profit,
            'max_drawdown': metrics.max_drawdown,
            'max_consecutive_losses': metrics.max_consecutive_losses,
            'avg_bars_held': metrics.avg_bars_held
        }
    }

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"\nRecommendations saved to: {output_path}")


def save_to_database(
    db_path: str,
    strategy_name: str,
    csv_path: str,
    recommendations: Recommendations,
    metrics: AnalysisMetrics
):
    """Save analysis run to SQLite database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create table if not exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS optimization_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            strategy_name TEXT NOT NULL,
            run_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            input_csv TEXT,
            recommendations_json TEXT,
            before_metrics TEXT,
            after_metrics TEXT,
            changes_applied TEXT,
            notes TEXT
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_opt_runs_strategy
        ON optimization_runs(strategy_name)
    ''')

    # Insert record
    cursor.execute('''
        INSERT INTO optimization_runs
        (strategy_name, input_csv, recommendations_json, before_metrics)
        VALUES (?, ?, ?, ?)
    ''', (
        strategy_name,
        csv_path,
        json.dumps({
            'filters_to_add': recommendations.filters_to_add,
            'parameter_adjustments': recommendations.parameter_adjustments,
            'analysis_notes': recommendations.analysis_notes
        }),
        json.dumps({
            'total_trades': metrics.total_trades,
            'win_rate': metrics.win_rate,
            'profit_factor': metrics.profit_factor,
            'total_profit': metrics.total_profit,
            'max_drawdown': metrics.max_drawdown,
            'max_consecutive_losses': metrics.max_consecutive_losses
        })
    ))

    conn.commit()
    run_id = cursor.lastrowid
    conn.close()

    print(f"\nSaved to database (run_id: {run_id})")
    return run_id


def main():
    parser = argparse.ArgumentParser(
        description='Analyze NinjaTrader backtest CSV and generate optimization recommendations'
    )
    parser.add_argument('csv_path', help='Path to NinjaTrader Grid CSV export')
    parser.add_argument('--output', '-o', help='Output path for recommendations JSON')
    parser.add_argument('--db', default='data/builder.db', help='SQLite database path')
    parser.add_argument('--strategy', default='Unknown', help='Strategy name for database logging')
    parser.add_argument('--no-db', action='store_true', help='Skip database logging')
    parser.add_argument('--iterate', action='store_true',
                        help='Generate iteration report for strategy-iterator agent (detects MFE reversals, time clusters, etc.)')

    args = parser.parse_args()

    # Load trades
    print(f"Loading trades from: {args.csv_path}")
    trades = load_trades_from_csv(args.csv_path)
    print(f"Loaded {len(trades)} trades")

    if not trades:
        print("No trades found in CSV file")
        return

    # Extract strategy name from first trade if not provided
    strategy_name = args.strategy
    if strategy_name == 'Unknown' and trades:
        strategy_name = trades[0].strategy

    # Run analysis
    metrics = calculate_metrics(trades)
    time_analysis = analyze_by_time(trades)
    duration_analysis = analyze_by_duration(trades)
    recommendations = generate_recommendations(metrics, time_analysis, duration_analysis)

    # Print report
    print_report(metrics, time_analysis, duration_analysis, recommendations)

    # Generate and print iteration report if requested
    if args.iterate:
        iteration_report = generate_iteration_report(trades, metrics)
        print("\n" + "=" * 60)
        print("STRATEGY ITERATION ANALYSIS")
        print("=" * 60)

        if iteration_report['problems_identified']:
            print("\n--- PROBLEMS IDENTIFIED ---")
            for prob in iteration_report['problems_identified']:
                severity_marker = "[HIGH]" if prob['severity'] == 'HIGH' else "[MED]" if prob['severity'] == 'MEDIUM' else "[LOW]"
                print(f"\n{severity_marker} #{prob['rank']}: {prob['pattern'].upper()}")
                print(f"   Impact: ${abs(prob['impact']):,.2f}")
                print(f"   Trades Affected: {prob['trades_affected']}")
                print(f"   {prob['description']}")
                print(f"   Recommended Skill: {prob['recommended_skill']}")
                print(f"   Expected Recovery: ${prob['expected_recovery']:,.2f}")

            print(f"\n--- TOTAL EXPECTED IMPROVEMENT: ${iteration_report['total_expected_improvement']:,.2f} ---")
        else:
            print("\n[OK] No significant problems detected. Strategy performing well.")

        # Save iteration report
        iteration_path = args.csv_path.replace('.csv', '_iteration_report.json')
        with open(iteration_path, 'w') as f:
            json.dump(iteration_report, f, indent=2)
        print(f"\nIteration report saved to: {iteration_path}")

    # Save recommendations JSON
    output_path = args.output or args.csv_path.replace('.csv', '_recommendations.json')
    save_recommendations(recommendations, metrics, output_path)

    # Save to database
    if not args.no_db:
        db_path = Path(args.db)
        if db_path.exists() or db_path.parent.exists():
            save_to_database(str(db_path), strategy_name, args.csv_path, recommendations, metrics)

    return recommendations


if __name__ == '__main__':
    main()

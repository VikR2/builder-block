#!/usr/bin/env python3
"""
Strategy Enhancer - Add ERL/IRL and Premium/Discount Zone Logic

V3: Added ERL/IRL, Premium/Discount zones, MinReversalStage
V4: Fixed dynamic target bug, added strong short bias, HTF alignment, session targets

USAGE:
    # Create V3 from V2
    python scripts/strategy_enhancer.py \\
        --strategy scripts-output/Strategies/TTradesReversalV2Strategy.cs \\
        --output scripts-output/Strategies/TTradesReversalV3Strategy.cs

    # Create V4 from V2 (recommended - includes all fixes)
    python scripts/strategy_enhancer.py \\
        --strategy scripts-output/Strategies/TTradesReversalV2Strategy.cs \\
        --output scripts-output/Strategies/TTradesReversalV4Strategy.cs \\
        --version v4
"""

import argparse
import re
from pathlib import Path


def enhance_strategy(strategy_path: str, output_path: str):
    """Enhance strategy with ERL/IRL and Premium/Discount logic"""

    code = Path(strategy_path).read_text(encoding='utf-8')
    changes = []

    # 1. Update strategy name
    code = re.sub(
        r'class TtradesReversalV2Strategy',
        'class TtradesReversalV3Strategy',
        code
    )
    code = re.sub(
        r'Name = "TtradesReversalV2"',
        'Name = "TtradesReversalV3"',
        code
    )
    changes.append("Updated strategy name to V3")

    # 2. Add new variables for ERL/IRL tracking
    new_vars = '''
        // ERL/IRL Tracking (External/Internal Range Liquidity)
        private bool inPremiumZone;   // Above equilibrium
        private bool inDiscountZone;  // Below equilibrium
        private double erlTarget;     // External Range Liquidity target (PDH/PDL)
        private double irlLevel;      // Internal Range Liquidity level (range EQ)
'''
    # Insert after existing variables
    pattern = r'(private int fvgDirection;.*?#endregion)'
    code = re.sub(pattern, r'\1' + new_vars, code, flags=re.DOTALL)
    changes.append("Added ERL/IRL tracking variables")

    # 3. Add Premium/Discount zone property
    new_property = '''
        // Premium/Discount Zone Filter
        [NinjaScriptProperty]
        [Display(Name = "Use Premium/Discount Zones", Order = 10, GroupName = "5. Optimization Filters")]
        public bool UsePremiumDiscountZones { get; set; }

        // Dynamic Targets (PDH/PDL)
        [NinjaScriptProperty]
        [Display(Name = "Use Dynamic Targets (PDH/PDL)", Order = 11, GroupName = "5. Optimization Filters")]
        public bool UseDynamicTargets { get; set; }

        // Minimum Reversal Stage
        [NinjaScriptProperty]
        [Range(1, 5)]
        [Display(Name = "Minimum Reversal Stage", Order = 12, GroupName = "5. Optimization Filters")]
        public int MinReversalStage { get; set; }
'''
    # Find Properties region and add
    pattern = r'(#region Properties.*?)(#endregion)'
    match = re.search(pattern, code, re.DOTALL)
    if match:
        insert_pos = match.start(2)
        code = code[:insert_pos] + new_property + '\n        ' + code[insert_pos:]
        changes.append("Added Premium/Discount and Dynamic Target properties")

    # 4. Add default values in SetDefaults
    defaults = '''
                // ERL/IRL and Zone Defaults
                UsePremiumDiscountZones = true;
                UseDynamicTargets = true;
                MinReversalStage = 2;
'''
    pattern = r'(EnableDebug = true;)'
    code = re.sub(pattern, r'\1\n' + defaults, code)
    changes.append("Set defaults for new properties")

    # 5. Add Premium/Discount zone calculation after range is set
    zone_calc = '''
            // Calculate Premium/Discount zones based on range equilibrium
            if (rangeSet && equilibrium > 0)
            {
                inPremiumZone = Close[0] > equilibrium;
                inDiscountZone = Close[0] < equilibrium;
                irlLevel = equilibrium;
            }
'''
    # Insert after range finalization
    pattern = r'(rangeSet = true;.*?if \(EnableDebug\) Print.*?ticks\)";.*?\})'
    code = re.sub(pattern, r'\1\n' + zone_calc, code, flags=re.DOTALL)
    changes.append("Added Premium/Discount zone calculation")

    # 6. Add zone filter before entry logic
    zone_filter = '''
            // Premium/Discount Zone Filter - Only long in discount, short in premium
            if (UsePremiumDiscountZones && equilibrium > 0)
            {
                if (tradeDirection == 1 && inPremiumZone)
                {
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP LONG: In premium zone (above EQ)");
                    tradeDirection = 0;  // Cancel long signal
                }
                if (tradeDirection == -1 && inDiscountZone)
                {
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP SHORT: In discount zone (below EQ)");
                    tradeDirection = 0;  // Cancel short signal
                }
            }
'''
    # Insert before entry execution
    pattern = r'(//------------------------------------------------------------------\s*// ENTRY EXECUTION)'
    code = re.sub(pattern, zone_filter + r'\n            \1', code)
    changes.append("Added Premium/Discount zone filter")

    # 7. Update reversal stage requirement
    code = re.sub(
        r'bool entryAllowed = reversalStage >= 1;',
        'bool entryAllowed = reversalStage >= MinReversalStage;',
        code
    )
    changes.append("Updated reversal stage requirement to use MinReversalStage")

    # 8. Add dynamic target calculation (use PDH/PDL)
    dynamic_target = '''
                    // Calculate dynamic target using ERL (PDH/PDL)
                    if (UseDynamicTargets && previousDayHigh > 0 && previousDayLow > 0)
                    {
                        if (tradeDirection == 1)
                        {
                            // Long target: Previous Day High (ERL)
                            erlTarget = previousDayHigh;
                            double dynamicTP = Math.Min(erlTarget, Close[0] + (TakeProfitTicks * TickSize));
                            takeProfit = dynamicTP;
                            if (EnableDebug) Print("Dynamic TP (PDH): " + erlTarget.ToString("F2") + " | Using: " + takeProfit.ToString("F2"));
                        }
                        else
                        {
                            // Short target: Previous Day Low (ERL)
                            erlTarget = previousDayLow;
                            double dynamicTP = Math.Max(erlTarget, Close[0] - (TakeProfitTicks * TickSize));
                            takeProfit = dynamicTP;
                            if (EnableDebug) Print("Dynamic TP (PDL): " + erlTarget.ToString("F2") + " | Using: " + takeProfit.ToString("F2"));
                        }
                    }
                    else
                    {
                        takeProfit = tradeDirection == 1
                            ? Close[0] + (TakeProfitTicks * TickSize)
                            : Close[0] - (TakeProfitTicks * TickSize);
                    }
'''
    # Replace fixed takeProfit calculation
    pattern = r'takeProfit = tradeDirection == 1\s*\? Close\[0\] \+ \(TakeProfitTicks \* TickSize\)\s*: Close\[0\] - \(TakeProfitTicks \* TickSize\);'
    code = re.sub(pattern, dynamic_target.strip(), code)
    changes.append("Added dynamic ERL-based targets (PDH/PDL)")

    # 9. Reset ERL/IRL variables in ResetDailyState
    reset_vars = '''
            // ERL/IRL reset
            inPremiumZone = false;
            inDiscountZone = false;
            erlTarget = 0.0;
            irlLevel = 0.0;
'''
    pattern = r'(// FVG tracking reset)'
    code = re.sub(pattern, reset_vars + r'\n            \1', code)
    changes.append("Added ERL/IRL reset in ResetDailyState")

    # Write enhanced strategy
    Path(output_path).write_text(code, encoding='utf-8')

    print(f"\nEnhanced strategy written to: {output_path}")
    print("\nChanges made:")
    for change in changes:
        print(f"  - {change}")

    print("\n" + "="*60)
    print("NEW FEATURES IN V3")
    print("="*60)
    print("""
1. PREMIUM/DISCOUNT ZONES (UsePremiumDiscountZones = true)
   - Longs only allowed BELOW equilibrium (discount zone)
   - Shorts only allowed ABOVE equilibrium (premium zone)
   - Prevents entering at worst prices

2. DYNAMIC TARGETS (UseDynamicTargets = true)
   - Long target: Previous Day High (ERL - External Range Liquidity)
   - Short target: Previous Day Low (ERL)
   - Falls back to TakeProfitTicks if PDH/PDL not available

3. MINIMUM REVERSAL STAGE (MinReversalStage = 2)
   - Requires at least Stage 2 (sweep + FVG inversion) for entry
   - Stage 1 alone (just sweep) no longer triggers entry
   - Higher stages = higher probability setups

4. IRL TRACKING (Internal Range Liquidity)
   - Opening range equilibrium as key support/resistance
   - Premium/Discount determined by position relative to IRL
""")

    return output_path


def enhance_to_v4(strategy_path: str, output_path: str):
    """
    Create V4 strategy with all bug fixes:
    1. Fixed dynamic target logic (PDH/PDL direction guard)
    2. Strong short bias requirement
    3. HTF alignment check
    4. Session range targets for intraday (Asia/London highs/lows)
    """
    code = Path(strategy_path).read_text(encoding='utf-8')
    changes = []

    # 1. Update strategy name to V4
    # IMPORTANT: Only replace the strategy Name property, NOT Display(Name=...) attributes!
    # Use negative lookbehind to avoid matching Display attribute names
    code = re.sub(r'class Ttrades\w+Strategy', 'class TtradesReversalV4Strategy', code)
    code = re.sub(r'(?<!\()Name = "TtradesReversalV[23]"', 'Name = "TtradesReversalV4"', code)
    changes.append("Updated strategy name to V4")

    # 2. Add V4-specific variables including Asia/London session tracking
    # ONLY add if not already present (prevents duplicates when running on V3+ code)
    if 'private bool strongShortBias;' not in code:
        v4_vars = '''
        // V4: Enhanced bias and target tracking
        private bool strongShortBias;     // True when short conditions are confirmed
        private bool htfAligned;          // Higher timeframe alignment
        private double sessionTargetTicks; // Intraday target based on session range

        // V4: Asia/London Session Tracking (for smarter intraday targets)
        private double asiaSessionHigh;   // Asia session high (20:00-02:00 ET)
        private double asiaSessionLow;    // Asia session low
        private double londonSessionHigh; // London session high (03:00-08:00 ET)
        private double londonSessionLow;  // London session low
        private bool asiaSessionSet;      // Asia session complete
        private bool londonSessionSet;    // London session complete

        // V4: Track if session levels were "taken" (price traded through)
        private bool asiaHighTaken;       // Price broke above Asia high
        private bool asiaLowTaken;        // Price broke below Asia low
        private bool londonHighTaken;     // Price broke above London high
        private bool londonLowTaken;      // Price broke below London low

        // V4: Hourly High/Low for fallback targets
        private double currentHourHigh;   // Current hour's high
        private double currentHourLow;    // Current hour's low
        private double prevHourHigh;      // Previous hour's high
        private double prevHourLow;       // Previous hour's low
        private int lastHour;             // Track hour changes
'''
        # Insert after ERL/IRL variables if they exist, otherwise after fvgDirection
        if 'private double irlLevel;' in code:
            code = code.replace('private double irlLevel;', 'private double irlLevel;' + v4_vars)
        else:
            pattern = r'(private int fvgDirection;.*?#endregion)'
            code = re.sub(pattern, r'\1' + v4_vars, code, flags=re.DOTALL)
        changes.append("Added V4 tracking variables")
    else:
        changes.append("V4 tracking variables already present - skipped")

    # 3. Add V4 properties including Asia/London session settings
    # ONLY add if not already present (prevents duplicates when running on V3+ code)
    if 'public bool RequireStrongShortBias' not in code:
        v4_properties = '''
        // V4: Strong Short Bias Filter
        [NinjaScriptProperty]
        [Display(Name = "Require Strong Short Bias", Order = 13, GroupName = "5. Optimization Filters")]
        public bool RequireStrongShortBias { get; set; }

        // V4: Higher Timeframe Alignment
        [NinjaScriptProperty]
        [Display(Name = "Require HTF Alignment", Order = 14, GroupName = "5. Optimization Filters")]
        public bool RequireHTFAlignment { get; set; }

        // V4: Session Range Targets (Asia/London)
        [NinjaScriptProperty]
        [Display(Name = "Use Session Levels (Asia/London)", Order = 15, GroupName = "5. Optimization Filters")]
        public bool UseSessionLevelTargets { get; set; }

        // V4: Asia Session Time (ET) - typically 20:00-02:00
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Asia Session Start Hour", Order = 16, GroupName = "6. Session Times")]
        public int AsiaStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Asia Session End Hour", Order = 17, GroupName = "6. Session Times")]
        public int AsiaEndHour { get; set; }

        // V4: London Session Time (ET) - typically 03:00-08:00
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "London Session Start Hour", Order = 18, GroupName = "6. Session Times")]
        public int LondonStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "London Session End Hour", Order = 19, GroupName = "6. Session Times")]
        public int LondonEndHour { get; set; }

'''
        # Find the last property before #endregion in Properties region
        pattern = r'(public int MinReversalStage \{ get; set; \})'
        if re.search(pattern, code):
            code = re.sub(pattern, r'\1\n' + v4_properties, code)
        else:
            # Fallback: insert before #endregion in Properties
            pattern = r'(#region Properties.*?)(#endregion)'
            match = re.search(pattern, code, re.DOTALL)
            if match:
                insert_pos = match.start(2)
                code = code[:insert_pos] + v4_properties + code[insert_pos:]
        changes.append("Added V4 properties (StrongShortBias, HTFAlignment, SessionRangeTargets)")
    else:
        changes.append("V4 properties already present - skipped")

    # 4. Add V4 defaults including Asia/London session times
    # ONLY add if not already present (prevents duplicates when running on V3+ code)
    if 'RequireStrongShortBias = true;' not in code:
        v4_defaults = '''
                // V4 Defaults
                RequireStrongShortBias = true;
                RequireHTFAlignment = true;
                UseSessionLevelTargets = true;

                // Asia Session (ET): 20:00-02:00 (overnight)
                AsiaStartHour = 20;
                AsiaEndHour = 2;

                // London Session (ET): 03:00-08:00
                LondonStartHour = 3;
                LondonEndHour = 8;
'''
        # Insert after MinReversalStage default
        if 'MinReversalStage = 2;' in code:
            code = code.replace('MinReversalStage = 2;', 'MinReversalStage = 2;' + v4_defaults)
        else:
            pattern = r'(EnableDebug = true;)'
            code = re.sub(pattern, r'\1\n' + v4_defaults, code)
        changes.append("Set V4 defaults")
    else:
        changes.append("V4 defaults already present - skipped")

    # 5. FIX: Dynamic target logic - add direction guard
    # Replace the broken dynamic target calculation
    broken_dynamic_target = r'''// Calculate dynamic target using ERL \(PDH/PDL\)
                    if \(UseDynamicTargets && previousDayHigh > 0 && previousDayLow > 0\)
                    \{
                        if \(tradeDirection == 1\)
                        \{
                            // Long target: Previous Day High \(ERL\)
                            erlTarget = previousDayHigh;
                            double dynamicTP = Math\.Min\(erlTarget, Close\[0\] \+ \(TakeProfitTicks \* TickSize\)\);
                            takeProfit = dynamicTP;
                            if \(EnableDebug\) Print\("Dynamic TP \(PDH\): " \+ erlTarget\.ToString\("F2"\) \+ " \| Using: " \+ takeProfit\.ToString\("F2"\)\);
                        \}
                        else
                        \{
                            // Short target: Previous Day Low \(ERL\)
                            erlTarget = previousDayLow;
                            double dynamicTP = Math\.Max\(erlTarget, Close\[0\] - \(TakeProfitTicks \* TickSize\)\);
                            takeProfit = dynamicTP;
                            if \(EnableDebug\) Print\("Dynamic TP \(PDL\): " \+ erlTarget\.ToString\("F2"\) \+ " \| Using: " \+ takeProfit\.ToString\("F2"\)\);
                        \}
                    \}
                    else
                    \{
                        takeProfit = tradeDirection == 1
                            \? Close\[0\] \+ \(TakeProfitTicks \* TickSize\)
                            : Close\[0\] - \(TakeProfitTicks \* TickSize\);
                    \}'''

    fixed_dynamic_target = '''// V4 FIXED: Calculate dynamic target with direction guard and Asia/London session levels
                    double fixedTP = tradeDirection == 1
                        ? Close[0] + (TakeProfitTicks * TickSize)
                        : Close[0] - (TakeProfitTicks * TickSize);

                    // V4: Determine best session level target (Asia/London highs/lows, or hourly fallback)
                    double sessionLevelTarget = 0;
                    string targetSource = "Fixed";

                    if (UseSessionLevelTargets)
                    {
                        if (tradeDirection == 1)  // Long - look for resistance levels above
                        {
                            // Priority: London High (if not taken) > Asia High (if not taken) > Prev Hour High
                            if (londonSessionSet && !londonHighTaken && londonSessionHigh > Close[0])
                            {
                                sessionLevelTarget = londonSessionHigh;
                                targetSource = "LondonH";
                            }
                            else if (asiaSessionSet && !asiaHighTaken && asiaSessionHigh > Close[0])
                            {
                                sessionLevelTarget = asiaSessionHigh;
                                targetSource = "AsiaH";
                            }
                            else if (prevHourHigh > Close[0])
                            {
                                // Fallback to previous hour high for better R:R
                                sessionLevelTarget = prevHourHigh;
                                targetSource = "PrevHourH";
                            }
                        }
                        else  // Short - look for support levels below
                        {
                            // Priority: London Low (if not taken) > Asia Low (if not taken) > Prev Hour Low
                            if (londonSessionSet && !londonLowTaken && londonSessionLow < Close[0] && londonSessionLow > 0)
                            {
                                sessionLevelTarget = londonSessionLow;
                                targetSource = "LondonL";
                            }
                            else if (asiaSessionSet && !asiaLowTaken && asiaSessionLow < Close[0] && asiaSessionLow > 0)
                            {
                                sessionLevelTarget = asiaSessionLow;
                                targetSource = "AsiaL";
                            }
                            else if (prevHourLow > 0 && prevHourLow < Close[0])
                            {
                                // Fallback to previous hour low for better R:R
                                sessionLevelTarget = prevHourLow;
                                targetSource = "PrevHourL";
                            }
                        }
                    }

                    if (UseDynamicTargets && previousDayHigh > 0 && previousDayLow > 0)
                    {
                        if (tradeDirection == 1)
                        {
                            // V4 FIX: Only use PDH if it's ABOVE entry (in profit direction)
                            if (previousDayHigh > Close[0])
                            {
                                erlTarget = previousDayHigh;
                                // Use closer of: PDH, fixed ticks
                                takeProfit = Math.Min(erlTarget, fixedTP);
                                // V4: Use Asia/London level if closer and valid
                                if (sessionLevelTarget > Close[0] && sessionLevelTarget < takeProfit)
                                    takeProfit = sessionLevelTarget;
                            }
                            else
                            {
                                // PDH is behind us - use session level or fixed ticks
                                if (sessionLevelTarget > Close[0])
                                    takeProfit = Math.Min(sessionLevelTarget, fixedTP);
                                else
                                    takeProfit = fixedTP;
                            }
                            if (EnableDebug) Print("V4 TP (Long): Source=" + targetSource +
                                " | PDH=" + previousDayHigh.ToString("F2") +
                                " | LondonH=" + londonSessionHigh.ToString("F2") + (londonHighTaken ? " (taken)" : "") +
                                " | AsiaH=" + asiaSessionHigh.ToString("F2") + (asiaHighTaken ? " (taken)" : "") +
                                " | PrevHourH=" + prevHourHigh.ToString("F2") +
                                " | Entry=" + Close[0].ToString("F2") + " | TP=" + takeProfit.ToString("F2"));
                        }
                        else
                        {
                            // V4 FIX: Only use PDL if it's BELOW entry (in profit direction)
                            if (previousDayLow < Close[0])
                            {
                                erlTarget = previousDayLow;
                                // Use closer of: PDL, fixed ticks
                                takeProfit = Math.Max(erlTarget, fixedTP);
                                // V4: Use Asia/London level if closer and valid
                                if (sessionLevelTarget > 0 && sessionLevelTarget < Close[0] && sessionLevelTarget > takeProfit)
                                    takeProfit = sessionLevelTarget;
                            }
                            else
                            {
                                // PDL is behind us - use session level or fixed ticks
                                if (sessionLevelTarget > 0 && sessionLevelTarget < Close[0])
                                    takeProfit = Math.Max(sessionLevelTarget, fixedTP);
                                else
                                    takeProfit = fixedTP;
                            }
                            if (EnableDebug) Print("V4 TP (Short): Source=" + targetSource +
                                " | PDL=" + previousDayLow.ToString("F2") +
                                " | LondonL=" + londonSessionLow.ToString("F2") + (londonLowTaken ? " (taken)" : "") +
                                " | AsiaL=" + asiaSessionLow.ToString("F2") + (asiaLowTaken ? " (taken)" : "") +
                                " | PrevHourL=" + prevHourLow.ToString("F2") +
                                " | Entry=" + Close[0].ToString("F2") + " | TP=" + takeProfit.ToString("F2"));
                        }
                    }
                    else
                    {
                        // No dynamic targets - use session level or fixed
                        if (sessionLevelTarget > 0)
                        {
                            if (tradeDirection == 1 && sessionLevelTarget > Close[0])
                                takeProfit = Math.Min(sessionLevelTarget, fixedTP);
                            else if (tradeDirection == -1 && sessionLevelTarget < Close[0])
                                takeProfit = Math.Max(sessionLevelTarget, fixedTP);
                            else
                                takeProfit = fixedTP;
                        }
                        else
                        {
                            takeProfit = fixedTP;
                        }
                    }'''

    # Try to replace the broken pattern
    if re.search(broken_dynamic_target, code, re.DOTALL):
        code = re.sub(broken_dynamic_target, fixed_dynamic_target, code, flags=re.DOTALL)
        changes.append("FIXED: Dynamic target direction guard (critical bug fix)")
    else:
        # Try simpler pattern for V2 base
        simple_pattern = r'takeProfit = tradeDirection == 1\s*\? Close\[0\] \+ \(TakeProfitTicks \* TickSize\)\s*: Close\[0\] - \(TakeProfitTicks \* TickSize\);'
        if re.search(simple_pattern, code):
            code = re.sub(simple_pattern, fixed_dynamic_target.strip(), code)
            changes.append("Added V4 dynamic target with direction guard")

    # 6. Add Strong Short Bias filter before entry
    strong_short_filter = '''
            // V4: Strong Short Bias Filter
            if (RequireStrongShortBias && tradeDirection == -1)
            {
                strongShortBias = false;

                // Condition 1: Previous day was bearish (closed below open)
                bool pdBearish = previousDayClose < previousDayOpen;

                // Condition 2: Price below yesterday's equilibrium
                double pdEQ = (previousDayHigh + previousDayLow) / 2.0;
                bool belowPDEQ = Close[0] < pdEQ;

                // Strong short: bearish PD + below EQ, OR sweep of PDH
                if ((pdBearish && belowPDEQ) || (High[0] >= previousDayHigh))
                    strongShortBias = true;

                if (!strongShortBias)
                {
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | V4 SKIP SHORT: Weak bias (PD bearish=" + pdBearish + ", belowEQ=" + belowPDEQ + ")");
                    tradeDirection = 0;
                }
            }

'''
    # Insert after Premium/Discount zone filter
    pattern = r'(// Premium/Discount Zone Filter.*?tradeDirection = 0;  // Cancel short signal\s*\}\s*\})'
    match = re.search(pattern, code, re.DOTALL)
    if match:
        insert_pos = match.end()
        code = code[:insert_pos] + '\n' + strong_short_filter + code[insert_pos:]
        changes.append("Added V4 Strong Short Bias filter")
    else:
        # Insert before entry execution
        pattern = r'(//------------------------------------------------------------------\s*// ENTRY EXECUTION)'
        code = re.sub(pattern, strong_short_filter + r'\1', code)
        changes.append("Added V4 Strong Short Bias filter")

    # 7. Add HTF Alignment filter
    htf_filter = '''
            // V4: Higher Timeframe Alignment Check
            if (RequireHTFAlignment && tradeDirection != 0)
            {
                htfAligned = false;

                if (tradeDirection == 1)  // Long setup
                {
                    // Daily: Price below PDH (room to run up)
                    bool dailyLongOK = Close[0] < previousDayHigh;
                    // Opening Range: Swept range low (liquidity taken)
                    bool orLongOK = lowSwept;
                    // Intraday: CISD confirmed
                    bool ltfLongOK = cisdConfirmed > 0;

                    htfAligned = dailyLongOK && orLongOK && ltfLongOK;
                }
                else if (tradeDirection == -1)  // Short setup
                {
                    // Daily: Price above PDL (room to run down)
                    bool dailyShortOK = Close[0] > previousDayLow;
                    // Opening Range: Swept range high (liquidity taken)
                    bool orShortOK = highSwept;
                    // Intraday: CISD confirmed
                    bool ltfShortOK = cisdConfirmed > 0;

                    htfAligned = dailyShortOK && orShortOK && ltfShortOK;
                }

                if (!htfAligned)
                {
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | V4 SKIP: No HTF alignment for " + (tradeDirection == 1 ? "LONG" : "SHORT"));
                    tradeDirection = 0;
                }
            }

'''
    # Insert after strong short filter
    pattern = r'(// V4: Strong Short Bias Filter.*?tradeDirection = 0;\s*\}\s*\})'
    match = re.search(pattern, code, re.DOTALL)
    if match:
        insert_pos = match.end()
        code = code[:insert_pos] + '\n' + htf_filter + code[insert_pos:]
        changes.append("Added V4 HTF Alignment filter")

    # 8. Add Asia/London session tracking logic in OnBarUpdate (after time windows)
    session_tracking = '''
            // V4: Track Hourly High/Low (for fallback targets)
            if (hour != lastHour)
            {
                // New hour - save previous hour's range
                prevHourHigh = currentHourHigh;
                prevHourLow = currentHourLow;
                currentHourHigh = High[0];
                currentHourLow = Low[0];
                lastHour = hour;
            }
            else
            {
                // Same hour - update current range
                currentHourHigh = Math.Max(currentHourHigh, High[0]);
                currentHourLow = Math.Min(currentHourLow, Low[0]);
            }

            // V4: Track Asia/London Session Highs/Lows
            bool inAsiaSession = false;
            bool inLondonSession = false;

            // Asia session spans overnight (e.g., 20:00-02:00)
            if (AsiaStartHour > AsiaEndHour)
                inAsiaSession = (hour >= AsiaStartHour || hour < AsiaEndHour);
            else
                inAsiaSession = (hour >= AsiaStartHour && hour < AsiaEndHour);

            // London session (e.g., 03:00-08:00)
            inLondonSession = (hour >= LondonStartHour && hour < LondonEndHour);

            // Track Asia session high/low
            if (inAsiaSession)
            {
                if (asiaSessionHigh == 0 || High[0] > asiaSessionHigh)
                    asiaSessionHigh = High[0];
                if (asiaSessionLow == 0 || Low[0] < asiaSessionLow)
                    asiaSessionLow = Low[0];
            }
            else if (!asiaSessionSet && asiaSessionHigh > 0)
            {
                asiaSessionSet = true;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | ASIA SESSION SET: H=" + asiaSessionHigh.ToString("F2") + " L=" + asiaSessionLow.ToString("F2"));
            }

            // Track London session high/low
            if (inLondonSession)
            {
                if (londonSessionHigh == 0 || High[0] > londonSessionHigh)
                    londonSessionHigh = High[0];
                if (londonSessionLow == 0 || Low[0] < londonSessionLow)
                    londonSessionLow = Low[0];
            }
            else if (!londonSessionSet && londonSessionHigh > 0 && hour >= LondonEndHour)
            {
                londonSessionSet = true;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | LONDON SESSION SET: H=" + londonSessionHigh.ToString("F2") + " L=" + londonSessionLow.ToString("F2"));
            }

            // V4: Check if session levels were "taken" (price traded through)
            if (asiaSessionSet && !asiaHighTaken && High[0] > asiaSessionHigh)
            {
                asiaHighTaken = true;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | ASIA HIGH TAKEN @ " + High[0].ToString("F2"));
            }
            if (asiaSessionSet && !asiaLowTaken && Low[0] < asiaSessionLow)
            {
                asiaLowTaken = true;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | ASIA LOW TAKEN @ " + Low[0].ToString("F2"));
            }
            if (londonSessionSet && !londonHighTaken && High[0] > londonSessionHigh)
            {
                londonHighTaken = true;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | LONDON HIGH TAKEN @ " + High[0].ToString("F2"));
            }
            if (londonSessionSet && !londonLowTaken && Low[0] < londonSessionLow)
            {
                londonLowTaken = true;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | LONDON LOW TAKEN @ " + Low[0].ToString("F2"));
            }

'''
    # Insert after time windows calculation
    pattern = r'(bool inSession = hour >= RangeStartHour && hour < SessionEndHour;)'
    if re.search(pattern, code):
        code = re.sub(pattern, r'\1\n' + session_tracking, code)
        changes.append("Added Asia/London session tracking logic")

    # 9. Reset V4 variables in ResetDailyState
    v4_reset = '''
            // V4 reset
            strongShortBias = false;
            htfAligned = false;
            sessionTargetTicks = 0;

            // V4: Reset Asia/London session tracking
            asiaSessionHigh = 0;
            asiaSessionLow = 0;
            londonSessionHigh = 0;
            londonSessionLow = 0;
            asiaSessionSet = false;
            londonSessionSet = false;

            // V4: Reset "taken" flags
            asiaHighTaken = false;
            asiaLowTaken = false;
            londonHighTaken = false;
            londonLowTaken = false;

            // V4: Reset hourly tracking
            currentHourHigh = 0;
            currentHourLow = 0;
            prevHourHigh = 0;
            prevHourLow = 0;
            lastHour = -1;
'''
    pattern = r'(// ERL/IRL reset)'
    if re.search(pattern, code):
        code = re.sub(pattern, v4_reset + r'\n            \1', code)
    else:
        pattern = r'(// FVG tracking reset)'
        code = re.sub(pattern, v4_reset + r'\n            \1', code)
    changes.append("Added V4 variable reset")

    # Write V4 strategy
    Path(output_path).write_text(code, encoding='utf-8')

    print(f"\nV4 Enhanced strategy written to: {output_path}")
    print("\nChanges made:")
    for change in changes:
        print(f"  - {change}")

    print("\n" + "="*60)
    print("V4 ENHANCEMENTS (Bug Fixes + New Features)")
    print("="*60)
    print("""
1. FIXED: Dynamic Target Direction Guard (CRITICAL)
   - Long targets: Only use PDH if PDH > entry price
   - Short targets: Only use PDL if PDL < entry price
   - Eliminates "profit target" losses where target was behind entry

2. NEW: Strong Short Bias Filter (RequireStrongShortBias = true)
   - Requires bearish previous day + price below PD equilibrium
   - OR: Sweep of PDH (reversal at major level)
   - Skips low-probability shorts

3. NEW: HTF Alignment Check (RequireHTFAlignment = true)
   - Longs: Price below PDH + range low swept + CISD confirmed
   - Shorts: Price above PDL + range high swept + CISD confirmed
   - Ensures multi-timeframe confluence

4. NEW: Asia/London Session Level Targets (UseSessionLevelTargets = true)
   - Tracks Asia session (20:00-02:00 ET) high/low
   - Tracks London session (03:00-08:00 ET) high/low
   - Detects when levels are "taken" (price traded through)
   - Falls back to previous hour high/low for better R:R
   - Falls back to fixed ticks if no valid session level

SESSION TARGET HIERARCHY (smart fallback):
   Long Entry:  London High (if NOT taken) > Asia High (if NOT taken) > Prev Hour High > Fixed Ticks
   Short Entry: London Low (if NOT taken) > Asia Low (if NOT taken) > Prev Hour Low > Fixed Ticks

   "Taken" = price already broke through the level (no longer valid target)

EXPECTED IMPACT:
   - Eliminate profit-target losses (was biggest issue in V3)
   - Skip weak short setups (shorts were low probability)
   - Better directional accuracy (HTF alignment)
   - Realistic intraday targets (session-based liquidity levels)
""")

    return output_path


def main():
    parser = argparse.ArgumentParser(
        description='Enhance NinjaTrader strategy with ERL/IRL and Premium/Discount zones'
    )
    parser.add_argument('--strategy', '-s', required=True,
                        help='Path to source strategy .cs file')
    parser.add_argument('--output', '-o',
                        help='Output path for enhanced strategy')
    parser.add_argument('--version', '-v', choices=['v3', 'v4'], default='v4',
                        help='Version to generate (v3 or v4, default: v4)')

    args = parser.parse_args()

    output_path = args.output
    if not output_path:
        strategy = Path(args.strategy)
        version_suffix = 'V4' if args.version == 'v4' else 'V3'
        # Handle both V2 and V3 input files
        stem = strategy.stem.replace('V2', version_suffix).replace('V3', version_suffix)
        output_path = str(strategy.parent / f"{stem}{strategy.suffix}")

    if args.version == 'v4':
        # First create V3, then enhance to V4
        v3_path = output_path.replace('V4', 'V3_temp')
        enhance_strategy(args.strategy, v3_path)
        enhance_to_v4(v3_path, output_path)
        # Clean up temp file
        Path(v3_path).unlink(missing_ok=True)
    else:
        enhance_strategy(args.strategy, output_path)


if __name__ == '__main__':
    main()

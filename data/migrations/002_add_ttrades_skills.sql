-- ============================================================================
-- TTrades Fractal Model Skills Migration
-- Source: https://ttrades.com/trading-education-center/ttfm/
-- Scraped: 2025-12-30
-- ============================================================================

-- ============================================================================
-- SKILL 1: Daily Bias (Mechanical Framework)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Daily Bias Determination (TTrades)',
  'ttrades-daily-bias',
  'Market Analysis',
  'TTrades-TTFM',
  'Mechanical framework for establishing daily directional bias. Each day price is either setting up for a reversal or preparing for a continuation. Reversal: Price trades into previous day high/low, forms shallow wick, CISD confirms, target equilibrium. Continuation: Previous day closes directionally, current day opens opposite, respects equilibrium, breaks previous extreme. Wick size is critical: small wick supports expansion, large wick does not.',
  '// Daily Bias Determination - TTrades Framework
// Reversal Setup: price trades into PDH/PDL, small wick, CISD confirms
// Continuation Setup: close in direction, open opposite, respect EQ, break extreme

bool isReversalSetup = false;
bool isContinuationSetup = false;

// Check for reversal: price into PDH/PDL with shallow wick
if (Low[0] <= previousDayLow && (High[0] - Close[0]) < (Close[0] - Low[0]) * 0.5)
    isReversalSetup = true; // Bullish reversal
if (High[0] >= previousDayHigh && (Close[0] - Low[0]) < (High[0] - Close[0]) * 0.5)
    isReversalSetup = true; // Bearish reversal

// Continuation: respects equilibrium, breaks extreme
double equilibrium = (previousDayHigh + previousDayLow) / 2.0;
if (previousDayClose > previousDayOpen && Low[0] > equilibrium)
    isContinuationSetup = true; // Bullish continuation',
  '["previousDayHigh", "previousDayLow", "previousDayClose", "previousDayOpen", "equilibrium", "wickSize"]',
  'medium',
  'swing, intraday',
  'daily, 4H',
  '["daily bias", "reversal", "continuation", "equilibrium", "wick size", "ttrades", "fractal model", "mechanical bias"]',
  '["Determine if today is reversal or continuation", "Trade with daily bias direction", "Filter setups against higher timeframe"]'
);

-- ============================================================================
-- SKILL 2: Protected Swings
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Protected Swings (TTrades)',
  'ttrades-protected-swings',
  'Entry Patterns',
  'TTrades-TTFM',
  'A protected swing is a high/low expected to hold if the current trend continues. Bullish: recent low stays intact while price advances. Bearish: recent high stays intact while price declines. Two formation methods: (1) Fair Value Gap entry with CISD closure, (2) Sweeping highs/lows with closure through opposing candles. Protected swings define stop placement, trend direction, and entry zones. Trade only in direction of protected swings.',
  '// Protected Swing Detection - TTrades Framework
// Method 1: From FVG - price enters FVG, closes through candle series
// Method 2: From Sweep - sweep low/high, close through opposing candles

bool protectedSwingBullish = false;
bool protectedSwingBearish = false;
double protectedSwingLevel = 0;

// Bullish: Sweep below low, then close above sequence of down-close candles
if (Low[0] < swingLow && Close[0] > downCloseSeriesHigh)
{
    protectedSwingBullish = true;
    protectedSwingLevel = Low[0];
}

// Bearish: Sweep above high, then close below sequence of up-close candles
if (High[0] > swingHigh && Close[0] < upCloseSeriesLow)
{
    protectedSwingBearish = true;
    protectedSwingLevel = High[0];
}',
  '["swingHigh", "swingLow", "downCloseSeriesHigh", "upCloseSeriesLow", "protectedSwingLevel", "protectedSwingBullish", "protectedSwingBearish"]',
  'complex',
  'scalping, swing',
  'all',
  '["protected swing", "swing point", "ttrades", "trend continuation", "invalidation", "stop loss", "cisd"]',
  '["Place stops beyond protected swing", "Trade retests in direction of protected swing", "Identify trend direction via protected swings"]'
);

-- ============================================================================
-- SKILL 3: Candle 2 Closure (Reversal Signal)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Candle 2 Closure (Reversal)',
  'ttrades-candle-2-closure',
  'Entry Patterns',
  'TTrades-TTFM',
  'Candle 2 is the reversal point in the fractal model. It must: (1) Sweep Candle 1 extreme (high or low), (2) Close back inside Candle 1 range. This sweep-and-reversal pattern signals direction change. Only valid at higher-TF point of interest (swing high/low, FVG, or opposing candle). After Candle 2, expect Candle 3 expansion in opposite direction. Use wick midpoint rule: if Candle 2 has large wick, Candle 3 must respect midpoint.',
  '// Candle 2 Closure Detection - Reversal Setup
// Conditions: Sweep C1 extreme + close back inside C1 range

bool candle2Bullish = false;
bool candle2Bearish = false;

// Bullish Candle 2: Sweep low of C1, close back above C1 low
if (Low[0] < candle1Low && Close[0] > candle1Low && Close[0] <= candle1High)
{
    candle2Bullish = true;
    // Calculate wick midpoint for C3 validation
    wickMidpoint = (Low[0] + candle1Low) / 2.0;
}

// Bearish Candle 2: Sweep high of C1, close back below C1 high
if (High[0] > candle1High && Close[0] < candle1High && Close[0] >= candle1Low)
{
    candle2Bearish = true;
    wickMidpoint = (High[0] + candle1High) / 2.0;
}',
  '["candle1High", "candle1Low", "wickMidpoint", "candle2Bullish", "candle2Bearish"]',
  'medium',
  'scalping, swing',
  'all',
  '["candle 2", "reversal closure", "sweep and close", "fractal model", "ttrades", "swing point"]',
  '["Identify reversal at POI", "Wait for Candle 3 expansion after C2", "Validate with higher TF structure"]'
);

-- ============================================================================
-- SKILL 4: Candle 3 Closure (Confirmation)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Candle 3 Closure (Confirmation)',
  'ttrades-candle-3-closure',
  'Entry Patterns',
  'TTrades-TTFM',
  'Candle 3 forms when Candle 2 fails to give immediate CISD. It closes over/under Candle 2 body WITHOUT sweeping C2 extreme. Requires: (1) Point of interest (FVG, imbalance, key level), (2) C3 closes through C2 body, (3) No sweep of C2 high/low. After C3 closure: mark C3 range, find equilibrium, expect C4 expansion. Drop to lower TF (4H to 15M) for refined entry in upper/lower half.',
  '// Candle 3 Closure Detection - Delayed Confirmation
// C3 closes through C2 body WITHOUT sweeping C2 extreme

bool candle3Bullish = false;
bool candle3Bearish = false;
double candle3Equilibrium = 0;

// Bullish C3: Closes above C2 body, no sweep of C2 low
if (Close[0] > candle2BodyHigh && Low[0] > candle2Low)
{
    candle3Bullish = true;
    candle3Equilibrium = (High[0] + Low[0]) / 2.0;
    // Entry zone: upper half of C3 range
    entryZoneHigh = High[0];
    entryZoneLow = candle3Equilibrium;
}

// Bearish C3: Closes below C2 body, no sweep of C2 high
if (Close[0] < candle2BodyLow && High[0] < candle2High)
{
    candle3Bearish = true;
    candle3Equilibrium = (High[0] + Low[0]) / 2.0;
    // Entry zone: lower half of C3 range
    entryZoneHigh = candle3Equilibrium;
    entryZoneLow = Low[0];
}',
  '["candle2High", "candle2Low", "candle2BodyHigh", "candle2BodyLow", "candle3Equilibrium", "entryZoneHigh", "entryZoneLow"]',
  'medium',
  'scalping, swing',
  'all',
  '["candle 3", "confirmation", "fractal model", "ttrades", "equilibrium", "expansion"]',
  '["Trade C4 expansion after C3 confirms", "Enter on pullback to C3 equilibrium", "Use C3 range for entry zone"]'
);

-- ============================================================================
-- SKILL 5: Candle 4 Expansion
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Candle 4 Expansion (TTrades)',
  'ttrades-candle-4-expansion',
  'Entry Patterns',
  'TTrades-TTFM',
  'Candle 4 is the 4th day/candle after swing point formation. It delivers the expansion move. Key rule: Expansions rarely give deep retracements. If C3 has strong directional close, C4 should expand from upper/lower half of C3 range. Top-down approach: Daily (swing points, C3 EQ) → 30M/1H (structure, POI) → 3-5M (CISD confirmation). Requires all 3 TFs aligned before entry.',
  '// Candle 4 Expansion - TTrades Framework
// C4 expands from upper/lower half of C3 based on C3 close direction

bool candle4Setup = false;
double c4EntryZone = 0;

// After strong bullish C3 close: C4 should expand from upper half
if (candle3Bullish && strongClose)
{
    c4EntryZone = candle3Equilibrium; // Entry above EQ
    candle4Setup = true;

    // C4 should not retrace below C3 equilibrium
    if (Low[0] < candle3Equilibrium)
        candle4Setup = false; // Invalidation
}

// After strong bearish C3 close: C4 expands from lower half
if (candle3Bearish && strongClose)
{
    c4EntryZone = candle3Equilibrium; // Entry below EQ
    candle4Setup = true;

    if (High[0] > candle3Equilibrium)
        candle4Setup = false; // Invalidation
}',
  '["candle3Equilibrium", "candle3Bullish", "candle3Bearish", "strongClose", "c4EntryZone"]',
  'complex',
  'swing',
  'daily, 4H',
  '["candle 4", "expansion", "fractal model", "ttrades", "continuation", "top-down"]',
  '["Trade C4 expansion from C3 equilibrium", "Confirm with lower TF CISD", "Invalidate if C4 retraces too deep"]'
);

-- ============================================================================
-- SKILL 6: Order Blocks for Continuations
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Order Blocks for Continuations (TTrades)',
  'ttrades-order-blocks-continuation',
  'Entry Patterns',
  'TTrades-TTFM',
  'Order blocks from FVG or swept lows/highs become Protected Swings. 3-step process: (1) Confirm reversal via purge + CISD as invalidation, mark structure forming; (2) Recognize POIs where price retraces to FVG or swept levels; (3) Wait for closure through opposing candles. Entry confirmation requires candle closure through opposing candle series. Stop at OB invalidation. Same logic works all TFs.',
  '// Order Block Continuation - TTrades Framework
// Step 1: Confirm reversal (purge + CISD)
// Step 2: Identify POI retracement zones
// Step 3: Wait for closure through opposing candles

bool obContinuationSetup = false;
double obEntryZone = 0;
double obStopLevel = 0;

// After confirmed reversal with CISD:
if (reversalConfirmed && cisd_triggered)
{
    // Identify FVG or swept level as POI
    if (priceInFVG || priceAtSweptLevel)
    {
        // Wait for closure through opposing candles
        if (bullishSetup && Close[0] > downCloseSeriesHigh)
        {
            obContinuationSetup = true;
            obEntryZone = Close[0];
            obStopLevel = protectedSwingLow;
        }
        if (bearishSetup && Close[0] < upCloseSeriesLow)
        {
            obContinuationSetup = true;
            obEntryZone = Close[0];
            obStopLevel = protectedSwingHigh;
        }
    }
}',
  '["reversalConfirmed", "cisd_triggered", "priceInFVG", "protectedSwingLow", "protectedSwingHigh", "downCloseSeriesHigh", "upCloseSeriesLow"]',
  'complex',
  'scalping, swing',
  'all',
  '["order block", "continuation", "fvg", "protected swing", "ttrades", "ob retest"]',
  '["Enter on OB retest after reversal", "Use FVG as continuation entry zone", "7R+ potential on OB continuations"]'
);

-- ============================================================================
-- SKILL 7: Equilibrium Trading
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Equilibrium Trading (TTrades)',
  'ttrades-equilibrium',
  'Market Structure',
  'TTrades-TTFM',
  'Equilibrium is the 50% midpoint of a range measured wick-to-wick (not body). It serves as a directional bias indicator. If upper half holds during bullish expansion = maintain upside bias. If lower half fails = anticipate range reversal. Used fractally: Daily EQ → 1H, 4H EQ → 15M, 1H EQ → 5M, 15M EQ → 1M. Locate POIs (FVG, OB, protected swing) within respected range half for entries.',
  '// Equilibrium Trading - TTrades Framework
// Measure wick-to-wick, use 50% as bias line

double rangeHigh = previousCandleHigh; // Wick high
double rangeLow = previousCandleLow;   // Wick low
double equilibrium = (rangeHigh + rangeLow) / 2.0;

bool bullishBias = false;
bool bearishBias = false;

// Upper half respected = bullish continuation bias
if (Low[0] >= equilibrium)
    bullishBias = true;

// Lower half respected = bearish continuation bias
if (High[0] <= equilibrium)
    bearishBias = true;

// Look for POI entries within respected half
if (bullishBias && priceAtFVG && priceAboveEquilibrium)
    entrySignal = true;',
  '["rangeHigh", "rangeLow", "equilibrium", "bullishBias", "bearishBias"]',
  'medium',
  'scalping, swing',
  'all',
  '["equilibrium", "50%", "midpoint", "range", "ttrades", "fractal", "bias"]',
  '["Use EQ as bias divider", "Enter on POI in respected half", "Switch bias if EQ fails"]'
);

-- ============================================================================
-- SKILL 8: 1-Minute Inversions
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  '1-Minute Inversions (TTrades)',
  'ttrades-1min-inversions',
  'Entry Patterns',
  'TTrades-TTFM',
  'Precision entry trigger on 1M chart. Long: close above bearish FVG. Short: close below bullish FVG. Must occur inside T-Spot (expected wick zone). Requires 3-TF alignment: Daily (bias via closure) → Hourly (sweep + close inside = structure) → 5M (CISD + T-Spot) → 1M (inversion entry). CRITICAL: Avoid inversions late in higher TF candle - valid inversions form early. Stop: just beyond inversion point. Target: 2R or next hourly candle open.',
  '// 1-Minute Inversion Entry - TTrades Framework
// Entry trigger: Close through FVG on 1M inside T-Spot zone

bool inversionEntry = false;
double inversionStop = 0;
double inversionTarget = 0;

// Verify alignment: Daily bias → Hourly structure → 5M CISD + T-Spot
if (dailyBiasConfirmed && hourlyStructureConfirmed && fiveMinCISD)
{
    // Check if price is inside T-Spot zone
    if (priceInTSpotZone)
    {
        // Long inversion: Close above bearish FVG
        if (bullishBias && Close[0] > bearishFVGHigh)
        {
            inversionEntry = true;
            inversionStop = Low[0] - 1 * TickSize;
            inversionTarget = entryPrice + 2 * (entryPrice - inversionStop); // 2R
        }

        // Short inversion: Close below bullish FVG
        if (bearishBias && Close[0] < bullishFVGLow)
        {
            inversionEntry = true;
            inversionStop = High[0] + 1 * TickSize;
            inversionTarget = entryPrice - 2 * (inversionStop - entryPrice);
        }
    }
}',
  '["dailyBiasConfirmed", "hourlyStructureConfirmed", "fiveMinCISD", "tSpotHigh", "tSpotLow", "bearishFVGHigh", "bullishFVGLow"]',
  'complex',
  'scalping',
  '1M, 5M',
  '["1 minute", "inversion", "fvg", "t-spot", "precision entry", "ttrades"]',
  '["Ultra-tight stops with 1M inversion", "Enter only inside T-Spot", "Exit at 2R or hourly close"]'
);

-- ============================================================================
-- SKILL 9: Timeframe Alignment (Top-Down)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Timeframe Alignment (TTrades)',
  'ttrades-timeframe-alignment',
  'Trade Management',
  'TTrades-TTFM',
  '3-tier timeframe system: Higher TF (Daily/Weekly) = bias via swing points, closures, equilibrium, liquidity. Intermediate TF (4H/1H) = confirm CISD alignment, locate FVG/OB/protected swings. Entry TF (15M/5M) = precision trigger via CISD when all TFs align. Pairs: Weekly→4H, Daily→1H, 4H→15M, 1H→5M, 30M→3M, 15M→1M. NEVER skip timeframes. Expansion occurs only when ALL 3 TFs point same direction.',
  '// Timeframe Alignment - TTrades 3-Tier System
// Higher TF: Bias | Intermediate: Structure | Entry: Trigger

// Standard pairs:
// Daily → 1H → 5M
// 4H → 15M → 3M

bool higherTFBias = false;
bool intermediateTFStructure = false;
bool entryTFTrigger = false;
bool fullAlignment = false;

// Step 1: Higher TF bias (Daily)
if (dailySwingPointFormed && dailyClosureConfirmsBias)
    higherTFBias = true;

// Step 2: Intermediate TF structure (1H)
if (higherTFBias && hourlyCISDConfirmsBias && hourlyPOIIdentified)
    intermediateTFStructure = true;

// Step 3: Entry TF trigger (5M)
if (intermediateTFStructure && fiveMinuteCISD)
{
    entryTFTrigger = true;
    fullAlignment = true; // All 3 TFs aligned
}

// Only trade when fullAlignment == true',
  '["dailyBias", "hourlyCISD", "fiveMinuteCISD", "fullAlignment", "entryPOI"]',
  'complex',
  'swing, intraday',
  'all',
  '["timeframe alignment", "top-down", "multi-timeframe", "ttrades", "cisd", "expansion"]',
  '["Confirm all 3 TFs before entry", "Use Daily for bias, 1H for structure, 5M for entry", "No trades without alignment"]'
);

-- ============================================================================
-- SKILL 10: Projections (Fibonacci Extensions)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Projections (Fibonacci Extensions)',
  'ttrades-projections',
  'Trade Management',
  'TTrades-TTFM',
  'Mechanical price targets from swing/manipulation legs after market structure shift. Process: (1) Identify Candle 2 reversal point, (2) Mark manipulation leg (initial extreme to high/low that created it), (3) Apply Fibonacci tool with negative extensions. Levels: 0.236, 0.382, 0.5, 0.618, 0.786, -1, -1.618, -2, -2.618, -4, -4.618. Target expectations: Average legs → -2 to -2.5; Expanding legs → -4 to -4.5; Large legs → -1 only.',
  '// Projections - TTrades Fibonacci Extension Targets
// Apply from Candle 2 to manipulation leg

double manipulationLegStart = swingExtreme; // e.g., the low
double manipulationLegEnd = highThatCreatedLow; // The high that created that low
double legRange = Math.Abs(manipulationLegEnd - manipulationLegStart);

// Calculate projection targets (bearish example: targets below)
double target_neg1 = manipulationLegStart - (1.0 * legRange);
double target_neg1618 = manipulationLegStart - (1.618 * legRange);
double target_neg2 = manipulationLegStart - (2.0 * legRange);
double target_neg2618 = manipulationLegStart - (2.618 * legRange);
double target_neg4 = manipulationLegStart - (4.0 * legRange);

// Adjust target based on leg size
double selectedTarget = 0;
if (legRange < averageLegSize)
    selectedTarget = target_neg2; // Average leg: aim for -2
else if (legRange > largeLegThreshold)
    selectedTarget = target_neg1; // Large leg: cap at -1
else
    selectedTarget = target_neg4; // Expanding leg: -4 possible',
  '["swingExtreme", "manipulationLegEnd", "legRange", "averageLegSize", "target_neg2"]',
  'medium',
  'swing',
  '4H, daily',
  '["projections", "fibonacci", "extensions", "targets", "ttrades", "standard deviation"]',
  '["Calculate targets from C2", "Use -2 for average legs", "Use -1 for large manipulation legs"]'
);

-- ============================================================================
-- SKILL 11: Reversal Sequence (5-Stage)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Reversal Sequence (5-Stage)',
  'ttrades-reversal-sequence',
  'Entry Patterns',
  'TTrades-TTFM',
  'Structured 5-stage reversal process: (1) PURGE/TURTLE SOUP - sweep of liquidity at high/low; (2) INVERSION - FVG gets closed then flips to support/resistance; (3) CISD - candle closes through opposing candles confirming shift; (4) FVG - new 3-candle imbalance in opposite direction; (5) BREAKER BLOCK - failed level reused for entry. Kill zones: NY AM 8:30-11:00 EST (indices), London 2:00-5:00 AM EST. Entry tools: FVG, Order Block, Breaker, or OTE (70.5% fib). Add SMT divergence for confluence.',
  '// Reversal Sequence - TTrades 5-Stage Framework
// Stage progression provides increasing confirmation

int reversalStage = 0;

// Stage 1: Purge (Liquidity Sweep)
if (liquiditySweepDetected)
    reversalStage = 1;

// Stage 2: Inversion (FVG closure + flip)
if (reversalStage >= 1 && fvgClosedAndFlipped)
    reversalStage = 2;

// Stage 3: CISD (Closure through opposing candles)
if (reversalStage >= 2 && cisdConfirmed)
    reversalStage = 3;

// Stage 4: New FVG in opposite direction
if (reversalStage >= 3 && newFVGFormed)
    reversalStage = 4;

// Stage 5: Breaker Block (Failed level reused)
if (reversalStage >= 4 && breakerBlockFormed)
    reversalStage = 5;

// Entry allowed after Stage 3+
bool entryAllowed = reversalStage >= 3;
// Higher stages = more confirmation but potentially later entry',
  '["reversalStage", "liquiditySweepDetected", "fvgClosedAndFlipped", "cisdConfirmed", "newFVGFormed", "breakerBlockFormed"]',
  'complex',
  'scalping, swing',
  '5M, 15M',
  '["reversal sequence", "purge", "inversion", "breaker block", "ttrades", "turtle soup", "smt"]',
  '["Trade after Stage 3 CISD", "Use Stage 5 breaker for highest probability", "Best in NY AM kill zone"]'
);

-- ============================================================================
-- SKILL 12: Stop Loss Mastery (Protected Swing Stops)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Stop Loss Mastery (TTrades)',
  'ttrades-stop-loss-mastery',
  'Risk Management',
  'TTrades-TTFM',
  'Stops based on protected swing structure, not arbitrary amounts. Default: stop at level where trade idea is proven wrong (protected swing extreme). Alternative: body invalidation for better R:R but higher whipsaw risk - only use on bulky opposing candles, never on large-wicked candles. In trends, stack protected swings to trail stops progressively. Context matters: protected swing outside relevant POI is less reliable. Always wait for proper closure before declaring swing protected.',
  '// Stop Loss Mastery - TTrades Protected Swing Framework

double stopLossLevel = 0;
bool usingBodyInvalidation = false;

// Default: Stop beyond protected swing extreme
if (bullishTrade)
    stopLossLevel = protectedSwingLow - buffer;
else
    stopLossLevel = protectedSwingHigh + buffer;

// Alternative: Body invalidation for better R:R
// Only use on bulky opposing candles, NOT large-wicked candles
if (useBodyInvalidation && bulkyOpposingCandles)
{
    if (bullishTrade)
        stopLossLevel = opposingCandleBodyLow - buffer;
    else
        stopLossLevel = opposingCandleBodyHigh + buffer;
    usingBodyInvalidation = true;
}

// Trail stops as new protected swings form
if (inTrend && newProtectedSwingFormed)
{
    if (bullishTrade && newProtectedSwingLow > stopLossLevel)
        stopLossLevel = newProtectedSwingLow - buffer;
    else if (bearishTrade && newProtectedSwingHigh < stopLossLevel)
        stopLossLevel = newProtectedSwingHigh + buffer;
}',
  '["protectedSwingLow", "protectedSwingHigh", "buffer", "useBodyInvalidation", "bulkyOpposingCandles"]',
  'medium',
  'all',
  'all',
  '["stop loss", "protected swing", "invalidation", "trailing stop", "ttrades", "risk management"]',
  '["Place stop beyond protected swing", "Trail stops as new swings form", "Use body stops only on bulky candles"]'
);

-- ============================================================================
-- SKILL 13: Wick Analysis (Expansion vs Reversal)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Wick Analysis (TTrades)',
  'ttrades-wick-analysis',
  'Market Analysis',
  'TTrades-TTFM',
  'Wick size determines continuation vs reversal probability. SMALL WICKS: minimal opposing range, early wick formation, directional efficiency = supports expansion. LARGE WICKS: substantial opposing range, extended wick formation time, closes near open = signals reversal. The 50% wick midpoint rule: mark midpoint between body and wick extreme. Respected midpoint = reversal valid. Disrespected = original direction continues. Expansion candles: small wicks, large body, high/low forms early, close near extreme.',
  '// Wick Analysis - TTrades Framework
// Determine expansion vs reversal probability

double candleRange = High[0] - Low[0];
double bodySize = Math.Abs(Close[0] - Open[0]);
double upperWick = High[0] - Math.Max(Open[0], Close[0]);
double lowerWick = Math.Min(Open[0], Close[0]) - Low[0];

bool isExpansionCandle = false;
bool isReversalCandle = false;

// Expansion: Small wicks, large body
if (bodySize > candleRange * 0.6 && upperWick < candleRange * 0.2 && lowerWick < candleRange * 0.2)
    isExpansionCandle = true;

// Reversal: Large wick, close near open
double wickRatio = (upperWick + lowerWick) / candleRange;
if (wickRatio > 0.5 && Math.Abs(Close[0] - Open[0]) < candleRange * 0.3)
    isReversalCandle = true;

// 50% Wick Midpoint Rule
double wickMidpoint = 0;
if (upperWick > lowerWick)
    wickMidpoint = High[0] - (upperWick / 2.0); // Upper wick midpoint
else
    wickMidpoint = Low[0] + (lowerWick / 2.0);  // Lower wick midpoint',
  '["upperWick", "lowerWick", "bodySize", "candleRange", "wickMidpoint", "isExpansionCandle", "isReversalCandle"]',
  'medium',
  'all',
  'all',
  '["wick analysis", "expansion candle", "reversal candle", "wick midpoint", "ttrades", "price action"]',
  '["Trade expansion when small wicks", "Expect reversal on large wicks", "Use wick midpoint for validation"]'
);

-- ============================================================================
-- SKILL 14: Power of 3 (AMD Framework)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Power of 3 (AMD Framework)',
  'ttrades-power-of-3',
  'Market Structure',
  'TTrades-TTFM',
  'AMD = Accumulation, Manipulation, Distribution. 3-phase price structure: C1 (Accumulation) = range forms, liquidity builds; C2 (Manipulation) = false move against intended direction; C3 (Distribution) = true expansion. Sometimes manipulation and distribution occur in single candle. Key insight: Let the wick form, then trade the body. Large opposing wick = skip this candle, wait for C3. Small wick = entry possible in same candle. Use on 4H with 15M entries. Session times: 2am, 6am, 10am futures / 1am, 5am, 9am forex.',
  '// Power of 3 (AMD) - TTrades Framework
// C1: Accumulation | C2: Manipulation | C3: Distribution

int amdPhase = 0;
bool manipulationComplete = false;
bool distributionReady = false;

// Phase detection on 4H chart
if (rangeFormingCandle)
    amdPhase = 1; // Accumulation

if (amdPhase == 1 && wickAgainstBias)
{
    amdPhase = 2; // Manipulation

    // Check wick size to determine same-candle vs next-candle entry
    if (wickIsSmall)
    {
        // Same candle entry possible: wick = manipulation, body = distribution
        manipulationComplete = true;
        distributionReady = true;
    }
    else
    {
        // Large wick = wait for C3
        manipulationComplete = true;
        distributionReady = false;
    }
}

if (amdPhase == 2 && !distributionReady && nextCandleStarts)
{
    amdPhase = 3; // Distribution in C3
    distributionReady = true;
}

// Entry on 15M when distribution ready + CISD confirmed',
  '["amdPhase", "manipulationComplete", "distributionReady", "wickIsSmall", "rangeFormingCandle"]',
  'complex',
  'swing',
  '4H, 15M',
  '["power of 3", "amd", "accumulation", "manipulation", "distribution", "ttrades"]',
  '["Identify 3-phase structure", "Enter after manipulation phase", "Wait for C3 if large wick on C2"]'
);

-- ============================================================================
-- SKILL 15: Fractal Model Playbook (Complete Framework)
-- ============================================================================
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Fractal Model Playbook (TTrades)',
  'ttrades-fractal-playbook',
  'Trade Management',
  'TTrades-TTFM',
  'Complete trading framework. Core principle: Price cannot reverse without forming a swing point. Daily (Bias): Close below PDL = bearish continuation, failure to close below = bullish reversal. Apply inverse for PDH. Best at swing points. Hourly (Structure): Locate C2 on daily, find CISD matching bias, price in upper/lower half of PDR, identify POI (FVG/OB), wait for closure in POI. 5-Min (Entry): Confirm CISD in C2, align with POI, all 3 TFs same direction. Stops: beyond protected swing. Targets: 2R minimum, logical liquidity on daily. Win rate 40-80%, need 34%+ to profit at 2R.',
  '// Fractal Model Playbook - Complete TTrades Framework
// Daily → Hourly → 5-Min alignment

// === DAILY: Establish Bias ===
BiasDirection dailyBias = BiasDirection.Neutral;

if (Close[1] < previousDayLow) // Closed below PDL
    dailyBias = BiasDirection.Bearish;
else if (previousDayWasBearish && Close[1] > previousDayLow) // Failed to close below
    dailyBias = BiasDirection.Bullish;

// === HOURLY: Confirm Structure ===
bool hourlyStructureConfirmed = false;

// Find C2 swing point on daily
// Check hourly CISD matches daily bias
// Price in correct half of previous day range
// POI identified (FVG, OB)

if (hourlyCISD_matches_dailyBias && priceInCorrectHalf && poiIdentified)
    hourlyStructureConfirmed = true;

// === 5-MIN: Execute Entry ===
bool entryTrigger = false;

if (dailyBias != BiasDirection.Neutral && hourlyStructureConfirmed)
{
    if (fiveMinCISD_in_C2 && alignedWithPOI)
    {
        entryTrigger = true;
        stopLoss = protectedSwingLevel;
        takeProfit = entryPrice + 2 * riskAmount; // Minimum 2R
    }
}',
  '["dailyBias", "hourlyStructureConfirmed", "fiveMinCISD", "protectedSwingLevel", "poiIdentified", "previousDayHigh", "previousDayLow"]',
  'complex',
  'intraday, swing',
  'daily, 1H, 5M',
  '["fractal model", "playbook", "ttrades", "top-down", "swing point", "complete framework"]',
  '["Follow Daily→Hourly→5Min process", "Minimum 2R targets", "Only trade with 3-TF alignment"]'
);

-- ============================================================================
-- ADD SKILL SOURCES FOR ALL TTrades Skills
-- ============================================================================

-- Daily Bias
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/easy-daily-bias-a-mechanical-trading-framework/', 'TTrades: Easy Daily Bias - A Mechanical Trading Framework', 0.9, 'web_scrape', 'Detailed mechanical framework for bias determination'
FROM skills WHERE slug = 'ttrades-daily-bias';

-- Protected Swings
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/protected-swings-understanding-trends-and-invalidations/', 'TTrades: Protected Swings in Trading', 0.9, 'web_scrape', 'Complete protected swing methodology'
FROM skills WHERE slug = 'ttrades-protected-swings';

-- Candle 2
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/understanding-candle-2-closures-within-the-fractal-model/', 'TTrades: Understanding Candle 2 Closures', 0.9, 'web_scrape', 'Candle 2 reversal mechanics'
FROM skills WHERE slug = 'ttrades-candle-2-closure';

-- Candle 3
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/candle-3-closure-a-complete-guide-to-identifying-continuations-and-reversals/', 'TTrades: Candle 3 Closure Complete Guide', 0.9, 'web_scrape', 'Candle 3 confirmation methodology'
FROM skills WHERE slug = 'ttrades-candle-3-closure';

-- Candle 4
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/ttrades-fractal-model-candle-4/', 'TTrades: Fractal Model Candle 4', 0.9, 'web_scrape', 'Candle 4 expansion framework'
FROM skills WHERE slug = 'ttrades-candle-4-expansion';

-- Order Blocks
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/using-order-blocks-for-continuations/', 'TTrades: Using Order Blocks for Continuations', 0.9, 'web_scrape', 'Order block continuation methodology'
FROM skills WHERE slug = 'ttrades-order-blocks-continuation';

-- Equilibrium
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/using-equilibrium-in-continuations/', 'TTrades: Using Equilibrium in Continuations', 0.9, 'web_scrape', 'Equilibrium trading framework'
FROM skills WHERE slug = 'ttrades-equilibrium';

-- 1-Minute Inversions
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/refining-entries-with-the-fractal-model-precision-with-1-minute-inversions/', 'TTrades: Precision with 1-Minute Inversions', 0.9, 'web_scrape', '1-minute precision entry methodology'
FROM skills WHERE slug = 'ttrades-1min-inversions';

-- Timeframe Alignment
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/timeframe-alignment-how-to-align-higher-and-lower-time-frames-for-precision-entries/', 'TTrades: Timeframe Alignment for Precision Entries', 0.9, 'web_scrape', 'Multi-timeframe alignment framework'
FROM skills WHERE slug = 'ttrades-timeframe-alignment';

-- Projections
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/understanding-projections-in-the-fractal-model-a-complete-guide/', 'TTrades: Understanding Projections Complete Guide', 0.9, 'web_scrape', 'Fibonacci projection target methodology'
FROM skills WHERE slug = 'ttrades-projections';

-- Reversal Sequence
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/reversal-sequence-building-an-entry-model-for-trading/', 'TTrades: Reversal Sequence Entry Model', 0.9, 'web_scrape', '5-stage reversal sequence'
FROM skills WHERE slug = 'ttrades-reversal-sequence';

-- Stop Loss Mastery
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/stop-loss-mastery-using-protected-swings-for-precise-invalidations/', 'TTrades: Stop Loss Mastery', 0.9, 'web_scrape', 'Protected swing stop methodology'
FROM skills WHERE slug = 'ttrades-stop-loss-mastery';

-- Wick Analysis
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/understanding-wick-sizes-reversals-and-expansion-candles-in-price-action/', 'TTrades: Wick Sizes and Expansion Candles', 0.9, 'web_scrape', 'Wick analysis methodology'
FROM skills WHERE slug = 'ttrades-wick-analysis';

-- Power of 3
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/trading-the-4-hour-power-of-3-open-high-low-close-strategy/', 'TTrades: 4-Hour Power of 3 Strategy', 0.9, 'web_scrape', 'AMD framework methodology'
FROM skills WHERE slug = 'ttrades-power-of-3';

-- Fractal Playbook
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/fractal-model-playbook-aligning-daily-hourly-and-5-minute-charts/', 'TTrades: Fractal Model Playbook', 0.95, 'web_scrape', 'Complete trading framework playbook'
FROM skills WHERE slug = 'ttrades-fractal-playbook';

-- ============================================================================
-- LINK TTrades SOURCES TO EXISTING SIMILAR SKILLS
-- ============================================================================

-- Link TTrades CISD to existing CISD Pattern skill
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/understanding-candle-2-closures-within-the-fractal-model/', 'TTrades: CISD in Candle 2 Closures', 0.85, 'web_scrape', 'Additional CISD context from TTrades Fractal Model'
FROM skills WHERE slug = 'cisd-pattern';

-- Link TTrades Sweep to existing Liquidity Sweep skill
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/reversal-sequence-building-an-entry-model-for-trading/', 'TTrades: Liquidity Sweep in Reversal Sequence', 0.85, 'web_scrape', 'Sweep methodology from TTrades (Stage 1: Purge)'
FROM skills WHERE slug = 'liquidity-sweep-detection';

-- Link TTrades Bias to existing Pre-market Bias skill
INSERT INTO skill_sources (skill_id, source_type, source_url, source_title, extraction_confidence, extraction_method, notes)
SELECT id, 'website', 'https://ttrades.com/easy-daily-bias-a-mechanical-trading-framework/', 'TTrades: Mechanical Daily Bias Framework', 0.80, 'web_scrape', 'Alternative bias determination methodology'
FROM skills WHERE slug = 'premarket-bias-vwap-poc';

-- ============================================================================
-- CREATE SKILL COMBINATIONS FOR TTRADES PATTERNS
-- ============================================================================

-- Fractal Model Complete Pattern (C2 → C3 → C4 + Alignment)
INSERT INTO skill_combinations (name, description, skill_ids, typical_use_case, complexity)
SELECT
  'TTrades Fractal Model Complete',
  'Full fractal model sequence: Candle 2 reversal → Candle 3 confirmation → Candle 4 expansion, with 3-tier timeframe alignment',
  json_array(
    (SELECT id FROM skills WHERE slug = 'ttrades-candle-2-closure'),
    (SELECT id FROM skills WHERE slug = 'ttrades-candle-3-closure'),
    (SELECT id FROM skills WHERE slug = 'ttrades-candle-4-expansion'),
    (SELECT id FROM skills WHERE slug = 'ttrades-timeframe-alignment')
  ),
  'Daily bias reversal trades with multi-timeframe confirmation',
  'complex';

-- Protected Swing Entry Pattern
INSERT INTO skill_combinations (name, description, skill_ids, typical_use_case, complexity)
SELECT
  'TTrades Protected Swing Entry',
  'Entry using protected swings for direction + OB/FVG for entry zone + proper stop placement',
  json_array(
    (SELECT id FROM skills WHERE slug = 'ttrades-protected-swings'),
    (SELECT id FROM skills WHERE slug = 'ttrades-order-blocks-continuation'),
    (SELECT id FROM skills WHERE slug = 'ttrades-stop-loss-mastery')
  ),
  'Continuation trades in trending markets',
  'complex';

-- Precision Scalping Pattern (1-Min Inversions)
INSERT INTO skill_combinations (name, description, skill_ids, typical_use_case, complexity)
SELECT
  'TTrades Precision Scalping',
  '1-minute inversion entries with full timeframe alignment and tight stops',
  json_array(
    (SELECT id FROM skills WHERE slug = 'ttrades-1min-inversions'),
    (SELECT id FROM skills WHERE slug = 'ttrades-timeframe-alignment'),
    (SELECT id FROM skills WHERE slug = 'ttrades-equilibrium')
  ),
  'Ultra-tight stop scalping with 2R targets',
  'complex';

-- Reversal Sequence Pattern
INSERT INTO skill_combinations (name, description, skill_ids, typical_use_case, complexity)
SELECT
  'TTrades Reversal Sequence',
  'Complete 5-stage reversal: Purge → Inversion → CISD → FVG → Breaker',
  json_array(
    (SELECT id FROM skills WHERE slug = 'ttrades-reversal-sequence'),
    (SELECT id FROM skills WHERE slug = 'ttrades-wick-analysis'),
    (SELECT id FROM skills WHERE slug = 'ttrades-projections')
  ),
  'Major reversal trades at key swing points',
  'complex';

-- ============================================================================
-- VERIFY INSERTION
-- ============================================================================
SELECT 'TTrades skills inserted: ' || COUNT(*) FROM skills WHERE subcategory = 'TTrades-TTFM';
SELECT 'TTrades skill sources: ' || COUNT(*) FROM skill_sources WHERE source_url LIKE '%ttrades.com%';
SELECT 'TTrades combinations: ' || COUNT(*) FROM skill_combinations WHERE name LIKE '%TTrades%';

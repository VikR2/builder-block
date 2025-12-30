-- ============================================================================
-- Seed Skills from SevenFortyBiasV6 (740.cs)
-- ============================================================================

-- Skill 1: Pre-market Bias Calculation
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Pre-market Bias Calculation (VWAP-POC)',
  'premarket-bias-vwap-poc',
  'Market Analysis',
  'Directional Bias',
  'Calculates market directional bias based on pre-market VWAP Point of Control (POC). Tracks high/low during pre-market hours (3-7 AM), calculates volume-weighted average price, and determines if POC is positioned bullish (>55%), bearish (<45%), or neutral.',
  '// Pre-market tracking
if (inPremarket)
{
    if (pmHigh == 0)
    {
        pmHigh = High[0];
        pmLow = Low[0];
    }
    pmHigh = Math.Max(pmHigh, High[0]);
    pmLow = Math.Min(pmLow, Low[0]);

    double typicalPrice = (High[0] + Low[0] + Close[0]) / 3.0;
    pmVWAP_num += typicalPrice * Volume[0];
    pmVWAP_den += Volume[0];
    pmDataCollected = true;
}

// Calculate bias when premarket ends
if (!inPremarket && pmDataCollected && !pmBiasCalculated && pmHigh > pmLow)
{
    pmPOC = pmVWAP_den > 0 ? pmVWAP_num / pmVWAP_den : (pmHigh + pmLow) / 2.0;
    double pmRange = pmHigh - pmLow;

    if (pmRange > 0)
    {
        pmPocPct = ((pmPOC - pmLow) / pmRange) * 100.0;

        if (pmPocPct >= BullishThreshold)
            pmBias = BiasType.Bullish;
        else if (pmPocPct <= BearishThreshold)
            pmBias = BiasType.Bearish;
        else
            pmBias = BiasType.Neutral;

        pmBiasCalculated = true;
    }
}',
  '["pmHigh", "pmLow", "pmVWAP_num", "pmVWAP_den", "pmPOC", "pmPocPct", "pmBias", "BullishThreshold", "BearishThreshold"]',
  'medium',
  'intraday',
  'intraday',
  '["premarket", "bias", "vwap", "poc", "point of control", "market direction", "volume weighted"]',
  '["Filter trades based on premarket bias", "Determine overall market sentiment before regular session", "ICT-style bias determination"]'
);

-- Skill 2: Range Building
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Range Building (Opening Range)',
  'range-building-opening-range',
  'Market Structure',
  'Range Analysis',
  'Captures the high and low during a specific time window (typically 7:00-7:40 AM) to establish a trading range. Calculates equilibrium (midpoint) for reference. Used as a foundation for breakout and reversal setups.',
  'if (inRangeBuild)
{
    if (rangeHigh == 0)
    {
        rangeHigh = High[0];
        rangeLow = Low[0];
    }

    rangeHigh = Math.Max(rangeHigh, High[0]);
    rangeLow = Math.Min(rangeLow, Low[0]);
}

// Finalize range when range window ends
if (!inRangeBuild && !rangeSet && rangeHigh > 0 && rangeLow > 0 && rangeHigh > rangeLow)
{
    equilibrium = (rangeHigh + rangeLow) / 2.0;
    rangeSet = true;
}',
  '["rangeHigh", "rangeLow", "equilibrium", "rangeSet"]',
  'simple',
  'intraday',
  'intraday',
  '["range", "opening range", "equilibrium", "consolidation", "or", "initial balance"]',
  '["7:40 AM range for ES/NQ", "First hour range", "Asian session range", "Define key levels for the day"]'
);

-- Skill 3: Sweep Detection
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Liquidity Sweep Detection',
  'liquidity-sweep-detection',
  'Entry Patterns',
  'Reversal',
  'Detects when price sweeps above the range high or below the range low, potentially trapping breakout traders. A sweep is a liquidity grab that often precedes a reversal. Tracks sweep price and direction for subsequent reversal setups.',
  '// Detect sweep (only track first sweep of the day)
if (sweepDirection == 0)
{
    // Low sweep - potential long setup
    if (Low[0] < rangeLow && allowLong)
    {
        lowSwept = true;
        sweepPrice = Low[0];
        sweepBar = CurrentBar;
        sweepDirection = 1;
        refCandleOpen = 0;
    }

    // High sweep - potential short setup
    if (High[0] > rangeHigh && allowShort)
    {
        highSwept = true;
        sweepPrice = High[0];
        sweepBar = CurrentBar;
        sweepDirection = -1;
        refCandleOpen = 0;
    }
}',
  '["sweepPrice", "sweepBar", "sweepDirection", "lowSwept", "highSwept", "rangeHigh", "rangeLow"]',
  'medium',
  'scalping, swing',
  'intraday',
  '["sweep", "liquidity", "stop hunt", "false breakout", "liquidity grab", "trap", "ict sweep"]',
  '["Fade breakouts after liquidity sweep", "Reversal entries after stop hunt", "ICT-style sweep and reverse"]'
);

-- Skill 4: CISD Pattern (Change in State of Delivery)
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, dependencies, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'CISD Pattern (Change in State of Delivery)',
  'cisd-pattern',
  'Entry Patterns',
  'Confirmation',
  'ICT (Inner Circle Trader) concept that confirms a reversal after a liquidity sweep. After a bearish candle during a low sweep, a CISD occurs when price closes above the bearish candle''s open. This indicates a change from bearish to bullish delivery, confirming the reversal.',
  '// Track reference candle - most recent opposite direction candle
if (sweepDirection == 1 && is_bearish)
    refCandleOpen = Open[0];
if (sweepDirection == -1 && is_bullish)
    refCandleOpen = Open[0];

// Check for CISD (Change in State of Delivery)
bool cisd_valid = false;

// Long CISD: After low sweep, close above bearish candle''s open
if (sweepDirection == 1 && refCandleOpen > 0 && Close[0] > refCandleOpen)
{
    cisd_valid = true;
    cisd_triggered = true;
    tradeDirection = 1;
}

// Short CISD: After high sweep, close below bullish candle''s open
if (sweepDirection == -1 && refCandleOpen > 0 && Close[0] < refCandleOpen)
{
    cisd_valid = true;
    cisd_triggered = true;
    tradeDirection = -1;
}',
  '["refCandleOpen", "cisd_triggered", "tradeDirection", "sweepDirection"]',
  '["liquidity-sweep-detection"]',
  'complex',
  'scalping, swing',
  'intraday',
  '["cisd", "change in state", "delivery", "ict", "reversal confirmation", "market structure shift", "mss"]',
  '["Confirm sweep reversals", "Wait for CISD before entry", "ICT reversal confirmation", "Avoid false reversals"]'
);

-- Skill 5: Breakout Detection
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Range Breakout Detection',
  'range-breakout-detection',
  'Entry Patterns',
  'Continuation',
  'Detects when price breaks out of the established range (above high or below low). Unlike sweeps, breakouts represent genuine directional moves. Used to identify continuation patterns where price is likely to continue in the breakout direction.',
  '// Detect breakout (only if Scenario A hasn''t triggered)
if (!breakoutDetected && sweepDirection == 0)
{
    // Bullish breakout above range high
    if (allowLong && High[0] > rangeHigh)
    {
        breakoutDetected = true;
        breakoutDirection = 1;
        breakoutRefCandleOpen = 0;
    }

    // Bearish breakout below range low
    if (allowShort && Low[0] < rangeLow)
    {
        breakoutDetected = true;
        breakoutDirection = -1;
        breakoutRefCandleOpen = 0;
    }
}',
  '["breakoutDetected", "breakoutDirection", "breakoutRefCandleOpen", "rangeHigh", "rangeLow"]',
  'simple',
  'scalping, swing',
  'intraday, daily',
  '["breakout", "range expansion", "continuation", "momentum", "directional move"]',
  '["Trade breakouts with pullback", "Continuation patterns", "Trend following from range"]'
);

-- Skill 6: Pullback After Breakout
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, dependencies, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Breakout Pullback Pattern',
  'breakout-pullback-pattern',
  'Entry Patterns',
  'Continuation',
  'After a breakout, waits for price to pull back into the range before continuing in the breakout direction. This provides better entry prices and confirms the breakout is genuine. After pullback, waits for CISD confirmation.',
  '// Pullback detection after breakout
if (breakoutDetected && !pullbackDetected)
{
    // Bullish: price pulls back INTO range (low < rangeHigh)
    if (breakoutDirection == 1 && Low[0] < rangeHigh)
    {
        pullbackDetected = true;
        breakoutRefCandleOpen = 0;
    }

    // Bearish: price pulls back INTO range (high > rangeLow)
    if (breakoutDirection == -1 && High[0] > rangeLow)
    {
        pullbackDetected = true;
        breakoutRefCandleOpen = 0;
    }
}',
  '["pullbackDetected", "breakoutDirection", "breakoutRefCandleOpen", "rangeHigh", "rangeLow"]',
  '["range-breakout-detection"]',
  'medium',
  'swing',
  'intraday, daily',
  '["pullback", "retest", "continuation pattern", "throwback", "backtest"]',
  '["Enter on pullback after breakout", "Wait for retest of range", "Better risk/reward entries"]'
);

-- Skill 7: Breakeven Management
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Automatic Breakeven Stop',
  'automatic-breakeven-stop',
  'Risk Management',
  'Position Management',
  'Automatically moves stop loss to breakeven (entry price) after price moves favorably by a specified amount. Protects profits and eliminates risk once the trade has moved sufficiently in your favor.',
  'private void ManageBreakeven()
{
    if (Position.MarketPosition == MarketPosition.Flat)
    {
        breakevenSet = false;
        return;
    }

    if (breakevenSet)
        return;

    double currentProfit = Position.MarketPosition == MarketPosition.Long
        ? Close[0] - Position.AveragePrice
        : Position.AveragePrice - Close[0];

    double profitTicks = currentProfit / TickSize;

    if (profitTicks >= BreakevenTicks)
    {
        breakevenSet = true;

        if (Position.MarketPosition == MarketPosition.Long)
            SetStopLoss(activeOrderName, CalculationMode.Price, Position.AveragePrice, false);
        else
            SetStopLoss(activeOrderName, CalculationMode.Price, Position.AveragePrice, false);
    }
}',
  '["breakevenSet", "BreakevenTicks", "activeOrderName"]',
  'simple',
  'scalping, swing',
  'any',
  '["breakeven", "trailing stop", "risk reduction", "protect profit", "move stop"]',
  '["Move to BE after 80 ticks profit", "Risk-free trades", "Lock in gains"]'
);

-- Skill 8: Time-based Session Management
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Time-based Session Windows',
  'time-based-session-windows',
  'Trade Management',
  'Session Control',
  'Divides the trading day into specific time windows (pre-market, range building, execution, end of day). Ensures strategy logic only executes during appropriate time periods. Prevents trading during unfavorable hours.',
  'int rangeStartMins = RangeStartHour * 60 + RangeStartMinute;
int rangeEndMins = RangeEndHour * 60 + RangeEndMinute;
int execEndMins = ExecutionEndHour * 60 + ExecutionEndMinute;

bool inPremarket = hour >= PremarketStartHour && hour < PremarketEndHour;
bool inRangeBuild = currentMins >= rangeStartMins && currentMins < rangeEndMins;
bool inExecution = currentMins >= rangeEndMins && currentMins < execEndMins;
bool inSession = hour >= RangeStartHour && hour < SessionEndHour;',
  '["PremarketStartHour", "PremarketEndHour", "RangeStartHour", "RangeEndHour", "ExecutionEndHour", "SessionEndHour"]',
  'simple',
  'intraday',
  'intraday',
  '["session", "time filter", "trading hours", "time window", "session control"]',
  '["Only trade 7:40-9:30 AM", "Pre-market analysis window", "Avoid low liquidity hours"]'
);

-- Skill 9: Fixed Stop Loss & Take Profit
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Fixed Stop Loss & Take Profit',
  'fixed-stop-take-profit',
  'Risk Management',
  'Exit Management',
  'Sets fixed stop loss and take profit levels immediately after order fill. Stop is based on recent swing point or technical level, take profit is based on a fixed tick target. Ensures consistent risk/reward ratio.',
  'protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
{
    if (marketPosition == MarketPosition.Long)
    {
        double stopTicks = (price - stopLoss) / TickSize;
        SetStopLoss(execution.Order.Name, CalculationMode.Price, stopLoss, false);
        SetProfitTarget(execution.Order.Name, CalculationMode.Price, takeProfit);
    }
    else if (marketPosition == MarketPosition.Short)
    {
        double stopTicks = (stopLoss - price) / TickSize;
        SetStopLoss(execution.Order.Name, CalculationMode.Price, stopLoss, false);
        SetProfitTarget(execution.Order.Name, CalculationMode.Price, takeProfit);
    }
}',
  '["stopLoss", "takeProfit", "MaxStopTicks", "TakeProfitTicks"]',
  'simple',
  'any',
  'any',
  '["stop loss", "take profit", "risk reward", "exit", "target"]',
  '["120 tick profit target", "Stop at sweep low", "1:2 risk/reward ratio"]'
);

-- Skill 10: Daily State Reset
INSERT INTO skills (name, slug, category, subcategory, description, code_snippet, variables_required, complexity, trading_style, timeframe, nlp_keywords, usage_examples)
VALUES (
  'Daily State Reset',
  'daily-state-reset',
  'Trade Management',
  'State Management',
  'Resets all strategy variables at the start of each new trading day. Prevents data from one day affecting the next. Essential for intraday strategies that rely on daily patterns.',
  'if (barTime.Date != currentDate)
{
    ResetDailyState();
    currentDate = barTime.Date;
}

private void ResetDailyState()
{
    // Pre-market
    pmHigh = 0;
    pmLow = 0;
    pmVWAP_num = 0;
    pmVWAP_den = 0;
    pmPOC = 0;
    pmPocPct = 50.0;
    pmBias = BiasType.Neutral;
    pmDataCollected = false;
    pmBiasCalculated = false;

    // Range
    rangeHigh = 0;
    rangeLow = 0;
    equilibrium = 0;
    rangeSet = false;

    // Trades
    tradeTaken = false;
    breakevenSet = false;
}',
  '["currentDate", "all state variables"]',
  'simple',
  'intraday',
  'intraday',
  '["reset", "new trading day", "state management", "daily reset", "clear state"]',
  '["Reset all daily variables", "Start fresh each day", "Prevent data contamination"]'
);

-- Verify insertion
SELECT 'Skills inserted: ' || COUNT(*) FROM skills;

//
// TtradesReversalV2Strategy
//
// Generated from: https://youtu.be/UBTl7za9obc
// Generated at: 2025-12-31 12:13:16
//
// Concepts detected:
//   entry_patterns: sweep, reversal, CISD, protected swings, order block, FVG
//   market_analysis: daily bias
//   market_structure: opening range
//   risk_management: stop loss, breakeven
//   trade_management: session windows
//
// Skills integrated (13 total):
//   [+] Automatic Breakeven Stop (Risk Management)
//   [+] CISD Pattern (Change in State of Delivery) (Entry Patterns)
//   [+] Daily State Reset (Trade Management)
//   [+] Fair Value Gap (Entry Patterns)
//   [+] Fixed Stop Loss & Take Profit (Risk Management)
//   [+] Liquidity Sweep Detection (Entry Patterns)
//   [+] Order Block (Entry Patterns)
//   [+] Range Building (Opening Range) (Market Structure)
//   [+] Time-based Session Windows (Trade Management)
//   [+] Candle 2 Closure (Reversal) (Entry Patterns)
//   [+] Daily Bias Determination (TTrades) (Market Analysis)
//   [+] Protected Swings (TTrades) (Entry Patterns)
//   [+] Reversal Sequence (5-Stage) (Entry Patterns)
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
{
    public class TtradesReversalV2Strategy : Strategy
    {
        #region Enums
        public enum BiasType { Neutral, Bullish, Bearish }
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

        // Entry Patterns Variables
        private double breakerBlockFormed;
        private double candle1High;
        private double candle1Low;
        private bool candle2Bearish;
        private bool candle2Bullish;
        private double cisdConfirmed;
        private bool cisd_triggered;
        private double downCloseSeriesHigh;
        private double fvgClosedAndFlipped;
        private bool highSwept;
        private bool liquiditySweepDetected;
        private bool lowSwept;
        private double newFVGFormed;
        private bool protectedSwingBearish;
        private bool protectedSwingBullish;
        private double protectedSwingLevel;
        private double rangeHigh;
        private double rangeLow;
        private double refCandleOpen;
        private int reversalStage;
        private int sweepBar;
        private int sweepDirection;
        private double sweepPrice;
        private double swingHigh;
        private double swingLow;
        private double upCloseSeriesLow;
        private double wickMidpoint;

        // Market Analysis Variables
        private double previousDayClose;
        private double previousDayHigh;
        private double previousDayLow;
        private double previousDayOpen;
        private double wickSize;

        // Market Structure Variables
        private double equilibrium;
        private bool rangeSet;

        // Current Day Tracking (for capturing previous day data)
        private double currentDayHigh;
        private double currentDayLow;
        private double currentDayOpen;
        private double currentDayClose;

        // Candle Series Tracking (for protected swings)
        private int consecutiveDownCloses;
        private int consecutiveUpCloses;

        // FVG Tracking
        private double fvgTop;
        private double fvgBottom;
        private int fvgDirection;  // 1 = bullish, -1 = bearish
        

        // Optimization tracking variables
        private int barsInPosition;
        private int consecutiveLossCount;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"TTrades ICT Reversal Strategy V2 - Dynamic skill integration";
                Name = "TtradesReversalV2";
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

                // Optimization filter defaults
                MinimumHoldBars = 10;
                EntryStartHour = 7;
                EntryEndHour = 9;
                EnableMonday = true;
                EnableTuesday = false;
                EnableWednesday = false;
                EnableThursday = true;
                EnableFriday = true;
                MaxConsecutiveLosses = 3;
            }
            else if (State == State.DataLoaded)
            {
                ClearOutputWindow();
                Print("=== TtradesReversalV2Strategy LOADED ===");
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < BarsRequiredToTrade) return;
            if (State == State.Realtime && IsFirstTickOfBar == false) return;

            DateTime barTime = Time[0];
            int hour = barTime.Hour;
            int minute = barTime.Minute;
            int currentMins = hour * 60 + minute;

            // Daily state reset
            if (barTime.Date != currentDate)
            {
                // Capture previous day data BEFORE resetting
                if (currentDayHigh > 0)  // Only if we have valid data
                {
                    previousDayHigh = currentDayHigh;
                    previousDayLow = currentDayLow;
                    previousDayOpen = currentDayOpen;
                    previousDayClose = currentDayClose;
                    if (EnableDebug) Print("Previous Day: O=" + previousDayOpen.ToString("F2") +
                        " H=" + previousDayHigh.ToString("F2") +
                        " L=" + previousDayLow.ToString("F2") +
                        " C=" + previousDayClose.ToString("F2"));
                }

                ResetDailyState();
                currentDate = barTime.Date;

                // Initialize current day tracking
                currentDayOpen = Open[0];
                currentDayHigh = High[0];
                currentDayLow = Low[0];
                currentDayClose = Close[0];

                if (EnableDebug) Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
            }
            else
            {
                // Update current day OHLC
                currentDayHigh = Math.Max(currentDayHigh, High[0]);
                currentDayLow = Math.Min(currentDayLow, Low[0]);
                currentDayClose = Close[0];
            }

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
            {

            //------------------------------------------------------------------
            // Daily Bias Determination (TTrades)
            // Mechanical framework for establishing daily directional bias. Each day price is ...
            //------------------------------------------------------------------
            // Daily Bias Determination - TTrades Framework
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
double pdEquilibrium = (previousDayHigh + previousDayLow) / 2.0;
if (previousDayClose > previousDayOpen && Low[0] > pdEquilibrium)
    isContinuationSetup = true; // Bullish continuation

// Set pmBias based on setup detection
if (isReversalSetup && Low[0] <= previousDayLow)
    pmBias = BiasType.Bullish;
else if (isReversalSetup && High[0] >= previousDayHigh)
    pmBias = BiasType.Bearish;
else if (isContinuationSetup && previousDayClose > previousDayOpen)
    pmBias = BiasType.Bullish;
else if (isContinuationSetup && previousDayClose < previousDayOpen)
    pmBias = BiasType.Bearish;

            }

            //==============================================================================
            // PHASE 2: RANGE/STRUCTURE BUILDING
            //==============================================================================
            // Range Building (Opening Range)
            // Captures the high and low during a specific time window (typically 7:00-7:40 AM)
            if (inRangeBuild)
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
                double rangeSizeTicks = (rangeHigh - rangeLow) / TickSize;
                if (rangeSizeTicks >= MinRangeTicks)
                {
                    equilibrium = (rangeHigh + rangeLow) / 2.0;
                    rangeSet = true;
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | RANGE SET: " + rangeLow.ToString("F2") + " - " + rangeHigh.ToString("F2") + " (" + rangeSizeTicks.ToString("F0") + " ticks)");
                }
                else
                {
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | RANGE TOO SMALL: " + rangeSizeTicks.ToString("F0") + " ticks < " + MinRangeTicks + " required");
                }
            }

            //==============================================================================
            // PHASE 3: EXECUTION WINDOW - ENTRY DETECTION
            //==============================================================================
            
            // Optimization: Entry time window filter
            if (hour < EntryStartHour || hour >= EntryEndHour)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP: Outside entry window");
                // Don't return - allow position management but block new entries
                if (Position.MarketPosition == MarketPosition.Flat) return;
            }

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
            }

            // Optimization: Loss streak limiter
            if (consecutiveLossCount >= MaxConsecutiveLosses && Position.MarketPosition == MarketPosition.Flat)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP: Loss streak limit (" + consecutiveLossCount + " losses)");
                return;
            }

            if (!inExecution)
            {
                ManageBreakeven();
                // Exit positions outside session
                if (!inSession && Position.MarketPosition != MarketPosition.Flat)
                {
                    if (Position.MarketPosition == MarketPosition.Long) ExitLong();
                    else ExitShort();
                }
                return;
            }

            // Already traded today
            if (tradeTaken) { ManageBreakeven(); return; }

            // Already in position
            if (Position.MarketPosition != MarketPosition.Flat) { ManageBreakeven(); return; }

            // Bias-based direction filter
            bool allowLong = pmBias == BiasType.Bullish || pmBias == BiasType.Neutral;
            bool allowShort = pmBias == BiasType.Bearish || pmBias == BiasType.Neutral;

            //------------------------------------------------------------------
            // ENTRY PATTERN DETECTION
            //------------------------------------------------------------------

            //------------------------------------------------------------------
            // Track Candle 1 Reference (for Candle 2 closure pattern)
            //------------------------------------------------------------------
            // Candle 1 is the bar before the sweep - track it when range is set
            if (rangeSet && candle1High == 0 && CurrentBar > 0)
            {
                candle1High = High[1];
                candle1Low = Low[1];
            }

            //------------------------------------------------------------------
            // Track Swing Highs/Lows and Candle Series (for protected swings)
            //------------------------------------------------------------------
            // Track recent swing extremes
            if (CurrentBar >= 3)
            {
                // Simple swing high: bar[1] higher than neighbors
                if (High[1] > High[2] && High[1] > High[0])
                    swingHigh = High[1];
                // Simple swing low: bar[1] lower than neighbors
                if (Low[1] < Low[2] && Low[1] < Low[0])
                    swingLow = Low[1];
            }

            // Track consecutive candle series for CISD
            if (is_bearish)
            {
                consecutiveDownCloses++;
                consecutiveUpCloses = 0;
                if (consecutiveDownCloses == 1 || High[0] > downCloseSeriesHigh)
                    downCloseSeriesHigh = High[0];
            }
            else if (is_bullish)
            {
                consecutiveUpCloses++;
                consecutiveDownCloses = 0;
                if (consecutiveUpCloses == 1 || Low[0] < upCloseSeriesLow || upCloseSeriesLow == 0)
                    upCloseSeriesLow = Low[0];
            }

            //------------------------------------------------------------------
            // CISD Pattern (Change in State of Delivery)
            // ICT (Inner Circle Trader) concept that confirms a reversal after a liquidity swe...
            //------------------------------------------------------------------
            // Track reference candle - most recent opposite direction candle
if (sweepDirection == 1 && is_bearish)
    refCandleOpen = Open[0];
if (sweepDirection == -1 && is_bullish)
    refCandleOpen = Open[0];

// Check for CISD (Change in State of Delivery)
bool cisd_valid = false;

// Long CISD: After low sweep, close above bearish candle's open
if (sweepDirection == 1 && refCandleOpen > 0 && Close[0] > refCandleOpen)
{
    cisd_valid = true;
    cisd_triggered = true;
    cisdConfirmed = 1.0;  // Set for reversal stage tracking
    tradeDirection = 1;
    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | CISD LONG confirmed");
}

// Short CISD: After high sweep, close below bullish candle's open
if (sweepDirection == -1 && refCandleOpen > 0 && Close[0] < refCandleOpen)
{
    cisd_valid = true;
    cisd_triggered = true;
    cisdConfirmed = 1.0;  // Set for reversal stage tracking
    tradeDirection = -1;
    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | CISD SHORT confirmed");
}


            //------------------------------------------------------------------
            // Fair Value Gap Detection
            //------------------------------------------------------------------
            // FVG: Gap between bar[2].low and bar[0].high (bullish) or bar[2].high and bar[0].low (bearish)
            bool bullishFVG = CurrentBar >= 2 && Low[2] > High[0];
            bool bearishFVG = CurrentBar >= 2 && High[2] < Low[0];

            // Detect new FVG formation
            if (bullishFVG && fvgDirection != 1)
            {
                fvgTop = Low[2];
                fvgBottom = High[0];
                fvgDirection = 1;
                // If we had a bearish FVG before, this is a flip
                if (sweepDirection == 1)
                {
                    fvgClosedAndFlipped = 1.0;  // Stage 2 signal
                    newFVGFormed = 1.0;  // Stage 4 signal
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | BULLISH FVG formed");
                }
            }
            if (bearishFVG && fvgDirection != -1)
            {
                fvgTop = Low[0];
                fvgBottom = High[2];
                fvgDirection = -1;
                if (sweepDirection == -1)
                {
                    fvgClosedAndFlipped = 1.0;  // Stage 2 signal
                    newFVGFormed = 1.0;  // Stage 4 signal
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | BEARISH FVG formed");
                }
            }

            // Check if price closed through FVG (inversion)
            if (fvgDirection == 1 && Close[0] > fvgTop)
                fvgClosedAndFlipped = 1.0;
            if (fvgDirection == -1 && Close[0] < fvgBottom)
                fvgClosedAndFlipped = 1.0;


            //------------------------------------------------------------------
            // Liquidity Sweep Detection
            // Detects when price sweeps above the range high or below the range low, potential...
            //------------------------------------------------------------------
            // Detect sweep (only track first sweep of the day)
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
        liquiditySweepDetected = true;  // Stage 1 of reversal sequence
        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SWEEP LOW @ " + sweepPrice.ToString("F2"));
    }

    // High sweep - potential short setup
    if (High[0] > rangeHigh && allowShort)
    {
        highSwept = true;
        sweepPrice = High[0];
        sweepBar = CurrentBar;
        sweepDirection = -1;
        refCandleOpen = 0;
        liquiditySweepDetected = true;  // Stage 1 of reversal sequence
        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SWEEP HIGH @ " + sweepPrice.ToString("F2"));
    }
}


            //------------------------------------------------------------------
            // Order Block Detection
            //------------------------------------------------------------------
            // OB: Last opposing candle before a strong directional move
            // Use sweep price as stop reference when OB is detected
            if (sweepDirection != 0 && sweepPrice > 0 && stopLoss == 0)
            {
                // Set stop loss based on sweep price (order block level)
                stopLoss = sweepPrice;
            }

            // Breaker Block: When price breaks through a failed OB level
            // For long: Previous resistance (OB high) becomes support
            // For short: Previous support (OB low) becomes resistance
            if (sweepDirection == 1 && cisdConfirmed > 0 && Close[0] > rangeHigh)
            {
                breakerBlockFormed = 1.0;  // Stage 5 signal
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | BREAKER BLOCK LONG");
            }
            if (sweepDirection == -1 && cisdConfirmed > 0 && Close[0] < rangeLow)
            {
                breakerBlockFormed = 1.0;  // Stage 5 signal
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | BREAKER BLOCK SHORT");
            }


            //------------------------------------------------------------------
            // Candle 2 Closure (Reversal)
            // Candle 2 is the reversal point in the fractal model. It must: (1) Sweep Candle 1...
            //------------------------------------------------------------------
            // Candle 2 Closure Detection - Reversal Setup
// Conditions: Sweep C1 extreme + close back inside C1 range
candle2Bullish = false;
candle2Bearish = false;

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
}


            //------------------------------------------------------------------
            // Protected Swings (TTrades)
            // A protected swing is a high/low expected to hold if the current trend continues....
            //------------------------------------------------------------------
            // Protected Swing Detection - TTrades Framework
// Method 1: From FVG - price enters FVG, closes through candle series
// Method 2: From Sweep - sweep low/high, close through opposing candles
protectedSwingBullish = false;
protectedSwingBearish = false;
protectedSwingLevel = 0;

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
}


            //------------------------------------------------------------------
            // Reversal Sequence (5-Stage)
            // Structured 5-stage reversal process: (1) PURGE/TURTLE SOUP - sweep of liquidity ...
            //------------------------------------------------------------------
            // Reversal Sequence - TTrades 5-Stage Framework
// Stage progression provides increasing confirmation
// Reset stage each bar to recalculate
reversalStage = 0;

// Stage 1: Purge (Liquidity Sweep)
if (liquiditySweepDetected)
    reversalStage = 1;

// Stage 2: Inversion (FVG closure + flip)
if (reversalStage >= 1 && fvgClosedAndFlipped > 0)
    reversalStage = 2;

// Stage 3: CISD (Closure through opposing candles)
if (reversalStage >= 2 && cisdConfirmed > 0)
    reversalStage = 3;

// Stage 4: New FVG in opposite direction
if (reversalStage >= 3 && newFVGFormed > 0)
    reversalStage = 4;

// Stage 5: Breaker Block (Failed level reused)
if (reversalStage >= 4 && breakerBlockFormed > 0)
    reversalStage = 5;

// Entry allowed after Stage 1+ (sweep required minimum)
// Higher stages = more confirmation
bool entryAllowed = reversalStage >= 1;

if (EnableDebug && reversalStage > 0)
    Print(Time[0].ToString("HH:mm") + " | REVERSAL STAGE: " + reversalStage + "/5");


            //------------------------------------------------------------------
            // ENTRY EXECUTION (if entry conditions met)
            //------------------------------------------------------------------
            if (tradeDirection != 0 && !tradeTaken && entryAllowed)
            {
                double stopDistance = tradeDirection == 1
                    ? Close[0] - stopLoss
                    : stopLoss - Close[0];
                double stopDistanceTicks = stopDistance / TickSize;

                if (EnableDebug)
                    Print(Time[0].ToString("HH:mm") + " | ENTRY SIGNAL | Dir:" + tradeDirection + " Stage:" + reversalStage + " StopDist:" + stopDistanceTicks.ToString("F0"));

                if (stopDistanceTicks <= MaxStopTicks && stopDistanceTicks > 0)
                {
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
                    {
                        activeOrderName = "L";
                        EnterLong(activeOrderName);
                        Print(">>> LONG @ " + entryPrice.ToString("F2") + " SL:" + stopLoss.ToString("F2") + " TP:" + takeProfit.ToString("F2"));
                    }
                    else
                    {
                        activeOrderName = "S";
                        EnterShort(activeOrderName);
                        Print(">>> SHORT @ " + entryPrice.ToString("F2") + " SL:" + stopLoss.ToString("F2") + " TP:" + takeProfit.ToString("F2"));
                    }
                }
            }
        }

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
        }

        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            if (marketPosition == MarketPosition.Long || marketPosition == MarketPosition.Short)
            {
                SetStopLoss(execution.Order.Name, CalculationMode.Price, stopLoss, false);
                SetProfitTarget(execution.Order.Name, CalculationMode.Price, takeProfit);
            }
        }

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            // Track consecutive losses for streak limiter
            if (marketPosition == MarketPosition.Flat && Position.Quantity == 0)
            {
                double pnl = Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, Close[0]);
                if (pnl < 0)
                    consecutiveLossCount++;
                else if (pnl > 0)
                    consecutiveLossCount = 0;
            }
            if (marketPosition == MarketPosition.Flat)
            {
                breakevenSet = false;
                // Allow new trades after position closes
                // tradeTaken = false;  // Uncomment to allow multiple trades per day
            }
        }

        private void ResetDailyState()
        {
            // Core reset
            tradeDirection = 0;
            entryPrice = 0;
            stopLoss = 0;
            takeProfit = 0;
            tradeTaken = false;
            activeOrderName = "";
            breakevenSet = false;
            pmBias = BiasType.Neutral;

            // Entry Patterns reset
            breakerBlockFormed = 0.0;
            candle1High = 0.0;
            candle1Low = 0.0;
            candle2Bearish = false;
            candle2Bullish = false;
            cisdConfirmed = 0.0;
            cisd_triggered = false;
            downCloseSeriesHigh = 0.0;
            fvgClosedAndFlipped = 0.0;
            highSwept = false;
            liquiditySweepDetected = false;
            lowSwept = false;
            newFVGFormed = 0.0;
            protectedSwingBearish = false;
            protectedSwingBullish = false;
            protectedSwingLevel = 0.0;
            rangeHigh = 0.0;
            rangeLow = 0.0;
            refCandleOpen = 0.0;
            reversalStage = 0;
            sweepBar = 0;
            sweepDirection = 0;
            sweepPrice = 0.0;
            swingHigh = 0.0;
            swingLow = 0.0;
            upCloseSeriesLow = 0.0;
            wickMidpoint = 0.0;
            // Market Analysis reset
            // NOTE: previousDay* values are NOT reset - they're captured at day change
            wickSize = 0.0;

            // Market Structure reset
            equilibrium = 0.0;
            rangeSet = false;

            // FVG tracking reset
            fvgTop = 0.0;
            fvgBottom = 0.0;
            fvgDirection = 0;

            // Candle series tracking reset
            consecutiveDownCloses = 0;
            consecutiveUpCloses = 0;

            // Current day OHLC is reset at day change, not here
        }

        #region Properties
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
        public int SessionEndHour { get; set; }

        // Risk Management
        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Max Stop (Ticks)", Order = 1, GroupName = "2. Risk Management")]
        public int MaxStopTicks { get; set; }

        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Take Profit (Ticks)", Order = 2, GroupName = "2. Risk Management")]
        public int TakeProfitTicks { get; set; }

        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Breakeven Threshold (Ticks)", Order = 3, GroupName = "2. Risk Management")]
        public int BreakevenTicks { get; set; }

        [NinjaScriptProperty]
        [Range(1, 500)]
        [Display(Name = "Min Range Size (Ticks)", Order = 4, GroupName = "2. Risk Management")]
        public int MinRangeTicks { get; set; }

        [NinjaScriptProperty]
        [Range(0, 20)]
        [Display(Name = "Stop Buffer (Ticks)", Order = 5, GroupName = "2. Risk Management")]
        public int StopBufferTicks { get; set; }

        // Bias Settings
        [NinjaScriptProperty]
        [Range(50, 70)]
        [Display(Name = "Bullish Threshold %", Order = 1, GroupName = "3. Bias Settings")]
        public double BullishThreshold { get; set; }

        [NinjaScriptProperty]
        [Range(30, 50)]
        [Display(Name = "Bearish Threshold %", Order = 2, GroupName = "3. Bias Settings")]
        public double BearishThreshold { get; set; }

        // Debug
        [NinjaScriptProperty]
        [Display(Name = "Enable Debug", Order = 1, GroupName = "4. Debug")]
        public bool EnableDebug { get; set; }
        
        // Optimization Filter: Minimum Hold Duration
        [NinjaScriptProperty]
        [Range(1, 50)]
        [Display(Name = "Minimum Hold Bars", Order = 1, GroupName = "5. Optimization Filters")]
        public int MinimumHoldBars { get; set; }

        // Optimization Filter: Entry Time Window
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Entry Start Hour", Order = 2, GroupName = "5. Optimization Filters")]
        public int EntryStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Entry End Hour", Order = 3, GroupName = "5. Optimization Filters")]
        public int EntryEndHour { get; set; }

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
        public bool EnableFriday { get; set; }

        // Optimization Filter: Loss Streak Limiter
        [NinjaScriptProperty]
        [Range(1, 20)]
        [Display(Name = "Max Consecutive Losses", Order = 9, GroupName = "5. Optimization Filters")]
        public int MaxConsecutiveLosses { get; set; }
        #endregion
    }
}

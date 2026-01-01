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
    public class TtradesReversalV4Strategy : Strategy
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
        #endregion
        // ERL/IRL Tracking (External/Internal Range Liquidity)
        private bool inPremiumZone;   // Above equilibrium
        private bool inDiscountZone;  // Below equilibrium
        private double erlTarget;     // External Range Liquidity target (PDH/PDL)
        private double irlLevel;
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

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"TTrades ICT Reversal Strategy V2 - Dynamic skill integration";
                Name = "TtradesReversalV4";
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

                // ERL/IRL and Zone Defaults
                UsePremiumDiscountZones = true;
                UseDynamicTargets = true;
                MinReversalStage = 2;
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



                // ERL/IRL and Zone Defaults
                UsePremiumDiscountZones = true;
                UseDynamicTargets = true;
                MinReversalStage = 2;
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
bool entryAllowed = reversalStage >= MinReversalStage;

if (EnableDebug && reversalStage > 0)
    Print(Time[0].ToString("HH:mm") + " | REVERSAL STAGE: " + reversalStage + "/5");


            
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
                        // V4 FIXED: Calculate dynamic target with direction guard and Asia/London session levels
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
                    }
                    }
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

            // ERL/IRL reset
            inPremiumZone = false;
            inDiscountZone = false;
            erlTarget = 0.0;
            irlLevel = 0.0;

            
            
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

            // ERL/IRL reset
            inPremiumZone = false;
            inDiscountZone = false;
            erlTarget = 0.0;
            irlLevel = 0.0;

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

        #endregion
    }
}

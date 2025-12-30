//
// TopdownchartlessonStrategy
//
// Generated from YouTube: https://www.youtube.com/watch?v=UBTl7za9obc
// Generated at: 2025-12-30 16:19:04
//
// Concepts detected:
//   entry_patterns: fair value gap, order block, sweep
//   risk_management: target, stop
//   market_structure: trend, range
//
// Skills used ([+] = has code, [o] = reference only):
//   [+] Pre-market Bias Calculation (VWAP-POC) (Market Analysis)
//   [+] Range Building (Opening Range) (Market Structure)
//   [+] Liquidity Sweep Detection (Entry Patterns)
//   [+] CISD Pattern (Change in State of Delivery) (Entry Patterns)
//   [+] Range Breakout Detection (Entry Patterns)
//   [+] Automatic Breakeven Stop (Risk Management)
//
// Components: position, time_windows, bias, range, sweep, cisd, breakout, breakeven
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
    public class TopdownchartlessonStrategy : Strategy
    {
        #region Enums
        public enum BiasType { Neutral, Bullish, Bearish }
        #endregion

        #region Variables

        // Position Management
        private int tradeDirection;  // 1 = long, -1 = short
        private double entryPrice;
        private double stopLoss;
        private double takeProfit;
        private bool tradeTaken;
        private string activeOrderName;

        // Tracking
        private DateTime currentDate;

        // Pre-market Bias State
        private double pmHigh;
        private double pmLow;
        private double pmVWAP_num;
        private double pmVWAP_den;
        private double pmPOC;
        private double pmPocPct;
        private BiasType pmBias;
        private bool pmDataCollected;
        private bool pmBiasCalculated;

        // Range Building State
        private double rangeHigh;
        private double rangeLow;
        private double equilibrium;
        private bool rangeSet;

        // Sweep State (Scenario A)
        private bool highSwept;
        private bool lowSwept;
        private double sweepPrice;
        private int sweepBar;
        private int sweepDirection;  // 1 = long setup, -1 = short setup
        private double refCandleOpen;
        private bool cisd_triggered;

        // Breakout + Pullback State (Scenario B)
        private bool breakoutDetected;
        private bool pullbackDetected;
        private double breakoutRefCandleOpen;
        private int breakoutDirection;  // 1 = bullish breakout, -1 = bearish breakout

        // Breakeven State
        private bool breakevenSet;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"Auto-generated from YouTube top-down analysis";
                Name = "Topdownchartlesson";
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


                // Time Settings (chart timezone - adjust if needed)
                PremarketStartHour = 3;
                PremarketEndHour = 7;
                RangeStartHour = 7;
                RangeStartMinute = 0;
                RangeEndHour = 7;
                RangeEndMinute = 40;
                ExecutionEndHour = 9;
                ExecutionEndMinute = 30;
                SessionEndHour = 16;

                // Bias Settings
                BullishThreshold = 55.0;
                BearishThreshold = 45.0;

                MinRangeTicks = 20;      // Minimum range size to trade

                BreakevenTicks = 80;     // Move to BE after this profit

                MaxStopTicks = 200;
                TakeProfitTicks = 120;
                EnableDebug = true;
            }
            else if (State == State.DataLoaded)
            {
                ClearOutputWindow();
                Print("=== TopdownchartlessonStrategy LOADED ===");
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

            if (barTime.Date != currentDate)
            {
                ResetDailyState();
                currentDate = barTime.Date;
                if (EnableDebug) Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
            }

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
            // Pre-market tracking
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
}

            //==============================================================================
            // RANGE BUILDING
            //==============================================================================
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
    equilibrium = (rangeHigh + rangeLow) / 2.0;
    rangeSet = true;
}

            //==============================================================================
            // EXECUTION WINDOW
            //==============================================================================
            if (!inExecution || !rangeSet)
            {
                ManageBreakeven();
                if (!inSession && Position.MarketPosition != MarketPosition.Flat)
                {
                    if (Position.MarketPosition == MarketPosition.Long) ExitLong();
                    else ExitShort();
                }
                return;
            }

            if (tradeTaken) { ManageBreakeven(); return; }
            if (Position.MarketPosition != MarketPosition.Flat) { ManageBreakeven(); return; }

            double rangeSizeTicks = (rangeHigh - rangeLow) / TickSize;
            if (rangeSizeTicks < MinRangeTicks) return;

            bool allowLong = pmBias == BiasType.Bullish || pmBias == BiasType.Neutral;
            bool allowShort = pmBias == BiasType.Bearish || pmBias == BiasType.Neutral;
            bool is_bullish = Close[0] > Open[0];
            bool is_bearish = Close[0] < Open[0];


            //==============================================================================
            // SCENARIO A: SWEEP + CISD (Reversal Pattern)
            //==============================================================================

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
}

            // CISD Detection after sweep
            if (sweepDirection != 0 && CurrentBar > sweepBar)
            {
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
    tradeDirection = 1;
}

// Short CISD: After high sweep, close below bullish candle's open
if (sweepDirection == -1 && refCandleOpen > 0 && Close[0] < refCandleOpen)
{
    cisd_valid = true;
    cisd_triggered = true;
    tradeDirection = -1;
}

                // ENTRY - Scenario A
                if (cisd_valid)
                {
                    double stopDistance = tradeDirection == 1 ? Close[0] - sweepPrice : sweepPrice - Close[0];
                    double stopDistanceTicks = stopDistance / TickSize;

                    if (EnableDebug)
                        Print(Time[0].ToString("HH:mm") + " | [A] ENTRY | StopDist:" + stopDistanceTicks.ToString("F0"));

                    if (stopDistanceTicks <= MaxStopTicks && stopDistanceTicks > 0)
                    {
                        entryPrice = Close[0];
                        stopLoss = sweepPrice;
                        takeProfit = tradeDirection == 1 ? Close[0] + (TakeProfitTicks * TickSize) : Close[0] - (TakeProfitTicks * TickSize);
                        breakevenSet = false;
                        tradeTaken = true;

                        if (tradeDirection == 1)
                        {
                            activeOrderName = "L";
                            EnterLong(activeOrderName);
                            Print(">>> [A] LONG @ " + entryPrice.ToString("F2"));
                        }
                        else
                        {
                            activeOrderName = "S";
                            EnterShort(activeOrderName);
                            Print(">>> [A] SHORT @ " + entryPrice.ToString("F2"));
                        }
                        return;
                    }
                }
            }

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
            if (marketPosition == MarketPosition.Flat) breakevenSet = false;
        }

        private void ResetDailyState()
        {

            // Position reset
            tradeDirection = 0;
            entryPrice = 0;
            stopLoss = 0;
            takeProfit = 0;
            tradeTaken = false;
            activeOrderName = "";

            // Pre-market reset
            pmHigh = 0;
            pmLow = 0;
            pmVWAP_num = 0;
            pmVWAP_den = 0;
            pmPOC = 0;
            pmPocPct = 50.0;
            pmBias = BiasType.Neutral;
            pmDataCollected = false;
            pmBiasCalculated = false;

            // Range reset
            rangeHigh = 0;
            rangeLow = 0;
            equilibrium = 0;
            rangeSet = false;

            // Scenario A reset
            highSwept = false;
            lowSwept = false;
            sweepPrice = 0;
            sweepBar = 0;
            sweepDirection = 0;
            refCandleOpen = 0;
            cisd_triggered = false;

            // Scenario B reset
            breakoutDetected = false;
            pullbackDetected = false;
            breakoutRefCandleOpen = 0;
            breakoutDirection = 0;

            breakevenSet = false;
        }

        #region Properties
        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Max Stop (Ticks)", Order = 1, GroupName = "2. Risk Management")]
        public int MaxStopTicks { get; set; }

        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Take Profit (Ticks)", Order = 2, GroupName = "2. Risk Management")]
        public int TakeProfitTicks { get; set; }


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

        // Bias Settings
        [NinjaScriptProperty]
        [Range(50, 70)]
        [Display(Name = "Bullish Threshold %", Order = 1, GroupName = "3. Bias Settings")]
        public double BullishThreshold { get; set; }

        [NinjaScriptProperty]
        [Range(30, 50)]
        [Display(Name = "Bearish Threshold %", Order = 2, GroupName = "3. Bias Settings")]
        public double BearishThreshold { get; set; }

        [NinjaScriptProperty]
        [Range(1, 500)]
        [Display(Name = "Min Range Size (Ticks)", Order = 4, GroupName = "2. Risk Management")]
        public int MinRangeTicks { get; set; }

        [NinjaScriptProperty]
        [Range(1, 1000)]
        [Display(Name = "Breakeven Threshold (Ticks)", Order = 3, GroupName = "2. Risk Management")]
        public int BreakevenTicks { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Debug", Order = 1, GroupName = "4. Debug")]
        public bool EnableDebug { get; set; }
        #endregion
    }
}

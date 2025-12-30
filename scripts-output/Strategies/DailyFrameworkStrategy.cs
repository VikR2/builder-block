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

//
// DailyFrameworkStrategy
//
// Generated from SAD: 2025-12-30-sweep_091631.md
// Source: https://www.youtube.com/watch?v=-KKuZb5Z5aU
// Video: Simple Daily Framework - Candle Closures and Wick Size
//
// Strategy Logic:
// 1. Use previous day close position to determine bias
// 2. Look for reversal at PDH/PDL with shallow wick
// 3. Look for continuation after pullback to EQ
// 4. Candle closure confirms entry direction
//

namespace NinjaTrader.NinjaScript.Strategies
{
    public class DailyFrameworkStrategy : Strategy
    {
        #region Enums
        public enum BiasType
        {
            Neutral,
            Bullish,
            Bearish
        }

        public enum SetupType
        {
            None,
            Reversal,
            Continuation
        }
        #endregion

        #region Variables
        // Previous Day Levels
        private double previousDayHigh;
        private double previousDayLow;
        private double previousDayClose;
        private double previousDayOpen;
        private double previousDayEQ;

        // Daily Bias State
        private BiasType dailyBias;
        private bool biasCalculated;

        // Current Day State
        private double todayOpen;
        private double todayHigh;
        private double todayLow;
        private bool todayDataCollected;

        // Setup Detection
        private SetupType currentSetup;
        private bool setupDetected;
        private double setupPrice;
        private int setupBar;
        private int setupDirection;  // 1 = long, -1 = short

        // Entry State
        private bool entryTriggered;
        private double entryPrice;
        private int tradeDirection;

        // Position Management
        private double stopLoss;
        private double takeProfit;
        private bool breakevenSet;
        private bool tradeTaken;

        // Tracking
        private DateTime currentDate;
        private string activeOrderName;

        // Indicators
        private PriorDayOHLC priorDayOHLC;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"Daily Framework Strategy - Reversal and Continuation setups based on previous day levels, candle closures, and wick size analysis.";
                Name = "DailyFrameworkStrategy";

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

                // Risk Management Parameters
                MaxStopTicks = 100;
                TakeProfitTicks = 150;
                BreakevenTicks = 50;

                // Wick Analysis Parameters
                ShallowWickRatio = 0.5;   // Wick must be < 50% of body for shallow
                LargeWickRatio = 1.0;     // Wick > 100% of body is large

                // Bias Parameters
                BullishCloseThreshold = 0.75;  // Close in upper 25% = bullish
                BearishCloseThreshold = 0.25;  // Close in lower 25% = bearish

                // Session Parameters
                SessionStartHour = 9;
                SessionStartMinute = 30;
                SessionEndHour = 16;
                SessionEndMinute = 0;

                // Debug
                EnableDebug = true;
            }
            else if (State == State.Configure)
            {
                // No additional data series needed for daily framework
            }
            else if (State == State.DataLoaded)
            {
                priorDayOHLC = PriorDayOHLC();

                ClearOutputWindow();
                Print("========================================");
                Print("DailyFrameworkStrategy LOADED");
                Print("Instrument: " + Instrument.FullName);
                Print("TickSize: " + TickSize);
                Print("========================================");
            }
            else if (State == State.Realtime)
            {
                Print("NOW IN REALTIME MODE");
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < BarsRequiredToTrade)
                return;

            // Real-time: only process on bar close
            if (State == State.Realtime && IsFirstTickOfBar == false)
                return;

            DateTime barTime = Time[0];
            int hour = barTime.Hour;
            int minute = barTime.Minute;
            int currentMins = hour * 60 + minute;

            // Calculate session boundaries
            int sessionStartMins = SessionStartHour * 60 + SessionStartMinute;
            int sessionEndMins = SessionEndHour * 60 + SessionEndMinute;
            bool inSession = currentMins >= sessionStartMins && currentMins < sessionEndMins;

            //==============================================================================
            // NEW DAY DETECTION & RESET
            //==============================================================================
            if (barTime.Date != currentDate)
            {
                ResetDailyState();
                currentDate = barTime.Date;

                // Capture previous day levels
                if (priorDayOHLC != null && CurrentBar > 1)
                {
                    previousDayHigh = priorDayOHLC.PriorHigh[0];
                    previousDayLow = priorDayOHLC.PriorLow[0];
                    previousDayClose = priorDayOHLC.PriorClose[0];
                    previousDayOpen = priorDayOHLC.PriorOpen[0];
                    previousDayEQ = (previousDayHigh + previousDayLow) / 2.0;

                    // Calculate daily bias from previous day close position
                    CalculateDailyBias();
                }

                if (EnableDebug)
                {
                    Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
                    Print("PDH: " + previousDayHigh.ToString("F2") + " | PDL: " + previousDayLow.ToString("F2"));
                    Print("PDC: " + previousDayClose.ToString("F2") + " | EQ: " + previousDayEQ.ToString("F2"));
                    Print("BIAS: " + dailyBias);
                }
            }

            //==============================================================================
            // TRACK TODAY'S OPEN (First bar of session)
            //==============================================================================
            if (Bars.IsFirstBarOfSession && !todayDataCollected)
            {
                todayOpen = Open[0];
                todayHigh = High[0];
                todayLow = Low[0];
                todayDataCollected = true;

                if (EnableDebug)
                    Print(barTime.ToString("HH:mm") + " | Session Open: " + todayOpen.ToString("F2"));
            }

            // Update today's high/low
            if (todayDataCollected)
            {
                todayHigh = Math.Max(todayHigh, High[0]);
                todayLow = Math.Min(todayLow, Low[0]);
            }

            //==============================================================================
            // SKIP IF NOT IN SESSION OR ALREADY TRADED
            //==============================================================================
            if (!inSession)
            {
                // Manage breakeven even outside session
                ManageBreakeven();

                // EOD Exit
                if (Position.MarketPosition != MarketPosition.Flat && currentMins >= sessionEndMins)
                {
                    if (EnableDebug) Print("EOD EXIT");
                    if (Position.MarketPosition == MarketPosition.Long)
                        ExitLong();
                    else
                        ExitShort();
                }
                return;
            }

            if (tradeTaken)
            {
                ManageBreakeven();
                return;
            }

            if (Position.MarketPosition != MarketPosition.Flat)
            {
                ManageBreakeven();
                return;
            }

            // Need valid previous day data
            if (previousDayHigh == 0 || previousDayLow == 0)
                return;

            //==============================================================================
            // CANDLE ANALYSIS
            //==============================================================================
            // Candle closure direction
            bool isBullishClose = Close[0] > Open[0];
            bool isBearishClose = Close[0] < Open[0];

            // Wick size analysis
            double body = Math.Abs(Close[0] - Open[0]);
            double upperWick = High[0] - Math.Max(Open[0], Close[0]);
            double lowerWick = Math.Min(Open[0], Close[0]) - Low[0];

            bool shallowUpperWick = body > 0 && upperWick < body * ShallowWickRatio;
            bool shallowLowerWick = body > 0 && lowerWick < body * ShallowWickRatio;
            bool largeUpperWick = body > 0 && upperWick > body * LargeWickRatio;
            bool largeLowerWick = body > 0 && lowerWick > body * LargeWickRatio;

            //==============================================================================
            // SETUP DETECTION: REVERSAL AT PDH/PDL
            //==============================================================================
            // Reversal SHORT setup: Price trades into PDH with shallow upper wick
            if (!setupDetected && dailyBias != BiasType.Bullish)
            {
                if (High[0] >= previousDayHigh && isBearishClose && shallowUpperWick)
                {
                    // Bearish reversal at PDH
                    currentSetup = SetupType.Reversal;
                    setupDetected = true;
                    setupDirection = -1;
                    setupPrice = Close[0];
                    setupBar = CurrentBar;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | REVERSAL SHORT SETUP @ PDH | Close: " + Close[0].ToString("F2"));
                }
            }

            // Reversal LONG setup: Price trades into PDL with shallow lower wick
            if (!setupDetected && dailyBias != BiasType.Bearish)
            {
                if (Low[0] <= previousDayLow && isBullishClose && shallowLowerWick)
                {
                    // Bullish reversal at PDL
                    currentSetup = SetupType.Reversal;
                    setupDetected = true;
                    setupDirection = 1;
                    setupPrice = Close[0];
                    setupBar = CurrentBar;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | REVERSAL LONG SETUP @ PDL | Close: " + Close[0].ToString("F2"));
                }
            }

            //==============================================================================
            // SETUP DETECTION: CONTINUATION AFTER EQ RESPECT
            //==============================================================================
            // Continuation LONG: Price pulls back to EQ, respects it, closes bullish
            if (!setupDetected && dailyBias == BiasType.Bullish)
            {
                // Check if we've traded down to EQ and bounced
                if (Low[0] <= previousDayEQ && Close[0] > previousDayEQ && isBullishClose)
                {
                    currentSetup = SetupType.Continuation;
                    setupDetected = true;
                    setupDirection = 1;
                    setupPrice = Close[0];
                    setupBar = CurrentBar;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | CONTINUATION LONG SETUP @ EQ | Close: " + Close[0].ToString("F2"));
                }
            }

            // Continuation SHORT: Price pulls back to EQ, respects it, closes bearish
            if (!setupDetected && dailyBias == BiasType.Bearish)
            {
                // Check if we've traded up to EQ and rejected
                if (High[0] >= previousDayEQ && Close[0] < previousDayEQ && isBearishClose)
                {
                    currentSetup = SetupType.Continuation;
                    setupDetected = true;
                    setupDirection = -1;
                    setupPrice = Close[0];
                    setupBar = CurrentBar;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | CONTINUATION SHORT SETUP @ EQ | Close: " + Close[0].ToString("F2"));
                }
            }

            //==============================================================================
            // ENTRY TRIGGER: Confirmation candle after setup
            //==============================================================================
            if (setupDetected && CurrentBar > setupBar && !entryTriggered)
            {
                bool confirmLong = setupDirection == 1 && isBullishClose && Close[0] > setupPrice;
                bool confirmShort = setupDirection == -1 && isBearishClose && Close[0] < setupPrice;

                if (confirmLong || confirmShort)
                {
                    // Calculate stop and target
                    if (confirmLong)
                    {
                        tradeDirection = 1;
                        entryPrice = Close[0];

                        // Stop below setup candle low or PDL
                        if (currentSetup == SetupType.Reversal)
                            stopLoss = Math.Min(Low[setupBar - CurrentBar], previousDayLow) - TickSize;
                        else
                            stopLoss = previousDayEQ - (MaxStopTicks * TickSize);

                        takeProfit = entryPrice + (TakeProfitTicks * TickSize);
                    }
                    else
                    {
                        tradeDirection = -1;
                        entryPrice = Close[0];

                        // Stop above setup candle high or PDH
                        if (currentSetup == SetupType.Reversal)
                            stopLoss = Math.Max(High[setupBar - CurrentBar], previousDayHigh) + TickSize;
                        else
                            stopLoss = previousDayEQ + (MaxStopTicks * TickSize);

                        takeProfit = entryPrice - (TakeProfitTicks * TickSize);
                    }

                    // Validate stop distance
                    double stopDistanceTicks = Math.Abs(entryPrice - stopLoss) / TickSize;
                    if (stopDistanceTicks > MaxStopTicks)
                    {
                        if (EnableDebug)
                            Print(barTime.ToString("HH:mm") + " | SKIP: Stop too large (" + stopDistanceTicks.ToString("F0") + " ticks)");

                        // Reset setup and look for new one
                        setupDetected = false;
                        currentSetup = SetupType.None;
                        return;
                    }

                    // Execute entry
                    entryTriggered = true;
                    tradeTaken = true;
                    breakevenSet = false;

                    if (tradeDirection == 1)
                    {
                        activeOrderName = currentSetup == SetupType.Reversal ? "RevLong" : "ContLong";
                        EnterLong(activeOrderName);
                        Print(">>> " + currentSetup + " LONG ENTRY @ " + entryPrice.ToString("F2") + " | SL: " + stopLoss.ToString("F2") + " | TP: " + takeProfit.ToString("F2"));
                    }
                    else
                    {
                        activeOrderName = currentSetup == SetupType.Reversal ? "RevShort" : "ContShort";
                        EnterShort(activeOrderName);
                        Print(">>> " + currentSetup + " SHORT ENTRY @ " + entryPrice.ToString("F2") + " | SL: " + stopLoss.ToString("F2") + " | TP: " + takeProfit.ToString("F2"));
                    }
                }
            }

            //==============================================================================
            // SETUP INVALIDATION: Large wick on setup candle means wait for candle 3
            //==============================================================================
            if (setupDetected && CurrentBar == setupBar)
            {
                // If setup candle has large wick, invalidate and wait
                bool invalidWick = (setupDirection == 1 && largeLowerWick) || (setupDirection == -1 && largeUpperWick);
                if (invalidWick)
                {
                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | Setup invalidated - large wick, waiting for candle 3");

                    setupDetected = false;
                    currentSetup = SetupType.None;
                }
            }
        }

        //==============================================================================
        // DAILY BIAS CALCULATION
        //==============================================================================
        private void CalculateDailyBias()
        {
            if (previousDayHigh == previousDayLow)
            {
                dailyBias = BiasType.Neutral;
                biasCalculated = true;
                return;
            }

            double range = previousDayHigh - previousDayLow;
            double closePosition = (previousDayClose - previousDayLow) / range;

            if (closePosition >= BullishCloseThreshold)
                dailyBias = BiasType.Bullish;   // Closed in upper quarter - bullish
            else if (closePosition <= BearishCloseThreshold)
                dailyBias = BiasType.Bearish;   // Closed in lower quarter - bearish
            else
                dailyBias = BiasType.Neutral;

            biasCalculated = true;
        }

        //==============================================================================
        // BREAKEVEN MANAGEMENT
        //==============================================================================
        private void ManageBreakeven()
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
                SetStopLoss(activeOrderName, CalculationMode.Price, Position.AveragePrice, false);

                if (EnableDebug)
                    Print(">>> BREAKEVEN SET @ " + Position.AveragePrice.ToString("F2") + " | Profit was: " + profitTicks.ToString("F0") + " ticks");
            }
        }

        //==============================================================================
        // ORDER/EXECUTION HANDLERS
        //==============================================================================
        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            if (EnableDebug)
                Print(time.ToString("HH:mm:ss") + " | FILL: " + execution.Order.Name + " | " + marketPosition + " | Qty:" + quantity + " @ " + price.ToString("F2"));

            // Set stops and targets after fill
            if (marketPosition == MarketPosition.Long || marketPosition == MarketPosition.Short)
            {
                SetStopLoss(execution.Order.Name, CalculationMode.Price, stopLoss, false);
                SetProfitTarget(execution.Order.Name, CalculationMode.Price, takeProfit);

                double stopTicks = Math.Abs(price - stopLoss) / TickSize;
                if (EnableDebug)
                    Print("Set SL: " + stopLoss.ToString("F2") + " (" + stopTicks.ToString("F0") + " ticks) | TP: " + takeProfit.ToString("F2"));
            }
        }

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            if (EnableDebug)
                Print("POSITION: " + marketPosition + " | Qty: " + quantity + " @ " + averagePrice.ToString("F2"));

            if (marketPosition == MarketPosition.Flat)
            {
                breakevenSet = false;
                if (EnableDebug)
                    Print("Position FLAT - Trade complete");
            }
        }

        //==============================================================================
        // DAILY RESET
        //==============================================================================
        private void ResetDailyState()
        {
            // Previous day levels reset when new day captured
            // Don't reset here as we need them for the new day

            // Reset bias
            dailyBias = BiasType.Neutral;
            biasCalculated = false;

            // Reset today's data
            todayOpen = 0;
            todayHigh = 0;
            todayLow = 0;
            todayDataCollected = false;

            // Reset setup state
            currentSetup = SetupType.None;
            setupDetected = false;
            setupPrice = 0;
            setupBar = 0;
            setupDirection = 0;

            // Reset entry state
            entryTriggered = false;
            entryPrice = 0;
            tradeDirection = 0;

            // Reset position management
            stopLoss = 0;
            takeProfit = 0;
            breakevenSet = false;
            tradeTaken = false;
            activeOrderName = "";
        }

        #region Properties
        // Risk Management
        [NinjaScriptProperty]
        [Range(1, 500)]
        [Display(Name = "Max Stop (Ticks)", Order = 1, GroupName = "1. Risk Management")]
        public int MaxStopTicks { get; set; }

        [NinjaScriptProperty]
        [Range(1, 500)]
        [Display(Name = "Take Profit (Ticks)", Order = 2, GroupName = "1. Risk Management")]
        public int TakeProfitTicks { get; set; }

        [NinjaScriptProperty]
        [Range(1, 500)]
        [Display(Name = "Breakeven Threshold (Ticks)", Order = 3, GroupName = "1. Risk Management")]
        public int BreakevenTicks { get; set; }

        // Wick Analysis
        [NinjaScriptProperty]
        [Range(0.1, 1.0)]
        [Display(Name = "Shallow Wick Ratio", Description = "Wick must be < this % of body", Order = 1, GroupName = "2. Candle Analysis")]
        public double ShallowWickRatio { get; set; }

        [NinjaScriptProperty]
        [Range(0.5, 3.0)]
        [Display(Name = "Large Wick Ratio", Description = "Wick > this % of body is large", Order = 2, GroupName = "2. Candle Analysis")]
        public double LargeWickRatio { get; set; }

        // Bias
        [NinjaScriptProperty]
        [Range(0.5, 0.95)]
        [Display(Name = "Bullish Close Threshold", Description = "Close above this % = bullish bias", Order = 1, GroupName = "3. Bias Settings")]
        public double BullishCloseThreshold { get; set; }

        [NinjaScriptProperty]
        [Range(0.05, 0.5)]
        [Display(Name = "Bearish Close Threshold", Description = "Close below this % = bearish bias", Order = 2, GroupName = "3. Bias Settings")]
        public double BearishCloseThreshold { get; set; }

        // Session
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Session Start Hour", Order = 1, GroupName = "4. Session")]
        public int SessionStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name = "Session Start Minute", Order = 2, GroupName = "4. Session")]
        public int SessionStartMinute { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Session End Hour", Order = 3, GroupName = "4. Session")]
        public int SessionEndHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name = "Session End Minute", Order = 4, GroupName = "4. Session")]
        public int SessionEndMinute { get; set; }

        // Debug
        [NinjaScriptProperty]
        [Display(Name = "Enable Debug Output", Order = 1, GroupName = "5. Debug")]
        public bool EnableDebug { get; set; }
        #endregion
    }
}

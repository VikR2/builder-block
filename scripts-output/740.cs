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
    public class SevenFortyBiasV6 : Strategy
    {
        #region Enums
        public enum BiasType
        {
            Neutral,
            Bullish,
            Bearish
        }
        #endregion

        #region Variables
        // Pre-market Bias State (3-7 AM)
        private double pmHigh;
        private double pmLow;
        private double pmVWAP_num;
        private double pmVWAP_den;
        private double pmPOC;
        private double pmPocPct;
        private BiasType pmBias;
        private bool pmDataCollected;
        private bool pmBiasCalculated;

        // Range Building State (7:00-7:40 AM)
        private double rangeHigh;
        private double rangeLow;
        private double equilibrium;
        private bool rangeSet;

        // Sweep & CISD State (Scenario A)
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

        // Position Management
        private int tradeDirection;  // 1 = long, -1 = short
        private double entryPrice;
        private double stopLoss;
        private double takeProfit;
        private bool breakevenSet;
        private bool tradeTaken;

        // Tracking
        private DateTime currentDate;
        private string activeOrderName;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"7:40 Bias Strategy V6 - Full Logic with Real-Time Support";
                Name = "SevenFortyBiasV6";
                
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

                // Risk Management
                MaxStopTicks = 200;      // Max allowed stop distance
                TakeProfitTicks = 120;   // Take profit distance
                BreakevenTicks = 80;     // Move to BE after this profit
                MinRangeTicks = 20;      // Minimum range size to trade

                // Bias Settings
                BullishThreshold = 55.0;
                BearishThreshold = 45.0;

                // Debug
                EnableDebug = true;
            }
            else if (State == State.DataLoaded)
            {
                ClearOutputWindow();
                Print("========================================");
                Print("SevenFortyBiasV6 LOADED");
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

            // New day reset
            if (barTime.Date != currentDate)
            {
                ResetDailyState();
                currentDate = barTime.Date;
                if (EnableDebug)
                    Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
            }

            // Calculate time windows
            int rangeStartMins = RangeStartHour * 60 + RangeStartMinute;
            int rangeEndMins = RangeEndHour * 60 + RangeEndMinute;
            int execEndMins = ExecutionEndHour * 60 + ExecutionEndMinute;

            bool inPremarket = hour >= PremarketStartHour && hour < PremarketEndHour;
            bool inRangeBuild = currentMins >= rangeStartMins && currentMins < rangeEndMins;
            bool inExecution = currentMins >= rangeEndMins && currentMins < execEndMins;
            bool inSession = hour >= RangeStartHour && hour < SessionEndHour;

            //==============================================================================
            // PRE-MARKET BIAS (3-7 AM) - Calculate VWAP-based POC
            //==============================================================================
            if (inPremarket)
            {
                if (pmHigh == 0)
                {
                    pmHigh = High[0];
                    pmLow = Low[0];
                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | PM START");
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

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | BIAS: " + pmBias + " | POC%: " + pmPocPct.ToString("F1") + " | PM H:" + pmHigh.ToString("F2") + " L:" + pmLow.ToString("F2"));
                }
            }

            //==============================================================================
            // RANGE BUILDING (7:00-7:40 AM)
            //==============================================================================
            if (inRangeBuild)
            {
                if (rangeHigh == 0)
                {
                    rangeHigh = High[0];
                    rangeLow = Low[0];
                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | RANGE BUILD START");
                }

                rangeHigh = Math.Max(rangeHigh, High[0]);
                rangeLow = Math.Min(rangeLow, Low[0]);
            }

            // Finalize range when range window ends
            if (!inRangeBuild && !rangeSet && rangeHigh > 0 && rangeLow > 0 && rangeHigh > rangeLow)
            {
                equilibrium = (rangeHigh + rangeLow) / 2.0;
                rangeSet = true;

                if (EnableDebug)
                    Print(barTime.ToString("HH:mm") + " | RANGE SET | H:" + rangeHigh.ToString("F2") + " L:" + rangeLow.ToString("F2") + " EQ:" + equilibrium.ToString("F2") + " Size:" + ((rangeHigh - rangeLow) / TickSize).ToString("F0") + " ticks");
            }

            //==============================================================================
            // EXECUTION WINDOW LOGIC
            //==============================================================================
            if (!inExecution || !rangeSet)
            {
                // Breakeven management even outside execution
                ManageBreakeven();
                
                // EOD Exit
                if (!inSession && Position.MarketPosition != MarketPosition.Flat)
                {
                    if (EnableDebug) Print("EOD EXIT");
                    if (Position.MarketPosition == MarketPosition.Long)
                        ExitLong();
                    else
                        ExitShort();
                }
                return;
            }

            // Skip if trade already taken today
            if (tradeTaken)
            {
                ManageBreakeven();
                return;
            }

            // Check position
            if (Position.MarketPosition != MarketPosition.Flat)
            {
                ManageBreakeven();
                return;
            }

            // Range size validation
            double rangeSizeTicks = (rangeHigh - rangeLow) / TickSize;
            if (rangeSizeTicks < MinRangeTicks)
            {
                if (EnableDebug && CurrentBar % 50 == 0)
                    Print(barTime.ToString("HH:mm") + " | Range too small: " + rangeSizeTicks.ToString("F0") + " < " + MinRangeTicks);
                return;
            }

            // Bias filtering
            bool allowLong = pmBias == BiasType.Bullish || pmBias == BiasType.Neutral;
            bool allowShort = pmBias == BiasType.Bearish || pmBias == BiasType.Neutral;

            // Candle direction
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

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [A] LOW SWEPT @ " + sweepPrice.ToString("F2"));
                }

                // High sweep - potential short setup
                if (High[0] > rangeHigh && allowShort)
                {
                    highSwept = true;
                    sweepPrice = High[0];
                    sweepBar = CurrentBar;
                    sweepDirection = -1;
                    refCandleOpen = 0;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [A] HIGH SWEPT @ " + sweepPrice.ToString("F2"));
                }
            }

            // CISD Detection after sweep (ICT Method)
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

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [A] CISD LONG | Close:" + Close[0].ToString("F2") + " > Ref:" + refCandleOpen.ToString("F2"));
                }

                // Short CISD: After high sweep, close below bullish candle's open
                if (sweepDirection == -1 && refCandleOpen > 0 && Close[0] < refCandleOpen)
                {
                    cisd_valid = true;
                    cisd_triggered = true;
                    tradeDirection = -1;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [A] CISD SHORT | Close:" + Close[0].ToString("F2") + " < Ref:" + refCandleOpen.ToString("F2"));
                }

                // ENTRY - Scenario A
                if (cisd_valid)
                {
                    double stopDistance = tradeDirection == 1 ? Close[0] - sweepPrice : sweepPrice - Close[0];
                    double stopDistanceTicks = stopDistance / TickSize;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [A] ENTRY CHECK | StopDist:" + stopDistanceTicks.ToString("F0") + " ticks | Max:" + MaxStopTicks);

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
                            Print(">>> [A] LONG ENTRY @ " + entryPrice.ToString("F2") + " | SL:" + stopLoss.ToString("F2") + " | TP:" + takeProfit.ToString("F2"));
                        }
                        else
                        {
                            activeOrderName = "S";
                            EnterShort(activeOrderName);
                            Print(">>> [A] SHORT ENTRY @ " + entryPrice.ToString("F2") + " | SL:" + stopLoss.ToString("F2") + " | TP:" + takeProfit.ToString("F2"));
                        }
                        return;
                    }
                }
            }

            //==============================================================================
            // SCENARIO B: BREAKOUT + PULLBACK + CISD (Continuation Pattern)
            //==============================================================================
            
            // Detect breakout (only if Scenario A hasn't triggered)
            if (!breakoutDetected && sweepDirection == 0)
            {
                // Bullish breakout above range high
                if (allowLong && High[0] > rangeHigh)
                {
                    breakoutDetected = true;
                    breakoutDirection = 1;
                    breakoutRefCandleOpen = 0;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [B] BREAKOUT HIGH @ " + High[0].ToString("F2"));
                }

                // Bearish breakout below range low
                if (allowShort && Low[0] < rangeLow)
                {
                    breakoutDetected = true;
                    breakoutDirection = -1;
                    breakoutRefCandleOpen = 0;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [B] BREAKOUT LOW @ " + Low[0].ToString("F2"));
                }
            }

            // Pullback detection after breakout
            if (breakoutDetected && !pullbackDetected)
            {
                // Bullish: price pulls back INTO range (low < rangeHigh)
                if (breakoutDirection == 1 && Low[0] < rangeHigh)
                {
                    pullbackDetected = true;
                    breakoutRefCandleOpen = 0;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [B] PULLBACK (Long setup) | Low:" + Low[0].ToString("F2") + " < RangeH:" + rangeHigh.ToString("F2"));
                }

                // Bearish: price pulls back INTO range (high > rangeLow)
                if (breakoutDirection == -1 && High[0] > rangeLow)
                {
                    pullbackDetected = true;
                    breakoutRefCandleOpen = 0;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [B] PULLBACK (Short setup) | High:" + High[0].ToString("F2") + " > RangeL:" + rangeLow.ToString("F2"));
                }
            }

            // CISD after pullback
            if (pullbackDetected)
            {
                // Track reference candle
                if (breakoutDirection == 1 && is_bearish)
                    breakoutRefCandleOpen = Open[0];
                if (breakoutDirection == -1 && is_bullish)
                    breakoutRefCandleOpen = Open[0];

                // Check for CISD
                bool breakout_cisd_valid = false;

                if (breakoutDirection == 1 && breakoutRefCandleOpen > 0 && Close[0] > breakoutRefCandleOpen)
                {
                    breakout_cisd_valid = true;
                    tradeDirection = 1;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [B] CISD LONG | Close:" + Close[0].ToString("F2") + " > Ref:" + breakoutRefCandleOpen.ToString("F2"));
                }

                if (breakoutDirection == -1 && breakoutRefCandleOpen > 0 && Close[0] < breakoutRefCandleOpen)
                {
                    breakout_cisd_valid = true;
                    tradeDirection = -1;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [B] CISD SHORT | Close:" + Close[0].ToString("F2") + " < Ref:" + breakoutRefCandleOpen.ToString("F2"));
                }

                // ENTRY - Scenario B
                if (breakout_cisd_valid)
                {
                    // Stop at range boundary for continuation trades
                    double stopPrice = tradeDirection == 1 ? rangeLow : rangeHigh;
                    double stopDistance = tradeDirection == 1 ? Close[0] - stopPrice : stopPrice - Close[0];
                    double stopDistanceTicks = stopDistance / TickSize;

                    if (EnableDebug)
                        Print(barTime.ToString("HH:mm") + " | [B] ENTRY CHECK | StopDist:" + stopDistanceTicks.ToString("F0") + " ticks | Max:" + MaxStopTicks);

                    if (stopDistanceTicks <= MaxStopTicks && stopDistanceTicks > 0)
                    {
                        entryPrice = Close[0];
                        stopLoss = stopPrice;
                        takeProfit = tradeDirection == 1 ? Close[0] + (TakeProfitTicks * TickSize) : Close[0] - (TakeProfitTicks * TickSize);
                        breakevenSet = false;
                        tradeTaken = true;

                        if (tradeDirection == 1)
                        {
                            activeOrderName = "L_BO";
                            EnterLong(activeOrderName);
                            Print(">>> [B] LONG BO ENTRY @ " + entryPrice.ToString("F2") + " | SL:" + stopLoss.ToString("F2") + " | TP:" + takeProfit.ToString("F2"));
                        }
                        else
                        {
                            activeOrderName = "S_BO";
                            EnterShort(activeOrderName);
                            Print(">>> [B] SHORT BO ENTRY @ " + entryPrice.ToString("F2") + " | SL:" + stopLoss.ToString("F2") + " | TP:" + takeProfit.ToString("F2"));
                        }
                    }
                }
            }
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

                if (Position.MarketPosition == MarketPosition.Long)
                {
                    SetStopLoss(activeOrderName, CalculationMode.Price, Position.AveragePrice, false);
                }
                else
                {
                    SetStopLoss(activeOrderName, CalculationMode.Price, Position.AveragePrice, false);
                }

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
            if (marketPosition == MarketPosition.Long)
            {
                double stopTicks = (price - stopLoss) / TickSize;
                SetStopLoss(execution.Order.Name, CalculationMode.Price, stopLoss, false);
                SetProfitTarget(execution.Order.Name, CalculationMode.Price, takeProfit);

                if (EnableDebug)
                    Print("Set SL:" + stopLoss.ToString("F2") + " (" + stopTicks.ToString("F0") + " ticks) | TP:" + takeProfit.ToString("F2"));
            }
            else if (marketPosition == MarketPosition.Short)
            {
                double stopTicks = (stopLoss - price) / TickSize;
                SetStopLoss(execution.Order.Name, CalculationMode.Price, stopLoss, false);
                SetProfitTarget(execution.Order.Name, CalculationMode.Price, takeProfit);

                if (EnableDebug)
                    Print("Set SL:" + stopLoss.ToString("F2") + " (" + stopTicks.ToString("F0") + " ticks) | TP:" + takeProfit.ToString("F2"));
            }
        }

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            if (EnableDebug)
                Print("POSITION: " + marketPosition + " | Qty:" + quantity + " @ " + averagePrice.ToString("F2"));

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

            // Scenario A
            highSwept = false;
            lowSwept = false;
            sweepPrice = 0;
            sweepBar = 0;
            sweepDirection = 0;
            refCandleOpen = 0;
            cisd_triggered = false;

            // Scenario B
            breakoutDetected = false;
            pullbackDetected = false;
            breakoutRefCandleOpen = 0;
            breakoutDirection = 0;

            // Position
            tradeDirection = 0;
            entryPrice = 0;
            stopLoss = 0;
            takeProfit = 0;
            breakevenSet = false;
            tradeTaken = false;
            activeOrderName = "";
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
        [Display(Name = "Enable Debug Output", Order = 1, GroupName = "4. Debug")]
        public bool EnableDebug { get; set; }
        #endregion
    }
}
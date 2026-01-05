#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

//==============================================================================
// MODEL-GENERATED STRATEGY
// Model ID: 5
// Model Name: TTrades 4-Hour Power of Three
// Generated: 2026-01-05 09:53:15
//
// This strategy was generated from a complete model specification.
// State machine, phase logic, and constraints are derived from model intent.
//==============================================================================

namespace NinjaTrader.NinjaScript.Strategies
{
    public class TTrades4HPO3Strategy : Strategy
    {
        #region Enums
        public enum StrategyState
        {
            WAITING_FOR_DAILY_BIAS,
            WAITING_FOR_4H_ACCUMULATION,
            CLASSIFYING_C2_WICK,
            WAITING_FOR_CISD_SAME_CANDLE,
            WAITING_FOR_C3_OPEN,
            WAITING_FOR_C3_WICK,
            ENTRY_READY,
            IN_POSITION,
            TRADE_COMPLETE
        }

        public enum BiasType { Neutral, Bullish, Bearish }
        public enum WickType { None, Small, Large }
        public enum POIType { None, PDH, PDL, PWH, PWL, OrderBlock, FVG }
        #endregion

        #region Variables
        private StrategyState currentState = StrategyState.WAITING_FOR_DAILY_BIAS;
        
        // Bias
        private BiasType dailyBias = BiasType.Neutral;
        private bool dailyBiasSet = false;
        
        // POI (Points of Interest)
        private double pdh, pdl, pwh, pwl;
        private double currentPOI;
        
        // CISD Pattern
        private bool cisd_confirmed = false;
        private double cisd_level;
        private int cisd_bar;
        
        // Candle Classification
        private WickType wickClassification = WickType.None;
        private bool c1_closed = false;
        private bool c2_analyzed = false;
        
        // Position Management
        private double entryPrice;
        private double stopPrice;
        private double targetPrice;
        private bool positionOpen = false;

        // Tracking
        private DateTime currentDate;
        private string activeOrderName;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"Trade the distribution phase of a 4-hour candle by waiting for the wick to form (via CISD/protected swing), then trade the body/expansion. Combines daily bias, 4H candle structure, and LTF fractal mod";
                Name = "TTrades4HPO3Strategy";

                Calculate = Calculate.OnBarClose;
                EntriesPerDirection = 1;
                EntryHandling = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy = true;
                ExitOnSessionCloseSeconds = 30;
                MaximumBarsLookBack = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution = OrderFillResolution.Standard;
                StartBehavior = StartBehavior.WaitUntilFlat;
                TimeInForce = TimeInForce.Gtc;
                TraceOrders = true;
                RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade = 20;
                IsInstantiatedOnEachOptimizationIteration = true;

                // Default parameters
                RiskPerTrade = 1.0;
                TargetMultiple = 2.0;
                MaxStopLossTicks = 100;
                EnableDebug = true;
            }
            else if (State == State.DataLoaded)
            {
                ClearOutputWindow();
                Print("========================================");
                Print("TTrades4HPO3Strategy LOADED");
                Print("Model: TTrades 4-Hour Power of Three");
                Print("Instrument: " + Instrument.FullName);
                Print("========================================");
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

            // New day reset
            if (barTime.Date != currentDate)
            {
                ResetDailyState();
                currentDate = barTime.Date;
                if (EnableDebug)
                    Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
            }

            //------------------------------------------------------------------
            // STATE MACHINE (from model spec)
            //------------------------------------------------------------------
            // State transitions from model spec
            switch (currentState)
            {
                case StrategyState.WAITING_FOR_DAILY_BIAS:
                    if (dailyBiasSet)
                    {
                        TransitionTo(StrategyState.WAITING_FOR_4H_ACCUMULATION, "daily_analyzed");
                    }
                    break;
                case StrategyState.CLASSIFYING_C2_WICK:
                    if (wickClassification == WickType.Small)
                    {
                        TransitionTo(StrategyState.WAITING_FOR_CISD_SAME_CANDLE, "small_wick");
                    }
                    if (wickClassification == WickType.Large)
                    {
                        TransitionTo(StrategyState.WAITING_FOR_C3_OPEN, "large_wick");
                    }
                    break;
            }

            //------------------------------------------------------------------
            // BIAS PHASE
            //------------------------------------------------------------------
            // PRE_MARKET PHASE (from model trade_flow_rules)
            // Skill: daily-bias-determination
            // Output: bias_direction
            // TODO: Inject code from skill 'daily-bias-determination'
            

            //------------------------------------------------------------------
            // SETUP PHASE
            //------------------------------------------------------------------
            // SETUP PHASE (from model trade_flow_rules)
            // Skill: candle-1-reference
            // Trigger: c1_close
            // TODO: Inject code from skill 'candle-1-reference'
            
            // Skill: wick-analysis
            // TODO: Inject code from skill 'wick-analysis'
            

            //------------------------------------------------------------------
            // ENTRY PHASE
            //------------------------------------------------------------------
            // ENTRY PHASE (from model trade_flow_rules)
            // Scenario: small_wick
            //   - cisd-pattern (required: True)
            //   - protected-swings (required: False)
            
            // Scenario: large_wick
            //   - candle-3-closure (required: False)
            //   - cisd-pattern (required: True)
            

            //------------------------------------------------------------------
            // EXIT PHASE
            //------------------------------------------------------------------
            // EXIT PHASE (from model trade_flow_rules)
            // Scenario: targets
            //   -  (required: False)
            //   -  (required: False)
            
            // Scenario: stops
            //   -  (required: False)
            
        }

        #region Helper Methods
        private void TransitionTo(StrategyState newState, string reason)
        {
            if (EnableDebug)
                Print($"[STATE] {currentState} -> {newState} ({reason})");
            currentState = newState;
        }

        private void ResetDailyState()
        {
            // Reset state machine to initial state
            currentState = StrategyState.WAITING_FOR_DAILY_BIAS;

            // Reset bias
            dailyBias = BiasType.Neutral;
            dailyBiasSet = false;

            // Reset CISD
            cisd_confirmed = false;
            cisd_level = 0;
            cisd_bar = 0;

            // Reset candle classification
            wickClassification = WickType.None;
            c1_closed = false;
            c2_analyzed = false;

            // Reset position tracking
            positionOpen = false;
            activeOrderName = "";

            if (EnableDebug)
                Print("[RESET] Daily state cleared");
        }

        private bool IsNew4HCandle()
        {
            // Check if current bar starts a new 4H period
            int hour = Time[0].Hour;
            return hour == 2 || hour == 6 || hour == 10 || hour == 14;
        }
        #endregion

        #region Order Handlers
        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            if (EnableDebug)
                Print($"{time:HH:mm:ss} | FILL: {execution.Order.Name} | {marketPosition} | Qty:{quantity} @ {price:F2}");

            if (execution.Order.Name.Contains("Entry"))
            {
                positionOpen = true;
                entryPrice = price;
            }
            else if (execution.Order.Name.Contains("Stop") || execution.Order.Name.Contains("Target"))
            {
                positionOpen = false;
                TransitionTo(StrategyState.TRADE_COMPLETE, "position_closed");
            }
        }

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            if (EnableDebug)
                Print($"POSITION: {marketPosition} | Qty:{quantity} @ {averagePrice:F2}");

            if (marketPosition == MarketPosition.Flat)
            {
                positionOpen = false;
            }
        }
        #endregion

        #region Properties
        [NinjaScriptProperty]
        [Range(0.1, 10)]
        [Display(Name = "Risk Per Trade %", Order = 1, GroupName = "1. Risk")]
        public double RiskPerTrade { get; set; }

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "Target Multiple (R)", Order = 2, GroupName = "1. Risk")]
        public double TargetMultiple { get; set; }

        [NinjaScriptProperty]
        [Range(10, 500)]
        [Display(Name = "Max Stop Loss Ticks", Order = 3, GroupName = "1. Risk")]
        public int MaxStopLossTicks { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Debug Output", Order = 99, GroupName = "99. Debug")]
        public bool EnableDebug { get; set; }
        #endregion
    }
}

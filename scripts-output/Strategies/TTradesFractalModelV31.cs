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
    // ==========================================================================
    // TTradesFractalModelV31 - Simplified C1/C2 + Protected Swing + CISD
    // ==========================================================================
    // Source: TTrades Fractal Model video (9AL41xON3hA)
    //
    // V31 SIMPLIFICATION:
    // - Removed all POI detection (FVG, OB, Swing, PDHL zones)
    // - C1/C2 = simple level touches (PDL for longs, PDH for shorts)
    // - No POI invalidation logic
    // - 6 states instead of 8
    //
    // Flow: Daily Bias -> C1 Touch -> C2 Touch -> M5 CISD -> Entry
    // ==========================================================================
    public class TTradesFractalModelV31 : Strategy
    {
        #region State Machine

        private enum StrategyState
        {
            Idle,
            BiasEstablished,
            C1Touch,
            C2Confirmed,
            WaitingForCISD,
            InTrade
        }

        private enum BiasDirection
        {
            None,
            Bullish,
            Bearish
        }

        private StrategyState currentState = StrategyState.Idle;

        #endregion

        #region Parameters

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Contracts", Order = 1, GroupName = "Trade Settings")]
        public int Contracts { get; set; }

        [NinjaScriptProperty]
        [Range(1.0, 10.0)]
        [Display(Name = "Risk Reward Target", Order = 2, GroupName = "Trade Settings")]
        public double RiskRewardTarget { get; set; }

        [NinjaScriptProperty]
        [Range(0, 20)]
        [Display(Name = "Stop Ticks Buffer", Order = 3, GroupName = "Trade Settings")]
        public int StopTicksBuffer { get; set; }

        [NinjaScriptProperty]
        [Range(5, 30)]
        [Display(Name = "Level Touch Tolerance (ticks)", Order = 4, GroupName = "C1C2 Settings")]
        public int LevelTouchTicks { get; set; }

        [NinjaScriptProperty]
        [Range(1, 5)]
        [Display(Name = "CISD Min Opposing Series", Order = 5, GroupName = "CISD Settings")]
        public int CISDMinOpposingSeries { get; set; }

        [NinjaScriptProperty]
        [Range(3, 10)]
        [Display(Name = "CISD Max Opposing Series", Order = 6, GroupName = "CISD Settings")]
        public int CISDMaxOpposingSeries { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Debug", Order = 7, GroupName = "Debug")]
        public bool EnableDebug { get; set; }

        #endregion

        #region State Variables

        // Daily Bias
        private BiasDirection dailyBias = BiasDirection.None;
        private double previousDayHigh;
        private double previousDayLow;
        private double previousDayClose;
        private double keyLevel;  // PDL for bullish, PDH for bearish
        private DateTime lastBiasDate = DateTime.MinValue;

        // C1/C2 Confirmation
        private bool c1Confirmed = false;
        private int c1Bar = -1;
        private bool c2Confirmed = false;

        // M5 CISD
        private int opposingSeriesCount = 0;
        private double opposingSeriesOpen = 0;
        private bool cisdConfirmed = false;
        private double m5OBHigh;
        private double m5OBLow;
        private int cisdBar = -1;

        // Trade Management
        private double entryPrice;
        private double stopPrice;
        private double targetPrice;
        private bool wasInTrade = false;

        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "TTrades Fractal Model V31 - Simplified C1/C2 + Protected Swing + CISD";
                Name = "TTradesFractalModelV31";
                Calculate = Calculate.OnBarClose;
                EntriesPerDirection = 1;
                EntryHandling = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy = true;
                ExitOnSessionCloseSeconds = 30;
                IsFillLimitOnTouch = false;
                MaximumBarsLookBack = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution = OrderFillResolution.Standard;
                Slippage = 2;
                StartBehavior = StartBehavior.WaitUntilFlat;
                TimeInForce = TimeInForce.Gtc;
                TraceOrders = false;
                RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade = 20;

                // Defaults
                Contracts = 1;
                RiskRewardTarget = 2.0;
                StopTicksBuffer = 4;
                LevelTouchTicks = 15;
                CISDMinOpposingSeries = 2;
                CISDMaxOpposingSeries = 5;
                EnableDebug = true;
            }
            else if (State == State.Configure)
            {
                // BarsInProgress 0 = M5 (Entry timeframe)
                // BarsInProgress 1 = Daily (Bias timeframe)
                // BarsInProgress 2 = H1 (Confirmation timeframe)
                AddDataSeries(BarsPeriodType.Day, 1);
                AddDataSeries(BarsPeriodType.Minute, 60);
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBars[0] < BarsRequiredToTrade) return;
            if (BarsInProgress == 1 && CurrentBars[1] < 3) return;
            if (BarsInProgress == 2 && CurrentBars[2] < 20) return;

            switch (BarsInProgress)
            {
                case 0:  // M5
                    ProcessEntryTimeframe();
                    break;
                case 1:  // Daily
                    ProcessBiasTimeframe();
                    break;
                case 2:  // H1
                    ProcessConfirmationTimeframe();
                    break;
            }
        }

        #region Daily Bias Detection

        private void ProcessBiasTimeframe()
        {
            if (Times[1][0].Date != lastBiasDate)
            {
                DetectDailyBias();
            }
        }

        private void DetectDailyBias()
        {
            // Store prior day levels
            previousDayHigh = Highs[1][1];
            previousDayLow = Lows[1][1];
            previousDayClose = Closes[1][1];

            double todayClose = Closes[1][0];
            double prevCandleHigh = Highs[1][1];
            double prevCandleLow = Lows[1][1];

            // Bias detection: sweep + close
            if (todayClose > prevCandleHigh)
            {
                dailyBias = BiasDirection.Bullish;
                keyLevel = previousDayLow;  // Support for longs
                if (EnableDebug) Print($"[BIAS] {Times[1][0]:d} Bullish - Close {todayClose:F2} > Prev High {prevCandleHigh:F2} | Key Level (PDL): {keyLevel:F2}");
            }
            else if (todayClose < prevCandleLow)
            {
                dailyBias = BiasDirection.Bearish;
                keyLevel = previousDayHigh;  // Resistance for shorts
                if (EnableDebug) Print($"[BIAS] {Times[1][0]:d} Bearish - Close {todayClose:F2} < Prev Low {prevCandleLow:F2} | Key Level (PDH): {keyLevel:F2}");
            }
            else
            {
                dailyBias = BiasDirection.None;
                keyLevel = 0;
                if (EnableDebug) Print($"[BIAS] {Times[1][0]:d} None - Close {todayClose:F2} inside prev range");
            }

            lastBiasDate = Times[1][0].Date;

            // State transition
            if (dailyBias != BiasDirection.None && currentState == StrategyState.Idle)
            {
                currentState = StrategyState.BiasEstablished;
                ResetC1C2State();
                if (EnableDebug) Print($"[STATE] -> BiasEstablished");
            }
        }

        #endregion

        #region H1 C1/C2 Detection (Simplified)

        private void ProcessConfirmationTimeframe()
        {
            if (dailyBias == BiasDirection.None) return;
            if (keyLevel == 0) return;

            switch (currentState)
            {
                case StrategyState.BiasEstablished:
                    CheckForC1();
                    break;
                case StrategyState.C1Touch:
                    CheckForC2();
                    break;
            }
        }

        private void CheckForC1()
        {
            double tolerance = LevelTouchTicks * TickSize;
            bool touches = false;

            if (dailyBias == BiasDirection.Bullish)
            {
                // For longs: H1 candle low touches PDL (support)
                touches = Lows[2][0] <= keyLevel + tolerance;
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // For shorts: H1 candle high touches PDH (resistance)
                touches = Highs[2][0] >= keyLevel - tolerance;
            }

            if (touches)
            {
                c1Confirmed = true;
                c1Bar = CurrentBars[2];
                currentState = StrategyState.C1Touch;
                if (EnableDebug) Print($"[C1] {Times[2][0]} Touch at {keyLevel:F2} (tolerance: {LevelTouchTicks} ticks)");
            }
        }

        private void CheckForC2()
        {
            double tolerance = LevelTouchTicks * TickSize;
            bool touches = false;

            if (dailyBias == BiasDirection.Bullish)
            {
                touches = Lows[2][0] <= keyLevel + tolerance;
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                touches = Highs[2][0] >= keyLevel - tolerance;
            }

            if (touches)
            {
                c2Confirmed = true;
                currentState = StrategyState.C2Confirmed;
                ResetCISDState();
                if (EnableDebug) Print($"[C2] {Times[2][0]} Confirmed - ready for M5 CISD");
            }
        }

        private void ResetC1C2State()
        {
            c1Confirmed = false;
            c1Bar = -1;
            c2Confirmed = false;
        }

        #endregion

        #region M5 Protected Swing + CISD Detection

        private void ProcessEntryTimeframe()
        {
            if (currentState == StrategyState.Idle ||
                currentState == StrategyState.BiasEstablished ||
                currentState == StrategyState.C1Touch)
                return;

            if (currentState == StrategyState.InTrade)
            {
                ManageTrade();
                return;
            }

            if (currentState == StrategyState.C2Confirmed)
            {
                DetectProtectedSwing();
            }

            if (currentState == StrategyState.WaitingForCISD)
            {
                CheckCISDConfirmation();
            }
        }

        private void DetectProtectedSwing()
        {
            if (CurrentBars[0] < 2) return;

            double open = Opens[0][0];
            double close = Closes[0][0];
            bool isOpposing = false;

            if (dailyBias == BiasDirection.Bullish)
            {
                // For bullish bias: track DOWNCLOSE candles (opposing)
                isOpposing = close < open;
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // For bearish bias: track UPCLOSE candles (opposing)
                isOpposing = close > open;
            }

            if (isOpposing)
            {
                opposingSeriesCount++;
                if (opposingSeriesCount == 1)
                {
                    // Store first opposing candle's OPEN as reference
                    opposingSeriesOpen = open;
                    if (EnableDebug) Print($"[M5] {Times[0][0]} Protected swing started - first opposing open: {opposingSeriesOpen:F2}");
                }

                // Check if series is too long (consolidation, not pullback)
                if (opposingSeriesCount > CISDMaxOpposingSeries)
                {
                    if (EnableDebug) Print($"[M5] {Times[0][0]} Series too long ({opposingSeriesCount} > {CISDMaxOpposingSeries}) - reset");
                    ResetCISDState();
                    return;
                }
            }
            else if (opposingSeriesCount >= CISDMinOpposingSeries)
            {
                // Non-opposing candle after valid series - check for CISD
                currentState = StrategyState.WaitingForCISD;
                if (EnableDebug) Print($"[M5] {Times[0][0]} Valid opposing series ({opposingSeriesCount}) - checking CISD");
            }
            else if (opposingSeriesCount > 0 && !isOpposing)
            {
                // Series broken before minimum count
                if (EnableDebug) Print($"[M5] {Times[0][0]} Series broken before min count ({opposingSeriesCount} < {CISDMinOpposingSeries}) - reset");
                ResetCISDState();
            }
        }

        private void CheckCISDConfirmation()
        {
            double close = Closes[0][0];
            bool closeThrough = false;

            if (dailyBias == BiasDirection.Bullish)
            {
                // CISD = close >= first opposing candle's open
                closeThrough = close >= opposingSeriesOpen;
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // CISD = close <= first opposing candle's open
                closeThrough = close <= opposingSeriesOpen;
            }

            if (closeThrough)
            {
                cisdConfirmed = true;
                cisdBar = CurrentBars[0];

                // OB = prior bar (the CISD candle itself)
                m5OBHigh = Highs[0][1];
                m5OBLow = Lows[0][1];

                if (EnableDebug) Print($"[CISD] {Times[0][0]} CONFIRMED - Close {close:F2} through {opposingSeriesOpen:F2} | OB: {m5OBLow:F2} - {m5OBHigh:F2}");

                // Immediately check entry
                CheckEntryTrigger();
            }
            else
            {
                // Failed to close through - go back to detecting swing
                if (EnableDebug) Print($"[CISD] {Times[0][0]} Failed - Close {close:F2} did not break {opposingSeriesOpen:F2}");
                currentState = StrategyState.C2Confirmed;
                ResetCISDState();
            }
        }

        private void ResetCISDState()
        {
            opposingSeriesCount = 0;
            opposingSeriesOpen = 0;
            cisdConfirmed = false;
            cisdBar = -1;
            m5OBHigh = 0;
            m5OBLow = 0;
        }

        #endregion

        #region Entry Trigger

        private void CheckEntryTrigger()
        {
            if (!cisdConfirmed) return;
            if (Position.MarketPosition != MarketPosition.Flat) return;

            double close = Closes[0][0];

            if (dailyBias == BiasDirection.Bullish)
            {
                entryPrice = close;
                stopPrice = m5OBLow - (StopTicksBuffer * TickSize);
                double riskTicks = (entryPrice - stopPrice) / TickSize;
                targetPrice = entryPrice + (riskTicks * RiskRewardTarget * TickSize);

                if (riskTicks >= 4 && riskTicks <= 20)
                {
                    SetStopLoss(CalculationMode.Price, stopPrice);
                    SetProfitTarget(CalculationMode.Price, targetPrice);
                    EnterLong(Contracts, "BullishEntry");

                    currentState = StrategyState.InTrade;
                    wasInTrade = true;

                    if (EnableDebug)
                        Print($"[ENTRY] {Times[0][0]} LONG at {entryPrice:F2} | Stop: {stopPrice:F2} | Target: {targetPrice:F2} | Risk: {riskTicks:F1} ticks");
                }
                else
                {
                    if (EnableDebug) Print($"[SKIP] {Times[0][0]} Risk {riskTicks:F1} ticks outside 4-20 range");
                    ResetForNextSetup();
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                entryPrice = close;
                stopPrice = m5OBHigh + (StopTicksBuffer * TickSize);
                double riskTicks = (stopPrice - entryPrice) / TickSize;
                targetPrice = entryPrice - (riskTicks * RiskRewardTarget * TickSize);

                if (riskTicks >= 4 && riskTicks <= 20)
                {
                    SetStopLoss(CalculationMode.Price, stopPrice);
                    SetProfitTarget(CalculationMode.Price, targetPrice);
                    EnterShort(Contracts, "BearishEntry");

                    currentState = StrategyState.InTrade;
                    wasInTrade = true;

                    if (EnableDebug)
                        Print($"[ENTRY] {Times[0][0]} SHORT at {entryPrice:F2} | Stop: {stopPrice:F2} | Target: {targetPrice:F2} | Risk: {riskTicks:F1} ticks");
                }
                else
                {
                    if (EnableDebug) Print($"[SKIP] {Times[0][0]} Risk {riskTicks:F1} ticks outside 4-20 range");
                    ResetForNextSetup();
                }
            }
        }

        #endregion

        #region Trade Management

        private void ManageTrade()
        {
            // Basic trade management - positions are managed by stop/target
        }

        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            if (Position.MarketPosition == MarketPosition.Flat && wasInTrade)
            {
                if (EnableDebug) Print($"[EXIT] {time} Trade closed at {price:F2}");
                ResetForNextSetup();
            }
        }

        private void ResetForNextSetup()
        {
            ResetC1C2State();
            ResetCISDState();
            wasInTrade = false;

            // Go back to BiasEstablished to look for new C1/C2
            currentState = StrategyState.BiasEstablished;

            if (EnableDebug) Print($"[STATE] Reset for next setup -> BiasEstablished");
        }

        #endregion
    }
}

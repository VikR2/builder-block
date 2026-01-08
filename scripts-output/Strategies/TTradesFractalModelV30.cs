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
    // TTradesFractalModelV30 - POI/Bias Synchronization Fix
    // ==========================================================================
    // Source: TTrades Fractal Model video (9AL41xON3hA)
    //
    // V30 FIXES (from V29 analysis):
    // - POI invalidation when bias changes direction
    // - Entry validation: dailyBias MUST match dailyPoiDirection
    // - POI/bias alignment check before C1/C2
    // - Prevents entering LONG at resistance (PDH) or SHORT at support (PDL)
    //
    // Flow: Daily Bias -> DAILY POI (matching bias) -> C1 -> Pullback -> C2 -> CISD -> Entry
    // ==========================================================================
    public class TTradesFractalModelV30 : Strategy
    {
        #region State Machine

        private enum StrategyState
        {
            Idle,
            BiasEstablished,
            POIIdentified,
            C1Confirmed,
            PullbackComplete,
            C2Confirmed,
            CISDConfirmed,
            InTrade
        }

        private enum BiasDirection
        {
            None,
            Bullish,
            Bearish
        }

        private enum POIType
        {
            None,
            FVG,
            Swing,
            PDHL
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
        [Range(1.0, 3.0)]
        [Display(Name = "Reaction Zone Multiplier", Order = 4, GroupName = "POI Settings")]
        public double ReactionZoneMultiplier { get; set; }

        [NinjaScriptProperty]
        [Range(1, 5)]
        [Display(Name = "CISD Min Opposing Series", Order = 5, GroupName = "CISD Settings")]
        public int CISDMinOpposingSeries { get; set; }

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "POI Invalidation Threshold", Order = 6, GroupName = "POI Settings")]
        public int POIInvalidationThreshold { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Debug", Order = 7, GroupName = "Debug")]
        public bool EnableDebug { get; set; }

        #endregion

        #region State Variables

        // Daily Bias
        private BiasDirection dailyBias = BiasDirection.None;
        private BiasDirection previousBias = BiasDirection.None;  // V30: Track for change detection
        private double previousDayHigh;
        private double previousDayLow;
        private double previousDayClose;
        private DateTime lastBiasDate = DateTime.MinValue;

        // DAILY POI
        private bool dailyPoiValid = false;
        private POIType dailyPoiType = POIType.None;
        private double dailyPoiTop;
        private double dailyPoiBottom;
        private BiasDirection dailyPoiDirection = BiasDirection.None;
        private int invalidationCloseCount = 0;
        private int poiDetectedDailyBar = -1;

        // C1/C2 Confirmation
        private bool c1Confirmed = false;
        private double c1ClosePrice;
        private int c1Bar = -1;
        private double pullbackExtreme;
        private bool c2Confirmed = false;
        private double c2ClosePrice;

        // M5 CISD
        private bool cisd_confirmed = false;
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
                Description = "TTrades Fractal Model V30 - POI/Bias synchronization fix";
                Name = "TTradesFractalModelV30";
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

                Contracts = 1;
                RiskRewardTarget = 2.0;
                StopTicksBuffer = 4;
                ReactionZoneMultiplier = 1.5;
                CISDMinOpposingSeries = 2;
                POIInvalidationThreshold = 6;
                EnableDebug = true;
            }
            else if (State == State.Configure)
            {
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
                case 0:
                    ProcessEntryTimeframe();
                    break;
                case 1:
                    ProcessBiasTimeframe();
                    break;
                case 2:
                    ProcessConfirmationTimeframe();
                    break;
            }
        }

        #region Daily Bias + POI Detection

        private void ProcessBiasTimeframe()
        {
            if (Times[1][0].Date != lastBiasDate)
            {
                DetectDailyBias();
            }

            if (dailyBias != BiasDirection.None && currentState == StrategyState.BiasEstablished)
            {
                DetectDailyPOI();
            }
        }

        private void DetectDailyBias()
        {
            // V30: Store previous bias BEFORE detection
            previousBias = dailyBias;

            previousDayHigh = Highs[1][1];
            previousDayLow = Lows[1][1];
            previousDayClose = Closes[1][1];

            double todayClose = Closes[1][0];
            double prevCandleHigh = Highs[1][1];
            double prevCandleLow = Lows[1][1];

            if (todayClose > prevCandleHigh)
            {
                dailyBias = BiasDirection.Bullish;
                if (EnableDebug) Print($"[BIAS] {Times[1][0]:d} Bullish - Close {todayClose:F2} > Prev High {prevCandleHigh:F2}");
            }
            else if (todayClose < prevCandleLow)
            {
                dailyBias = BiasDirection.Bearish;
                if (EnableDebug) Print($"[BIAS] {Times[1][0]:d} Bearish - Close {todayClose:F2} < Prev Low {prevCandleLow:F2}");
            }
            else
            {
                dailyBias = BiasDirection.None;
                if (EnableDebug) Print($"[BIAS] {Times[1][0]:d} None - Close {todayClose:F2} inside prev range");
            }

            lastBiasDate = Times[1][0].Date;

            // V30 FIX: Invalidate POI if bias CHANGED direction
            if (previousBias != BiasDirection.None &&
                dailyBias != BiasDirection.None &&
                previousBias != dailyBias)
            {
                if (dailyPoiValid)
                {
                    if (EnableDebug) Print($"[POI] {Times[1][0]:d} INVALIDATED - Bias changed from {previousBias} to {dailyBias}");
                    InvalidatePOI("Bias direction changed");
                }
            }

            // State transition
            if (dailyBias != BiasDirection.None && currentState == StrategyState.Idle)
            {
                currentState = StrategyState.BiasEstablished;
                if (EnableDebug) Print($"[STATE] -> BiasEstablished");
            }
        }

        #endregion

        #region DAILY POI Detection

        private void DetectDailyPOI()
        {
            if (DetectDailyFVG()) return;
            if (DetectDailySwingPOI()) return;
            if (DetectPDHLPOI()) return;
        }

        private bool DetectDailyFVG()
        {
            if (CurrentBars[1] < 3) return false;

            double high0 = Highs[1][0];
            double low0 = Lows[1][0];
            double high2 = Highs[1][2];
            double low2 = Lows[1][2];

            if (dailyBias == BiasDirection.Bullish && low0 > high2)
            {
                dailyPoiTop = low0;
                dailyPoiBottom = high2;
                dailyPoiType = POIType.FVG;
                dailyPoiDirection = BiasDirection.Bullish;
                dailyPoiValid = true;
                poiDetectedDailyBar = CurrentBars[1];
                currentState = StrategyState.POIIdentified;
                ResetC1C2State();
                if (EnableDebug) Print($"[POI] {Times[1][0]:d} DAILY Bullish FVG: {dailyPoiBottom:F2} - {dailyPoiTop:F2}");
                return true;
            }

            if (dailyBias == BiasDirection.Bearish && high0 < low2)
            {
                dailyPoiTop = low2;
                dailyPoiBottom = high0;
                dailyPoiType = POIType.FVG;
                dailyPoiDirection = BiasDirection.Bearish;
                dailyPoiValid = true;
                poiDetectedDailyBar = CurrentBars[1];
                currentState = StrategyState.POIIdentified;
                ResetC1C2State();
                if (EnableDebug) Print($"[POI] {Times[1][0]:d} DAILY Bearish FVG: {dailyPoiBottom:F2} - {dailyPoiTop:F2}");
                return true;
            }

            return false;
        }

        private bool DetectDailySwingPOI()
        {
            if (CurrentBars[1] < 5) return false;

            double swingHigh = double.MinValue;
            double swingLow = double.MaxValue;
            int swingHighIdx = -1;
            int swingLowIdx = -1;

            for (int i = 1; i < 4; i++)
            {
                if (i + 1 < CurrentBars[1])
                {
                    if (Highs[1][i] > Highs[1][i - 1] && Highs[1][i] > Highs[1][i + 1])
                    {
                        if (Highs[1][i] > swingHigh)
                        {
                            swingHigh = Highs[1][i];
                            swingHighIdx = i;
                        }
                    }

                    if (Lows[1][i] < Lows[1][i - 1] && Lows[1][i] < Lows[1][i + 1])
                    {
                        if (Lows[1][i] < swingLow)
                        {
                            swingLow = Lows[1][i];
                            swingLowIdx = i;
                        }
                    }
                }
            }

            if (dailyBias == BiasDirection.Bullish && swingLowIdx > 0)
            {
                dailyPoiTop = swingLow + (10 * TickSize);
                dailyPoiBottom = swingLow - (10 * TickSize);
                dailyPoiType = POIType.Swing;
                dailyPoiDirection = BiasDirection.Bullish;
                dailyPoiValid = true;
                poiDetectedDailyBar = CurrentBars[1];
                currentState = StrategyState.POIIdentified;
                ResetC1C2State();
                if (EnableDebug) Print($"[POI] {Times[1][0]:d} DAILY Bullish Swing POI at {swingLow:F2}");
                return true;
            }

            if (dailyBias == BiasDirection.Bearish && swingHighIdx > 0)
            {
                dailyPoiTop = swingHigh + (10 * TickSize);
                dailyPoiBottom = swingHigh - (10 * TickSize);
                dailyPoiType = POIType.Swing;
                dailyPoiDirection = BiasDirection.Bearish;
                dailyPoiValid = true;
                poiDetectedDailyBar = CurrentBars[1];
                currentState = StrategyState.POIIdentified;
                ResetC1C2State();
                if (EnableDebug) Print($"[POI] {Times[1][0]:d} DAILY Bearish Swing POI at {swingHigh:F2}");
                return true;
            }

            return false;
        }

        private bool DetectPDHLPOI()
        {
            if (previousDayHigh == 0 || previousDayLow == 0) return false;

            if (dailyBias == BiasDirection.Bullish)
            {
                // Bullish: PDL is SUPPORT (for LONGS)
                dailyPoiTop = previousDayLow + (15 * TickSize);
                dailyPoiBottom = previousDayLow - (15 * TickSize);
                dailyPoiType = POIType.PDHL;
                dailyPoiDirection = BiasDirection.Bullish;
                dailyPoiValid = true;
                poiDetectedDailyBar = CurrentBars[1];
                currentState = StrategyState.POIIdentified;
                ResetC1C2State();
                if (EnableDebug) Print($"[POI] {Times[1][0]:d} DAILY PDL (support) at {previousDayLow:F2} for LONGS");
                return true;
            }

            if (dailyBias == BiasDirection.Bearish)
            {
                // Bearish: PDH is RESISTANCE (for SHORTS)
                dailyPoiTop = previousDayHigh + (15 * TickSize);
                dailyPoiBottom = previousDayHigh - (15 * TickSize);
                dailyPoiType = POIType.PDHL;
                dailyPoiDirection = BiasDirection.Bearish;
                dailyPoiValid = true;
                poiDetectedDailyBar = CurrentBars[1];
                currentState = StrategyState.POIIdentified;
                ResetC1C2State();
                if (EnableDebug) Print($"[POI] {Times[1][0]:d} DAILY PDH (resistance) at {previousDayHigh:F2} for SHORTS");
                return true;
            }

            return false;
        }

        private void ResetC1C2State()
        {
            c1Confirmed = false;
            c1ClosePrice = 0;
            c1Bar = -1;
            pullbackExtreme = 0;
            c2Confirmed = false;
            c2ClosePrice = 0;
        }

        #endregion

        #region H1 C1/C2 with PULLBACK Pattern

        private void ProcessConfirmationTimeframe()
        {
            if (!dailyPoiValid) return;

            // V30 FIX: Verify POI/bias alignment BEFORE processing C1/C2
            if (dailyPoiDirection != dailyBias)
            {
                if (EnableDebug) Print($"[C1C2] {Times[2][0]} SKIP - POI direction ({dailyPoiDirection}) != current bias ({dailyBias})");
                InvalidatePOI("POI/bias misalignment detected");
                return;
            }

            CheckPOIInvalidation();

            switch (currentState)
            {
                case StrategyState.POIIdentified:
                    CheckForC1();
                    break;
                case StrategyState.C1Confirmed:
                    CheckForPullback();
                    break;
                case StrategyState.PullbackComplete:
                    CheckForC2();
                    break;
            }
        }

        private void CheckForC1()
        {
            double close = Closes[2][0];
            double high = Highs[2][0];
            double low = Lows[2][0];

            bool inZone = IsCandleInDailyPOIZone(close, high, low);

            if (inZone)
            {
                c1Confirmed = true;
                c1ClosePrice = close;
                c1Bar = CurrentBars[2];

                if (dailyPoiDirection == BiasDirection.Bullish)
                {
                    pullbackExtreme = high;
                }
                else
                {
                    pullbackExtreme = low;
                }

                currentState = StrategyState.C1Confirmed;

                if (EnableDebug)
                    Print($"[C1] {Times[2][0]} C1 at {close:F2} - zone touched, waiting for PULLBACK");
            }
        }

        private void CheckForPullback()
        {
            double close = Closes[2][0];
            double high = Highs[2][0];
            double low = Lows[2][0];

            if (dailyPoiDirection == BiasDirection.Bullish)
            {
                if (close > dailyPoiTop)
                {
                    pullbackExtreme = Math.Max(pullbackExtreme, high);
                    currentState = StrategyState.PullbackComplete;

                    if (EnableDebug)
                        Print($"[PULLBACK] {Times[2][0]} Bullish pullback complete - high: {pullbackExtreme:F2}");
                }
                else
                {
                    pullbackExtreme = Math.Max(pullbackExtreme, high);
                }
            }
            else if (dailyPoiDirection == BiasDirection.Bearish)
            {
                if (close < dailyPoiBottom)
                {
                    pullbackExtreme = Math.Min(pullbackExtreme, low);
                    currentState = StrategyState.PullbackComplete;

                    if (EnableDebug)
                        Print($"[PULLBACK] {Times[2][0]} Bearish pullback complete - low: {pullbackExtreme:F2}");
                }
                else
                {
                    pullbackExtreme = Math.Min(pullbackExtreme, low);
                }
            }
        }

        private void CheckForC2()
        {
            double open = Opens[2][0];
            double close = Closes[2][0];
            double high = Highs[2][0];
            double low = Lows[2][0];

            bool closeInZone = IsCandleInDailyPOIZone(close, high, low);
            bool openOutsideZone = !IsPriceInZone(open);

            if (closeInZone && openOutsideZone)
            {
                c2Confirmed = true;
                c2ClosePrice = close;
                currentState = StrategyState.C2Confirmed;

                if (EnableDebug)
                    Print($"[C2] {Times[2][0]} C2 at {close:F2} - opening filter PASSED, ready for CISD");
            }
        }

        private bool IsCandleInDailyPOIZone(double close, double high, double low)
        {
            double zoneSize = dailyPoiTop - dailyPoiBottom;
            double expansion = zoneSize * (ReactionZoneMultiplier - 1.0) / 2.0;

            double reactionTop = dailyPoiTop + expansion;
            double reactionBottom = dailyPoiBottom - expansion;

            return (low <= reactionTop && high >= reactionBottom);
        }

        private bool IsPriceInZone(double price)
        {
            double zoneSize = dailyPoiTop - dailyPoiBottom;
            double expansion = zoneSize * (ReactionZoneMultiplier - 1.0) / 2.0;

            double reactionTop = dailyPoiTop + expansion;
            double reactionBottom = dailyPoiBottom - expansion;

            return (price >= reactionBottom && price <= reactionTop);
        }

        private void CheckPOIInvalidation()
        {
            if (!dailyPoiValid) return;

            double close = Closes[2][0];
            bool outsideZone = false;

            if (dailyPoiDirection == BiasDirection.Bullish)
            {
                outsideZone = close < dailyPoiBottom;
            }
            else if (dailyPoiDirection == BiasDirection.Bearish)
            {
                outsideZone = close > dailyPoiTop;
            }

            if (outsideZone)
            {
                invalidationCloseCount++;
                if (invalidationCloseCount >= POIInvalidationThreshold)
                {
                    InvalidatePOI("Close count threshold exceeded");
                }
            }
            else
            {
                invalidationCloseCount = 0;
            }
        }

        private void InvalidatePOI(string reason)
        {
            if (EnableDebug) Print($"[POI] {Times[BarsInProgress][0]} POI invalidated: {reason}");

            dailyPoiValid = false;
            dailyPoiType = POIType.None;
            dailyPoiDirection = BiasDirection.None;
            ResetC1C2State();
            invalidationCloseCount = 0;
            poiDetectedDailyBar = -1;
            cisd_confirmed = false;

            currentState = StrategyState.BiasEstablished;
            if (EnableDebug) Print($"[STATE] -> BiasEstablished (POI invalidated)");
        }

        #endregion

        #region M5 Processing

        private void ProcessEntryTimeframe()
        {
            if (currentState == StrategyState.Idle ||
                currentState == StrategyState.BiasEstablished ||
                currentState == StrategyState.POIIdentified ||
                currentState == StrategyState.C1Confirmed ||
                currentState == StrategyState.PullbackComplete)
                return;

            if (currentState == StrategyState.InTrade)
            {
                ManageTrade();
                return;
            }

            if (currentState == StrategyState.C2Confirmed)
            {
                DetectCISD();
            }

            if (currentState == StrategyState.CISDConfirmed)
            {
                CheckEntryTrigger();
            }
        }

        #endregion

        #region M5 CISD Detection

        private void DetectCISD()
        {
            if (cisd_confirmed) return;
            if (CurrentBars[0] < 12) return;

            int opposingCount = 0;
            int lastOpposingIdx = 0;
            double seriesOpen = 0;

            for (int i = 1; i <= 10; i++)
            {
                bool isOpposing = false;

                if (dailyPoiDirection == BiasDirection.Bullish)
                {
                    isOpposing = Closes[0][i] < Opens[0][i];
                }
                else if (dailyPoiDirection == BiasDirection.Bearish)
                {
                    isOpposing = Closes[0][i] > Opens[0][i];
                }

                if (isOpposing)
                {
                    opposingCount++;
                    if (lastOpposingIdx == 0)
                    {
                        lastOpposingIdx = i;
                        seriesOpen = Opens[0][i];
                    }
                }
            }

            if (opposingCount < CISDMinOpposingSeries) return;

            double currentClose = Closes[0][0];
            bool closeThrough = false;

            if (dailyPoiDirection == BiasDirection.Bullish)
            {
                closeThrough = currentClose >= seriesOpen;
            }
            else if (dailyPoiDirection == BiasDirection.Bearish)
            {
                closeThrough = currentClose <= seriesOpen;
            }

            if (closeThrough)
            {
                cisd_confirmed = true;
                cisdBar = CurrentBars[0];

                m5OBHigh = Highs[0][1];
                m5OBLow = Lows[0][1];

                currentState = StrategyState.CISDConfirmed;

                if (EnableDebug)
                    Print($"[CISD] {Times[0][0]} CISD confirmed - OB: {m5OBLow:F2} - {m5OBHigh:F2}");
            }
        }

        #endregion

        #region M5 Entry Trigger

        private void CheckEntryTrigger()
        {
            if (CurrentBars[0] == cisdBar) return;
            if (Position.MarketPosition != MarketPosition.Flat) return;

            // V30 FIX: CRITICAL - Entry direction must match POI direction
            if (dailyBias != dailyPoiDirection)
            {
                if (EnableDebug) Print($"[ENTRY] {Times[0][0]} BLOCKED - Bias ({dailyBias}) != POI direction ({dailyPoiDirection})");
                InvalidatePOI("Entry blocked: bias/POI mismatch");
                return;
            }

            double close = Closes[0][0];
            double high = Highs[0][0];
            double low = Lows[0][0];

            if (dailyPoiDirection == BiasDirection.Bullish)
            {
                if (low <= m5OBHigh && close > m5OBLow)
                {
                    entryPrice = close;
                    stopPrice = m5OBLow - (StopTicksBuffer * TickSize);
                    double riskTicks = (entryPrice - stopPrice) / TickSize;
                    targetPrice = entryPrice + (riskTicks * RiskRewardTarget * TickSize);

                    if (riskTicks > 0 && riskTicks < 100)
                    {
                        SetStopLoss(CalculationMode.Price, stopPrice);
                        SetProfitTarget(CalculationMode.Price, targetPrice);
                        EnterLong(Contracts, "BullishEntry");

                        currentState = StrategyState.InTrade;
                        wasInTrade = true;

                        if (EnableDebug)
                            Print($"[ENTRY] {Times[0][0]} LONG at {entryPrice:F2} (POI: {dailyPoiType} at support)");
                    }
                }
            }
            else if (dailyPoiDirection == BiasDirection.Bearish)
            {
                if (high >= m5OBLow && close < m5OBHigh)
                {
                    entryPrice = close;
                    stopPrice = m5OBHigh + (StopTicksBuffer * TickSize);
                    double riskTicks = (stopPrice - entryPrice) / TickSize;
                    targetPrice = entryPrice - (riskTicks * RiskRewardTarget * TickSize);

                    if (riskTicks > 0 && riskTicks < 100)
                    {
                        SetStopLoss(CalculationMode.Price, stopPrice);
                        SetProfitTarget(CalculationMode.Price, targetPrice);
                        EnterShort(Contracts, "BearishEntry");

                        currentState = StrategyState.InTrade;
                        wasInTrade = true;

                        if (EnableDebug)
                            Print($"[ENTRY] {Times[0][0]} SHORT at {entryPrice:F2} (POI: {dailyPoiType} at resistance)");
                    }
                }
            }
        }

        #endregion

        #region Trade Management

        private void ManageTrade()
        {
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
            dailyPoiValid = false;
            dailyPoiType = POIType.None;
            dailyPoiDirection = BiasDirection.None;
            ResetC1C2State();
            cisd_confirmed = false;
            invalidationCloseCount = 0;
            wasInTrade = false;
            cisdBar = -1;
            poiDetectedDailyBar = -1;

            currentState = StrategyState.BiasEstablished;

            if (EnableDebug) Print($"[STATE] Reset for next setup -> BiasEstablished");
        }

        #endregion
    }
}

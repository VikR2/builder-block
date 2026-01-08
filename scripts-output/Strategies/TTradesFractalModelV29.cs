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
    // TTradesFractalModelV29 - Pullback-Based C1/C2 Pattern Fix
    // ==========================================================================
    // Source: TTrades Fractal Model video (9AL41xON3hA) + screenshot analysis
    //
    // V29 FIXES (from V28 analysis + screenshot):
    // - C1/C2 is a PULLBACK pattern, not consecutive closes
    // - C1 = First touch into zone
    // - PULLBACK = Price bounces AWAY from zone (confirms zone holds)
    // - C2 = Return to zone WITH opening filter
    // - Added 2 new states: C1Confirmed, PullbackComplete
    //
    // Flow: Daily Bias -> DAILY POI -> C1 Touch -> Pullback -> C2 Return -> M5 CISD -> Entry
    // ==========================================================================
    public class TTradesFractalModelV29 : Strategy
    {
        #region State Machine (7 States - Added Pullback)

        private enum StrategyState
        {
            Idle,              // No bias yet
            BiasEstablished,   // Daily bias confirmed, looking for POI
            POIIdentified,     // DAILY POI found, waiting for C1
            C1Confirmed,       // C1 touched zone, waiting for PULLBACK  <-- NEW
            PullbackComplete,  // Pullback done, waiting for C2          <-- NEW
            C2Confirmed,       // C2 re-tested zone, waiting for CISD
            CISDConfirmed,     // CISD done, waiting for OB entry
            InTrade            // Position open
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

        // C1/C2 Confirmation (PULLBACK PATTERN)
        private bool c1Confirmed = false;
        private double c1ClosePrice;
        private int c1Bar = -1;
        private double pullbackExtreme;     // Track swing point during pullback
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
                Description = "TTrades Fractal Model V29 - Pullback-based C1/C2 pattern";
                Name = "TTradesFractalModelV29";
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

                // Default parameters
                Contracts = 1;
                RiskRewardTarget = 2.0;
                StopTicksBuffer = 4;
                ReactionZoneMultiplier = 1.5;  // 50% expansion
                CISDMinOpposingSeries = 2;
                POIInvalidationThreshold = 6;
                EnableDebug = true;
            }
            else if (State == State.Configure)
            {
                // Add data series: Daily, H1, M5
                AddDataSeries(BarsPeriodType.Day, 1);     // Index 1 = Daily (Bias + POI)
                AddDataSeries(BarsPeriodType.Minute, 60); // Index 2 = H1 (C1/C2 confirmation)
                // Primary series is M5 (Index 0)
            }
        }

        protected override void OnBarUpdate()
        {
            // Ensure all data series have enough bars
            if (CurrentBars[0] < BarsRequiredToTrade) return;
            if (BarsInProgress == 1 && CurrentBars[1] < 3) return;
            if (BarsInProgress == 2 && CurrentBars[2] < 20) return;

            // Route to appropriate handler
            switch (BarsInProgress)
            {
                case 0:  // M5 (Entry timeframe)
                    ProcessEntryTimeframe();
                    break;
                case 1:  // Daily (Bias + POI timeframe)
                    ProcessBiasTimeframe();
                    break;
                case 2:  // H1 (C1/C2 confirmation with pullback)
                    ProcessConfirmationTimeframe();
                    break;
            }
        }

        #region Daily Bias + POI Detection

        private void ProcessBiasTimeframe()
        {
            // === STEP 1: Detect Daily Bias ===
            if (Times[1][0].Date != lastBiasDate)
            {
                DetectDailyBias();
            }

            // === STEP 2: Detect Daily POI ===
            if (dailyBias != BiasDirection.None && currentState == StrategyState.BiasEstablished)
            {
                DetectDailyPOI();
            }
        }

        private void DetectDailyBias()
        {
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
                dailyPoiTop = previousDayLow + (15 * TickSize);
                dailyPoiBottom = previousDayLow - (15 * TickSize);
                dailyPoiType = POIType.PDHL;
                dailyPoiDirection = BiasDirection.Bullish;
                dailyPoiValid = true;
                poiDetectedDailyBar = CurrentBars[1];
                currentState = StrategyState.POIIdentified;
                ResetC1C2State();
                if (EnableDebug) Print($"[POI] {Times[1][0]:d} DAILY PDL POI at {previousDayLow:F2}");
                return true;
            }

            if (dailyBias == BiasDirection.Bearish)
            {
                dailyPoiTop = previousDayHigh + (15 * TickSize);
                dailyPoiBottom = previousDayHigh - (15 * TickSize);
                dailyPoiType = POIType.PDHL;
                dailyPoiDirection = BiasDirection.Bearish;
                dailyPoiValid = true;
                poiDetectedDailyBar = CurrentBars[1];
                currentState = StrategyState.POIIdentified;
                ResetC1C2State();
                if (EnableDebug) Print($"[POI] {Times[1][0]:d} DAILY PDH POI at {previousDayHigh:F2}");
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

        #region H1 C1/C2 with PULLBACK Pattern (V29 FIX)

        private void ProcessConfirmationTimeframe()
        {
            if (!dailyPoiValid) return;

            // Check for POI invalidation
            CheckPOIInvalidation();

            // Process C1/C2 PULLBACK pattern based on current state
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

        /// <summary>
        /// STEP 1: Wait for C1 (First candle that CLOSES inside POI zone)
        /// "Price finally reaches my zone - I'm watching but NOT trading"
        /// </summary>
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

                // Initialize pullback tracking
                if (dailyPoiDirection == BiasDirection.Bullish)
                {
                    pullbackExtreme = high;  // Track highest point for bullish
                }
                else
                {
                    pullbackExtreme = low;   // Track lowest point for bearish
                }

                currentState = StrategyState.C1Confirmed;

                if (EnableDebug)
                    Print($"[C1] {Times[2][0]} C1 at {close:F2} - zone touched, waiting for PULLBACK");
            }
        }

        /// <summary>
        /// STEP 2: Wait for PULLBACK (Price bounces AWAY from zone)
        /// "I need to see price react and pull away - confirms zone is holding"
        /// </summary>
        private void CheckForPullback()
        {
            double close = Closes[2][0];
            double high = Highs[2][0];
            double low = Lows[2][0];

            // Pullback = candle closes OUTSIDE zone in the expected direction

            if (dailyPoiDirection == BiasDirection.Bullish)
            {
                // Bullish: pullback = price bounces UP, closes ABOVE zone
                if (close > dailyPoiTop)
                {
                    pullbackExtreme = Math.Max(pullbackExtreme, high);
                    currentState = StrategyState.PullbackComplete;

                    if (EnableDebug)
                        Print($"[PULLBACK] {Times[2][0]} Bullish pullback complete - high: {pullbackExtreme:F2}, waiting for C2 return");
                }
                else
                {
                    // Track pullback extreme while still in/near zone
                    pullbackExtreme = Math.Max(pullbackExtreme, high);
                }
            }
            else if (dailyPoiDirection == BiasDirection.Bearish)
            {
                // Bearish: pullback = price bounces DOWN, closes BELOW zone
                if (close < dailyPoiBottom)
                {
                    pullbackExtreme = Math.Min(pullbackExtreme, low);
                    currentState = StrategyState.PullbackComplete;

                    if (EnableDebug)
                        Print($"[PULLBACK] {Times[2][0]} Bearish pullback complete - low: {pullbackExtreme:F2}, waiting for C2 return");
                }
                else
                {
                    // Track pullback extreme while still in/near zone
                    pullbackExtreme = Math.Min(pullbackExtreme, low);
                }
            }
        }

        /// <summary>
        /// STEP 3: Wait for C2 (Return to zone with OPENING FILTER)
        /// "Price comes back to my zone - NOW I'm ready for entry setup"
        /// C2 must OPEN outside zone and CLOSE inside zone
        /// </summary>
        private void CheckForC2()
        {
            double open = Opens[2][0];
            double close = Closes[2][0];
            double high = Highs[2][0];
            double low = Lows[2][0];

            bool closeInZone = IsCandleInDailyPOIZone(close, high, low);
            bool openOutsideZone = !IsPriceInZone(open);

            // C2 Opening Filter: Must OPEN outside zone and CLOSE inside zone
            if (closeInZone && openOutsideZone)
            {
                c2Confirmed = true;
                c2ClosePrice = close;
                currentState = StrategyState.C2Confirmed;

                if (EnableDebug)
                    Print($"[C2] {Times[2][0]} C2 at {close:F2} - opening filter PASSED (open: {open:F2} outside, close: {close:F2} inside), ready for CISD");
            }
        }

        private bool IsCandleInDailyPOIZone(double close, double high, double low)
        {
            // Elastic zone expansion
            double zoneSize = dailyPoiTop - dailyPoiBottom;
            double expansion = zoneSize * (ReactionZoneMultiplier - 1.0) / 2.0;

            double reactionTop = dailyPoiTop + expansion;
            double reactionBottom = dailyPoiBottom - expansion;

            // Candle touches zone (wick OR body)
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
            if (EnableDebug) Print($"[POI] {Times[2][0]} POI invalidated: {reason}");

            dailyPoiValid = false;
            dailyPoiType = POIType.None;
            ResetC1C2State();
            invalidationCloseCount = 0;
            poiDetectedDailyBar = -1;

            currentState = StrategyState.BiasEstablished;
            if (EnableDebug) Print($"[STATE] -> BiasEstablished (POI invalidated)");
        }

        #endregion

        #region M5 Processing (CISD + Entry)

        private void ProcessEntryTimeframe()
        {
            // Only process if we're past C2 confirmation
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

                if (dailyBias == BiasDirection.Bullish)
                {
                    isOpposing = Closes[0][i] < Opens[0][i];
                }
                else if (dailyBias == BiasDirection.Bearish)
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

            if (dailyBias == BiasDirection.Bullish)
            {
                closeThrough = currentClose >= seriesOpen;
            }
            else if (dailyBias == BiasDirection.Bearish)
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
                    Print($"[CISD] {Times[0][0]} CISD confirmed - OB: {m5OBLow:F2} - {m5OBHigh:F2}, Series: {opposingCount} candles");
            }
        }

        #endregion

        #region M5 Entry Trigger

        private void CheckEntryTrigger()
        {
            if (CurrentBars[0] == cisdBar) return;
            if (Position.MarketPosition != MarketPosition.Flat) return;

            double close = Closes[0][0];
            double high = Highs[0][0];
            double low = Lows[0][0];

            if (dailyBias == BiasDirection.Bullish)
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
                            Print($"[ENTRY] {Times[0][0]} LONG at {entryPrice:F2}, Stop: {stopPrice:F2}, Target: {targetPrice:F2}, Risk: {riskTicks:F1} ticks");
                    }
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
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
                            Print($"[ENTRY] {Times[0][0]} SHORT at {entryPrice:F2}, Stop: {stopPrice:F2}, Target: {targetPrice:F2}, Risk: {riskTicks:F1} ticks");
                    }
                }
            }
        }

        #endregion

        #region Trade Management

        private void ManageTrade()
        {
            // Trade management handled by NinjaTrader stop/target
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

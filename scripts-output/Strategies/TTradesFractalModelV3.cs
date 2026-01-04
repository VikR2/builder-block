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
    /// <summary>
    /// TTrades Fractal Model 2026 - V3 (Fully Configurable Multi-Timeframe)
    ///
    /// Fractal model = self-similar across ALL timeframes
    /// Configure any combination: Daily→H1→M5 or 4HR→30min→3min etc.
    /// </summary>
    public class TTradesFractalModelV3 : Strategy
    {
        #region Enums

        public enum BiasDirection { None, Bullish, Bearish }
        public enum BiasType { None, Continuation, Reversal }
        public enum StrategyState { Idle, BiasSet, POIFound, C2Confirmed, EntryWait, InTrade }
        public enum StopPlacement { BodyExtreme, WickExtreme }

        // Timeframe options for dropdowns
        public enum BiasTimeframeOption { Daily, H4, H1 }
        public enum StructureTimeframeOption { H4_240, H1_60, M30_30, M15_15 }
        public enum EntryTimeframeOption { M15_15, M5_5, M3_3, M1_1 }

        #endregion

        #region Variables

        // State tracking
        private StrategyState currentState = StrategyState.Idle;
        private BiasDirection dailyBias = BiasDirection.None;
        private BiasType biasType = BiasType.None;

        // Previous period values (for bias TF)
        private double pdh, pdl, pdc;
        private DateTime lastBiasBarTime = DateTime.MinValue;

        // POI tracking
        private double poiHigh;
        private double poiLow;
        private bool poiActive = false;
        private int poiBarIndex = 0;
        private int c2ConfirmBarIndex = 0;  // Track when C2 confirmed for entry timeout

        // Protected swing for stops
        private double protectedSwing;

        // Trade management
        private double entryPrice;
        private double stopPrice;
        private double targetPrice;

        // Swing tracking
        private double recentSwingHigh;
        private double recentSwingLow;
        private int swingLookback = 10;

        // Data series indices - mapped at runtime
        private int biasBarsIndex;
        private int poiBarsIndex;
        private int confirmBarsIndex;
        private int entryBarsIndex;

        // Pre-loaded data series indices (fixed)
        // [0] = Primary, [1] = Daily, [2] = H4, [3] = H1, [4] = M30, [5] = M15, [6] = M5, [7] = M3, [8] = M1
        private const int IDX_DAILY = 1;
        private const int IDX_H4 = 2;
        private const int IDX_H1 = 3;
        private const int IDX_M30 = 4;
        private const int IDX_M15 = 5;
        private const int IDX_M5 = 6;
        private const int IDX_M3 = 7;
        private const int IDX_M1 = 8;

        #endregion

        #region Properties - Timeframes

        [NinjaScriptProperty]
        [Display(Name = "Bias Timeframe", Description = "Higher timeframe for direction", Order = 1, GroupName = "1. Timeframes")]
        public BiasTimeframeOption BiasTimeframe { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "POI Timeframe", Description = "FVG/swing detection", Order = 2, GroupName = "1. Timeframes")]
        public StructureTimeframeOption POITimeframe { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Confirm Timeframe", Description = "C2/C3 closure confirmation", Order = 3, GroupName = "1. Timeframes")]
        public StructureTimeframeOption ConfirmTimeframe { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Entry Timeframe", Description = "Continuation OB trigger", Order = 4, GroupName = "1. Timeframes")]
        public EntryTimeframeOption EntryTimeframe { get; set; }

        #endregion

        #region Properties - Risk Management

        [NinjaScriptProperty]
        [Display(Name = "Min Risk/Reward", Order = 1, GroupName = "2. Risk Management")]
        public double MinRiskReward { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Stop Placement", Order = 2, GroupName = "2. Risk Management")]
        public StopPlacement StopType { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Contracts", Order = 3, GroupName = "2. Risk Management")]
        public int Contracts { get; set; }

        [NinjaScriptProperty]
        [Range(0, 60)]
        [Display(Name = "Entry Cutoff Minutes", Description = "No entries within X minutes of session end", Order = 4, GroupName = "2. Risk Management")]
        public int EntryCutoffMinutes { get; set; }

        #endregion

        #region Properties - Detection

        [NinjaScriptProperty]
        [Display(Name = "POI Lookback Bars", Order = 1, GroupName = "3. Detection")]
        public int POILookback { get; set; }

        [NinjaScriptProperty]
        [Range(0, 10)]
        [Display(Name = "FVG Gap Tolerance (ticks)", Description = "Allow near-gaps with this overlap", Order = 2, GroupName = "3. Detection")]
        public int FVGGapTolerance { get; set; }

        #endregion

        #region Properties - Debug

        [NinjaScriptProperty]
        [Display(Name = "Enable Debug Prints", Order = 1, GroupName = "4. Debug")]
        public bool DebugMode { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Alerts", Order = 2, GroupName = "4. Debug")]
        public bool EnableAlerts { get; set; }

        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"TTrades Fractal Model V3 - Fully Configurable Timeframes";
                Name = "TTradesFractalModelV3";
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
                TimeInForce = TimeInForce.Day;
                TraceOrders = false;
                RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade = 20;
                IsInstantiatedOnEachOptimizationIteration = true;

                // Default: TTrades setup (Daily → H1 → M5)
                BiasTimeframe = BiasTimeframeOption.Daily;
                POITimeframe = StructureTimeframeOption.H1_60;
                ConfirmTimeframe = StructureTimeframeOption.H1_60;
                EntryTimeframe = EntryTimeframeOption.M5_5;

                MinRiskReward = 2.0;
                StopType = StopPlacement.BodyExtreme;
                Contracts = 1;
                EntryCutoffMinutes = 5;    // No entries within 5 min of session end (prevents stranded positions)
                POILookback = 50;          // Increased from 20 for more POI opportunities
                FVGGapTolerance = 2;       // Allow near-gaps (2 tick overlap)
                DebugMode = true;
                EnableAlerts = true;
            }
            else if (State == State.Configure)
            {
                // Pre-add ALL common timeframes (NT8 requirement)
                // User selection maps to these at runtime
                AddDataSeries(BarsPeriodType.Day, 1);      // [1] Daily
                AddDataSeries(BarsPeriodType.Minute, 240); // [2] H4
                AddDataSeries(BarsPeriodType.Minute, 60);  // [3] H1
                AddDataSeries(BarsPeriodType.Minute, 30);  // [4] M30
                AddDataSeries(BarsPeriodType.Minute, 15);  // [5] M15
                AddDataSeries(BarsPeriodType.Minute, 5);   // [6] M5
                AddDataSeries(BarsPeriodType.Minute, 3);   // [7] M3
                AddDataSeries(BarsPeriodType.Minute, 1);   // [8] M1
            }
            else if (State == State.DataLoaded)
            {
                // Map user selections to data series indices
                MapTimeframeSelections();
                ResetState();

                if (DebugMode)
                {
                    Print($"[V3 INIT] Bias={BiasTimeframe}, POI={POITimeframe}, Confirm={ConfirmTimeframe}, Entry={EntryTimeframe}");
                    Print($"[V3 INIT] Mapped indices: Bias=[{biasBarsIndex}], POI=[{poiBarsIndex}], Confirm=[{confirmBarsIndex}], Entry=[{entryBarsIndex}]");
                }
            }
        }

        private void MapTimeframeSelections()
        {
            // Map Bias TF selection to index
            switch (BiasTimeframe)
            {
                case BiasTimeframeOption.Daily: biasBarsIndex = IDX_DAILY; break;
                case BiasTimeframeOption.H4: biasBarsIndex = IDX_H4; break;
                case BiasTimeframeOption.H1: biasBarsIndex = IDX_H1; break;
                default: biasBarsIndex = IDX_DAILY; break;
            }

            // Map POI TF selection to index
            switch (POITimeframe)
            {
                case StructureTimeframeOption.H4_240: poiBarsIndex = IDX_H4; break;
                case StructureTimeframeOption.H1_60: poiBarsIndex = IDX_H1; break;
                case StructureTimeframeOption.M30_30: poiBarsIndex = IDX_M30; break;
                case StructureTimeframeOption.M15_15: poiBarsIndex = IDX_M15; break;
                default: poiBarsIndex = IDX_H1; break;
            }

            // Map Confirm TF selection to index
            switch (ConfirmTimeframe)
            {
                case StructureTimeframeOption.H4_240: confirmBarsIndex = IDX_H4; break;
                case StructureTimeframeOption.H1_60: confirmBarsIndex = IDX_H1; break;
                case StructureTimeframeOption.M30_30: confirmBarsIndex = IDX_M30; break;
                case StructureTimeframeOption.M15_15: confirmBarsIndex = IDX_M15; break;
                default: confirmBarsIndex = IDX_H1; break;
            }

            // Map Entry TF selection to index
            switch (EntryTimeframe)
            {
                case EntryTimeframeOption.M15_15: entryBarsIndex = IDX_M15; break;
                case EntryTimeframeOption.M5_5: entryBarsIndex = IDX_M5; break;
                case EntryTimeframeOption.M3_3: entryBarsIndex = IDX_M3; break;
                case EntryTimeframeOption.M1_1: entryBarsIndex = IDX_M1; break;
                default: entryBarsIndex = IDX_M5; break;
            }
        }

        protected override void OnBarUpdate()
        {
            // Ensure we have enough bars on all timeframes
            if (CurrentBars[0] < BarsRequiredToTrade) return;
            if (CurrentBars[biasBarsIndex] < 2) return;
            if (CurrentBars[poiBarsIndex] < POILookback) return;
            if (CurrentBars[confirmBarsIndex] < POILookback) return;
            if (CurrentBars[entryBarsIndex] < 5) return;

            // Process based on which data series triggered the update
            // NOTE: Use if (not else if) because indices may overlap when TFs are same
            if (BarsInProgress == biasBarsIndex)
            {
                ProcessBiasBar();
            }

            if (BarsInProgress == poiBarsIndex)
            {
                ProcessPOIBar();
            }

            // Confirm can be same TF as POI - must run after POI processing
            if (BarsInProgress == confirmBarsIndex)
            {
                ProcessConfirmBar();
            }

            if (BarsInProgress == entryBarsIndex)
            {
                ProcessEntryBar();
            }
        }

        #region Bias Timeframe Processing

        private void ProcessBiasBar()
        {
            // Only process once per bias bar
            if (Times[biasBarsIndex][0] == lastBiasBarTime)
                return;
            lastBiasBarTime = Times[biasBarsIndex][0];

            // Store previous period values
            pdh = Highs[biasBarsIndex][1];
            pdl = Lows[biasBarsIndex][1];
            pdc = Closes[biasBarsIndex][1];

            double currentClose = Closes[biasBarsIndex][0];
            double currentHigh = Highs[biasBarsIndex][0];
            double currentLow = Lows[biasBarsIndex][0];

            BiasDirection oldBias = dailyBias;

            DetermineBias(currentClose, currentHigh, currentLow);

            if (DebugMode)
            {
                Print($"[BIAS] {Times[biasBarsIndex][0]:MM/dd HH:mm} | PDH={pdh:F2} PDL={pdl:F2} | Close={currentClose:F2} | Bias={dailyBias} ({biasType})");
            }

            if (dailyBias != BiasDirection.None)
            {
                if (oldBias != dailyBias)
                {
                    poiActive = false;
                    protectedSwing = 0;
                }

                if (currentState == StrategyState.Idle)
                {
                    TransitionState(StrategyState.BiasSet);
                }
            }
        }

        private void DetermineBias(double close, double high, double low)
        {
            // CONTINUATION
            if (close > pdh)
            {
                dailyBias = BiasDirection.Bullish;
                biasType = BiasType.Continuation;
                return;
            }
            if (close < pdl)
            {
                dailyBias = BiasDirection.Bearish;
                biasType = BiasType.Continuation;
                return;
            }

            // REVERSAL
            if (low < pdl && close > pdl)
            {
                dailyBias = BiasDirection.Bullish;
                biasType = BiasType.Reversal;
                return;
            }
            if (high > pdh && close < pdh)
            {
                dailyBias = BiasDirection.Bearish;
                biasType = BiasType.Reversal;
                return;
            }

            // Inside - keep previous or determine from position
            if (dailyBias == BiasDirection.None)
            {
                double mid = (pdh + pdl) / 2;
                dailyBias = close > mid ? BiasDirection.Bullish : BiasDirection.Bearish;
                biasType = BiasType.Continuation;
            }
        }

        #endregion

        #region POI Timeframe Processing

        private void ProcessPOIBar()
        {
            if (dailyBias == BiasDirection.None) return;
            if (Position.MarketPosition != MarketPosition.Flat) return;
            if (currentState != StrategyState.BiasSet && currentState != StrategyState.POIFound) return;

            UpdateSwingLevels();

            if (!poiActive)
            {
                FindPOI();
            }
        }

        private void UpdateSwingLevels()
        {
            recentSwingHigh = double.MinValue;
            recentSwingLow = double.MaxValue;

            for (int i = 1; i <= swingLookback && i < CurrentBars[poiBarsIndex]; i++)
            {
                recentSwingHigh = Math.Max(recentSwingHigh, Highs[poiBarsIndex][i]);
                recentSwingLow = Math.Min(recentSwingLow, Lows[poiBarsIndex][i]);
            }
        }

        private void FindPOI()
        {
            // Look for FVG on POI timeframe
            for (int i = 2; i < POILookback && i < CurrentBars[poiBarsIndex] - 2; i++)
            {
                double c1High = Highs[poiBarsIndex][i + 2];
                double c1Low = Lows[poiBarsIndex][i + 2];
                double c3High = Highs[poiBarsIndex][i];
                double c3Low = Lows[poiBarsIndex][i];

                // BULLISH FVG (with tolerance for near-gaps)
                double tolerance = FVGGapTolerance * TickSize;
                if (c3Low >= c1High - tolerance)
                {
                    double fvgMid = (c3Low + c1High) / 2;
                    if (dailyBias == BiasDirection.Bullish && fvgMid < (pdh + pdl) / 2)
                    {
                        poiHigh = c3Low;
                        poiLow = c1High;
                        poiActive = true;
                        poiBarIndex = CurrentBars[poiBarsIndex];
                        protectedSwing = recentSwingLow;

                        if (DebugMode)
                            Print($"[POI] {Times[poiBarsIndex][0]} | BULLISH FVG: {poiLow:F2}-{poiHigh:F2}");

                        DrawPOIZone(true);
                        TransitionState(StrategyState.POIFound);
                        return;
                    }
                }

                // BEARISH FVG (with tolerance for near-gaps)
                if (c3High <= c1Low + tolerance)
                {
                    double fvgMid = (c3High + c1Low) / 2;
                    if (dailyBias == BiasDirection.Bearish && fvgMid > (pdh + pdl) / 2)
                    {
                        poiHigh = c1Low;
                        poiLow = c3High;
                        poiActive = true;
                        poiBarIndex = CurrentBars[poiBarsIndex];
                        protectedSwing = recentSwingHigh;

                        if (DebugMode)
                            Print($"[POI] {Times[poiBarsIndex][0]} | BEARISH FVG: {poiLow:F2}-{poiHigh:F2}");

                        DrawPOIZone(false);
                        TransitionState(StrategyState.POIFound);
                        return;
                    }
                }
            }

            // Fallback: use swing level (widened zones for more opportunities)
            if (!poiActive)
            {
                if (dailyBias == BiasDirection.Bullish)
                {
                    poiHigh = recentSwingLow + (10 * TickSize);  // Widened from 2
                    poiLow = recentSwingLow - (10 * TickSize);   // Widened from 5
                    poiActive = true;
                    poiBarIndex = CurrentBars[poiBarsIndex];
                    protectedSwing = recentSwingLow - (15 * TickSize);

                    if (DebugMode)
                        Print($"[POI] {Times[poiBarsIndex][0]} | SWING FALLBACK BULL: {poiLow:F2}-{poiHigh:F2}");

                    TransitionState(StrategyState.POIFound);
                }
                else if (dailyBias == BiasDirection.Bearish)
                {
                    poiLow = recentSwingHigh - (10 * TickSize);  // Widened from 2
                    poiHigh = recentSwingHigh + (10 * TickSize); // Widened from 5
                    poiActive = true;
                    poiBarIndex = CurrentBars[poiBarsIndex];
                    protectedSwing = recentSwingHigh + (15 * TickSize);

                    if (DebugMode)
                        Print($"[POI] {Times[poiBarsIndex][0]} | SWING FALLBACK BEAR: {poiLow:F2}-{poiHigh:F2}");

                    TransitionState(StrategyState.POIFound);
                }
            }
        }

        private void DrawPOIZone(bool bullish)
        {
            string tag = "POI_" + CurrentBars[poiBarsIndex];
            Brush fillColor = bullish ? Brushes.LightGreen : Brushes.LightCoral;
            Draw.Rectangle(this, tag, false, 5, poiHigh, 0, poiLow, Brushes.Transparent, fillColor, 25);
        }

        #endregion

        #region Confirmation Timeframe Processing

        private void ProcessConfirmBar()
        {
            if (dailyBias == BiasDirection.None) return;
            if (Position.MarketPosition != MarketPosition.Flat) return;
            if (!poiActive) return;
            if (currentState != StrategyState.POIFound) return;

            // CRITICAL: Check POI expiry FIRST, before touch check
            // Otherwise untouched POIs never expire and block new POI detection
            int barsSincePOI = CurrentBars[confirmBarsIndex] - poiBarIndex;
            if (barsSincePOI > POILookback * 3)
            {
                if (DebugMode)
                    Print($"[CONFIRM] POI expired after {barsSincePOI} bars (never touched)");
                poiActive = false;
                TransitionState(StrategyState.BiasSet);
                return;
            }

            CheckC2C3Closure();
        }

        private void CheckC2C3Closure()
        {
            double close = Closes[confirmBarsIndex][0];
            double open = Opens[confirmBarsIndex][0];
            double high = Highs[confirmBarsIndex][0];
            double low = Lows[confirmBarsIndex][0];

            bool touchedPOI = (low <= poiHigh && high >= poiLow);
            if (!touchedPOI) return;

            // BULLISH C2 closure
            if (dailyBias == BiasDirection.Bullish)
            {
                bool dippedIntoPOI = low <= poiHigh;
                bool closedBullish = close > open;
                bool closedAbovePOI = close > poiHigh;
                bool bodyAboveMidPOI = Math.Min(open, close) > (poiHigh + poiLow) / 2;

                if (dippedIntoPOI && closedBullish && (closedAbovePOI || bodyAboveMidPOI))
                {
                    if (DebugMode)
                        Print($"[CONFIRM] {Times[confirmBarsIndex][0]} | BULLISH C2 closure");

                    stopPrice = StopType == StopPlacement.BodyExtreme ?
                                Math.Min(open, close) - TickSize : low - TickSize;

                    if (protectedSwing > 0 && protectedSwing < stopPrice)
                        stopPrice = protectedSwing - TickSize;

                    c2ConfirmBarIndex = CurrentBars[entryBarsIndex];
                    TransitionState(StrategyState.C2Confirmed);
                }
            }
            // BEARISH C2 closure
            else if (dailyBias == BiasDirection.Bearish)
            {
                bool roseIntoPOI = high >= poiLow;
                bool closedBearish = close < open;
                bool closedBelowPOI = close < poiLow;
                bool bodyBelowMidPOI = Math.Max(open, close) < (poiHigh + poiLow) / 2;

                if (roseIntoPOI && closedBearish && (closedBelowPOI || bodyBelowMidPOI))
                {
                    if (DebugMode)
                        Print($"[CONFIRM] {Times[confirmBarsIndex][0]} | BEARISH C2 closure");

                    stopPrice = StopType == StopPlacement.BodyExtreme ?
                                Math.Max(open, close) + TickSize : high + TickSize;

                    if (protectedSwing > 0 && protectedSwing > stopPrice)
                        stopPrice = protectedSwing + TickSize;

                    c2ConfirmBarIndex = CurrentBars[entryBarsIndex];
                    TransitionState(StrategyState.C2Confirmed);
                }
            }
            // Note: POI expiry check moved to ProcessConfirmBar() to run before touchedPOI return
        }

        #endregion

        #region Entry Timeframe Processing

        private void ProcessEntryBar()
        {
            if (Position.MarketPosition != MarketPosition.Flat) return;
            if (currentState != StrategyState.C2Confirmed && currentState != StrategyState.EntryWait) return;

            // Entry timeout - if no entry within POILookback bars, reset
            int barsSinceC2 = CurrentBars[entryBarsIndex] - c2ConfirmBarIndex;
            if (barsSinceC2 > POILookback)
            {
                if (DebugMode)
                    Print($"[ENTRY] Entry timeout after {barsSinceC2} bars - resetting");
                poiActive = false;
                TransitionState(StrategyState.BiasSet);
                return;
            }

            if (currentState == StrategyState.C2Confirmed)
            {
                TransitionState(StrategyState.EntryWait);
            }

            if (CheckContinuationEntry())
            {
                ExecuteEntry();
            }
        }

        private bool CheckContinuationEntry()
        {
            if (CurrentBars[entryBarsIndex] < 5) return false;

            double close = Closes[entryBarsIndex][0];
            double open = Opens[entryBarsIndex][0];
            double prevClose = Closes[entryBarsIndex][1];
            double prevOpen = Opens[entryBarsIndex][1];

            if (dailyBias == BiasDirection.Bullish)
            {
                bool currentBullish = close > open;
                bool prevBullish = prevClose > prevOpen;
                bool strongBullish = (close - open) > (Highs[entryBarsIndex][0] - Lows[entryBarsIndex][0]) * 0.6;
                bool aboveSwingLow = close > recentSwingLow;

                if (currentBullish && (prevBullish || strongBullish) && aboveSwingLow)
                {
                    if (DebugMode)
                        Print($"[ENTRY] {Times[entryBarsIndex][0]} | Bullish continuation");
                    return true;
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                bool currentBearish = close < open;
                bool prevBearish = prevClose < prevOpen;
                bool strongBearish = (open - close) > (Highs[entryBarsIndex][0] - Lows[entryBarsIndex][0]) * 0.6;
                bool belowSwingHigh = close < recentSwingHigh;

                if (currentBearish && (prevBearish || strongBearish) && belowSwingHigh)
                {
                    if (DebugMode)
                        Print($"[ENTRY] {Times[entryBarsIndex][0]} | Bearish continuation");
                    return true;
                }
            }

            return false;
        }

        private void ExecuteEntry()
        {
            // Don't enter near session close to prevent stranded positions
            TimeSpan sessionEnd = new TimeSpan(17, 0, 0);  // 5:00 PM
            TimeSpan cutoff = sessionEnd.Subtract(TimeSpan.FromMinutes(EntryCutoffMinutes));
            if (Time[0].TimeOfDay >= cutoff)
            {
                if (DebugMode)
                    Print($"[ENTRY] Skipped - too close to session end ({Time[0]:t})");
                return;
            }

            entryPrice = Closes[entryBarsIndex][0];

            if (dailyBias == BiasDirection.Bullish)
            {
                double localLow = Math.Min(Lows[entryBarsIndex][0], Math.Min(Lows[entryBarsIndex][1], Lows[entryBarsIndex][2]));
                stopPrice = Math.Min(stopPrice, localLow - TickSize);
            }
            else
            {
                double localHigh = Math.Max(Highs[entryBarsIndex][0], Math.Max(Highs[entryBarsIndex][1], Highs[entryBarsIndex][2]));
                stopPrice = Math.Max(stopPrice, localHigh + TickSize);
            }

            double risk = Math.Abs(entryPrice - stopPrice);
            targetPrice = dailyBias == BiasDirection.Bullish ?
                         entryPrice + (risk * MinRiskReward) :
                         entryPrice - (risk * MinRiskReward);

            // Use PDH/PDL if provides 1.5R+
            if (dailyBias == BiasDirection.Bullish && pdh > entryPrice)
            {
                double pdhRR = (pdh - entryPrice) / risk;
                if (pdhRR >= 1.5 && pdhRR < MinRiskReward)
                    targetPrice = pdh;
            }
            else if (dailyBias == BiasDirection.Bearish && pdl < entryPrice)
            {
                double pdlRR = (entryPrice - pdl) / risk;
                if (pdlRR >= 1.5 && pdlRR < MinRiskReward)
                    targetPrice = pdl;
            }

            string entryName = dailyBias == BiasDirection.Bullish ? "FractalLong" : "FractalShort";

            if (dailyBias == BiasDirection.Bullish)
            {
                EnterLong(Contracts, entryName);
                Draw.ArrowUp(this, "Entry_" + CurrentBar, false, 0, Lows[entryBarsIndex][0] - 4 * TickSize, Brushes.Green);
            }
            else
            {
                EnterShort(Contracts, entryName);
                Draw.ArrowDown(this, "Entry_" + CurrentBar, false, 0, Highs[entryBarsIndex][0] + 4 * TickSize, Brushes.Red);
            }

            SetStopLoss(entryName, CalculationMode.Price, stopPrice, false);
            SetProfitTarget(entryName, CalculationMode.Price, targetPrice);

            TransitionState(StrategyState.InTrade);

            double rr = Math.Abs(targetPrice - entryPrice) / risk;
            string msg = $"ENTRY {dailyBias} @ {entryPrice:F2} | Stop: {stopPrice:F2} | Target: {targetPrice:F2} | RR: {rr:F1}";
            Print($"[TRADE] {Times[entryBarsIndex][0]} | {msg}");

            if (EnableAlerts)
            {
                Alert("Entry", Priority.High, msg,
                      NinjaTrader.Core.Globals.InstallDir + @"\sounds\Alert3.wav",
                      10, Brushes.Blue, Brushes.White);
            }
        }

        #endregion

        #region State Management

        private void TransitionState(StrategyState newState)
        {
            if (DebugMode && currentState != newState)
            {
                Print($"[STATE] {currentState} -> {newState}");
            }
            currentState = newState;
        }

        private void ResetState()
        {
            currentState = StrategyState.Idle;
            dailyBias = BiasDirection.None;
            biasType = BiasType.None;
            poiActive = false;
            poiBarIndex = 0;
            c2ConfirmBarIndex = 0;
            protectedSwing = 0;
        }

        protected override void OnExecutionUpdate(Execution execution, string executionId,
            double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            if (Position.MarketPosition == MarketPosition.Flat && currentState == StrategyState.InTrade)
            {
                Print($"[TRADE] {time} | Position closed @ {price:F2}");
                poiActive = false;
                TransitionState(StrategyState.BiasSet);
            }
        }

        #endregion
    }
}

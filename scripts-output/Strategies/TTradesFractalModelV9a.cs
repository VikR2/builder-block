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
    /// TTrades Fractal Model 2026 - V9a - Pure TTrades
    ///
    /// V9a Changes from V8:
    /// - FIX 1: Block entries when insufficient H1 swing data (was allowing entries)
    /// - FIX 2: Faster swing detection - ConfirmSwingLookback 5->3 (7 H1 bars vs 11)
    /// - FIX 3: Preserve swing history across bias changes (don't reset swings)
    /// - FIX 4: Increased MaxCISDSeriesCandles 5->7 for volatile conditions
    ///
    /// Rationale: Pure TTrades methodology requires structure confirmation
    /// before entry. V8 was too permissive with insufficient data.
    ///
    /// Timeframe Flow:
    /// Daily (Bias + HTF POI) -> H1 (C2/C3 + CISD + Structure) -> M5 (Entry OB)
    /// </summary>
    public class TTradesFractalModelV9a : Strategy
    {
        #region Enums

        public enum BiasDirection { None, Bullish, Bearish }
        public enum BiasType { None, Continuation, Reversal }

        // V5 Simplified State Machine
        public enum StrategyState
        {
            Idle,           // Waiting for bias
            BiasSet,        // Bias determined, HTF POIs identified
            WaitingForPOI,  // Waiting for price to reach HTF POI
            C2C3Forming,    // Price at POI, looking for C2/C3
            CISDConfirmed,  // C2/C3 + CISD confirmed
            OBFormed,       // Order block detected on entry TF
            EntryWait,      // Waiting for OB retest
            InTrade         // Position open
        }

        public enum OBStopType { OBWick, OBBody, ProtectedSwing }
        public enum POIType { OldHigh, OldLow, Swing, OrderBlock }

        // Timeframe options
        public enum BiasTimeframeOption { Daily, H4, H1 }
        public enum ConfirmTimeframeOption { H4_240, H1_60, M30_30, M15_15 }
        public enum EntryTimeframeOption { M15_15, M5_5, M3_3, M1_1 }

        #endregion

        #region Variables

        // State tracking
        private StrategyState currentState = StrategyState.Idle;
        private BiasDirection dailyBias = BiasDirection.None;
        private BiasType biasType = BiasType.None;

        // Previous period values (for bias TF)
        private double pdh, pdl, pdc;
        private double pwh = 0, pwl = 0;  // Previous week high/low (0 = not set)
        private DateTime lastBiasBarTime = DateTime.MinValue;

        // HTF POI Tracking (on Bias TF)
        private class HTFPOI
        {
            public double Level { get; set; }
            public double ZoneHigh { get; set; }
            public double ZoneLow { get; set; }
            public POIType Type { get; set; }
            public string Description { get; set; }
        }
        private List<HTFPOI> htfPOIs;
        private HTFPOI activePOI;
        private const int POIZoneTicks = 40;  // Zone around POI levels (10 points on ES)

        // V6: Approach Series Tracking (tracks opposing candles BEFORE POI touch)
        private double approachSeriesOpen;      // Opening of first opposing candle in approach
        private double approachSeriesExtreme;   // Low for bullish approach, High for bearish
        private int approachSeriesCount;        // Count of consecutive opposing candles
        private bool approachSeriesActive = false;

        // CISD Tracking
        private double cisdReferencePrice;
        private int opposingSeriesCount;
        private int opposingSeriesStartBar;
        private bool cisdActive = false;

        // V7: Track CISD series extreme for proper protected swing (TTrades Skill #63, #73)
        private double cisdSeriesExtreme;  // Low for bullish (bearish candles), High for bearish

        // C2/C3 Tracking
        private bool c2c3Detected = false;
        private int barsAtPOI = 0;
        private const int MinBarsAtPOI = 1;  // At least 1 bar touching POI
        private const int MinApproachSeriesCandles = 2;  // V6: Require 2+ candles in approach series
        private const int MaxCISDSeriesCandles = 7;  // V9a: Allow more volatile conditions (was 5)

        // V6: Breakeven Stop
        private bool breakevenSet = false;
        private double riskAmount = 0;

        // Order Block Tracking (Entry TF)
        private double obHigh;
        private double obLow;
        private bool obCreatesFVG;
        private int obBarIndex;
        private double obEntry50Pct;
        private double obFvgTop;
        private double obFvgBottom;

        // Protected swing for stops
        private double protectedSwing;

        // Trade management
        private double entryPrice;
        private double stopPrice;
        private double targetPrice;
        private double price1R;
        private bool partialExitTaken = false;
        private int entryContracts;

        // Circuit breaker
        private int consecutiveLosses = 0;
        private DateTime pauseUntil = DateTime.MinValue;
        private DateTime currentSessionDate = DateTime.MinValue;

        // Swing tracking on Bias TF
        private double biasSwingHigh;
        private double biasSwingLow;
        private int swingLookback = 20;

        // V8: Track swing structure on confirm TF for alignment validation (TTrades Skill #70)
        private double confirmSwingHigh1, confirmSwingHigh2;  // Most recent, second most recent
        private double confirmSwingLow1, confirmSwingLow2;
        private const int ConfirmSwingLookback = 3;  // V9a: Faster detection (7 H1 bars vs 11)

        // Data series indices
        private int biasBarsIndex;
        private int confirmBarsIndex;
        private int entryBarsIndex;

        // Fixed indices
        private const int IDX_DAILY = 1;
        private const int IDX_H4 = 2;
        private const int IDX_H1 = 3;
        private const int IDX_M30 = 4;
        private const int IDX_M15 = 5;
        private const int IDX_M5 = 6;
        private const int IDX_M3 = 7;
        private const int IDX_M1 = 8;

        // Order management
        private string lastEntryName = "";

        #endregion

        #region Properties - Timeframes

        [NinjaScriptProperty]
        [Display(Name = "Bias Timeframe", Description = "Higher timeframe for bias + HTF POI", Order = 1, GroupName = "1. Timeframes")]
        public BiasTimeframeOption BiasTimeframe { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Confirm Timeframe", Description = "C2/C3 closure + CISD confirmation", Order = 2, GroupName = "1. Timeframes")]
        public ConfirmTimeframeOption ConfirmTimeframe { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Entry Timeframe", Description = "Order block trigger", Order = 3, GroupName = "1. Timeframes")]
        public EntryTimeframeOption EntryTimeframe { get; set; }

        #endregion

        #region Properties - Risk Management

        [NinjaScriptProperty]
        [Display(Name = "Min Risk/Reward", Order = 1, GroupName = "2. Risk Management")]
        public double MinRiskReward { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "OB Stop Type", Description = "Stop placement relative to OB", Order = 2, GroupName = "2. Risk Management")]
        public OBStopType StopType { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Contracts", Order = 3, GroupName = "2. Risk Management")]
        public int Contracts { get; set; }

        [NinjaScriptProperty]
        [Range(0, 60)]
        [Display(Name = "Entry Cutoff Minutes", Description = "No entries within X minutes of session end", Order = 4, GroupName = "2. Risk Management")]
        public int EntryCutoffMinutes { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Partial Exit", Description = "Take 50% off at 1R", Order = 5, GroupName = "2. Risk Management")]
        public bool EnablePartialExit { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Partial Exit RR", Description = "R multiple for partial exit", Order = 6, GroupName = "2. Risk Management")]
        public double PartialExitRR { get; set; }

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "Max Consecutive Losses", Description = "Circuit breaker trigger", Order = 7, GroupName = "2. Risk Management")]
        public int MaxConsecutiveLosses { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Breakeven Stop", Description = "V6: Move stop to entry at 1R", Order = 8, GroupName = "2. Risk Management")]
        public bool EnableBreakevenStop { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Breakeven Trigger RR", Description = "R multiple to trigger breakeven", Order = 9, GroupName = "2. Risk Management")]
        public double BreakevenTriggerRR { get; set; }

        [NinjaScriptProperty]
        [Range(0, 60)]
        [Display(Name = "Force Exit Minutes", Description = "Exit position X minutes before session end (0=disabled)", Order = 10, GroupName = "2. Risk Management")]
        public int ForceExitMinutes { get; set; }

        #endregion

        #region Properties - Detection

        [NinjaScriptProperty]
        [Display(Name = "Swing Lookback", Description = "Bars to look back for swings on Bias TF", Order = 1, GroupName = "3. Detection")]
        public int SwingLookback { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "OB Lookback", Description = "Bars to look back for OBs on Bias TF", Order = 2, GroupName = "3. Detection")]
        public int OBLookback { get; set; }

        [NinjaScriptProperty]
        [Range(1, 5)]
        [Display(Name = "CISD Min Candles", Description = "Min candles in opposing series", Order = 3, GroupName = "3. Detection")]
        public int CISDMinCandles { get; set; }

        [NinjaScriptProperty]
        [Range(10, 100)]
        [Display(Name = "Min OB Displacement Ticks", Description = "Min displacement after OB", Order = 4, GroupName = "3. Detection")]
        public int MinOBDisplacementTicks { get; set; }

        #endregion

        #region Properties - Sessions

        [NinjaScriptProperty]
        [Display(Name = "Enable NY Session", Order = 1, GroupName = "4. Sessions")]
        public bool EnableNYSession { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "NY Start Hour", Order = 2, GroupName = "4. Sessions")]
        public int NYStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "NY End Hour", Order = 3, GroupName = "4. Sessions")]
        public int NYEndHour { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable London Session", Order = 4, GroupName = "4. Sessions")]
        public bool EnableLondonSession { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "London Start Hour", Order = 5, GroupName = "4. Sessions")]
        public int LondonStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "London End Hour", Order = 6, GroupName = "4. Sessions")]
        public int LondonEndHour { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Asia Session", Order = 7, GroupName = "4. Sessions")]
        public bool EnableAsiaSession { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Asia Start Hour", Order = 8, GroupName = "4. Sessions")]
        public int AsiaStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Asia End Hour", Order = 9, GroupName = "4. Sessions")]
        public int AsiaEndHour { get; set; }

        #endregion

        #region Properties - Debug

        [NinjaScriptProperty]
        [Display(Name = "Enable Debug Prints", Order = 1, GroupName = "5. Debug")]
        public bool DebugMode { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Alerts", Order = 2, GroupName = "5. Debug")]
        public bool EnableAlerts { get; set; }

        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"TTrades Fractal Model V9a - Pure TTrades";
                Name = "TTradesFractalModelV9a";
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

                // Default: Daily (Bias+POI) -> H1 (Confirm) -> M5 (Entry)
                BiasTimeframe = BiasTimeframeOption.Daily;
                ConfirmTimeframe = ConfirmTimeframeOption.H1_60;
                EntryTimeframe = EntryTimeframeOption.M5_5;

                // Risk defaults
                MinRiskReward = 2.0;
                StopType = OBStopType.ProtectedSwing;
                Contracts = 1;
                EntryCutoffMinutes = 5;
                EnablePartialExit = true;
                PartialExitRR = 1.0;
                MaxConsecutiveLosses = 2;

                // V6: Breakeven defaults
                EnableBreakevenStop = true;
                BreakevenTriggerRR = 1.0;
                ForceExitMinutes = 15;  // V6 FIX: Force exit 15 min before session end

                // Detection defaults
                SwingLookback = 20;
                OBLookback = 50;
                CISDMinCandles = 2;
                MinOBDisplacementTicks = 50;

                // Session defaults
                EnableNYSession = true;
                NYStartHour = 9;
                NYEndHour = 16;
                EnableLondonSession = true;
                LondonStartHour = 3;
                LondonEndHour = 8;
                EnableAsiaSession = true;
                AsiaStartHour = 20;
                AsiaEndHour = 2;

                DebugMode = true;
                EnableAlerts = true;
            }
            else if (State == State.Configure)
            {
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
                MapTimeframeSelections();
                htfPOIs = new List<HTFPOI>();
                swingLookback = SwingLookback;
                ResetState();

                if (DebugMode)
                {
                    Print($"[V9a INIT] Bias={BiasTimeframe}, Confirm={ConfirmTimeframe}, Entry={EntryTimeframe}");
                    Print($"[V9a INIT] Mapped: Bias=[{biasBarsIndex}], Confirm=[{confirmBarsIndex}], Entry=[{entryBarsIndex}]");
                }
            }
        }

        private void MapTimeframeSelections()
        {
            switch (BiasTimeframe)
            {
                case BiasTimeframeOption.Daily: biasBarsIndex = IDX_DAILY; break;
                case BiasTimeframeOption.H4: biasBarsIndex = IDX_H4; break;
                case BiasTimeframeOption.H1: biasBarsIndex = IDX_H1; break;
                default: biasBarsIndex = IDX_DAILY; break;
            }

            switch (ConfirmTimeframe)
            {
                case ConfirmTimeframeOption.H4_240: confirmBarsIndex = IDX_H4; break;
                case ConfirmTimeframeOption.H1_60: confirmBarsIndex = IDX_H1; break;
                case ConfirmTimeframeOption.M30_30: confirmBarsIndex = IDX_M30; break;
                case ConfirmTimeframeOption.M15_15: confirmBarsIndex = IDX_M15; break;
                default: confirmBarsIndex = IDX_H1; break;
            }

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
            if (CurrentBars[0] < BarsRequiredToTrade) return;
            if (CurrentBars[biasBarsIndex] < 5) return;
            if (CurrentBars[confirmBarsIndex] < 20) return;
            if (CurrentBars[entryBarsIndex] < 5) return;

            CheckSessionReset();

            bool inTradingSession = IsWithinTradingSession();

            // Process based on which data series triggered
            if (BarsInProgress == biasBarsIndex)
            {
                ProcessBiasBar();
            }

            if (BarsInProgress == confirmBarsIndex)
            {
                ProcessConfirmBar();
            }

            if (BarsInProgress == entryBarsIndex)
            {
                ProcessEntryBar(inTradingSession);
            }
        }

        #region Session Management

        private void CheckSessionReset()
        {
            DateTime today = Time[0].Date;
            if (today != currentSessionDate)
            {
                currentSessionDate = today;
                if (consecutiveLosses > 0)
                {
                    consecutiveLosses = 0;
                    if (DebugMode)
                        Print($"[SESSION] New day - losses reset");
                }
            }
        }

        private bool IsWithinTradingSession()
        {
            int hour = Time[0].Hour;

            if (!EnableNYSession && !EnableLondonSession && !EnableAsiaSession)
                return true;

            if (EnableNYSession && hour >= NYStartHour && hour < NYEndHour)
                return true;

            if (EnableLondonSession && hour >= LondonStartHour && hour < LondonEndHour)
                return true;

            if (EnableAsiaSession)
            {
                if (AsiaStartHour > AsiaEndHour)
                {
                    if (hour >= AsiaStartHour || hour < AsiaEndHour)
                        return true;
                }
                else
                {
                    if (hour >= AsiaStartHour && hour < AsiaEndHour)
                        return true;
                }
            }

            return false;
        }

        private TimeSpan GetActiveSessionEnd()
        {
            int hour = Time[0].Hour;

            if (EnableNYSession && hour >= NYStartHour && hour < NYEndHour)
                return new TimeSpan(NYEndHour, 0, 0);

            if (EnableLondonSession && hour >= LondonStartHour && hour < LondonEndHour)
                return new TimeSpan(LondonEndHour, 0, 0);

            if (EnableAsiaSession)
            {
                if (AsiaStartHour > AsiaEndHour)
                {
                    if (hour >= AsiaStartHour || hour < AsiaEndHour)
                        return new TimeSpan(AsiaEndHour, 0, 0);
                }
            }

            return new TimeSpan(17, 0, 0);
        }

        #endregion

        #region Bias Timeframe Processing (Bias + HTF POI)

        private void ProcessBiasBar()
        {
            if (Times[biasBarsIndex][0] == lastBiasBarTime)
                return;
            lastBiasBarTime = Times[biasBarsIndex][0];

            // Store previous period values
            if (CurrentBars[biasBarsIndex] >= 2)
            {
                pdh = Highs[biasBarsIndex][1];
                pdl = Lows[biasBarsIndex][1];
                pdc = Closes[biasBarsIndex][1];
            }

            // Store previous week values (for daily TF)
            if (biasBarsIndex == IDX_DAILY && CurrentBars[biasBarsIndex] >= 6)
            {
                pwh = 0;
                pwl = double.MaxValue;
                for (int i = 1; i <= 5 && i < CurrentBars[biasBarsIndex]; i++)
                {
                    pwh = Math.Max(pwh, Highs[biasBarsIndex][i]);
                    pwl = Math.Min(pwl, Lows[biasBarsIndex][i]);
                }
                // Convert MaxValue sentinel to actual value (pwl will be > 0 after loop)
                if (pwl == double.MaxValue) pwl = 0;
            }

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
                // On bias change, reset state
                if (oldBias != dailyBias && oldBias != BiasDirection.None)
                {
                    if (currentState == StrategyState.InTrade || Position.MarketPosition != MarketPosition.Flat)
                    {
                        if (DebugMode)
                            Print($"[BIAS-CHANGE] {oldBias} -> {dailyBias}, but IN TRADE - keeping state");
                        return;
                    }

                    if (DebugMode)
                        Print($"[BIAS-CHANGE] {oldBias} -> {dailyBias}, resetting");

                    ResetForNewBias();

                    // V9a: Don't reset swings on bias change - preserve structure history
                    // confirmSwingHigh1 = 0;
                    // confirmSwingHigh2 = 0;
                    // confirmSwingLow1 = 0;
                    // confirmSwingLow2 = 0;
                }

                // Identify HTF POIs on Bias TF
                IdentifyHTFPOIs();

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

            // Inside - determine from position
            if (dailyBias == BiasDirection.None)
            {
                double mid = (pdh + pdl) / 2;
                dailyBias = close > mid ? BiasDirection.Bullish : BiasDirection.Bearish;
                biasType = BiasType.Continuation;
            }
        }

        #endregion

        #region HTF POI Detection (On Bias TF)

        private void IdentifyHTFPOIs()
        {
            htfPOIs.Clear();
            double currentPrice = Closes[biasBarsIndex][0];
            double zoneSize = POIZoneTicks * TickSize;

            // 1. Old Highs/Lows (PDH, PDL, PWH, PWL)
            AddPOI(pdh, POIType.OldHigh, "PDH", zoneSize);
            AddPOI(pdl, POIType.OldLow, "PDL", zoneSize);

            if (pwh > 0)
                AddPOI(pwh, POIType.OldHigh, "PWH", zoneSize);
            if (pwl > 0)
                AddPOI(pwl, POIType.OldLow, "PWL", zoneSize);

            // 2. Swings on Bias TF
            FindBiasSwings(zoneSize);

            // 3. OLD Order Blocks on Bias TF
            FindBiasOrderBlocks(zoneSize);

            // Filter POIs by bias direction
            if (dailyBias == BiasDirection.Bullish)
            {
                // For bullish: POIs below current price (retracement targets)
                htfPOIs = htfPOIs.Where(p => p.Level < currentPrice).ToList();
            }
            else
            {
                // For bearish: POIs above current price
                htfPOIs = htfPOIs.Where(p => p.Level > currentPrice).ToList();
            }

            // Sort by distance to current price (closest first)
            htfPOIs = htfPOIs.OrderBy(p => Math.Abs(p.Level - currentPrice)).ToList();

            if (DebugMode && htfPOIs.Count > 0)
            {
                Print($"[HTF-POI] Found {htfPOIs.Count} POIs for {dailyBias} bias:");
                foreach (var poi in htfPOIs.Take(5))
                {
                    Print($"  - {poi.Description}: {poi.Level:F2} (zone: {poi.ZoneLow:F2}-{poi.ZoneHigh:F2})");
                }
            }

            if (htfPOIs.Count > 0)
            {
                TransitionState(StrategyState.WaitingForPOI);
            }
        }

        private void AddPOI(double level, POIType type, string desc, double zoneSize)
        {
            if (level <= 0) return;

            htfPOIs.Add(new HTFPOI
            {
                Level = level,
                ZoneHigh = level + zoneSize,
                ZoneLow = level - zoneSize,
                Type = type,
                Description = desc
            });
        }

        private void FindBiasSwings(double zoneSize)
        {
            biasSwingHigh = double.MinValue;
            biasSwingLow = double.MaxValue;

            // Find swing high/low on bias TF
            for (int i = 2; i < swingLookback && i < CurrentBars[biasBarsIndex] - 2; i++)
            {
                double h = Highs[biasBarsIndex][i];
                double l = Lows[biasBarsIndex][i];

                // Swing high: higher than neighbors
                if (h > Highs[biasBarsIndex][i - 1] && h > Highs[biasBarsIndex][i - 2] &&
                    h > Highs[biasBarsIndex][i + 1] && h > Highs[biasBarsIndex][i + 2])
                {
                    AddPOI(h, POIType.Swing, $"SwingH[{i}]", zoneSize);
                    biasSwingHigh = Math.Max(biasSwingHigh, h);
                }

                // Swing low: lower than neighbors
                if (l < Lows[biasBarsIndex][i - 1] && l < Lows[biasBarsIndex][i - 2] &&
                    l < Lows[biasBarsIndex][i + 1] && l < Lows[biasBarsIndex][i + 2])
                {
                    AddPOI(l, POIType.Swing, $"SwingL[{i}]", zoneSize);
                    biasSwingLow = Math.Min(biasSwingLow, l);
                }
            }
        }

        private void FindBiasOrderBlocks(double zoneSize)
        {
            double minDisplacement = MinOBDisplacementTicks * TickSize;

            for (int i = 2; i < OBLookback && i < CurrentBars[biasBarsIndex] - 1; i++)
            {
                double candleOpen = Opens[biasBarsIndex][i];
                double candleClose = Closes[biasBarsIndex][i];
                double candleHigh = Highs[biasBarsIndex][i];
                double candleLow = Lows[biasBarsIndex][i];

                // Bullish OB: bearish candle followed by bullish displacement
                if (candleClose < candleOpen)
                {
                    double nextHigh = Highs[biasBarsIndex][i - 1];
                    double displacement = nextHigh - candleHigh;

                    if (displacement >= minDisplacement)
                    {
                        double obLevel = (candleHigh + candleLow) / 2;
                        AddPOI(obLevel, POIType.OrderBlock, $"BullOB[{i}]", zoneSize);
                    }
                }

                // Bearish OB: bullish candle followed by bearish displacement
                if (candleClose > candleOpen)
                {
                    double nextLow = Lows[biasBarsIndex][i - 1];
                    double displacement = candleLow - nextLow;

                    if (displacement >= minDisplacement)
                    {
                        double obLevel = (candleHigh + candleLow) / 2;
                        AddPOI(obLevel, POIType.OrderBlock, $"BearOB[{i}]", zoneSize);
                    }
                }
            }
        }

        #endregion

        #region Confirmation Timeframe Processing (C2/C3 + CISD)

        private void ProcessConfirmBar()
        {
            // V8: Always update H1 swing structure tracking
            UpdateConfirmSwingStructure();

            if (dailyBias == BiasDirection.None) return;
            if (Position.MarketPosition != MarketPosition.Flat) return;

            // V6: Track approaching series WHILE waiting for POI (before touch)
            if (currentState == StrategyState.WaitingForPOI || currentState == StrategyState.BiasSet)
            {
                TrackApproachingSeries();
                CheckPOITouch();
            }

            // Once at POI, look for C2/C3 closure using pre-tracked approach series
            if (currentState == StrategyState.C2C3Forming)
            {
                CheckC2C3Closure();
            }
        }

        // V8: Track swing points on confirm TF
        private void UpdateConfirmSwingStructure()
        {
            int lookback = ConfirmSwingLookback;
            int idx = confirmBarsIndex;

            if (CurrentBars[idx] < lookback * 2 + 1) return;

            // Check for new swing high
            double midHigh = Highs[idx][lookback];
            bool isSwingHigh = true;
            for (int i = 0; i < lookback; i++)
            {
                if (Highs[idx][i] >= midHigh || Highs[idx][lookback + 1 + i] >= midHigh)
                {
                    isSwingHigh = false;
                    break;
                }
            }
            if (isSwingHigh && midHigh != confirmSwingHigh1)
            {
                confirmSwingHigh2 = confirmSwingHigh1;
                confirmSwingHigh1 = midHigh;
                if (DebugMode)
                    Print($"[H1-SWING] New swing HIGH: {midHigh:F2} (prev: {confirmSwingHigh2:F2})");
            }

            // Check for new swing low
            double midLow = Lows[idx][lookback];
            bool isSwingLow = true;
            for (int i = 0; i < lookback; i++)
            {
                if (Lows[idx][i] <= midLow || Lows[idx][lookback + 1 + i] <= midLow)
                {
                    isSwingLow = false;
                    break;
                }
            }
            if (isSwingLow && midLow != confirmSwingLow1)
            {
                confirmSwingLow2 = confirmSwingLow1;
                confirmSwingLow1 = midLow;
                if (DebugMode)
                    Print($"[H1-SWING] New swing LOW: {midLow:F2} (prev: {confirmSwingLow2:F2})");
            }
        }

        // V8: Validate H1 structure matches daily bias (TTrades Skill #70: "ALL 3 TFs point same direction")
        private bool ValidateH1StructureAlignment()
        {
            // V9a: BLOCK entry when insufficient data (was allowing in V8)
            if (confirmSwingHigh2 == 0 || confirmSwingLow2 == 0)
            {
                if (DebugMode)
                    Print($"[H1-STRUCTURE] BLOCKED - insufficient swing data");
                return false;  // BLOCK entry until structure established
            }

            if (dailyBias == BiasDirection.Bearish)
            {
                // Bearish requires LOWER HIGHS on H1
                // confirmSwingHigh1 < confirmSwingHigh2 = making lower highs = bearish structure
                bool aligned = confirmSwingHigh1 < confirmSwingHigh2;

                if (!aligned && DebugMode)
                    Print($"[H1-STRUCTURE] BEARISH BLOCKED - H1 NOT making lower highs: SH1={confirmSwingHigh1:F2} vs SH2={confirmSwingHigh2:F2}");
                else if (aligned && DebugMode)
                    Print($"[H1-STRUCTURE] BEARISH ALIGNED - H1 making lower highs: SH1={confirmSwingHigh1:F2} < SH2={confirmSwingHigh2:F2}");

                return aligned;
            }
            else if (dailyBias == BiasDirection.Bullish)
            {
                // Bullish requires HIGHER LOWS on H1
                // confirmSwingLow1 > confirmSwingLow2 = making higher lows = bullish structure
                bool aligned = confirmSwingLow1 > confirmSwingLow2;

                if (!aligned && DebugMode)
                    Print($"[H1-STRUCTURE] BULLISH BLOCKED - H1 NOT making higher lows: SL1={confirmSwingLow1:F2} vs SL2={confirmSwingLow2:F2}");
                else if (aligned && DebugMode)
                    Print($"[H1-STRUCTURE] BULLISH ALIGNED - H1 making higher lows: SL1={confirmSwingLow1:F2} > SL2={confirmSwingLow2:F2}");

                return aligned;
            }

            return false;
        }

        /// <summary>
        /// V6: Track opposing candle series as price approaches POI
        /// This is the delivery that brings price TO the POI
        /// </summary>
        private void TrackApproachingSeries()
        {
            double close = Closes[confirmBarsIndex][0];
            double open = Opens[confirmBarsIndex][0];
            double high = Highs[confirmBarsIndex][0];
            double low = Lows[confirmBarsIndex][0];

            if (dailyBias == BiasDirection.Bullish)
            {
                // For bullish bias: track BEARISH candles approaching POI (price going down)
                bool isBearishCandle = close < open;

                if (isBearishCandle)
                {
                    if (!approachSeriesActive)
                    {
                        // Start new approach series
                        approachSeriesActive = true;
                        approachSeriesOpen = open;  // Opening of first bearish candle
                        approachSeriesExtreme = low;
                        approachSeriesCount = 1;

                        if (DebugMode)
                            Print($"[APPROACH] Started bearish series, open: {approachSeriesOpen:F2}");
                    }
                    else
                    {
                        // Continue series
                        approachSeriesCount++;
                        approachSeriesExtreme = Math.Min(approachSeriesExtreme, low);
                    }
                }
                else
                {
                    // Bullish candle breaks approach series - check if it closed above series opening
                    if (approachSeriesActive && approachSeriesCount >= MinApproachSeriesCandles)
                    {
                        // Series complete - DON'T reset yet, let CheckC2C3Closure use it
                        if (DebugMode)
                            Print($"[APPROACH] Bullish candle after {approachSeriesCount} bearish. Close: {close:F2} vs SeriesOpen: {approachSeriesOpen:F2}");
                    }
                    else if (approachSeriesActive)
                    {
                        // Series too short, reset
                        ResetApproachSeries();
                    }
                }
            }
            else // Bearish bias
            {
                // For bearish bias: track BULLISH candles approaching POI (price going up)
                bool isBullishCandle = close > open;

                if (isBullishCandle)
                {
                    if (!approachSeriesActive)
                    {
                        approachSeriesActive = true;
                        approachSeriesOpen = open;
                        approachSeriesExtreme = high;
                        approachSeriesCount = 1;

                        if (DebugMode)
                            Print($"[APPROACH] Started bullish series, open: {approachSeriesOpen:F2}");
                    }
                    else
                    {
                        approachSeriesCount++;
                        approachSeriesExtreme = Math.Max(approachSeriesExtreme, high);
                    }
                }
                else
                {
                    if (approachSeriesActive && approachSeriesCount >= MinApproachSeriesCandles)
                    {
                        if (DebugMode)
                            Print($"[APPROACH] Bearish candle after {approachSeriesCount} bullish. Close: {close:F2} vs SeriesOpen: {approachSeriesOpen:F2}");
                    }
                    else if (approachSeriesActive)
                    {
                        ResetApproachSeries();
                    }
                }
            }
        }

        private void ResetApproachSeries()
        {
            approachSeriesActive = false;
            approachSeriesOpen = 0;
            approachSeriesExtreme = 0;
            approachSeriesCount = 0;
        }

        /// <summary>
        /// V7: Reset C2C3 state when timing out or price leaving zone
        /// </summary>
        private void ResetC2C3State()
        {
            activePOI = null;
            barsAtPOI = 0;
            c2c3Detected = false;
            cisdActive = false;
            cisdReferencePrice = 0;
            cisdSeriesExtreme = 0;  // V7: Reset CISD series extreme
            opposingSeriesCount = 0;
            ResetApproachSeries();
        }

        private void CheckPOITouch()
        {
            if (htfPOIs.Count == 0) return;

            double high = Highs[confirmBarsIndex][0];
            double low = Lows[confirmBarsIndex][0];
            double close = Closes[confirmBarsIndex][0];

            foreach (var poi in htfPOIs)
            {
                bool touched = false;

                if (dailyBias == BiasDirection.Bullish)
                {
                    // For bullish: price retraces DOWN to/into/through POI zone
                    touched = (low <= poi.ZoneHigh);
                }
                else
                {
                    // For bearish: price retraces UP to/into/through POI zone
                    touched = (high >= poi.ZoneLow);
                }

                if (touched)
                {
                    activePOI = poi;
                    barsAtPOI = 1;

                    // V7: Copy approach series data to CISD tracking
                    // Protected swing will be set from CISD series extreme when CISD confirms
                    if (approachSeriesActive && approachSeriesCount >= MinApproachSeriesCandles)
                    {
                        cisdActive = true;
                        cisdReferencePrice = approachSeriesOpen;
                        opposingSeriesCount = approachSeriesCount;
                        // V7: Initialize CISD series extreme from approach - will be refined as CISD builds
                        cisdSeriesExtreme = approachSeriesExtreme;

                        if (DebugMode)
                            Print($"[POI-TOUCH] {Times[confirmBarsIndex][0]} | {poi.Description} at {poi.Level:F2} | Approach series: {approachSeriesCount} candles, ref: {cisdReferencePrice:F2}, extreme: {cisdSeriesExtreme:F2}");
                    }
                    else
                    {
                        // V7: No valid approach series - CISD will build from scratch at POI
                        // Protected swing will be set when CISD confirms
                        if (DebugMode)
                            Print($"[POI-TOUCH] {Times[confirmBarsIndex][0]} | {poi.Description} at {poi.Level:F2} | No approach series, CISD will build at POI");
                    }

                    TransitionState(StrategyState.C2C3Forming);
                    return;
                }
            }
        }

        /// <summary>
        /// V6: Check for C2 closure using pre-tracked approach series
        /// C2 = reversal candle that closes through the approach series opening
        /// </summary>
        private void CheckC2C3Closure()
        {
            if (activePOI == null) return;

            double close = Closes[confirmBarsIndex][0];
            double open = Opens[confirmBarsIndex][0];
            double high = Highs[confirmBarsIndex][0];
            double low = Lows[confirmBarsIndex][0];

            barsAtPOI++;

            // V6 FIX: Verify price is still at POI zone before processing C2/C3
            bool stillAtPOI = false;
            if (dailyBias == BiasDirection.Bullish)
                stillAtPOI = low <= activePOI.ZoneHigh;  // For bullish, price came from above
            else
                stillAtPOI = high >= activePOI.ZoneLow;  // For bearish, price came from below

            if (!stillAtPOI)
            {
                if (DebugMode)
                    Print($"[C2C3] Price left POI zone (H:{high:F2} L:{low:F2}), resetting");
                ResetC2C3State();
                TransitionState(StrategyState.WaitingForPOI);
                return;
            }

            if (dailyBias == BiasDirection.Bullish)
            {
                bool isBearishCandle = close < open;
                bool isBullishCandle = close > open;

                // V7: Check max CISD series length (TTrades = 2-5 candles max)
                if (cisdActive && opposingSeriesCount > MaxCISDSeriesCandles)
                {
                    if (DebugMode)
                        Print($"[CISD] Series too long ({opposingSeriesCount} candles > {MaxCISDSeriesCandles}), resetting");
                    ResetC2C3State();
                    TransitionState(StrategyState.WaitingForPOI);
                    return;
                }

                // V7: If we don't have a valid CISD series, start tracking at POI
                if (!cisdActive)
                {
                    if (isBearishCandle)
                    {
                        cisdActive = true;
                        cisdReferencePrice = open;
                        cisdSeriesExtreme = low;  // V7: Track lowest low of bearish series
                        opposingSeriesCount = 1;

                        if (DebugMode)
                            Print($"[CISD] Building series at POI, ref: {cisdReferencePrice:F2}, extreme: {cisdSeriesExtreme:F2}");
                    }
                }
                else if (isBearishCandle)
                {
                    // Continue building series
                    opposingSeriesCount++;
                    cisdSeriesExtreme = Math.Min(cisdSeriesExtreme, low);  // V7: Track lowest low

                    if (DebugMode)
                        Print($"[CISD] Series count: {opposingSeriesCount}, extreme: {cisdSeriesExtreme:F2}");
                }
                else if (isBullishCandle)
                {
                    // V7: C2 + CISD: Bullish candle closing above series opening
                    // Must have MinApproachSeriesCandles
                    if (cisdActive && opposingSeriesCount >= MinApproachSeriesCandles)
                    {
                        if (close > cisdReferencePrice)
                        {
                            // V7: Set protected swing from CISD series extreme (TTrades Skill #63, #73)
                            protectedSwing = cisdSeriesExtreme;

                            if (DebugMode)
                                Print($"[C2+CISD] BULLISH CONFIRMED! Close {close:F2} > Ref {cisdReferencePrice:F2} | Series: {opposingSeriesCount} | ProtectedSwing: {protectedSwing:F2}");

                            cisdActive = false;
                            c2c3Detected = true;
                            ResetApproachSeries();
                            TransitionState(StrategyState.CISDConfirmed);
                            return;
                        }
                    }

                    // Bullish candle but didn't close above ref - reset
                    if (cisdActive)
                    {
                        if (DebugMode)
                            Print($"[C2C3] Bullish close {close:F2} failed to break ref {cisdReferencePrice:F2}, reset");
                        cisdActive = false;
                        cisdReferencePrice = 0;
                        cisdSeriesExtreme = 0;  // V7: Reset extreme
                        opposingSeriesCount = 0;
                    }
                }

                // Timeout check
                if (barsAtPOI > 20)
                {
                    if (DebugMode)
                        Print($"[C2C3] Timeout at POI, resetting");
                    ResetC2C3State();
                    TransitionState(StrategyState.WaitingForPOI);
                }
            }
            else // Bearish
            {
                bool isBullishCandle = close > open;
                bool isBearishCandle = close < open;

                // V7: Check max CISD series length
                if (cisdActive && opposingSeriesCount > MaxCISDSeriesCandles)
                {
                    if (DebugMode)
                        Print($"[CISD] Series too long ({opposingSeriesCount} candles > {MaxCISDSeriesCandles}), resetting");
                    ResetC2C3State();
                    TransitionState(StrategyState.WaitingForPOI);
                    return;
                }

                // V7: If we don't have a valid CISD series, start tracking at POI
                if (!cisdActive)
                {
                    if (isBullishCandle)
                    {
                        cisdActive = true;
                        cisdReferencePrice = open;
                        cisdSeriesExtreme = high;  // V7: Track highest high of bullish series
                        opposingSeriesCount = 1;

                        if (DebugMode)
                            Print($"[CISD] Building series at POI, ref: {cisdReferencePrice:F2}, extreme: {cisdSeriesExtreme:F2}");
                    }
                }
                else if (isBullishCandle)
                {
                    opposingSeriesCount++;
                    cisdSeriesExtreme = Math.Max(cisdSeriesExtreme, high);  // V7: Track highest high

                    if (DebugMode)
                        Print($"[CISD] Series count: {opposingSeriesCount}, extreme: {cisdSeriesExtreme:F2}");
                }
                else if (isBearishCandle)
                {
                    // V7: C2 + CISD: Bearish candle closing below series opening
                    if (cisdActive && opposingSeriesCount >= MinApproachSeriesCandles)
                    {
                        if (close < cisdReferencePrice)
                        {
                            // V7: Set protected swing from CISD series extreme (TTrades Skill #63, #73)
                            protectedSwing = cisdSeriesExtreme;

                            if (DebugMode)
                                Print($"[C2+CISD] BEARISH CONFIRMED! Close {close:F2} < Ref {cisdReferencePrice:F2} | Series: {opposingSeriesCount} | ProtectedSwing: {protectedSwing:F2}");

                            cisdActive = false;
                            c2c3Detected = true;
                            TransitionState(StrategyState.CISDConfirmed);
                            return;
                        }
                    }

                    if (cisdActive)
                    {
                        if (DebugMode)
                            Print($"[C2C3] Bearish close failed to break ref, reset");
                        cisdActive = false;
                        cisdReferencePrice = 0;
                        cisdSeriesExtreme = 0;  // V7: Reset extreme
                        opposingSeriesCount = 0;
                    }
                }

                if (barsAtPOI > 20)
                {
                    if (DebugMode)
                        Print($"[C2C3] Timeout at POI, resetting");
                    ResetC2C3State();
                    TransitionState(StrategyState.WaitingForPOI);
                }
            }
        }

        #endregion

        #region Entry Timeframe Processing (Continuation OB)

        private void ProcessEntryBar(bool inTradingSession)
        {
            if (currentState == StrategyState.InTrade && Position.MarketPosition != MarketPosition.Flat)
            {
                // V6 FIX: Force exit before session close to avoid session close losses
                if (ForceExitMinutes > 0)
                {
                    TimeSpan sessionEnd = GetActiveSessionEnd();
                    TimeSpan forceExitTime = sessionEnd.Subtract(TimeSpan.FromMinutes(ForceExitMinutes));
                    TimeSpan currentTime = Time[0].TimeOfDay;

                    if (currentTime >= forceExitTime && currentTime < sessionEnd)
                    {
                        if (dailyBias == BiasDirection.Bullish)
                            ExitLong("ForceExit", lastEntryName);
                        else
                            ExitShort("ForceExit", lastEntryName);

                        if (DebugMode)
                            Print($"[FORCE-EXIT] Position closed {ForceExitMinutes} min before session end");
                        return;
                    }
                }

                CheckBreakevenStop();
                CheckPartialExit();
                return;
            }

            if (Position.MarketPosition != MarketPosition.Flat) return;

            if (currentState == StrategyState.CISDConfirmed)
            {
                DetectContinuationOB();
            }
            else if (currentState == StrategyState.OBFormed)
            {
                TransitionState(StrategyState.EntryWait);
            }
            else if (currentState == StrategyState.EntryWait)
            {
                // Timeout check
                int barsSinceOB = CurrentBars[entryBarsIndex] - obBarIndex;
                if (barsSinceOB > 50)
                {
                    if (DebugMode)
                        Print($"[ENTRY] OB timeout after {barsSinceOB} bars");
                    ResetOrderBlock();
                    TransitionState(StrategyState.WaitingForPOI);
                    return;
                }

                if (inTradingSession && CheckOBEntry())
                {
                    ExecuteEntry();
                }
            }
        }

        private void DetectContinuationOB()
        {
            if (CurrentBars[entryBarsIndex] < 10) return;

            ResetOrderBlock();

            if (dailyBias == BiasDirection.Bullish)
            {
                // Find last bearish candle before bullish displacement
                for (int i = 1; i < 10 && i < CurrentBars[entryBarsIndex] - 2; i++)
                {
                    double candleClose = Closes[entryBarsIndex][i];
                    double candleOpen = Opens[entryBarsIndex][i];

                    if (candleClose < candleOpen) // Bearish candle
                    {
                        double nextClose = Closes[entryBarsIndex][i - 1];
                        double nextOpen = Opens[entryBarsIndex][i - 1];

                        if (nextClose > nextOpen && nextClose > Highs[entryBarsIndex][i])
                        {
                            obHigh = Highs[entryBarsIndex][i];
                            obLow = Lows[entryBarsIndex][i];
                            obBarIndex = CurrentBars[entryBarsIndex];
                            obEntry50Pct = obLow + (obHigh - obLow) / 2;

                            // Check for FVG
                            if (i >= 2)
                            {
                                double c1High = Highs[entryBarsIndex][i + 1];
                                double c3Low = Lows[entryBarsIndex][i - 1];
                                if (c3Low > c1High)
                                {
                                    obCreatesFVG = true;
                                    obFvgTop = c3Low;
                                    obFvgBottom = c1High;
                                }
                            }

                            if (DebugMode)
                                Print($"[OB] Bullish OB: {obLow:F2}-{obHigh:F2}, 50%: {obEntry50Pct:F2}");

                            TransitionState(StrategyState.OBFormed);
                            return;
                        }
                    }
                }
            }
            else // Bearish
            {
                for (int i = 1; i < 10 && i < CurrentBars[entryBarsIndex] - 2; i++)
                {
                    double candleClose = Closes[entryBarsIndex][i];
                    double candleOpen = Opens[entryBarsIndex][i];

                    if (candleClose > candleOpen) // Bullish candle
                    {
                        double nextClose = Closes[entryBarsIndex][i - 1];
                        double nextOpen = Opens[entryBarsIndex][i - 1];

                        if (nextClose < nextOpen && nextClose < Lows[entryBarsIndex][i])
                        {
                            obHigh = Highs[entryBarsIndex][i];
                            obLow = Lows[entryBarsIndex][i];
                            obBarIndex = CurrentBars[entryBarsIndex];
                            obEntry50Pct = obLow + (obHigh - obLow) / 2;

                            // Check for FVG
                            if (i >= 2)
                            {
                                double c1Low = Lows[entryBarsIndex][i + 1];
                                double c3High = Highs[entryBarsIndex][i - 1];
                                if (c3High < c1Low)
                                {
                                    obCreatesFVG = true;
                                    obFvgTop = c1Low;
                                    obFvgBottom = c3High;
                                }
                            }

                            if (DebugMode)
                                Print($"[OB] Bearish OB: {obLow:F2}-{obHigh:F2}, 50%: {obEntry50Pct:F2}");

                            TransitionState(StrategyState.OBFormed);
                            return;
                        }
                    }
                }
            }
        }

        private void CheckPartialExit()
        {
            if (!EnablePartialExit || partialExitTaken) return;
            if (Contracts < 2) return;

            double currentPrice = Closes[entryBarsIndex][0];
            int halfContracts = Contracts / 2;

            if (dailyBias == BiasDirection.Bullish)
            {
                if (currentPrice >= price1R)
                {
                    ExitLong(halfContracts, "Partial1R", lastEntryName);
                    partialExitTaken = true;
                    SetStopLoss(lastEntryName, CalculationMode.Price, entryPrice, false);

                    if (DebugMode)
                        Print($"[PARTIAL] Exited {halfContracts} at {currentPrice:F2}, stop to BE");
                }
            }
            else
            {
                if (currentPrice <= price1R)
                {
                    ExitShort(halfContracts, "Partial1R", lastEntryName);
                    partialExitTaken = true;
                    SetStopLoss(lastEntryName, CalculationMode.Price, entryPrice, false);

                    if (DebugMode)
                        Print($"[PARTIAL] Exited {halfContracts} at {currentPrice:F2}, stop to BE");
                }
            }
        }

        /// <summary>
        /// V6: Check and apply breakeven stop at 1R
        /// </summary>
        private void CheckBreakevenStop()
        {
            if (!EnableBreakevenStop || breakevenSet) return;
            if (entryPrice == 0 || price1R == 0) return;

            double currentPrice = Closes[entryBarsIndex][0];
            bool reachedTarget = false;

            if (dailyBias == BiasDirection.Bullish)
            {
                reachedTarget = currentPrice >= price1R;
            }
            else
            {
                reachedTarget = currentPrice <= price1R;
            }

            if (reachedTarget)
            {
                SetStopLoss(lastEntryName, CalculationMode.Price, entryPrice, false);
                breakevenSet = true;

                if (DebugMode)
                    Print($"[BE-STOP] Moved stop to breakeven at {entryPrice:F2} (price reached 1R at {price1R:F2})");
            }
        }

        private bool CheckOBEntry()
        {
            if (obHigh == 0 || obLow == 0) return false;

            double close = Closes[entryBarsIndex][0];
            double low = Lows[entryBarsIndex][0];
            double high = Highs[entryBarsIndex][0];

            if (dailyBias == BiasDirection.Bullish)
            {
                if (obCreatesFVG)
                {
                    if (low <= obFvgTop && low >= obFvgBottom)
                    {
                        if (DebugMode)
                            Print($"[ENTRY] Bullish FVG touch at {low:F2}");
                        return true;
                    }
                }
                else
                {
                    if (low <= obEntry50Pct && close > obEntry50Pct)
                    {
                        if (DebugMode)
                            Print($"[ENTRY] Bullish OB 50% touch at {obEntry50Pct:F2}");
                        return true;
                    }
                }
            }
            else
            {
                if (obCreatesFVG)
                {
                    if (high >= obFvgBottom && high <= obFvgTop)
                    {
                        if (DebugMode)
                            Print($"[ENTRY] Bearish FVG touch at {high:F2}");
                        return true;
                    }
                }
                else
                {
                    if (high >= obEntry50Pct && close < obEntry50Pct)
                    {
                        if (DebugMode)
                            Print($"[ENTRY] Bearish OB 50% touch at {obEntry50Pct:F2}");
                        return true;
                    }
                }
            }

            return false;
        }

        private void ExecuteEntry()
        {
            if (CurrentBars[entryBarsIndex] < 3) return;

            TimeSpan sessionEnd = GetActiveSessionEnd();
            TimeSpan cutoff = sessionEnd.Subtract(TimeSpan.FromMinutes(EntryCutoffMinutes));
            if (Time[0].TimeOfDay >= cutoff && Time[0].TimeOfDay < sessionEnd)
            {
                if (DebugMode)
                    Print($"[ENTRY] Skipped - too close to session end");
                return;
            }

            // V7: Entry alignment filter - entry candle must match bias direction
            double entryClose = Closes[entryBarsIndex][0];
            double entryOpen = Opens[entryBarsIndex][0];
            bool entryAligned = (dailyBias == BiasDirection.Bullish && entryClose > entryOpen) ||
                                (dailyBias == BiasDirection.Bearish && entryClose < entryOpen);
            if (!entryAligned)
            {
                if (DebugMode)
                    Print($"[ENTRY] Skipped - entry candle (O:{entryOpen:F2} C:{entryClose:F2}) not aligned with {dailyBias} bias");
                return;
            }

            // V8: Validate H1 structure alignment before entry
            if (!ValidateH1StructureAlignment())
            {
                if (DebugMode)
                    Print($"[ENTRY] Skipped - H1 structure not aligned with {dailyBias} bias");
                return;
            }

            entryPrice = Closes[entryBarsIndex][0];
            entryContracts = Contracts;
            partialExitTaken = false;
            breakevenSet = false;  // V6: Reset breakeven flag on new trade

            // Determine stop
            if (dailyBias == BiasDirection.Bullish)
            {
                switch (StopType)
                {
                    case OBStopType.OBWick:
                        stopPrice = obLow - TickSize;
                        break;
                    case OBStopType.OBBody:
                        stopPrice = obLow + (obHigh - obLow) * 0.1 - TickSize;
                        break;
                    case OBStopType.ProtectedSwing:
                        stopPrice = protectedSwing - TickSize;
                        break;
                }

                double localLow = Math.Min(Lows[entryBarsIndex][0], Math.Min(Lows[entryBarsIndex][1], Lows[entryBarsIndex][2]));
                stopPrice = Math.Min(stopPrice, localLow - TickSize);
            }
            else
            {
                switch (StopType)
                {
                    case OBStopType.OBWick:
                        stopPrice = obHigh + TickSize;
                        break;
                    case OBStopType.OBBody:
                        stopPrice = obHigh - (obHigh - obLow) * 0.1 + TickSize;
                        break;
                    case OBStopType.ProtectedSwing:
                        stopPrice = protectedSwing + TickSize;
                        break;
                }

                double localHigh = Math.Max(Highs[entryBarsIndex][0], Math.Max(Highs[entryBarsIndex][1], Highs[entryBarsIndex][2]));
                stopPrice = Math.Max(stopPrice, localHigh + TickSize);
            }

            double risk = Math.Abs(entryPrice - stopPrice);

            price1R = dailyBias == BiasDirection.Bullish ?
                     entryPrice + (risk * PartialExitRR) :
                     entryPrice - (risk * PartialExitRR);

            targetPrice = dailyBias == BiasDirection.Bullish ?
                         entryPrice + (risk * MinRiskReward) :
                         entryPrice - (risk * MinRiskReward);

            // Use PDH/PDL if closer
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

            lastEntryName = dailyBias == BiasDirection.Bullish ? "FractalLongV9a" : "FractalShortV9a";

            if (dailyBias == BiasDirection.Bullish)
            {
                EnterLong(Contracts, lastEntryName);
                Draw.ArrowUp(this, "Entry_" + CurrentBar, false, 0, Lows[entryBarsIndex][0] - 4 * TickSize, Brushes.Green);
            }
            else
            {
                EnterShort(Contracts, lastEntryName);
                Draw.ArrowDown(this, "Entry_" + CurrentBar, false, 0, Highs[entryBarsIndex][0] + 4 * TickSize, Brushes.Red);
            }

            SetStopLoss(lastEntryName, CalculationMode.Price, stopPrice, false);
            SetProfitTarget(lastEntryName, CalculationMode.Price, targetPrice);

            TransitionState(StrategyState.InTrade);

            double rr = Math.Abs(targetPrice - entryPrice) / risk;
            string msg = $"ENTRY {dailyBias} @ {entryPrice:F2} | Stop: {stopPrice:F2} | Target: {targetPrice:F2} | RR: {rr:F1}";
            Print($"[TRADE] {Times[entryBarsIndex][0]} | {msg}");

            if (EnableAlerts)
            {
                Alert("Entry", Priority.High, msg,
                      NinjaTrader.Core.Globals.InstallDir + @"\sounds\\Alert3.wav",
                      10, Brushes.Blue, Brushes.White);
            }
        }

        private void ResetOrderBlock()
        {
            obHigh = 0;
            obLow = 0;
            obCreatesFVG = false;
            obBarIndex = 0;
            obEntry50Pct = 0;
            obFvgTop = 0;
            obFvgBottom = 0;
        }

        #endregion

        #region Trade Management

        protected override void OnExecutionUpdate(Execution execution, string executionId,
            double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            if (Position.MarketPosition == MarketPosition.Flat && currentState == StrategyState.InTrade)
            {
                bool isLoss = false;

                if (dailyBias == BiasDirection.Bullish)
                    isLoss = price <= entryPrice;
                else
                    isLoss = price >= entryPrice;

                if (partialExitTaken && Math.Abs(price - entryPrice) < 2 * TickSize)
                {
                    isLoss = false;
                    Print($"[TRADE] {time} | BE EXIT @ {price:F2}");
                    consecutiveLosses = 0;
                }
                else if (isLoss)
                {
                    consecutiveLosses++;
                    Print($"[TRADE] {time} | LOSS @ {price:F2} | Consecutive: {consecutiveLosses}");

                    if (consecutiveLosses >= MaxConsecutiveLosses)
                    {
                        Print($"[CIRCUIT] {MaxConsecutiveLosses} losses - PAUSING");
                        pauseUntil = time.Date.AddDays(1);
                    }
                }
                else
                {
                    consecutiveLosses = 0;
                    Print($"[TRADE] {time} | WIN @ {price:F2}");
                }

                ResetForNewBias();
                TransitionState(StrategyState.BiasSet);
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

        private void ResetForNewBias()
        {
            activePOI = null;
            barsAtPOI = 0;
            c2c3Detected = false;
            cisdActive = false;
            cisdReferencePrice = 0;
            cisdSeriesExtreme = 0;  // V7: Reset CISD series extreme
            opposingSeriesCount = 0;
            ResetOrderBlock();
            ResetApproachSeries();
        }

        private void ResetState()
        {
            currentState = StrategyState.Idle;
            dailyBias = BiasDirection.None;
            biasType = BiasType.None;
            htfPOIs?.Clear();
            activePOI = null;
            protectedSwing = 0;
            cisdActive = false;
            cisdReferencePrice = 0;
            cisdSeriesExtreme = 0;  // V7: Reset CISD series extreme
            opposingSeriesCount = 0;
            ResetOrderBlock();
            consecutiveLosses = 0;
            partialExitTaken = false;
            breakevenSet = false;
            ResetApproachSeries();

            // V8: Reset confirm swings
            confirmSwingHigh1 = 0;
            confirmSwingHigh2 = 0;
            confirmSwingLow1 = 0;
            confirmSwingLow2 = 0;
        }

        #endregion
    }
}

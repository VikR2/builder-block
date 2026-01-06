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
    /// V22 SIMPLIFIED STRATEGY - More Trades, Less Filters
    ///
    /// REMOVED:
    /// - FVG POI detection (UseFvgPOI = false)
    /// - OB POI detection (UseOBPOI = false)
    /// - Complex invalidation threshold counting
    /// - Retrace wait before entry (ProtectedSwingRetracePercent = 0)
    ///
    /// KEPT:
    /// - Daily + H1 swing POI detection
    /// - Daily candle H/L POI detection
    /// - C1/C2 confirmation
    /// - Protected swing entry (CISD)
    ///
    /// SIMPLIFIED:
    /// - POI invalidation now uses simple daily reset + extreme break (50 ticks)
    /// - No counter-based invalidation thresholds
    ///
    /// GOAL: Increase from ~2 trades/month to ~5+ trades/month
    ///
    /// Generated from V21 with simplifications applied
    /// </summary>
    public class TTradesFractalModelV22 : Strategy
    {
        #region Enums

        public enum BiasDirection { None, Bullish, Bearish }

        public enum POIType { None, FVG, Swing, CandleHL, OrderBlock }

        public enum StrategyState
        {
            Idle,                   // Waiting for PDH/PDL
            WaitingForSweep,        // Have PDH/PDL, waiting for sweep
            BiasSet,                // Sweep happened, bias confirmed
            CountingConfirmation,   // Price at POI, counting C2/C3 closures
            H1Confirmed,            // C2/C3 confirmed, drop to M5
            WaitingForCISD,         // On M5 looking for CISD
            WaitingForRetrace,      // V21: After CisdConfirmed, waiting for price to retrace (DISABLED in V22)
            CisdConfirmed,          // M5 CISD confirmed, OB formed
            InTrade                 // Position open
        }

        #endregion

        #region Variables

        // State tracking
        private StrategyState currentState = StrategyState.Idle;
        private BiasDirection dailyBias = BiasDirection.None;

        // Previous day values (for bias)
        private double pdh, pdl;
        private DateTime currentSessionDate = DateTime.MinValue;
        private bool pdhSwept = false;
        private bool pdlSwept = false;

        // POI Type tracking
        private POIType h1PoiType = POIType.None;

        // Unified POI zone (can be FVG or Swing)
        private double h1PoiTop = 0;
        private double h1PoiBottom = 0;
        private bool h1PoiValid = false;

        // C2/C3 Confirmation tracking
        private int h1CandlesAtPOI = 0;
        private bool h1ConfirmationReceived = false;

        // H1 FVG Tracking (kept for backward compatibility)
        private double h1FvgTop = 0;
        private double h1FvgBottom = 0;
        private bool h1FvgValid = false;
        private int h1FvgFormationBar = -1;
        private BiasDirection h1FvgDirection = BiasDirection.None;

        // H1 Structure Tracking
        private bool h1StructureConfirmed = false;
        private double h1CISDLevel = 0;
        private double h1StructureZoneHigh = 0;
        private double h1StructureZoneLow = 0;
        private int h1OpposingSeriesCount = 0;
        private double h1OpposingSeriesExtreme = 0;

        // H1 Swing tracking
        private double h1SwingHigh1, h1SwingHigh2;
        private double h1SwingLow1, h1SwingLow2;
        private const int H1SwingLookback = 3;

        // M5 Entry Tracking
        private double m5OBHigh = 0;
        private double m5OBLow = 0;
        private double m5OBBodyHigh = 0;
        private double m5OBBodyLow = 0;
        private double m5OBEntry = 0;
        private int m5OBBarIndex = -1;
        private int m5OBFormationBar = -1;
        private bool m5OBValid = false;
        private int m5DowncloseSeriesCount = 0;
        private double m5DowncloseSeriesOpen = 0;

        // V21: Retrace tracking (DISABLED in V22 - kept for code compatibility)
        private double m5RetraceLevel = 0;

        // Trade management
        private double entryPrice;
        private double stopPrice;
        private double targetPrice;
        private bool breakevenSet = false;
        private double riskAmount = 0;

        // Partial profit tracking
        private bool partialTaken = false;
        private int initialQuantity = 0;
        private double riskPerContract = 0;

        // Circuit breaker
        private int consecutiveLosses = 0;

        // Data series indices
        private const int IDX_ENTRY = 0;        // Primary chart = Entry TF (e.g., M5)
        private const int IDX_CONFIRMATION = 1; // Confirmation TF (e.g., H1)
        private const int IDX_BIAS = 2;         // Bias TF (e.g., Daily)

        // V22: SIMPLIFIED - Removed complex invalidation counters
        // POI invalidation now happens on new daily bar or extreme price break

        // Debug counters (reset on new session)
        private int poiDetectedCount = 0;
        private int poiInvalidatedCount = 0;
        private int h1ConfirmationCount = 0;
        private int cisdConfirmationCount = 0;
        private int entrySkippedStopWide = 0;
        private int entrySkippedStopTight = 0;
        private int entryTakenCount = 0;

        #endregion

        #region Properties

        // Configurable Timeframes
        [NinjaScriptProperty]
        [Display(Name = "Bias TF Type", Description = "Timeframe type for bias + POI detection", Order = 1, GroupName = "0. Timeframes")]
        public BarsPeriodType BiasTFType { get; set; }

        [NinjaScriptProperty]
        [Range(1, 1440)]
        [Display(Name = "Bias TF Period", Description = "Period for bias TF (1 for Daily)", Order = 2, GroupName = "0. Timeframes")]
        public int BiasTFPeriod { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Confirmation TF Type", Description = "Timeframe type for C2/C3 confirmation", Order = 3, GroupName = "0. Timeframes")]
        public BarsPeriodType ConfirmationTFType { get; set; }

        [NinjaScriptProperty]
        [Range(1, 1440)]
        [Display(Name = "Confirmation TF Period", Description = "Period for confirmation TF (60 for H1)", Order = 4, GroupName = "0. Timeframes")]
        public int ConfirmationTFPeriod { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Entry TF Type", Description = "Timeframe type for CISD entry", Order = 5, GroupName = "0. Timeframes")]
        public BarsPeriodType EntryTFType { get; set; }

        [NinjaScriptProperty]
        [Range(1, 1440)]
        [Display(Name = "Entry TF Period", Description = "Period for entry TF (5 for M5)", Order = 6, GroupName = "0. Timeframes")]
        public int EntryTFPeriod { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Min Risk/Reward", Order = 1, GroupName = "1. Risk Management")]
        public double MinRiskReward { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Max Stop Ticks", Description = "Maximum stop loss in ticks on M5", Order = 2, GroupName = "1. Risk Management")]
        public int MaxStopTicks { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Stop Buffer Ticks", Description = "Buffer below/above OB BODY for stop placement", Order = 3, GroupName = "1. Risk Management")]
        public int StopBufferTicks { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Max Consecutive Losses", Order = 4, GroupName = "1. Risk Management")]
        public int MaxConsecutiveLosses { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Breakeven", Description = "Move stop to breakeven at 1R", Order = 5, GroupName = "1. Risk Management")]
        public bool EnableBreakeven { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Partial Profits", Description = "Take partial profits at 1R", Order = 6, GroupName = "1. Risk Management")]
        public bool EnablePartialProfits { get; set; }

        [NinjaScriptProperty]
        [Range(10, 90)]
        [Display(Name = "Partial Exit Percent", Description = "Percentage of position to exit at partial (default 50)", Order = 7, GroupName = "1. Risk Management")]
        public int PartialExitPercent { get; set; }

        [NinjaScriptProperty]
        [Range(0.5, 3.0)]
        [Display(Name = "Partial Exit R:R", Description = "Risk multiple to trigger partial exit (default 1.0)", Order = 8, GroupName = "1. Risk Management")]
        public double PartialExitRR { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "CISD Min Candles", Description = "Minimum opposing candles for CISD", Order = 1, GroupName = "2. Structure")]
        public int CISDMinCandles { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "CISD Max Candles", Description = "Maximum opposing candles for CISD", Order = 2, GroupName = "2. Structure")]
        public int CISDMaxCandles { get; set; }

        [NinjaScriptProperty]
        [Range(1, 5)]
        [Display(Name = "Min Confirmation Candles", Description = "C2=2, C3=3 H1 candles closing at POI", Order = 9, GroupName = "2. Structure")]
        public int MinConfirmationCandles { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Use Swing POI", Description = "Use swing highs/lows as POI zones", Order = 10, GroupName = "2. Structure")]
        public bool UseSwingPOI { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Use FVG POI", Description = "Use Fair Value Gaps as POI zones", Order = 11, GroupName = "2. Structure")]
        public bool UseFvgPOI { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Use Candle H/L POI", Description = "Use prior candle high/low as POI zones", Order = 12, GroupName = "2. Structure")]
        public bool UseCandlePOI { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Use Order Block POI", Description = "Use order blocks as POI zones", Order = 13, GroupName = "2. Structure")]
        public bool UseOBPOI { get; set; }

        [NinjaScriptProperty]
        [Range(20, 200)]
        [Display(Name = "Max POI Distance (ticks)", Description = "Invalidate POI if current price is more than X ticks away", Order = 14, GroupName = "2. Structure")]
        public int MaxPOIDistanceTicks { get; set; }

        [NinjaScriptProperty]
        [Range(5, 100)]
        [Display(Name = "POI Lookback Bars", Description = "Number of bars to search for POI on Bias TF (default 50)", Order = 15, GroupName = "2. Structure")]
        public int POILookbackBars { get; set; }

        [NinjaScriptProperty]
        [Range(0.10, 0.50)]
        [Display(Name = "Zone Size Percent", Description = "POI zone size as % of Daily candle range (default 0.25)", Order = 16, GroupName = "2. Structure")]
        public double ZoneSizePercent { get; set; }

        [NinjaScriptProperty]
        [Range(1.0, 3.0)]
        [Display(Name = "Reaction Zone Multiplier", Description = "H1 reaction zone = POI zone * this multiplier (default 1.5)", Order = 17, GroupName = "2. Structure")]
        public double ReactionZoneMultiplier { get; set; }

        [NinjaScriptProperty]
        [Range(0.25, 1.0)]
        [Display(Name = "Invalidation Buffer Percent", Description = "Invalidation buffer as % of POI zone size (default 0.5)", Order = 18, GroupName = "2. Structure")]
        public double InvalidationBufferPercent { get; set; }

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "Max Downclose Series", Description = "Maximum consecutive downclose candles for protected swing (default 5)", Order = 19, GroupName = "2. Structure")]
        public int MaxDowncloseSeriesCount { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable NY Session", Order = 1, GroupName = "3. Session Filter")]
        public bool EnableNYSession { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "NY Start Hour", Order = 2, GroupName = "3. Session Filter")]
        public int NYStartHour { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "NY End Hour", Order = 3, GroupName = "3. Session Filter")]
        public int NYEndHour { get; set; }

        // V22: ProtectedSwingRetracePercent kept for compatibility but defaults to 0
        [NinjaScriptProperty]
        [Range(0, 100)]
        [Display(Name = "Protected Swing Retrace %", Description = "V22: Set to 0 for immediate entry (was 25 in V21)", Order = 26, GroupName = "4. Entry")]
        public int ProtectedSwingRetracePercent { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Debug Mode", Order = 99, GroupName = "5. Debug")]
        public bool DebugMode { get; set; }

        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "TTrades Fractal Model V22 - Simplified: Swing/CandleHL POI only, immediate entry, daily reset";
                Name = "TTradesFractalModelV22";
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

                // Configurable Timeframe Defaults
                BiasTFType = BarsPeriodType.Day;
                BiasTFPeriod = 1;              // Daily
                ConfirmationTFType = BarsPeriodType.Minute;
                ConfirmationTFPeriod = 60;     // H1
                EntryTFType = BarsPeriodType.Minute;
                EntryTFPeriod = 5;             // M5

                // Defaults
                MinRiskReward = 2.0;
                MaxStopTicks = 20;
                StopBufferTicks = 3;
                MaxConsecutiveLosses = 3;
                EnableBreakeven = true;

                // Partial profit defaults
                EnablePartialProfits = true;
                PartialExitPercent = 50;
                PartialExitRR = 1.0;

                CISDMinCandles = 2;
                CISDMaxCandles = 5;

                // V22: SIMPLIFIED POI type defaults
                MinConfirmationCandles = 2;  // C2 = 2 candles at POI
                UseSwingPOI = true;          // Keep - simple and effective
                UseFvgPOI = false;           // V22: DISABLED - too restrictive
                UseCandlePOI = true;         // Keep - always available fallback
                UseOBPOI = false;            // V22: DISABLED - too restrictive
                MaxPOIDistanceTicks = 80;
                POILookbackBars = 50;

                // Zone sizing parameters
                ZoneSizePercent = 0.25;
                ReactionZoneMultiplier = 1.5;
                InvalidationBufferPercent = 0.5;

                // Protected swings series length
                MaxDowncloseSeriesCount = 5;

                // V22: IMMEDIATE ENTRY - no retrace wait
                ProtectedSwingRetracePercent = 0;  // V22: Was 25 in V21 - now 0 for immediate entry

                EnableNYSession = true;
                NYStartHour = 9;
                NYEndHour = 16;
                DebugMode = true;
            }
            else if (State == State.Configure)
            {
                AddDataSeries(ConfirmationTFType, ConfirmationTFPeriod);  // e.g., H1
                AddDataSeries(BiasTFType, BiasTFPeriod);                  // e.g., Daily

                if (DebugMode)
                {
                    Print($"[V22 INIT] *** SIMPLIFIED VERSION - MORE TRADES ***");
                    Print($"[V22 INIT] Entry TF: {EntryTFType} {EntryTFPeriod}");
                    Print($"[V22 INIT] Confirmation TF: {ConfirmationTFType} {ConfirmationTFPeriod}");
                    Print($"[V22 INIT] Bias TF: {BiasTFType} {BiasTFPeriod}");
                    Print($"[V22 INIT] POI Types: FVG={UseFvgPOI}, Swing={UseSwingPOI}, Candle={UseCandlePOI}, OB={UseOBPOI}");
                    Print($"[V22 INIT] C{MinConfirmationCandles} confirmation, MaxStop={MaxStopTicks}, MinRR={MinRiskReward}");
                    Print($"[V22 INIT] Protected Swing Retrace: {ProtectedSwingRetracePercent}% (0 = immediate entry)");
                    Print($"[V22 INIT] POI Invalidation: Daily reset + 50 tick extreme break");
                }
            }
            else if (State == State.DataLoaded)
            {
                ResetDailyState();
            }
        }

        protected override void OnBarUpdate()
        {
            // Safety checks for all 3 timeframes
            if (CurrentBars[IDX_ENTRY] < 20) return;
            if (CurrentBars[IDX_CONFIRMATION] < 20) return;
            if (CurrentBars[IDX_BIAS] < 5) return;

            // Session management on M5
            if (BarsInProgress == IDX_ENTRY)
            {
                CheckSessionReset();

                // V22 SIMPLIFIED: Check POI invalidation on every M5 bar
                if (h1PoiValid)
                {
                    CheckPOIInvalidation();
                }

                // V22: WaitingForRetrace state essentially disabled since ProtectedSwingRetracePercent=0
                if (currentState == StrategyState.WaitingForRetrace)
                {
                    CheckRetraceForEntry();
                }

                ProcessM5Bar();
            }

            // POI analysis on BIAS TF
            if (BarsInProgress == IDX_BIAS)
            {
                // V22: Check for POI on BIAS TF after bias is set (and no valid POI exists)
                if (dailyBias != BiasDirection.None && !h1PoiValid)
                {
                    DetectBiasTFPOI();
                }
            }

            // Confirmation TF: C2/C3 confirmation at POIs
            if (BarsInProgress == IDX_CONFIRMATION)
            {
                UpdateH1Swings();

                // Also check for POI on H1 bars (not just Daily)
                if (dailyBias != BiasDirection.None && !h1PoiValid)
                {
                    DetectBiasTFPOI();
                    if (DebugMode && h1PoiValid)
                    {
                        Print($"[V22 H1] POI detected on H1 bar update");
                    }
                }

                // Process C2/C3 confirmation when in CountingConfirmation state
                if (currentState == StrategyState.CountingConfirmation)
                {
                    ProcessH1Confirmation();
                }

                // Check for H1 CISD if POI is found and structure not yet confirmed
                if (h1PoiValid && !h1StructureConfirmed)
                {
                    CheckH1CISD();
                }
            }
        }

        #region Session Management

        private void CheckSessionReset()
        {
            DateTime today = Times[IDX_ENTRY][0].Date;
            if (today != currentSessionDate)
            {
                currentSessionDate = today;

                // Calculate PDH/PDL from prior session
                UpdatePDHPDL();

                // V22: Reset POI on new daily bar for fresh detection
                if (h1PoiValid && DebugMode)
                {
                    Print($"[V22 DAILY] New day - POI reset for fresh detection");
                }
                InvalidatePOI();  // V22: Always reset POI on new day

                // Reset daily state
                ResetDailyStatePreservePOI();

                if (DebugMode)
                {
                    Print($"[SESSION] New day {today:MM/dd} | PDH={pdh:F2} PDL={pdl:F2}");
                }
            }

            // Check for PDH/PDL sweep on every M5 bar
            CheckForSweep();
        }

        private void UpdatePDHPDL()
        {
            // Calculate previous day's high/low from H1 bars
            double dayHigh = 0;
            double dayLow = double.MaxValue;

            DateTime prevDay = Times[IDX_CONFIRMATION][0].Date.AddDays(-1);

            for (int i = 0; i < Math.Min(30, CurrentBars[IDX_CONFIRMATION]); i++)
            {
                if (Times[IDX_CONFIRMATION][i].Date == prevDay)
                {
                    dayHigh = Math.Max(dayHigh, Highs[IDX_CONFIRMATION][i]);
                    dayLow = Math.Min(dayLow, Lows[IDX_CONFIRMATION][i]);
                }
            }

            if (dayHigh > 0 && dayLow < double.MaxValue)
            {
                pdh = dayHigh;
                pdl = dayLow;
                currentState = StrategyState.WaitingForSweep;
            }
        }

        private void CheckForSweep()
        {
            if (pdh == 0 || pdl == 0) return;
            if (dailyBias != BiasDirection.None) return;  // Already have bias

            double high = Highs[IDX_ENTRY][0];
            double low = Lows[IDX_ENTRY][0];
            double close = Closes[IDX_ENTRY][0];

            // PDL Sweep = Bullish Setup
            if (low < pdl)
            {
                pdlSwept = true;
                if (DebugMode)
                    Print($"[SWEEP] PDL swept at {low:F2} (PDL={pdl:F2})");
            }

            if (pdlSwept && close > pdl)
            {
                dailyBias = BiasDirection.Bullish;
                currentState = StrategyState.BiasSet;

                // Check if existing POI is too far from current price
                if (h1PoiValid && h1FvgDirection == BiasDirection.Bullish)
                {
                    double poiDistance = Math.Abs(close - h1PoiTop) / TickSize;
                    if (poiDistance > MaxPOIDistanceTicks)
                    {
                        if (DebugMode)
                            Print($"[V22 POI] Existing POI too far ({poiDistance:F0} ticks > {MaxPOIDistanceTicks}) - invalidating to find closer POI");
                        InvalidatePOI();
                    }
                }

                if (DebugMode)
                {
                    Print($"[BIAS] *** BULLISH *** PDL swept and reclaimed. Close={close:F2} > PDL={pdl:F2}");
                    if (h1PoiValid && h1FvgDirection == BiasDirection.Bullish)
                    {
                        Print($"[BIAS] V22: Existing bullish POI available: {h1PoiBottom:F2} - {h1PoiTop:F2}");
                        currentState = StrategyState.CountingConfirmation;
                        h1CandlesAtPOI = 0;
                    }
                    else
                    {
                        Print($"[BIAS] Now waiting for H1 POI (Swing or CandleHL) to form...");
                    }
                }
            }

            // PDH Sweep = Bearish Setup
            if (high > pdh)
            {
                pdhSwept = true;
                if (DebugMode)
                    Print($"[SWEEP] PDH swept at {high:F2} (PDH={pdh:F2})");
            }

            if (pdhSwept && close < pdh)
            {
                dailyBias = BiasDirection.Bearish;
                currentState = StrategyState.BiasSet;

                // Check if existing POI is too far from current price
                if (h1PoiValid && h1FvgDirection == BiasDirection.Bearish)
                {
                    double poiDistance = Math.Abs(close - h1PoiBottom) / TickSize;
                    if (poiDistance > MaxPOIDistanceTicks)
                    {
                        if (DebugMode)
                            Print($"[V22 POI] Existing POI too far ({poiDistance:F0} ticks > {MaxPOIDistanceTicks}) - invalidating to find closer POI");
                        InvalidatePOI();
                    }
                }

                if (DebugMode)
                {
                    Print($"[BIAS] *** BEARISH *** PDH swept and rejected. Close={close:F2} < PDH={pdh:F2}");
                    if (h1PoiValid && h1FvgDirection == BiasDirection.Bearish)
                    {
                        Print($"[BIAS] V22: Existing bearish POI available: {h1PoiBottom:F2} - {h1PoiTop:F2}");
                        currentState = StrategyState.CountingConfirmation;
                        h1CandlesAtPOI = 0;
                    }
                    else
                    {
                        Print($"[BIAS] Now waiting for H1 POI (Swing or CandleHL) to form...");
                    }
                }
            }
        }

        /// <summary>
        /// Reset daily state but PRESERVE the H1 POI
        /// Also prints previous session stats before resetting
        /// </summary>
        private void ResetDailyStatePreservePOI()
        {
            // Print previous session stats (only if any activity occurred)
            if (poiDetectedCount > 0 || entryTakenCount > 0)
            {
                Print($"[V22 STATS] === SESSION SUMMARY ===");
                Print($"[V22 STATS] POI: {poiDetectedCount} detected, {poiInvalidatedCount} invalidated ({(poiDetectedCount > 0 ? (100.0 * poiInvalidatedCount / poiDetectedCount) : 0):F0}% invalidation rate)");
                Print($"[V22 STATS] Confirmations: H1={h1ConfirmationCount}, CISD={cisdConfirmationCount}");
                Print($"[V22 STATS] Entries: {entryTakenCount} taken, {entrySkippedStopWide} skipped (stop wide), {entrySkippedStopTight} skipped (stop tight)");
            }

            // Reset debug counters for new session
            poiDetectedCount = 0;
            poiInvalidatedCount = 0;
            h1ConfirmationCount = 0;
            cisdConfirmationCount = 0;
            entrySkippedStopWide = 0;
            entrySkippedStopTight = 0;
            entryTakenCount = 0;

            dailyBias = BiasDirection.None;
            pdhSwept = false;
            pdlSwept = false;

            // V22: POI is ALWAYS reset on new day (see CheckSessionReset)

            // Reset confirmation counter for new day
            h1CandlesAtPOI = 0;
            h1ConfirmationReceived = false;

            // H1 structure reset (CISD needs to re-confirm each day)
            h1StructureConfirmed = false;
            h1OpposingSeriesCount = 0;
            h1OpposingSeriesExtreme = 0;
            h1StructureZoneHigh = 0;
            h1StructureZoneLow = 0;

            // M5 reset
            m5OBValid = false;
            m5OBFormationBar = -1;
            m5OBBodyHigh = 0;
            m5OBBodyLow = 0;
            m5DowncloseSeriesCount = 0;
            m5DowncloseSeriesOpen = 0;
            m5RetraceLevel = 0;
            breakevenSet = false;
            partialTaken = false;
            riskAmount = 0;
            riskPerContract = 0;
            initialQuantity = 0;

            // V22: POI is always reset on new day, so start in Idle
            currentState = StrategyState.Idle;

            if (consecutiveLosses > 0)
            {
                consecutiveLosses = 0;
                if (DebugMode)
                    Print($"[SESSION] Losses reset on new day");
            }
        }

        private void ResetDailyState()
        {
            // Reset debug counters
            poiDetectedCount = 0;
            poiInvalidatedCount = 0;
            h1ConfirmationCount = 0;
            cisdConfirmationCount = 0;
            entrySkippedStopWide = 0;
            entrySkippedStopTight = 0;
            entryTakenCount = 0;

            dailyBias = BiasDirection.None;
            pdhSwept = false;
            pdlSwept = false;

            // Reset POI variables
            h1PoiTop = 0;
            h1PoiBottom = 0;
            h1PoiValid = false;
            h1PoiType = POIType.None;
            h1CandlesAtPOI = 0;
            h1ConfirmationReceived = false;

            // H1 FVG reset
            h1FvgTop = 0;
            h1FvgBottom = 0;
            h1FvgValid = false;
            h1FvgFormationBar = -1;
            h1FvgDirection = BiasDirection.None;

            // H1 structure reset
            h1StructureConfirmed = false;
            h1OpposingSeriesCount = 0;
            h1OpposingSeriesExtreme = 0;
            h1StructureZoneHigh = 0;
            h1StructureZoneLow = 0;

            // M5 reset
            m5OBValid = false;
            m5OBFormationBar = -1;
            m5OBBodyHigh = 0;
            m5OBBodyLow = 0;
            m5DowncloseSeriesCount = 0;
            m5DowncloseSeriesOpen = 0;
            m5RetraceLevel = 0;
            breakevenSet = false;
            partialTaken = false;
            riskAmount = 0;
            riskPerContract = 0;
            initialQuantity = 0;
            currentState = StrategyState.Idle;

            if (consecutiveLosses > 0)
            {
                consecutiveLosses = 0;
                if (DebugMode)
                    Print($"[SESSION] Losses reset on new day");
            }
        }

        private bool IsWithinTradingSession()
        {
            int hour = Times[IDX_ENTRY][0].Hour;
            if (!EnableNYSession) return true;
            return hour >= NYStartHour && hour < NYEndHour;
        }

        #endregion

        #region V22: Simplified POI Detection

        /// <summary>
        /// V22: Detect POI on BIAS TF - ONLY Swing and Candle H/L (FVG and OB disabled)
        /// Priority: Swing > Candle H/L
        /// </summary>
        private void DetectBiasTFPOI()
        {
            if (h1PoiValid) return;  // Already have a valid POI

            // V22: FVG disabled by default (UseFvgPOI = false)
            if (UseFvgPOI && DetectBiasTFFVG())
            {
                h1PoiType = POIType.FVG;
                h1PoiTop = h1FvgTop;
                h1PoiBottom = h1FvgBottom;
                h1PoiValid = true;
                currentState = StrategyState.CountingConfirmation;
                h1CandlesAtPOI = 0;

                if (DebugMode)
                    Print($"[BIAS TF POI] Using FVG as POI: {h1PoiBottom:F2} - {h1PoiTop:F2} (now counting C2)");
                return;
            }

            // V22: OB disabled by default (UseOBPOI = false)
            if (UseOBPOI && DetectBiasTFOrderBlockPOI())
            {
                currentState = StrategyState.CountingConfirmation;
                h1CandlesAtPOI = 0;

                if (DebugMode)
                    Print($"[BIAS TF POI] Using Order Block as POI: {h1PoiBottom:F2} - {h1PoiTop:F2} (now counting C2)");
                return;
            }

            // V22: Swing POI - ENABLED (simple and effective)
            if (UseSwingPOI && DetectBiasTFSwingPOI())
            {
                currentState = StrategyState.CountingConfirmation;
                h1CandlesAtPOI = 0;

                if (DebugMode)
                    Print($"[BIAS TF POI] Using Swing as POI: {h1PoiBottom:F2} - {h1PoiTop:F2} (now counting C2)");
                return;
            }

            // V22: Candle H/L - ENABLED (fallback that always triggers)
            if (UseCandlePOI && DetectBiasTFCandlePOI())
            {
                currentState = StrategyState.CountingConfirmation;
                h1CandlesAtPOI = 0;

                if (DebugMode)
                    Print($"[BIAS TF POI] Using Candle H/L as POI: {h1PoiBottom:F2} - {h1PoiTop:F2} (now counting C2)");
                return;
            }
        }

        /// <summary>
        /// Detect Swing points on BIAS TF with POILookbackBars lookback
        /// </summary>
        private bool DetectBiasTFSwingPOI()
        {
            int maxLookback = Math.Min(POILookbackBars, CurrentBars[IDX_BIAS] - 2);
            if (maxLookback < 3) return false;

            double currentPrice = Closes[IDX_BIAS][0];

            // Calculate zone size based on Daily candle range
            double dailyRange = Highs[IDX_BIAS][0] - Lows[IDX_BIAS][0];
            double zoneBuffer = Math.Max(20 * TickSize, dailyRange * ZoneSizePercent);

            if (dailyBias == BiasDirection.Bullish)
            {
                // Search for swing LOW within lookback bars
                for (int i = 1; i < maxLookback - 1; i++)
                {
                    // Swing low = bar where Low[i] < Low[i-1] AND Low[i] < Low[i+1]
                    if (Lows[IDX_BIAS][i] < Lows[IDX_BIAS][i - 1] &&
                        Lows[IDX_BIAS][i] < Lows[IDX_BIAS][i + 1])
                    {
                        double swingLow = Lows[IDX_BIAS][i];
                        double distanceTicks = Math.Abs(currentPrice - swingLow) / TickSize;
                        if (distanceTicks > MaxPOIDistanceTicks) continue;

                        h1PoiBottom = swingLow - (zoneBuffer * 0.2);
                        h1PoiTop = swingLow + zoneBuffer;
                        h1PoiType = POIType.Swing;
                        h1PoiValid = true;
                        h1FvgDirection = BiasDirection.Bullish;
                        poiDetectedCount++;

                        if (DebugMode)
                        {
                            double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                            Print($"[V22 SWING POI] Bullish swing low (lookback={i}): {swingLow:F2}");
                            Print($"[V22 SWING POI] Zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks)");
                        }

                        return true;
                    }
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // Search for swing HIGH within lookback bars
                for (int i = 1; i < maxLookback - 1; i++)
                {
                    if (Highs[IDX_BIAS][i] > Highs[IDX_BIAS][i - 1] &&
                        Highs[IDX_BIAS][i] > Highs[IDX_BIAS][i + 1])
                    {
                        double swingHigh = Highs[IDX_BIAS][i];
                        double distanceTicks = Math.Abs(currentPrice - swingHigh) / TickSize;
                        if (distanceTicks > MaxPOIDistanceTicks) continue;

                        h1PoiTop = swingHigh + (zoneBuffer * 0.2);
                        h1PoiBottom = swingHigh - zoneBuffer;
                        h1PoiType = POIType.Swing;
                        h1PoiValid = true;
                        h1FvgDirection = BiasDirection.Bearish;
                        poiDetectedCount++;

                        if (DebugMode)
                        {
                            double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                            Print($"[V22 SWING POI] Bearish swing high (lookback={i}): {swingHigh:F2}");
                            Print($"[V22 SWING POI] Zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks)");
                        }

                        return true;
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// Detect prior candle high/low on BIAS TF as POI zone
        /// </summary>
        private bool DetectBiasTFCandlePOI()
        {
            if (CurrentBars[IDX_BIAS] < 2) return false;

            double candleRange = Highs[IDX_BIAS][1] - Lows[IDX_BIAS][1];
            double zoneBuffer = Math.Max(20 * TickSize, candleRange * ZoneSizePercent);

            if (dailyBias == BiasDirection.Bullish)
            {
                double candleLow = Lows[IDX_BIAS][1];

                h1PoiBottom = candleLow - (zoneBuffer * 0.2);
                h1PoiTop = candleLow + zoneBuffer;
                h1PoiType = POIType.CandleHL;
                h1PoiValid = true;
                h1FvgDirection = BiasDirection.Bullish;
                poiDetectedCount++;

                if (DebugMode)
                {
                    double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                    Print($"[V22 CANDLE POI] Bullish zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks)");
                }

                return true;
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                double candleHigh = Highs[IDX_BIAS][1];

                h1PoiTop = candleHigh + (zoneBuffer * 0.2);
                h1PoiBottom = candleHigh - zoneBuffer;
                h1PoiType = POIType.CandleHL;
                h1PoiValid = true;
                h1FvgDirection = BiasDirection.Bearish;
                poiDetectedCount++;

                if (DebugMode)
                {
                    double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                    Print($"[V22 CANDLE POI] Bearish zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks)");
                }

                return true;
            }

            return false;
        }

        /// <summary>
        /// V22: FVG detection - kept for compatibility but DISABLED by default
        /// </summary>
        private bool DetectBiasTFFVG()
        {
            // V22: Early return - FVG detection disabled by default
            if (!UseFvgPOI) return false;

            int maxLookback = Math.Min(POILookbackBars, CurrentBars[IDX_BIAS] - 2);
            if (maxLookback < 1) return false;

            double currentPrice = Closes[IDX_BIAS][0];

            if (dailyBias == BiasDirection.Bullish)
            {
                for (int i = 0; i < maxLookback; i++)
                {
                    double gapLow = Lows[IDX_BIAS][i];
                    double gapHigh = Highs[IDX_BIAS][i + 2];

                    if (gapLow > gapHigh)
                    {
                        double middleLow = Lows[IDX_BIAS][i + 1];
                        if (middleLow < gapHigh) continue;

                        double fvgCenter = (gapLow + gapHigh) / 2;
                        double distanceTicks = Math.Abs(currentPrice - fvgCenter) / TickSize;
                        if (distanceTicks > MaxPOIDistanceTicks) continue;

                        h1FvgBottom = gapHigh;
                        h1FvgTop = gapLow;
                        h1FvgValid = true;
                        h1FvgFormationBar = CurrentBars[IDX_BIAS] - i;
                        h1FvgDirection = BiasDirection.Bullish;
                        poiDetectedCount++;

                        if (DebugMode)
                            Print($"[V22 FVG] Bullish FVG: {h1FvgBottom:F2} - {h1FvgTop:F2}");

                        return true;
                    }
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                for (int i = 0; i < maxLookback; i++)
                {
                    double gapHigh = Highs[IDX_BIAS][i];
                    double gapLow = Lows[IDX_BIAS][i + 2];

                    if (gapHigh < gapLow)
                    {
                        double middleHigh = Highs[IDX_BIAS][i + 1];
                        if (middleHigh > gapLow) continue;

                        double fvgCenter = (gapHigh + gapLow) / 2;
                        double distanceTicks = Math.Abs(currentPrice - fvgCenter) / TickSize;
                        if (distanceTicks > MaxPOIDistanceTicks) continue;

                        h1FvgTop = gapLow;
                        h1FvgBottom = gapHigh;
                        h1FvgValid = true;
                        h1FvgFormationBar = CurrentBars[IDX_BIAS] - i;
                        h1FvgDirection = BiasDirection.Bearish;
                        poiDetectedCount++;

                        if (DebugMode)
                            Print($"[V22 FVG] Bearish FVG: {h1FvgBottom:F2} - {h1FvgTop:F2}");

                        return true;
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// V22: Order Block detection - kept for compatibility but DISABLED by default
        /// </summary>
        private bool DetectBiasTFOrderBlockPOI()
        {
            // V22: Early return - OB detection disabled by default
            if (!UseOBPOI) return false;

            if (CurrentBars[IDX_BIAS] < 3) return false;

            double dailyRange = Highs[IDX_BIAS][0] - Lows[IDX_BIAS][0];
            double zoneBuffer = Math.Max(20 * TickSize, dailyRange * ZoneSizePercent);

            if (dailyBias == BiasDirection.Bullish)
            {
                bool priorBearish = Closes[IDX_BIAS][1] < Opens[IDX_BIAS][1];
                bool currentBullish = Closes[IDX_BIAS][0] > Opens[IDX_BIAS][0];
                double displacement = Closes[IDX_BIAS][0] - Opens[IDX_BIAS][0];
                double priorRange = Highs[IDX_BIAS][1] - Lows[IDX_BIAS][1];

                if (priorBearish && currentBullish && displacement > priorRange * 1.5)
                {
                    double bodyTop = Math.Max(Opens[IDX_BIAS][1], Closes[IDX_BIAS][1]);
                    double bodyBottom = Math.Min(Opens[IDX_BIAS][1], Closes[IDX_BIAS][1]);
                    h1PoiTop = bodyTop + (zoneBuffer * 0.2);
                    h1PoiBottom = bodyBottom - (zoneBuffer * 0.2);
                    h1PoiType = POIType.OrderBlock;
                    h1PoiValid = true;
                    h1FvgDirection = BiasDirection.Bullish;
                    poiDetectedCount++;

                    if (DebugMode)
                        Print($"[V22 OB POI] Bullish OB: {h1PoiBottom:F2} - {h1PoiTop:F2}");

                    return true;
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                bool priorBullish = Closes[IDX_BIAS][1] > Opens[IDX_BIAS][1];
                bool currentBearish = Closes[IDX_BIAS][0] < Opens[IDX_BIAS][0];
                double displacement = Opens[IDX_BIAS][0] - Closes[IDX_BIAS][0];
                double priorRange = Highs[IDX_BIAS][1] - Lows[IDX_BIAS][1];

                if (priorBullish && currentBearish && displacement > priorRange * 1.5)
                {
                    double bodyTop = Math.Max(Opens[IDX_BIAS][1], Closes[IDX_BIAS][1]);
                    double bodyBottom = Math.Min(Opens[IDX_BIAS][1], Closes[IDX_BIAS][1]);
                    h1PoiTop = bodyTop + (zoneBuffer * 0.2);
                    h1PoiBottom = bodyBottom - (zoneBuffer * 0.2);
                    h1PoiType = POIType.OrderBlock;
                    h1PoiValid = true;
                    h1FvgDirection = BiasDirection.Bearish;
                    poiDetectedCount++;

                    if (DebugMode)
                        Print($"[V22 OB POI] Bearish OB: {h1PoiBottom:F2} - {h1PoiTop:F2}");

                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Process H1 confirmation - count candles that TOUCH POI zone
        /// </summary>
        private void ProcessH1Confirmation()
        {
            if (currentState != StrategyState.CountingConfirmation) return;
            if (BarsInProgress != IDX_CONFIRMATION) return;

            double high = Highs[IDX_CONFIRMATION][0];
            double low = Lows[IDX_CONFIRMATION][0];

            // Expand POI zone to reaction zone
            double zoneSize = h1PoiTop - h1PoiBottom;
            double reactionBuffer = zoneSize * (ReactionZoneMultiplier - 1.0);
            double reactionTop = h1PoiTop + reactionBuffer;
            double reactionBottom = h1PoiBottom - reactionBuffer;

            // Candle touches reaction zone if its range overlaps (wick or body)
            bool inReactionZone = (low <= reactionTop && high >= reactionBottom);

            if (inReactionZone)
            {
                h1CandlesAtPOI++;
                if (DebugMode)
                {
                    Print($"[V22 H1 CONFIRM] C{h1CandlesAtPOI} in REACTION ZONE");
                    Print($"[V22 H1 CONFIRM] Candle: H={high:F2} L={low:F2}");
                    Print($"[V22 H1 CONFIRM] POI zone: {h1PoiBottom:F2}-{h1PoiTop:F2}, Reaction zone: {reactionBottom:F2}-{reactionTop:F2}");
                }

                if (h1CandlesAtPOI >= MinConfirmationCandles)
                {
                    h1ConfirmationReceived = true;
                    currentState = StrategyState.H1Confirmed;
                    h1ConfirmationCount++;

                    if (DebugMode)
                    {
                        Print($"[V22 H1 CONFIRM] *** C{h1CandlesAtPOI} CONFIRMED *** - dropping to M5 for CISD entry");
                    }
                }
            }
            else if (DebugMode && h1CandlesAtPOI > 0)
            {
                Print($"[V22 H1 CONFIRM] Candle outside reaction zone (H={high:F2} L={low:F2}) - count stays at {h1CandlesAtPOI}");
            }
        }

        #endregion

        #region V22 Simplified POI Invalidation

        /// <summary>
        /// V22 SIMPLIFIED: POI invalidation only happens on new daily bar OR extreme price break
        /// The complex threshold counting is removed
        /// </summary>
        private void CheckPOIInvalidation()
        {
            // V22 SIMPLIFIED: POI invalidation only happens on new daily bar
            // The complex threshold counting is removed
            // POI stays valid within the day unless price action dictates otherwise

            if (!h1PoiValid) return;

            // V22: Only invalidate if price closes significantly beyond POI (e.g., 50+ ticks)
            // This is a much simpler check than the V20/V21 counter approach
            double close = Closes[IDX_ENTRY][0];
            double extremeBuffer = 50 * TickSize;  // Simple fixed buffer

            if (h1FvgDirection == BiasDirection.Bullish && close < h1PoiBottom - extremeBuffer)
            {
                if (DebugMode) Print($"[V22 POI] Extreme break below POI ({close:F2} < {h1PoiBottom - extremeBuffer:F2}) - invalidating");
                poiInvalidatedCount++;
                InvalidatePOI();
            }
            else if (h1FvgDirection == BiasDirection.Bearish && close > h1PoiTop + extremeBuffer)
            {
                if (DebugMode) Print($"[V22 POI] Extreme break above POI ({close:F2} > {h1PoiTop + extremeBuffer:F2}) - invalidating");
                poiInvalidatedCount++;
                InvalidatePOI();
            }
            // Otherwise POI stays valid - no counter-based invalidation
        }

        private void InvalidatePOI()
        {
            h1PoiValid = false;
            h1PoiTop = 0;
            h1PoiBottom = 0;
            h1PoiType = POIType.None;
            h1CandlesAtPOI = 0;
            h1ConfirmationReceived = false;

            // Also reset FVG tracking
            h1FvgValid = false;
            h1FvgTop = 0;
            h1FvgBottom = 0;
            h1FvgDirection = BiasDirection.None;
            h1FvgFormationBar = -1;

            // Reset state to look for new POI
            if (dailyBias != BiasDirection.None)
            {
                currentState = StrategyState.BiasSet;
            }
            else
            {
                currentState = StrategyState.WaitingForSweep;
            }
        }

        #endregion

        #region H1 Structure Processing

        private void UpdateH1Swings()
        {
            if (CurrentBars[IDX_CONFIRMATION] < H1SwingLookback * 2 + 1) return;

            double potentialSwingHigh = Highs[IDX_CONFIRMATION][H1SwingLookback];
            double potentialSwingLow = Lows[IDX_CONFIRMATION][H1SwingLookback];

            bool isSwingHigh = true;
            bool isSwingLow = true;

            for (int i = 0; i < H1SwingLookback * 2 + 1; i++)
            {
                if (i == H1SwingLookback) continue;

                if (Highs[IDX_CONFIRMATION][i] >= potentialSwingHigh)
                    isSwingHigh = false;

                if (Lows[IDX_CONFIRMATION][i] <= potentialSwingLow)
                    isSwingLow = false;
            }

            if (isSwingHigh && potentialSwingHigh != h1SwingHigh1)
            {
                h1SwingHigh2 = h1SwingHigh1;
                h1SwingHigh1 = potentialSwingHigh;

                if (DebugMode)
                    Print($"[H1 SWING] New high: {h1SwingHigh1:F2} (prev: {h1SwingHigh2:F2})");
            }

            if (isSwingLow && potentialSwingLow != h1SwingLow1)
            {
                h1SwingLow2 = h1SwingLow1;
                h1SwingLow1 = potentialSwingLow;

                if (DebugMode)
                    Print($"[H1 SWING] New low: {h1SwingLow1:F2} (prev: {h1SwingLow2:F2})");
            }
        }

        private void CheckH1CISD()
        {
            double open = Opens[IDX_CONFIRMATION][0];
            double close = Closes[IDX_CONFIRMATION][0];
            double high = Highs[IDX_CONFIRMATION][0];
            double low = Lows[IDX_CONFIRMATION][0];
            bool isBullish = close > open;
            bool isBearish = close < open;

            // Track opposing candles for CISD
            if (dailyBias == BiasDirection.Bullish && isBearish)
            {
                h1OpposingSeriesCount++;
                if (h1OpposingSeriesCount == 1)
                {
                    h1OpposingSeriesExtreme = low;
                }
                else
                {
                    h1OpposingSeriesExtreme = Math.Min(h1OpposingSeriesExtreme, low);
                }

                if (DebugMode && h1OpposingSeriesCount >= CISDMinCandles)
                    Print($"[H1] Opposing series: {h1OpposingSeriesCount}, extreme: {h1OpposingSeriesExtreme:F2}");
            }
            else if (dailyBias == BiasDirection.Bearish && isBullish)
            {
                h1OpposingSeriesCount++;
                if (h1OpposingSeriesCount == 1)
                {
                    h1OpposingSeriesExtreme = high;
                }
                else
                {
                    h1OpposingSeriesExtreme = Math.Max(h1OpposingSeriesExtreme, high);
                }

                if (DebugMode && h1OpposingSeriesCount >= CISDMinCandles)
                    Print($"[H1] Opposing series: {h1OpposingSeriesCount}, extreme: {h1OpposingSeriesExtreme:F2}");
            }
            else
            {
                // Check for CISD completion
                if (h1OpposingSeriesCount >= CISDMinCandles && h1OpposingSeriesCount <= CISDMaxCandles)
                {
                    bool cisdValid = false;

                    if (dailyBias == BiasDirection.Bullish && isBullish)
                    {
                        double seriesOpen = Opens[IDX_CONFIRMATION][h1OpposingSeriesCount];
                        if (close >= seriesOpen)
                        {
                            cisdValid = true;
                            h1CISDLevel = seriesOpen;
                            h1StructureZoneLow = h1OpposingSeriesExtreme;
                            h1StructureZoneHigh = seriesOpen;
                        }
                    }
                    else if (dailyBias == BiasDirection.Bearish && isBearish)
                    {
                        double seriesOpen = Opens[IDX_CONFIRMATION][h1OpposingSeriesCount];
                        if (close <= seriesOpen)
                        {
                            cisdValid = true;
                            h1CISDLevel = seriesOpen;
                            h1StructureZoneHigh = h1OpposingSeriesExtreme;
                            h1StructureZoneLow = seriesOpen;
                        }
                    }

                    if (cisdValid)
                    {
                        h1StructureConfirmed = true;

                        if (DebugMode)
                        {
                            Print($"[H1 CISD] *** CONFIRMED *** Bias={dailyBias}, Level={h1CISDLevel:F2}");
                            Print($"[H1 CISD] Zone preserved: {h1StructureZoneLow:F2} - {h1StructureZoneHigh:F2}");
                        }
                    }
                }

                h1OpposingSeriesCount = 0;
                h1OpposingSeriesExtreme = 0;
            }
        }

        #endregion

        #region M5 Entry Processing

        private void ProcessM5Bar()
        {
            // Manage existing position
            if (Position.MarketPosition != MarketPosition.Flat)
            {
                ManagePosition();
                return;
            }

            // Check circuit breaker
            if (consecutiveLosses >= MaxConsecutiveLosses)
            {
                if (DebugMode && Times[IDX_ENTRY][0].Minute == 0)
                    Print($"[M5] Circuit breaker active - {consecutiveLosses} consecutive losses");
                return;
            }

            // Only look for entries during trading session
            if (!IsWithinTradingSession())
                return;

            // Need H1 POI first (gate)
            if (!h1PoiValid)
            {
                return;
            }

            // Waiting for confirmation - handled on H1 bar updates
            if (currentState == StrategyState.CountingConfirmation)
            {
                return;
            }

            // After H1 confirmation, drop to M5 for CISD
            if (currentState == StrategyState.H1Confirmed)
            {
                currentState = StrategyState.WaitingForCISD;
                if (DebugMode)
                    Print($"[M5] H1 confirmed - now looking for M5 CISD...");
            }

            // Looking for M5 CISD after H1 confirmation
            if (currentState == StrategyState.WaitingForCISD)
            {
                if (!m5OBValid)
                {
                    CheckM5CISD();
                }
                else
                {
                    CheckM5Entry();
                }
            }

            // If we have a confirmed CISD and OB, look for entry
            if (currentState == StrategyState.CisdConfirmed && m5OBValid)
            {
                CheckM5Entry();
            }
        }

        /// <summary>
        /// Check M5 CISD with doji handling, >= threshold, and grace bar
        /// </summary>
        private void CheckM5CISD()
        {
            double open = Opens[IDX_ENTRY][0];
            double close = Closes[IDX_ENTRY][0];
            double high = Highs[IDX_ENTRY][0];
            double low = Lows[IDX_ENTRY][0];
            bool isBullish = close > open;
            bool isBearish = close < open;

            // Doji detection - within 1 tick = doji
            bool isDoji = Math.Abs(close - open) < TickSize;

            if (dailyBias == BiasDirection.Bullish)
            {
                // Track bearish OR doji (if series already started) M5 candles during pullback
                if (isBearish || (isDoji && m5DowncloseSeriesCount > 0))
                {
                    m5DowncloseSeriesCount++;
                    if (m5DowncloseSeriesCount == 1)
                    {
                        m5DowncloseSeriesOpen = open;
                    }

                    if (DebugMode && isDoji && m5DowncloseSeriesCount > 1)
                        Print($"[V22 CISD] Doji counted as continuation (series count now {m5DowncloseSeriesCount})");

                    // Grace bar - add +1 to allow CISD to confirm on max bar
                    if (m5DowncloseSeriesCount > MaxDowncloseSeriesCount + 1)
                    {
                        if (DebugMode)
                            Print($"[V22 CISD] Downclose series too long ({m5DowncloseSeriesCount} > {MaxDowncloseSeriesCount + 1}), resetting");
                        m5DowncloseSeriesCount = 0;
                        m5DowncloseSeriesOpen = 0;
                    }

                    if (DebugMode && m5DowncloseSeriesCount == 1)
                        Print($"[M5 CISD] Downclose series started - bearish candle");
                }
                else if (m5DowncloseSeriesCount >= 1 && isBullish)
                {
                    // CISD = close >= (not >) the first opposing candle's open
                    if (close >= m5DowncloseSeriesOpen)
                    {
                        m5OBBodyHigh = Math.Max(open, close);
                        m5OBBodyLow = Math.Min(open, close);

                        m5OBLow = low;
                        for (int i = 1; i <= m5DowncloseSeriesCount; i++)
                        {
                            m5OBLow = Math.Min(m5OBLow, Lows[IDX_ENTRY][i]);
                        }
                        m5OBHigh = high;

                        m5OBEntry = close;
                        m5OBBarIndex = CurrentBars[IDX_ENTRY];
                        m5OBFormationBar = CurrentBars[IDX_ENTRY];
                        m5OBValid = true;

                        cisdConfirmationCount++;

                        // V22: IMMEDIATE ENTRY (ProtectedSwingRetracePercent = 0)
                        if (ProtectedSwingRetracePercent > 0)
                        {
                            double structureRange = m5OBEntry - m5OBLow;
                            m5RetraceLevel = m5OBEntry - (structureRange * ProtectedSwingRetracePercent / 100.0);
                            currentState = StrategyState.WaitingForRetrace;
                            if (DebugMode)
                            {
                                Print($"[V22 CISD] *** CONFIRMED - OB FORMED ***");
                                Print($"[V22 CISD] Waiting for retrace to {m5RetraceLevel:F2}");
                            }
                        }
                        else
                        {
                            // V22: Go directly to CisdConfirmed (immediate entry)
                            currentState = StrategyState.CisdConfirmed;
                            if (DebugMode)
                            {
                                Print($"[V22 M5 CISD] *** CONFIRMED - OB FORMED ***");
                                Print($"[V22 M5 CISD] Close={close:F2} >= DowncloseOpen={m5DowncloseSeriesOpen:F2}");
                                Print($"[M5 OB] BODY: {m5OBBodyLow:F2} - {m5OBBodyHigh:F2}");
                                Print($"[M5 OB] V22: IMMEDIATE ENTRY (no retrace wait)");
                            }
                        }
                    }

                    m5DowncloseSeriesCount = 0;
                    m5DowncloseSeriesOpen = 0;
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // Track bullish OR doji (if series already started) M5 candles during rally
                if (isBullish || (isDoji && m5DowncloseSeriesCount > 0))
                {
                    m5DowncloseSeriesCount++;
                    if (m5DowncloseSeriesCount == 1)
                    {
                        m5DowncloseSeriesOpen = open;
                    }

                    if (DebugMode && isDoji && m5DowncloseSeriesCount > 1)
                        Print($"[V22 CISD] Doji counted as continuation (series count now {m5DowncloseSeriesCount})");

                    // Grace bar - add +1 to allow CISD to confirm on max bar
                    if (m5DowncloseSeriesCount > MaxDowncloseSeriesCount + 1)
                    {
                        if (DebugMode)
                            Print($"[V22 CISD] Upclose series too long ({m5DowncloseSeriesCount} > {MaxDowncloseSeriesCount + 1}), resetting");
                        m5DowncloseSeriesCount = 0;
                        m5DowncloseSeriesOpen = 0;
                    }

                    if (DebugMode && m5DowncloseSeriesCount == 1)
                        Print($"[M5 CISD] Upclose series started - bullish candle");
                }
                else if (m5DowncloseSeriesCount >= 1 && isBearish)
                {
                    // CISD = close <= (not <) the first opposing candle's open
                    if (close <= m5DowncloseSeriesOpen)
                    {
                        m5OBBodyHigh = Math.Max(open, close);
                        m5OBBodyLow = Math.Min(open, close);

                        m5OBHigh = high;
                        for (int i = 1; i <= m5DowncloseSeriesCount; i++)
                        {
                            m5OBHigh = Math.Max(m5OBHigh, Highs[IDX_ENTRY][i]);
                        }
                        m5OBLow = low;

                        m5OBEntry = close;
                        m5OBBarIndex = CurrentBars[IDX_ENTRY];
                        m5OBFormationBar = CurrentBars[IDX_ENTRY];
                        m5OBValid = true;

                        cisdConfirmationCount++;

                        // V22: IMMEDIATE ENTRY (ProtectedSwingRetracePercent = 0)
                        if (ProtectedSwingRetracePercent > 0)
                        {
                            double structureRange = m5OBHigh - m5OBEntry;
                            m5RetraceLevel = m5OBEntry + (structureRange * ProtectedSwingRetracePercent / 100.0);
                            currentState = StrategyState.WaitingForRetrace;
                            if (DebugMode)
                            {
                                Print($"[V22 CISD] *** CONFIRMED - OB FORMED ***");
                                Print($"[V22 CISD] Waiting for retrace to {m5RetraceLevel:F2}");
                            }
                        }
                        else
                        {
                            // V22: Go directly to CisdConfirmed (immediate entry)
                            currentState = StrategyState.CisdConfirmed;
                            if (DebugMode)
                            {
                                Print($"[V22 M5 CISD] *** CONFIRMED - OB FORMED ***");
                                Print($"[V22 M5 CISD] Close={close:F2} <= UpcloseOpen={m5DowncloseSeriesOpen:F2}");
                                Print($"[M5 OB] BODY: {m5OBBodyLow:F2} - {m5OBBodyHigh:F2}");
                                Print($"[M5 OB] V22: IMMEDIATE ENTRY (no retrace wait)");
                            }
                        }
                    }

                    m5DowncloseSeriesCount = 0;
                    m5DowncloseSeriesOpen = 0;
                }
            }
        }

        /// <summary>
        /// Check if price has retraced into CISD structure before allowing entry
        /// V22: This is essentially disabled since ProtectedSwingRetracePercent = 0
        /// </summary>
        private void CheckRetraceForEntry()
        {
            if (currentState != StrategyState.WaitingForRetrace) return;

            double low = Lows[IDX_ENTRY][0];
            double high = Highs[IDX_ENTRY][0];

            bool retraceHit = false;
            if (dailyBias == BiasDirection.Bullish && low <= m5RetraceLevel)
            {
                retraceHit = true;
            }
            else if (dailyBias == BiasDirection.Bearish && high >= m5RetraceLevel)
            {
                retraceHit = true;
            }

            if (retraceHit)
            {
                currentState = StrategyState.CisdConfirmed;
                if (DebugMode)
                {
                    Print($"[V22 RETRACE] Retrace level {m5RetraceLevel:F2} hit, proceeding to entry");
                }
            }

            // OB expiration check while waiting for retrace
            if (CurrentBars[IDX_ENTRY] - m5OBBarIndex > 24)
            {
                if (DebugMode)
                    Print($"[V22 RETRACE] OB expired while waiting for retrace");
                m5OBValid = false;
                m5OBFormationBar = -1;
                m5RetraceLevel = 0;
                currentState = StrategyState.WaitingForCISD;
            }
        }

        private void CheckM5Entry()
        {
            double close = Closes[IDX_ENTRY][0];
            double high = Highs[IDX_ENTRY][0];
            double low = Lows[IDX_ENTRY][0];

            if (dailyBias == BiasDirection.Bullish)
            {
                // Stop below CISD STRUCTURE low
                stopPrice = m5OBLow - (StopBufferTicks * TickSize);
                double stopTicks = (m5OBEntry - stopPrice) / TickSize;

                if (DebugMode)
                {
                    Print($"[V22 ENTRY] Stop calculation: CISD structure low={m5OBLow:F2} - buffer={StopBufferTicks} ticks = {stopPrice:F2}");
                    Print($"[V22 ENTRY] Risk: {stopTicks:F0} ticks");
                }

                if (stopTicks > MaxStopTicks)
                {
                    if (DebugMode)
                        Print($"[V22 ENTRY] SKIPPED - Stop too wide: {stopTicks:F0} ticks > {MaxStopTicks}");
                    entrySkippedStopWide++;
                    m5OBValid = false;
                    m5OBFormationBar = -1;
                    return;
                }

                if (stopTicks < 4)
                {
                    if (DebugMode)
                        Print($"[V22 ENTRY] SKIPPED - Stop too tight: {stopTicks:F0} ticks < 4");
                    entrySkippedStopTight++;
                    m5OBValid = false;
                    m5OBFormationBar = -1;
                    return;
                }

                double riskPoints = m5OBEntry - stopPrice;
                targetPrice = m5OBEntry + (riskPoints * MinRiskReward);

                // Consider PDH as target if closer
                if (pdh > m5OBEntry && pdh < targetPrice)
                {
                    targetPrice = pdh;
                }

                entryPrice = m5OBEntry;
                riskAmount = riskPoints;
                riskPerContract = riskPoints;
                entryTakenCount++;

                if (DebugMode)
                {
                    Print($"[V22 ENTRY] *** LONG V22 *** Bar {CurrentBars[IDX_ENTRY]}");
                    Print($"[V22 ENTRY] POI Type={h1PoiType}, Confirmation=C{h1CandlesAtPOI}");
                    Print($"[V22 ENTRY] Entry={entryPrice:F2} (OB close)");
                    Print($"[V22 ENTRY] Stop={stopPrice:F2}");
                    Print($"[V22 ENTRY] Target={targetPrice:F2}");
                    Print($"[V22 ENTRY] Risk={stopTicks:F0} ticks, R:R={(targetPrice - entryPrice) / riskPoints:F1}");
                }

                EnterLong("FractalLongV22");
                SetStopLoss("FractalLongV22", CalculationMode.Price, stopPrice, false);
                SetProfitTarget("FractalLongV22", CalculationMode.Price, targetPrice);

                currentState = StrategyState.InTrade;
                breakevenSet = false;
                partialTaken = false;
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // Stop above CISD STRUCTURE high
                stopPrice = m5OBHigh + (StopBufferTicks * TickSize);
                double stopTicks = (stopPrice - m5OBEntry) / TickSize;

                if (DebugMode)
                {
                    Print($"[V22 ENTRY] Stop calculation: CISD structure high={m5OBHigh:F2} + buffer={StopBufferTicks} ticks = {stopPrice:F2}");
                    Print($"[V22 ENTRY] Risk: {stopTicks:F0} ticks");
                }

                if (stopTicks > MaxStopTicks)
                {
                    if (DebugMode)
                        Print($"[V22 ENTRY] SKIPPED - Stop too wide: {stopTicks:F0} ticks > {MaxStopTicks}");
                    entrySkippedStopWide++;
                    m5OBValid = false;
                    m5OBFormationBar = -1;
                    return;
                }

                if (stopTicks < 4)
                {
                    if (DebugMode)
                        Print($"[V22 ENTRY] SKIPPED - Stop too tight: {stopTicks:F0} ticks < 4");
                    entrySkippedStopTight++;
                    m5OBValid = false;
                    m5OBFormationBar = -1;
                    return;
                }

                double riskPoints = stopPrice - m5OBEntry;
                targetPrice = m5OBEntry - (riskPoints * MinRiskReward);

                // Consider PDL as target if closer
                if (pdl < m5OBEntry && pdl > targetPrice)
                {
                    targetPrice = pdl;
                }

                entryPrice = m5OBEntry;
                riskAmount = riskPoints;
                riskPerContract = riskPoints;
                entryTakenCount++;

                if (DebugMode)
                {
                    Print($"[V22 ENTRY] *** SHORT V22 *** Bar {CurrentBars[IDX_ENTRY]}");
                    Print($"[V22 ENTRY] POI Type={h1PoiType}, Confirmation=C{h1CandlesAtPOI}");
                    Print($"[V22 ENTRY] Entry={entryPrice:F2} (OB close)");
                    Print($"[V22 ENTRY] Stop={stopPrice:F2}");
                    Print($"[V22 ENTRY] Target={targetPrice:F2}");
                    Print($"[V22 ENTRY] Risk={stopTicks:F0} ticks, R:R={(entryPrice - targetPrice) / riskPoints:F1}");
                }

                EnterShort("FractalShortV22");
                SetStopLoss("FractalShortV22", CalculationMode.Price, stopPrice, false);
                SetProfitTarget("FractalShortV22", CalculationMode.Price, targetPrice);

                currentState = StrategyState.InTrade;
                breakevenSet = false;
                partialTaken = false;
            }

            // Invalidate OB if too old
            if (CurrentBars[IDX_ENTRY] - m5OBBarIndex > 12)
            {
                if (DebugMode)
                    Print($"[M5 OB] Expired - no entry within 12 bars");
                m5OBValid = false;
                m5OBFormationBar = -1;
            }
        }

        #endregion

        #region Position Management

        private void ManagePosition()
        {
            if (Position.MarketPosition == MarketPosition.Flat) return;

            double currentPrice = Closes[IDX_ENTRY][0];

            // Check for partial profit first
            if (EnablePartialProfits && !partialTaken && riskPerContract > 0)
            {
                double currentPnL = 0;

                if (Position.MarketPosition == MarketPosition.Long)
                {
                    currentPnL = currentPrice - entryPrice;
                }
                else if (Position.MarketPosition == MarketPosition.Short)
                {
                    currentPnL = entryPrice - currentPrice;
                }

                // Check if we've reached the partial exit threshold
                if (currentPnL >= riskPerContract * PartialExitRR)
                {
                    int currentQty = Position.Quantity;
                    int exitQty = (int)Math.Max(1, Math.Floor(currentQty * PartialExitPercent / 100.0));

                    if (exitQty > 0 && exitQty < currentQty)
                    {
                        if (DebugMode)
                        {
                            Print($"[V22 PARTIAL] *** Taking partial profit at {PartialExitRR}R ***");
                            Print($"[V22 PARTIAL] Exiting {exitQty} of {currentQty} contracts ({PartialExitPercent}%)");
                        }

                        // Exit partial position
                        if (Position.MarketPosition == MarketPosition.Long)
                        {
                            ExitLong(exitQty, "Partial1R_V22", "FractalLongV22");
                        }
                        else
                        {
                            ExitShort(exitQty, "Partial1R_V22", "FractalShortV22");
                        }

                        // Move stop to breakeven on remaining position
                        double breakevenPrice = entryPrice;
                        if (Position.MarketPosition == MarketPosition.Long)
                        {
                            breakevenPrice = entryPrice + TickSize;
                            SetStopLoss("FractalLongV22", CalculationMode.Price, breakevenPrice, false);
                        }
                        else
                        {
                            breakevenPrice = entryPrice - TickSize;
                            SetStopLoss("FractalShortV22", CalculationMode.Price, breakevenPrice, false);
                        }

                        partialTaken = true;
                        breakevenSet = true;

                        if (DebugMode)
                        {
                            Print($"[V22 PARTIAL] Stop moved to breakeven: {breakevenPrice:F2}");
                        }
                    }
                    else if (exitQty >= currentQty)
                    {
                        // Position too small for partial - just move to breakeven
                        if (DebugMode)
                            Print($"[V22 PARTIAL] Position too small ({currentQty} contracts) - moving to breakeven only");

                        if (Position.MarketPosition == MarketPosition.Long)
                        {
                            SetStopLoss("FractalLongV22", CalculationMode.Price, entryPrice + TickSize, false);
                        }
                        else
                        {
                            SetStopLoss("FractalShortV22", CalculationMode.Price, entryPrice - TickSize, false);
                        }

                        partialTaken = true;
                        breakevenSet = true;
                    }
                }
            }

            // Original breakeven logic (fallback if partials disabled)
            if (EnableBreakeven && !breakevenSet && riskAmount > 0)
            {
                if (Position.MarketPosition == MarketPosition.Long)
                {
                    double profitPoints = currentPrice - entryPrice;
                    if (profitPoints >= riskAmount)
                    {
                        SetStopLoss("FractalLongV22", CalculationMode.Price, entryPrice + TickSize, false);
                        breakevenSet = true;

                        if (DebugMode)
                            Print($"[TRADE] Breakeven set at {entryPrice + TickSize:F2}");
                    }
                }
                else if (Position.MarketPosition == MarketPosition.Short)
                {
                    double profitPoints = entryPrice - currentPrice;
                    if (profitPoints >= riskAmount)
                    {
                        SetStopLoss("FractalShortV22", CalculationMode.Price, entryPrice - TickSize, false);
                        breakevenSet = true;

                        if (DebugMode)
                            Print($"[TRADE] Breakeven set at {entryPrice - TickSize:F2}");
                    }
                }
            }
        }

        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            // Track partial fill separately
            if (execution.Order.Name.Contains("Partial"))
            {
                if (DebugMode)
                    Print($"[V22 EXECUTION] Partial exit filled: {quantity} contracts at {price:F2}");
                return;
            }

            if (execution.Order.OrderState == OrderState.Filled && execution.Order.Name.Contains("Stop"))
            {
                // Check if this was a breakeven stop
                if (breakevenSet && partialTaken)
                {
                    if (DebugMode)
                        Print($"[V22 TRADE] Breakeven stop hit after partial - no loss on runner");
                }
                else
                {
                    consecutiveLosses++;
                    if (DebugMode)
                        Print($"[LOSS] Stop hit - consecutive losses: {consecutiveLosses}");
                }
            }
            else if (execution.Order.OrderState == OrderState.Filled && execution.Order.Name.Contains("Profit"))
            {
                consecutiveLosses = 0;
                if (DebugMode)
                    Print($"[WIN] Target hit - losses reset");
            }

            // Reset state after trade closes
            if (Position.MarketPosition == MarketPosition.Flat)
            {
                // Preserve H1 POI, reset M5 OB to allow new setup
                m5OBValid = false;
                m5OBFormationBar = -1;
                m5OBBodyHigh = 0;
                m5OBBodyLow = 0;
                m5DowncloseSeriesCount = 0;
                m5DowncloseSeriesOpen = 0;
                m5RetraceLevel = 0;
                breakevenSet = false;
                partialTaken = false;
                riskAmount = 0;
                riskPerContract = 0;
                initialQuantity = 0;

                // Reset confirmation for next trade
                h1CandlesAtPOI = 0;
                h1ConfirmationReceived = false;

                if (h1PoiValid)
                {
                    // Go back to counting H1 candles at POI for next trade
                    currentState = StrategyState.CountingConfirmation;
                    if (DebugMode)
                        Print($"[TRADE CLOSED] Back to CountingConfirmation - looking for new C2 at POI...");
                }
            }
        }

        #endregion
    }
}

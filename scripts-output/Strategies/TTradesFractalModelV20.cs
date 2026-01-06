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
    /// TTrades Fractal Model 2026 - V20
    ///
    /// V20 CHANGES: POI TYPE-SPECIFIC INVALIDATION + PROTECTED SWINGS CLARITY
    ///
    /// Generated from Model #1: TTrades Fractal Model Complete
    /// Source Video: https://www.youtube.com/watch?v=9AL41xON3hA
    ///
    /// KEY FIXES FROM V19:
    /// 1. POI TYPE-SPECIFIC INVALIDATION: Different thresholds based on POI type
    ///    - FVG: 6 closes (30 min) - FVGs are sensitive to price action
    ///    - OB/Swing/CandleHL: 30 closes (2.5 hours) - Structure needs sustained break
    /// 2. CISD TERMINOLOGY: Renamed "opposing series" to "downclose series" for clarity
    ///    - m5DowncloseSeriesCount → m5DowncloseSeriesCount
    ///    - m5DowncloseSeriesOpen → m5DowncloseSeriesOpen
    /// 3. MAX SERIES LENGTH: Added MaxDowncloseSeriesCount parameter (default 5)
    ///    - Prevents treating consolidation as pullback
    ///    - Reset series if too many consecutive down closes
    ///
    /// ARCHITECTURE (3 Timeframes):
    ///    Bias TF (Daily): Bias + POI formation (50-bar lookback)
    ///       ↓
    ///    Confirmation TF (H1): C2/C3 in REACTION ZONE (not exact POI overlap)
    ///       ↓
    ///    Entry TF (M5): CISD → OB entry
    ///
    /// V20 INSIGHT: "FVGs invalidate faster than structure (OB/Swing) because they're sensitive zones"
    /// V20 INSIGHT: "Max 5 consecutive down closes = pullback; more = consolidation"
    ///
    /// MODEL RULES (guards):
    ///    - FVG touch MUST be followed by CISD before entry
    ///    - Entry direction MUST align with Daily bias
    ///    - H1 structure levels MUST be respected
    ///    - Wait for C2 wick formation before entries
    ///    - Stop placement uses CISD STRUCTURE low/high (includes opposing series + reversal candle)
    ///
    /// SKIP CONDITIONS:
    ///    - FVG touched without CISD → SKIP
    ///    - Against daily bias → SKIP
    ///    - Structure broken without recovery → SKIP
    ///    - C2 incomplete → WAIT
    /// </summary>
    public class TTradesFractalModelV20 : Strategy
    {
        #region Enums

        public enum BiasDirection { None, Bullish, Bearish }

        public enum POIType { None, FVG, Swing, CandleHL, OrderBlock }

        // V19: Simplified state machine (removed unused intermediate states)
        public enum StrategyState
        {
            Idle,                   // Waiting for PDH/PDL
            WaitingForSweep,        // Have PDH/PDL, waiting for sweep
            BiasSet,                // Sweep happened, bias confirmed
            CountingConfirmation,   // Price at POI, counting C2/C3 closures
            H1Confirmed,            // C2/C3 confirmed, drop to M5
            WaitingForCISD,         // On M5 looking for CISD
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

        // V13: POI Type tracking
        private POIType h1PoiType = POIType.None;

        // V13: Unified POI zone (can be FVG or Swing)
        private double h1PoiTop = 0;
        private double h1PoiBottom = 0;
        private bool h1PoiValid = false;

        // V13: C2/C3 Confirmation tracking
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
        private int m5DowncloseSeriesCount = 0;  // V20: Renamed for clarity (tracks consecutive downclose candles)
        private double m5DowncloseSeriesOpen = 0; // V20: Open price of first downclose candle in series

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

        // Data series indices (V14: 3 configurable timeframes)
        private const int IDX_ENTRY = 0;        // Primary chart = Entry TF (e.g., M5)
        private const int IDX_CONFIRMATION = 1; // Confirmation TF (e.g., H1)
        private const int IDX_BIAS = 2;         // Bias TF (e.g., Daily)

        // V20: POI type-specific invalidation thresholds
        private int invalidationCloseCount = 0;
        private const int INVALIDATION_CLOSE_THRESHOLD = 6;  // V19 fallback: 6 M5 closes = 30 min
        private const int FVG_INVALIDATION_THRESHOLD = 6;        // 30 min - FVGs are sensitive
        private const int STRUCTURE_INVALIDATION_THRESHOLD = 30; // 2.5 hours - sustained break for OB/Swing/CandleHL

        // V18: Debug counters (reset on new session)
        private int poiDetectedCount = 0;
        private int poiInvalidatedCount = 0;
        private int h1ConfirmationCount = 0;
        private int cisdConfirmationCount = 0;
        private int entrySkippedStopWide = 0;
        private int entrySkippedStopTight = 0;
        private int entryTakenCount = 0;

        #endregion

        #region Properties

        // V14: 3 Configurable Timeframes
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

        // V13: New parameters for POI types and confirmation
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

        // V14: New POI types
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

        // V17: POI lookback parameter
        [NinjaScriptProperty]
        [Range(5, 100)]
        [Display(Name = "POI Lookback Bars", Description = "Number of bars to search for POI on Bias TF (default 50)", Order = 15, GroupName = "2. Structure")]
        public int POILookbackBars { get; set; }

        // V18: Zone sizing - percentage of Daily candle range
        [NinjaScriptProperty]
        [Range(0.10, 0.50)]
        [Display(Name = "Zone Size Percent", Description = "POI zone size as % of Daily candle range (default 0.25)", Order = 16, GroupName = "2. Structure")]
        public double ZoneSizePercent { get; set; }

        // V18: H1 reaction zone multiplier - H1 doesn't need exact POI overlap
        [NinjaScriptProperty]
        [Range(1.0, 3.0)]
        [Display(Name = "Reaction Zone Multiplier", Description = "H1 reaction zone = POI zone * this multiplier (default 1.5)", Order = 17, GroupName = "2. Structure")]
        public double ReactionZoneMultiplier { get; set; }

        // V18: Invalidation buffer - percentage of zone size
        [NinjaScriptProperty]
        [Range(0.25, 1.0)]
        [Display(Name = "Invalidation Buffer Percent", Description = "Invalidation buffer as % of POI zone size (default 0.5)", Order = 18, GroupName = "2. Structure")]
        public double InvalidationBufferPercent { get; set; }

        // V20: Max downclose series length (prevents consolidation being treated as pullback)
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

        [NinjaScriptProperty]
        [Display(Name = "Debug Mode", Order = 99, GroupName = "4. Debug")]
        public bool DebugMode { get; set; }

        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "TTrades Fractal Model V20 - POI type-specific invalidation, protected swings clarity";
                Name = "TTradesFractalModelV20";
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

                // V14: Configurable Timeframe Defaults
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

                // V17: POI type defaults (all 4 types enabled)
                MinConfirmationCandles = 2;  // C2 = 2 candles at POI
                UseSwingPOI = true;
                UseFvgPOI = true;
                UseCandlePOI = true;         // Candle high/low
                UseOBPOI = true;             // Order blocks
                MaxPOIDistanceTicks = 80;    // ~20 points on ES
                POILookbackBars = 50;        // V17: Search 50 bars for POI on Bias TF

                // V18: New zone sizing parameters
                ZoneSizePercent = 0.25;           // 25% of Daily candle range
                ReactionZoneMultiplier = 1.5;     // H1 reaction zone = POI * 1.5
                InvalidationBufferPercent = 0.5;  // Invalidation buffer = 50% of zone size

                // V20: Protected swings series length
                MaxDowncloseSeriesCount = 5;      // Max consecutive downclose candles (more = consolidation, not pullback)

                EnableNYSession = true;
                NYStartHour = 9;
                NYEndHour = 16;
                DebugMode = true;
            }
            else if (State == State.Configure)
            {
                // V14: Dynamic data series based on configurable timeframes
                // IDX_ENTRY = 0 (primary chart - should match EntryTFType/Period)
                // IDX_CONFIRMATION = 1
                // IDX_BIAS = 2
                AddDataSeries(ConfirmationTFType, ConfirmationTFPeriod);  // e.g., H1
                AddDataSeries(BiasTFType, BiasTFPeriod);                  // e.g., Daily

                if (DebugMode)
                {
                    Print($"[V14 INIT] Entry TF: {EntryTFType} {EntryTFPeriod}");
                    Print($"[V14 INIT] Confirmation TF: {ConfirmationTFType} {ConfirmationTFPeriod}");
                    Print($"[V14 INIT] Bias TF: {BiasTFType} {BiasTFPeriod}");
                    Print($"[V14 INIT] POI Types: FVG={UseFvgPOI}, Swing={UseSwingPOI}, Candle={UseCandlePOI}, OB={UseOBPOI}");
                    Print($"[V14 INIT] C{MinConfirmationCandles} confirmation, MaxStop={MaxStopTicks}, MinRR={MinRiskReward}");
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
            if (CurrentBars[IDX_BIAS] < 5) return;  // V14: Need at least 5 bars on Bias TF

            // Session management on M5
            if (BarsInProgress == IDX_ENTRY)
            {
                CheckSessionReset();

                // Check POI invalidation on every M5 bar
                if (h1PoiValid)
                {
                    CheckPOIInvalidation();
                }

                ProcessM5Bar();
            }

            // V14: POI analysis on BIAS TF
            if (BarsInProgress == IDX_BIAS)
            {
                // V14: Check for POI on BIAS TF after bias is set (and no valid POI exists)
                if (dailyBias != BiasDirection.None && !h1PoiValid)
                {
                    DetectBiasTFPOI();
                }
            }

            // Confirmation TF: C2/C3 confirmation at POIs
            if (BarsInProgress == IDX_CONFIRMATION)
            {
                UpdateH1Swings();

                // V19: ALSO check for POI on H1 bars (not just Daily) - 24x more detection opportunities
                if (dailyBias != BiasDirection.None && !h1PoiValid)
                {
                    DetectBiasTFPOI();
                    if (DebugMode && h1PoiValid)
                    {
                        Print($"[V19 H1] POI detected on H1 bar update (vs waiting for Daily)");
                    }
                }

                // V13: Process C2/C3 confirmation when in CountingConfirmation state
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

                // Reset daily state BUT PRESERVE POI
                ResetDailyStatePreservePOI();

                if (DebugMode)
                {
                    Print($"[SESSION] New day {today:MM/dd} | PDH={pdh:F2} PDL={pdl:F2}");
                    if (h1PoiValid)
                    {
                        Print($"[SESSION] V13: POI PRESERVED from prior session: {h1PoiBottom:F2} - {h1PoiTop:F2} (type={h1PoiType})");
                    }
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

                // V13.2: Check if existing POI is too far from current price
                if (h1PoiValid && h1FvgDirection == BiasDirection.Bullish)
                {
                    double poiDistance = Math.Abs(close - h1PoiTop) / TickSize;
                    if (poiDistance > MaxPOIDistanceTicks)
                    {
                        if (DebugMode)
                            Print($"[V18 POI] Existing POI too far ({poiDistance:F0} ticks > {MaxPOIDistanceTicks}) - invalidating to find closer POI");
                        InvalidatePOI();
                    }
                }

                if (DebugMode)
                {
                    Print($"[BIAS] *** BULLISH *** PDL swept and reclaimed. Close={close:F2} > PDL={pdl:F2}");
                    if (h1PoiValid && h1FvgDirection == BiasDirection.Bullish)
                    {
                        Print($"[BIAS] V13: Existing bullish POI available: {h1PoiBottom:F2} - {h1PoiTop:F2}");
                        // V13.4: Go directly to counting H1 candles at POI
                        currentState = StrategyState.CountingConfirmation;
                        h1CandlesAtPOI = 0;
                    }
                    else
                    {
                        Print($"[BIAS] Now waiting for H1 POI (FVG or Swing) to form...");
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

                // V13.2: Check if existing POI is too far from current price
                if (h1PoiValid && h1FvgDirection == BiasDirection.Bearish)
                {
                    double poiDistance = Math.Abs(close - h1PoiBottom) / TickSize;
                    if (poiDistance > MaxPOIDistanceTicks)
                    {
                        if (DebugMode)
                            Print($"[V18 POI] Existing POI too far ({poiDistance:F0} ticks > {MaxPOIDistanceTicks}) - invalidating to find closer POI");
                        InvalidatePOI();
                    }
                }

                if (DebugMode)
                {
                    Print($"[BIAS] *** BEARISH *** PDH swept and rejected. Close={close:F2} < PDH={pdh:F2}");
                    if (h1PoiValid && h1FvgDirection == BiasDirection.Bearish)
                    {
                        Print($"[BIAS] V13: Existing bearish POI available: {h1PoiBottom:F2} - {h1PoiTop:F2}");
                        // V13.4: Go directly to counting H1 candles at POI
                        currentState = StrategyState.CountingConfirmation;
                        h1CandlesAtPOI = 0;
                    }
                    else
                    {
                        Print($"[BIAS] Now waiting for H1 POI (FVG or Swing) to form...");
                    }
                }
            }
        }

        /// <summary>
        /// V18: Reset daily state but PRESERVE the H1 POI
        /// Also prints previous session stats before resetting
        /// </summary>
        private void ResetDailyStatePreservePOI()
        {
            // V18: Print previous session stats (only if any activity occurred)
            if (poiDetectedCount > 0 || entryTakenCount > 0)
            {
                Print($"[V18 STATS] === SESSION SUMMARY ===");
                Print($"[V18 STATS] POI: {poiDetectedCount} detected, {poiInvalidatedCount} invalidated ({(poiDetectedCount > 0 ? (100.0 * poiInvalidatedCount / poiDetectedCount) : 0):F0}% invalidation rate)");
                Print($"[V18 STATS] Confirmations: H1={h1ConfirmationCount}, CISD={cisdConfirmationCount}");
                Print($"[V18 STATS] Entries: {entryTakenCount} taken, {entrySkippedStopWide} skipped (stop wide), {entrySkippedStopTight} skipped (stop tight)");
            }

            // V18: Reset debug counters for new session
            poiDetectedCount = 0;
            poiInvalidatedCount = 0;
            h1ConfirmationCount = 0;
            cisdConfirmationCount = 0;
            entrySkippedStopWide = 0;
            entrySkippedStopTight = 0;
            entryTakenCount = 0;
            invalidationCloseCount = 0;

            dailyBias = BiasDirection.None;
            pdhSwept = false;
            pdlSwept = false;

            // V13: DO NOT reset POI variables here
            // h1PoiTop, h1PoiBottom, h1PoiValid, h1PoiType are PRESERVED

            // V13: Reset confirmation counter for new day
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
            breakevenSet = false;
            partialTaken = false;
            riskAmount = 0;
            riskPerContract = 0;
            initialQuantity = 0;

            // If POI is still valid, start in appropriate state
            if (h1PoiValid)
            {
                currentState = StrategyState.WaitingForSweep;  // Need new bias confirmation
            }
            else
            {
                currentState = StrategyState.Idle;
            }

            if (consecutiveLosses > 0)
            {
                consecutiveLosses = 0;
                if (DebugMode)
                    Print($"[SESSION] Losses reset on new day");
            }
        }

        private void ResetDailyState()
        {
            // V18: Reset debug counters
            poiDetectedCount = 0;
            poiInvalidatedCount = 0;
            h1ConfirmationCount = 0;
            cisdConfirmationCount = 0;
            entrySkippedStopWide = 0;
            entrySkippedStopTight = 0;
            entryTakenCount = 0;
            invalidationCloseCount = 0;

            dailyBias = BiasDirection.None;
            pdhSwept = false;
            pdlSwept = false;

            // V13: Reset POI variables
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

        #region V14: POI Detection and Confirmation

        /// <summary>
        /// V14: Detect POI on BIAS TF - checks all 4 POI types based on settings
        /// V14.1 FIX: Priority order: FVG > Order Block > Swing > Candle H/L
        /// (Candle H/L moved to LAST because it ALWAYS triggers, blocking other types)
        /// </summary>
        private void DetectBiasTFPOI()
        {
            if (h1PoiValid) return;  // Already have a valid POI

            // 1. Try FVG first (most precise - gap in price action)
            if (UseFvgPOI && DetectBiasTFFVG())
            {
                h1PoiType = POIType.FVG;
                // Copy FVG values to unified POI variables
                h1PoiTop = h1FvgTop;
                h1PoiBottom = h1FvgBottom;
                h1PoiValid = true;
                currentState = StrategyState.CountingConfirmation;
                h1CandlesAtPOI = 0;

                if (DebugMode)
                    Print($"[BIAS TF POI] Using FVG as POI: {h1PoiBottom:F2} - {h1PoiTop:F2} (now counting C2)");
                return;
            }

            // 2. Try order block (requires displacement - institutional footprint)
            if (UseOBPOI && DetectBiasTFOrderBlockPOI())
            {
                currentState = StrategyState.CountingConfirmation;
                h1CandlesAtPOI = 0;

                if (DebugMode)
                    Print($"[BIAS TF POI] Using Order Block as POI: {h1PoiBottom:F2} - {h1PoiTop:F2} (now counting C2)");
                return;
            }

            // 3. Try swing point (classic support/resistance pattern)
            if (UseSwingPOI && DetectBiasTFSwingPOI())
            {
                currentState = StrategyState.CountingConfirmation;
                h1CandlesAtPOI = 0;

                if (DebugMode)
                    Print($"[BIAS TF POI] Using Swing as POI: {h1PoiBottom:F2} - {h1PoiTop:F2} (now counting C2)");
                return;
            }

            // 4. Candle H/L as FALLBACK (always triggers - moved to last)
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
        /// V17: Detect Swing points on BIAS TF with POILookbackBars lookback
        /// For bullish: swing LOW as POI (price pulls back to prior low)
        /// For bearish: swing HIGH as POI (price rallies to prior high)
        /// </summary>
        private bool DetectBiasTFSwingPOI()
        {
            int maxLookback = Math.Min(POILookbackBars, CurrentBars[IDX_BIAS] - 2);
            if (maxLookback < 3) return false;

            double currentPrice = Closes[IDX_BIAS][0];

            // V18: Calculate zone size based on Daily candle range
            double dailyRange = Highs[IDX_BIAS][0] - Lows[IDX_BIAS][0];
            double zoneBuffer = Math.Max(20 * TickSize, dailyRange * ZoneSizePercent);

            if (dailyBias == BiasDirection.Bullish)
            {
                // V17: Search for swing LOW within lookback bars
                for (int i = 1; i < maxLookback - 1; i++)
                {
                    // Swing low = bar where Low[i] < Low[i-1] AND Low[i] < Low[i+1]
                    if (Lows[IDX_BIAS][i] < Lows[IDX_BIAS][i - 1] &&
                        Lows[IDX_BIAS][i] < Lows[IDX_BIAS][i + 1])
                    {
                        double swingLow = Lows[IDX_BIAS][i];
                        double distanceTicks = Math.Abs(currentPrice - swingLow) / TickSize;
                        if (distanceTicks > MaxPOIDistanceTicks) continue;

                        // V18: Proportional zone sizing
                        h1PoiBottom = swingLow - (zoneBuffer * 0.2);   // 20% buffer below
                        h1PoiTop = swingLow + zoneBuffer;              // Full zone above
                        h1PoiType = POIType.Swing;
                        h1PoiValid = true;
                        h1FvgDirection = BiasDirection.Bullish;
                        poiDetectedCount++;  // V18: Debug counter

                        if (DebugMode)
                        {
                            double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                            Print($"[V18 SWING POI] Bullish swing low (lookback={i}): {swingLow:F2}");
                            Print($"[V18 SWING POI] Zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks, dailyRange={dailyRange:F2})");
                        }

                        return true;
                    }
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // V17: Search for swing HIGH within lookback bars
                for (int i = 1; i < maxLookback - 1; i++)
                {
                    // Swing high = bar where High[i] > High[i-1] AND High[i] > High[i+1]
                    if (Highs[IDX_BIAS][i] > Highs[IDX_BIAS][i - 1] &&
                        Highs[IDX_BIAS][i] > Highs[IDX_BIAS][i + 1])
                    {
                        double swingHigh = Highs[IDX_BIAS][i];
                        double distanceTicks = Math.Abs(currentPrice - swingHigh) / TickSize;
                        if (distanceTicks > MaxPOIDistanceTicks) continue;

                        // V18: Proportional zone sizing
                        h1PoiTop = swingHigh + (zoneBuffer * 0.2);     // 20% buffer above
                        h1PoiBottom = swingHigh - zoneBuffer;          // Full zone below
                        h1PoiType = POIType.Swing;
                        h1PoiValid = true;
                        h1FvgDirection = BiasDirection.Bearish;
                        poiDetectedCount++;  // V18: Debug counter

                        if (DebugMode)
                        {
                            double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                            Print($"[V18 SWING POI] Bearish swing high (lookback={i}): {swingHigh:F2}");
                            Print($"[V18 SWING POI] Zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks, dailyRange={dailyRange:F2})");
                        }

                        return true;
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// V14 NEW: Detect prior candle high/low on BIAS TF as POI zone
        /// For bullish: prior candle LOW becomes support POI
        /// For bearish: prior candle HIGH becomes resistance POI
        ///
        /// V14.1 FIX: Widened zones to prevent premature invalidation
        /// - Zone now covers ~30-40% of candle range (was ~10%)
        /// - Gives price room to interact with POI before C2/C3
        /// </summary>
        private bool DetectBiasTFCandlePOI()
        {
            if (CurrentBars[IDX_BIAS] < 2) return false;

            // V18: Use configurable ZoneSizePercent instead of hardcoded 0.3
            double candleRange = Highs[IDX_BIAS][1] - Lows[IDX_BIAS][1];
            double zoneBuffer = Math.Max(20 * TickSize, candleRange * ZoneSizePercent);

            if (dailyBias == BiasDirection.Bullish)
            {
                // Prior candle LOW becomes support POI
                double candleLow = Lows[IDX_BIAS][1];

                // V18: Proportional zone sizing
                h1PoiBottom = candleLow - (zoneBuffer * 0.2);  // 20% buffer below
                h1PoiTop = candleLow + zoneBuffer;             // Full zone above
                h1PoiType = POIType.CandleHL;
                h1PoiValid = true;
                h1FvgDirection = BiasDirection.Bullish;
                poiDetectedCount++;  // V18: Debug counter

                if (DebugMode)
                {
                    double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                    Print($"[V18 CANDLE POI] Bullish zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks, candleRange={candleRange:F2})");
                }

                return true;
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // Prior candle HIGH becomes resistance POI
                double candleHigh = Highs[IDX_BIAS][1];

                // V18: Proportional zone sizing
                h1PoiTop = candleHigh + (zoneBuffer * 0.2);    // 20% buffer above
                h1PoiBottom = candleHigh - zoneBuffer;         // Full zone below
                h1PoiType = POIType.CandleHL;
                h1PoiValid = true;
                h1FvgDirection = BiasDirection.Bearish;
                poiDetectedCount++;  // V18: Debug counter

                if (DebugMode)
                {
                    double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                    Print($"[V18 CANDLE POI] Bearish zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks, candleRange={candleRange:F2})");
                }

                return true;
            }

            return false;
        }

        /// <summary>
        /// V14 NEW: Detect Order Block on BIAS TF as POI zone
        /// OB = last opposite candle before displacement
        /// For bullish: last bearish candle before bullish displacement
        /// For bearish: last bullish candle before bearish displacement
        /// </summary>
        private bool DetectBiasTFOrderBlockPOI()
        {
            if (CurrentBars[IDX_BIAS] < 3) return false;

            // V18: Calculate zone buffer based on Daily range
            double dailyRange = Highs[IDX_BIAS][0] - Lows[IDX_BIAS][0];
            double zoneBuffer = Math.Max(20 * TickSize, dailyRange * ZoneSizePercent);

            if (dailyBias == BiasDirection.Bullish)
            {
                // Check for bullish displacement with prior bearish candle
                bool priorBearish = Closes[IDX_BIAS][1] < Opens[IDX_BIAS][1];
                bool currentBullish = Closes[IDX_BIAS][0] > Opens[IDX_BIAS][0];
                double displacement = Closes[IDX_BIAS][0] - Opens[IDX_BIAS][0];
                double priorRange = Highs[IDX_BIAS][1] - Lows[IDX_BIAS][1];

                // Displacement must be significant (> 1.5x prior candle range)
                if (priorBearish && currentBullish && displacement > priorRange * 1.5)
                {
                    // V18: OB zone includes body + buffer for wick interaction
                    double bodyTop = Math.Max(Opens[IDX_BIAS][1], Closes[IDX_BIAS][1]);
                    double bodyBottom = Math.Min(Opens[IDX_BIAS][1], Closes[IDX_BIAS][1]);
                    h1PoiTop = bodyTop + (zoneBuffer * 0.2);     // 20% buffer above
                    h1PoiBottom = bodyBottom - (zoneBuffer * 0.2); // 20% buffer below
                    h1PoiType = POIType.OrderBlock;
                    h1PoiValid = true;
                    h1FvgDirection = BiasDirection.Bullish;
                    poiDetectedCount++;  // V18: Debug counter

                    if (DebugMode)
                    {
                        double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                        Print($"[V18 OB POI] *** BULLISH OB DETECTED ***");
                        Print($"[V18 OB POI] Zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks)");
                    }

                    return true;
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // Check for bearish displacement with prior bullish candle
                bool priorBullish = Closes[IDX_BIAS][1] > Opens[IDX_BIAS][1];
                bool currentBearish = Closes[IDX_BIAS][0] < Opens[IDX_BIAS][0];
                double displacement = Opens[IDX_BIAS][0] - Closes[IDX_BIAS][0];
                double priorRange = Highs[IDX_BIAS][1] - Lows[IDX_BIAS][1];

                // Displacement must be significant (> 1.5x prior candle range)
                if (priorBullish && currentBearish && displacement > priorRange * 1.5)
                {
                    // V18: OB zone includes body + buffer for wick interaction
                    double bodyTop = Math.Max(Opens[IDX_BIAS][1], Closes[IDX_BIAS][1]);
                    double bodyBottom = Math.Min(Opens[IDX_BIAS][1], Closes[IDX_BIAS][1]);
                    h1PoiTop = bodyTop + (zoneBuffer * 0.2);     // 20% buffer above
                    h1PoiBottom = bodyBottom - (zoneBuffer * 0.2); // 20% buffer below
                    h1PoiType = POIType.OrderBlock;
                    h1PoiValid = true;
                    h1FvgDirection = BiasDirection.Bearish;
                    poiDetectedCount++;  // V18: Debug counter

                    if (DebugMode)
                    {
                        double zoneTicks = (h1PoiTop - h1PoiBottom) / TickSize;
                        Print($"[V18 OB POI] *** BEARISH OB DETECTED ***");
                        Print($"[V18 OB POI] Zone: {h1PoiBottom:F2} - {h1PoiTop:F2} ({zoneTicks:F0} ticks)");
                    }

                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// V13 FIX: Process H1 confirmation - count candles that TOUCH POI zone
        /// Per video analysis: C2 = 2nd candle that interacts with POI (wick or body)
        /// NO RESET when candle doesn't touch - cumulative count until POI invalidated
        /// V18: Uses expanded reaction zone - H1 candles don't need to form exactly at Daily POI level
        /// </summary>
        private void ProcessH1Confirmation()
        {
            if (currentState != StrategyState.CountingConfirmation) return;
            if (BarsInProgress != IDX_CONFIRMATION) return;

            double high = Highs[IDX_CONFIRMATION][0];
            double low = Lows[IDX_CONFIRMATION][0];

            // V18: Expand POI zone to reaction zone
            // User insight: "When POI gets hit from daily level, H1 C1/C2 don't need to form exactly at the level"
            double zoneSize = h1PoiTop - h1PoiBottom;
            double reactionBuffer = zoneSize * (ReactionZoneMultiplier - 1.0);  // e.g., if multiplier=1.5, buffer=0.5*zone
            double reactionTop = h1PoiTop + reactionBuffer;
            double reactionBottom = h1PoiBottom - reactionBuffer;

            // Candle touches reaction zone if its range overlaps (wick or body)
            bool inReactionZone = (low <= reactionTop && high >= reactionBottom);

            if (inReactionZone)
            {
                h1CandlesAtPOI++;
                if (DebugMode)
                {
                    Print($"[V18 H1 CONFIRM] C{h1CandlesAtPOI} in REACTION ZONE");
                    Print($"[V18 H1 CONFIRM] Candle: H={high:F2} L={low:F2}");
                    Print($"[V18 H1 CONFIRM] POI zone: {h1PoiBottom:F2}-{h1PoiTop:F2}, Reaction zone: {reactionBottom:F2}-{reactionTop:F2}");
                }

                if (h1CandlesAtPOI >= MinConfirmationCandles)
                {
                    h1ConfirmationReceived = true;
                    currentState = StrategyState.H1Confirmed;
                    h1ConfirmationCount++;  // V18: Debug counter

                    if (DebugMode)
                    {
                        Print($"[V18 H1 CONFIRM] *** C{h1CandlesAtPOI} CONFIRMED *** - dropping to M5 for CISD entry");
                    }
                }
            }
            // V13 FIX: NO RESET when candle doesn't touch POI
            // Cumulative count - only reset on POI invalidation or new POI
            else if (DebugMode && h1CandlesAtPOI > 0)
            {
                Print($"[V18 H1 CONFIRM] Candle outside reaction zone (H={high:F2} L={low:F2}) - count stays at {h1CandlesAtPOI}");
            }
        }

        #endregion

        #region POI Invalidation Logic

        /// <summary>
        /// V20: Get invalidation threshold based on POI type
        /// FVGs are sensitive and invalidate quickly (6 closes = 30 min)
        /// Structure (OB/Swing/CandleHL) needs sustained break (30 closes = 2.5 hours)
        /// </summary>
        private int GetInvalidationThreshold()
        {
            switch (h1PoiType)
            {
                case POIType.FVG:
                    return FVG_INVALIDATION_THRESHOLD;  // 6 closes = 30 min
                case POIType.OrderBlock:
                case POIType.Swing:
                case POIType.CandleHL:
                    return STRUCTURE_INVALIDATION_THRESHOLD;  // 30 closes = 2.5 hours
                default:
                    return INVALIDATION_CLOSE_THRESHOLD;  // Fallback
            }
        }

        /// <summary>
        /// V20: Check if POI has been invalidated by price sweeping past it
        /// Uses POI type-specific thresholds (FVG faster than structure)
        /// </summary>
        private void CheckPOIInvalidation()
        {
            if (!h1PoiValid) return;

            double close = Closes[IDX_ENTRY][0];

            // V18: Scale buffer based on POI zone size instead of fixed ticks
            double zoneSize = h1PoiTop - h1PoiBottom;
            double buffer = Math.Max(20 * TickSize, zoneSize * InvalidationBufferPercent);

            // V20: Get threshold based on POI type
            int threshold = GetInvalidationThreshold();

            bool outsideZone = false;

            if (h1FvgDirection == BiasDirection.Bullish)
            {
                // Bullish POI invalidated if price closes BELOW the POI bottom
                if (close < h1PoiBottom - buffer)
                {
                    outsideZone = true;
                    invalidationCloseCount++;

                    if (DebugMode)
                    {
                        Print($"[V20 POI] {h1PoiType} Bullish invalidation warning #{invalidationCloseCount}/{threshold}");
                        Print($"[V20 POI] Close={close:F2} < POI bottom={h1PoiBottom:F2} - buffer={buffer:F2}");
                    }

                    if (invalidationCloseCount >= threshold)
                    {
                        if (DebugMode)
                        {
                            Print($"[V20 POI] *** {h1PoiType} INVALIDATED after {threshold} closes ***");
                        }
                        poiInvalidatedCount++;
                        InvalidatePOI();
                    }
                }
            }
            else if (h1FvgDirection == BiasDirection.Bearish)
            {
                // Bearish POI invalidated if price closes ABOVE the POI top
                if (close > h1PoiTop + buffer)
                {
                    outsideZone = true;
                    invalidationCloseCount++;

                    if (DebugMode)
                    {
                        Print($"[V20 POI] {h1PoiType} Bearish invalidation warning #{invalidationCloseCount}/{threshold}");
                        Print($"[V20 POI] Close={close:F2} > POI top={h1PoiTop:F2} + buffer={buffer:F2}");
                    }

                    if (invalidationCloseCount >= threshold)
                    {
                        if (DebugMode)
                        {
                            Print($"[V20 POI] *** {h1PoiType} INVALIDATED after {threshold} closes ***");
                        }
                        poiInvalidatedCount++;
                        InvalidatePOI();
                    }
                }
            }

            // V18: Reset counter if price returns to zone
            if (!outsideZone && invalidationCloseCount > 0)
            {
                if (DebugMode)
                {
                    Print($"[V20 POI] Price returned to zone, resetting invalidation count from {invalidationCloseCount}");
                }
                invalidationCloseCount = 0;
            }
        }

        private void InvalidatePOI()
        {
            h1PoiValid = false;
            h1PoiTop = 0;
            h1PoiBottom = 0;
            h1PoiType = POIType.None;
            h1CandlesAtPOI = 0;
            h1ConfirmationReceived = false;

            // V18: Reset invalidation cooldown counter
            invalidationCloseCount = 0;

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

        #region Bias TF FVG Detection

        /// <summary>
        /// V17: Detect FVG on BIAS TF with 50-bar lookback
        /// Returns true if valid FVG found within POILookbackBars
        /// </summary>
        private bool DetectBiasTFFVG()
        {
            // V17: Search up to POILookbackBars for FVG
            int maxLookback = Math.Min(POILookbackBars, CurrentBars[IDX_BIAS] - 2);
            if (maxLookback < 1) return false;

            // Get current price for distance check
            double currentPrice = Closes[IDX_BIAS][0];

            if (dailyBias == BiasDirection.Bullish)
            {
                // V17: Loop through lookback bars to find closest valid bullish FVG
                for (int i = 0; i < maxLookback; i++)
                {
                    // Bullish FVG: Gap UP - candle[i].Low > candle[i+2].High
                    double gapLow = Lows[IDX_BIAS][i];
                    double gapHigh = Highs[IDX_BIAS][i + 2];

                    if (gapLow > gapHigh)
                    {
                        // V17: Validate FVG - middle candle[i+1] must not bridge the gap
                        double middleLow = Lows[IDX_BIAS][i + 1];
                        if (middleLow < gapHigh) continue; // Gap bridged, invalid FVG

                        // V17: Check if FVG is within max distance
                        double fvgCenter = (gapLow + gapHigh) / 2;
                        double distanceTicks = Math.Abs(currentPrice - fvgCenter) / TickSize;
                        if (distanceTicks > MaxPOIDistanceTicks) continue;

                        h1FvgBottom = gapHigh;
                        h1FvgTop = gapLow;
                        h1FvgValid = true;
                        h1FvgFormationBar = CurrentBars[IDX_BIAS] - i;
                        h1FvgDirection = BiasDirection.Bullish;
                        poiDetectedCount++;  // V18: Debug counter

                        double fvgTicks = (h1FvgTop - h1FvgBottom) / TickSize;

                        if (DebugMode)
                        {
                            Print($"[V18 FVG] *** BULLISH FVG DETECTED (lookback={i} bars) ***");
                            Print($"[V18 FVG] Zone: {h1FvgBottom:F2} - {h1FvgTop:F2} ({fvgTicks:F0} ticks, dist={distanceTicks:F0})");
                        }

                        return true;
                    }
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // V17: Loop through lookback bars to find closest valid bearish FVG
                for (int i = 0; i < maxLookback; i++)
                {
                    // Bearish FVG: Gap DOWN - candle[i].High < candle[i+2].Low
                    double gapHigh = Highs[IDX_BIAS][i];
                    double gapLow = Lows[IDX_BIAS][i + 2];

                    if (gapHigh < gapLow)
                    {
                        // V17: Validate FVG - middle candle[i+1] must not bridge the gap
                        double middleHigh = Highs[IDX_BIAS][i + 1];
                        if (middleHigh > gapLow) continue; // Gap bridged, invalid FVG

                        // V17: Check if FVG is within max distance
                        double fvgCenter = (gapHigh + gapLow) / 2;
                        double distanceTicks = Math.Abs(currentPrice - fvgCenter) / TickSize;
                        if (distanceTicks > MaxPOIDistanceTicks) continue;

                        h1FvgTop = gapLow;
                        h1FvgBottom = gapHigh;
                        h1FvgValid = true;
                        h1FvgFormationBar = CurrentBars[IDX_BIAS] - i;
                        h1FvgDirection = BiasDirection.Bearish;
                        poiDetectedCount++;  // V18: Debug counter

                        double fvgTicks = (h1FvgTop - h1FvgBottom) / TickSize;

                        if (DebugMode)
                        {
                            Print($"[V18 FVG] *** BEARISH FVG DETECTED (lookback={i} bars) ***");
                            Print($"[V18 FVG] Zone: {h1FvgBottom:F2} - {h1FvgTop:F2} ({fvgTicks:F0} ticks, dist={distanceTicks:F0})");
                        }

                        return true;
                    }
                }
            }

            return false;
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
                        if (close > seriesOpen)
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
                        if (close < seriesOpen)
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

            // Need H1 POI first (gate) - V19: Stay in BiasSet until POI found
            if (!h1PoiValid)
            {
                // V19: Removed WaitingForH1POI state - just stay in BiasSet and return
                return;
            }

            // V13.4: Removed separate POI touch check - now handled in ProcessH1Confirmation
            // H1 candles at POI are counted directly, M5 touch no longer required as gate

            // V13: Waiting for confirmation - handled on H1 bar updates
            if (currentState == StrategyState.CountingConfirmation)
            {
                return;  // Wait for H1 confirmation
            }

            // V13: After H1 confirmation, drop to M5 for CISD
            if (currentState == StrategyState.H1Confirmed)
            {
                currentState = StrategyState.WaitingForCISD;
                if (DebugMode)
                    Print($"[M5] H1 confirmed - now looking for M5 CISD...");
            }

            // V13: Looking for M5 CISD after H1 confirmation
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
        /// V13: Check if price touches POI - transition to CountingConfirmation
        /// </summary>
        private void CheckPOITouch()
        {
            double high = Highs[IDX_ENTRY][0];
            double low = Lows[IDX_ENTRY][0];

            if (dailyBias == BiasDirection.Bullish)
            {
                // For bullish: price must drop INTO or touch H1 POI zone
                if (low <= h1PoiTop)
                {
                    // V13: Transition to CountingConfirmation instead of directly to CISD
                    currentState = StrategyState.CountingConfirmation;
                    h1CandlesAtPOI = 0;  // Reset counter

                    if (DebugMode)
                    {
                        Print($"[M5 POI TOUCH] *** Price entered H1 POI zone ***");
                        Print($"[M5 POI TOUCH] Low={low:F2} touched POI top={h1PoiTop:F2}");
                        Print($"[M5 POI TOUCH] V13: Now counting C{MinConfirmationCandles} H1 candles at POI...");
                    }
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // For bearish: price must rally INTO or touch H1 POI zone
                if (high >= h1PoiBottom)
                {
                    // V13: Transition to CountingConfirmation instead of directly to CISD
                    currentState = StrategyState.CountingConfirmation;
                    h1CandlesAtPOI = 0;  // Reset counter

                    if (DebugMode)
                    {
                        Print($"[M5 POI TOUCH] *** Price entered H1 POI zone ***");
                        Print($"[M5 POI TOUCH] High={high:F2} touched POI bottom={h1PoiBottom:F2}");
                        Print($"[M5 POI TOUCH] V13: Now counting C{MinConfirmationCandles} H1 candles at POI...");
                    }
                }
            }
        }

        private void CheckM5CISD()
        {
            double open = Opens[IDX_ENTRY][0];
            double close = Closes[IDX_ENTRY][0];
            double high = Highs[IDX_ENTRY][0];
            double low = Lows[IDX_ENTRY][0];
            bool isBullish = close > open;
            bool isBearish = close < open;

            if (dailyBias == BiasDirection.Bullish)
            {
                // Track bearish (opposing) M5 candles during pullback
                if (isBearish)
                {
                    m5DowncloseSeriesCount++;
                    if (m5DowncloseSeriesCount == 1)
                    {
                        m5DowncloseSeriesOpen = open;
                    }

                    // V20: Reset if series gets too long (consolidation, not pullback)
                    if (m5DowncloseSeriesCount > MaxDowncloseSeriesCount)
                    {
                        if (DebugMode)
                            Print($"[V20 CISD] Downclose series too long ({m5DowncloseSeriesCount} > {MaxDowncloseSeriesCount}), resetting");
                        m5DowncloseSeriesCount = 0;
                        m5DowncloseSeriesOpen = 0;
                    }

                    if (DebugMode && m5DowncloseSeriesCount == 1)
                        Print($"[M5 CISD] Downclose series started - bearish candle");
                }
                else if (m5DowncloseSeriesCount >= 1 && isBullish)
                {
                    // CISD = close ABOVE the first opposing candle's open
                    if (close > m5DowncloseSeriesOpen)
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

                        currentState = StrategyState.CisdConfirmed;
                        cisdConfirmationCount++;  // V18: Debug counter

                        if (DebugMode)
                        {
                            Print($"[V20 M5 CISD] *** CONFIRMED - OB FORMED on bar {m5OBFormationBar} ***");
                            Print($"[V20 M5 CISD] Close={close:F2} > DowncloseOpen={m5DowncloseSeriesOpen:F2}");
                            Print($"[M5 OB] BODY: {m5OBBodyLow:F2} - {m5OBBodyHigh:F2}");
                            Print($"[M5 OB] Entry at OB close: {m5OBEntry:F2}");
                        }
                    }

                    m5DowncloseSeriesCount = 0;
                    m5DowncloseSeriesOpen = 0;
                }
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // Track bullish (opposing) M5 candles during rally
                if (isBullish)
                {
                    m5DowncloseSeriesCount++;
                    if (m5DowncloseSeriesCount == 1)
                    {
                        m5DowncloseSeriesOpen = open;
                    }

                    // V20: Reset if series gets too long (consolidation, not pullback)
                    if (m5DowncloseSeriesCount > MaxDowncloseSeriesCount)
                    {
                        if (DebugMode)
                            Print($"[V20 CISD] Upclose series too long ({m5DowncloseSeriesCount} > {MaxDowncloseSeriesCount}), resetting");
                        m5DowncloseSeriesCount = 0;
                        m5DowncloseSeriesOpen = 0;
                    }

                    if (DebugMode && m5DowncloseSeriesCount == 1)
                        Print($"[M5 CISD] Upclose series started - bullish candle");
                }
                else if (m5DowncloseSeriesCount >= 1 && isBearish)
                {
                    // CISD = close BELOW the first opposing candle's open
                    if (close < m5DowncloseSeriesOpen)
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

                        currentState = StrategyState.CisdConfirmed;
                        cisdConfirmationCount++;  // V18: Debug counter

                        if (DebugMode)
                        {
                            Print($"[V20 M5 CISD] *** CONFIRMED - OB FORMED on bar {m5OBFormationBar} ***");
                            Print($"[V20 M5 CISD] Close={close:F2} < UpcloseOpen={m5DowncloseSeriesOpen:F2}");
                            Print($"[M5 OB] BODY: {m5OBBodyLow:F2} - {m5OBBodyHigh:F2}");
                            Print($"[M5 OB] Entry at OB close: {m5OBEntry:F2}");
                        }
                    }

                    m5DowncloseSeriesCount = 0;
                    m5DowncloseSeriesOpen = 0;
                }
            }
        }

        private void CheckM5Entry()
        {
            double close = Closes[IDX_ENTRY][0];
            double high = Highs[IDX_ENTRY][0];
            double low = Lows[IDX_ENTRY][0];

            // V13.7: REMOVED the V13.5/V13.6 OB body position check
            //
            // ROOT CAUSE ANALYSIS (from Ralph loop):
            // - V13.6 filter blocked 242 entries (99% of trades!)
            // - The check assumed OB forms DURING pullback INTO POI
            // - But in reality, OB often forms AFTER price bounces from POI
            // - This is NATURAL behavior - the bounce has already started
            //
            // FIRST PRINCIPLES (from TTrades videos):
            // - "HTF POIs get hit min every 3 days" = 120+ opportunities/year
            // - V13.6 produced only 2 trades = WRONG
            // - V13.4 had 30 trades - closer to correct frequency
            //
            // FIX: Let MaxStopTicks be the only stop filter
            // - If stop is too wide (>20 ticks), skip entry
            // - If stop is too tight (<4 ticks), skip entry
            // - Natural CISD pattern at POI determines valid entries

            if (dailyBias == BiasDirection.Bullish)
            {
                // V19 FIX: Stop below CISD STRUCTURE low (the entire opposing series + reversal candle)
                // m5OBLow is computed in CheckM5CISD() as: Min(current candle low, all opposing candle lows)
                // This is the proper "protected swing" stop placement shown in video evidence
                stopPrice = m5OBLow - (StopBufferTicks * TickSize);
                double stopTicks = (m5OBEntry - stopPrice) / TickSize;

                if (DebugMode)
                {
                    Print($"[V19 ENTRY] Stop calculation: CISD structure low={m5OBLow:F2} - buffer={StopBufferTicks} ticks = {stopPrice:F2}");
                    Print($"[V19 ENTRY] (V18 used OB body low={m5OBBodyLow:F2}, diff={(m5OBBodyLow - m5OBLow)/TickSize:F0} ticks)");
                    Print($"[V19 ENTRY] Risk: {stopTicks:F0} ticks (entry={m5OBEntry:F2} - stop={stopPrice:F2})");
                }

                if (stopTicks > MaxStopTicks)
                {
                    if (DebugMode)
                        Print($"[V18 ENTRY] SKIPPED - Stop too wide: {stopTicks:F0} ticks > {MaxStopTicks}");
                    entrySkippedStopWide++;  // V18: Debug counter
                    m5OBValid = false;
                    m5OBFormationBar = -1;
                    return;
                }

                if (stopTicks < 4)
                {
                    if (DebugMode)
                        Print($"[V18 ENTRY] SKIPPED - Stop too tight: {stopTicks:F0} ticks < 4");
                    entrySkippedStopTight++;  // V18: Debug counter
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
                entryTakenCount++;  // V18: Debug counter

                if (DebugMode)
                {
                    Print($"[V18 ENTRY] *** LONG V18 *** Bar {CurrentBars[IDX_ENTRY]}");
                    Print($"[V18 ENTRY] POI Type={h1PoiType}, Confirmation=C{h1CandlesAtPOI}");
                    Print($"[V18 ENTRY] Entry={entryPrice:F2} (OB close)");
                    Print($"[V18 ENTRY] Stop={stopPrice:F2}");
                    Print($"[V18 ENTRY] Target={targetPrice:F2}");
                    Print($"[V18 ENTRY] Risk={stopTicks:F0} ticks, R:R={(targetPrice - entryPrice) / riskPoints:F1}");
                }

                EnterLong("FractalLongV19");
                SetStopLoss("FractalLongV19", CalculationMode.Price, stopPrice, false);
                SetProfitTarget("FractalLongV19", CalculationMode.Price, targetPrice);

                currentState = StrategyState.InTrade;
                breakevenSet = false;
                partialTaken = false;
            }
            else if (dailyBias == BiasDirection.Bearish)
            {
                // V19 FIX: Stop above CISD STRUCTURE high (the entire opposing series + reversal candle)
                // m5OBHigh is computed in CheckM5CISD() as: Max(current candle high, all opposing candle highs)
                // This is the proper "protected swing" stop placement shown in video evidence
                stopPrice = m5OBHigh + (StopBufferTicks * TickSize);
                double stopTicks = (stopPrice - m5OBEntry) / TickSize;

                if (DebugMode)
                {
                    Print($"[V19 ENTRY] Stop calculation: CISD structure high={m5OBHigh:F2} + buffer={StopBufferTicks} ticks = {stopPrice:F2}");
                    Print($"[V19 ENTRY] (V18 used OB body high={m5OBBodyHigh:F2}, diff={(m5OBHigh - m5OBBodyHigh)/TickSize:F0} ticks)");
                    Print($"[V19 ENTRY] Risk: {stopTicks:F0} ticks (stop={stopPrice:F2} - entry={m5OBEntry:F2})");
                }

                if (stopTicks > MaxStopTicks)
                {
                    if (DebugMode)
                        Print($"[V18 ENTRY] SKIPPED - Stop too wide: {stopTicks:F0} ticks > {MaxStopTicks}");
                    entrySkippedStopWide++;  // V18: Debug counter
                    m5OBValid = false;
                    m5OBFormationBar = -1;
                    return;
                }

                if (stopTicks < 4)
                {
                    if (DebugMode)
                        Print($"[V18 ENTRY] SKIPPED - Stop too tight: {stopTicks:F0} ticks < 4");
                    entrySkippedStopTight++;  // V18: Debug counter
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
                entryTakenCount++;  // V18: Debug counter

                if (DebugMode)
                {
                    Print($"[V18 ENTRY] *** SHORT V18 *** Bar {CurrentBars[IDX_ENTRY]}");
                    Print($"[V18 ENTRY] POI Type={h1PoiType}, Confirmation=C{h1CandlesAtPOI}");
                    Print($"[V18 ENTRY] Entry={entryPrice:F2} (OB close)");
                    Print($"[V18 ENTRY] Stop={stopPrice:F2}");
                    Print($"[V18 ENTRY] Target={targetPrice:F2}");
                    Print($"[V18 ENTRY] Risk={stopTicks:F0} ticks, R:R={(entryPrice - targetPrice) / riskPoints:F1}");
                }

                EnterShort("FractalShortV19");
                SetStopLoss("FractalShortV19", CalculationMode.Price, stopPrice, false);
                SetProfitTarget("FractalShortV19", CalculationMode.Price, targetPrice);

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
                            Print($"[V18 PARTIAL] *** Taking partial profit at {PartialExitRR}R ***");
                            Print($"[V18 PARTIAL] Exiting {exitQty} of {currentQty} contracts ({PartialExitPercent}%)");
                        }

                        // Exit partial position
                        if (Position.MarketPosition == MarketPosition.Long)
                        {
                            ExitLong(exitQty, "Partial1R_V13", "FractalLongV13");
                        }
                        else
                        {
                            ExitShort(exitQty, "Partial1R_V13", "FractalShortV13");
                        }

                        // Move stop to breakeven on remaining position
                        double breakevenPrice = entryPrice;
                        if (Position.MarketPosition == MarketPosition.Long)
                        {
                            breakevenPrice = entryPrice + TickSize;
                            SetStopLoss("FractalLongV13", CalculationMode.Price, breakevenPrice, false);
                        }
                        else
                        {
                            breakevenPrice = entryPrice - TickSize;
                            SetStopLoss("FractalShortV13", CalculationMode.Price, breakevenPrice, false);
                        }

                        partialTaken = true;
                        breakevenSet = true;

                        if (DebugMode)
                        {
                            Print($"[V18 PARTIAL] Stop moved to breakeven: {breakevenPrice:F2}");
                            Print($"[V18 PARTIAL] Runner targeting {targetPrice:F2}");
                        }
                    }
                    else if (exitQty >= currentQty)
                    {
                        // Position too small for partial - just move to breakeven
                        if (DebugMode)
                            Print($"[V18 PARTIAL] Position too small ({currentQty} contracts) - moving to breakeven only");

                        if (Position.MarketPosition == MarketPosition.Long)
                        {
                            SetStopLoss("FractalLongV13", CalculationMode.Price, entryPrice + TickSize, false);
                        }
                        else
                        {
                            SetStopLoss("FractalShortV13", CalculationMode.Price, entryPrice - TickSize, false);
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
                        SetStopLoss("FractalLongV13", CalculationMode.Price, entryPrice + TickSize, false);
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
                        SetStopLoss("FractalShortV13", CalculationMode.Price, entryPrice - TickSize, false);
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
                    Print($"[V18 EXECUTION] Partial exit filled: {quantity} contracts at {price:F2}");
                return;
            }

            if (execution.Order.OrderState == OrderState.Filled && execution.Order.Name.Contains("Stop"))
            {
                // Check if this was a breakeven stop
                if (breakevenSet && partialTaken)
                {
                    if (DebugMode)
                        Print($"[V18 TRADE] Breakeven stop hit after partial - no loss on runner");
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
                breakevenSet = false;
                partialTaken = false;
                riskAmount = 0;
                riskPerContract = 0;
                initialQuantity = 0;

                // V13: Reset confirmation for next trade
                h1CandlesAtPOI = 0;
                h1ConfirmationReceived = false;

                if (h1PoiValid)
                {
                    // V13.4: Go back to counting H1 candles at POI for next trade
                    currentState = StrategyState.CountingConfirmation;
                    if (DebugMode)
                        Print($"[TRADE CLOSED] Back to CountingConfirmation - looking for new C2 at POI...");
                }
            }
        }

        #endregion
    }
}

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
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{
    /// <summary>
    /// Multi-Timeframe C1/C2 Indicator
    ///
    /// Detects C1/C2 reversal patterns across H4 and M15 timeframes.
    /// Entry signals when M15 C1/C2 OR protected swing confirms after H4 C2.
    /// Optional daily bias filtering using TTrades methodology.
    ///
    /// BarsInProgress:
    ///   0 = Primary (chart TF - recommended M15)
    ///   1 = H4 (C1/C2 confirmation timeframe)
    ///   2 = Daily (optional bias calculation)
    /// </summary>
    public class MultiTimeframeC1C2Indicator : Indicator
    {
        #region Enums
        public enum BiasDirection { None, Bullish, Bearish }
        public enum SignalDirection { None, Long, Short }
        #endregion

        #region State Variables
        // Setup Phase State Machine - tracks where we are in the entry flow
        private enum SetupPhase
        {
            Idle,                    // No active setup - waiting for H4 C2
            WaitingForImpulse,       // H4 C2 confirmed, tracking impulse move
            TrackingOB,              // Impulse done, counting opposing candles (Order Block)
            WaitingForCISD,          // OB formed, waiting for CISD breakout
            WaitingForRetracement,   // CISD confirmed, waiting for pullback entry
            Cooldown                 // Entry fired, in post-trade cooldown
        }
        private SetupPhase currentPhase = SetupPhase.Idle;

        // Chart Timeframe Detection
        private bool isEntryTimeframe = false;  // True if chart TF <= 15 min
        private int primaryBarMinutes = 0;

        // Daily Bias State
        private BiasDirection dailyBias = BiasDirection.None;
        private double pdh = 0;  // Prior Day High
        private double pdl = 0;  // Prior Day Low
        private bool pdhSwept = false;
        private bool pdlSwept = false;
        private DateTime lastBiasDate = DateTime.MinValue;

        // H4 C1/C2 State
        private bool h4C2Detected = false;
        private SignalDirection h4C2Direction = SignalDirection.None;
        private int h4C2Bar = -1;
        private double h4C2Level = 0;
        private DateTime h4C2Time = DateTime.MinValue;
        private int h4C2DetectedAtM15Bar = -1;  // Track M15 bar when H4 C2 was detected (for cooldown)
        private int h4C2TradedBar = -1;  // Track which H4 C2 bar was already traded (one trade per H4 C2)
        private SignalDirection lastTradeDirection = SignalDirection.None;  // Track direction of last trade (blocks same-direction H4 C2s)

        // M15 Protected Swing State
        private bool impulseComplete = false;       // Has the impulse move after H4 C2 completed?
        private double impulseExtreme = 0;          // High for Long, Low for Short - tracks impulse extent
        private int opposingCount = 0;
        private double opposingSeriesOpen = 0;
        private double opposingSeriesLow = double.MaxValue;
        private double opposingSeriesHigh = double.MinValue;
        private int protectedSwingH4Bar = -1;  // Track which H4 bar this setup belongs to
        private bool cisdConfirmed = false;    // Prevents CISD from re-triggering on same setup

        // Retracement State (after CISD confirmation)
        private bool waitingForRetracement = false;
        private double obTop = 0;               // Order Block top (opposingSeriesHigh at CISD)
        private double obBottom = 0;            // Order Block bottom (opposingSeriesLow at CISD)
        private double retracementZoneTop = 0;  // Upper boundary of retracement zone
        private double retracementZoneBottom = 0;  // Lower boundary of retracement zone
        private int cisdBar = -1;               // Bar when CISD was confirmed
        private string retracementZoneTag = "";  // Tag for retracement zone drawing

        // Entry Signal State
        private bool entrySignaled = false;
        private int lastSignalBar = -1;
        #endregion

        #region OnStateChange
        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"Multi-Timeframe C1/C2 Indicator - Detects H4 and M15 reversal patterns with optional daily bias";
                Name = "MultiTimeframeC1C2Indicator";
                Calculate = Calculate.OnBarClose;
                IsOverlay = true;
                DisplayInDataBox = true;
                DrawOnPricePanel = true;
                DrawHorizontalGridLines = true;
                DrawVerticalGridLines = true;
                PaintPriceMarkers = true;
                ScaleJustification = NinjaTrader.Gui.Chart.ScaleJustification.Right;
                IsSuspendedWhileInactive = true;

                // Parameters
                UseDailyBias = false;
                ShowH4Markers = true;
                ShowM15Signals = true;
                RiskRewardTarget = 2.0;
                StopBufferTicks = 4;
                EnableDebug = false;

                // Retracement Parameters
                UseRetracement = true;
                RetracementMinPercent = 25;
                RetracementMaxPercent = 75;
                RetracementTimeoutBars = 20;

                // Timing Parameters
                MaxOpposingCandles = 5;
                CooldownBarsAfterEntry = 16;

                // Colors
                BullishColor = Brushes.LimeGreen;
                BearishColor = Brushes.Red;
                EntryZoneColor = Brushes.DodgerBlue;
            }
            else if (State == State.Configure)
            {
                // Add H4 data series for C1/C2 confirmation
                AddDataSeries(BarsPeriodType.Minute, 240);  // H4 = 240 minutes

                // Add Daily data series for bias (always add, check UseDailyBias at runtime)
                AddDataSeries(BarsPeriodType.Day, 1);
            }
            else if (State == State.DataLoaded)
            {
                ClearOutputWindow();
                RemoveDrawObjects();  // Clear old entry markers on reload

                // Detect primary chart timeframe to control what gets drawn
                if (BarsPeriod.BarsPeriodType == BarsPeriodType.Minute)
                    primaryBarMinutes = BarsPeriod.Value;
                else if (BarsPeriod.BarsPeriodType == BarsPeriodType.Second)
                    primaryBarMinutes = 1;  // Treat sub-minute as entry TF
                else if (BarsPeriod.BarsPeriodType == BarsPeriodType.Tick)
                    primaryBarMinutes = 1;  // Treat tick as entry TF
                else
                    primaryBarMinutes = 1440;  // Daily or higher = not entry TF

                // Entry zones only show on M15 or lower
                isEntryTimeframe = primaryBarMinutes <= 15;

                if (EnableDebug)
                    Print($"[INIT] Chart TF: {primaryBarMinutes} min, IsEntryTimeframe: {isEntryTimeframe}");
            }
        }
        #endregion

        #region OnBarUpdate
        protected override void OnBarUpdate()
        {
            // Route to appropriate handler based on data series
            if (BarsInProgress == 2)
            {
                // Daily bar update - calculate bias
                if (UseDailyBias)
                    ProcessDailyBias();
            }
            else if (BarsInProgress == 1)
            {
                // H4 bar update - check for C1/C2
                ProcessH4C1C2();
            }
            else if (BarsInProgress == 0)
            {
                // Primary (M15) bar update - check for entry signals
                ProcessM15Entry();
            }
        }
        #endregion

        #region Daily Bias Processing
        private void ProcessDailyBias()
        {
            if (CurrentBars[2] < 2) return;

            DateTime today = Times[2][0].Date;

            // Reset bias at start of new day
            if (today != lastBiasDate)
            {
                // Calculate PDH/PDL from previous day
                pdh = Highs[2][1];
                pdl = Lows[2][1];
                pdhSwept = false;
                pdlSwept = false;
                dailyBias = BiasDirection.None;
                lastBiasDate = today;

                if (EnableDebug)
                    Print($"[DAILY] {today:yyyy-MM-dd} New day - PDH: {pdh:F2}, PDL: {pdl:F2}");
            }

            // Check for sweep conditions (only if bias not yet set)
            if (dailyBias == BiasDirection.None)
            {
                double high = Highs[2][0];
                double low = Lows[2][0];
                double close = Closes[2][0];

                // PDL Sweep check (bullish potential)
                if (!pdlSwept && low < pdl)
                {
                    pdlSwept = true;
                    if (EnableDebug)
                        Print($"[DAILY] {Times[2][0]} PDL SWEPT at {low:F2}");
                }

                // PDH Sweep check (bearish potential)
                if (!pdhSwept && high > pdh)
                {
                    pdhSwept = true;
                    if (EnableDebug)
                        Print($"[DAILY] {Times[2][0]} PDH SWEPT at {high:F2}");
                }

                // Bias confirmation on close
                if (pdlSwept && close > pdl)
                {
                    dailyBias = BiasDirection.Bullish;
                    if (EnableDebug)
                        Print($"[DAILY] {Times[2][0]} BULLISH BIAS - PDL swept and reclaimed");
                }
                else if (pdhSwept && close < pdh)
                {
                    dailyBias = BiasDirection.Bearish;
                    if (EnableDebug)
                        Print($"[DAILY] {Times[2][0]} BEARISH BIAS - PDH swept and rejected");
                }
            }
        }
        #endregion

        #region H4 C1/C2 Processing
        private void ProcessH4C1C2()
        {
            if (CurrentBars[1] < 3) return;

            // Get previous and current H4 candle data
            double prevOpen = Opens[1][1];
            double prevClose = Closes[1][1];
            double prevLow = Lows[1][1];
            double prevHigh = Highs[1][1];

            double currLow = Lows[1][0];
            double currHigh = Highs[1][0];
            double currClose = Closes[1][0];
            double currOpen = Opens[1][0];
            DateTime currTime = Times[1][0];

            // Skip if we already detected a C2 on this bar
            if (h4C2Time == currTime) return;

            // C2 Pattern Detection (Reversal Pattern per TTrades video tyoxl1l-6iI):
            // C1: Creates the extreme (high or low) - ANY candle color
            // C2: Sweeps C1's extreme AND closes back inside C1's range

            // Bullish C2 (reversal from low)
            // - C2 sweeps below C1's low (wick goes lower)
            // - C2 closes back above C1's low (rejection)
            bool bullishC2 = currLow < prevLow &&       // Swept below previous low
                             currClose > prevLow;        // Closed back above previous low

            // Bearish C2 (reversal from high)
            // - C2 sweeps above C1's high (wick goes higher)
            // - C2 closes back below C1's high (rejection)
            bool bearishC2 = currHigh > prevHigh &&     // Swept above previous high
                             currClose < prevHigh;       // Closed back below previous high

            // Apply daily bias filter if enabled
            bool biasAllowsBullish = !UseDailyBias || dailyBias == BiasDirection.Bullish || dailyBias == BiasDirection.None;
            bool biasAllowsBearish = !UseDailyBias || dailyBias == BiasDirection.Bearish || dailyBias == BiasDirection.None;

            // Block consecutive same-direction H4 C2 signals
            // Only allow entry after opposite direction H4 C2 appears
            if (bullishC2 && biasAllowsBullish && lastTradeDirection == SignalDirection.Long)
            {
                if (EnableDebug)
                    Print($"[H4] {currTime} Bullish C2 BLOCKED - already traded LONG, waiting for bearish reversal");
                return;
            }
            if (bearishC2 && biasAllowsBearish && lastTradeDirection == SignalDirection.Short)
            {
                if (EnableDebug)
                    Print($"[H4] {currTime} Bearish C2 BLOCKED - already traded SHORT, waiting for bullish reversal");
                return;
            }

            if (bullishC2 && biasAllowsBullish)
            {
                h4C2Detected = true;
                h4C2Direction = SignalDirection.Long;
                h4C2Bar = CurrentBars[1];
                h4C2Level = prevLow;
                h4C2Time = currTime;
                h4C2DetectedAtM15Bar = CurrentBars[0];  // Record M15 bar for cooldown
                ResetProtectedSwingState();
                // Only reset retracement if direction changed (preserve same-direction retracement zones)
                if (!waitingForRetracement || h4C2Direction != SignalDirection.Long)
                    ResetRetracementState();

                // Reset direction blocking on valid opposite-direction H4 C2
                // This allows next LONG after this bullish C2 setup completes/invalidates
                if (lastTradeDirection == SignalDirection.Short)
                    lastTradeDirection = SignalDirection.None;

                // Set phase unless we're preserving an existing retracement
                if (!waitingForRetracement)
                    currentPhase = SetupPhase.WaitingForImpulse;

                if (EnableDebug)
                    Print($"[H4] {currTime} BULLISH C2 detected - Swept {prevLow:F2}, Closed {currClose:F2} [Phase: {currentPhase}]");

                if (ShowH4Markers)
                {
                    // Use time-based tag to avoid duplicates, draw on H4 bar
                    string tag = "H4C2_" + currTime.ToString("yyyyMMddHHmm");
                    Draw.Text(this, tag, "H4 C2", 0, currLow - (8 * TickSize), BullishColor);
                }
            }
            else if (bearishC2 && biasAllowsBearish)
            {
                h4C2Detected = true;
                h4C2Direction = SignalDirection.Short;
                h4C2Bar = CurrentBars[1];
                h4C2Level = prevHigh;
                h4C2Time = currTime;
                h4C2DetectedAtM15Bar = CurrentBars[0];  // Record M15 bar for cooldown
                ResetProtectedSwingState();
                // Only reset retracement if direction changed (preserve same-direction retracement zones)
                if (!waitingForRetracement || h4C2Direction != SignalDirection.Short)
                    ResetRetracementState();

                // Reset direction blocking on valid opposite-direction H4 C2
                // This allows next SHORT after this bearish C2 setup completes/invalidates
                if (lastTradeDirection == SignalDirection.Long)
                    lastTradeDirection = SignalDirection.None;

                // Set phase unless we're preserving an existing retracement
                if (!waitingForRetracement)
                    currentPhase = SetupPhase.WaitingForImpulse;

                if (EnableDebug)
                    Print($"[H4] {currTime} BEARISH C2 detected - Swept {prevHigh:F2}, Closed {currClose:F2} [Phase: {currentPhase}]");

                if (ShowH4Markers)
                {
                    // Use time-based tag to avoid duplicates, draw on H4 bar
                    string tag = "H4C2_" + currTime.ToString("yyyyMMddHHmm");
                    Draw.Text(this, tag, "H4 C2", 0, currHigh + (8 * TickSize), BearishColor);
                }
            }
        }
        #endregion

        #region M15 Entry Processing
        private void ProcessM15Entry()
        {
            // Skip entry processing on H4 or higher timeframes
            if (!isEntryTimeframe) return;

            if (CurrentBars[0] < 3) return;
            if (!h4C2Detected) return;
            if (entrySignaled && CurrentBars[0] - lastSignalBar < CooldownBarsAfterEntry) return;  // Cooldown period

            // Check if H4 C2 has been invalidated by price action
            // Bullish H4 C2 invalidated if price closes below the swept low
            // Bearish H4 C2 invalidated if price closes above the swept high
            if (h4C2Direction == SignalDirection.Long && Closes[0][0] < h4C2Level)
            {
                if (EnableDebug)
                    Print($"[M15] {Times[0][0]} H4 C2 INVALIDATED - Close {Closes[0][0]:F2} < h4C2Level {h4C2Level:F2} [Phase: Idle]");
                h4C2Detected = false;
                h4C2Direction = SignalDirection.None;
                currentPhase = SetupPhase.Idle;  // Explicit phase reset before state clears
                ResetProtectedSwingState();
                ResetRetracementState();
                return;
            }
            if (h4C2Direction == SignalDirection.Short && Closes[0][0] > h4C2Level)
            {
                if (EnableDebug)
                    Print($"[M15] {Times[0][0]} H4 C2 INVALIDATED - Close {Closes[0][0]:F2} > h4C2Level {h4C2Level:F2} [Phase: Idle]");
                h4C2Detected = false;
                h4C2Direction = SignalDirection.None;
                currentPhase = SetupPhase.Idle;  // Explicit phase reset before state clears
                ResetProtectedSwingState();
                ResetRetracementState();
                return;
            }

            // Skip if this H4 C2 has already been traded - wait for next H4 C2
            if (h4C2TradedBar == h4C2Bar)
            {
                if (EnableDebug)
                    Print($"[M15] {Times[0][0]} Skipping - H4 C2 bar {h4C2Bar} already traded, waiting for new H4 C2");
                return;
            }

            // Wait at least 2 M15 bars after H4 C2 before looking for entries
            // This prevents race condition where old setup completes right as new H4 C2 arrives
            if (h4C2DetectedAtM15Bar >= 0 && CurrentBars[0] - h4C2DetectedAtM15Bar < 2)
            {
                if (EnableDebug)
                    Print($"[M15] {Times[0][0]} Cooldown active - waiting for H4 C2 to settle ({CurrentBars[0] - h4C2DetectedAtM15Bar}/2 bars)");
                return;
            }

            // DISABLED: M15 C2 triggers false entries - too loose without POI context
            // bool m15C2Signal = CheckM15C1C2();

            // Check for retracement entry if waiting
            if (waitingForRetracement)
            {
                bool retracementSignal = CheckRetracement();
                if (retracementSignal)
                {
                    SignalEntry("Retracement");
                    ResetRetracementState();
                }
                return;  // Don't check for new CISD while waiting for retracement
            }

            // ONLY use protected swing (CISD) for entries after H4 C2 confirms
            bool protectedSwingSignal = CheckProtectedSwing();

            if (protectedSwingSignal)
            {
                SignalEntry("Protected Swing");
            }
        }

        private bool CheckM15C1C2()
        {
            // Get previous and current M15 candle data
            double prevLow = Lows[0][1];
            double prevHigh = Highs[0][1];

            double currLow = Lows[0][0];
            double currHigh = Highs[0][0];
            double currClose = Closes[0][0];

            // C2 Pattern (per TTrades video): C1 can be any color
            // Only check: sweep + close back inside

            // Bullish M15 C2 (must match H4 direction)
            bool bullishC2 = h4C2Direction == SignalDirection.Long &&
                             currLow < prevLow &&        // Swept below previous low
                             currClose > prevLow;         // Closed back above

            // Bearish M15 C2 (must match H4 direction)
            bool bearishC2 = h4C2Direction == SignalDirection.Short &&
                             currHigh > prevHigh &&      // Swept above previous high
                             currClose < prevHigh;        // Closed back below

            if (bullishC2 || bearishC2)
            {
                if (EnableDebug)
                    Print($"[M15] {Times[0][0]} C2 pattern detected - Direction: {(bullishC2 ? "LONG" : "SHORT")}");
                return true;
            }

            return false;
        }

        private bool CheckProtectedSwing()
        {
            double open = Opens[0][0];
            double close = Closes[0][0];
            double high = Highs[0][0];
            double low = Lows[0][0];

            // Phase 1: Track impulse move (continuation candles after H4 C2)
            // We need to wait for the impulse to complete before tracking the OB
            // This ensures OB forms at pullback level, not at random candles during continuation
            if (!impulseComplete)
            {
                if (h4C2Direction == SignalDirection.Long)
                {
                    if (close > open)  // Bullish candle = continuation
                    {
                        impulseExtreme = impulseExtreme == 0 ? high : Math.Max(impulseExtreme, high);
                        if (EnableDebug)
                            Print($"[M15] {Times[0][0]} Impulse continuing - High: {high:F2}, Extreme: {impulseExtreme:F2}");
                        return false;  // Still in impulse phase
                    }
                    else  // Bearish candle = pullback starting
                    {
                        // If no impulse tracked, use H4 bar's extreme as baseline
                        if (impulseExtreme == 0)
                        {
                            // Get H4 bar's high (for Long) as baseline
                            if (CurrentBars[1] >= 0)  // H4 data available
                            {
                                impulseExtreme = Highs[1][0];
                            }
                            if (EnableDebug)
                                Print($"[M15] {Times[0][0]} No impulse tracked, using H4 high: {impulseExtreme:F2}");
                        }
                        impulseComplete = true;
                        currentPhase = SetupPhase.TrackingOB;
                        if (EnableDebug)
                            Print($"[M15] {Times[0][0]} Impulse complete at {impulseExtreme:F2} - Starting OB tracking [Phase: {currentPhase}]");
                    }
                }
                else if (h4C2Direction == SignalDirection.Short)
                {
                    if (close < open)  // Bearish candle = continuation
                    {
                        impulseExtreme = impulseExtreme == 0 ? low : Math.Min(impulseExtreme, low);
                        if (EnableDebug)
                            Print($"[M15] {Times[0][0]} Impulse continuing - Low: {low:F2}, Extreme: {impulseExtreme:F2}");
                        return false;  // Still in impulse phase
                    }
                    else  // Bullish candle = pullback starting
                    {
                        // If no impulse tracked, use H4 bar's extreme as baseline
                        if (impulseExtreme == 0)
                        {
                            // Get H4 bar's low (for Short) as baseline
                            if (CurrentBars[1] >= 0)  // H4 data available
                            {
                                impulseExtreme = Lows[1][0];
                            }
                            if (EnableDebug)
                                Print($"[M15] {Times[0][0]} No impulse tracked, using H4 low: {impulseExtreme:F2}");
                        }
                        impulseComplete = true;
                        currentPhase = SetupPhase.TrackingOB;
                        if (EnableDebug)
                            Print($"[M15] {Times[0][0]} Impulse complete at {impulseExtreme:F2} - Starting OB tracking [Phase: {currentPhase}]");
                    }
                }
            }

            // Phase 2: Track opposing candles (OB = pullback after impulse)
            // Determine if current candle is opposing to the expected direction
            bool isOpposing = false;
            if (h4C2Direction == SignalDirection.Long)
                isOpposing = close < open;  // Down-close opposes long
            else if (h4C2Direction == SignalDirection.Short)
                isOpposing = close > open;  // Up-close opposes short

            if (isOpposing)
            {
                opposingCount++;
                if (opposingCount == 1)
                {
                    opposingSeriesOpen = open;
                    opposingSeriesLow = low;
                    opposingSeriesHigh = high;
                    protectedSwingH4Bar = h4C2Bar;  // Lock this setup to current H4 C2
                }
                else
                {
                    opposingSeriesLow = Math.Min(opposingSeriesLow, low);
                    opposingSeriesHigh = Math.Max(opposingSeriesHigh, high);
                }

                if (EnableDebug)
                    Print($"[M15] {Times[0][0]} Opposing candle #{opposingCount} - Open: {opposingSeriesOpen:F2}");

                // Too many opposing candles = consolidation, reset
                if (opposingCount > MaxOpposingCandles)
                {
                    if (EnableDebug)
                        Print($"[M15] {Times[0][0]} Opposing series too long ({opposingCount}) - Reset");
                    ResetProtectedSwingState();
                }

                return false;
            }
            else if (opposingCount >= 1 && opposingCount <= MaxOpposingCandles && !cisdConfirmed)
            {
                // Non-opposing candle after valid series - check for CISD (only once per setup)
                // CISD = price closes ABOVE the OB zone (for Long) or BELOW (for Short)
                bool cisd = false;
                if (h4C2Direction == SignalDirection.Long)
                    cisd = close > opposingSeriesHigh;  // Close ABOVE the OB zone
                else if (h4C2Direction == SignalDirection.Short)
                    cisd = close < opposingSeriesLow;   // Close BELOW the OB zone

                if (cisd)
                {
                    // CRITICAL: Validate this setup is for the CURRENT H4 C2
                    // If H4 changed since setup started, this is a stale entry - reject it
                    if (protectedSwingH4Bar != h4C2Bar)
                    {
                        if (EnableDebug)
                            Print($"[M15] {Times[0][0]} CISD REJECTED - Setup from H4 bar {protectedSwingH4Bar}, current H4 bar {h4C2Bar} (stale direction)");
                        ResetProtectedSwingState();
                        return false;
                    }

                    // Mark CISD as confirmed - prevents re-triggering on subsequent bars
                    cisdConfirmed = true;

                    if (EnableDebug)
                        Print($"[M15] {Times[0][0]} CISD confirmed after {opposingCount} opposing candle(s) - Close {close:F2} > OB High {opposingSeriesHigh:F2}");

                    // If retracement is enabled, setup the retracement zone instead of immediate entry
                    if (UseRetracement)
                    {
                        SetupRetracementZone();
                        return false;  // Don't signal entry yet, wait for retracement
                    }

                    return true;  // Immediate entry if retracement not enabled
                }
                // If CISD not confirmed, DON'T reset - keep tracking the opposing series
                // This allows non-consecutive opposing candles to accumulate
            }

            return false;
        }

        private void ResetProtectedSwingState()
        {
            impulseComplete = false;
            impulseExtreme = 0;
            opposingCount = 0;
            opposingSeriesOpen = 0;
            opposingSeriesLow = double.MaxValue;
            opposingSeriesHigh = double.MinValue;
            protectedSwingH4Bar = -1;  // Clear H4 association
            cisdConfirmed = false;     // Allow CISD check on next setup

            // Reset phase to Idle unless we're in Cooldown (post-entry)
            if (currentPhase != SetupPhase.Cooldown)
                currentPhase = SetupPhase.Idle;
        }

        private void SetupRetracementZone()
        {
            // Store the Order Block boundaries (the opposing candle series)
            obTop = opposingSeriesHigh;
            obBottom = opposingSeriesLow;
            double obRange = obTop - obBottom;

            // Calculate retracement zone based on configurable percentages
            // For SHORT: We want price to retrace UP into the OB (from bottom toward top)
            // For LONG: We want price to retrace DOWN into the OB (from top toward bottom)
            double minPercent = RetracementMinPercent / 100.0;
            double maxPercent = RetracementMaxPercent / 100.0;

            if (h4C2Direction == SignalDirection.Short)
            {
                // SHORT setup: OB is bullish candles, retracement is UP
                // Zone is measured from the bottom of OB upward
                retracementZoneBottom = obBottom + (obRange * minPercent);
                retracementZoneTop = obBottom + (obRange * maxPercent);
            }
            else if (h4C2Direction == SignalDirection.Long)
            {
                // LONG setup: OB is bearish candles, retracement is DOWN
                // Zone is measured from the top of OB downward
                retracementZoneTop = obTop - (obRange * minPercent);
                retracementZoneBottom = obTop - (obRange * maxPercent);
            }

            waitingForRetracement = true;
            cisdBar = CurrentBars[0];
            currentPhase = SetupPhase.WaitingForRetracement;

            if (EnableDebug)
            {
                Print($"[RETRACEMENT] {Times[0][0]} Zone setup - Direction: {h4C2Direction} [Phase: {currentPhase}]");
                Print($"[RETRACEMENT] OB Range: {obBottom:F2} to {obTop:F2} ({obRange / TickSize:F0} ticks)");
                Print($"[RETRACEMENT] Entry Zone: {retracementZoneBottom:F2} to {retracementZoneTop:F2} ({RetracementMinPercent}%-{RetracementMaxPercent}%)");
            }

            // Draw retracement zone visualization
            if (ShowM15Signals)
            {
                retracementZoneTag = "RetracementZone_" + CurrentBars[0];
                Brush zoneColor = (h4C2Direction == SignalDirection.Long) ? BullishColor : BearishColor;

                // Draw the retracement zone rectangle (extends 20 bars forward)
                Draw.Rectangle(this, retracementZoneTag, false, 0, retracementZoneTop, -20, retracementZoneBottom, zoneColor, zoneColor, 25);

                // Add text label
                Draw.Text(this, retracementZoneTag + "_Label",
                    $"Retrace {RetracementMinPercent}-{RetracementMaxPercent}%",
                    -10, (retracementZoneTop + retracementZoneBottom) / 2, zoneColor);
            }
        }

        private bool CheckRetracement()
        {
            if (!waitingForRetracement) return false;

            double high = Highs[0][0];
            double low = Lows[0][0];
            double close = Closes[0][0];

            // Timeout: If price hasn't retraced within configured bars, cancel the setup
            if (CurrentBars[0] - cisdBar > RetracementTimeoutBars)
            {
                if (EnableDebug)
                    Print($"[RETRACEMENT] {Times[0][0]} TIMEOUT - No retracement within {RetracementTimeoutBars} bars, canceling setup [Phase: Idle]");
                currentPhase = SetupPhase.Idle;  // Reset phase on timeout
                ResetRetracementState();
                return false;
            }

            // Check if price has entered the retracement zone
            bool enteredZone = false;

            if (h4C2Direction == SignalDirection.Short)
            {
                // SHORT: Price must retrace UP into zone (high touches or exceeds zone bottom)
                // Entry triggers when high reaches into zone
                enteredZone = high >= retracementZoneBottom && low <= retracementZoneTop;
                // OB boundary invalidation removed - let H4 C2 invalidation and timeout handle blown setups
            }
            else if (h4C2Direction == SignalDirection.Long)
            {
                // LONG: Price must retrace DOWN into zone (low touches or goes below zone top)
                // Entry triggers when low reaches into zone
                enteredZone = low <= retracementZoneTop && high >= retracementZoneBottom;
                // OB boundary invalidation removed - let H4 C2 invalidation and timeout handle blown setups
            }

            if (enteredZone)
            {
                if (EnableDebug)
                    Print($"[RETRACEMENT] {Times[0][0]} ENTRY TRIGGERED - Price retraced into zone (H: {high:F2}, L: {low:F2})");
                return true;
            }

            return false;
        }

        private void ResetRetracementState()
        {
            waitingForRetracement = false;
            obTop = 0;
            obBottom = 0;
            retracementZoneTop = 0;
            retracementZoneBottom = 0;
            cisdBar = -1;

            // Remove retracement zone drawing
            if (!string.IsNullOrEmpty(retracementZoneTag))
            {
                RemoveDrawObject(retracementZoneTag);
                RemoveDrawObject(retracementZoneTag + "_Label");
                retracementZoneTag = "";
            }
        }
        #endregion

        #region Entry Signal and Visualization
        private void SignalEntry(string signalType)
        {
            double entryPrice = Closes[0][0];
            double stopPrice;
            double targetPrice;

            if (h4C2Direction == SignalDirection.Long)
            {
                // Long entry - stop below OB low
                // Use obBottom (preserved from retracement setup) if available, else opposingSeriesLow
                double obLow = (obBottom > 0) ? obBottom :
                               (opposingSeriesLow != double.MaxValue) ? opposingSeriesLow : Lows[0][1];
                stopPrice = obLow - (StopBufferTicks * TickSize);

                double riskTicks = (entryPrice - stopPrice) / TickSize;
                targetPrice = entryPrice + (riskTicks * RiskRewardTarget * TickSize);

                if (EnableDebug)
                    Print($"[SIGNAL] {Times[0][0]} LONG via {signalType} - Entry: {entryPrice:F2}, Stop: {stopPrice:F2} (OB Low: {obLow:F2}), Target: {targetPrice:F2}");

                if (ShowM15Signals)
                {
                    // Draw entry arrow
                    Draw.ArrowUp(this, "Entry_" + CurrentBars[0], true, 0, entryPrice - (8 * TickSize), BullishColor);

                    // Draw entry zone
                    Draw.Rectangle(this, "EntryZone_" + CurrentBars[0], false, 0, entryPrice, -8, stopPrice, EntryZoneColor, EntryZoneColor, 20);

                    // Draw target zone
                    Draw.Rectangle(this, "TargetZone_" + CurrentBars[0], false, 0, entryPrice, -8, targetPrice, BullishColor, BullishColor, 15);

                    // Add label
                    Draw.Text(this, "Label_" + CurrentBars[0], $"LONG 1:{RiskRewardTarget}", -4, entryPrice, BullishColor);
                }
            }
            else if (h4C2Direction == SignalDirection.Short)
            {
                // Short entry - stop above OB high
                // Use obTop (preserved from retracement setup) if available, else opposingSeriesHigh
                double obHigh = (obTop > 0) ? obTop :
                                (opposingSeriesHigh != double.MinValue) ? opposingSeriesHigh : Highs[0][1];
                stopPrice = obHigh + (StopBufferTicks * TickSize);

                double riskTicks = (stopPrice - entryPrice) / TickSize;
                targetPrice = entryPrice - (riskTicks * RiskRewardTarget * TickSize);

                if (EnableDebug)
                    Print($"[SIGNAL] {Times[0][0]} SHORT via {signalType} - Entry: {entryPrice:F2}, Stop: {stopPrice:F2} (OB High: {obHigh:F2}), Target: {targetPrice:F2}");

                if (ShowM15Signals)
                {
                    // Draw entry arrow
                    Draw.ArrowDown(this, "Entry_" + CurrentBars[0], true, 0, entryPrice + (8 * TickSize), BearishColor);

                    // Draw entry zone
                    Draw.Rectangle(this, "EntryZone_" + CurrentBars[0], false, 0, entryPrice, -8, stopPrice, EntryZoneColor, EntryZoneColor, 20);

                    // Draw target zone
                    Draw.Rectangle(this, "TargetZone_" + CurrentBars[0], false, 0, entryPrice, -8, targetPrice, BearishColor, BearishColor, 15);

                    // Add label
                    Draw.Text(this, "Label_" + CurrentBars[0], $"SHORT 1:{RiskRewardTarget}", -4, entryPrice, BearishColor);
                }
            }

            entrySignaled = true;
            lastSignalBar = CurrentBars[0];

            // Mark this H4 C2 as traded - prevents additional entries until NEW H4 C2
            h4C2TradedBar = h4C2Bar;
            lastTradeDirection = h4C2Direction;  // Block same-direction H4 C2s until opposite appears

            // Reset H4 state to look for next setup
            h4C2Detected = false;
            h4C2Direction = SignalDirection.None;
            ResetProtectedSwingState();
            ResetRetracementState();  // Clear retracement state after entry

            // Set phase to Cooldown AFTER resets (so it's not overwritten)
            currentPhase = SetupPhase.Cooldown;
        }
        #endregion

        #region Properties
        [NinjaScriptProperty]
        [Display(Name = "Use Daily Bias", Description = "Filter signals by TTrades daily bias (PDH/PDL sweep)", Order = 1, GroupName = "Parameters")]
        public bool UseDailyBias { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Show H4 Markers", Description = "Display H4 C2 pattern markers on chart", Order = 2, GroupName = "Parameters")]
        public bool ShowH4Markers { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Show M15 Signals", Description = "Display M15 entry signals and zones", Order = 3, GroupName = "Parameters")]
        public bool ShowM15Signals { get; set; }

        [NinjaScriptProperty]
        [Range(1.0, 10.0)]
        [Display(Name = "Risk/Reward Target", Description = "Target R:R multiple for visualization", Order = 4, GroupName = "Parameters")]
        public double RiskRewardTarget { get; set; }

        [NinjaScriptProperty]
        [Range(0, 20)]
        [Display(Name = "Stop Buffer Ticks", Description = "Buffer ticks beyond swing for stop placement", Order = 5, GroupName = "Parameters")]
        public int StopBufferTicks { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Enable Debug", Description = "Print debug messages to output window", Order = 6, GroupName = "Parameters")]
        public bool EnableDebug { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Use Retracement", Description = "Wait for price to retrace into OB before entry", Order = 1, GroupName = "Retracement")]
        public bool UseRetracement { get; set; }

        [NinjaScriptProperty]
        [Range(0, 100)]
        [Display(Name = "Retracement Min %", Description = "Minimum retracement into OB for entry zone (default 25%)", Order = 2, GroupName = "Retracement")]
        public int RetracementMinPercent { get; set; }

        [NinjaScriptProperty]
        [Range(0, 100)]
        [Display(Name = "Retracement Max %", Description = "Maximum retracement into OB for entry zone (default 75%)", Order = 3, GroupName = "Retracement")]
        public int RetracementMaxPercent { get; set; }

        [NinjaScriptProperty]
        [Range(5, 50)]
        [Display(Name = "Retracement Timeout Bars", Description = "Max bars to wait for retracement before canceling setup (default 20)", Order = 4, GroupName = "Retracement")]
        public int RetracementTimeoutBars { get; set; }

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "Max Opposing Candles", Description = "Maximum opposing candles to form valid Order Block (default 5)", Order = 1, GroupName = "Timing")]
        public int MaxOpposingCandles { get; set; }

        [NinjaScriptProperty]
        [Range(1, 50)]
        [Display(Name = "Cooldown Bars After Entry", Description = "Bars to wait after entry before allowing another signal (default 16)", Order = 2, GroupName = "Timing")]
        public int CooldownBarsAfterEntry { get; set; }

        [NinjaScriptProperty]
        [XmlIgnore]
        [Display(Name = "Bullish Color", Order = 1, GroupName = "Colors")]
        public Brush BullishColor { get; set; }

        [Browsable(false)]
        public string BullishColorSerializable
        {
            get { return Serialize.BrushToString(BullishColor); }
            set { BullishColor = Serialize.StringToBrush(value); }
        }

        [NinjaScriptProperty]
        [XmlIgnore]
        [Display(Name = "Bearish Color", Order = 2, GroupName = "Colors")]
        public Brush BearishColor { get; set; }

        [Browsable(false)]
        public string BearishColorSerializable
        {
            get { return Serialize.BrushToString(BearishColor); }
            set { BearishColor = Serialize.StringToBrush(value); }
        }

        [NinjaScriptProperty]
        [XmlIgnore]
        [Display(Name = "Entry Zone Color", Order = 3, GroupName = "Colors")]
        public Brush EntryZoneColor { get; set; }

        [Browsable(false)]
        public string EntryZoneColorSerializable
        {
            get { return Serialize.BrushToString(EntryZoneColor); }
            set { EntryZoneColor = Serialize.StringToBrush(value); }
        }
        #endregion
    }
}

#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{
	public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
	{
		private MultiTimeframeC1C2Indicator[] cacheMultiTimeframeC1C2Indicator;
		public MultiTimeframeC1C2Indicator MultiTimeframeC1C2Indicator(bool useDailyBias, bool showH4Markers, bool showM15Signals, double riskRewardTarget, int stopBufferTicks, bool enableDebug, Brush bullishColor, Brush bearishColor, Brush entryZoneColor)
		{
			return MultiTimeframeC1C2Indicator(Input, useDailyBias, showH4Markers, showM15Signals, riskRewardTarget, stopBufferTicks, enableDebug, bullishColor, bearishColor, entryZoneColor);
		}

		public MultiTimeframeC1C2Indicator MultiTimeframeC1C2Indicator(ISeries<double> input, bool useDailyBias, bool showH4Markers, bool showM15Signals, double riskRewardTarget, int stopBufferTicks, bool enableDebug, Brush bullishColor, Brush bearishColor, Brush entryZoneColor)
		{
			if (cacheMultiTimeframeC1C2Indicator != null)
				for (int idx = 0; idx < cacheMultiTimeframeC1C2Indicator.Length; idx++)
					if (cacheMultiTimeframeC1C2Indicator[idx] != null && cacheMultiTimeframeC1C2Indicator[idx].UseDailyBias == useDailyBias && cacheMultiTimeframeC1C2Indicator[idx].ShowH4Markers == showH4Markers && cacheMultiTimeframeC1C2Indicator[idx].ShowM15Signals == showM15Signals && cacheMultiTimeframeC1C2Indicator[idx].RiskRewardTarget == riskRewardTarget && cacheMultiTimeframeC1C2Indicator[idx].StopBufferTicks == stopBufferTicks && cacheMultiTimeframeC1C2Indicator[idx].EnableDebug == enableDebug && cacheMultiTimeframeC1C2Indicator[idx].BullishColor == bullishColor && cacheMultiTimeframeC1C2Indicator[idx].BearishColor == bearishColor && cacheMultiTimeframeC1C2Indicator[idx].EntryZoneColor == entryZoneColor && cacheMultiTimeframeC1C2Indicator[idx].EqualsInput(input))
						return cacheMultiTimeframeC1C2Indicator[idx];
			return CacheIndicator<MultiTimeframeC1C2Indicator>(new MultiTimeframeC1C2Indicator(){ UseDailyBias = useDailyBias, ShowH4Markers = showH4Markers, ShowM15Signals = showM15Signals, RiskRewardTarget = riskRewardTarget, StopBufferTicks = stopBufferTicks, EnableDebug = enableDebug, BullishColor = bullishColor, BearishColor = bearishColor, EntryZoneColor = entryZoneColor }, input, ref cacheMultiTimeframeC1C2Indicator);
		}
	}
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
	public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
	{
		public Indicators.MultiTimeframeC1C2Indicator MultiTimeframeC1C2Indicator(bool useDailyBias, bool showH4Markers, bool showM15Signals, double riskRewardTarget, int stopBufferTicks, bool enableDebug, Brush bullishColor, Brush bearishColor, Brush entryZoneColor)
		{
			return indicator.MultiTimeframeC1C2Indicator(Input, useDailyBias, showH4Markers, showM15Signals, riskRewardTarget, stopBufferTicks, enableDebug, bullishColor, bearishColor, entryZoneColor);
		}

		public Indicators.MultiTimeframeC1C2Indicator MultiTimeframeC1C2Indicator(ISeries<double> input, bool useDailyBias, bool showH4Markers, bool showM15Signals, double riskRewardTarget, int stopBufferTicks, bool enableDebug, Brush bullishColor, Brush bearishColor, Brush entryZoneColor)
		{
			return indicator.MultiTimeframeC1C2Indicator(input, useDailyBias, showH4Markers, showM15Signals, riskRewardTarget, stopBufferTicks, enableDebug, bullishColor, bearishColor, entryZoneColor);
		}
	}
}

namespace NinjaTrader.NinjaScript.Strategies
{
	public partial class Strategy : NinjaTrader.Gui.NinjaScript.StrategyRenderBase
	{
		public Indicators.MultiTimeframeC1C2Indicator MultiTimeframeC1C2Indicator(bool useDailyBias, bool showH4Markers, bool showM15Signals, double riskRewardTarget, int stopBufferTicks, bool enableDebug, Brush bullishColor, Brush bearishColor, Brush entryZoneColor)
		{
			return indicator.MultiTimeframeC1C2Indicator(Input, useDailyBias, showH4Markers, showM15Signals, riskRewardTarget, stopBufferTicks, enableDebug, bullishColor, bearishColor, entryZoneColor);
		}

		public Indicators.MultiTimeframeC1C2Indicator MultiTimeframeC1C2Indicator(ISeries<double> input, bool useDailyBias, bool showH4Markers, bool showM15Signals, double riskRewardTarget, int stopBufferTicks, bool enableDebug, Brush bullishColor, Brush bearishColor, Brush entryZoneColor)
		{
			return indicator.MultiTimeframeC1C2Indicator(input, useDailyBias, showH4Markers, showM15Signals, riskRewardTarget, stopBufferTicks, enableDebug, bullishColor, bearishColor, entryZoneColor);
		}
	}
}

#endregion

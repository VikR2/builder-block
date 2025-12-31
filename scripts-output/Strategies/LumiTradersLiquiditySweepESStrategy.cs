//
// LumiTradersLiquiditySweepStrategy
//
// Generated from: https://youtu.be/-D_JBnsMsAA
// Generated at: 2025-12-31
//
// Strategy Overview:
//   ICT-based liquidity sweep with order block entry
//   Instruments: ES (E-mini S&P 500)
//   Timeframes: Multi-timeframe (H1 -> M30 -> M5/M3)
//   Target: 2R (2x the risk)
//
// Concepts detected:
//   entry_patterns: liquidity sweep, order block, fair value gap
//   market_analysis: HTF bias, premium/discount zones
//   market_structure: swing high/low identification
//   risk_management: swing-based stop loss, 2R target, breakeven
//   trade_management: session windows, consolidation cut
//
// Backtest Results (March/April 2024):
//   Net P&L: $10,150
//   Win Rate: 80.56%
//   Profit Factor: 8.20
//   Day Win %: 84.21%
//   Avg Win/Loss: 1.98R
//   Zella Score: 89.61/100
//

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
    public class LumiTradersLiquiditySweepESStrategy : Strategy
    {
        #region Enums
        public enum StrategyState
        {
            WAITING_FOR_SESSION,
            SCANNING_FOR_HTF_LEVEL,
            WAITING_FOR_SWEEP,
            WAITING_FOR_CISD,        // NEW: Wait for Change in State of Delivery
            WAITING_FOR_OB_RETURN,
            ENTRY_TRIGGERED,
            MANAGING_TRADE,
            TRADE_COMPLETE
        }

        public enum BiasType { Neutral, Bullish, Bearish }
        
        public enum MTFMode { H1_M5, M30_M3, Both }
        #endregion

        #region Variables
        // State Machine
        private StrategyState currentState;

        // Core Position Management
        private int tradeDirection;  // 1 = long, -1 = short
        private double entryPrice;
        private double stopLoss;
        private double takeProfit;
        private double idealEntryPrice;  // For 2R calculation from OB level
        private bool tradeTaken;
        private string activeOrderName;
        private bool breakevenSet;
        private DateTime currentDate;
        private BiasType dailyBias;

        // HTF Level Tracking (H1/M30 swing highs/lows)
        private double htfSwingHigh;
        private double htfSwingLow;
        private int htfSwingHighBar;
        private int htfSwingLowBar;
        private bool htfLevelIdentified;

        // Sweep Detection
        private bool sweepDetected;
        private double sweepPrice;
        private int sweepBar;
        private int sweepDirection;  // 1 = low sweep (bullish), -1 = high sweep (bearish)
        private double sweptLevel;

        // Order Block Tracking
        private double orderBlockHigh;
        private double orderBlockLow;
        private int orderBlockBar;
        private bool orderBlockIdentified;
        private bool priceReturnedToOB;
        private bool obRespected;

        // Premium/Discount Zone
        private double dailyRangeHigh;
        private double dailyRangeLow;
        private double equilibrium;
        private bool inPremiumZone;
        private bool inDiscountZone;

        // Session State (for strict enforcement across state machine)
        private bool isInTradingSession;
        
        // CISD Tracking (Change in State of Delivery)
        private bool cisdConfirmed;
        private double cisdCandleOpen;  // The candle open to compare against
        private int cisdCandleBar;
        
        // Active Timeframe Pair (which pair triggered the setup)
        private int activeSweepTF;  // 1 = H1, 2 = M30
        private int activeOBTF;     // 0 = M5, 3 = M3

        // Trade Management
        private int barsInConsolidation;
        private double consolidationHigh;
        private double consolidationLow;
        private double lastClosePrice;

        // V3 Trade Management: Partial Profits & Trailing
        private bool partialTaken;
        private int initialQuantity;
        private double riskAmount;  // Store risk at entry for R calculations
        private double trailingSwingLevel;

        // Previous Day Data
        private double previousDayHigh;
        private double previousDayLow;
        private double previousDayOpen;
        private double previousDayClose;

        // Current Day Tracking
        private double currentDayHigh;
        private double currentDayLow;
        private double currentDayOpen;
        private double currentDayClose;

        // Swing Point Tracking
        private List<double> recentSwingHighs;
        private List<double> recentSwingLows;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"LumiTraders Liquidity Sweep ES Strategy - ICT-based sweep with OB entry (Optimized for E-mini S&P 500)";
                Name = "LumiTradersLiquiditySweepES";
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

                // Time Settings (NQ AM Session - covers 9:30 open)
                TradeStartHour = 9;
                TradeEndHour = 12;
                PMSessionStartHour = 13;
                PMSessionEndHour = 16;
                SessionEndHour = 16;

                // Sweep Detection
                SwingLookback = 20;
                SweepThresholdTicks = 4;  // Higher for NQ volatility

                // Order Block
                OBLookback = 10;
                OBEntryBuffer = 2;
                OBPullbackPercent = 50.0;  // Require 50% pullback into OB

                // Risk Management
                TargetRMultiple = 2.0;
                MaxStopLossTicks = 150;  // Higher for NQ moves
                StopBufferTicks = 3;

                // Trade Management
                UseBreakeven = true;
                BreakevenTriggerR = 1.0;
                CutOnConsolidation = true;
                ConsolidationBars = 5;
                ConsolidationThresholdTicks = 20;  // Higher for NQ

                // Filters
                UsePremiumDiscountFilter = true;
                EquilibriumPercent = 50.0;
                AvoidPMSession = true;

                // Debug
                EnableDebug = true;
                
                // MTF Settings
                TimeframePair = MTFMode.Both;
                RequireCISD = true;
                
                // V3 Trade Management: Partial Profits & Trailing
                UsePartialProfits = true;
                PartialPercent = 50;
                PartialTargetR = 1.0;
                UseTrailingStop = true;
                TrailingSwingLookback = 5;
            }
            else if (State == State.Configure)
            {
                // Add data series for multi-timeframe analysis
                // BarsInProgress 0 = Primary (5-min) - for OB when H1 sweep
                // BarsInProgress 1 = H1 (60-min) - for sweep detection
                // BarsInProgress 2 = M30 (30-min) - for sweep detection
                // BarsInProgress 3 = M3 (3-min) - for OB when M30 sweep
                AddDataSeries(BarsPeriodType.Minute, 60);  // H1
                AddDataSeries(BarsPeriodType.Minute, 30);  // M30
                AddDataSeries(BarsPeriodType.Minute, 3);   // M3
            }
            else if (State == State.DataLoaded)
            {
                recentSwingHighs = new List<double>();
                recentSwingLows = new List<double>();
                ClearOutputWindow();
                Print("=== LumiTradersLiquiditySweepStrategy LOADED ===");
            }
            else if (State == State.Terminated)
            {
                if (recentSwingHighs != null) recentSwingHighs.Clear();
                if (recentSwingLows != null) recentSwingLows.Clear();
            }
        }

        protected override void OnBarUpdate()
        {
            // Multi-timeframe routing
            // BarsInProgress: 0=M5, 1=H1, 2=M30, 3=M3
            
            if (CurrentBars[0] < BarsRequiredToTrade) return;
            if (BarsInProgress > 0 && CurrentBars[BarsInProgress] < BarsRequiredToTrade) return;
            
            // HTF sweep detection runs on H1 (1) and M30 (2)
            if (BarsInProgress == 1 || BarsInProgress == 2)
            {
                HandleHTFTimeframe();
                return;
            }
            
            // LTF logic runs on M5 (0) and M3 (3)
            // Only process if this is the active OB timeframe for the current setup
            if (BarsInProgress == 3 && activeOBTF != 3) return;
            if (BarsInProgress == 0 && activeOBTF == 3) return;
            
            if (State == State.Realtime && IsFirstTickOfBar == false) return;

            DateTime barTime = Times[BarsInProgress][0];
            int hour = barTime.Hour;
            int minute = barTime.Minute;

            // Daily state reset
            if (barTime.Date != currentDate)
            {
                // Capture previous day data BEFORE resetting
                if (currentDayHigh > 0)
                {
                    previousDayHigh = currentDayHigh;
                    previousDayLow = currentDayLow;
                    previousDayOpen = currentDayOpen;
                    previousDayClose = currentDayClose;
                    if (EnableDebug) Print("Previous Day: O=" + previousDayOpen.ToString("F2") +
                        " H=" + previousDayHigh.ToString("F2") +
                        " L=" + previousDayLow.ToString("F2") +
                        " C=" + previousDayClose.ToString("F2"));
                }

                ResetDailyState();
                currentDate = barTime.Date;

                // Initialize current day tracking
                currentDayOpen = Open[0];
                currentDayHigh = High[0];
                currentDayLow = Low[0];
                currentDayClose = Close[0];

                if (EnableDebug) Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
            }
            else
            {
                // Update current day OHLC
                currentDayHigh = Math.Max(currentDayHigh, High[0]);
                currentDayLow = Math.Min(currentDayLow, Low[0]);
                currentDayClose = Close[0];
            }

            // Time window checks - STRICT enforcement
            isInTradingSession = hour >= TradeStartHour && hour < TradeEndHour;
            bool inPMSession = hour >= PMSessionStartHour && hour < PMSessionEndHour;
            bool inActiveSession = hour >= TradeStartHour && hour < SessionEndHour;

            // Skip PM session if configured
            if (AvoidPMSession && inPMSession)
            {
                ManagePosition();
                return;
            }

            // Update Premium/Discount zones
            UpdatePremiumDiscountZones();

            // Update swing points for HTF level identification
            UpdateSwingPoints();

            //==============================================================================
            // STATE MACHINE
            //==============================================================================
            switch (currentState)
            {
                case StrategyState.WAITING_FOR_SESSION:
                    HandleWaitingForSession(isInTradingSession);
                    break;

                case StrategyState.SCANNING_FOR_HTF_LEVEL:
                    HandleScanningForHTFLevel();
                    break;

                case StrategyState.WAITING_FOR_SWEEP:
                    HandleWaitingForSweep();
                    break;
                    
                case StrategyState.WAITING_FOR_CISD:
                    HandleWaitingForCISD();
                    break;

                case StrategyState.WAITING_FOR_OB_RETURN:
                    HandleWaitingForOBReturn();
                    break;

                case StrategyState.ENTRY_TRIGGERED:
                    HandleEntryTriggered();
                    break;

                case StrategyState.MANAGING_TRADE:
                    HandleManagingTrade();
                    break;

                case StrategyState.TRADE_COMPLETE:
                    HandleTradeComplete(isInTradingSession);
                    break;
            }

            // Always manage position if in trade
            ManagePosition();

            // Exit positions outside session
            if (!inActiveSession && Position.MarketPosition != MarketPosition.Flat)
            {
                if (Position.MarketPosition == MarketPosition.Long) ExitLong();
                else ExitShort();
            }
        }

        #region State Machine Handlers

        /// <summary>
        /// Handle Higher Timeframe bar updates (H1 or M30) for sweep detection
        /// </summary>
        private void HandleHTFTimeframe()
        {
            // Determine which TF pair this is
            bool isH1 = (BarsInProgress == 1);
            bool isM30 = (BarsInProgress == 2);
            
            // Check if this TF pair is enabled
            if (isH1 && TimeframePair == MTFMode.M30_M3) return;
            if (isM30 && TimeframePair == MTFMode.H1_M5) return;
            
            // Only scan for sweeps when we're in the right state
            if (currentState != StrategyState.WAITING_FOR_SWEEP && 
                currentState != StrategyState.SCANNING_FOR_HTF_LEVEL) return;
            
            int tfBarsInProgress = BarsInProgress;
            double htfHigh = Highs[tfBarsInProgress][0];
            double htfLow = Lows[tfBarsInProgress][0];
            double htfClose = Closes[tfBarsInProgress][0];
            double htfOpen = Opens[tfBarsInProgress][0];
            
            // Update HTF swing points using this timeframe's bars
            double highestHigh = 0;
            double lowestLow = double.MaxValue;
            
            for (int i = 1; i <= SwingLookback && i < CurrentBars[tfBarsInProgress]; i++)
            {
                if (Highs[tfBarsInProgress][i] > highestHigh)
                    highestHigh = Highs[tfBarsInProgress][i];
                if (Lows[tfBarsInProgress][i] < lowestLow)
                    lowestLow = Lows[tfBarsInProgress][i];
            }
            
            htfSwingHigh = highestHigh;
            htfSwingLow = lowestLow;
            htfLevelIdentified = true;
            
            // Check Premium/Discount filter
            bool allowLong = !UsePremiumDiscountFilter || !inPremiumZone;
            bool allowShort = !UsePremiumDiscountFilter || !inDiscountZone;
            
            // Detect sweep of HTF low (bullish setup)
            if (allowLong && htfLow < htfSwingLow - (SweepThresholdTicks * TickSize))
            {
                if (htfClose > htfSwingLow)  // Wick below but close above = sweep
                {
                    sweepDetected = true;
                    sweepPrice = htfLow;
                    sweepBar = CurrentBars[0];  // Primary TF bar
                    sweepDirection = 1;  // Bullish
                    sweptLevel = htfSwingLow;
                    activeSweepTF = tfBarsInProgress;
                    activeOBTF = isH1 ? 0 : 3;  // H1 sweep → M5 OB, M30 sweep → M3 OB
                    
                    // Store the CISD candle info (the bearish candle that made the sweep)
                    cisdCandleOpen = htfOpen;
                    cisdCandleBar = CurrentBars[0];
                    cisdConfirmed = false;
                    
                    if (EnableDebug) Print(Times[0][0].ToString("HH:mm") + " | HTF SWEEP LOW on " + 
                        (isH1 ? "H1" : "M30") + " @ " + sweepPrice.ToString("F2"));
                    
                    if (RequireCISD)
                    {
                        currentState = StrategyState.WAITING_FOR_CISD;
                        if (EnableDebug) Print(Times[0][0].ToString("HH:mm") + " | STATE: WAITING_FOR_CISD");
                    }
                    else
                    {
                        FindOrderBlock(sweepDirection);
                        currentState = StrategyState.WAITING_FOR_OB_RETURN;
                    }
                }
            }
            
            // Detect sweep of HTF high (bearish setup)
            if (allowShort && htfHigh > htfSwingHigh + (SweepThresholdTicks * TickSize))
            {
                if (htfClose < htfSwingHigh)  // Wick above but close below = sweep
                {
                    sweepDetected = true;
                    sweepPrice = htfHigh;
                    sweepBar = CurrentBars[0];
                    sweepDirection = -1;  // Bearish
                    sweptLevel = htfSwingHigh;
                    activeSweepTF = tfBarsInProgress;
                    activeOBTF = isH1 ? 0 : 3;
                    
                    // Store the CISD candle info (the bullish candle that made the sweep)
                    cisdCandleOpen = htfOpen;
                    cisdCandleBar = CurrentBars[0];
                    cisdConfirmed = false;
                    
                    if (EnableDebug) Print(Times[0][0].ToString("HH:mm") + " | HTF SWEEP HIGH on " + 
                        (isH1 ? "H1" : "M30") + " @ " + sweepPrice.ToString("F2"));
                    
                    if (RequireCISD)
                    {
                        currentState = StrategyState.WAITING_FOR_CISD;
                        if (EnableDebug) Print(Times[0][0].ToString("HH:mm") + " | STATE: WAITING_FOR_CISD");
                    }
                    else
                    {
                        FindOrderBlock(sweepDirection);
                        currentState = StrategyState.WAITING_FOR_OB_RETURN;
                    }
                }
            }
        }
        
        /// <summary>
        /// Wait for Change in State of Delivery before proceeding to OB entry
        /// </summary>
        private void HandleWaitingForCISD()
        {
            // STRICT SESSION FILTER
            if (!isInTradingSession)
            {
                if (EnableDebug) Print(Times[BarsInProgress][0].ToString("HH:mm") + " | Outside session, resetting");
                ResetSweepState();
                currentState = StrategyState.WAITING_FOR_SESSION;
                return;
            }
            
            int obTF = activeOBTF;  // 0 = M5, 3 = M3
            double ltfClose = Closes[obTF][0];
            
            // For bullish (sweep low): CISD = close > bearish candle open
            if (sweepDirection == 1)
            {
                if (ltfClose > cisdCandleOpen)
                {
                    cisdConfirmed = true;
                    if (EnableDebug) Print(Times[obTF][0].ToString("HH:mm") + " | CISD CONFIRMED (Bullish) | Close " + 
                        ltfClose.ToString("F2") + " > " + cisdCandleOpen.ToString("F2"));
                    
                    FindOrderBlock(sweepDirection);
                    currentState = StrategyState.WAITING_FOR_OB_RETURN;
                    if (EnableDebug) Print(Times[obTF][0].ToString("HH:mm") + " | STATE: WAITING_FOR_OB_RETURN");
                }
            }
            // For bearish (sweep high): CISD = close < bullish candle open
            else if (sweepDirection == -1)
            {
                if (ltfClose < cisdCandleOpen)
                {
                    cisdConfirmed = true;
                    if (EnableDebug) Print(Times[obTF][0].ToString("HH:mm") + " | CISD CONFIRMED (Bearish) | Close " + 
                        ltfClose.ToString("F2") + " < " + cisdCandleOpen.ToString("F2"));
                    
                    FindOrderBlock(sweepDirection);
                    currentState = StrategyState.WAITING_FOR_OB_RETURN;
                    if (EnableDebug) Print(Times[obTF][0].ToString("HH:mm") + " | STATE: WAITING_FOR_OB_RETURN");
                }
            }
            
            // Timeout: if too many bars pass without CISD, reset
            if (CurrentBars[0] - cisdCandleBar > OBLookback * 3)
            {
                if (EnableDebug) Print(Times[obTF][0].ToString("HH:mm") + " | CISD timeout, resetting");
                ResetSweepState();
                currentState = StrategyState.WAITING_FOR_SWEEP;
            }
        }

        private void HandleWaitingForSession(bool inTradingSession)
        {
            if (inTradingSession && !tradeTaken)
            {
                currentState = StrategyState.SCANNING_FOR_HTF_LEVEL;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | STATE: SCANNING_FOR_HTF_LEVEL");
            }
        }

        private void HandleScanningForHTFLevel()
        {
            // STRICT SESSION FILTER: Reset if outside trading session
            if (!isInTradingSession)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | Outside trading session, resetting to WAITING_FOR_SESSION");
                currentState = StrategyState.WAITING_FOR_SESSION;
                return;
            }

            // Identify HTF swing highs/lows as potential sweep targets
            if (!htfLevelIdentified)
            {
                // Use the lookback to find significant swing points
                double highestHigh = 0;
                double lowestLow = double.MaxValue;
                int highBar = 0;
                int lowBar = 0;

                for (int i = 1; i <= SwingLookback && i < CurrentBar; i++)
                {
                    if (High[i] > highestHigh)
                    {
                        highestHigh = High[i];
                        highBar = i;
                    }
                    if (Low[i] < lowestLow)
                    {
                        lowestLow = Low[i];
                        lowBar = i;
                    }
                }

                htfSwingHigh = highestHigh;
                htfSwingLow = lowestLow;
                htfSwingHighBar = highBar;
                htfSwingLowBar = lowBar;
                htfLevelIdentified = true;

                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | HTF LEVELS: High=" + htfSwingHigh.ToString("F2") +
                    " Low=" + htfSwingLow.ToString("F2"));

                currentState = StrategyState.WAITING_FOR_SWEEP;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | STATE: WAITING_FOR_SWEEP");
            }
        }

        private void HandleWaitingForSweep()
        {
            // STRICT SESSION FILTER: Reset if outside trading session
            if (!isInTradingSession)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | Outside trading session, resetting to WAITING_FOR_SESSION");
                ResetSweepState();
                currentState = StrategyState.WAITING_FOR_SESSION;
                return;
            }

            // Determine bias-based direction filter
            bool allowLong = dailyBias == BiasType.Bullish || dailyBias == BiasType.Neutral;
            bool allowShort = dailyBias == BiasType.Bearish || dailyBias == BiasType.Neutral;

            // Premium/Discount filter
            if (UsePremiumDiscountFilter)
            {
                // Only long in discount zone (below equilibrium)
                if (inPremiumZone) allowLong = false;
                // Only short in premium zone (above equilibrium)
                if (inDiscountZone) allowShort = false;
            }

            // Check for low sweep (potential long setup)
            if (allowLong && Low[0] < htfSwingLow - (SweepThresholdTicks * TickSize))
            {
                sweepDetected = true;
                sweepPrice = Low[0];
                sweepBar = CurrentBar;
                sweepDirection = 1;  // Bullish sweep
                sweptLevel = htfSwingLow;

                // Find order block (last bearish candle before the sweep)
                FindOrderBlock(1);

                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SWEEP LOW DETECTED @ " + sweepPrice.ToString("F2") +
                    " | Swept Level: " + sweptLevel.ToString("F2"));

                currentState = StrategyState.WAITING_FOR_OB_RETURN;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | STATE: WAITING_FOR_OB_RETURN");
            }

            // Check for high sweep (potential short setup)
            if (allowShort && High[0] > htfSwingHigh + (SweepThresholdTicks * TickSize))
            {
                sweepDetected = true;
                sweepPrice = High[0];
                sweepBar = CurrentBar;
                sweepDirection = -1;  // Bearish sweep
                sweptLevel = htfSwingHigh;

                // Find order block (last bullish candle before the sweep)
                FindOrderBlock(-1);

                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SWEEP HIGH DETECTED @ " + sweepPrice.ToString("F2") +
                    " | Swept Level: " + sweptLevel.ToString("F2"));

                currentState = StrategyState.WAITING_FOR_OB_RETURN;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | STATE: WAITING_FOR_OB_RETURN");
            }
        }

        private void HandleWaitingForOBReturn()
        {
            // STRICT SESSION FILTER: Reset if outside trading session
            if (!isInTradingSession)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | Outside trading session, resetting to WAITING_FOR_SESSION");
                ResetSweepState();
                currentState = StrategyState.WAITING_FOR_SESSION;
                return;
            }

            if (!orderBlockIdentified)
            {
                // If no OB found, reset
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | No valid OB found, resetting");
                currentState = StrategyState.WAITING_FOR_SWEEP;
                return;
            }

            // Calculate OB midpoint for pullback validation
            double obRange = orderBlockHigh - orderBlockLow;
            double obPullbackLevel = orderBlockLow + (obRange * OBPullbackPercent / 100.0);

            // Check if price returned to the Order Block
            if (sweepDirection == 1)  // Bullish setup
            {
                // Price enters bullish OB from above
                if (Low[0] <= orderBlockHigh && Low[0] >= orderBlockLow)
                {
                    priceReturnedToOB = true;

                    // Check if price pulled back at least OBPullbackPercent into OB
                    bool pullbackMet = Low[0] <= obPullbackLevel;

                    // Check if OB is respected (price closes above OB low) AND pullback requirement met
                    if (Close[0] > orderBlockLow && pullbackMet)
                    {
                        obRespected = true;
                        idealEntryPrice = orderBlockHigh;  // Entry at OB high
                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | OB RESPECTED (Bullish) | Pullback to " +
                            Low[0].ToString("F2") + " (needed <= " + obPullbackLevel.ToString("F2") + ") | Entry @ " +
                            idealEntryPrice.ToString("F2"));

                        currentState = StrategyState.ENTRY_TRIGGERED;
                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | STATE: ENTRY_TRIGGERED");
                    }
                    else if (Close[0] > orderBlockLow && !pullbackMet)
                    {
                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | OB touched but pullback insufficient: " +
                            Low[0].ToString("F2") + " > " + obPullbackLevel.ToString("F2") + " (need " + OBPullbackPercent + "%)");
                    }
                }
            }
            else if (sweepDirection == -1)  // Bearish setup
            {
                // Price enters bearish OB from below
                if (High[0] >= orderBlockLow && High[0] <= orderBlockHigh)
                {
                    priceReturnedToOB = true;

                    // For shorts, pullback means price goes UP into OB (above pullback level)
                    double obPullbackLevelShort = orderBlockHigh - (obRange * OBPullbackPercent / 100.0);
                    bool pullbackMet = High[0] >= obPullbackLevelShort;

                    // Check if OB is respected (price closes below OB high) AND pullback requirement met
                    if (Close[0] < orderBlockHigh && pullbackMet)
                    {
                        obRespected = true;
                        idealEntryPrice = orderBlockLow;  // Entry at OB low
                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | OB RESPECTED (Bearish) | Pullback to " +
                            High[0].ToString("F2") + " (needed >= " + obPullbackLevelShort.ToString("F2") + ") | Entry @ " +
                            idealEntryPrice.ToString("F2"));

                        currentState = StrategyState.ENTRY_TRIGGERED;
                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | STATE: ENTRY_TRIGGERED");
                    }
                    else if (Close[0] < orderBlockHigh && !pullbackMet)
                    {
                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | OB touched but pullback insufficient: " +
                            High[0].ToString("F2") + " < " + obPullbackLevelShort.ToString("F2") + " (need " + OBPullbackPercent + "%)");
                    }
                }
            }

            // Timeout: if too many bars pass without OB return, reset
            if (CurrentBar - sweepBar > OBLookback * 2)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | OB return timeout, resetting");
                ResetSweepState();
                currentState = StrategyState.WAITING_FOR_SWEEP;
            }
        }

        private void HandleEntryTriggered()
        {
            // STRICT SESSION FILTER: Final safety check before entry
            if (!isInTradingSession)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | BLOCKED ENTRY: Outside trading session");
                ResetSweepState();
                currentState = StrategyState.WAITING_FOR_SESSION;
                return;
            }

            if (tradeTaken || Position.MarketPosition != MarketPosition.Flat)
            {
                currentState = StrategyState.MANAGING_TRADE;
                return;
            }

            // Entry at OPEN of NEXT candle after OB confirmed
            tradeDirection = sweepDirection;

            // Stop loss at the swept swing high/low
            if (tradeDirection == 1)
            {
                stopLoss = sweepPrice - (StopBufferTicks * TickSize);
            }
            else
            {
                stopLoss = sweepPrice + (StopBufferTicks * TickSize);
            }

            // Calculate risk distance
            double riskDistance = Math.Abs(Close[0] - stopLoss);
            double riskDistanceTicks = riskDistance / TickSize;

            // Validate stop loss distance
            if (riskDistanceTicks > MaxStopLossTicks || riskDistanceTicks <= 0)
            {
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP: Stop distance " +
                    riskDistanceTicks.ToString("F0") + " ticks exceeds max " + MaxStopLossTicks);
                ResetSweepState();
                currentState = StrategyState.WAITING_FOR_SWEEP;
                return;
            }

            // Calculate 2R target from IDEAL entry level (per SAD specification)
            double idealRisk = Math.Abs(idealEntryPrice - stopLoss);

            if (tradeDirection == 1)
            {
                // Long: Target = Ideal Entry + (2 * Risk from ideal entry)
                takeProfit = idealEntryPrice + (TargetRMultiple * idealRisk);

                // Direction validation: target MUST be above entry
                if (takeProfit <= Close[0])
                {
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP LONG: Target " +
                        takeProfit.ToString("F2") + " <= Entry " + Close[0].ToString("F2"));
                    ResetSweepState();
                    currentState = StrategyState.WAITING_FOR_SWEEP;
                    return;
                }
            }
            else
            {
                // Short: Target = Ideal Entry - (2 * Risk from ideal entry)
                takeProfit = idealEntryPrice - (TargetRMultiple * idealRisk);

                // Direction validation: target MUST be below entry
                if (takeProfit >= Close[0])
                {
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | SKIP SHORT: Target " +
                        takeProfit.ToString("F2") + " >= Entry " + Close[0].ToString("F2"));
                    ResetSweepState();
                    currentState = StrategyState.WAITING_FOR_SWEEP;
                    return;
                }
            }

            entryPrice = Close[0];
            breakevenSet = false;
            tradeTaken = true;
            barsInConsolidation = 0;

            if (tradeDirection == 1)
            {
                activeOrderName = "LumiLong";
                EnterLong(activeOrderName);
                Print(">>> LONG @ " + entryPrice.ToString("F2") + " SL:" + stopLoss.ToString("F2") +
                    " TP:" + takeProfit.ToString("F2") + " (2R from " + idealEntryPrice.ToString("F2") + ")");
            }
            else
            {
                activeOrderName = "LumiShort";
                EnterShort(activeOrderName);
                Print(">>> SHORT @ " + entryPrice.ToString("F2") + " SL:" + stopLoss.ToString("F2") +
                    " TP:" + takeProfit.ToString("F2") + " (2R from " + idealEntryPrice.ToString("F2") + ")");
            }

            currentState = StrategyState.MANAGING_TRADE;
            if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | STATE: MANAGING_TRADE");
        }

        private void HandleManagingTrade()
        {
            if (Position.MarketPosition == MarketPosition.Flat)
            {
                currentState = StrategyState.TRADE_COMPLETE;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | STATE: TRADE_COMPLETE");
                return;
            }

            // V3: Partial profits at 1R
            ManagePartialProfits();

            // Breakeven management (now at 1R to match partial timing)
            ManageBreakeven();

            // V3: Trail runner using protected swings
            TrailStopToSwing();

            // Consolidation detection (cut trade early if no follow-through)
            if (CutOnConsolidation)
            {
                CheckConsolidation();
            }
        }

        private void HandleTradeComplete(bool inTradingSession)
        {
            // Reset for next opportunity
            ResetSweepState();

            if (inTradingSession && !tradeTaken)
            {
                // Still in session, look for new setup
                currentState = StrategyState.SCANNING_FOR_HTF_LEVEL;
            }
            else
            {
                currentState = StrategyState.WAITING_FOR_SESSION;
            }
        }

        #endregion

        #region Helper Methods

        private void FindOrderBlock(int direction)
        {
            orderBlockIdentified = false;

            // Look back to find the last opposing candle before the sweep
            for (int i = 1; i <= OBLookback && i < CurrentBar; i++)
            {
                if (direction == 1)  // Looking for bearish OB (last down candle before sweep low)
                {
                    if (Close[i] < Open[i])  // Bearish candle
                    {
                        orderBlockHigh = High[i];
                        orderBlockLow = Low[i];
                        orderBlockBar = CurrentBar - i;
                        orderBlockIdentified = true;

                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | BULLISH OB FOUND: " +
                            orderBlockLow.ToString("F2") + " - " + orderBlockHigh.ToString("F2"));
                        break;
                    }
                }
                else  // Looking for bullish OB (last up candle before sweep high)
                {
                    if (Close[i] > Open[i])  // Bullish candle
                    {
                        orderBlockHigh = High[i];
                        orderBlockLow = Low[i];
                        orderBlockBar = CurrentBar - i;
                        orderBlockIdentified = true;

                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | BEARISH OB FOUND: " +
                            orderBlockLow.ToString("F2") + " - " + orderBlockHigh.ToString("F2"));
                        break;
                    }
                }
            }
        }

        private void UpdateSwingPoints()
        {
            // Detect swing highs/lows using simple 3-bar pattern
            if (CurrentBar >= 3)
            {
                // Swing high: bar[1] higher than neighbors
                if (High[1] > High[2] && High[1] > High[0])
                {
                    if (recentSwingHighs.Count >= 10) recentSwingHighs.RemoveAt(0);
                    recentSwingHighs.Add(High[1]);
                }

                // Swing low: bar[1] lower than neighbors
                if (Low[1] < Low[2] && Low[1] < Low[0])
                {
                    if (recentSwingLows.Count >= 10) recentSwingLows.RemoveAt(0);
                    recentSwingLows.Add(Low[1]);
                }
            }
        }

        private void UpdatePremiumDiscountZones()
        {
            if (previousDayHigh > 0 && previousDayLow > 0)
            {
                dailyRangeHigh = previousDayHigh;
                dailyRangeLow = previousDayLow;
                equilibrium = dailyRangeLow + ((dailyRangeHigh - dailyRangeLow) * (EquilibriumPercent / 100.0));

                inPremiumZone = Close[0] > equilibrium;
                inDiscountZone = Close[0] < equilibrium;
            }
        }

        private void CheckConsolidation()
        {
            if (Position.MarketPosition == MarketPosition.Flat) return;

            // Track consolidation range
            if (barsInConsolidation == 0)
            {
                consolidationHigh = High[0];
                consolidationLow = Low[0];
            }
            else
            {
                consolidationHigh = Math.Max(consolidationHigh, High[0]);
                consolidationLow = Math.Min(consolidationLow, Low[0]);
            }

            double consolidationRange = (consolidationHigh - consolidationLow) / TickSize;

            // Check if price is chopping in a small range
            if (consolidationRange <= ConsolidationThresholdTicks)
            {
                barsInConsolidation++;

                if (barsInConsolidation >= ConsolidationBars)
                {
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | CONSOLIDATION CUT: " +
                        barsInConsolidation + " bars in " + consolidationRange.ToString("F0") + " tick range");

                    // Cut the trade
                    if (Position.MarketPosition == MarketPosition.Long)
                        ExitLong("ConsolidationExit", activeOrderName);
                    else if (Position.MarketPosition == MarketPosition.Short)
                        ExitShort("ConsolidationExit", activeOrderName);
                }
            }
            else
            {
                // Range expanded, reset consolidation counter
                barsInConsolidation = 0;
            }
        }

        private void ManageBreakeven()
        {
            if (!UseBreakeven) return;
            if (Position.MarketPosition == MarketPosition.Flat) { breakevenSet = false; return; }
            if (breakevenSet) return;

            double profit = Position.MarketPosition == MarketPosition.Long
                ? Close[0] - Position.AveragePrice : Position.AveragePrice - Close[0];

            double currentRiskAmount = Math.Abs(Position.AveragePrice - stopLoss);
            double profitR = currentRiskAmount > 0 ? profit / currentRiskAmount : 0;

            if (profitR >= BreakevenTriggerR)
            {
                breakevenSet = true;
                SetStopLoss(activeOrderName, CalculationMode.Price, Position.AveragePrice, false);
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | BREAKEVEN SET @ " + Position.AveragePrice.ToString("F2") +
                    " (Profit: " + profitR.ToString("F2") + "R)");
            }
        }

        /// <summary>
        /// V3: Take partial profits at specified R-multiple
        /// </summary>
        private void ManagePartialProfits()
        {
            if (!UsePartialProfits) return;
            if (Position.MarketPosition == MarketPosition.Flat) return;
            if (partialTaken) return;  // Already took partial
            if (Position.Quantity <= 1) return;  // Need at least 2 contracts for partials

            double profit = Position.MarketPosition == MarketPosition.Long
                ? Close[0] - Position.AveragePrice : Position.AveragePrice - Close[0];

            double profitR = riskAmount > 0 ? profit / riskAmount : 0;

            if (profitR >= PartialTargetR)
            {
                // Calculate partial quantity
                int partialQty = (int)Math.Floor(Position.Quantity * PartialPercent / 100.0);
                if (partialQty < 1) partialQty = 1;

                // Take partial profit
                if (Position.MarketPosition == MarketPosition.Long)
                {
                    ExitLong(partialQty, "PartialProfit", activeOrderName);
                }
                else
                {
                    ExitShort(partialQty, "PartialProfit", activeOrderName);
                }

                partialTaken = true;
                if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | PARTIAL PROFIT: " + partialQty + " contracts @ " +
                    profitR.ToString("F2") + "R | Runner: " + (Position.Quantity - partialQty) + " contracts");
            }
        }

        /// <summary>
        /// V3: Trail stop using protected swing structure (TTrades Skill #12)
        /// </summary>
        private void TrailStopToSwing()
        {
            if (!UseTrailingStop) return;
            if (Position.MarketPosition == MarketPosition.Flat) return;
            if (!partialTaken) return;  // Only trail after partial taken

            // Find recent swing for trailing
            double newSwingLevel = 0;

            if (Position.MarketPosition == MarketPosition.Long)
            {
                // Find recent swing low for long position
                double lowestSwingLow = double.MaxValue;
                for (int i = 1; i <= TrailingSwingLookback && i < CurrentBar; i++)
                {
                    // Simple swing low: bar lower than neighbors
                    if (i >= 2 && Low[i] < Low[i - 1] && Low[i] < Low[i + 1])
                    {
                        if (Low[i] < lowestSwingLow && Low[i] > Position.AveragePrice)
                        {
                            lowestSwingLow = Low[i];
                        }
                    }
                }

                if (lowestSwingLow < double.MaxValue)
                {
                    newSwingLevel = lowestSwingLow - (StopBufferTicks * TickSize);

                    // Only trail UP, never down
                    if (newSwingLevel > trailingSwingLevel && newSwingLevel > stopLoss)
                    {
                        trailingSwingLevel = newSwingLevel;
                        SetStopLoss(activeOrderName, CalculationMode.Price, trailingSwingLevel, false);
                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | TRAILING STOP: Moved to " +
                            trailingSwingLevel.ToString("F2") + " (swing low @ " + lowestSwingLow.ToString("F2") + ")");
                    }
                }
            }
            else  // Short position
            {
                // Find recent swing high for short position
                double highestSwingHigh = 0;
                for (int i = 1; i <= TrailingSwingLookback && i < CurrentBar; i++)
                {
                    // Simple swing high: bar higher than neighbors
                    if (i >= 2 && High[i] > High[i - 1] && High[i] > High[i + 1])
                    {
                        if (High[i] > highestSwingHigh && High[i] < Position.AveragePrice)
                        {
                            highestSwingHigh = High[i];
                        }
                    }
                }

                if (highestSwingHigh > 0)
                {
                    newSwingLevel = highestSwingHigh + (StopBufferTicks * TickSize);

                    // Only trail DOWN, never up
                    if ((trailingSwingLevel == 0 || newSwingLevel < trailingSwingLevel) && newSwingLevel < stopLoss)
                    {
                        trailingSwingLevel = newSwingLevel;
                        SetStopLoss(activeOrderName, CalculationMode.Price, trailingSwingLevel, false);
                        if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | TRAILING STOP: Moved to " +
                            trailingSwingLevel.ToString("F2") + " (swing high @ " + highestSwingHigh.ToString("F2") + ")");
                    }
                }
            }
        }

        private void ManagePosition()
        {
            if (Position.MarketPosition == MarketPosition.Flat) return;
            ManageBreakeven();
        }

        private void ResetSweepState()
        {
            sweepDetected = false;
            sweepPrice = 0;
            sweepBar = 0;
            sweepDirection = 0;
            sweptLevel = 0;

            orderBlockHigh = 0;
            orderBlockLow = 0;
            orderBlockBar = 0;
            orderBlockIdentified = false;
            priceReturnedToOB = false;
            obRespected = false;

            htfLevelIdentified = false;
            idealEntryPrice = 0;
            
            // Reset CISD state
            cisdConfirmed = false;
            cisdCandleOpen = 0;
            cisdCandleBar = 0;
            
            // Reset active TF tracking
            activeSweepTF = 0;
            activeOBTF = 0;
        }

        private void ResetDailyState()
        {
            // State machine reset
            currentState = StrategyState.WAITING_FOR_SESSION;

            // Core reset
            tradeDirection = 0;
            entryPrice = 0;
            stopLoss = 0;
            takeProfit = 0;
            idealEntryPrice = 0;
            tradeTaken = false;
            activeOrderName = "";
            breakevenSet = false;
            dailyBias = BiasType.Neutral;

            // HTF level reset
            htfSwingHigh = 0;
            htfSwingLow = 0;
            htfSwingHighBar = 0;
            htfSwingLowBar = 0;
            htfLevelIdentified = false;

            // Sweep state reset
            ResetSweepState();

            // Premium/Discount reset
            dailyRangeHigh = 0;
            dailyRangeLow = 0;
            equilibrium = 0;
            inPremiumZone = false;
            inDiscountZone = false;

            // Trade management reset
            barsInConsolidation = 0;
            consolidationHigh = 0;
            consolidationLow = 0;
            lastClosePrice = 0;

            // V3 Trade Management reset
            partialTaken = false;
            initialQuantity = 0;
            riskAmount = 0;
            trailingSwingLevel = 0;

            // Clear swing point lists
            if (recentSwingHighs != null) recentSwingHighs.Clear();
            if (recentSwingLows != null) recentSwingLows.Clear();
        }

        #endregion

        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            if (marketPosition == MarketPosition.Long || marketPosition == MarketPosition.Short)
            {
                // Store initial quantity and risk for V3 trade management
                if (execution.Order.Name == activeOrderName)
                {
                    initialQuantity = quantity;
                    riskAmount = Math.Abs(price - stopLoss);
                    partialTaken = false;
                    trailingSwingLevel = 0;
                    
                    if (EnableDebug) Print(Time[0].ToString("HH:mm") + " | ENTRY: " + quantity + " contracts | Risk: " + 
                        riskAmount.ToString("F2") + " ($" + (riskAmount * 50 * quantity).ToString("F0") + ")");
                }
                
                SetStopLoss(execution.Order.Name, CalculationMode.Price, stopLoss, false);
                SetProfitTarget(execution.Order.Name, CalculationMode.Price, takeProfit);
            }
        }

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            if (marketPosition == MarketPosition.Flat)
            {
                breakevenSet = false;
                barsInConsolidation = 0;
                
                // V3: Reset trade management state
                partialTaken = false;
                initialQuantity = 0;
                riskAmount = 0;
                trailingSwingLevel = 0;
                
                currentState = StrategyState.TRADE_COMPLETE;
            }
        }

        #region Properties

        // Time Settings
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Trade Start Hour (EST)", Order = 1, GroupName = "1. Time Settings")]
        public int TradeStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Trade End Hour (EST)", Order = 2, GroupName = "1. Time Settings")]
        public int TradeEndHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "PM Session Start Hour", Order = 3, GroupName = "1. Time Settings")]
        public int PMSessionStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "PM Session End Hour", Order = 4, GroupName = "1. Time Settings")]
        public int PMSessionEndHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Session End Hour", Order = 5, GroupName = "1. Time Settings")]
        public int SessionEndHour { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Avoid PM Session", Order = 6, GroupName = "1. Time Settings")]
        public bool AvoidPMSession { get; set; }

        // Sweep Detection
        [NinjaScriptProperty]
        [Range(5, 100)]
        [Display(Name = "Swing Lookback Bars", Order = 1, GroupName = "2. Sweep Detection")]
        public int SwingLookback { get; set; }

        [NinjaScriptProperty]
        [Range(0, 20)]
        [Display(Name = "Sweep Threshold (Ticks)", Order = 2, GroupName = "2. Sweep Detection")]
        public double SweepThresholdTicks { get; set; }

        // Order Block
        [NinjaScriptProperty]
        [Range(3, 50)]
        [Display(Name = "OB Lookback Bars", Order = 1, GroupName = "3. Order Block")]
        public int OBLookback { get; set; }

        [NinjaScriptProperty]
        [Range(0, 10)]
        [Display(Name = "OB Entry Buffer (Ticks)", Order = 2, GroupName = "3. Order Block")]
        public int OBEntryBuffer { get; set; }

        [NinjaScriptProperty]
        [Range(0, 100)]
        [Display(Name = "OB Pullback % Required", Order = 3, GroupName = "3. Order Block")]
        public double OBPullbackPercent { get; set; }

        // Risk Management
        [NinjaScriptProperty]
        [Range(1.0, 5.0)]
        [Display(Name = "Target R-Multiple", Order = 1, GroupName = "4. Risk Management")]
        public double TargetRMultiple { get; set; }

        [NinjaScriptProperty]
        [Range(10, 500)]
        [Display(Name = "Max Stop Loss (Ticks)", Order = 2, GroupName = "4. Risk Management")]
        public int MaxStopLossTicks { get; set; }

        [NinjaScriptProperty]
        [Range(0, 20)]
        [Display(Name = "Stop Buffer (Ticks)", Order = 3, GroupName = "4. Risk Management")]
        public int StopBufferTicks { get; set; }

        // Trade Management
        [NinjaScriptProperty]
        [Display(Name = "Use Breakeven", Order = 1, GroupName = "5. Trade Management")]
        public bool UseBreakeven { get; set; }

        [NinjaScriptProperty]
        [Range(0.5, 2.0)]
        [Display(Name = "Breakeven Trigger (R)", Order = 2, GroupName = "5. Trade Management")]
        public double BreakevenTriggerR { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Cut On Consolidation", Order = 3, GroupName = "5. Trade Management")]
        public bool CutOnConsolidation { get; set; }

        [NinjaScriptProperty]
        [Range(3, 20)]
        [Display(Name = "Consolidation Bars", Order = 4, GroupName = "5. Trade Management")]
        public int ConsolidationBars { get; set; }

        [NinjaScriptProperty]
        [Range(5, 50)]
        [Display(Name = "Consolidation Threshold (Ticks)", Order = 5, GroupName = "5. Trade Management")]
        public int ConsolidationThresholdTicks { get; set; }

        // Filters
        [NinjaScriptProperty]
        [Display(Name = "Use Premium/Discount Filter", Order = 1, GroupName = "6. Filters")]
        public bool UsePremiumDiscountFilter { get; set; }

        [NinjaScriptProperty]
        [Range(40, 60)]
        [Display(Name = "Equilibrium Percent", Order = 2, GroupName = "6. Filters")]
        public double EquilibriumPercent { get; set; }

        // Multi-Timeframe Settings
        [NinjaScriptProperty]
        [Display(Name = "Timeframe Pair", Order = 1, GroupName = "6. Multi-Timeframe")]
        public MTFMode TimeframePair { get; set; }
        
        [NinjaScriptProperty]
        [Display(Name = "Require CISD Confirmation", Order = 2, GroupName = "6. Multi-Timeframe")]
        public bool RequireCISD { get; set; }

        // V3 Trade Management: Partial Profits
        [NinjaScriptProperty]
        [Display(Name = "Use Partial Profits", Order = 1, GroupName = "7. V3 Trade Management")]
        public bool UsePartialProfits { get; set; }

        [NinjaScriptProperty]
        [Range(10, 90)]
        [Display(Name = "Partial Profit %", Order = 2, GroupName = "7. V3 Trade Management")]
        public int PartialPercent { get; set; }

        [NinjaScriptProperty]
        [Range(0.5, 3.0)]
        [Display(Name = "Partial Target (R)", Order = 3, GroupName = "7. V3 Trade Management")]
        public double PartialTargetR { get; set; }

        // V3 Trade Management: Trailing Stop
        [NinjaScriptProperty]
        [Display(Name = "Use Trailing Stop", Order = 4, GroupName = "7. V3 Trade Management")]
        public bool UseTrailingStop { get; set; }

        [NinjaScriptProperty]
        [Range(3, 20)]
        [Display(Name = "Trailing Swing Lookback", Order = 5, GroupName = "7. V3 Trade Management")]
        public int TrailingSwingLookback { get; set; }
        
        // Debug
        [NinjaScriptProperty]
        [Display(Name = "Enable Debug Output", Order = 1, GroupName = "8. Debug")]
        public bool EnableDebug { get; set; }

        #endregion
    }
}

#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

// Source: https://youtu.be/tyoxl1l-6iI
// Generated: 2026-01-01 23:30
// Skills Used: 64, 66, 65, 82

namespace NinjaTrader.NinjaScript.Strategies
{
    public class Candle2ClosureStrategy : Strategy
    {
        #region State Enum
        public enum StrategyState
{
    WAITING_FOR_SESSION,
    SCANNING_FOR_CONTEXT,
    MANAGING_EXIT,
    MANAGING_RISK,
    MANAGING_TRADE,
    TRADE_COMPLETE
}
        #endregion

        #region Variables
        private StrategyState currentState;
private int tradeDirection;  // 1 = long, -1 = short
private double entryPrice;
private double stopLoss;
private double takeProfit;
private bool tradeTaken;
        #endregion

        #region Parameters
        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Trade Start Hour", Order = 1, GroupName = "Time Settings")]
        public int TradeStartHour { get; set; }

        [NinjaScriptProperty]
        [Range(0, 23)]
        [Display(Name = "Trade End Hour", Order = 2, GroupName = "Time Settings")]
        public int TradeEndHour { get; set; }

        [NinjaScriptProperty]
        [Range(1, 10)]
        [Display(Name = "Target R Multiple", Order = 3, GroupName = "Risk Settings")]
        public double TargetRMultiple { get; set; }
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "Strategy generated from video analysis";
                Name = "Candle2ClosureStrategy";
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
                TraceOrders = false;
                RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade = 20;

                // Default parameter values
                TradeStartHour = 9;
                TradeEndHour = 16;
                TargetRMultiple = 2.0;
            }
            else if (State == State.Configure)
            {
                // Add additional data series if needed
            }
            else if (State == State.DataLoaded)
            {
                ResetDailyState();
            }
        }

        protected override void OnBarUpdate()
{
    if (CurrentBar < 20) return;

    switch (currentState)
    {
            case StrategyState.WAITING_FOR_SESSION:
    if (IsInTradingSession())
    {
        currentState = StrategyState.SCANNING_FOR_CONTEXT;
    }
    break;

            case StrategyState.SCANNING_FOR_CONTEXT:
    // TODO: Implement
    break;

            case StrategyState.MANAGING_EXIT:
    // No skills matched for this state
    break;

            case StrategyState.MANAGING_RISK:
    // No skills matched for this state
    break;

            case StrategyState.MANAGING_TRADE:
    // No skills matched for this state
    break;

            case StrategyState.TRADE_COMPLETE:
    if (Position.MarketPosition == MarketPosition.Flat)
    {
        currentState = StrategyState.WAITING_FOR_SESSION;
        tradeTaken = false;
    }
    break;
    }
}

        #region Helper Methods
        private bool IsInTradingSession()
{
    int hour = Time[0].Hour;
    return hour >= TradeStartHour && hour < TradeEndHour;
}

private void TriggerEntry(int direction)
{
    tradeDirection = direction;

    if (direction == 1)
    {
        EnterLong("Long Entry");
    }
    else
    {
        EnterShort("Short Entry");
    }

    currentState = StrategyState.MANAGING_TRADE;
    tradeTaken = true;
}

private void ResetDailyState()
{
    currentState = StrategyState.WAITING_FOR_SESSION;
    tradeTaken = false;
    tradeDirection = 0;
    entryPrice = 0;
    stopLoss = 0;
    takeProfit = 0;
}
        #endregion
    }
}

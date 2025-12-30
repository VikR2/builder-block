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
    public class {ClassName} : Strategy
    {
        #region Enums
        {Enums}
        #endregion

        #region Variables
        {Variables}

        // Tracking
        private DateTime currentDate;
        private string activeOrderName;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"{Description}";
                Name = "{ClassName}";

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

                {DefaultParameters}

                // Debug
                EnableDebug = true;
            }
            else if (State == State.DataLoaded)
            {
                ClearOutputWindow();
                Print("========================================");
                Print("{ClassName} LOADED");
                Print("Instrument: " + Instrument.FullName);
                Print("TickSize: " + TickSize);
                Print("========================================");
            }
            else if (State == State.Realtime)
            {
                Print("NOW IN REALTIME MODE");
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < BarsRequiredToTrade)
                return;

            // Real-time: only process on bar close
            if (State == State.Realtime && IsFirstTickOfBar == false)
                return;

            DateTime barTime = Time[0];
            int hour = barTime.Hour;
            int minute = barTime.Minute;
            int currentMins = hour * 60 + minute;

            // New day reset
            if (barTime.Date != currentDate)
            {
                ResetDailyState();
                currentDate = barTime.Date;
                if (EnableDebug)
                    Print("=== NEW DAY: " + currentDate.ToString("yyyy-MM-dd") + " ===");
            }

            {TimeWindowCalculations}

            {BiasLogic}

            {SetupLogic}

            {EntryLogic}
        }

        {HelperMethods}

        //==============================================================================
        // ORDER/EXECUTION HANDLERS
        //==============================================================================
        protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity, MarketPosition marketPosition, string orderId, DateTime time)
        {
            if (EnableDebug)
                Print(time.ToString("HH:mm:ss") + " | FILL: " + execution.Order.Name + " | " + marketPosition + " | Qty:" + quantity + " @ " + price.ToString("F2"));

            {ExecutionHandlerLogic}
        }

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            if (EnableDebug)
                Print("POSITION: " + marketPosition + " | Qty:" + quantity + " @ " + averagePrice.ToString("F2"));

            if (marketPosition == MarketPosition.Flat)
            {
                if (EnableDebug)
                    Print("Position FLAT - Trade complete");
            }
        }

        //==============================================================================
        // DAILY RESET
        //==============================================================================
        private void ResetDailyState()
        {
            {DailyResetLogic}

            activeOrderName = "";
        }

        #region Properties
        {Properties}

        // Debug
        [NinjaScriptProperty]
        [Display(Name = "Enable Debug Output", Order = 99, GroupName = "99. Debug")]
        public bool EnableDebug { get; set; }
        #endregion
    }
}

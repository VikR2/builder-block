//
// OrderBlockIndicator
//
// Generated from YouTube: 
// Generated at: 2025-12-30 15:35:25
//
// Trading concepts detected:
//   keywords: order block, have, continuation, order, block, here
//
// Related skills:
//   - Order Block (Entry Patterns)
//
// NOTE: This is a template. Review and refine the logic before use.
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
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{
    public class OrderBlockIndicator : Indicator
    {
        #region Variables
        // TODO: Add your indicator variables here
        // Example: private Series<double> signalSeries;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description                 = @"Trading concept: order block. t close, which is this same candle here. And then I'm looking to trade this candle for continuation higher. So going down to the 1 minute time frame, I'm looking in here for my entry. I have an SMT as...";
                Name                        = "OrderBlock";
                Calculate                   = Calculate.OnBarClose;
                IsOverlay                   = true;
                DisplayInDataBox            = true;
                DrawOnPricePanel            = true;
                PaintPriceMarkers           = true;
                ScaleJustification          = NinjaTrader.Gui.Chart.ScaleJustification.Right;
                IsSuspendedWhileInactive    = true;

                // Default input parameters
                // TODO: Add your parameters here
                // Example: Period = 14;

                AddPlot(Brushes.DodgerBlue, "Signal");
            }
            else if (State == State.Configure)
            {
                // TODO: Add data series if needed
                // Example: AddDataSeries(BarsPeriodType.Minute, 5);
            }
            else if (State == State.DataLoaded)
            {
                // TODO: Initialize series if needed
                // Example: signalSeries = new Series<double>(this);
            }
        }

        protected override void OnBarUpdate()
        {
            // Wait for enough bars
            if (CurrentBar < 20)
                return;

            // TODO: Implement your indicator logic here
            // Based on detected concepts:
            // keywords:
            //   - order block
            //   - have
            //   - continuation

            // Example calculation (replace with actual logic):
            double signalValue = Close[0];

            // Set the plot value
            Signal[0] = signalValue;
        }

        #region Properties
        [Browsable(false)]
        [XmlIgnore]
        public Series<double> Signal
        {
            get { return Values[0]; }
        }

        // TODO: Add your input parameters here
        // Example:
        // [NinjaScriptProperty]
        // [Range(1, int.MaxValue)]
        // [Display(Name = "Period", Order = 1, GroupName = "Parameters")]
        // public int Period { get; set; }
        #endregion
    }
}

#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{
    public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
    {
        private OrderBlockIndicator[] cacheOrderBlockIndicator;
        public OrderBlockIndicator OrderBlockIndicator()
        {
            return OrderBlockIndicator(Input);
        }

        public OrderBlockIndicator OrderBlockIndicator(ISeries<double> input)
        {
            if (cacheOrderBlockIndicator != null)
                for (int idx = 0; idx < cacheOrderBlockIndicator.Length; idx++)
                    if (cacheOrderBlockIndicator[idx] != null && cacheOrderBlockIndicator[idx].EqualsInput(input))
                        return cacheOrderBlockIndicator[idx];
            return CacheIndicator<OrderBlockIndicator>(new OrderBlockIndicator(), input, ref cacheOrderBlockIndicator);
        }
    }
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
    public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
    {
        public Indicators.OrderBlockIndicator OrderBlockIndicator()
        {
            return indicator.OrderBlockIndicator(Input);
        }

        public Indicators.OrderBlockIndicator OrderBlockIndicator(ISeries<double> input)
        {
            return indicator.OrderBlockIndicator(input);
        }
    }
}

#endregion

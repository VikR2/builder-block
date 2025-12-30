//
// TrendingIndicator
//
// Generated from YouTube: 
// Generated at: 2025-12-30 15:35:25
//
// Trading concepts detected:
//   keywords: trending, higher, creating, protected, swings
//
// Related skills:
//   - Trending (Market Analysis)
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
    public class TrendingIndicator : Indicator
    {
        #region Variables
        // TODO: Add your indicator variables here
        // Example: private Series<double> signalSeries;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description                 = @"Trading concept: trending. rade the body of the higher time frame candle. So, let's get into trading view and go over a few examples of this. So, here we are in our first example. We are on YM on the daily chart. Now, let's fir...";
                Name                        = "Trending";
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
            //   - trending
            //   - higher
            //   - creating

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
        private TrendingIndicator[] cacheTrendingIndicator;
        public TrendingIndicator TrendingIndicator()
        {
            return TrendingIndicator(Input);
        }

        public TrendingIndicator TrendingIndicator(ISeries<double> input)
        {
            if (cacheTrendingIndicator != null)
                for (int idx = 0; idx < cacheTrendingIndicator.Length; idx++)
                    if (cacheTrendingIndicator[idx] != null && cacheTrendingIndicator[idx].EqualsInput(input))
                        return cacheTrendingIndicator[idx];
            return CacheIndicator<TrendingIndicator>(new TrendingIndicator(), input, ref cacheTrendingIndicator);
        }
    }
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
    public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
    {
        public Indicators.TrendingIndicator TrendingIndicator()
        {
            return indicator.TrendingIndicator(Input);
        }

        public Indicators.TrendingIndicator TrendingIndicator(ISeries<double> input)
        {
            return indicator.TrendingIndicator(input);
        }
    }
}

#endregion

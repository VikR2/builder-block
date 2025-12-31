//
// SupportIndicator
//
// Generated from YouTube: 
// Generated at: 2025-12-31 00:31:17
//
// Trading concepts detected:
//   keywords: support, hello, friends, crypto, space, participating
//
// Related skills:
//   - Support (Market Analysis)
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
    public class SupportIndicator : Indicator
    {
        #region Variables
        // TODO: Add your indicator variables here
        // Example: private Series<double> signalSeries;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description                 = @"Trading concept: support. le something at a huge markup can then benefit from the shorts when it's marked down and they build up that accumulation and then they can do it again but this needs to cool off and that's what this w...";
                Name                        = "Support";
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
            //   - support
            //   - hello
            //   - friends

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
        private SupportIndicator[] cacheSupportIndicator;
        public SupportIndicator SupportIndicator()
        {
            return SupportIndicator(Input);
        }

        public SupportIndicator SupportIndicator(ISeries<double> input)
        {
            if (cacheSupportIndicator != null)
                for (int idx = 0; idx < cacheSupportIndicator.Length; idx++)
                    if (cacheSupportIndicator[idx] != null && cacheSupportIndicator[idx].EqualsInput(input))
                        return cacheSupportIndicator[idx];
            return CacheIndicator<SupportIndicator>(new SupportIndicator(), input, ref cacheSupportIndicator);
        }
    }
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
    public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
    {
        public Indicators.SupportIndicator SupportIndicator()
        {
            return indicator.SupportIndicator(Input);
        }

        public Indicators.SupportIndicator SupportIndicator(ISeries<double> input)
        {
            return indicator.SupportIndicator(input);
        }
    }
}

#endregion

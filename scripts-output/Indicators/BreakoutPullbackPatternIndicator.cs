//
// BreakoutPullbackPatternIndicator
//
// Generated from YouTube: 
// Generated at: 2025-12-30 15:35:25
//
// Trading concepts detected:
//   keywords: pullback, retest, continuation pattern, throwback, backtest
//
// Related skills:
//   - Breakout Pullback Pattern (Entry Patterns)
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
    public class BreakoutPullbackPatternIndicator : Indicator
    {
        #region Variables
        // TODO: Add your indicator variables here
        // Example: private Series<double> signalSeries;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description                 = @"After a breakout, waits for price to pull back into the range before continuing in the breakout direction. This provides better entry prices and confirms the breakout is genuine. After pullback, waits for CISD confirmation.";
                Name                        = "BreakoutPullbackPattern";
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
            //   - pullback
            //   - retest
            //   - continuation pattern

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
        private BreakoutPullbackPatternIndicator[] cacheBreakoutPullbackPatternIndicator;
        public BreakoutPullbackPatternIndicator BreakoutPullbackPatternIndicator()
        {
            return BreakoutPullbackPatternIndicator(Input);
        }

        public BreakoutPullbackPatternIndicator BreakoutPullbackPatternIndicator(ISeries<double> input)
        {
            if (cacheBreakoutPullbackPatternIndicator != null)
                for (int idx = 0; idx < cacheBreakoutPullbackPatternIndicator.Length; idx++)
                    if (cacheBreakoutPullbackPatternIndicator[idx] != null && cacheBreakoutPullbackPatternIndicator[idx].EqualsInput(input))
                        return cacheBreakoutPullbackPatternIndicator[idx];
            return CacheIndicator<BreakoutPullbackPatternIndicator>(new BreakoutPullbackPatternIndicator(), input, ref cacheBreakoutPullbackPatternIndicator);
        }
    }
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
    public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
    {
        public Indicators.BreakoutPullbackPatternIndicator BreakoutPullbackPatternIndicator()
        {
            return indicator.BreakoutPullbackPatternIndicator(Input);
        }

        public Indicators.BreakoutPullbackPatternIndicator BreakoutPullbackPatternIndicator(ISeries<double> input)
        {
            return indicator.BreakoutPullbackPatternIndicator(input);
        }
    }
}

#endregion

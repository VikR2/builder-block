//
// PremarketBiasCalculationVwappocIndicator
//
// Generated from YouTube: 
// Generated at: 2025-12-30 15:35:25
//
// Trading concepts detected:
//   keywords: premarket, bias, vwap, poc, point of control, market direction, volume weighted
//
// Related skills:
//   - Pre-market Bias Calculation (VWAP-POC) (Market Analysis)
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
    public class PremarketBiasCalculationVwappocIndicator : Indicator
    {
        #region Variables
        // TODO: Add your indicator variables here
        // Example: private Series<double> signalSeries;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description                 = @"Calculates market directional bias based on pre-market VWAP Point of Control (POC). Tracks high/low during pre-market hours (3-7 AM), calculates volume-weighted average price, and determines if POC is positioned bullish (>55%), bearish (<45%), or neutral.";
                Name                        = "PremarketBiasCalculationVwappoc";
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
            //   - premarket
            //   - bias
            //   - vwap

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
        private PremarketBiasCalculationVwappocIndicator[] cachePremarketBiasCalculationVwappocIndicator;
        public PremarketBiasCalculationVwappocIndicator PremarketBiasCalculationVwappocIndicator()
        {
            return PremarketBiasCalculationVwappocIndicator(Input);
        }

        public PremarketBiasCalculationVwappocIndicator PremarketBiasCalculationVwappocIndicator(ISeries<double> input)
        {
            if (cachePremarketBiasCalculationVwappocIndicator != null)
                for (int idx = 0; idx < cachePremarketBiasCalculationVwappocIndicator.Length; idx++)
                    if (cachePremarketBiasCalculationVwappocIndicator[idx] != null && cachePremarketBiasCalculationVwappocIndicator[idx].EqualsInput(input))
                        return cachePremarketBiasCalculationVwappocIndicator[idx];
            return CacheIndicator<PremarketBiasCalculationVwappocIndicator>(new PremarketBiasCalculationVwappocIndicator(), input, ref cachePremarketBiasCalculationVwappocIndicator);
        }
    }
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
    public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
    {
        public Indicators.PremarketBiasCalculationVwappocIndicator PremarketBiasCalculationVwappocIndicator()
        {
            return indicator.PremarketBiasCalculationVwappocIndicator(Input);
        }

        public Indicators.PremarketBiasCalculationVwappocIndicator PremarketBiasCalculationVwappocIndicator(ISeries<double> input)
        {
            return indicator.PremarketBiasCalculationVwappocIndicator(input);
        }
    }
}

#endregion

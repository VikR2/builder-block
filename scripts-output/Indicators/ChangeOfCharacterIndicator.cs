//
// ChangeOfCharacterIndicator
//
// Generated from YouTube: 
// Generated at: 2025-12-31 00:31:17
//
// Trading concepts detected:
//   keywords: change of character, hello, friends, crypto, space, participating
//
// Related skills:
//   - Change Of Character (Entry Patterns)
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
    public class ChangeOfCharacterIndicator : Indicator
    {
        #region Variables
        // TODO: Add your indicator variables here
        // Example: private Series<double> signalSeries;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description                 = @"Trading concept: change of character. h but that was that show of weakness sign of weakness that forty three thousand dollar price that we hit right here in early march late february and what that does is it it it occurs at or slightly be...";
                Name                        = "ChangeOfCharacter";
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
            //   - change of character
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
        private ChangeOfCharacterIndicator[] cacheChangeOfCharacterIndicator;
        public ChangeOfCharacterIndicator ChangeOfCharacterIndicator()
        {
            return ChangeOfCharacterIndicator(Input);
        }

        public ChangeOfCharacterIndicator ChangeOfCharacterIndicator(ISeries<double> input)
        {
            if (cacheChangeOfCharacterIndicator != null)
                for (int idx = 0; idx < cacheChangeOfCharacterIndicator.Length; idx++)
                    if (cacheChangeOfCharacterIndicator[idx] != null && cacheChangeOfCharacterIndicator[idx].EqualsInput(input))
                        return cacheChangeOfCharacterIndicator[idx];
            return CacheIndicator<ChangeOfCharacterIndicator>(new ChangeOfCharacterIndicator(), input, ref cacheChangeOfCharacterIndicator);
        }
    }
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
    public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
    {
        public Indicators.ChangeOfCharacterIndicator ChangeOfCharacterIndicator()
        {
            return indicator.ChangeOfCharacterIndicator(Input);
        }

        public Indicators.ChangeOfCharacterIndicator ChangeOfCharacterIndicator(ISeries<double> input)
        {
            return indicator.ChangeOfCharacterIndicator(input);
        }
    }
}

#endregion

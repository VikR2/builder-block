#region Using declarations
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{
    public class TTradesDailyBiasIndicator : Indicator
    {
        private double pdh, pdl;
        private DateTime currentSessionDate = DateTime.MinValue;
        private bool pdhSwept = false;
        private bool pdlSwept = false;

        public enum BiasDirection { None, Bullish, Bearish }
        private BiasDirection dailyBias = BiasDirection.None;

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"TTrades Daily Bias - Shows bias based on PDH/PDL sweep and reclaim/rejection";
                Name = "TTradesDailyBias";
                Calculate = Calculate.OnBarClose;
                IsOverlay = true;
                DisplayInDataBox = false;
                DrawOnPricePanel = true;
                IsSuspendedWhileInactive = true;

                // Defaults
                BullishColor = Brushes.LimeGreen;
                BearishColor = Brushes.Crimson;
                NeutralColor = Brushes.Gray;
                ShowPDHPDL = true;
                PDHPDLColor = Brushes.DodgerBlue;
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < 20) return;

            DateTime today = Time[0].Date;

            // New session - reset and calculate PDH/PDL
            if (today != currentSessionDate)
            {
                currentSessionDate = today;
                dailyBias = BiasDirection.None;
                pdhSwept = false;
                pdlSwept = false;
                UpdatePDHPDL();
            }

            // Check for sweep
            CheckForSweep();

            // Draw bias label
            DrawBiasLabel();

            // Draw PDH/PDL lines
            if (ShowPDHPDL && pdh > 0 && pdl > 0)
            {
                Draw.HorizontalLine(this, "PDH", pdh, PDHPDLColor, DashStyleHelper.Dash, 1);
                Draw.HorizontalLine(this, "PDL", pdl, PDHPDLColor, DashStyleHelper.Dash, 1);
            }
        }

        private void UpdatePDHPDL()
        {
            double dayHigh = 0;
            double dayLow = double.MaxValue;
            DateTime prevDay = Time[0].Date.AddDays(-1);

            // Skip weekends
            if (prevDay.DayOfWeek == DayOfWeek.Sunday)
                prevDay = prevDay.AddDays(-2);
            else if (prevDay.DayOfWeek == DayOfWeek.Saturday)
                prevDay = prevDay.AddDays(-1);

            for (int i = 0; i < Math.Min(500, CurrentBar); i++)
            {
                if (Time[i].Date == prevDay)
                {
                    dayHigh = Math.Max(dayHigh, High[i]);
                    dayLow = Math.Min(dayLow, Low[i]);
                }
            }

            if (dayHigh > 0 && dayLow < double.MaxValue)
            {
                pdh = dayHigh;
                pdl = dayLow;
            }
        }

        private void CheckForSweep()
        {
            if (pdh == 0 || pdl == 0) return;
            if (dailyBias != BiasDirection.None) return;

            // PDL Sweep = Bullish potential
            if (Low[0] < pdl)
            {
                pdlSwept = true;
                pdhSwept = false;  // Cancel any PDH sweep
            }

            // Bullish: PDL swept + close above PDL (reclaim)
            if (pdlSwept && Close[0] > pdl)
            {
                dailyBias = BiasDirection.Bullish;
            }

            // PDH Sweep = Bearish potential
            if (High[0] > pdh)
            {
                pdhSwept = true;
                pdlSwept = false;  // Cancel any PDL sweep
            }

            // Bearish: PDH swept + close below PDH (rejection)
            if (pdhSwept && Close[0] < pdh)
            {
                dailyBias = BiasDirection.Bearish;
            }
        }

        private void DrawBiasLabel()
        {
            string text;
            Brush color;

            switch (dailyBias)
            {
                case BiasDirection.Bullish:
                    text = "BULLISH";
                    color = BullishColor;
                    break;
                case BiasDirection.Bearish:
                    text = "BEARISH";
                    color = BearishColor;
                    break;
                default:
                    text = pdhSwept ? "PDH SWEPT..." : (pdlSwept ? "PDL SWEPT..." : "WAITING...");
                    color = NeutralColor;
                    break;
            }

            Draw.TextFixed(this, "BiasLabel", text, TextPosition.TopRight,
                color, new Gui.Tools.SimpleFont("Arial", 14), Brushes.Transparent, Brushes.Transparent, 0);
        }

        #region Properties
        [NinjaScriptProperty]
        [XmlIgnore]
        [Display(Name = "Bullish Color", Order = 1, GroupName = "Display")]
        public Brush BullishColor { get; set; }

        [Browsable(false)]
        public string BullishColorSerializable
        {
            get { return Serialize.BrushToString(BullishColor); }
            set { BullishColor = Serialize.StringToBrush(value); }
        }

        [NinjaScriptProperty]
        [XmlIgnore]
        [Display(Name = "Bearish Color", Order = 2, GroupName = "Display")]
        public Brush BearishColor { get; set; }

        [Browsable(false)]
        public string BearishColorSerializable
        {
            get { return Serialize.BrushToString(BearishColor); }
            set { BearishColor = Serialize.StringToBrush(value); }
        }

        [NinjaScriptProperty]
        [XmlIgnore]
        [Display(Name = "Neutral Color", Order = 3, GroupName = "Display")]
        public Brush NeutralColor { get; set; }

        [Browsable(false)]
        public string NeutralColorSerializable
        {
            get { return Serialize.BrushToString(NeutralColor); }
            set { NeutralColor = Serialize.StringToBrush(value); }
        }

        [NinjaScriptProperty]
        [Display(Name = "Show PDH/PDL Lines", Order = 4, GroupName = "Display")]
        public bool ShowPDHPDL { get; set; }

        [NinjaScriptProperty]
        [XmlIgnore]
        [Display(Name = "PDH/PDL Color", Order = 5, GroupName = "Display")]
        public Brush PDHPDLColor { get; set; }

        [Browsable(false)]
        public string PDHPDLColorSerializable
        {
            get { return Serialize.BrushToString(PDHPDLColor); }
            set { PDHPDLColor = Serialize.StringToBrush(value); }
        }
        #endregion
    }
}

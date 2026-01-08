#region Using declarations
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
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
    public class POIZoneConfirmationIndicator : Indicator
    {
        private int touchCount = 0;
        private int lastTouchBar = -1;
        private double zoneHigh = 0;
        private double zoneLow = 0;

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"POI Zone Confirmation - Draw a rectangle named 'POI' on chart, indicator counts C1, C2, C3... touches";
                Name = "POIZoneConfirmation";
                Calculate = Calculate.OnBarClose;
                IsOverlay = true;
                DisplayInDataBox = false;
                DrawOnPricePanel = true;
                IsSuspendedWhileInactive = true;

                // Display defaults
                LabelColor = Brushes.White;
                ConfirmedColor = Brushes.LimeGreen;
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < 1) return;

            // Find rectangle drawn by user (look for any rectangle, prefer one tagged "POI")
            if (!FindUserRectangle())
            {
                Draw.TextFixed(this, "Status", "Draw a rectangle on chart for POI zone", TextPosition.TopLeft,
                    Brushes.Orange, new Gui.Tools.SimpleFont("Arial", 11), Brushes.Transparent, Brushes.Transparent, 0);
                return;
            }

            // Check for touch (candle overlaps zone)
            bool isTouching = High[0] >= zoneLow && Low[0] <= zoneHigh;

            if (isTouching && lastTouchBar != CurrentBar)
            {
                touchCount++;
                lastTouchBar = CurrentBar;

                // Label position - above the candle
                double labelPrice = High[0] + (3 * TickSize);
                string label = "C" + touchCount;

                Draw.Text(this, "Touch_" + CurrentBar, label, 0, labelPrice, LabelColor);
            }

            // Status display
            string status = touchCount == 0 ? "Waiting for C1..." :
                           (touchCount == 1 ? "C1 - Waiting for C2..." :
                           $"C{touchCount} confirmed");

            Brush statusColor = touchCount >= 2 ? ConfirmedColor : Brushes.White;

            Draw.TextFixed(this, "Status", status, TextPosition.TopLeft,
                statusColor, new Gui.Tools.SimpleFont("Arial", 11), Brushes.Transparent, Brushes.Transparent, 0);
        }

        private bool FindUserRectangle()
        {
            // Access user-drawn objects from ChartControl
            if (ChartControl == null) return false;

            foreach (var chartObject in ChartControl.ChartObjects)
            {
                // Check if it's a Rectangle drawing tool
                if (chartObject is DrawingTools.Rectangle rect)
                {
                    // Get the price levels from the rectangle
                    double y1 = rect.StartAnchor.Price;
                    double y2 = rect.EndAnchor.Price;

                    zoneHigh = Math.Max(y1, y2);
                    zoneLow = Math.Min(y1, y2);

                    return true;
                }
            }

            return false;
        }

        #region Properties
        [NinjaScriptProperty]
        [XmlIgnore]
        [Display(Name = "Label Color", Order = 1, GroupName = "Display")]
        public Brush LabelColor { get; set; }

        [Browsable(false)]
        public string LabelColorSerializable
        {
            get { return Serialize.BrushToString(LabelColor); }
            set { LabelColor = Serialize.StringToBrush(value); }
        }

        [NinjaScriptProperty]
        [XmlIgnore]
        [Display(Name = "Confirmed Color", Order = 2, GroupName = "Display")]
        public Brush ConfirmedColor { get; set; }

        [Browsable(false)]
        public string ConfirmedColorSerializable
        {
            get { return Serialize.BrushToString(ConfirmedColor); }
            set { ConfirmedColor = Serialize.StringToBrush(value); }
        }
        #endregion
    }
}

"use client";

import { useEffect, useRef, useState } from 'react';
import { ChartConfig } from '@/lib/tcm-chart-data';

// Dynamic import for lightweight-charts to avoid SSR issues
import type {
  IChartApi,
  ISeriesApi,
  CandlestickSeriesOptions,
  LineWidth,
  Time,
  SeriesMarker,
} from 'lightweight-charts';

interface ChartViewerProps {
  config: ChartConfig;
  height?: number;
  className?: string;
}

export function ChartViewer({ config, height = 300, className = '' }: ChartViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically import lightweight-charts
    import('lightweight-charts').then((LightweightCharts) => {
      if (!containerRef.current) return;

      // Clean up existing chart
      if (chartRef.current) {
        chartRef.current.remove();
      }

      // Create chart
      const chart = LightweightCharts.createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: isExpanded ? 500 : height,
        layout: {
          background: { color: '#1a1a2e' },
          textColor: '#d1d4dc',
        },
        grid: {
          vertLines: { color: '#2a2a3e' },
          horzLines: { color: '#2a2a3e' },
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: '#2a2a3e',
        },
        timeScale: {
          borderColor: '#2a2a3e',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      // Add candlestick series
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      } as CandlestickSeriesOptions);

      candlestickSeries.setData(config.candles);

      // Add horizontal lines using price lines
      if (config.horizontalLines) {
        for (const line of config.horizontalLines) {
          candlestickSeries.createPriceLine({
            price: line.price,
            color: line.color,
            lineWidth: (line.lineWidth || 1) as LineWidth,
            lineStyle: line.lineStyle === 'dashed' ? 1 : line.lineStyle === 'dotted' ? 2 : 0,
            axisLabelVisible: true,
            title: line.label || '',
          });
        }
      }

      // Add time boxes using area series with baseline (approximation)
      // Note: Lightweight Charts doesn't have native box support,
      // so we'll draw rectangles using the primitives plugin or overlay
      if (config.timeBoxes && config.timeBoxes.length > 0) {
        // For now, we'll use the series markers to indicate box boundaries
        // A more sophisticated approach would use the primitives plugin
        const markers: SeriesMarker<Time>[] = [];

        for (const box of config.timeBoxes) {
          if (box.label) {
            markers.push({
              time: box.startTime,
              position: 'aboveBar',
              color: box.borderColor || box.fillColor,
              shape: 'square',
              text: box.label,
            });
          }
        }

        if (markers.length > 0) {
          candlestickSeries.setMarkers(markers);
        }
      }

      // Fit content
      chart.timeScale().fitContent();

      // Handle resize
      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
            height: isExpanded ? 500 : height,
          });
        }
      };

      window.addEventListener('resize', handleResize);
      setIsLoading(false);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
      };
    });
  }, [config, height, isExpanded]);

  // Update chart size when expanded changes
  useEffect(() => {
    if (chartRef.current && containerRef.current) {
      chartRef.current.applyOptions({
        height: isExpanded ? 500 : height,
      });
      chartRef.current.timeScale().fitContent();
    }
  }, [isExpanded, height]);

  return (
    <div className={`relative rounded-lg overflow-hidden border border-border/50 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-background/50 border-b border-border/30">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <span className="text-sm font-medium">{config.title || 'Chart'}</span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 rounded hover:bg-background transition-colors"
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          )}
        </button>
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: isExpanded ? 500 : height }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Description */}
      {config.description && (
        <div className="px-3 py-2 bg-background/30 border-t border-border/30">
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      )}

      {/* Legend */}
      {config.horizontalLines && config.horizontalLines.length > 0 && (
        <div className="px-3 py-2 bg-background/20 border-t border-border/30">
          <div className="flex flex-wrap gap-3">
            {config.horizontalLines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <div
                  className="w-4 h-0.5"
                  style={{
                    backgroundColor: line.color,
                    borderStyle: line.lineStyle === 'dashed' ? 'dashed' : line.lineStyle === 'dotted' ? 'dotted' : 'solid',
                  }}
                />
                <span className="text-xs text-muted-foreground">{line.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Modal wrapper for fullscreen viewing
export function ChartModal({ config, isOpen, onClose }: {
  config: ChartConfig;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-card rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <ChartViewer config={config} height={500} />
      </div>
    </div>
  );
}

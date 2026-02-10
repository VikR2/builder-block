/**
 * TCM Chart Data Generator
 * Creates synthetic OHLC data and annotations for visualizing trading concepts
 */

import { Time } from 'lightweight-charts';

// Types for chart data
export interface CandleData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface HorizontalLine {
  price: number;
  color: string;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  label?: string;
  labelPosition?: 'left' | 'right';
}

export interface TimeBox {
  startTime: Time;
  endTime: Time;
  topPrice: number;
  bottomPrice: number;
  fillColor: string;
  borderColor?: string;
  label?: string;
}

export interface ChartConfig {
  candles: CandleData[];
  horizontalLines?: HorizontalLine[];
  timeBoxes?: TimeBox[];
  title?: string;
  description?: string;
}

// Concept keyword mappings for detection
const CONCEPT_KEYWORDS: Record<string, string[]> = {
  'submission_range': [
    'submission range', 'sr session', 'sr window', 'submission window',
    'sr levels', '12:40', '3:20', 'afternoon session', 'sr high', 'sr low',
    'sr eq', 'sr equilibrium'
  ],
  'sr_levels': [
    'sr high', 'sr low', 'sr levels', 'sr equilibrium', 'sr eq',
    'submission high', 'submission low'
  ],
  'book_overlap': [
    'book', 'matching', 'book building', 'order matching', 'book overlap',
    'buy book', 'sell book', 'overlap zone'
  ],
  'std_targets': [
    'std', 'standard deviation', 'target levels', '1.0x', '1.5x', '2.0x',
    'extension', 'projected targets'
  ],
  'stops': [
    'stop', 'stop loss', 'buy stops', 'sell stops', 'protection',
    'stops taken', 'swept'
  ]
};

/**
 * Detect which visual concepts are relevant to a query
 */
export function detectChartConcepts(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const detected: string[] = [];

  for (const [concept, keywords] of Object.entries(CONCEPT_KEYWORDS)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      detected.push(concept);
    }
  }

  return detected;
}

/**
 * Generate chart configuration for a concept
 */
export function generateChartForConcept(concept: string): ChartConfig | null {
  switch (concept) {
    case 'submission_range':
      return generateSubmissionRangeChart();
    case 'sr_levels':
      return generateSRLevelsChart();
    case 'book_overlap':
      return generateBookOverlapChart();
    case 'std_targets':
      return generateSTDTargetsChart();
    case 'stops':
      return generateStopsChart();
    default:
      return null;
  }
}

/**
 * Generate synthetic OHLC data for demonstration
 * Creates a realistic-looking price pattern
 */
function generateSyntheticCandles(
  basePrice: number,
  numBars: number,
  volatility: number = 0.002,
  trend: 'up' | 'down' | 'sideways' = 'sideways'
): CandleData[] {
  const candles: CandleData[] = [];
  let currentPrice = basePrice;
  const now = Math.floor(Date.now() / 1000);
  const barInterval = 300; // 5-minute bars

  for (let i = 0; i < numBars; i++) {
    // Add trend bias
    let trendBias = 0;
    if (trend === 'up') trendBias = volatility * 0.3;
    if (trend === 'down') trendBias = -volatility * 0.3;

    // Random movement
    const change = (Math.random() - 0.5 + trendBias) * currentPrice * volatility;
    const open = currentPrice;
    const close = currentPrice + change;

    // Generate high/low
    const range = Math.abs(change) + Math.random() * currentPrice * volatility;
    const high = Math.max(open, close) + Math.random() * range;
    const low = Math.min(open, close) - Math.random() * range;

    candles.push({
      time: (now - (numBars - i) * barInterval) as Time,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100
    });

    currentPrice = close;
  }

  return candles;
}

/**
 * Submission Range Chart
 * Shows the SR session window (12:40 PM - 3:20 PM ET) with SR High/Low/EQ lines
 */
export function generateSubmissionRangeChart(): ChartConfig {
  const basePrice = 5200; // Example ES price
  const candles = generateSyntheticCandles(basePrice, 60, 0.001, 'sideways');

  // Find high/low within "SR session" (middle portion of the chart)
  const srStartIdx = Math.floor(candles.length * 0.3);
  const srEndIdx = Math.floor(candles.length * 0.7);
  const srCandles = candles.slice(srStartIdx, srEndIdx);

  const srHigh = Math.max(...srCandles.map(c => c.high));
  const srLow = Math.min(...srCandles.map(c => c.low));
  const srEQ = (srHigh + srLow) / 2;

  return {
    title: 'Submission Range (SR Session)',
    description: 'The SR window is 12:40 PM - 3:20 PM ET. SR High and SR Low define the range.',
    candles,
    horizontalLines: [
      {
        price: srHigh,
        color: '#64B5F6', // Light blue
        lineWidth: 2,
        lineStyle: 'dashed',
        label: 'SR High',
        labelPosition: 'right'
      },
      {
        price: srLow,
        color: '#64B5F6',
        lineWidth: 2,
        lineStyle: 'dashed',
        label: 'SR Low',
        labelPosition: 'right'
      },
      {
        price: srEQ,
        color: '#FF9800', // Orange
        lineWidth: 1,
        lineStyle: 'dotted',
        label: 'SR EQ',
        labelPosition: 'right'
      }
    ],
    timeBoxes: [
      {
        startTime: candles[srStartIdx].time,
        endTime: candles[srEndIdx].time,
        topPrice: srHigh + (srHigh - srLow) * 0.1,
        bottomPrice: srLow - (srHigh - srLow) * 0.1,
        fillColor: 'rgba(156, 39, 176, 0.15)', // Purple with transparency
        borderColor: 'rgba(156, 39, 176, 0.5)',
        label: 'SR Session'
      }
    ]
  };
}

/**
 * SR Levels Chart
 * Shows just the horizontal SR High/Low/EQ lines
 */
export function generateSRLevelsChart(): ChartConfig {
  const basePrice = 5200;
  const candles = generateSyntheticCandles(basePrice, 40, 0.001, 'sideways');

  const allHighs = candles.map(c => c.high);
  const allLows = candles.map(c => c.low);
  const srHigh = Math.max(...allHighs);
  const srLow = Math.min(...allLows);
  const srEQ = (srHigh + srLow) / 2;

  return {
    title: 'SR Levels',
    description: 'SR High is resistance, SR Low is support. SR EQ is equilibrium (50% level).',
    candles,
    horizontalLines: [
      {
        price: srHigh,
        color: '#64B5F6',
        lineWidth: 2,
        lineStyle: 'solid',
        label: 'SR High',
        labelPosition: 'right'
      },
      {
        price: srLow,
        color: '#64B5F6',
        lineWidth: 2,
        lineStyle: 'solid',
        label: 'SR Low',
        labelPosition: 'right'
      },
      {
        price: srEQ,
        color: '#FF9800',
        lineWidth: 1,
        lineStyle: 'dashed',
        label: 'SR EQ',
        labelPosition: 'right'
      }
    ]
  };
}

/**
 * Book/Matching Window Chart
 * Shows overlapping buy and sell book zones
 */
export function generateBookOverlapChart(): ChartConfig {
  const basePrice = 5200;
  const candles = generateSyntheticCandles(basePrice, 50, 0.0015, 'sideways');

  const midIdx = Math.floor(candles.length / 2);
  const midPrice = candles[midIdx].close;

  // Buy book (below current price)
  const buyBookTop = midPrice - 2;
  const buyBookBottom = midPrice - 8;

  // Sell book (above current price)
  const sellBookTop = midPrice + 8;
  const sellBookBottom = midPrice + 2;

  // Overlap zone
  const overlapTop = midPrice + 2;
  const overlapBottom = midPrice - 2;

  return {
    title: 'Book Building & Matching',
    description: 'Buy book accumulates below price, sell book above. Overlap is the matching window.',
    candles,
    horizontalLines: [
      {
        price: midPrice,
        color: '#FFFFFF',
        lineWidth: 1,
        lineStyle: 'dotted',
        label: 'Current Price',
        labelPosition: 'left'
      }
    ],
    timeBoxes: [
      {
        startTime: candles[0].time,
        endTime: candles[candles.length - 1].time,
        topPrice: buyBookTop,
        bottomPrice: buyBookBottom,
        fillColor: 'rgba(76, 175, 80, 0.2)', // Green
        borderColor: 'rgba(76, 175, 80, 0.5)',
        label: 'Buy Book'
      },
      {
        startTime: candles[0].time,
        endTime: candles[candles.length - 1].time,
        topPrice: sellBookTop,
        bottomPrice: sellBookBottom,
        fillColor: 'rgba(244, 67, 54, 0.2)', // Red
        borderColor: 'rgba(244, 67, 54, 0.5)',
        label: 'Sell Book'
      },
      {
        startTime: candles[midIdx - 5].time,
        endTime: candles[midIdx + 5].time,
        topPrice: overlapTop,
        bottomPrice: overlapBottom,
        fillColor: 'rgba(255, 193, 7, 0.3)', // Amber
        borderColor: 'rgba(255, 193, 7, 0.7)',
        label: 'Overlap'
      }
    ]
  };
}

/**
 * STD Targets Chart
 * Shows standard deviation extension lines
 */
export function generateSTDTargetsChart(): ChartConfig {
  const basePrice = 5200;
  // Generate a move up for STD targets
  const candles = generateSyntheticCandles(basePrice, 50, 0.002, 'up');

  // Use the range to calculate STD targets
  const rangeHigh = 5210;
  const rangeLow = 5190;
  const rangeSize = rangeHigh - rangeLow;

  // STD targets for a bullish move
  const t05 = rangeLow + rangeSize * 0.5;  // 0.5x
  const t10 = rangeLow + rangeSize * 1.0;  // 1.0x (range high)
  const t15 = rangeLow + rangeSize * 1.5;  // 1.5x
  const t20 = rangeLow + rangeSize * 2.0;  // 2.0x

  return {
    title: 'STD (Standard Deviation) Targets',
    description: 'Projected targets based on the SR range. 1.0x = top of range, 1.5x and 2.0x are extensions.',
    candles,
    horizontalLines: [
      {
        price: rangeLow,
        color: '#64B5F6',
        lineWidth: 1,
        lineStyle: 'solid',
        label: 'Base (SR Low)',
        labelPosition: 'right'
      },
      {
        price: t05,
        color: '#81C784',
        lineWidth: 1,
        lineStyle: 'dotted',
        label: '0.5x',
        labelPosition: 'right'
      },
      {
        price: t10,
        color: '#4CAF50',
        lineWidth: 2,
        lineStyle: 'dashed',
        label: '1.0x (SR High)',
        labelPosition: 'right'
      },
      {
        price: t15,
        color: '#66BB6A',
        lineWidth: 2,
        lineStyle: 'dashed',
        label: '1.5x',
        labelPosition: 'right'
      },
      {
        price: t20,
        color: '#43A047',
        lineWidth: 2,
        lineStyle: 'solid',
        label: '2.0x',
        labelPosition: 'right'
      }
    ],
    timeBoxes: [
      {
        startTime: candles[0].time,
        endTime: candles[Math.floor(candles.length * 0.3)].time,
        topPrice: rangeHigh,
        bottomPrice: rangeLow,
        fillColor: 'rgba(100, 181, 246, 0.15)',
        borderColor: 'rgba(100, 181, 246, 0.5)',
        label: 'SR Range'
      }
    ]
  };
}

/**
 * Stops Chart
 * Shows buy stops and sell stops zones
 */
export function generateStopsChart(): ChartConfig {
  const basePrice = 5200;
  const candles = generateSyntheticCandles(basePrice, 45, 0.0012, 'sideways');

  // Find recent swing highs/lows
  const recentCandles = candles.slice(-30);
  const swingHigh = Math.max(...recentCandles.map(c => c.high));
  const swingLow = Math.min(...recentCandles.map(c => c.low));

  return {
    title: 'Stop Zones',
    description: 'Buy stops rest above swing highs. Sell stops rest below swing lows. These are targets for liquidity hunts.',
    candles,
    horizontalLines: [
      {
        price: swingHigh,
        color: '#EF5350', // Red
        lineWidth: 2,
        lineStyle: 'solid',
        label: 'Swing High',
        labelPosition: 'right'
      },
      {
        price: swingLow,
        color: '#4CAF50', // Green
        lineWidth: 2,
        lineStyle: 'solid',
        label: 'Swing Low',
        labelPosition: 'right'
      }
    ],
    timeBoxes: [
      {
        startTime: candles[Math.floor(candles.length * 0.6)].time,
        endTime: candles[candles.length - 1].time,
        topPrice: swingHigh + (swingHigh - swingLow) * 0.1,
        bottomPrice: swingHigh,
        fillColor: 'rgba(239, 83, 80, 0.25)',
        borderColor: 'rgba(239, 83, 80, 0.6)',
        label: 'Buy Stops'
      },
      {
        startTime: candles[Math.floor(candles.length * 0.6)].time,
        endTime: candles[candles.length - 1].time,
        topPrice: swingLow,
        bottomPrice: swingLow - (swingHigh - swingLow) * 0.1,
        fillColor: 'rgba(76, 175, 80, 0.25)',
        borderColor: 'rgba(76, 175, 80, 0.6)',
        label: 'Sell Stops'
      }
    ]
  };
}

/**
 * Main function to generate chart data for a query
 * Returns null if no visual concepts detected
 */
export function generateChartDataForQuery(query: string): ChartConfig | null {
  const concepts = detectChartConcepts(query);

  if (concepts.length === 0) {
    return null;
  }

  // Return chart for the first (most specific) concept detected
  // submission_range is prioritized as it's most comprehensive
  if (concepts.includes('submission_range')) {
    return generateSubmissionRangeChart();
  }

  return generateChartForConcept(concepts[0]);
}

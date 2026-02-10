# TCM Order Fulfillment Tips - Deep Dive

**Source:** Order-Fufilment-Tips.mp4
**Duration:** 81 minutes 41 seconds
**Extracted:** 2026-01-14
**Type:** Educational Deep Dive (Advanced TCM Theory)

---

## Overview

This video expands on the core TCM Order Fulfillment Theory with practical application and live examples. Key focus: understanding the **book-building process** and how to read matched vs unmatched orders to determine bias and liquidity targets.

---

## Core Concepts Expanded

### The Book Metaphor

Think of all matched orders as a **bag of marbles**:
- Each marble = a matched buy+sell pair
- The bag contains all liquidity at that price level
- When price returns to "dig into the bag" = filling orders
- Unfilled orders remain as liquidity targets

### Order Lifecycle (4 Steps)

```
SUBMISSION → MATCHING → FILLING → DISTRIBUTION
    |            |           |           |
  Lines      Liquidity    Execution   Settlement
  only        created     by time     complete
```

1. **Submission**: Orders placed as "lines" (no liquidity yet)
2. **Matching**: Counterparty found → now on the book → liquidity exists
3. **Filling**: Time-based execution (entities must be present)
4. **Distribution**: Orders settled, profits/losses realized

### Key Insight: Liquidity Only After Matching

> "Submitted orders + matched counterparty = liquidity"

- Order placed ≠ liquidity
- Order matched = liquidity created
- If price never trades to submitted level during matching window → NO liquidity there

---

## The Book Building Process

### Step 1: Find the Book (Overlap)

The **book** is the overlap between:
- Submission Range (12:40-3:20 PM ET)
- Matching Window (Asian session)

```
Submission Range:  |----[  SR HIGH  ]----[  SR LOW  ]----|
Matching Window:   |--[  MATCH HIGH  ]--[  MATCH LOW  ]--|
                           ↓
                   OVERLAP = THE BOOK
```

**First thing on chart**: Look for where these two overlap.

### Step 2: Identify Levels from the Book

From the overlap, you get 3 key levels:
- **High**: Highest matched order
- **Low**: Lowest matched order
- **EQ**: 50% midpoint (average order)

### Step 3: Determine Liquidity Type

**If orders matched and price moved HIGHER:**
- Buyers are in profit → protecting with sell stops BELOW
- **Sell-side liquidity** rests below the matched zone

**If orders matched and price moved LOWER:**
- Sellers are in profit → protecting with buy stops ABOVE
- **Buy-side liquidity** rests above the matched zone

### Formula:
```
Key Level + Delivery at Key Level = BIAS

Delivery Types:
- SWEEP (no FVG) = Reversal expected
- RUN (FVG stays open) = Continuation expected
```

---

## Unmatched Orders (Gap Days)

When matching window does NOT overlap with submission range:

```
Submission:  |----[  SR  ]----|
Matching:              |----[  MATCH  ]----|
                  GAP ↑
```

**What happens:**
1. Orders in the gap remain **unfilled**
2. Market will need to return to fill them
3. This creates the "run up → match → fill → run down" pattern

**Example pattern:**
```
Price gaps up → Creates matching above SR
             → Pulls back to fill SR levels
             → Then continues to objective
```

---

## The 3-Step Analysis Process

When you open any chart:

### Step 1: Find the Book
- Draw Submission Range box
- Draw Matching Window box
- Identify the overlap

### Step 2: Check Field Window
- Extend the book into the fill window (NY session)
- Mark High/Low/EQ levels from the overlap

### Step 3: NY Bias Determination
Ask two questions:
1. **Where is liquidity?** (based on how price moved away from matched levels)
2. **Is it logical for the market to turn here?** (based on objectives)

---

## Practical Rules

### Entry Rule: Close Above/Below
Before taking a reversal trade:
1. Wait for price to sweep high/low
2. **Must see a close** above the swept high (for longs) or below the swept low (for shorts)
3. If no close → continuation expected

### The "Don't Candle" Rule
If price sweeps a level but **does not close** above/below:
- Wait for a "don't candle" (pause/rejection)
- Only enter if close comes AFTER the don't candle

### Continuation Must End First
> "Continuations must end before reversals take place"

If price is expanding through a level:
1. Wait until expansion objective is reached (deviation level)
2. OR wait until candle shows expansion is over (fail expansion)
3. **Both happening together** = don't trade

---

## Deviation Levels Technique

To find deviation targets from unmatched orders:

1. Take the Submission Range box
2. Copy it
3. Place 50% of box at the low of the gap → 1 STD down
4. Place another copy above → 1 STD up
5. These become key levels for deviation trades

---

## DLP (Designated Liquidity Provider) Insight

How institutions make money:
1. Get paid commission for every X orders filled
2. Hedge positions by building short-term and long-term books
3. Their goal: `Commissions + Exit Profits - Losses > Target %`

They don't close same-day - they're building books over time.

---

## Key Quotes

> "Key level + Delivery at key level = Bias"

> "We get paid to make good decisions"

> "The more you sit and look, the more the market whispers bullish... and that's when you get destroyed"

> "You don't have to justify losses. You get paid to make good decisions using rules"

> "Continuations must end before reversals"

---

## Skills to Extract

| New Skill | Category | Description |
|-----------|----------|-------------|
| Book Building Process | Market Structure | Finding the overlap between SR and matching window to identify the "book" |
| Matched Order Levels | Market Structure | High/Low/EQ from the book become key levels |
| Unmatched Order Gaps | Market Structure | When matching doesn't overlap SR, gap must be filled |
| Close Confirmation Rule | Entry Patterns | Must see close above/below swept level before reversal |
| Deviation from Gap | Risk Management | Using SR box to calculate 1-2 STD deviation targets |
| DLP Book Building | Market Structure | Understanding how liquidity providers hedge and build positions |

---

## Relationship to Existing TCM Skills

| Existing Skill | Enhanced By |
|----------------|-------------|
| #101 TCM Order Fulfillment Theory | Book building metaphor, DLP insight |
| #102 Submission Range (SR) | Overlap identification technique |
| #103 Order Lifecycle Timeline | Field vs Matching window distinction |
| #105 Sweep vs Run Detection | Close confirmation rule |
| #108 Matched vs Unmatched Orders | Practical gap trading examples |

---

## Implementation Notes for Indicator

### New Visual Elements
1. **Book Box**: Highlight overlap between SR and matching window
2. **Gap Zone**: Show when matching doesn't touch SR
3. **Deviation Lines**: Auto-calculate from gap

### New Alerts
1. "No overlap detected - gap fill expected"
2. "Price at book level - watch for sweep vs run"
3. "Close confirmation received"

---

## Summary

This video bridges the theoretical TCM Order Fulfillment model with practical chart reading. The key takeaway is the **3-step process**:

1. **Find the Book** (SR + Matching overlap)
2. **Check Field Window** (extend levels into NY)
3. **Determine NY Bias** (liquidity location + reversal logic)

Combined with the close confirmation rule and deviation technique, this provides a mechanical framework for daily bias and entry timing.

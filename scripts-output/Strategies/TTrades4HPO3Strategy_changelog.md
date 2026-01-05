# TTrades4HPO3Strategy - Generation Changelog

**Model ID:** 5
**Model Name:** TTrades 4-Hour Power of Three
**Generated:** 2026-01-05 09:53:15

## Model Intent

Trade the distribution phase of a 4-hour candle by waiting for the wick to form (via CISD/protected swing), then trade the body/expansion. Combines daily bias, 4H candle structure, and LTF fractal model for entries.

## Skills by Phase

### Bias Phase
- #62 Daily Bias Determination (TTrades)
- #68 Equilibrium Trading (TTrades)

### Setup Phase
- #64 Candle 2 Closure (Reversal)
- #74 Wick Analysis (TTrades)
- #75 Power of 3 (AMD Framework)
- #91 Candle 1 Reference (TTrades)

### Confirmation Phase
- #4 CISD Pattern (Change in State of Delivery) **(required)**
- #63 Protected Swings (TTrades)
- #65 Candle 3 Closure (Confirmation)

### Entry Phase
- #66 Candle 4 Expansion (TTrades)
- #82 Expansion Phase
- #100 GXT Integration (4H + Fractal) - GXT integration

### Management Phase
- #8 Time-based Session Windows
- #98 4H Session Timing (Futures)
- #99 4H Session Timing (Forex)

### Exit Phase
- #86 Dynamic Target Levels (Session-Based)

## State Machine

States from model:
- WAITING_FOR_DAILY_BIAS
- WAITING_FOR_4H_ACCUMULATION
- CLASSIFYING_C2_WICK
- WAITING_FOR_CISD_SAME_CANDLE
- WAITING_FOR_C3_OPEN
- WAITING_FOR_C3_WICK
- ENTRY_READY
- IN_POSITION
- TRADE_COMPLETE

## Constraints

- Entry REQUIRES CISD
- Let wick form first
- Dont hold past 4H close
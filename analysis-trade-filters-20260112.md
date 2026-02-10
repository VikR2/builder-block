# Trade Filter Analysis - NinjaScript Output
**Date:** January 8, 2026  
**Log File:** NinjaScript Output 1_8_2026 1_39 PM.txt  
**Analysis Period:** 247 trading days (1/7/2025 - 12/11/2025)

---

## Executive Summary

Out of 247 trading days, only **17 trades** were taken (6.9% of all days, 9.1% of valid bias days). The strategy has **extremely strict filters** at multiple levels that are eliminating the vast majority of trading opportunities.

### Filter Cascade Effect:
1. **Daily Bias**: 24.3% of days rejected (60/247)
2. **C1 Confirmation**: 80.1% of attempts rejected (261/326) 
3. **C2 Confirmation**: 79.6% of attempts rejected (125/157)
4. **CISD Confirmation**: 88.6% of attempts rejected (155/175)

---

## Detailed Filter Analysis

### 1. Daily Bias Filters ❌ Moderately Strict

**Total Days:** 247  
**Valid Bias:** 187 (75.7%)  
**Rejected:** 60 (24.3%)

#### Breakdown:
- **No sweep of PDH/PDL:** 30 days (12.1%)
  - *These days legitimately have no setup - filter is appropriate*
  
- **Wick too large (≥50%):** 30 days (12.1%)
  - **PROBLEM:** This filter may be too strict

#### Wick Percentage Distribution (30 rejected days):
```
50-55%:  7 days  (51.0%, 52.0%, 52.0%, 52.6%, 53.3%, 53.4%, 54.1%)
55-60%:  4 days  (54.3%, 55.4%, 56.3%, 57.8%, 59.5%)
60-70%:  8 days  (60.0%, 60.4%, 66.1%, 66.2%, 66.4%, 66.7%, 67.3%, 67.8%)
70-80%:  7 days  (72.0%, 73.4%, 74.2%, 74.3%, 74.7%, 76.6%, 78.8%)
80-90%:  4 days  (80.0%, 84.3%, 88.3%)
```

**RECOMMENDATION:** 
- **50-55% wicks (7 days)** are barely over the threshold - these might be valid setups
- Consider raising threshold to **60-65%** to recapture 11-15 trading days
- Days with 70%+ wicks are likely noise (appropriate to filter)

---

### 2. C1 Confirmation ❌❌ EXTREMELY STRICT

**Total Attempts:** 326  
**Success:** 65 (19.9%)  
**Failed (closed through):** 261 (80.1%)

**PROBLEM:** This is the **biggest trade killer** in the strategy. 80% of C1 attempts fail because the candle "closed through" the key level without showing rejection.

#### Why This Matters:
When daily bias is established, the strategy waits for hourly candles to sweep the key level. But if the candle closes beyond the level (showing strength, not rejection), it's rejected.

**Example Pattern:**
```
1/14/2025 - Bearish reversal bias established
  5:00 PM - Swept 6044.00 but closed through - skip
  7:00 PM - Swept 6044.00 but closed through - skip
  8:00 PM - Swept 6044.00 but closed through - skip
  ... (24 consecutive rejections until bias changed)
```

**RECOMMENDATION:**
- This filter assumes we want a "sweep and reject" pattern
- Consider: Is "closed through" actually a problem, or just strong momentum?
- **Option A:** Reduce requirement - allow entry if sweep occurs even without rejection
- **Option B:** Allow a small buffer (e.g., close within 50% of candle body beyond level)
- **Estimated impact:** Could add 100-150 trade opportunities per year

---

### 3. C2 Confirmation ❌❌ EXTREMELY STRICT  

**Total Attempts:** 157  
**Success:** 32 (20.4%)  
**Failed (closed through):** 125 (79.6%)

**PROBLEM:** Same issue as C1 - requiring "sweep + reject" is too strict.

After C1 is established, the strategy waits for another hourly candle to sweep C1. Again, 80% fail due to "closed through."

**Example Pattern:**
```
2/18/2025 - Multiple C2 failures in sequence:
  2:00 AM - Swept C1 but closed through - skip
  3:00 AM - Swept C1 but closed through - skip
  4:00 AM - Swept C1 but closed through - skip
  ... (9 consecutive rejections)
```

**RECOMMENDATION:**
- Same as C1 - consider relaxing the "rejection" requirement
- **Estimated impact:** Could add 50-75 trade opportunities per year

---

### 4. CISD Confirmation ❌❌❌ MOST RESTRICTIVE

**Total Checks:** 175  
**Success:** 20 (11.4%)  
**Failed:** 155 (88.6%)

**PROBLEM:** This is the **final killer** - requiring the M5 candle to break the opposing series is failing 9 out of 10 times.

#### Failure Margin Analysis:
```
Margins < 1 tick:   26 failures (16.8%) - BARELY MISSED
Margins 1-2 ticks:  20 failures (12.9%) - VERY CLOSE
Margins 2-5 ticks:  58 failures (37.4%) - CLOSE
Margins 5-10 ticks: 32 failures (20.6%) - MODERATE
Margins > 10 ticks: 19 failures (12.3%) - CLEAR MISS
```

**KEY INSIGHT:** 
- **46 failures (29.7%)** missed by less than 2 ticks
- **104 failures (67.1%)** missed by less than 5 ticks
- These are **extremely marginal** rejections

**Example CISD Failures:**
```
Close: 6274.75, Needed: 6274.25 (0.5 ticks short)
Close: 6296.00, Needed: 6296.00 (0.0 ticks - EXACT TIE!)
Close: 6301.75, Needed: 6301.50 (0.25 ticks short)
```

**RECOMMENDATION:**
- **Option A:** Add a tolerance buffer (1-2 ticks) to account for noise
- **Option B:** Reduce requirement from "break opposing series" to "approach opposing series"
- **Option C:** Use percentage-based threshold instead of exact price
- **Estimated impact:** Could add 40-60 trade opportunities per year

---

## Summary of Overly Strict Filters

| Filter | Current Pass Rate | Potential Issue | Estimated Recoverable Trades |
|--------|-------------------|-----------------|------------------------------|
| **Daily Bias (wick)** | 87.9% | Marginal (50-60% wicks rejected) | +10-15 setups/year |
| **C1 Confirmation** | 19.9% | **SEVERE** (80% rejection rate) | +100-150 trades/year |
| **C2 Confirmation** | 20.4% | **SEVERE** (80% rejection rate) | +50-75 trades/year |
| **CISD Confirmation** | 11.4% | **CRITICAL** (88% rejection, 67% < 5 ticks) | +40-60 trades/year |

---

## Recommended Actions (Priority Order)

### 🔴 HIGH PRIORITY
1. **CISD Tolerance Buffer**
   - Add 1-2 tick buffer to "break opposing series" requirement
   - Could immediately recover ~30% of failed CISDs (46 near-misses)
   
2. **C1 "Closed Through" Relaxation**
   - Allow entries when sweep occurs, even if candle closes through
   - Alternative: Allow close within 25-50% of candle range beyond level
   - This is the single biggest trade killer

### 🟡 MEDIUM PRIORITY
3. **C2 "Closed Through" Relaxation**
   - Same logic as C1
   - Less critical since many setups already filtered by C1

4. **Wick Threshold Adjustment**
   - Raise from 50% to 60% or 65%
   - Test with the 7 days in 50-55% range first

### 🟢 LOW PRIORITY (FOR TESTING)
5. **Alternative CISD Logic**
   - Instead of exact break, use percentage move toward opposing range
   - Could be more robust to market noise

---

## Next Steps

1. **Backtest Impact:** Modify filters one at a time and measure:
   - Trade count increase
   - Win rate impact
   - Profit factor change
   
2. **Start with CISD buffer** - easiest change, affects final stage only

3. **Then test C1 relaxation** - biggest potential impact

4. **Consider parameter optimization** for wick threshold and CISD tolerance

---

**Bottom Line:** The strategy is designed for extremely high probability setups, but may be over-filtering. The 88.6% CISD failure rate and 80% C1/C2 rejection rates suggest the filters are too strict, especially when many failures are marginal (< 5 ticks).

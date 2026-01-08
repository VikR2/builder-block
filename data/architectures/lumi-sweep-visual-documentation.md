# LumiTraders Liquidity Sweep - Complete Visual Documentation

## Overview

ICT-based liquidity sweep strategy with order block entry, optimized for ES (E-mini S&P 500). Features multi-timeframe analysis, CISD confirmation, and 11AM fade strategy.

**Source:** https://youtu.be/-D_JBnsMsAA

---

## 1. Multi-Timeframe Hierarchy

```mermaid
flowchart TB
    subgraph DAILY["DAILY - Bias Filter (V4)"]
        direction TB
        D1[SMA Trend Detection]
        D2[Bullish/Bearish Bias]
        D1 --> D2
    end

    subgraph HTF["HTF - Sweep Detection"]
        direction LR
        subgraph H1_TF["H1 (60min)"]
            H1_1[Swing High/Low]
            H1_2[Sweep Detection]
        end
        subgraph M30_TF["M30 (30min)"]
            M30_1[Swing High/Low]
            M30_2[Sweep Detection]
        end
    end

    subgraph LTF["LTF - Entry"]
        direction LR
        subgraph M5_TF["M5 (5min)"]
            M5_1[OB for H1 Sweep]
            M5_2[CISD Confirm]
        end
        subgraph M3_TF["M3 (3min)"]
            M3_1[OB for M30 Sweep]
            M3_2[CISD Confirm]
        end
    end

    DAILY -->|"Direction Filter"| HTF
    H1_TF -->|"Sweep Signal"| M5_TF
    M30_TF -->|"Sweep Signal"| M3_TF

    style DAILY fill:#1a1a2e,stroke:#e94560,color:#fff
    style HTF fill:#16213e,stroke:#0f3460,color:#fff
    style LTF fill:#0f3460,stroke:#e94560,color:#fff
```

---

## 2. Complete State Machine

```mermaid
stateDiagram-v2
    [*] --> WAITING_FOR_SESSION: Strategy Start

    WAITING_FOR_SESSION --> SCANNING_FOR_HTF_LEVEL: Session Opens (9AM)

    SCANNING_FOR_HTF_LEVEL --> WAITING_FOR_SWEEP: HTF Levels Identified

    WAITING_FOR_SWEEP --> WAITING_FOR_CISD: Sweep Detected (RequireCISD=true)
    WAITING_FOR_SWEEP --> WAITING_FOR_OB_RETURN: Sweep Detected (RequireCISD=false)

    WAITING_FOR_CISD --> WAITING_FOR_OB_RETURN: CISD Confirmed

    WAITING_FOR_OB_RETURN --> ENTRY_TRIGGERED: OB Respected

    ENTRY_TRIGGERED --> WAITING_FOR_FADE_CISD: 11AM Fade Window
    ENTRY_TRIGGERED --> MANAGING_TRADE: Normal Entry

    state "V5: 11AM Fade Flow" as fade {
        WAITING_FOR_FADE_CISD --> WAITING_FOR_FADE_OB: Opposite CISD
        WAITING_FOR_FADE_OB --> FADE_ENTRY_TRIGGERED: Fade OB Respected
    }

    FADE_ENTRY_TRIGGERED --> MANAGING_TRADE: Fade Entry

    MANAGING_TRADE --> TRADE_COMPLETE: Position Closed

    TRADE_COMPLETE --> SCANNING_FOR_HTF_LEVEL: Still in Session
    TRADE_COMPLETE --> WAITING_FOR_SESSION: Session Ended

    note right of WAITING_FOR_CISD: Close vs Open comparison
    note right of ENTRY_TRIGGERED: 11AM check here
    note right of MANAGING_TRADE: Partials + Trailing
```

---

## 3. Timeframe Pairing Logic

```mermaid
flowchart TD
    subgraph MODE["MTFMode Selection"]
        M1{TimeframePair Setting}
        M1 -->|H1_M5| PAIR1["H1 Sweep -> M5 OB"]
        M1 -->|M30_M3| PAIR2["M30 Sweep -> M3 OB"]
        M1 -->|Both| PAIR3["Either Pair Valid"]
    end

    subgraph ACTIVE["Active TF Tracking"]
        A1["activeSweepTF = 1 (H1) or 2 (M30)"]
        A2["activeOBTF = 0 (M5) or 3 (M3)"]
    end

    PAIR1 --> A1
    PAIR2 --> A1
    PAIR3 --> A1
    A1 --> A2
```

---

## 4. Sweep Detection Flow

```mermaid
flowchart TD
    subgraph HTF_SCAN["HTF Bar Update (H1 or M30)"]
        S1[Calculate Swing High/Low]
        S2{Price Action}
    end

    subgraph LOW_SWEEP["Bullish Setup"]
        L1["Low < SwingLow - Threshold"]
        L2["Close > SwingLow"]
        L3["= Sweep + Reclaim"]
        L1 --> L2 --> L3
    end

    subgraph HIGH_SWEEP["Bearish Setup"]
        H1["High > SwingHigh + Threshold"]
        H2["Close < SwingHigh"]
        H3["= Sweep + Rejection"]
        H1 --> H2 --> H3
    end

    subgraph FILTERS["Pre-Sweep Filters"]
        F1{Premium/Discount Filter}
        F1 -->|In Premium| NO_LONG["Block Longs"]
        F1 -->|In Discount| NO_SHORT["Block Shorts"]
        F1 -->|Neutral| ALLOW["Allow Both"]
    end

    S1 --> S2
    S2 -->|Low Break| LOW_SWEEP
    S2 -->|High Break| HIGH_SWEEP
    FILTERS --> S2

    L3 --> CISD_CHECK
    H3 --> CISD_CHECK

    CISD_CHECK{RequireCISD?}
    CISD_CHECK -->|Yes| WAIT_CISD[WAITING_FOR_CISD]
    CISD_CHECK -->|No| FIND_OB[Find Order Block]
```

---

## 5. CISD Confirmation (Change in State of Delivery)

```mermaid
flowchart TB
    subgraph BULLISH_CISD["Bullish CISD (After Low Sweep)"]
        BC1["Store: cisdCandleOpen = HTF candle open"]
        BC2["Wait for LTF candle"]
        BC3{"LTF Close > cisdCandleOpen?"}
        BC4["CISD CONFIRMED"]
        BC1 --> BC2 --> BC3
        BC3 -->|Yes| BC4
    end

    subgraph BEARISH_CISD["Bearish CISD (After High Sweep)"]
        RC1["Store: cisdCandleOpen = HTF candle open"]
        RC2["Wait for LTF candle"]
        RC3{"LTF Close < cisdCandleOpen?"}
        RC4["CISD CONFIRMED"]
        RC1 --> RC2 --> RC3
        RC3 -->|Yes| RC4
    end

    subgraph TIMEOUT["Timeout Check"]
        T1["If CurrentBar - cisdCandleBar > OBLookback * 3"]
        T2["Reset and return to WAITING_FOR_SWEEP"]
    end

    BC4 --> FIND_OB[Find Order Block]
    RC4 --> FIND_OB
```

---

## 6. Order Block Detection & Entry

```mermaid
flowchart TD
    subgraph OB_FIND["FindOrderBlock(direction)"]
        F1{Sweep Direction}
        F1 -->|Bullish (1)| BULL_OB["Find last BEARISH candle\n(Close < Open)"]
        F1 -->|Bearish (-1)| BEAR_OB["Find last BULLISH candle\n(Close > Open)"]
    end

    subgraph OB_ZONE["Order Block Zone"]
        Z1["orderBlockHigh = High[i]"]
        Z2["orderBlockLow = Low[i]"]
        Z3["obPullbackLevel = OBLow + (Range * PullbackPercent)"]
    end

    subgraph OB_RETURN["Wait for OB Return"]
        R1{Price enters OB zone?}
        R2{Pullback >= 50% into OB?}
        R3{Close respects OB?}
        R4["OB RESPECTED - Entry Ready"]

        R1 -->|Yes| R2
        R2 -->|Yes| R3
        R3 -->|Yes| R4
    end

    BULL_OB --> Z1 --> Z2 --> Z3
    BEAR_OB --> Z1
    Z3 --> R1

    style R4 fill:#00aa55,color:#fff
```

---

## 7. Premium/Discount Zone Filter

```mermaid
flowchart LR
    subgraph CALC["Zone Calculation"]
        C1["dailyRangeHigh = Previous Day High"]
        C2["dailyRangeLow = Previous Day Low"]
        C3["equilibrium = Low + (Range * 50%)"]
    end

    subgraph ZONES["Zone Detection"]
        Z1{Current Price vs Equilibrium}
        Z1 -->|Price > EQ| PREMIUM["PREMIUM ZONE\n(Shorts Only)"]
        Z1 -->|Price < EQ| DISCOUNT["DISCOUNT ZONE\n(Longs Only)"]
    end

    C1 --> C3
    C2 --> C3
    C3 --> Z1

    style PREMIUM fill:#ff4444,color:#fff
    style DISCOUNT fill:#00aa55,color:#fff
```

---

## 8. V5: 11AM Fade Strategy

```mermaid
flowchart TD
    subgraph TRIGGER["Fade Trigger Check"]
        T1["ENTRY_TRIGGERED state reached"]
        T2{Time between 11AM-12PM?}
        T3{Use11AMFade enabled?}
    end

    subgraph FADE_MODE["Enter Fade Mode"]
        F1["is11AMFadeMode = true"]
        F2["originalSignalWasLong = (sweepDirection == 1)"]
        F3["fadeSwingLevel = sweepPrice (for stop)"]
    end

    subgraph FADE_CISD["Wait for Opposite CISD"]
        FC1{Original was Long?}
        FC1 -->|Yes| FC2["Wait for BEARISH CISD\n(Close < Open)"]
        FC1 -->|No| FC3["Wait for BULLISH CISD\n(Close > Open)"]
    end

    subgraph FADE_OB["Find Fade Order Block"]
        FO1["FindFadeOrderBlock(opposite direction)"]
        FO2["Wait for price to return to OB"]
        FO3["Check pullback requirement"]
    end

    subgraph FADE_ENTRY["Execute Fade Trade"]
        FE1["tradeDirection = OPPOSITE of original"]
        FE2["Stop = fadeSwingLevel (the trap)"]
        FE3["Target = 2R from OB"]
    end

    T1 --> T2
    T2 -->|Yes| T3
    T3 -->|Yes| F1
    F1 --> F2 --> F3
    F3 --> FC1
    FC2 --> FO1
    FC3 --> FO1
    FO1 --> FO2 --> FO3
    FO3 --> FE1 --> FE2 --> FE3

    T2 -->|No| NORMAL["Normal Entry"]
    T3 -->|No| NORMAL

    style FADE_ENTRY fill:#cc6600,color:#fff
```

---

## 9. Complete Trade Flow

```mermaid
flowchart TD
    subgraph SESSION["Session Check"]
        A1([9AM Session Open])
        A2[Scan for HTF Swing Levels]
    end

    subgraph HTF_SETUP["HTF Setup (H1/M30)"]
        B1[Identify Swing High/Low]
        B2{Sweep Detected?}
        B3[Store sweep info]
    end

    subgraph CONFIRM["Confirmation (LTF)"]
        C1{CISD Required?}
        C2[Wait for CISD]
        C3[Find Order Block]
        C4{Price returns to OB?}
        C5{OB Respected?}
    end

    subgraph ENTRY_GATE["Entry Gate"]
        D1{11AM Window?}
        D2[Normal Entry]
        D3[Fade Mode]
    end

    subgraph EXECUTION["Trade Execution"]
        E1[Calculate Stop at Sweep Level]
        E2[Calculate 2R Target from OB]
        E3{Valid Setup?}
        E4[ENTER TRADE]
    end

    subgraph MANAGEMENT["Trade Management"]
        M1[Monitor Position]
        M2{1R Profit?}
        M3[Take 50% Partial]
        M4[Move to Breakeven]
        M5[Trail Stop to Swings]
        M6{Consolidation?}
        M7[Cut Trade Early]
    end

    A1 --> A2 --> B1
    B1 --> B2
    B2 -->|Yes| B3
    B3 --> C1
    C1 -->|Yes| C2
    C1 -->|No| C3
    C2 --> C3
    C3 --> C4
    C4 -->|Yes| C5
    C5 -->|Yes| D1
    D1 -->|Yes + Fade On| D3
    D1 -->|No| D2
    D2 --> E1
    D3 --> E1
    E1 --> E2 --> E3
    E3 -->|Stop <= 150 ticks| E4
    E4 --> M1
    M1 --> M2
    M2 -->|Yes| M3
    M3 --> M4
    M4 --> M5
    M5 --> M6
    M6 -->|Yes, 5+ bars| M7

    style E4 fill:#0066cc,color:#fff
    style M3 fill:#00aa55,color:#fff
```

---

## 10. Trade Management (V3)

```mermaid
flowchart LR
    subgraph PARTIALS["Partial Profits"]
        P1["At 1R profit"]
        P2["Exit 50% position"]
        P3["partialTaken = true"]
        P1 --> P2 --> P3
    end

    subgraph BREAKEVEN["Breakeven"]
        BE1["At 1R profit"]
        BE2["Move stop to entry"]
        BE3["breakevenSet = true"]
        BE1 --> BE2 --> BE3
    end

    subgraph TRAILING["Trailing Stop (TTrades Skill #12)"]
        T1["Only after partial taken"]
        T2["Find recent swing"]
        T3["Trail to swing - buffer"]
        T4["Only move in profit direction"]
        T1 --> T2 --> T3 --> T4
    end

    subgraph CONSOLIDATION["Consolidation Cut"]
        C1["Track range for N bars"]
        C2{"Range < threshold?"}
        C3["Cut trade early"]
        C1 --> C2
        C2 -->|5+ bars| C3
    end

    PARTIALS --> BREAKEVEN
    BREAKEVEN --> TRAILING
    TRAILING --> CONSOLIDATION
```

---

## 11. Risk Management Rules

```mermaid
flowchart TB
    subgraph STOP_CALC["Stop Placement"]
        S1["LONG: sweepPrice - StopBufferTicks"]
        S2["SHORT: sweepPrice + StopBufferTicks"]
    end

    subgraph TARGET_CALC["2R Target Calculation"]
        T1["idealRisk = abs(idealEntryPrice - stopLoss)"]
        T2["LONG: idealEntry + (2 * idealRisk)"]
        T3["SHORT: idealEntry - (2 * idealRisk)"]
    end

    subgraph VALIDATION["Entry Validation"]
        V1{"Stop Distance <= 150 ticks?"}
        V2{"Stop Distance > 0?"}
        V3{"Target in correct direction?"}
        V4["VALID - Execute Entry"]
        V5["INVALID - Skip Trade"]

        V1 -->|Yes| V2
        V2 -->|Yes| V3
        V3 -->|Yes| V4
        V1 -->|No| V5
        V2 -->|No| V5
        V3 -->|No| V5
    end

    S1 --> T1
    S2 --> T1
    T1 --> T2 --> V1
    T1 --> T3 --> V1

    style V4 fill:#00aa55,color:#fff
    style V5 fill:#aa0000,color:#fff
```

---

## 12. Session Timeline

```mermaid
gantt
    title LumiTraders ES - Daily Session Timeline
    dateFormat HH:mm
    axisFormat %H:%M

    section Session Windows
    Pre-Market : done, 06:00, 3h
    AM Session (Active) : crit, 09:00, 3h
    11AM Fade Window : active, 11:00, 1h
    PM Session (Avoided) : done, 13:00, 3h
    Session Close : done, 16:00, 2h

    section Typical Flow
    Scan HTF Levels : 09:00, 30m
    Wait for Sweep : 09:30, 1h
    CISD + OB Setup : 10:30, 30m
    Entry Window : 11:00, 1h
    Trade Management : 12:00, 1h
```

---

## 13. Data Series Index Reference

| Index | Timeframe | Purpose |
|-------|-----------|---------|
| 0 | M5 (5-min) | Primary chart, OB entry for H1 sweeps |
| 1 | H1 (60-min) | HTF sweep detection |
| 2 | M30 (30-min) | HTF sweep detection |
| 3 | M3 (3-min) | OB entry for M30 sweeps |
| 4 | Daily | HTF bias filter (V4) |

---

## 14. Key Concepts Summary

| Concept | Description | Key Variable |
|---------|-------------|--------------|
| HTF Sweep | Wick beyond swing level, close back inside | `sweepDetected`, `sweepDirection` |
| CISD | Close breaks opposing candle's open | `cisdConfirmed`, `cisdCandleOpen` |
| Order Block | Last opposing candle before sweep | `orderBlockHigh/Low` |
| OB Pullback | Price must enter 50% into OB | `OBPullbackPercent` |
| Premium/Discount | Previous day range divided at 50% | `inPremiumZone`, `inDiscountZone` |
| 11AM Fade | Trade opposite direction during 11-12 | `is11AMFadeMode`, `originalSignalWasLong` |
| Partial Profit | Exit 50% at 1R | `partialTaken`, `PartialPercent` |
| Trailing Stop | Follow protected swings | `trailingSwingLevel` |

---

## 15. Backtest Results (Reference)

| Metric | Value |
|--------|-------|
| Net P&L | $10,150 |
| Win Rate | 80.56% |
| Profit Factor | 8.20 |
| Day Win % | 84.21% |
| Avg Win/Loss | 1.98R |
| Zella Score | 89.61/100 |

---

*Generated from LumiTradersLiquiditySweepESStrategy.cs analysis*

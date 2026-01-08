# TTrades Fractal Model - Complete Visual Documentation

## Overview

This document provides comprehensive Mermaid diagrams to visualize the TTrades Fractal Model (TTFM) for multi-timeframe analysis. Based on V11 implementation.

---

## 1. Multi-Timeframe Hierarchy

```mermaid
flowchart TB
    subgraph DAILY["DAILY TIMEFRAME"]
        direction TB
        D1[PDH/PDL Calculation]
        D2[Sweep Detection]
        D3[Bias Determination]
        D1 --> D2 --> D3
    end

    subgraph H1["H1 TIMEFRAME - Confirm TF"]
        direction TB
        H1_1[FVG Detection]
        H1_2[Structure Tracking]
        H1_3[Swing High/Low Tracking]
        H1_4[H1 CISD Confirmation]
        H1_1 --> H1_2
        H1_3 --> H1_4
    end

    subgraph M5["M5 TIMEFRAME - Entry TF"]
        direction TB
        M5_1[FVG Touch Gate]
        M5_2[Opposing Series Count]
        M5_3[CISD Detection]
        M5_4[Order Block Formation]
        M5_5[Entry Execution]
        M5_1 --> M5_2 --> M5_3 --> M5_4 --> M5_5
    end

    DAILY -->|"Bias Direction"| H1
    H1 -->|"FVG Zone + Structure"| M5

    style DAILY fill:#1a1a2e,stroke:#e94560,color:#fff
    style H1 fill:#16213e,stroke:#0f3460,color:#fff
    style M5 fill:#0f3460,stroke:#e94560,color:#fff
```

---

## 2. Complete State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle: Session Start

    Idle --> WaitingForSweep: PDH/PDL Calculated

    WaitingForSweep --> BiasSet: PDL Swept + Reclaimed (BULLISH)
    WaitingForSweep --> BiasSet: PDH Swept + Rejected (BEARISH)

    BiasSet --> WaitingForH1FVG: Bias Confirmed

    WaitingForH1FVG --> H1FVGIdentified: H1 FVG Detected

    H1FVGIdentified --> WaitingForFVGTouch: FVG Zone Set
    WaitingForFVGTouch --> PriceInH1FVG: Price Touches FVG

    PriceInH1FVG --> CisdConfirmed: M5 CISD + OB Formed

    CisdConfirmed --> InTrade: Entry Executed

    InTrade --> PriceInH1FVG: Trade Closed (Win/Loss)
    InTrade --> Idle: Session End

    note right of Idle: Daily Reset\nClears all state
    note right of BiasSet: Direction locked\nfor entire day
    note right of H1FVGIdentified: Zone preserved\nuntil filled
    note right of CisdConfirmed: OB valid for\n12 M5 bars (1hr)
```

---

## 3. Bias Determination Flow (Daily)

```mermaid
flowchart TD
    subgraph SESSION["New Trading Day"]
        START([Session Open])
        PDH[Calculate PDH from Prior Day]
        PDL[Calculate PDL from Prior Day]
    end

    subgraph SWEEP["Sweep Detection"]
        WAIT{Waiting for Sweep}

        PDL_SWEEP["Low < PDL?"]
        PDL_RECLAIM["Close > PDL?"]

        PDH_SWEEP["High > PDH?"]
        PDH_REJECT["Close < PDH?"]
    end

    subgraph BIAS["Bias Confirmation"]
        BULL[/"BULLISH BIAS"/]
        BEAR[/"BEARISH BIAS"/]
    end

    START --> PDH & PDL
    PDH & PDL --> WAIT

    WAIT --> PDL_SWEEP
    PDL_SWEEP -->|Yes| PDL_RECLAIM
    PDL_RECLAIM -->|Yes| BULL

    WAIT --> PDH_SWEEP
    PDH_SWEEP -->|Yes| PDH_REJECT
    PDH_REJECT -->|Yes| BEAR

    style BULL fill:#00ff88,stroke:#00aa55,color:#000
    style BEAR fill:#ff4444,stroke:#aa0000,color:#fff
```

---

## 4. H1 FVG Detection

```mermaid
flowchart LR
    subgraph BULLISH_FVG["Bullish FVG - Gap UP"]
        direction TB
        B1["Candle [2]"]
        B2["Candle [1]"]
        B3["Candle [0]"]

        B1 --> B2 --> B3

        GAP_UP["GAP: Candle[0].Low > Candle[2].High"]
        ZONE_B["FVG Zone:\nTop = Candle[0].Low\nBottom = Candle[2].High"]

        GAP_UP --> ZONE_B
    end

    subgraph BEARISH_FVG["Bearish FVG - Gap DOWN"]
        direction TB
        R1["Candle [2]"]
        R2["Candle [1]"]
        R3["Candle [0]"]

        R1 --> R2 --> R3

        GAP_DN["GAP: Candle[0].High < Candle[2].Low"]
        ZONE_R["FVG Zone:\nTop = Candle[2].Low\nBottom = Candle[0].High"]

        GAP_DN --> ZONE_R
    end

    style BULLISH_FVG fill:#1a472a,stroke:#00ff88
    style BEARISH_FVG fill:#4a1a1a,stroke:#ff4444
```

---

## 5. FVG Touch Gate (Critical V11 Feature)

```mermaid
sequenceDiagram
    participant Price as Price Action
    participant FVG as H1 FVG Zone
    participant State as Strategy State
    participant M5 as M5 Entry Logic

    Note over FVG: FVG Zone Identified<br/>Top: 6105.25<br/>Bottom: 6102.00

    Price->>FVG: Price approaches zone

    alt Bullish Setup
        Price->>FVG: Low touches/enters FVG Top
        FVG->>State: State = PriceInH1FVG
        State->>M5: Enable M5 CISD Detection
    else Bearish Setup
        Price->>FVG: High touches/enters FVG Bottom
        FVG->>State: State = PriceInH1FVG
        State->>M5: Enable M5 CISD Detection
    end

    Note over M5: Without FVG touch,<br/>NO M5 entries allowed!
```

---

## 6. CISD Pattern (Change in State of Delivery)

```mermaid
flowchart TB
    subgraph CISD_CONCEPT["CISD = Momentum Shift Confirmation"]
        direction TB

        subgraph OPPOSING["Step 1: Opposing Series"]
            OPP1["Count bearish candles\n(in bullish setup)"]
            OPP2["Track first candle's OPEN"]
            OPP3["Min 1, Max 5 candles"]
            OPP1 --> OPP2 --> OPP3
        end

        subgraph CONFIRM["Step 2: Confirming Candle"]
            CONF1["Candle in BIAS direction"]
            CONF2["CLOSE breaks opposing series OPEN"]
            CONF3["This candle = ORDER BLOCK"]
            CONF1 --> CONF2 --> CONF3
        end

        OPPOSING --> CONFIRM
    end

    subgraph BULLISH_CISD["Bullish CISD Example"]
        BC1["Bear candle 1 - open=6100"]
        BC2["Bear candle 2"]
        BC3["Bull candle CLOSES > 6100"]
        BC4["CISD CONFIRMED"]
        BC1 --> BC2 --> BC3 --> BC4
    end

    subgraph BEARISH_CISD["Bearish CISD Example"]
        RC1["Bull candle 1 - open=6100"]
        RC2["Bull candle 2"]
        RC3["Bear candle CLOSES < 6100"]
        RC4["CISD CONFIRMED"]
        RC1 --> RC2 --> RC3 --> RC4
    end
```

---

## 7. Order Block Formation & Entry

```mermaid
flowchart TD
    subgraph OB_FORMATION["Order Block = CISD Confirming Candle"]
        direction TB

        CISD_CANDLE["CISD Confirming Candle"]

        subgraph BODY["BODY - Critical for Stops"]
            BODY_HIGH["Body High = max(open, close)"]
            BODY_LOW["Body Low = min(open, close)"]
        end

        subgraph WICK["WICK - Reference Only"]
            WICK_HIGH["Wick High = candle high"]
            WICK_LOW["Wick Low = candle low"]
        end

        CISD_CANDLE --> BODY
        CISD_CANDLE --> WICK
    end

    subgraph ENTRY["Entry Logic - V11"]
        ENTRY_PRICE["Entry = OB Close Price"]
        NOTE1["NOT 50% of OB!"]
    end

    subgraph STOP["Stop Placement - V11 Critical Fix"]
        STOP_LONG["LONG: Stop = OB Body Low - Buffer"]
        STOP_SHORT["SHORT: Stop = OB Body High + Buffer"]
        NOTE2["Using BODY, not WICK\n= Tighter stops (10-15 ticks vs 20-40)"]
    end

    OB_FORMATION --> ENTRY
    OB_FORMATION --> STOP

    style BODY fill:#0066cc,stroke:#0044aa,color:#fff
    style STOP fill:#cc6600,stroke:#aa4400,color:#fff
```

---

## 8. Complete Trade Flow (Happy Path)

```mermaid
flowchart TD
    subgraph DAY["DAILY SETUP"]
        A1([New Session]) --> A2[Calculate PDH/PDL]
        A2 --> A3{Price Sweeps Level?}
        A3 -->|PDL Swept + Reclaimed| A4[BULLISH]
        A3 -->|PDH Swept + Rejected| A5[BEARISH]
    end

    subgraph H1_FLOW["H1 STRUCTURE"]
        B1[Wait for H1 FVG in Bias Direction]
        B2[H1 FVG Forms]
        B3[FVG Zone Identified]
        B1 --> B2 --> B3
    end

    subgraph M5_FLOW["M5 ENTRY"]
        C1{Price Enters FVG Zone?}
        C2[Track Opposing Series]
        C3{CISD Confirmed?}
        C4[Order Block Formed]
        C5[Calculate Entry/Stop/Target]
        C6{Valid Setup?}
        C7[EXECUTE ENTRY]

        C1 -->|Yes| C2
        C2 --> C3
        C3 -->|Yes| C4
        C4 --> C5
        C5 --> C6
        C6 -->|Stop <= 20 ticks\nR:R >= 2| C7
        C6 -->|Invalid| C8[Skip Trade]
    end

    subgraph MANAGEMENT["TRADE MANAGEMENT"]
        D1[In Trade]
        D2{Profit >= 1R?}
        D3[Move Stop to Breakeven]
        D4{Outcome?}
        D5[Target Hit - Reset Losses]
        D6[Stop Hit - Count Loss]
        D7{3 Consecutive Losses?}
        D8[Circuit Breaker - Wait for Next Day]

        D1 --> D2
        D2 -->|Yes| D3
        D3 --> D4
        D2 -->|No| D4
        D4 -->|Win| D5
        D4 -->|Loss| D6
        D6 --> D7
        D7 -->|Yes| D8
        D7 -->|No| C1
        D5 --> C1
    end

    A4 --> B1
    A5 --> B1
    B3 --> C1
    C7 --> D1

    style A4 fill:#00aa55,color:#fff
    style A5 fill:#aa0000,color:#fff
    style C7 fill:#0066cc,color:#fff
    style D5 fill:#00aa55,color:#fff
    style D6 fill:#aa0000,color:#fff
```

---

## 9. Risk Management Rules

```mermaid
flowchart LR
    subgraph FILTERS["Pre-Entry Filters"]
        F1["Max Stop: 20 ticks"]
        F2["Min Stop: 4 ticks"]
        F3["Min R:R: 2.0"]
        F4["Session: 9AM-4PM ET"]
        F5["Circuit Breaker: 3 losses"]
    end

    subgraph STOP_CALC["Stop Calculation - V11"]
        S1["LONG:\nstop = OB_BODY_LOW - 3 ticks"]
        S2["SHORT:\nstop = OB_BODY_HIGH + 3 ticks"]
    end

    subgraph TARGET_CALC["Target Calculation"]
        T1["Default: Entry + (Risk x R:R)"]
        T2["Alternative: PDH/PDL if closer"]
    end

    subgraph BREAKEVEN["Breakeven Logic"]
        BE1["At 1R profit"]
        BE2["Move stop to Entry + 1 tick"]
    end

    FILTERS --> STOP_CALC
    STOP_CALC --> TARGET_CALC
    TARGET_CALC --> BREAKEVEN
```

---

## 10. Data Flow Architecture

```mermaid
flowchart TB
    subgraph DATA_SERIES["NinjaTrader Data Series"]
        DS_M5["IDX_M5 = 0\nPrimary Chart (5-minute)"]
        DS_H1["IDX_H1 = 1\nSecondary Series (60-minute)"]
    end

    subgraph VARIABLES["Key State Variables"]
        direction LR

        subgraph DAILY_VARS["Daily"]
            V1["pdh, pdl"]
            V2["pdhSwept, pdlSwept"]
            V3["dailyBias"]
        end

        subgraph H1_VARS["H1"]
            V4["h1FvgTop, h1FvgBottom"]
            V5["h1FvgValid"]
            V6["h1SwingHigh1/2, h1SwingLow1/2"]
            V7["h1StructureConfirmed"]
        end

        subgraph M5_VARS["M5"]
            V8["m5OBBodyHigh, m5OBBodyLow"]
            V9["m5OBEntry, m5OBValid"]
            V10["m5OpposingSeriesCount"]
            V11["m5OpposingSeriesOpen"]
        end

        subgraph TRADE_VARS["Trade"]
            V12["entryPrice, stopPrice, targetPrice"]
            V13["breakevenSet, riskAmount"]
            V14["consecutiveLosses"]
        end
    end

    subgraph EVENT_HANDLERS["Event Flow"]
        E1["OnBarUpdate()"]
        E2["BarsInProgress == IDX_M5?"]
        E3["ProcessM5Bar()"]
        E4["BarsInProgress == IDX_H1?"]
        E5["UpdateH1Swings()\nDetectH1FVG()\nCheckH1CISD()"]

        E1 --> E2
        E2 -->|Yes| E3
        E1 --> E4
        E4 -->|Yes| E5
    end

    DS_M5 --> E2
    DS_H1 --> E4
```

---

## 11. Session Timeline

```mermaid
gantt
    title TTrades Fractal Model - Daily Session Timeline
    dateFormat HH:mm
    axisFormat %H:%M

    section Session
    Pre-Market (No Trading) : done, 06:00, 3h
    NY Session Open : crit, 09:00, 7h
    NY Session Close : done, 16:00, 2h

    section Daily Setup
    Calculate PDH/PDL : milestone, 09:00, 0h
    Wait for Sweep : 09:00, 2h

    section Typical Flow
    Bias Set (Sweep) : 09:30, 30m
    H1 FVG Forms : 10:00, 1h
    FVG Touch : 11:00, 1h
    M5 Entry Setup : 12:00, 2h
    Trade Management : 14:00, 2h
```

---

## 12. Key Concepts Summary

| Concept | Timeframe | Purpose | Key Variable |
|---------|-----------|---------|--------------|
| PDH/PDL | Daily | Liquidity levels for sweep | `pdh`, `pdl` |
| Sweep | Daily | Bias determination | `pdhSwept`, `pdlSwept` |
| Bias | Daily | Trade direction filter | `dailyBias` |
| FVG | H1 | Structure zone (entry area) | `h1FvgTop`, `h1FvgBottom` |
| FVG Touch | H1->M5 | Gate to enable M5 entries | `currentState` |
| CISD | H1/M5 | Momentum shift confirmation | `m5OpposingSeriesOpen` |
| Order Block | M5 | Entry candle (CISD confirming) | `m5OBBodyHigh/Low` |
| Stop | M5 | Risk anchor (OB BODY, not wick) | `stopPrice` |

---

## 13. Version Evolution

| Version | Key Changes |
|---------|-------------|
| V6 | Base fractal model with CISD |
| V7 | Added swing tracking on H1 |
| V8 | H1 structure validation (lower highs/higher lows) |
| V9a | Faster swing detection, preserve swing history |
| V9b | Alternative approach exploration |
| V10 | FVG zone refinements |
| V11 | **FVG Touch Gate + OB Body stops (10-15 ticks vs 20-40)** |

---

*Generated from TTradesFractalModelV11.cs analysis*

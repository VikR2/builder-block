# TTrades Fractal Model - Unified Flowchart

Copy-paste ready single flowchart for the complete TTFM strategy.

---

## Complete Strategy Flow (Copy This)

```
flowchart TD
    subgraph SESSION["SESSION START"]
        A1([9AM NY Open])
        A2[Calculate PDH/PDL from Prior Day]
        A1 --> A2
    end

    subgraph DAILY_SWEEP["DAILY SWEEP DETECTION"]
        DS1{Price Action vs PDH/PDL?}
        DS1 -->|Low < PDL| DS2{Close > PDL?}
        DS2 -->|Yes - Reclaimed| DS3[BULLISH BIAS]
        DS1 -->|High > PDH| DS4{Close < PDH?}
        DS4 -->|Yes - Rejected| DS5[BEARISH BIAS]
    end

    subgraph H1_FVG["H1 FVG DETECTION"]
        FV1[Monitor H1 Candles]
        FV2{Gap Between Candles?}
        FV2 -->|Bullish: C0.Low > C2.High| FV3[Bullish FVG Zone]
        FV2 -->|Bearish: C0.High < C2.Low| FV4[Bearish FVG Zone]
        FV3 --> FV5[FVG Top/Bottom Set]
        FV4 --> FV5
        FV1 --> FV2
    end

    subgraph H1_STRUCTURE["H1 STRUCTURE VALIDATION"]
        ST1[Track H1 Swing High/Low]
        ST2{Structure Aligned with Bias?}
        ST2 -->|Bullish: Higher Lows| ST3[Structure Confirmed]
        ST2 -->|Bearish: Lower Highs| ST3
    end

    subgraph FVG_TOUCH["FVG TOUCH GATE - Critical"]
        TG1{Price Enters H1 FVG Zone?}
        TG1 -->|Bullish: Low touches FVG Top| TG2[FVG TOUCHED]
        TG1 -->|Bearish: High touches FVG Bottom| TG2
        TG2 --> TG3[Enable M5 CISD Detection]
    end

    subgraph M5_OPPOSING["M5 OPPOSING SERIES"]
        OP1[Count Opposing Candles]
        OP2[Store First Candle OPEN]
        OP3{1-5 Opposing Candles?}
        OP3 -->|Yes| OP4[Series Valid]
        OP1 --> OP2 --> OP3
    end

    subgraph M5_CISD["M5 CISD CONFIRMATION"]
        CI1{Candle in Bias Direction?}
        CI1 -->|Yes| CI2{Close Breaks Opposing Open?}
        CI2 -->|Bullish: Close > Open| CI3[CISD CONFIRMED]
        CI2 -->|Bearish: Close < Open| CI3
    end

    subgraph ORDER_BLOCK["ORDER BLOCK FORMATION"]
        OB1[CISD Candle = Order Block]
        OB2[Body High = max open,close]
        OB3[Body Low = min open,close]
        OB4[Entry = OB Close Price]
        OB1 --> OB2 --> OB3 --> OB4
    end

    subgraph RISK_CALC["RISK CALCULATION - V11"]
        RK1[LONG: Stop = OB Body Low - 3 ticks]
        RK2[SHORT: Stop = OB Body High + 3 ticks]
        RK3[Risk = Entry to Stop]
        RK4[Target = Entry + Risk x 2R]
        RK1 --> RK3
        RK2 --> RK3
        RK3 --> RK4
    end

    subgraph VALIDATION["ENTRY VALIDATION"]
        VL1{Stop <= 20 ticks?}
        VL1 -->|No| VL_SKIP[SKIP - Stop Too Wide]
        VL1 -->|Yes| VL2{Stop >= 4 ticks?}
        VL2 -->|No| VL_SKIP2[SKIP - Stop Too Tight]
        VL2 -->|Yes| VL3{R:R >= 2.0?}
        VL3 -->|Yes| EXECUTE
        VL3 -->|No| VL_SKIP3[SKIP - Bad R:R]
    end

    subgraph EXECUTE["EXECUTE TRADE"]
        EX1[ENTER POSITION]
    end

    subgraph MANAGEMENT["TRADE MANAGEMENT"]
        MG1[Monitor Position]
        MG2{Profit >= 1R?}
        MG2 -->|Yes| MG3[Move Stop to Breakeven]
        MG3 --> MG4{Outcome?}
        MG2 -->|No| MG4
        MG4 -->|Target Hit| WIN[WIN - Reset Loss Count]
        MG4 -->|Stop Hit| LOSS[LOSS - Increment Count]
    end

    subgraph CIRCUIT_BREAKER["CIRCUIT BREAKER"]
        CB1{3 Consecutive Losses?}
        CB1 -->|Yes| CB2[STOP TRADING TODAY]
        CB1 -->|No| RESET
    end

    subgraph RESET["RESET FOR NEXT TRADE"]
        RS1[Clear M5 OB State]
        RS2[Keep Bias + H1 FVG]
        RS3[Return to FVG Touch Gate]
        RS1 --> RS2 --> RS3
    end

    subgraph SESSION_END["SESSION END"]
        SE1([4PM - Session Close])
        SE2[Clear All State]
        SE3[Wait for Next Day]
        SE1 --> SE2 --> SE3
    end

    A2 --> DAILY_SWEEP
    DS3 --> H1_FVG
    DS5 --> H1_FVG
    FV5 --> H1_STRUCTURE
    ST3 --> FVG_TOUCH
    TG3 --> M5_OPPOSING
    OP4 --> M5_CISD
    CI3 --> ORDER_BLOCK
    OB4 --> RISK_CALC
    RK4 --> VALIDATION
    EXECUTE --> MANAGEMENT
    WIN --> RESET
    LOSS --> CIRCUIT_BREAKER
    RS3 --> FVG_TOUCH
    CB2 --> SESSION_END

    style DS3 fill:#00aa55,color:#fff
    style DS5 fill:#aa0000,color:#fff
    style FV3 fill:#00aa55,color:#fff
    style FV4 fill:#aa0000,color:#fff
    style TG2 fill:#0066cc,color:#fff
    style CI3 fill:#0066cc,color:#fff
    style EX1 fill:#0066cc,color:#fff
    style WIN fill:#00aa55,color:#fff
    style LOSS fill:#aa0000,color:#fff
    style VL_SKIP fill:#aa0000,color:#fff
    style VL_SKIP2 fill:#aa0000,color:#fff
    style VL_SKIP3 fill:#aa0000,color:#fff
    style CB2 fill:#ff4444,color:#fff
```

---

## Quick Reference

| Stage | Timeframe | Key Check |
|-------|-----------|-----------|
| PDH/PDL | Daily | Prior day high/low levels |
| Sweep | Daily | Wick beyond level, close back inside |
| FVG | H1 | Gap between candle 0 and candle 2 |
| FVG Touch | H1->M5 | Price must touch FVG before M5 entries |
| CISD | M5 | Close breaks opposing series open |
| Order Block | M5 | CISD confirming candle |
| Stop | M5 | OB BODY (not wick) +/- buffer |
| Target | M5 | 2R from entry |

---

## V11 Key Improvements

| Feature | Old | V11 |
|---------|-----|-----|
| Stop Placement | OB Wick | OB Body |
| Stop Size | 20-40 ticks | 10-15 ticks |
| FVG Gate | Optional | Required |
| Entry | 50% OB | OB Close |

---

*Paste into [Mermaid Live Editor](https://mermaid.live) to visualize*

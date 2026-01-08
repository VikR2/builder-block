# LumiTraders Liquidity Sweep - Unified Flowchart

Copy-paste ready single flowchart for the complete Lumi strategy.

---

## Complete Strategy Flow (Copy This)

```
flowchart TD
    subgraph SESSION["SESSION START"]
        A1([9AM NY Open])
        A2[Initialize HTF Swing Levels]
        A1 --> A2
    end

    subgraph DAILY_BIAS["DAILY BIAS FILTER"]
        DB1{SMA Trend?}
        DB1 -->|Above SMA| DB2[BULLISH Bias]
        DB1 -->|Below SMA| DB3[BEARISH Bias]
    end

    subgraph PREMIUM_DISCOUNT["PREMIUM/DISCOUNT FILTER"]
        PD1[Calculate Previous Day Range]
        PD2[Equilibrium = 50% of Range]
        PD3{Current Price?}
        PD3 -->|Above EQ| PD4[PREMIUM - Shorts Only]
        PD3 -->|Below EQ| PD5[DISCOUNT - Longs Only]
        PD1 --> PD2 --> PD3
    end

    subgraph HTF_SWEEP["HTF SWEEP DETECTION - H1 or M30"]
        SW1[Track Swing High/Low]
        SW2{Price Action?}
        SW2 -->|Low Sweep + Reclaim| SW3[BULLISH Sweep]
        SW2 -->|High Sweep + Reject| SW4[BEARISH Sweep]
        SW1 --> SW2
    end

    subgraph CISD_CHECK["CISD CONFIRMATION - LTF"]
        CI1{RequireCISD?}
        CI1 -->|Yes| CI2[Store HTF Candle Open]
        CI2 --> CI3{LTF Close Breaks Open?}
        CI3 -->|Yes| CI4[CISD CONFIRMED]
        CI1 -->|No| OB_FIND
    end

    subgraph OB_FIND["ORDER BLOCK DETECTION"]
        OB1{Sweep Direction?}
        OB1 -->|Bullish| OB2[Find Last Bearish Candle]
        OB1 -->|Bearish| OB3[Find Last Bullish Candle]
        OB2 --> OB4[OB Zone = High/Low of Candle]
        OB3 --> OB4
        OB4 --> OB5[Pullback Level = 50% into OB]
    end

    subgraph OB_RETURN["WAIT FOR OB RETURN"]
        RT1{Price Enters OB Zone?}
        RT1 -->|Yes| RT2{Pullback >= 50%?}
        RT2 -->|Yes| RT3{Close Respects OB?}
        RT3 -->|Yes| RT4[OB RESPECTED]
    end

    subgraph FADE_CHECK["11AM FADE CHECK"]
        FD1{Time 11AM-12PM?}
        FD1 -->|No| NORMAL_ENTRY
        FD1 -->|Yes| FD2{Use11AMFade?}
        FD2 -->|No| NORMAL_ENTRY
        FD2 -->|Yes| FADE_MODE
    end

    subgraph FADE_MODE["FADE MODE"]
        FM1[Store Original Direction]
        FM2[Wait for OPPOSITE CISD]
        FM3[Find OPPOSITE Order Block]
        FM4[Fade OB Respected]
        FM1 --> FM2 --> FM3 --> FM4
    end

    subgraph NORMAL_ENTRY["NORMAL ENTRY"]
        NE1[Entry at OB Close]
    end

    subgraph RISK_CALC["RISK CALCULATION"]
        RK1[Stop = Sweep Price +/- Buffer]
        RK2[Risk = Entry to Stop Distance]
        RK3[Target = Entry + 2R]
        RK1 --> RK2 --> RK3
    end

    subgraph VALIDATION["ENTRY VALIDATION"]
        VL1{Stop <= 150 ticks?}
        VL1 -->|No| VL_SKIP[SKIP TRADE]
        VL1 -->|Yes| VL2{Target Valid?}
        VL2 -->|Yes| EXECUTE
    end

    subgraph EXECUTE["EXECUTE TRADE"]
        EX1[ENTER POSITION]
    end

    subgraph MANAGEMENT["TRADE MANAGEMENT"]
        MG1[Monitor Position]
        MG2{Profit >= 1R?}
        MG2 -->|Yes| MG3[Take 50% Partial]
        MG3 --> MG4[Move Stop to Breakeven]
        MG4 --> MG5[Trail to Protected Swings]
        MG5 --> MG6{Consolidation 5+ bars?}
        MG6 -->|Yes| MG7[CUT TRADE EARLY]
        MG6 -->|No| MG8{Target or Stop Hit?}
        MG8 -->|Target| WIN[WIN]
        MG8 -->|Stop| LOSS[LOSS]
    end

    subgraph RESET["RESET"]
        RS1{Still in Session?}
        RS1 -->|Yes| HTF_SWEEP
        RS1 -->|No| DONE([Session End])
    end

    A2 --> DAILY_BIAS
    DB2 --> PREMIUM_DISCOUNT
    DB3 --> PREMIUM_DISCOUNT
    PD4 --> HTF_SWEEP
    PD5 --> HTF_SWEEP
    SW3 --> CISD_CHECK
    SW4 --> CISD_CHECK
    CI4 --> OB_FIND
    OB5 --> OB_RETURN
    RT4 --> FADE_CHECK
    FADE_MODE --> RISK_CALC
    NORMAL_ENTRY --> RISK_CALC
    RK3 --> VALIDATION
    EXECUTE --> MANAGEMENT
    MG7 --> RESET
    WIN --> RESET
    LOSS --> RESET

    style SW3 fill:#00aa55,color:#fff
    style SW4 fill:#aa0000,color:#fff
    style CI4 fill:#0066cc,color:#fff
    style RT4 fill:#00aa55,color:#fff
    style EX1 fill:#0066cc,color:#fff
    style MG3 fill:#00aa55,color:#fff
    style WIN fill:#00aa55,color:#fff
    style LOSS fill:#aa0000,color:#fff
    style VL_SKIP fill:#aa0000,color:#fff
    style PD4 fill:#ff4444,color:#fff
    style PD5 fill:#00ff88,color:#000
```

---

## Quick Reference

| Stage | HTF | LTF | Key Check |
|-------|-----|-----|-----------|
| Sweep | H1/M30 | - | Wick beyond swing, close back inside |
| CISD | - | M5/M3 | LTF close breaks HTF candle open |
| OB | - | M5/M3 | Last opposing candle before sweep |
| Entry | - | M5/M3 | 50% pullback into OB, close respects |
| Stop | - | - | Sweep price +/- buffer |
| Target | - | - | 2R from ideal entry |

---

## Timeframe Pairs

| HTF Sweep | LTF Entry |
|-----------|-----------|
| H1 (60min) | M5 (5min) |
| M30 (30min) | M3 (3min) |

---

*Paste into [Mermaid Live Editor](https://mermaid.live) to visualize*

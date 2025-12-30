# Strategy Architecture Document

## Metadata
```yaml
name: "{name}"
source_url: "{source_url}"
source_title: "{source_title}"
type: "{type}"  # strategy | indicator | ask_user
complexity: "{complexity}"  # simple | medium | complex
generated: "{generated_date}"
confidence: {confidence}
```

---

## 1. Overview

**Core Concept:** {core_concept_description}

**Trading Style:** {trading_style}

**Timeframe:** {timeframe}

---

## 2. Market Context & Bias

### 2.1 Bias Calculation
**Skill:** `{bias_skill_slug}` ({bias_skill_usage})

**Logic:**
{bias_logic_description}

**Time Window:** {bias_time_window}

**Variables Required:**
{bias_variables}

**Code Snippet:**
```csharp
{bias_code_snippet}
```

---

## 3. Setup Conditions

### 3.1 {setup_name}
**Skill:** `{setup_skill_slug}` ({setup_skill_usage})

**Description:** {setup_description}

**Time Window:** {setup_time_window}

**Variables Required:**
{setup_variables}

**Code Snippet:**
```csharp
{setup_code_snippet}
```

---

## 4. Entry Scenarios

### 4.1 Scenario A: {scenario_a_name}
**Type:** {scenario_a_type}  <!-- reversal | continuation -->

**Skills Used:**
{scenario_a_skills}

**Entry Conditions:**
{scenario_a_conditions}

**Code Snippet:**
```csharp
{scenario_a_code}
```

### 4.2 Scenario B: {scenario_b_name}
**Type:** {scenario_b_type}

**Skills Used:**
{scenario_b_skills}

**Entry Conditions:**
{scenario_b_conditions}

**Code Snippet:**
```csharp
{scenario_b_code}
```

---

## 5. Risk Management

### 5.1 Stop Loss
**Skill:** `{stop_skill_slug}` ({stop_skill_usage})

**Logic:** {stop_logic}

**Code Snippet:**
```csharp
{stop_code}
```

### 5.2 Take Profit
**Skill:** `{tp_skill_slug}` ({tp_skill_usage})

**Logic:** {tp_logic}

**Code Snippet:**
```csharp
{tp_code}
```

### 5.3 Breakeven
**Skill:** `{be_skill_slug}` ({be_skill_usage})

**Logic:** {be_logic}

**Code Snippet:**
```csharp
{be_code}
```

---

## 6. Time Windows

| Phase | Start | End | Activity |
|-------|-------|-----|----------|
{time_windows_table}

---

## 7. State Machine

```
{state_machine_diagram}
```

---

## 8. State Variables

### Required Variables
```csharp
{state_variables}
```

### Daily Reset
```csharp
{daily_reset_code}
```

---

## 9. Skills Composition Summary

### Direct Use (score > 0.85)
{direct_skills_list}

### Adaptation Needed (0.7-0.85)
{adapted_skills_list}

### Novel Synthesis Required (< 0.7)
{novel_skills_list}

---

## 10. Implementation Checklist

- [ ] Declare all state variables (#region Variables)
- [ ] Implement OnStateChange with all parameters
- [ ] Implement bias calculation
- [ ] Implement setup detection
- [ ] Implement Scenario A entry
- [ ] Implement Scenario B entry (if applicable)
- [ ] Implement OnExecutionUpdate for stop/target
- [ ] Implement breakeven management
- [ ] Implement daily reset
- [ ] Add time window controls
- [ ] Add debug output option

---

## 11. User Questions

{user_questions}

---

## 12. Transcript Excerpts

### Key Passages
{transcript_excerpts}

---

## Appendix: Full Skill Code References

{skill_appendix}

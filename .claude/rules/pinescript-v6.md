# Pine Script v6 Reference Guide

<!-- MAINTENANCE: Core patterns stay here. Store error learnings in claude-mem with tags: pinescript, pine-error -->
<!-- Last updated: 2026-01-15 -->

## 1. Version Declaration & Indicator Setup

```pine
//@version=6
indicator("Name", overlay=true, max_lines_count=500, max_boxes_count=500, max_labels_count=500)
```

**strategy() declaration:**
```pine
//@version=6
strategy("Name", overlay=true, margin_long=100, margin_short=100, default_qty_type=strategy.percent_of_equity, default_qty_value=100)
```

**Defaults changed in v6:**
- `margin_long` and `margin_short` default to `100` (was `0` in v5)
- Set to `0` explicitly to replicate v5 behavior

---

## 2. Reserved Keywords (DO NOT use as variable names)

### Control Flow
`var`, `varip`, `const`, `if`, `else`, `for`, `while`, `switch`, `break`, `continue`, `return`

### Type Keywords
`int`, `float`, `bool`, `string`, `color`, `array`, `matrix`, `map`, `line`, `label`, `box`, `table`, `linefill`, `polyline`

### Built-in Variables
`time`, `open`, `high`, `low`, `close`, `volume`, `hl2`, `hlc3`, `ohlc4`, `hlcc4`
`bar_index`, `last_bar_index`, `barstate`, `timenow`

### Namespaces
`ta`, `math`, `str`, `array`, `matrix`, `map`, `runtime`, `chart`, `syminfo`, `timeframe`, `strategy`, `request`

### Literals & Constants
`true`, `false`, `na`

### Common Conflicts (rename these!)
- `var` → use `myVar`, `priceVar`, etc.
- `time` → use `sessionTime`, `startTime`, etc.
- `color` → use `lineColor`, `bgColor`, etc.
- `box` → use `myBox`, `rangeBox`, etc.
- `line` → use `myLine`, `trendLine`, etc.
- `label` → use `myLabel`, `priceLabel`, etc.
- `table` → use `dashTable`, `infoTable`, etc.

---

## 3. Critical v5 → v6 Breaking Changes

### Boolean Variables Cannot Be `na`

```pine
// v5 (worked)
var bool buying = na

// v6 (COMPILE ERROR)
var bool buying = na  // ERROR: Cannot use 'na' with type 'bool'

// v6 FIX
var bool buying = false
buying := condition ? true : otherCondition ? false : buying
```

### Explicit Type Casting Required

```pine
// v5 (implicit)
if bar_index
    doSomething()

// v6 (explicit required)
if bool(bar_index)
    doSomething()

// Better: be explicit about condition
if bar_index > 0
    doSomething()
```

### Integer Division Returns Float

```pine
// v5: 5/2 = 2 (integer)
// v6: 5/2 = 2.5 (float)

// v6 FIX for integer division
int result = int(5/2)  // = 2
```

### Timeframe Format Changed

```pine
// v5
if timeframe.period == "D"

// v6 (includes multiplier)
if timeframe.period == "1D"
```

### History Operator Restrictions

```pine
// v5 (worked)
someValue = 6[1]  // literal with history

// v6 (COMPILE ERROR)
// Cannot use [] with literals

// v6 FIX
int myValue = 6
someValue = myValue[1]
```

### UDT Field Access with History

```pine
// v5
val = myObject.field[10]

// v6 (requires parentheses)
val = (myObject[10]).field
```

### Lazy Evaluation

```pine
// v6: and/or operators short-circuit
// Extract functions with side effects to global scope BEFORE conditionals

// WRONG in v6 (function may not execute)
if condition and myFunction()
    ...

// RIGHT in v6
funcResult = myFunction()  // Always executes
if condition and funcResult
    ...
```

---

## 4. Data Types & Variables

### Type Declarations

```pine
// Explicit (recommended)
int myInt = 0
float myFloat = 0.0
bool myBool = false
string myString = ""
color myColor = color.white

// var (persists across bars)
var float persistentValue = 0.0

// varip (persists across bars AND ticks in realtime)
varip float tickPersistent = 0.0
```

### na Handling by Type

```pine
// float/int - can be na
var float price = na
if condition
    price := close

// bool - CANNOT be na in v6
var bool flag = false  // Use false/true, not na

// Check for na
if not na(price)
    // price has a value
```

### Type Conversion

```pine
int(floatValue)      // float → int (truncates)
float(intValue)      // int → float
str.tostring(value)  // any → string
bool(value)          // explicit bool conversion
```

---

## 5. Drawing Objects API

### line.new() - Full Signature

```pine
line.new(x1, y1, x2, y2,
    xloc = xloc.bar_index,           // xloc.bar_index | xloc.bar_time
    extend = extend.none,            // extend.none | extend.left | extend.right | extend.both
    color = color.blue,
    style = line.style_solid,        // see styles below
    width = 1,
    force_overlay = false) → series line
```

**With chart.point:**
```pine
line.new(first_point, second_point,
    xloc = xloc.bar_index,
    extend = extend.none,
    color = color.blue,
    style = line.style_solid,
    width = 1,
    force_overlay = false) → series line
```

**Line Styles:**
- `line.style_solid`
- `line.style_dotted`
- `line.style_dashed`
- `line.style_arrow_left`
- `line.style_arrow_right`
- `line.style_arrow_both`

**Static Horizontal Line Pattern:**
```pine
// For lines that don't move with the chart
myLine := line.new(time, price, time + 86400000, price,
    xloc=xloc.bar_time,
    extend=extend.both,
    color=color.white,
    width=1)
```

### label.new() - Full Signature

```pine
label.new(x, y, text,
    xloc = xloc.bar_index,           // xloc.bar_index | xloc.bar_time
    yloc = yloc.price,               // yloc.price | yloc.abovebar | yloc.belowbar
    color = color.blue,
    style = label.style_label_down,  // see styles below
    textcolor = color.white,
    size = size.normal,              // see sizes below
    textalign = text.align_center,
    tooltip = "",
    text_font_family = font.family_default,
    force_overlay = false,
    text_formatting = text.format_none) → series label
```

**Label Styles:**
- `label.style_none` (text only, no background)
- `label.style_label_up`, `label.style_label_down`
- `label.style_label_left`, `label.style_label_right`
- `label.style_label_lower_left`, `label.style_label_lower_right`
- `label.style_label_upper_left`, `label.style_label_upper_right`
- `label.style_label_center`
- `label.style_circle`, `label.style_square`, `label.style_diamond`
- `label.style_triangleup`, `label.style_triangledown`
- `label.style_arrowup`, `label.style_arrowdown`
- `label.style_cross`, `label.style_xcross`
- `label.style_flag`

**Sizes:**
- `size.tiny` (~7px in labels)
- `size.small` (~10px)
- `size.normal` (12px)
- `size.large` (18px)
- `size.huge` (24px)
- `size.auto`

### box.new() - Full Signature

```pine
box.new(left, top, right, bottom,
    border_color = color.blue,
    border_width = 1,
    border_style = line.style_solid,
    extend = extend.none,
    xloc = xloc.bar_index,
    bgcolor = color.blue,
    text = "",
    text_size = size.auto,
    text_color = color.black,
    text_halign = text.align_center,
    text_valign = text.align_center,
    text_wrap = text.wrap_none,
    text_font_family = font.family_default,
    force_overlay = false,
    text_formatting = text.format_none) → series box
```

### table.new() - Full Signature

```pine
table.new(position, columns, rows,
    bgcolor = na,
    frame_color = na,
    frame_width = 1,
    border_color = na,
    border_width = 1) → series table
```

**Position values:**
- `position.top_left`, `position.top_center`, `position.top_right`
- `position.middle_left`, `position.middle_center`, `position.middle_right`
- `position.bottom_left`, `position.bottom_center`, `position.bottom_right`

**table.cell():**
```pine
table.cell(table_id, column, row, text,
    width = 0,
    height = 0,
    text_color = na,
    text_halign = text.align_center,
    text_valign = text.align_center,
    text_size = size.auto,
    bgcolor = na,
    tooltip = "",
    text_font_family = font.family_default,
    text_formatting = text.format_none)
```

### linefill.new()

```pine
linefill.new(line1, line2, color) → series linefill
```

---

## 6. Functions & Methods

### Function Declaration

```pine
// Simple function
myFunction() =>
    // logic
    result  // last line is return value

// With parameters and explicit return type
myFunction(float param1, int param2) =>
    float result = param1 * param2
    result

// Multi-line with explicit type
getString(bool condition) =>
    string result = ""
    if condition
        result := "Yes"
    else
        result := "No"
    result  // explicit return
```

### Method Syntax (UDTs)

```pine
type MyType
    float value
    string name

method describe(MyType this) =>
    str.tostring(this.value) + ": " + this.name
```

---

## 7. Common Patterns (Copy-Paste Ready)

### Session Detection

```pine
InSession(sessionTime, tz=syminfo.timezone) =>
    not na(time(timeframe.period, sessionTime, tz))

// Usage
nySession = InSession("0930-1600", "America/New_York")
londonSession = InSession("0800-1630", "Europe/London")
```

### Daily Reset

```pine
isNewDay() =>
    ta.change(time("D")) != 0

if isNewDay()
    // reset variables
    rangeHigh := na
    rangeLow := na
```

### Input Grouping

```pine
GRP_TIME = "Time Settings"
GRP_VISUAL = "Visual Settings"
GRP_COLORS = "Colors"
GRP_ALERTS = "Alert Settings"

startHour = input.int(7, "Start Hour", minval=0, maxval=23, group=GRP_TIME)
showLabels = input.bool(true, "Show Labels", group=GRP_VISUAL)
bullColor = input.color(color.green, "Bullish Color", group=GRP_COLORS)
```

### Array-based Drawing Cleanup

```pine
var array<label> labels = array.new_label()
var int maxLabels = 50

trackLabel(lbl) =>
    array.push(labels, lbl)
    if array.size(labels) > maxLabels
        label.delete(array.shift(labels))
```

### Dashboard Table

```pine
var table dash = table.new(position.top_right, 2, 5, bgcolor=color.new(color.black, 80))

if barstate.islast
    table.cell(dash, 0, 0, "Label", text_color=color.white)
    table.cell(dash, 1, 0, str.tostring(value, "#.##"), text_halign=text.align_right, text_color=color.white)
```

### Multi-timeframe Request

```pine
// Previous day's close (with lookahead for historical accuracy)
prevDayClose = request.security(syminfo.tickerid, "D", close[1], lookahead=barmerge.lookahead_on)

// Higher timeframe indicator
htfRSI = request.security(syminfo.tickerid, "60", ta.rsi(close, 14))
```

### Alert with JSON (Discord-ready)

```pine
alertMsg = '{"content": "' + syminfo.ticker + ' Alert: ' + message + '"}'
alert(alertMsg, alert.freq_once_per_bar)

// With newlines (double escape for JSON)
multiLineMsg = '{"content": "Line 1\\nLine 2\\nLine 3"}'
```

### Bias Calculation with Explicit Bool

```pine
var bool buying = false  // NOT na in v6!

biasDiff = (todayClose - yesterdayClose) / yesterdayClose
buying := biasDiff > threshold ? true : biasDiff < -threshold ? false : buying
```

### Drawing Objects with Static Positioning

```pine
var line srHighLine = na
var label srHighLabel = na
var int lineAnchorBar = 0

if newDay and not na(prevHigh)
    // Delete old
    line.delete(srHighLine)
    label.delete(srHighLabel)

    // Store anchor position
    lineAnchorBar := bar_index

    // Create with xloc.bar_time for static positioning
    srHighLine := line.new(time, prevHigh, time, prevHigh,
        xloc=xloc.bar_time,
        extend=extend.both,
        color=color.white,
        style=line.style_dotted,
        width=1)

    // Label at specific bar, not floating
    srHighLabel := label.new(bar_index, prevHigh, "SR High",
        xloc=xloc.bar_index,
        style=label.style_none,
        textcolor=color.white,
        size=size.small)
```

---

## 8. Error → Fix Quick Reference

| Error Message | Cause | Fix |
|---------------|-------|-----|
| "Cannot use 'na' with type 'bool'" | v6 bool restriction | Use `false` or `true` |
| "Could not find definition of token 'X'" | Reserved keyword | Rename variable (see Section 2) |
| "Undeclared identifier" | Variable scope | Declare with `var` at script level |
| "Cannot call 'X' with argument 'Y'" | Type mismatch | Cast with `int()`, `float()`, `str.tostring()` |
| "The function 'X' should return a value" | Missing return | Add explicit return value on last line |
| "line/label/box.new() expects 'xloc'" | Missing parameter | Add `xloc=xloc.bar_time` or `xloc=xloc.bar_index` |
| "Mismatched input '...'" | Syntax error | Check for missing commas, parentheses, indentation |
| "Cannot use [] with literal" | v6 restriction | Store literal in variable first |
| "Division of int/int produces float" | v6 change | Wrap with `int()` if integer needed |

---

## 9. Color Constants (v6 Updated Values)

```pine
// These colors changed in v6
color.red     // #F23645 (was #FF5252)
color.teal    // #089981 (was #00897B)
color.yellow  // #FDD835 (was #FFEB3B)
```

---

## Sources

- [TradingView Pine Script v6 Migration Guide](https://www.tradingview.com/pine-script-docs/migration-guides/to-pine-version-6/)
- [TradingView Lines and Boxes Documentation](https://www.tradingview.com/pine-script-docs/visuals/lines-and-boxes/)
- [TradingView Text and Shapes Documentation](https://www.tradingview.com/pine-script-docs/visuals/text-and-shapes/)
- [TradingView Pine Script v6 Release Notes](https://www.tradingview.com/pine-script-docs/release-notes/)

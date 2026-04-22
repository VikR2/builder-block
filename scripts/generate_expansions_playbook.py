"""Generate TCM Revisiting Expansions playbook HTML with embedded images."""
import base64
from pathlib import Path

FRAMES_DIR = Path("data/local-videos/Revisting_Expansions_d53d8ad4/frames")
OUTPUT = Path("data/architectures/tcm-revisiting-expansions-playbook.html")

# Selected frames for embedding
FRAME_MAP = {
    "expansion_m5": "interval_005.jpg",
    "candle_reading": "interval_008.jpg",
    "h1_structure": "interval_012.jpg",
    "fractal_m1": "interval_018.jpg",
    "range_box": "interval_022.jpg",
    "audchf_fvg": "interval_028.jpg",
    "us500_h1": "interval_033.jpg",
    "daily_chart": "interval_038.jpg",
}

def encode_frame(name: str) -> str:
    path = FRAMES_DIR / FRAME_MAP[name]
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")

def img_tag(name: str, style: str = "") -> str:
    b64 = encode_frame(name)
    default_style = "max-width:100%; max-height:520px; border-radius:8px; border:1px solid #e0e0e0; display:block;"
    return f'<img src="data:image/jpeg;base64,{b64}" style="{default_style}{style}" alt="{name}">'

def build_html() -> str:
    # Pre-encode all frames
    frames = {name: encode_frame(name) for name in FRAME_MAP}

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TCM Revisiting Expansions Playbook</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {{
  --charcoal: #333333;
  --text: #444444;
  --text-light: #666666;
  --amber: #F5B731;
  --amber-light: #FFF3D6;
  --green: #4CAF50;
  --candle-bull: #82B882;
  --red: #E53935;
  --line-gray: #888;
  --watermark: rgba(0,0,0,0.03);
  --border-light: #e0e0e0;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Sora', sans-serif; background: #f0f0f0; padding: 20px 0; }}
@page {{ size: 1440px 810px; margin: 0; }}
.slide {{
  width: 1440px; height: 810px; background: white;
  position: relative; overflow: hidden;
  page-break-after: always; margin: 0 auto 20px;
}}
.slide::before {{
  content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='central' text-anchor='middle' font-family='Sora,sans-serif' font-weight='800' font-size='28' fill='rgba(0,0,0,0.03)'%3ET%3C/text%3E%3C/svg%3E");
  pointer-events: none; z-index: 0;
}}
.slide > * {{ position: relative; z-index: 1; }}
.cover::before {{ display: none; }}
@media print {{
  body {{ background: white; padding: 0; }}
  .slide {{ margin: 0; box-shadow: none; }}
  .slide, .slide * {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
}}
@media screen {{ .slide {{ box-shadow: 0 2px 20px rgba(0,0,0,0.1); }} }}

/* Cover */
.cover {{ display: flex; align-items: center; justify-content: space-between; padding: 0 100px; }}
.cover-left h1 {{ font-size: 52px; font-weight: 800; color: var(--charcoal); letter-spacing: -1.5px; line-height: 1.1; }}
.cover-sub {{ font-size: 16px; color: var(--text-light); margin-top: 20px; font-weight: 400; max-width: 500px; line-height: 1.6; }}
.cover-right {{ text-align: center; }}
.cover-logo {{
  width: 100px; height: 100px; background: var(--charcoal); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: white; font-weight: 800; font-size: 42px; margin-bottom: 12px;
}}
.cover-brand {{ font-size: 32px; font-weight: 600; color: var(--charcoal); }}

/* Content */
.content-title {{
  position: absolute; top: 48px; left: 60px;
  font-size: 26px; font-weight: 700; color: var(--charcoal); letter-spacing: -0.5px;
}}
.content-body {{
  position: absolute; top: 110px; left: 60px; right: 60px; bottom: 80px;
}}

/* TOC */
.contents-title {{
  position: absolute; top: 48px; left: 60px;
  font-size: 28px; font-weight: 700; color: var(--charcoal);
}}
.toc {{
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 600px;
}}
.toc-row {{
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 10px 0; border-bottom: 1px dotted #ddd;
  font-size: 15px; font-weight: 500; color: var(--text);
}}
.toc-row span:last-child {{ color: var(--text-light); font-weight: 400; }}

/* Footer */
.footer {{
  position: absolute; bottom: 28px; left: 60px;
  display: flex; align-items: center; gap: 12px; z-index: 2;
}}
.footer-logo {{
  width: 36px; height: 36px; background: var(--charcoal); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: white; font-weight: 800; font-size: 16px;
}}
.footer-brand {{ font-size: 16px; font-weight: 600; color: var(--charcoal); }}
.footer-sep {{ width: 1.5px; height: 20px; background: #ccc; }}
.footer-page {{ font-size: 14px; font-weight: 500; color: var(--text-light); }}

/* Section label */
.section-label {{
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 1px; color: var(--text-light); margin-bottom: 10px;
}}
.body-text {{
  font-size: 14px; line-height: 1.7; color: var(--text); max-width: 800px;
}}

/* Quote block */
.quote-block {{
  background: #f8f8f8; border-left: 4px solid var(--amber);
  padding: 16px 20px; border-radius: 0 8px 8px 0;
  font-size: 13px; font-weight: 500; font-style: italic;
  line-height: 1.6; color: var(--text); margin: 12px 0;
}}

/* Rule highlight */
.rule-highlight {{
  background: var(--amber-light); border: 2px solid var(--amber);
  border-radius: 10px; padding: 14px 18px; margin: 10px 0;
}}
.rule-highlight__title {{
  font-size: 13px; font-weight: 700; color: var(--charcoal); margin-bottom: 4px;
}}
.rule-highlight__body {{
  font-size: 12.5px; color: var(--text); line-height: 1.6;
}}

/* Callout */
.callout {{
  background: var(--amber); border-radius: 8px; padding: 10px 16px;
  font-size: 13px; font-weight: 500; color: var(--charcoal);
}}

/* Checklist */
.checklist-box {{
  background: #fafafa; border: 1px solid var(--border-light);
  border-radius: 10px; padding: 16px;
}}
.checklist-box__title {{
  font-size: 14px; font-weight: 700; color: var(--charcoal);
  margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #eee;
}}
.check-item {{
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 12px; color: var(--text); margin: 6px 0; line-height: 1.5;
}}
.check-box {{
  width: 13px; height: 13px; min-width: 13px; border: 1.5px solid #999;
  border-radius: 3px; margin-top: 2px;
}}

/* Flow chart */
.flow-h {{
  display: flex; align-items: center; gap: 0; justify-content: center;
}}
.flow-node {{
  background: var(--amber); border-radius: 8px; padding: 10px 18px;
  font-size: 13px; font-weight: 600; color: var(--charcoal);
  white-space: nowrap;
}}
.flow-node--outline {{
  background: white; border: 2px solid var(--amber);
}}
.flow-connector {{
  width: 40px; height: 2px; background: #bbb; position: relative;
}}
.flow-connector::after {{
  content: ''; position: absolute; right: -1px; top: -4px;
  border-left: 8px solid #bbb; border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
}}

/* Mistakes */
.mistake-item {{
  display: flex; gap: 12px; margin: 8px 0; align-items: flex-start;
}}
.mistake-num {{
  font-size: 16px; font-weight: 800; color: var(--red); opacity: 0.4;
  min-width: 20px;
}}
.mistake-title {{ font-size: 13px; font-weight: 700; color: var(--charcoal); }}
.mistake-fix {{ font-size: 12px; color: var(--text); line-height: 1.5; }}
.mistake-fix strong {{ color: var(--green); }}

/* Signal dots */
.signal-item {{
  display: flex; align-items: center; gap: 8px; margin: 5px 0;
  font-size: 12.5px; color: var(--text);
}}
.signal-dot {{
  width: 8px; height: 8px; border-radius: 50%; min-width: 8px;
}}
.signal-dot--red {{ background: var(--red); }}
.signal-dot--green {{ background: var(--green); }}
.signal-dot--amber {{ background: var(--amber); }}

/* Chart area */
.chart-area {{
  position: relative; display: flex; align-items: flex-end;
  gap: 28px; padding: 20px 30px; background: #fcfcfc;
  border-radius: 8px; border: 1px solid #eee;
}}
.cw {{
  width: 42px; display: flex; flex-direction: column; align-items: center;
}}
.cw .wt, .cw .wb {{ width: 2px; background: var(--charcoal); }}
.cw .bd {{ width: 34px; min-height: 6px; }}
.cw.bull .bd {{ background: var(--candle-bull); }}
.cw.bear .bd {{ background: var(--charcoal); }}
.plvl {{
  position: absolute; left: 0; right: 0;
  border-top: 1.5px solid #555; z-index: 2;
}}
.plvl--dot {{ border-top-style: dotted; border-color: #999; }}
.plvl--amber {{ border-color: var(--amber); }}
.plvl-label {{
  position: absolute; right: 8px; top: -8px;
  font-size: 10px; font-weight: 600; color: var(--text-light);
  background: white; padding: 0 4px;
}}
.anno {{
  background: var(--amber-light); border: 1px solid var(--amber);
  border-radius: 6px; padding: 4px 10px;
  font-size: 11px; font-weight: 500; color: var(--charcoal);
  position: absolute; white-space: nowrap;
}}
.anno--green {{ background: #E8F5E9; border-color: #66BB6A; color: #2E7D32; }}
.anno--red {{ background: #FFEBEE; border-color: #EF5350; color: #C62828; }}

/* Image slide */
.slide-img {{
  max-width: 100%; max-height: 520px; border-radius: 8px;
  border: 1px solid #e0e0e0; display: block;
}}
.slide-img--large {{
  max-height: 580px;
}}
.img-caption {{
  font-size: 11px; color: var(--text-light); margin-top: 6px;
  font-style: italic;
}}

/* Step rows */
.step-row {{
  display: flex; gap: 12px; align-items: flex-start; margin: 8px 0;
}}
.step-num {{
  width: 26px; height: 26px; min-width: 26px; background: var(--amber);
  border-radius: 6px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: var(--charcoal);
}}
.step-text__title {{ font-size: 13px; font-weight: 700; color: var(--charcoal); }}
.step-text__desc {{ font-size: 11.5px; color: var(--text-light); line-height: 1.5; margin-top: 2px; }}

/* Column title */
.col-title {{
  font-size: 14px; font-weight: 700; color: var(--charcoal); margin-bottom: 8px;
}}
</style>
</head>
<body>

<!-- ========== SLIDE 1: COVER ========== -->
<div class="slide cover">
  <div class="cover-left">
    <h1>REVISITING<br>EXPANSIONS</h1>
    <p class="cover-sub">Expansion ranges, CSD process, candle-by-candle reading, failure swings, FVGs through failure swings, and multi-timeframe fractality.</p>
  </div>
  <div class="cover-right">
    <div class="cover-logo">T</div>
    <div class="cover-brand">TCM</div>
  </div>
</div>

<!-- ========== SLIDE 2: CONTENTS ========== -->
<div class="slide">
  <div class="contents-title">Contents</div>
  <div class="toc">
    <div class="toc-row"><span>Expansion Range Identification</span><span>3</span></div>
    <div class="toc-row"><span>The CSD Process &amp; 50% Rule</span><span>4</span></div>
    <div class="toc-row"><span>Candle Reading: Wick Rules</span><span>5</span></div>
    <div class="toc-row"><span>Failure Swings &amp; FVGs</span><span>6</span></div>
    <div class="toc-row"><span>Multi-Timeframe Fractality</span><span>7-8</span></div>
    <div class="toc-row"><span>Continuation vs Reversal</span><span>9</span></div>
    <div class="toc-row"><span>The Complete Process</span><span>10</span></div>
    <div class="toc-row"><span>Quick Reference Checklist</span><span>11</span></div>
    <div class="toc-row"><span>Common Mistakes</span><span>12</span></div>
    <div class="toc-row"><span>Key Quotes</span><span>13</span></div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">2</div>
  </div>
</div>

<!-- ========== SLIDE 3: EXPANSION RANGE IDENTIFICATION ========== -->
<div class="slide">
  <div class="content-title">Expansion Range Identification</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 380px; gap:28px;">
      <div>
        <div class="section-label">The Core Pattern</div>
        <p class="body-text" style="margin-bottom:14px;">Consecutive candles closing in the same direction form an <strong>expansion</strong>. The moment a candle fails to continue, you have the range.</p>

        <div class="step-row">
          <div class="step-num">1</div>
          <div><div class="step-text__title">Find Consecutive Closes</div><div class="step-text__desc">Down candles closing below each other = bearish expansion</div></div>
        </div>
        <div class="step-row">
          <div class="step-num">2</div>
          <div><div class="step-text__title">Mark the Range</div><div class="step-text__desc">High-to-Low of those candles = your expansion range</div></div>
        </div>
        <div class="step-row">
          <div class="step-num">3</div>
          <div><div class="step-text__title">Calculate EQ</div><div class="step-text__desc">50% midpoint becomes a critical decision level</div></div>
        </div>

        <div class="rule-highlight" style="margin-top:16px;">
          <div class="rule-highlight__title">Range Size Filter</div>
          <div class="rule-highlight__body">Wide range (30+ pts on M5) = comfortable risk, meaningful targets.<br>Tight range (2 candles) = difficult entry, may need high swept to profit.</div>
        </div>
      </div>
      <div>
        <div class="section-label">M5 Expansion Example</div>
        <img src="data:image/jpeg;base64,{frames["expansion_m5"]}" style="width:100%; border-radius:8px; border:1px solid #e0e0e0;">
        <div class="img-caption">M5 chart showing expansion candles and range formation</div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">3</div>
  </div>
</div>

<!-- ========== SLIDE 4: CSD PROCESS & 50% RULE ========== -->
<div class="slide">
  <div class="content-title">The CSD Process &amp; 50% Rule</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px;">
      <div>
        <div class="section-label">After Expansion + OLR</div>
        <div style="position:relative; height:320px; background:#fcfcfc; border-radius:8px; border:1px solid #eee; display:flex; align-items:flex-end; gap:24px; padding:20px 24px;">
          <!-- Bearish expansion candles -->
          <div class="cw bear" style="margin-bottom:120px;"><div class="wt" style="height:12px"></div><div class="bd" style="height:40px"></div><div class="wb" style="height:6px"></div></div>
          <div class="cw bear" style="margin-bottom:80px;"><div class="wt" style="height:8px"></div><div class="bd" style="height:45px"></div><div class="wb" style="height:10px"></div></div>
          <div class="cw bear" style="margin-bottom:30px;"><div class="wt" style="height:10px"></div><div class="bd" style="height:50px"></div><div class="wb" style="height:15px"></div></div>
          <!-- OLR candle -->
          <div class="cw bull" style="margin-bottom:20px;"><div class="wt" style="height:8px"></div><div class="bd" style="height:55px"></div><div class="wb" style="height:20px"></div></div>
          <!-- CSD candle -->
          <div class="cw bull" style="margin-bottom:60px;"><div class="wt" style="height:30px"></div><div class="bd" style="height:40px"></div><div class="wb" style="height:8px"></div></div>
          <!-- continuation -->
          <div class="cw bull" style="margin-bottom:55px;"><div class="wt" style="height:6px"></div><div class="bd" style="height:35px"></div><div class="wb" style="height:14px"></div></div>
          <div class="cw bull" style="margin-bottom:85px;"><div class="wt" style="height:10px"></div><div class="bd" style="height:50px"></div><div class="wb" style="height:5px"></div></div>
          <!-- Level lines -->
          <div class="plvl--dot" style="position:absolute; left:0; right:0; bottom:165px; border-top:1.5px dotted #999;"><span class="plvl-label">Range High</span></div>
          <div class="plvl--dot" style="position:absolute; left:0; right:0; bottom:35px; border-top:1.5px dotted #999;"><span class="plvl-label">Range Low</span></div>
          <div style="position:absolute; left:0; right:0; bottom:100px; border-top:1.5px dashed var(--amber);"><span class="plvl-label" style="color:var(--amber); font-weight:700;">50% CSD Level</span></div>
          <!-- Annotations -->
          <div class="anno" style="bottom:180px; left:10px;">Expansion</div>
          <div class="anno--green" style="position:absolute; bottom:6px; left:180px; background:#E8F5E9; border:1px solid #66BB6A; border-radius:6px; padding:4px 10px; font-size:11px; font-weight:500; color:#2E7D32;">OLR</div>
          <div class="anno" style="bottom:130px; right:140px;">Close above 50% = CSD</div>
        </div>
      </div>
      <div>
        <div class="section-label">CSD Confirmation Rules</div>

        <div class="rule-highlight" style="margin-bottom:12px;">
          <div class="rule-highlight__title">The 50% Rule</div>
          <div class="rule-highlight__body">"Nine times out of ten, I want to see a green candle that closes above fifty percent of the last down candle."</div>
        </div>

        <div style="margin-bottom:12px;">
          <div class="signal-item"><div class="signal-dot signal-dot--green"></div><span><strong>Close above 50%</strong> = Bullish confirmation, look for buys</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--amber"></div><span><strong>Close at 50%</strong> = Not strong enough, wait</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span><strong>Close below 50%</strong> = Still bearish, do not buy</span></div>
        </div>

        <div class="rule-highlight">
          <div class="rule-highlight__title">Single Big Candle Expansion</div>
          <div class="rule-highlight__body">If the expansion is one big candle, use the <strong>open price</strong> of that candle as the CSD level instead of 50%.</div>
        </div>

        <div class="rule-highlight" style="margin-top:12px;">
          <div class="rule-highlight__title">Multiple Candle CSD</div>
          <div class="rule-highlight__body">If CSD takes 2+ candles, use the <strong>open of the second candle</strong> as the reference for entry.</div>
        </div>

        <div class="quote-block" style="margin-top:14px;">"This not closing above here says this is not a trade to hold."</div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">4</div>
  </div>
</div>

<!-- ========== SLIDE 5: CANDLE READING WICK RULES ========== -->
<div class="slide">
  <div class="content-title">Candle Reading: Wick Rules</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px;">
      <!-- Big wick side -->
      <div>
        <div class="section-label">Big Wick = Deep Retracement</div>
        <div style="position:relative; height:260px; background:#fcfcfc; border-radius:8px; border:1px solid #eee; display:flex; align-items:flex-end; gap:20px; padding:16px 20px;">
          <div class="cw bull" style="margin-bottom:30px;"><div class="wt" style="height:6px"></div><div class="bd" style="height:30px"></div><div class="wb" style="height:8px"></div></div>
          <div class="cw bull" style="margin-bottom:50px;"><div class="wt" style="height:70px"></div><div class="bd" style="height:45px"></div><div class="wb" style="height:5px"></div></div>
          <div class="cw bear" style="margin-bottom:35px;"><div class="wt" style="height:10px"></div><div class="bd" style="height:30px"></div><div class="wb" style="height:15px"></div></div>
          <div class="cw bull" style="margin-bottom:25px;"><div class="wt" style="height:5px"></div><div class="bd" style="height:25px"></div><div class="wb" style="height:10px"></div></div>
          <div class="cw bull" style="margin-bottom:55px;"><div class="wt" style="height:10px"></div><div class="bd" style="height:55px"></div><div class="wb" style="height:5px"></div></div>
          <div class="anno" style="top:20px; left:80px; font-size:10px;">Big wick</div>
          <div class="anno--green" style="position:absolute; bottom:30px; left:140px; background:#E8F5E9; border:1px solid #66BB6A; border-radius:6px; padding:3px 8px; font-size:10px; font-weight:500; color:#2E7D32;">Buy here</div>
          <svg style="position:absolute; top:45px; left:110px;" width="60" height="80"><path d="M5,5 C5,50 50,50 50,75" stroke="var(--amber)" stroke-width="2" fill="none"/><polygon points="47,72 53,72 50,80" fill="var(--amber)"/></svg>
        </div>
        <div class="rule-highlight" style="margin-top:10px;">
          <div class="rule-highlight__body"><strong>95% Rule:</strong> If a green candle has a big upper wick, the next candle will trade below this candle's close. <strong>Buy on that dip.</strong></div>
        </div>
      </div>
      <!-- No wick side -->
      <div>
        <div class="section-label">No Wick = No Deep Retracement</div>
        <div style="position:relative; height:260px; background:#fcfcfc; border-radius:8px; border:1px solid #eee; display:flex; align-items:flex-end; gap:20px; padding:16px 20px;">
          <div class="cw bull" style="margin-bottom:20px;"><div class="wt" style="height:3px"></div><div class="bd" style="height:35px"></div><div class="wb" style="height:5px"></div></div>
          <div class="cw bull" style="margin-bottom:50px;"><div class="wt" style="height:3px"></div><div class="bd" style="height:40px"></div><div class="wb" style="height:4px"></div></div>
          <div class="cw bull" style="margin-bottom:48px;"><div class="wt" style="height:2px"></div><div class="bd" style="height:10px"></div><div class="wb" style="height:5px"></div></div>
          <div class="cw bull" style="margin-bottom:55px;"><div class="wt" style="height:4px"></div><div class="bd" style="height:45px"></div><div class="wb" style="height:3px"></div></div>
          <div class="cw bull" style="margin-bottom:95px;"><div class="wt" style="height:3px"></div><div class="bd" style="height:50px"></div><div class="wb" style="height:4px"></div></div>
          <div class="anno" style="top:30px; right:60px; font-size:10px;">Small wicks = momentum</div>
          <div class="anno--red" style="position:absolute; bottom:10px; right:20px; background:#FFEBEE; border:1px solid #EF5350; border-radius:6px; padding:3px 8px; font-size:10px; font-weight:500; color:#C62828;">Don't wait for pullback</div>
        </div>
        <div class="rule-highlight" style="margin-top:10px;">
          <div class="rule-highlight__body"><strong>No big wicks?</strong> Don't look for a deep retracement. Enter near the close or just below the open of the next candle. Waiting = missing the move.</div>
        </div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-top:16px;">
      <div class="quote-block">"The bigger the candle, the deeper I want to run."</div>
      <div class="quote-block">"Plan vs Reality: if market gaps up without retracing, the deep retracement is not yet done. Don't chase."</div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">5</div>
  </div>
</div>

<!-- ========== SLIDE 6: FAILURE SWINGS & FVGs ========== -->
<div class="slide">
  <div class="content-title">Failure Swings &amp; FVGs Through Failure Swings</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 400px; gap:28px;">
      <div>
        <div class="section-label">The High-Probability FVG Method</div>
        <div class="step-row">
          <div class="step-num">1</div>
          <div><div class="step-text__title">Identify Liquidity Target</div><div class="step-text__desc">Find an obvious high or low the market is reaching for</div></div>
        </div>
        <div class="step-row">
          <div class="step-num">2</div>
          <div><div class="step-text__title">Find Failure Swings</div><div class="step-text__desc">Mark every push towards that target that FAILS to reach it</div></div>
        </div>
        <div class="step-row">
          <div class="step-num">3</div>
          <div><div class="step-text__title">Mark the FVG</div><div class="step-text__desc">When price finally breaks through, mark the FVG that forms at the break</div></div>
        </div>
        <div class="step-row">
          <div class="step-num">4</div>
          <div><div class="step-text__title">Trade the Reaction</div><div class="step-text__desc">FVG holds = continuation. FVG fills = reversal.</div></div>
        </div>

        <div class="rule-highlight" style="margin-top:14px;">
          <div class="rule-highlight__title">FVG Planning Framework</div>
          <div class="rule-highlight__body">
            <strong>Plan A:</strong> FVG holds &rarr; Look for targets beyond<br>
            <strong>Plan B:</strong> FVG fills (close through it) &rarr; Expect pullback, re-evaluate
          </div>
        </div>

        <div style="display:flex; gap:16px; margin-top:12px;">
          <div class="signal-item"><div class="signal-dot signal-dot--green"></div><span>FVG stays open = <strong>continuation</strong></span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span>FVG gets closed = <strong>reversal</strong></span></div>
        </div>

        <div class="quote-block" style="margin-top:12px;">"Look at every single 'random' FVG that we drew here, and how price reacted to them. These are not random."</div>
      </div>
      <div>
        <div class="section-label">AUDCHF H1 - FVG Through Failure Swings</div>
        <img src="data:image/jpeg;base64,{frames["audchf_fvg"]}" style="width:100%; border-radius:8px; border:1px solid #e0e0e0;">
        <div class="img-caption">AUDCHF H1 showing failure swings with FVG levels marked at structural breaks</div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">6</div>
  </div>
</div>

<!-- ========== SLIDE 7: MULTI-TF FRACTALITY (WITH IMAGE) ========== -->
<div class="slide">
  <div class="content-title">Multi-Timeframe Fractality</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:28px;">
      <div>
        <div class="section-label">The Same Fractal, Every Timeframe</div>
        <p class="body-text" style="margin-bottom:14px;">The same pattern repeats on Monthly, Daily, H4, H1, M15, M5, M1. Only the scale changes.</p>

        <!-- Vertical flow -->
        <div style="display:flex; flex-direction:column; align-items:stretch; gap:0; width:280px;">
          <div class="flow-node" style="text-align:center;">H1: Expansion &rarr; Range &rarr; OLR</div>
          <div style="width:2px; height:16px; background:#bbb; margin:0 auto; position:relative;"><div style="position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);border-top:6px solid #bbb;border-left:4px solid transparent;border-right:4px solid transparent;"></div></div>
          <div class="flow-node" style="text-align:center;">M5: CSD &rarr; Entry Trigger</div>
          <div style="width:2px; height:16px; background:#bbb; margin:0 auto; position:relative;"><div style="position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);border-top:6px solid #bbb;border-left:4px solid transparent;border-right:4px solid transparent;"></div></div>
          <div class="flow-node" style="text-align:center;">M1: Precise Entry &rarr; Manage</div>
        </div>

        <div class="rule-highlight" style="margin-top:16px;">
          <div class="rule-highlight__title">Fractal Nesting</div>
          <div class="rule-highlight__body">Inside every H1 OLR, M5 shows its own expansion, OLR, CSD. Inside every M5 move, M1 shows the same. Each provides an entry at different scales.</div>
        </div>

        <div class="quote-block" style="margin-top:10px;">"If this fractal plays beautifully in random price action, what happens when you start controlling how you view that logic?"</div>
      </div>
      <div>
        <div class="section-label">M1 Fractal Delivery with Annotations</div>
        <img src="data:image/jpeg;base64,{frames["fractal_m1"]}" style="width:100%; border-radius:8px; border:1px solid #e0e0e0;">
        <div class="img-caption">M1 chart showing fractal delivery with range boxes and directional arrows</div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">7</div>
  </div>
</div>

<!-- ========== SLIDE 8: LIVE CHART EXAMPLES ========== -->
<div class="slide">
  <div class="content-title">Live Chart Application</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
      <div>
        <div class="section-label">H1 Structure - Expansion &amp; CSD</div>
        <img src="data:image/jpeg;base64,{frames["h1_structure"]}" style="width:100%; border-radius:8px; border:1px solid #e0e0e0;">
        <div class="img-caption">US100 H1 showing expansion range and CSD level on hourly chart</div>
      </div>
      <div>
        <div class="section-label">US500 H1 - Range with Levels</div>
        <img src="data:image/jpeg;base64,{frames["us500_h1"]}" style="width:100%; border-radius:8px; border:1px solid #e0e0e0;">
        <div class="img-caption">US500 H1 showing expansion range box with High, Low, EQ levels</div>
      </div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:16px;">
      <div>
        <div class="section-label">H1 Range with Annotations</div>
        <img src="data:image/jpeg;base64,{frames["range_box"]}" style="width:100%; max-height:220px; border-radius:8px; border:1px solid #e0e0e0; object-fit:cover; object-position:center;">
        <div class="img-caption">H1 chart showing range identification with boxes and level markers</div>
      </div>
      <div>
        <div class="section-label">Daily Chart - Big Picture</div>
        <img src="data:image/jpeg;base64,{frames["daily_chart"]}" style="width:100%; max-height:220px; border-radius:8px; border:1px solid #e0e0e0; object-fit:cover; object-position:center;">
        <div class="img-caption">US100 Daily showing the same expansion logic on higher timeframes</div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">8</div>
  </div>
</div>

<!-- ========== SLIDE 9: CONTINUATION VS REVERSAL ========== -->
<div class="slide">
  <div class="content-title">Continuation vs Reversal</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px;">
      <div>
        <div class="section-label">Continuation Signals</div>
        <div style="background:#f8f8f8; border-radius:10px; padding:16px; border:1px solid #eee;">
          <div class="signal-item"><div class="signal-dot signal-dot--green"></div><span>Down candles closing above their opens (bullishness inside a bearish move)</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--green"></div><span>FVGs through the highs forming</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--green"></div><span>Expansions THROUGH key levels (not just touching)</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--green"></div><span>Breakaway gaps staying open</span></div>
        </div>

        <div class="rule-highlight" style="margin-top:14px;">
          <div class="rule-highlight__title">Continuation Test</div>
          <div class="rule-highlight__body">Big down candle + close below the level = continuation confirmed.<br>Expand, expand, but NOT through level = NOT continuation.</div>
        </div>

        <div class="quote-block" style="margin-top:12px;">"If this is the start of the run lower, human behavior and technical analysis says when we get here, we should sell off again."</div>
      </div>
      <div>
        <div class="section-label">Reversal Setup</div>
        <div style="background:#f8f8f8; border-radius:10px; padding:16px; border:1px solid #eee;">
          <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span>OLR at the high or low (opposing liquidity run)</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span>Candle close in opposite direction</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span>Failure to expand through key level</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span>FVG fills (closes through it)</span></div>
        </div>

        <div class="rule-highlight" style="margin-top:14px;">
          <div class="rule-highlight__title">The Range Trading Rule</div>
          <div class="rule-highlight__body">"Try not to be a buyer above EQ, and try not to be a seller below EQ."<br><br>
          <strong>Above EQ:</strong> Only buy in FVGs after range high is taken<br>
          <strong>Below EQ:</strong> Only sell in FVGs after range low is taken</div>
        </div>

        <div class="callout" style="margin-top:12px;">This single rule prevents most overtrading inside consolidation.</div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">9</div>
  </div>
</div>

<!-- ========== SLIDE 10: THE COMPLETE PROCESS ========== -->
<div class="slide">
  <div class="content-title">The Complete Process</div>
  <div class="content-body">
    <div style="margin-top:20px;">
      <div class="flow-h" style="margin-bottom:30px;">
        <div class="flow-node">Find Expansion</div>
        <div class="flow-connector"></div>
        <div class="flow-node">Mark Range<br><span style="font-size:10px;font-weight:400;">High, Low, EQ</span></div>
        <div class="flow-connector"></div>
        <div class="flow-node">Wait for OLR</div>
        <div class="flow-connector"></div>
        <div class="flow-node">Confirm CSD<br><span style="font-size:10px;font-weight:400;">Close above 50%</span></div>
        <div class="flow-connector"></div>
        <div class="flow-node flow-node--outline">Enter Trade</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-top:10px;">
      <div style="background:#f8f8f8; border-radius:10px; padding:16px; border:1px solid #eee;">
        <div class="col-title">Entry Rules</div>
        <div class="step-row" style="margin:6px 0;">
          <div class="step-num" style="width:22px;height:22px;min-width:22px;font-size:11px;">1</div>
          <div class="step-text__desc">CSD confirmed on your TF</div>
        </div>
        <div class="step-row" style="margin:6px 0;">
          <div class="step-num" style="width:22px;height:22px;min-width:22px;font-size:11px;">2</div>
          <div class="step-text__desc">Read wick for retracement depth</div>
        </div>
        <div class="step-row" style="margin:6px 0;">
          <div class="step-num" style="width:22px;height:22px;min-width:22px;font-size:11px;">3</div>
          <div class="step-text__desc">Enter on retracement (below close or open)</div>
        </div>
        <div class="step-row" style="margin:6px 0;">
          <div class="step-num" style="width:22px;height:22px;min-width:22px;font-size:11px;">4</div>
          <div class="step-text__desc">Stop below expansion range</div>
        </div>
      </div>
      <div style="background:#f8f8f8; border-radius:10px; padding:16px; border:1px solid #eee;">
        <div class="col-title">Management</div>
        <div class="signal-item"><div class="signal-dot signal-dot--amber"></div><span>At target: partial, BE, or exit</span></div>
        <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span>Key level not closed above = scalp only</span></div>
        <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span>Structure breaks = exit immediately</span></div>
        <div class="signal-item"><div class="signal-dot signal-dot--green"></div><span>After exit: re-evaluate same process</span></div>
        <div class="quote-block" style="margin-top:10px; font-size:11px;">"The moment it gets there, you cannot be thinking 'I'm going to hold this forever.'"</div>
      </div>
      <div style="background:#f8f8f8; border-radius:10px; padding:16px; border:1px solid #eee;">
        <div class="col-title">Targets</div>
        <div class="step-row" style="margin:6px 0;">
          <div class="step-num" style="width:22px;height:22px;min-width:22px;font-size:11px;">A</div>
          <div class="step-text__desc">Range High or Low</div>
        </div>
        <div class="step-row" style="margin:6px 0;">
          <div class="step-num" style="width:22px;height:22px;min-width:22px;font-size:11px;">B</div>
          <div class="step-text__desc">Failure swing level</div>
        </div>
        <div class="step-row" style="margin:6px 0;">
          <div class="step-num" style="width:22px;height:22px;min-width:22px;font-size:11px;">C</div>
          <div class="step-text__desc">EQ of higher TF range</div>
        </div>
        <div class="step-row" style="margin:6px 0;">
          <div class="step-num" style="width:22px;height:22px;min-width:22px;font-size:11px;">D</div>
          <div class="step-text__desc">FVG through failure swing</div>
        </div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:16px;">
      <div class="callout">Processes predict, rules protect. The process is the framework; rules are the execution layer.</div>
      <div class="callout" style="background:#f8f8f8; color:var(--text); border:2px solid var(--amber);">Find 2 trades giving 30 points each, every day. Scale position size as you grow. What more do you need?</div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">10</div>
  </div>
</div>

<!-- ========== SLIDE 11: QUICK REFERENCE CHECKLIST ========== -->
<div class="slide">
  <div class="content-title">Quick Reference Checklist</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
      <div class="checklist-box">
        <div class="checklist-box__title">Expansion Identification</div>
        <div class="check-item"><div class="check-box"></div><span>Find consecutive same-direction closing candles</span></div>
        <div class="check-item"><div class="check-box"></div><span>Mark the Range High and Range Low</span></div>
        <div class="check-item"><div class="check-box"></div><span>Calculate EQ (50% of range)</span></div>
        <div class="check-item"><div class="check-box"></div><span>Assess range size (tight vs wide)</span></div>
        <div class="check-item"><div class="check-box"></div><span>Wait for expansion to confirm (next candle fails to continue)</span></div>
      </div>
      <div class="checklist-box">
        <div class="checklist-box__title">OLR &amp; CSD</div>
        <div class="check-item"><div class="check-box"></div><span>Wait for OLR (opposing move after expansion)</span></div>
        <div class="check-item"><div class="check-box"></div><span>Look for close above/below 50% of last candle</span></div>
        <div class="check-item"><div class="check-box"></div><span>If single big candle: use the open as CSD level</span></div>
        <div class="check-item"><div class="check-box"></div><span>If multiple candles: use open of second candle</span></div>
        <div class="check-item"><div class="check-box"></div><span>Close AT 50% is not enough &mdash; need ABOVE</span></div>
      </div>
      <div class="checklist-box">
        <div class="checklist-box__title">Candle Reading &amp; Entry</div>
        <div class="check-item"><div class="check-box"></div><span>Big wick = expect deep retracement (buy below close)</span></div>
        <div class="check-item"><div class="check-box"></div><span>No wick = no deep retracement (enter near close)</span></div>
        <div class="check-item"><div class="check-box"></div><span>Close above key level = bullish confirmation</span></div>
        <div class="check-item"><div class="check-box"></div><span>Failure to close above = do not hold, scalp only</span></div>
        <div class="check-item"><div class="check-box"></div><span>Stop below expansion range or structure</span></div>
      </div>
      <div class="checklist-box">
        <div class="checklist-box__title">Failure Swings &amp; FVGs</div>
        <div class="check-item"><div class="check-box"></div><span>Mark pushes that fail to reach targets</span></div>
        <div class="check-item"><div class="check-box"></div><span>When target finally breaks, mark the FVG</span></div>
        <div class="check-item"><div class="check-box"></div><span>FVG holds = continuation</span></div>
        <div class="check-item"><div class="check-box"></div><span>FVG fills (close through) = reversal</span></div>
        <div class="check-item"><div class="check-box"></div><span>Don't buy above EQ, don't sell below EQ</span></div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">11</div>
  </div>
</div>

<!-- ========== SLIDE 12: COMMON MISTAKES ========== -->
<div class="slide">
  <div class="content-title">Common Mistakes to Avoid</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:28px;">
      <div>
        <div class="mistake-item">
          <div class="mistake-num">1</div>
          <div><div class="mistake-title">Chasing After a Gap Up</div><div class="mistake-fix">Market gaps up without retracing &mdash; the deep retracement isn't done. <strong>Wait for proper setup.</strong></div></div>
        </div>
        <div class="mistake-item">
          <div class="mistake-num">2</div>
          <div><div class="mistake-title">Buying at 50% Without a Close</div><div class="mistake-fix">Close AT 50% is not enough. <strong>Need a close ABOVE it.</strong></div></div>
        </div>
        <div class="mistake-item">
          <div class="mistake-num">3</div>
          <div><div class="mistake-title">Ignoring Wick Signals</div><div class="mistake-fix">Big wicks predict next candle behavior. <strong>Read the wicks before entry.</strong></div></div>
        </div>
        <div class="mistake-item">
          <div class="mistake-num">4</div>
          <div><div class="mistake-title">Holding Without Key Level Close</div><div class="mistake-fix">"Not closing above here = not a trade to hold." <strong>Scalp only if level unconfirmed.</strong></div></div>
        </div>
      </div>
      <div>
        <div class="mistake-item">
          <div class="mistake-num">5</div>
          <div><div class="mistake-title">Trading Wrong Side of EQ</div><div class="mistake-fix">Buying above EQ or selling below EQ in a range. <strong>Respect the midpoint filter.</strong></div></div>
        </div>
        <div class="mistake-item">
          <div class="mistake-num">6</div>
          <div><div class="mistake-title">Too Many Timeframes</div><div class="mistake-fix">Adding more TFs adds noise, not clarity. <strong>Master one TF pair first.</strong></div></div>
        </div>
        <div class="mistake-item">
          <div class="mistake-num">7</div>
          <div><div class="mistake-title">Forcing Trades Without Structure</div><div class="mistake-fix">"Sometimes you see nothing you know and can use." <strong>No structure = no trade.</strong></div></div>
        </div>
        <div class="mistake-item">
          <div class="mistake-num">8</div>
          <div><div class="mistake-title">Ignoring Time as a Filter</div><div class="mistake-fix">"Five minutes of patience saved a hundred points of loss." <strong>Be aware of session opens &amp; hour changes.</strong></div></div>
        </div>
      </div>
    </div>

    <div class="callout" style="margin-top:20px; text-align:center;">"Don't demand perfection on your first day using this. The process takes practice."</div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">12</div>
  </div>
</div>

<!-- ========== SLIDE 13: KEY QUOTES ========== -->
<div class="slide">
  <div class="content-title">Key Quotes to Remember</div>
  <div class="content-body">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div>
        <div class="quote-block" style="margin-bottom:12px;">"Nine times out of ten, I want to see a green candle that closes above fifty percent of the last down candle."</div>
        <div class="quote-block" style="margin-bottom:12px;">"If there is a big wick on a green candle, there is an almost ninety-five percent likelihood that the next candle will trade below this candle's close."</div>
        <div class="quote-block" style="margin-bottom:12px;">"Fractality tells us that if we know this fractal intimately, we know there may be mini versions happening throughout all of these legs."</div>
        <div class="quote-block" style="margin-bottom:12px;">"Try not to be a buyer above EQ, and try not to be a seller below EQ."</div>
        <div class="quote-block">"Processes predict, rules protect."</div>
      </div>
      <div>
        <div class="quote-block" style="margin-bottom:12px;">"The expectation you bring when you see certain things in the market is one of the big reasons why time is important."</div>
        <div class="quote-block" style="margin-bottom:12px;">"This not closing above here says this is not a trade to hold."</div>
        <div class="quote-block" style="margin-bottom:12px;">"Five minutes of patience saved you from about a hundred points of loss."</div>
        <div class="quote-block" style="margin-bottom:12px;">"We are not trying to have a PhD in education here. We are trying to find what repeats every day that we can trade."</div>
        <div class="quote-block">"Sometimes no trade is a good decision because there is not enough information there."</div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-logo">T</div>
    <div class="footer-brand">TCM</div>
    <div class="footer-sep"></div>
    <div class="footer-page">13</div>
  </div>
</div>

</body>
</html>'''


if __name__ == "__main__":
    html = build_html()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Playbook written to {OUTPUT}")
    print(f"File size: {OUTPUT.stat().st_size / 1024:.0f} KB")
    print(f"Slides: 13")

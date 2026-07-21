#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const framesPath = path.join(__dirname, '..', 'data', 'video-frames', 'PQiRV0JMhIQ', 'frames_b64.json');
const outputPath = path.join(__dirname, '..', 'data', 'architectures', 'tcm-continuation-failures-playbook.html');

const frames = JSON.parse(fs.readFileSync(framesPath, 'utf8'));

function footer(n) {
  return `<div class="footer"><div class="footer-logo">T</div><div class="footer-brand">TCM</div><div class="footer-sep"></div><div class="footer-page">${n}</div></div>`;
}

const css = `
:root {
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
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Sora', sans-serif; background: #f0f0f0; padding: 20px 0; }
@page { size: 1440px 810px; margin: 0; }
.slide {
  width: 1440px; height: 810px; background: white;
  position: relative; overflow: hidden;
  page-break-after: always; margin: 0 auto 20px;
}
.slide::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='central' text-anchor='middle' font-family='Sora,sans-serif' font-weight='800' font-size='28' fill='rgba(0,0,0,0.03)'%3ET%3C/text%3E%3C/svg%3E");
  pointer-events: none; z-index: 0;
}
.slide > * { position: relative; z-index: 1; }
.cover::before { display: none; }
@media print {
  body { background: white; padding: 0; }
  .slide { margin: 0; box-shadow: none; }
  .slide, .slide * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
@media screen { .slide { box-shadow: 0 2px 20px rgba(0,0,0,0.1); } }

/* Cover */
.cover { display: flex; align-items: center; justify-content: space-between; padding: 0 100px; }
.cover-left h1 { font-size: 52px; font-weight: 800; color: var(--charcoal); letter-spacing: -1.5px; line-height: 1.1; }
.cover-sub { font-size: 16px; color: var(--text-light); margin-top: 20px; font-weight: 400; max-width: 500px; line-height: 1.6; }
.cover-right { text-align: center; }
.cover-logo {
  width: 100px; height: 100px; background: var(--charcoal); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: white; font-weight: 800; font-size: 42px; margin-bottom: 12px;
}
.cover-brand { font-size: 32px; font-weight: 600; color: var(--charcoal); }

/* Content */
.content-title {
  position: absolute; top: 48px; left: 60px;
  font-size: 26px; font-weight: 700; color: var(--charcoal); letter-spacing: -0.5px;
}
.content-body {
  position: absolute; top: 110px; left: 60px; right: 60px; bottom: 80px;
}

/* TOC */
.contents-title {
  position: absolute; top: 48px; left: 60px;
  font-size: 28px; font-weight: 700; color: var(--charcoal);
}
.toc {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 600px;
}
.toc-row {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 10px 0; border-bottom: 1px dotted #ddd;
  font-size: 15px; font-weight: 500; color: var(--text);
}
.toc-row span:last-child { color: var(--text-light); font-weight: 400; }

/* Footer */
.footer {
  position: absolute; bottom: 28px; left: 60px;
  display: flex; align-items: center; gap: 12px; z-index: 2;
}
.footer-logo {
  width: 36px; height: 36px; background: var(--charcoal); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: white; font-weight: 800; font-size: 16px;
}
.footer-brand { font-size: 16px; font-weight: 600; color: var(--charcoal); }
.footer-sep { width: 1.5px; height: 20px; background: #ccc; }
.footer-page { font-size: 14px; font-weight: 500; color: var(--text-light); }

/* Typography */
.section-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 1px; color: var(--text-light); margin-bottom: 10px;
}
.body-text {
  font-size: 14px; line-height: 1.7; color: var(--text); max-width: 800px;
}
.col-title {
  font-size: 14px; font-weight: 700; color: var(--charcoal); margin-bottom: 8px;
}

/* Quote block */
.quote-block {
  background: #f8f8f8; border-left: 4px solid var(--amber);
  padding: 16px 20px; border-radius: 0 8px 8px 0;
  font-size: 13px; font-weight: 500; font-style: italic;
  line-height: 1.6; color: var(--text); margin: 12px 0;
}

/* Rule highlight */
.rule-highlight {
  background: var(--amber-light); border: 2px solid var(--amber);
  border-radius: 10px; padding: 14px 18px; margin: 10px 0;
}
.rule-highlight__title {
  font-size: 13px; font-weight: 700; color: var(--charcoal); margin-bottom: 4px;
}
.rule-highlight__body {
  font-size: 12.5px; color: var(--text); line-height: 1.6;
}

/* Callout */
.callout {
  background: var(--amber); border-radius: 8px; padding: 10px 16px;
  font-size: 13px; font-weight: 500; color: var(--charcoal);
}

/* Checklist */
.checklist-box {
  background: #fafafa; border: 1px solid var(--border-light);
  border-radius: 10px; padding: 16px;
}
.checklist-box__title {
  font-size: 14px; font-weight: 700; color: var(--charcoal);
  margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #eee;
}
.check-item {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 12px; color: var(--text); margin: 6px 0; line-height: 1.5;
}
.check-box {
  width: 13px; height: 13px; min-width: 13px; border: 1.5px solid #999;
  border-radius: 3px; margin-top: 2px;
}

/* Flow chart */
.flow-h {
  display: flex; align-items: center; gap: 0; justify-content: center;
}
.flow-node {
  background: var(--amber); border-radius: 8px; padding: 10px 18px;
  font-size: 13px; font-weight: 600; color: var(--charcoal);
  white-space: nowrap;
}
.flow-node--outline {
  background: white; border: 2px solid var(--amber);
}
.flow-connector {
  width: 40px; height: 2px; background: #bbb; position: relative;
}
.flow-connector::after {
  content: ''; position: absolute; right: -1px; top: -4px;
  border-left: 8px solid #bbb; border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
}

/* Mistakes */
.mistake-item {
  display: flex; gap: 12px; margin: 8px 0; align-items: flex-start;
}
.mistake-num {
  font-size: 16px; font-weight: 800; color: var(--red); opacity: 0.4;
  min-width: 20px;
}
.mistake-title { font-size: 13px; font-weight: 700; color: var(--charcoal); }
.mistake-fix { font-size: 12px; color: var(--text); line-height: 1.5; }
.mistake-fix strong { color: var(--green); }

/* Signal dots */
.signal-item {
  display: flex; align-items: center; gap: 8px; margin: 5px 0;
  font-size: 12.5px; color: var(--text);
}
.signal-dot {
  width: 8px; height: 8px; border-radius: 50%; min-width: 8px;
}
.signal-dot--red { background: var(--red); }
.signal-dot--green { background: var(--green); }
.signal-dot--amber { background: var(--amber); }

/* Step rows */
.step-row {
  display: flex; gap: 12px; align-items: flex-start; margin: 8px 0;
}
.step-num {
  width: 26px; height: 26px; min-width: 26px; background: var(--amber);
  border-radius: 6px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: var(--charcoal);
}
.step-text__title { font-size: 13px; font-weight: 700; color: var(--charcoal); }
.step-text__desc { font-size: 11.5px; color: var(--text-light); line-height: 1.5; margin-top: 2px; }

/* Grid boxes */
.grid-4 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.grid-box { background: #fafafa; border: 1px solid var(--border-light); border-radius: 8px; padding: 12px; }
.grid-box__label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-light); }
.grid-box__value { font-size: 14px; font-weight: 700; margin: 4px 0; }
.grid-box__value--green { color: var(--green); }
.grid-box__value--red { color: var(--red); }
.grid-box__value--amber { color: var(--amber); }
.grid-box__desc { font-size: 11px; color: var(--text-light); }

/* Image */
.img-caption { font-size: 11px; color: var(--text-light); margin-top: 6px; font-style: italic; }

/* Chart (kept for completeness) */
.chart-area {
  position: relative; display: flex; align-items: flex-end;
  gap: 28px; padding: 20px 30px; background: #fcfcfc;
  border-radius: 8px; border: 1px solid #eee;
}
.cw { width: 42px; display: flex; flex-direction: column; align-items: center; }
.cw .wt, .cw .wb { width: 2px; background: var(--charcoal); }
.cw .bd { width: 34px; min-height: 6px; }
.cw.bull .bd { background: var(--candle-bull); }
.cw.bear .bd { background: var(--charcoal); }
.plvl { position: absolute; left: 0; right: 0; border-top: 1.5px solid #555; z-index: 2; }
.plvl--dot { border-top-style: dotted; border-color: #999; }
.plvl--amber { border-color: var(--amber); }
.plvl-label { position: absolute; right: 8px; top: -8px; font-size: 10px; font-weight: 600; color: var(--text-light); background: white; padding: 0 4px; }
.anno { background: var(--amber-light); border: 1px solid var(--amber); border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 500; color: var(--charcoal); position: absolute; white-space: nowrap; }
.anno--green { background: #E8F5E9; border-color: #66BB6A; color: #2E7D32; }
.anno--red { background: #FFEBEE; border-color: #EF5350; color: #C62828; }
`;

const vArrow = `<div style="width:2px;height:16px;background:#bbb;margin:0 auto;position:relative;"><div style="position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);border-top:6px solid #bbb;border-left:4px solid transparent;border-right:4px solid transparent;"></div></div>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TCM Continuation Failures Playbook</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>

<!-- ========== SLIDE 1: COVER ========== -->
<div class="slide cover">
  <div class="cover-left">
    <h1>WHY YOUR<br>CONTINUATIONS FAIL</h1>
    <p class="cover-sub">Order Blocks + CISD &mdash; Three reasons continuation trades fail and how to identify them before they cost you. Based on TTrades analysis.</p>
  </div>
  <div class="cover-right">
    <div class="cover-logo">T</div>
    <div class="cover-brand">TCM</div>
  </div>
</div>

<!-- ========== SLIDE 2: TABLE OF CONTENTS ========== -->
<div class="slide">
  <div class="contents-title">Contents</div>
  <div class="toc">
    <div class="toc-row"><span>The Ideal Continuation</span><span>3</span></div>
    <div class="toc-row"><span>Reason 1: Consolidation</span><span>4</span></div>
    <div class="toc-row"><span>Reason 2: Short-Term Highs/Lows</span><span>5</span></div>
    <div class="toc-row"><span>Reason 3: HTF Target Already Taken</span><span>6</span></div>
    <div class="toc-row"><span>Consolidation Solutions</span><span>7</span></div>
    <div class="toc-row"><span>Live Chart Examples</span><span>8</span></div>
    <div class="toc-row"><span>Blending Warning Signs</span><span>9</span></div>
    <div class="toc-row"><span>The Fractal Model Filter</span><span>10</span></div>
    <div class="toc-row"><span>Quick Reference Checklist</span><span>11</span></div>
    <div class="toc-row"><span>Common Mistakes</span><span>12</span></div>
  </div>
  ${footer(2)}
</div>

<!-- ========== SLIDE 3: THE IDEAL CONTINUATION ========== -->
<div class="slide">
  <div class="content-title">The Ideal Continuation</div>
  <div class="content-body">
    <div style="display:grid;grid-template-columns:1fr 540px;gap:36px;height:100%;">
      <div>
        <div class="section-label">THE STANDARD</div>
        <p class="body-text">A valid continuation requires a V-shaped reversal. When price reaches into a fair value gap or sweeps a low, you want a quick, aggressive recovery closing through the series of down-close candles.</p>
        <div class="rule-highlight" style="margin-top:16px;">
          <div class="rule-highlight__title">Candle Count Rule</div>
          <div class="rule-highlight__body">1&ndash;2 candles to close through = ideal. 3 candles = acceptable. 4+ candles = too slow &mdash; treat as consolidation.</div>
        </div>
        <div class="quote-block" style="margin-top:16px;">&ldquo;I prefer 1, 2 maybe three. If it takes longer than that, a lot of times it&rsquo;s just taking too long.&rdquo;</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;">
        <img src="${frames.ideal_pdf}" style="width:100%;max-height:350px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">Ideal continuation: V-shaped recovery with swift closure</div>
      </div>
    </div>
  </div>
  ${footer(3)}
</div>

<!-- ========== SLIDE 4: REASON 1 — CONSOLIDATION ========== -->
<div class="slide">
  <div class="content-title">Consolidation, Not Continuation</div>
  <div class="content-body">
    <div style="display:grid;grid-template-columns:1fr 540px;gap:36px;height:100%;">
      <div>
        <div class="section-label">REASON 1</div>
        <p class="body-text">When price doesn&rsquo;t get the V-shaped recovery and instead forms a consolidation, the eventual closure through is actually manipulation of the range &mdash; not a valid continuation.</p>
        <div style="margin-top:14px;">
          <div class="step-row"><div class="step-num">1</div><div><div class="step-text__title">Identify Slow Recovery</div><div class="step-text__desc">Multiple candles needed to return to the level &mdash; not V-shaped</div></div></div>
          <div class="step-row"><div class="step-num">2</div><div><div class="step-text__title">Recognize the Range</div><div class="step-text__desc">Clear highs and lows form instead of trending &mdash; this is consolidation</div></div></div>
          <div class="step-row"><div class="step-num">3</div><div><div class="step-text__title">Closure = Manipulation</div><div class="step-text__desc">The closure through is sweeping the range high/low, not continuing</div></div></div>
        </div>
        <div class="quote-block" style="margin-top:12px;">&ldquo;This is actually a consolidation. And this closure through which you think is validating this low is actually a manipulation.&rdquo;</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;">
        <img src="${frames.reason1_pdf}" style="width:100%;max-height:350px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">Consolidation scenarios: wait for breakout or manipulation</div>
      </div>
    </div>
  </div>
  ${footer(4)}
</div>

<!-- ========== SLIDE 5: REASON 2 — SHORT-TERM HIGHS/LOWS ========== -->
<div class="slide">
  <div class="content-title">Short-Term Highs &amp; Lows</div>
  <div class="content-body">
    <div style="display:grid;grid-template-columns:1fr 540px;gap:36px;height:100%;">
      <div>
        <div class="section-label">REASON 2</div>
        <p class="body-text">The continuation forms at the same time price takes out short-term highs or significant liquidity levels. This can trigger a reversal or new phase of price.</p>
        <div style="margin-top:14px;">
          <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span>Closure takes out buyside/sellside liquidity simultaneously</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--red"></div><span>Continuation forms while sweeping range highs</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--green"></div><span>After sweep, wait for next candle &mdash; new continuation forms</span></div>
          <div class="signal-item"><div class="signal-dot signal-dot--green"></div><span>Minor adjacent high taken &mdash; less risk if bias is strong</span></div>
        </div>
        <div class="quote-block" style="margin-top:16px;">&ldquo;If a bearish setup is going to form, this is where a bearish setup will form and a bearish change in the state of delivery.&rdquo;</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;">
        <img src="${frames.reason2_pdf}" style="width:100%;max-height:350px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">Short-term target scenarios: wait for confirmation</div>
      </div>
    </div>
  </div>
  ${footer(5)}
</div>

<!-- ========== SLIDE 6: REASON 3 — HTF TARGET ALREADY TAKEN ========== -->
<div class="slide">
  <div class="content-title">HTF Target Already Taken</div>
  <div class="content-body">
    <div style="display:grid;grid-template-columns:1fr 540px;gap:36px;height:100%;">
      <div>
        <div class="section-label">REASON 3</div>
        <p class="body-text">A higher time frame target has already been reached. FOMO traders enter the continuation and get caught in a new phase of price.</p>
        <div class="rule-highlight" style="margin-top:16px;">
          <div class="rule-highlight__title">The Avoidance Rule</div>
          <div class="rule-highlight__body">Don&rsquo;t look for continuations after multiple candles of expansion or after hitting a significant higher time frame objective.</div>
        </div>
        <div class="callout" style="margin-top:14px;">Live to trade another day. Accept you will miss some moves.</div>
        <div class="quote-block" style="margin-top:14px;">&ldquo;I don&rsquo;t look for continuations after we&rsquo;ve already hit a higher time frame objective or had multiple candles of expansion.&rdquo;</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;">
        <img src="${frames.reason3_pdf}" style="width:100%;max-height:350px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">HTF target reached &mdash; avoid continuation entries</div>
      </div>
    </div>
  </div>
  ${footer(6)}
</div>

<!-- ========== SLIDE 7: CONSOLIDATION SOLUTIONS ========== -->
<div class="slide">
  <div class="content-title">Consolidation Solutions</div>
  <div class="content-body">
    <div class="section-label">SOLUTIONS</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:8px;">
      <div class="checklist-box">
        <div class="checklist-box__title">Option A: Trade the Breakout</div>
        <div class="step-row"><div class="step-num">1</div><div><div class="step-text__title">Identify range highs and lows</div></div></div>
        <div class="step-row"><div class="step-num">2</div><div><div class="step-text__title">Wait for price to break range boundary</div></div></div>
        <div class="step-row"><div class="step-num">3</div><div><div class="step-text__title">Breakout must have its own V-shaped continuation</div></div></div>
        <div class="step-row"><div class="step-num">4</div><div><div class="step-text__title">Trade the continuation off the breakout</div></div></div>
        <div class="quote-block" style="margin-top:10px;">&ldquo;If you want to trade a breakout of a consolidation, that&rsquo;s how you do it.&rdquo;</div>
      </div>
      <div class="checklist-box">
        <div class="checklist-box__title">Option B: Trade the Manipulation</div>
        <div class="step-row"><div class="step-num">1</div><div><div class="step-text__title">Identify range highs and lows</div></div></div>
        <div class="step-row"><div class="step-num">2</div><div><div class="step-text__title">Wait for sweep of one side (manipulation)</div></div></div>
        <div class="step-row"><div class="step-num">3</div><div><div class="step-text__title">Look for V-shaped recovery off the sweep</div></div></div>
        <div class="step-row"><div class="step-num">4</div><div><div class="step-text__title">1&ndash;2 candle closure = valid continuation</div></div></div>
        <div class="quote-block" style="margin-top:10px;">&ldquo;We either want to see a manipulation of the low or a breakout of the high.&rdquo;</div>
      </div>
    </div>
    <div style="margin-top:20px;">
      <div class="flow-h">
        <div class="flow-node">Consolidation</div>
        <div class="flow-connector"></div>
        <div class="flow-node flow-node--outline">Wait</div>
        <div class="flow-connector"></div>
        <div class="flow-node">Breakout + Continuation</div>
        <div style="padding:0 12px;font-size:13px;font-weight:600;color:var(--text-light);">OR</div>
        <div class="flow-node">Manipulation + V-Shape</div>
        <div class="flow-connector"></div>
        <div class="flow-node flow-node--outline">Trade</div>
      </div>
    </div>
  </div>
  ${footer(7)}
</div>

<!-- ========== SLIDE 8: LIVE CHART EXAMPLES ========== -->
<div class="slide">
  <div class="content-title">Live Chart Examples</div>
  <div class="content-body">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;height:100%;">
      <div>
        <img src="${frames.ideal_tv}" style="width:100%;max-height:240px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">Ideal: V-shaped into FVG, swift closure, expansion higher</div>
      </div>
      <div>
        <img src="${frames.consolidation_tv}" style="width:100%;max-height:240px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">Consolidation: Slow closure = range manipulation</div>
      </div>
      <div>
        <img src="${frames.manipulation_tv}" style="width:100%;max-height:240px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">Solution: Sweep of low, 2-candle closure = valid</div>
      </div>
      <div>
        <img src="${frames.short_term_highs_tv}" style="width:100%;max-height:240px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">Warning: Continuation takes out significant highs</div>
      </div>
    </div>
  </div>
  ${footer(8)}
</div>

<!-- ========== SLIDE 9: BLENDING WARNING SIGNS ========== -->
<div class="slide">
  <div class="content-title">Blending Warning Signs</div>
  <div class="content-body">
    <div style="display:grid;grid-template-columns:1fr 540px;gap:36px;height:100%;">
      <div>
        <div class="section-label">ADVANCED</div>
        <p class="body-text">When BOTH consolidation AND short-term highs are present, the continuation is extremely hard to trust. Two warning signs active at once demands extra caution.</p>
        <div class="grid-4" style="margin-top:16px;">
          <div class="grid-box">
            <div class="grid-box__label">CONSOLIDATION</div>
            <div class="grid-box__value grid-box__value--amber">Warning</div>
            <div class="grid-box__desc">Slow closure, range forming</div>
          </div>
          <div class="grid-box">
            <div class="grid-box__label">SWEEP</div>
            <div class="grid-box__value grid-box__value--red">Danger</div>
            <div class="grid-box__desc">Taking out short-term highs</div>
          </div>
          <div class="grid-box">
            <div class="grid-box__label">COMBINED</div>
            <div class="grid-box__value grid-box__value--red">Very Hard to Trust</div>
            <div class="grid-box__desc">Both signals active simultaneously</div>
          </div>
          <div class="grid-box">
            <div class="grid-box__label">ACTION</div>
            <div class="grid-box__value grid-box__value--green">Wait</div>
            <div class="grid-box__desc">Wait for breakout or manipulation</div>
          </div>
        </div>
        <div class="quote-block" style="margin-top:14px;">&ldquo;Not only are we forming a consolidation, but we&rsquo;ve also taken out a short-term high. This is a very hard continuation to trust.&rdquo;</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;">
        <img src="${frames.blend_tv}" style="width:100%;max-height:350px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">Both reasons present: consolidation + highs swept</div>
      </div>
    </div>
  </div>
  ${footer(9)}
</div>

<!-- ========== SLIDE 10: THE FRACTAL MODEL FILTER ========== -->
<div class="slide">
  <div class="content-title">The Fractal Model Filter</div>
  <div class="content-body">
    <div style="display:grid;grid-template-columns:1fr 540px;gap:36px;height:100%;">
      <div>
        <div class="section-label">MODEL INTEGRATION</div>
        <p class="body-text">Within the fractal model, wait for the higher time frame candle to complete. Let the next candle form its wick, then trade the move away from the wick.</p>
        <div style="display:flex;flex-direction:column;align-items:stretch;gap:0;margin-top:20px;max-width:260px;">
          <div class="flow-node" style="text-align:center;">HTF Candle Expands</div>
          ${vArrow}
          <div class="flow-node flow-node--outline" style="text-align:center;">Wait for Next Candle</div>
          ${vArrow}
          <div class="flow-node" style="text-align:center;">Wick Forms</div>
          ${vArrow}
          <div class="flow-node flow-node--outline" style="text-align:center;">Entry During Wick</div>
          ${vArrow}
          <div class="flow-node" style="text-align:center;">Trade Away</div>
        </div>
        <div class="quote-block" style="margin-top:16px;">&ldquo;Frame your entries when it is forming the higher time frame wick.&rdquo;</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;">
        <img src="${frames.htf_target_tv}" style="width:100%;max-height:350px;object-fit:contain;border-radius:8px;border:1px solid #e0e0e0;">
        <div class="img-caption">HTF context: multiple expansion candles at significant highs</div>
      </div>
    </div>
  </div>
  ${footer(10)}
</div>

<!-- ========== SLIDE 11: QUICK REFERENCE CHECKLIST ========== -->
<div class="slide">
  <div class="content-title">Quick Reference Checklist</div>
  <div class="content-body">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="checklist-box">
        <div class="checklist-box__title">Before Entry</div>
        <div class="check-item"><div class="check-box"></div><span>Is it V-shaped? (1&ndash;3 candles)</span></div>
        <div class="check-item"><div class="check-box"></div><span>Consolidation forming?</span></div>
        <div class="check-item"><div class="check-box"></div><span>Short-term highs/lows taken?</span></div>
        <div class="check-item"><div class="check-box"></div><span>HTF target already reached?</span></div>
      </div>
      <div class="checklist-box">
        <div class="checklist-box__title">V-Shape Assessment</div>
        <div class="check-item"><div class="check-box"></div><span>1&ndash;2 candles = Strong</span></div>
        <div class="check-item"><div class="check-box"></div><span>3 candles = Caution</span></div>
        <div class="check-item"><div class="check-box"></div><span>4+ candles = Consolidation</span></div>
        <div class="check-item"><div class="check-box"></div><span>Body closes, not wicks</span></div>
      </div>
      <div class="checklist-box">
        <div class="checklist-box__title">Consolidation Response</div>
        <div class="check-item"><div class="check-box"></div><span>Identify range highs/lows</span></div>
        <div class="check-item"><div class="check-box"></div><span>Wait for manipulation or breakout</span></div>
        <div class="check-item"><div class="check-box"></div><span>Breakout needs own continuation</span></div>
        <div class="check-item"><div class="check-box"></div><span>Don&rsquo;t trade internal closures</span></div>
      </div>
      <div class="checklist-box">
        <div class="checklist-box__title">Sweep Response</div>
        <div class="check-item"><div class="check-box"></div><span>Assess significance of level</span></div>
        <div class="check-item"><div class="check-box"></div><span>Wait for next candle</span></div>
        <div class="check-item"><div class="check-box"></div><span>New continuation? Trade it</span></div>
        <div class="check-item"><div class="check-box"></div><span>Failed? Trade other side</span></div>
      </div>
    </div>
  </div>
  ${footer(11)}
</div>

<!-- ========== SLIDE 12: COMMON MISTAKES ========== -->
<div class="slide">
  <div class="content-title">Common Mistakes</div>
  <div class="content-body">
    <div style="max-width:1100px;">
      <div class="mistake-item">
        <div class="mistake-num">1</div>
        <div>
          <div class="mistake-title">Slow Closure = Continuation</div>
          <div class="mistake-fix">4+ candles is consolidation, not continuation. Count the candles. <strong>Wait for V-shape.</strong></div>
        </div>
      </div>
      <div class="mistake-item">
        <div class="mistake-num">2</div>
        <div>
          <div class="mistake-title">Entering at Short-Term Highs</div>
          <div class="mistake-fix">Closure that sweeps significant highs can reverse. <strong>Wait one more candle.</strong></div>
        </div>
      </div>
      <div class="mistake-item">
        <div class="mistake-num">3</div>
        <div>
          <div class="mistake-title">FOMO at HTF Targets</div>
          <div class="mistake-fix">Multiple expansion candles into significant levels = new phase. <strong>Accept the miss.</strong></div>
        </div>
      </div>
      <div class="mistake-item">
        <div class="mistake-num">4</div>
        <div>
          <div class="mistake-title">Trading Range Internals</div>
          <div class="mistake-fix">Closures inside consolidation are noise. <strong>Only trade boundary breaks or sweeps.</strong></div>
        </div>
      </div>
      <div class="mistake-item">
        <div class="mistake-num">5</div>
        <div>
          <div class="mistake-title">No HTF Context Check</div>
          <div class="mistake-fix">Perfect M5 setup at daily resistance = trap. <strong>Always check one timeframe up.</strong></div>
        </div>
      </div>
      <div class="mistake-item">
        <div class="mistake-num">6</div>
        <div>
          <div class="mistake-title">Random Continuations</div>
          <div class="mistake-fix">Without model context, continuations are coin flips. <strong>Frame entries within HTF wick formation.</strong></div>
        </div>
      </div>
    </div>
  </div>
  ${footer(12)}
</div>

</body>
</html>`;

fs.writeFileSync(outputPath, html, 'utf8');
const stats = fs.statSync(outputPath);
console.log('Playbook generated successfully!');
console.log('Output:', outputPath);
console.log('Size:', (stats.size / 1024).toFixed(1), 'KB');
console.log('Slides: 12');

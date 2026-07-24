import re

file_path = r'c:\Users\Analyst\Documents\projects\Songo\public\Documentation\songo-documentation.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_styles = '''<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Outfit:wght@300;400;500;600;700&display=swap');

  :root {
    --ink:       #1A1208;
    --ink-light: #221808;
    --purple:    #C8922A;
    --purple-l:  rgba(200,146,42,0.15);
    --purple-m:  #F5D08A;
    --amber:     #C0522A;
    --amber-l:   rgba(192,82,42,0.15);
    --teal:      #2D6A4F;
    --teal-l:    rgba(45,106,79,0.15);
    --sand:      #1A1208;
    --line:      rgba(200,146,42,0.28);
    --text:      #F5ECD7;
    --muted:     rgba(245,236,215,0.55);
    --white:     #221808;
    --r:         16px;
    --r-sm:      8px;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Outfit', sans-serif;
    background: var(--sand);
    color: var(--text);
    line-height: 1.6;
    background-image: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(107,45,15,0.18) 0%, transparent 70%);
  }

  /* ── SIDEBAR ───────────────────────────────── */
  .layout { display: flex; min-height: 100vh; }
  nav.sidebar {
    width: 240px; flex-shrink: 0;
    background: rgba(34,24,8,0.6); backdrop-filter: blur(10px);
    border-right: 1px solid var(--line);
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
    padding: 1.5rem 0; display: flex; flex-direction: column;
  }
  .nav-brand { padding: 0 1.5rem 1.5rem; border-bottom: 1px solid var(--line); margin-bottom: 1rem; }
  .nav-brand .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .logo-icon {
    width: 36px; height: 36px; background: linear-gradient(135deg, var(--purple), #6B2D0F);
    border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--line);
  }
  .logo-icon svg { width: 20px; height: 20px; }
  .nav-brand h1 { font-family: 'Cinzel', serif; font-size: 20px; font-weight: 700; color: var(--purple-m); letter-spacing: 1px; }
  .nav-brand p { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; }
  .nav-section { padding: 0 1rem; margin-bottom: 1.5rem; }
  .nav-section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); padding: 0 0.5rem; margin-bottom: 0.5rem; }
  .nav-link { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--r-sm); font-size: 13px; color: var(--text); text-decoration: none; transition: background .2s, color .2s; }
  .nav-link:hover { background: var(--purple-l); color: var(--purple-m); }
  .nav-link.active { background: var(--purple-l); color: var(--purple-m); font-weight: 600; border-left: 3px solid var(--purple); }
  .nav-link .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--purple); flex-shrink: 0; opacity: 0.5; }
  .nav-link.active .dot { opacity: 1; box-shadow: 0 0 6px var(--purple); }

  /* ── MAIN ──────────────────────────────────── */
  main { flex: 1; min-width: 0; }

  /* ── HERO ──────────────────────────────────── */
  .hero {
    background: linear-gradient(135deg, rgba(34,24,8,0.9) 0%, rgba(107,45,15,0.4) 100%);
    padding: 4rem 3rem 3rem; position: relative; overflow: hidden; border-bottom: 1px solid var(--line);
  }
  .hero::before {
    content: ''; position: absolute; inset: 0;
    background-image: repeating-linear-gradient( 45deg, transparent, transparent 6px, rgba(200,146,42,0.03) 6px, rgba(200,146,42,0.03) 8px);
    pointer-events: none;
  }
  .hero-badge { display: inline-block; padding: 4px 12px; background: rgba(200,146,42,.15); border: 1px solid rgba(200,146,42,.3); border-radius: 20px; font-size: 11px; color: var(--purple-m); letter-spacing: .08em; text-transform: uppercase; margin-bottom: 1.2rem; }
  .hero h2 { font-family: 'Cinzel', serif; font-size: 42px; font-weight: 700; color: #fff; line-height: 1.1; margin-bottom: .8rem; }
  .hero h2 span { color: var(--purple); }
  .hero p { font-size: 17px; color: rgba(245,236,215,.8); max-width: 520px; line-height: 1.7; }
  .hero-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 1.8rem; }
  .chip { padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 500; background: rgba(255,255,255,.05); color: var(--text); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(4px); }

  /* ── PAGE CONTENT ───────────────────────────── */
  .content { padding: 3rem; max-width: 820px; }
  .content > * + * { margin-top: 3rem; }

  /* ── SECTION HEADERS ─────────────────────────── */
  .section-label { display: flex; align-items: center; gap: 12px; margin-bottom: 1.2rem; }
  .section-num { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--purple), #8A6016); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Cinzel', serif; font-size: 14px; font-weight: 700; flex-shrink: 0; box-shadow: 0 2px 8px rgba(200,146,42,0.3); }
  .section-label h3 { font-family: 'Cinzel', serif; font-size: 24px; font-weight: 700; color: var(--purple-m); }

  /* ── PROSE ──────────────────────────────────── */
  .prose p { font-size: 15px; color: var(--text); line-height: 1.75; margin-bottom: 1rem; }
  .prose p:last-child { margin-bottom: 0; }
  .prose strong { color: var(--purple-m); font-weight: 600; }
  code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; color: var(--purple-m); }
  hr.divider { border: none; height: 1px; background: linear-gradient(90deg, transparent, var(--line), transparent); margin: 3rem 0; }

  /* ── CARD GRID ──────────────────────────────── */
  .card-grid { display: grid; gap: 1rem; }
  .card-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .card-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .card { background: var(--white); border: 1px solid var(--line); border-radius: var(--r); padding: 1.5rem; transition: transform .2s, box-shadow .2s; }
  .card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.3); }
  .card-icon { width: 44px; height: 44px; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 1rem; border: 1px solid var(--line); }
  .card h4 { font-family: 'Cinzel', serif; font-size: 16px; font-weight: 700; color: var(--purple-m); margin-bottom: .4rem; }
  .card p { font-size: 13px; color: var(--muted); line-height: 1.6; }

  /* ── GAME BOARD MOCKUP ──────────────────────── */
  .board-mockup { background: var(--white); border: 1px solid var(--line); border-radius: var(--r); padding: 2rem; margin-bottom: 1rem; box-shadow: inset 0 0 20px rgba(0,0,0,0.2); }
  .board-mockup-title { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 12px; }
  .board-mockup-title::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .board-wrap { background: #3D1A08; border-radius: 80px; padding: 1.5rem; display: flex; align-items: center; gap: 1.2rem; max-width: 620px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 4px 10px rgba(255,255,255,0.05); border: 1px solid #6B2D0F; }
  .store { width: 60px; height: 110px; background: #1A1208; border-radius: 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #fff; flex-shrink: 0; box-shadow: inset 0 4px 10px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.05); }
  .store .store-num { font-size: 24px; font-weight: 700; color: var(--purple-m); }
  .store .store-lbl { font-size: 10px; opacity: .5; text-transform: uppercase; letter-spacing: .05em; }
  .pits-grid { flex: 1; display: grid; grid-template-rows: 1fr 1fr; gap: 12px; }
  .pits-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
  .pit-btn { background: #1A1208; border-radius: 50%; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: background .2s, transform .2s; position: relative; box-shadow: inset 0 3px 8px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.05); }
  .pit-btn:hover { background: #221808; transform: scale(1.05); }
  .pit-btn.active { box-shadow: 0 0 12px var(--purple), inset 0 3px 8px rgba(0,0,0,0.6); border-color: var(--purple); }
  .pit-btn .seeds { font-size: 13px; font-weight: 700; color: #fff; }
  .pit-btn .seeds-dots { display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; width: 32px; }
  .seed { width: 6px; height: 6px; border-radius: 50%; background: var(--purple-m); box-shadow: 0 1px 3px rgba(0,0,0,0.5); }
  .seed.green { background: var(--teal); }
  .row-label { font-size: 10px; color: rgba(245,236,215,.4); text-align: center; margin-top: 6px; text-transform: uppercase; letter-spacing: .08em; }
  .board-legend { display: flex; justify-content: center; gap: 2rem; margin-top: 1.5rem; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
  .legend-dot { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.5); }

  /* ── STEPS ──────────────────────────────────── */
  .steps { display: flex; flex-direction: column; gap: 0; }
  .step { display: flex; gap: 1.2rem; padding: 1.5rem 0; border-bottom: 1px solid var(--line); }
  .step:last-child { border-bottom: none; }
  .step-num { width: 32px; height: 32px; border-radius: 50%; background: var(--purple-l); color: var(--purple-m); display: flex; align-items: center; justify-content: center; font-family: 'Cinzel', serif; font-size: 14px; font-weight: 700; flex-shrink: 0; margin-top: 2px; border: 1px solid var(--purple); }
  .step-body h5 { font-family: 'Cinzel', serif; font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: .4rem; }
  .step-body p { font-size: 14px; color: var(--muted); line-height: 1.6; }

  /* ── RULES TABLE ────────────────────────────── */
  .rules-table { width: 100%; border-collapse: collapse; font-size: 14px; background: var(--white); border-radius: var(--r); overflow: hidden; border: 1px solid var(--line); }
  .rules-table th { background: var(--ink-light); color: var(--purple-m); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--line); }
  .rules-table td { padding: 12px 16px; border-top: 1px solid var(--line); color: var(--muted); vertical-align: top; }
  .rules-table tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
  .rules-table td:first-child { font-weight: 600; color: var(--text); white-space: nowrap; }

  /* ── CALLOUT ─────────────────────────────────── */
  .callout { border-radius: var(--r-sm); padding: 1.25rem 1.5rem; display: flex; gap: 16px; align-items: flex-start; margin: 1.5rem 0; border: 1px solid transparent; }
  .callout.info { background: var(--purple-l); border-left: 3px solid var(--purple); border-color: rgba(200,146,42,0.3); }
  .callout.tip  { background: var(--teal-l); border-left: 3px solid var(--teal); border-color: rgba(45,106,79,0.3); }
  .callout.warn { background: var(--amber-l); border-left: 3px solid var(--amber); border-color: rgba(192,82,42,0.3); }
  .callout-icon { font-size: 20px; flex-shrink: 0; margin-top: 2px; }
  .callout p { font-size: 14px; line-height: 1.6; color: var(--text); }
  .callout p strong { color: var(--purple-m); }

  /* ── FAQ ─────────────────────────────────────── */
  .faq { display: flex; flex-direction: column; gap: 0; }
  .faq-item { border-bottom: 1px solid var(--line); overflow: hidden; }
  .faq-q { width: 100%; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 0; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600; color: var(--text); text-align: left; gap: 1rem; transition: color .2s; }
  .faq-q:hover { color: var(--purple-m); }
  .faq-arrow { width: 28px; height: 28px; border-radius: 50%; background: var(--ink-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .2s, transform .3s; font-size: 12px; color: var(--muted); border: 1px solid var(--line); }
  .faq-item.open .faq-arrow { background: var(--purple-l); color: var(--purple-m); transform: rotate(180deg); border-color: var(--purple); }
  .faq-a { max-height: 0; overflow: hidden; transition: max-height .35s ease; }
  .faq-item.open .faq-a { max-height: 400px; }
  .faq-a p { font-size: 14px; color: var(--muted); line-height: 1.7; padding-bottom: 1.25rem; }

  /* ── AI DIFFICULTY ───────────────────────────── */
  .diff-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; }
  .diff-card { background: var(--white); border: 1px solid var(--line); border-radius: var(--r); padding: 1.5rem; text-align: center; transition: transform .2s; }
  .diff-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.3); }
  .diff-bar-wrap { margin: 1rem 0; }
  .diff-bar { height: 6px; background: var(--ink); border-radius: 3px; overflow: hidden; border: 1px solid var(--line); }
  .diff-fill { height: 100%; border-radius: 3px; }
  .diff-card h4 { font-family: 'Cinzel', serif; font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: .2rem; }
  .diff-card p { font-size: 13px; color: var(--muted); line-height: 1.5; }

  /* ── MODE SCREENS ─────────────────────────────── */
  .screen-mockup { background: var(--white); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .screen-bar { background: var(--ink-light); border-bottom: 1px solid var(--line); padding: .6rem 1.2rem; display: flex; gap: 8px; align-items: center; }
  .screen-bar .dot { width: 10px; height: 10px; border-radius: 50%; }
  .screen-bar .dot:nth-child(1) { background: #FF5F57; }
  .screen-bar .dot:nth-child(2) { background: #FEBC2E; }
  .screen-bar .dot:nth-child(3) { background: #28C840; }
  .screen-bar span { font-size: 12px; color: var(--muted); margin-left: 8px; font-family: monospace; }
  .screen-body { padding: 2.5rem; text-align: center; min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(ellipse at top, rgba(200,146,42,0.1), transparent 70%); }
  .screen-title { font-family: 'Cinzel', serif; font-size: 22px; font-weight: 700; color: var(--purple-m); margin-bottom: 1.2rem; }
  .btn-group { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 240px; }
  .btn-mock { padding: 12px 20px; border-radius: 8px; font-size: 14px; font-family: 'Outfit', sans-serif; font-weight: 600; border: none; cursor: pointer; transition: opacity .2s; }
  .btn-mock.primary { background: linear-gradient(135deg, var(--purple), #8A6016); color: #fff; box-shadow: 0 4px 12px rgba(200,146,42,0.3); text-shadow: 0 1px 2px rgba(0,0,0,0.4); }
  .btn-mock.secondary { background: var(--ink-light); color: var(--text); border: 1px solid var(--line); }
  .lobby-fields { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 280px; }
  .field-mock { background: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; font-size: 13px; color: var(--muted); text-align: left; }

  /* ── FOOTER ──────────────────────────────────── */
  footer { background: var(--ink-light); color: var(--muted); padding: 2.5rem 3rem; font-size: 13px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; border-top: 1px solid var(--line); }
  footer strong { color: var(--text); font-weight: 500; }

  @media (max-width: 768px) {
    nav.sidebar { display: none; }
    .hero { padding: 3rem 1.5rem 2.5rem; }
    .content { padding: 2rem 1.5rem; }
    .card-grid.cols-3, .card-grid.cols-2, .diff-grid { grid-template-columns: 1fr; }
    .board-wrap { flex-direction: column; border-radius: var(--r-xl); padding: 1rem; }
    .store { width: 100%; height: 60px; flex-direction: row; border-radius: 20px; }
    footer { flex-direction: column; text-align: center; }
  }
</style>'''

content = re.sub(r'<style>.*?</style>', new_styles, content, flags=re.DOTALL)

# Replace inline hex colors in body
content = content.replace('background:#EEEDFE', 'background:var(--purple-l)')
content = content.replace('background:#E1F5EE', 'background:var(--teal-l)')
content = content.replace('background:#FDF4E7', 'background:var(--amber-l)')
content = content.replace('background:#C47A2A', 'background:var(--purple-m)')
content = content.replace('background:#4CAF50', 'background:var(--teal)')
content = content.replace('rgba(45,40,117,.5)', 'rgba(200,146,42,0.15)')
content = content.replace('border:2px solid gold', 'border:2px solid var(--purple)')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Documentation style successfully updated.")

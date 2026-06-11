---
name: ve-warm-signal
description: "Warm Signal deck theme: cream paper #faf6f0 with terracotta #c2410c / coral accents, Plus Jakarta Sans rounded-modern sans + Azeret Mono labels, warm radial glow bottom-left, ultra-light coral giant section numbers, terracotta-edged cards, and a built-in warm-charcoal #1c1916 dark theme with a toggle. Scroll-snap single-file HTML deck."
triggers:
  - "warm signal"
  - "暖陶信号"
  - "terracotta deck"
  - "cream presentation"
  - "warm light slides"
  - "dual theme deck"
od:
  mode: deck
  surface: web
  category: slides
  upstream: "https://github.com/nicobailon/visual-explainer"
  preview:
    type: html
    entry: example.html
  example_prompt: "Use the Warm Signal theme to turn my content into a cream-paper single-file HTML deck: terracotta #c2410c accents on #faf6f0, Plus Jakarta Sans display type, warm glow bottom-left, ultra-light coral section numbers, terracotta-edged cards, a light/dark theme toggle (warm charcoal #1c1916 dark mode), scroll-snap navigation with keyboard/touch and #/<n> hash routing. Start from example.html and replace only the content — keep the design system."
  example_prompt_i18n:
    zh-CN: "用「暖陶信号 Warm Signal」主题把我的内容做成奶油纸单文件 HTML 幻灯片：#faf6f0 奶油底 + #c2410c 赤陶强调、Plus Jakarta Sans 圆体现代无衬线、左下暖光晕、超细珊瑚章节巨数、赤陶描边卡片、明暗双主题切换（#1c1916 暖炭黑暗色），scroll-snap 键盘/触摸导航 + hash 路由。从 example.html 出发只替换内容，保留设计系统。"
---

# Warm Signal（暖陶信号）

A locked, single-theme deck plugin ported from the MIT-licensed
[nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer)
`warm-signal` aesthetic (slide-patterns.md "Warm Signal" preset on the
slide-deck.html base). Cream paper, bold rounded sans, terracotta/coral
accents — confident, modern, light-first, with the family-signature
light/dark dual-theme switch built in.

**Start from `example.html` in this plugin folder. It is the proven seed:
copy its `:root` tokens (BOTH theme blocks), engine CSS, slide-type CSS, and
the entire `SlideEngine` script verbatim, then replace only the slide
content. Do not rewrite the design system, and do not introduce any color or
font outside this spec.**

## Design tokens (locked — both themes, list verbatim)

Light theme (the default — this deck is light-first):

```css
:root {
  --font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-mono: 'Azeret Mono', 'SF Mono', monospace;
  --bg: #faf6f0;                          /* cream paper */
  --surface: #ffffff;
  --surface2: #f5ece0;
  --surface-elevated: #fffdf5;
  --border: rgba(60, 40, 20, 0.08);
  --border-bright: rgba(60, 40, 20, 0.16);
  --text: #2c2a25;
  --text-dim: #7c756a;
  --accent: #c2410c;                      /* terracotta */
  --accent-dim: rgba(194, 65, 12, 0.08);
  --code-bg: #2c2520;
  --code-text: #f5ece0;
  --green: #16a34a;  --green-dim: rgba(22, 163, 74, 0.08);
  --red: #dc2626;    --red-dim: rgba(220, 38, 38, 0.08);
}
```

Dark theme (warm charcoal — applied BOTH via
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`
AND via `:root[data-theme="dark"]`, in that order, so the toggle always wins):

```css
  --bg: #1c1916;                          /* warm charcoal */
  --surface: #262220;
  --surface2: #302b28;
  --surface-elevated: #3a3430;
  --border: rgba(200, 180, 160, 0.08);
  --border-bright: rgba(200, 180, 160, 0.16);
  --text: #f0e8dc;
  --text-dim: #a09888;
  --accent: #e85d2a;                      /* coral */
  --accent-dim: rgba(232, 93, 42, 0.1);
  --code-bg: #141210;
  --code-text: #f0e8dc;
  --green: #4ade80;  --green-dim: rgba(74, 222, 128, 0.1);
  --red: #f87171;    --red-dim: rgba(248, 113, 113, 0.1);
```

Fonts come from Google Fonts: `Plus Jakarta Sans` (200/400/500/600/700/800)
and `Azeret Mono` (400/500/600). No other typefaces. No hues beyond
terracotta/coral accent plus the locked green/red status tokens — no blues,
purples, or teals. Cards use 16px border-radius; chips use pill radius.

## Dual theme — NON-NEGOTIABLE family signature

- Both token sets ship in every deck. Default follows the OS via
  `prefers-color-scheme`; a fixed round `.theme-toggle` button (top-right,
  inline SVG sun/moon) sets `data-theme="dark"|"light"` on `<html>` to
  override it. `SlideEngine.buildThemeToggle()` in the seed builds it.
- CSS order matters: `:root` light base → media-query dark block guarded with
  `:root:not([data-theme="light"])` → explicit `:root[data-theme="dark"]`
  block last.

## Deck engine & navigation (keep the seed script verbatim)

- `.deck` is a `100dvh` scroll container with `scroll-snap-type: y mandatory`;
  each page is one `<section class="slide">` at `100dvh`,
  `scroll-snap-align: start`. Default 8–11 slides; honor the requested slide
  count when the user picks one. Split content into more slides instead of
  shrinking type. No internal scrolling except `.table-scroll`.
- An `IntersectionObserver` (threshold 0.5) adds `.visible`; slides enter via
  fade + `translateY(40px) scale(0.98)`; `.reveal` children stagger with
  `transition-delay` steps of 0.1s. Only easing:
  `cubic-bezier(0.16, 1, 0.3, 1)`. `prefers-reduced-motion` is respected.
- Chrome (built by `SlideEngine`): 3px terracotta progress bar top, dot rail
  right (backdrop-blur pill), mono counter bottom-right, fading `← →` hints
  bottom-center, theme toggle top-right.
- Keyboard `←`/`→`/`↑`/`↓`/`Space`/`PageUp`/`PageDown`/`Home`/`End`; touch
  swipe (50px threshold); wheel scrolls through the snap container natively.
- Hash routing: the current slide is mirrored to `#/<n>` (1-based) via
  `history.replaceState`; deep links and `hashchange` restore the slide.

## Signature devices (every deck)

1. **Warm glow bottom-left** — slides default to
   `radial-gradient(ellipse at 12% 92%, var(--accent-dim) 0%, transparent 50%)`;
   vary the ellipse position slightly per slide but keep the warm-corner bias.
2. **Ultra-light coral section numerals** — dividers carry a giant
   `font-weight: 200` number in `var(--accent)` at `opacity: 0.14`, centered
   behind the heading.
3. **Terracotta-edged cards** — KPI and pipeline cards use
   `border: 1px solid var(--border-bright)` plus a
   `border-top: 3px solid var(--accent)` edge; table headers underline with a
   2px accent rule; the split layout's "after" panel gets a 3px accent left
   edge.
4. **Mono labels** — Azeret Mono uppercase letterspaced `slide__label` /
   `slide__subtitle` in accent or dim ink frame every layout.
5. **Corner tick marks** — thin accent SVG corner lines on the title slide.

## Layout masters (compose decks from these — all present in example.html)

| Master | Recipe |
| ------ | ------ |
| `title` (cover) | Centered display (800 weight, accent color), mono kicker above and below, SVG corner ticks |
| `agenda` | Numbered list with hairline rules: accent mono index, bold title, dim mono hint right |
| `divider` | Giant ultra-light coral number behind heading + mono subtitle |
| `content` | 3:2 grid — label + heading + dot bullets left, decorative inline SVG aside right |
| `split` | Two panels: before on `--surface2`, after on `--surface` with 3px accent left edge |
| `pipeline` | Pure CSS/SVG flow: terracotta-topped stage cards joined by SVG arrows, branch rail to pill chips below — **never mermaid** |
| `dashboard` | KPI grid of terracotta-topped cards: 800-weight numeral, mono label, trend line in green/dim |
| `table` | Rounded `table-wrap`, mono uppercase headers with 2px accent underline, zebra rows, hover tint |
| `quote` | 800-weight statement, oversized faded accent quote mark, mono cite |
| `closing` (full-bleed) | Warm charcoal gradient + coral glow bg, scrim, white-warm ink, accent label |

## Output contract

- Single self-contained `.html` file: all CSS and JS inline, zero build step,
  zero external JS libraries or CDN scripts. Only the Google Fonts stylesheet
  link is permitted.
- Diagram/architecture pages are pure CSS/SVG — no mermaid, no Chart.js, no
  remote images. Icons are inline SVG (`var(--accent)` or `currentColor`
  strokes).
- Comment every section: `/* ============ SECTION ============ */`.
- Keep the responsive height breakpoints (700px/600px/500px) and the
  768px-width single-column fallbacks from the seed.
- CSS gotcha: never negate CSS functions directly (`-clamp()` is silently
  ignored) — use `calc(-1 * clamp(...))`.

## Attribution

Token system, SlideEngine, and slide masters come from the upstream
MIT-licensed
[nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer)
skill: `templates/slide-deck.html` base with the
`references/slide-patterns.md` "Warm Signal" token preset, with the mermaid
diagram page replaced by a zero-dependency CSS/SVG pipeline page.

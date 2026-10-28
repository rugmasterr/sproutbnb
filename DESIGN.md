# Sprout 春笋 — Design System (dark BNB terminal)

Visual language: near-black ink, hairline borders, Geist + Geist Mono, tiny uppercase mono kickers,
huge tight-tracked headlines with a softer second line, glass cards, soft radial glows, grain,
staggered rise-in. **Accent = BNB yellow.** **Bamboo green = growth / up / bamboo motifs.**
Dark-only (no light theme, no theme toggle). Visual only: never change logic, data, contract calls or i18n keys.

Source of truth: `tailwind.config.ts`, `src/app/globals.css`, `src/components/ui.tsx`,
`src/components/brand.tsx`, `src/components/fx/*`.

---

## 1. Tokens

All are CSS vars (RGB triplets) → Tailwind colours with `/alpha` support.

| Tailwind | Value | Use |
|---|---|---|
| `bg` = `ink` | #07080A | page |
| `raised` = `ink-2` | #0D0F12 | cards |
| `card` = `ink-3` | #13161A | inner surfaces, modals' wells |
| `ink-4` | #1A1E23 | highest surface, glass tint |
| `line` | ≈ white 10% | default hairline (`border-line`) |
| `line-2` | ≈ white 17% | stronger hairline (glass, inputs, chips) |
| `fg` | #F2F0E8 | text |
| `muted` | ~66% | secondary text |
| `faint` | ~45% (AA on ink) | labels, kickers-muted, meta |
| `accent` / `accent-hi` / `accent-deep` | #F0B90B / #FCD535 / #C99400 | BNB yellow: primary CTA, kickers, focus, active |
| `accent-fg` | #0B0A04 | text on yellow |
| `bamboo` / `bamboo-hi` / `bamboo-deep` | #2EBD6B / #7CE3A0 / #1F6B43 | growth, "up", grove, success |
| `up` / `down` | #2EBD6B / #F6465D | price change |
| `gold` | #F4B728 | ZEC amounts (same yellow family) |
| `seal` | red | 春笋 chop + sell button. **Sparingly.** |
| legacy: `bamboo-500/700/900`, `shoot-300`, `leaf-200`, `paper`, `soil` | re-valued | still compile; prefer new names |

Shadows: `shadow-glow`, `shadow-glow-sm`, `shadow-glow-green`, `shadow-lift`.
Radius: cards `rounded-2xl` (22px), big panels `rounded-3xl`, buttons/chips `rounded-full`.
Easing: `ease-out` = cubic-bezier(.22,.8,.2,1) (also `var(--ease)` in CSS).

## 2. Type

- `font-sans` / `font-display` = Geist → Noto Sans SC (CJK falls through automatically).
- `font-mono` = Geist Mono → kickers, numbers in tickers, addresses, table headers, labels.
- `font-cjk` = Noto Sans SC only. `.zh-glyph` = CJK accent span (e.g. `<span className="zh-glyph text-accent">竹林</span>`).
- Numbers: add `.num` (tabular-nums).

| Class | Size | Notes |
|---|---|---|
| `.h-display` | clamp(2.6rem, 7vw, 6.5rem), lh .96, -0.055em | hero only |
| `.h1` | clamp(2.25rem, 5vw, 4.25rem), -0.05em | page heads, CTA panel |
| `.h2` | clamp(1.9rem, 4vw, 3.4rem), -0.045em | section titles |
| `.h3` | xl→2xl, -0.03em | card titles |
| `.lede` | 1.05→1.3rem, muted, 42ch | under headlines |
| `.soft` | muted colour | 2nd headline line: `<h2 className="h2">Plant a coin. <span className="soft">Grow the grove.</span></h2>` |
| `.soft-yellow` | animated white→yellow→green gradient text | at most one per page |
| `.kicker` / `.kicker-muted` / `.kicker-green` | 11px mono uppercase .1em | above every heading |
| `.mono-label` / `.label` | 10.5px mono uppercase faint | stat labels / form labels |
| `.stat-value` | huge gradient number | big counters |

**CJK rules** (automatic under `html[lang=zh-CN]` / `:lang(zh)`): headings get -0.01em…-0.015em tracking and
lh ≈1.2; body lh 1.7; kickers .06em. Don't force `tracking-[-0.05em]` on elements that may hold Chinese —
use the `.h*` classes (they adapt) or add `lang`-safe values. Never put CJK in `uppercase` expecting a change, never
letter-space CJK > .1em. Keep Chinese headings ~15% smaller than English if you hand-size them
(`lang === 'zh' ? 'text-[34px]' : 'text-[40px]'` pattern is fine).

## 3. Layout recipes

- Page gutter: `container` (16px phone, 24 md, 32 lg; max 1240).
- Section: `<section className="section">` (py-16 / sm:py-24) or `.section-tight`.
- Section opener:
  ```tsx
  <Kicker index={2}>Live market</Kicker>
  <h2 className="h2 mt-3 max-w-[16ch]">Every trade <span className="soft">in ZEC.</span></h2>
  ```
  or `<SectionHead kicker="Live" index={2} title=… zh=… sub=… action=… />` (ui.tsx).
- Inner page head: `<PageHead title zh sub kicker? />` (grid + glow + stalks built in).
- Backgrounds: `.grid-bg` (dot grid), `.lines-bg` (48px grid), `.fade-mask-b` (fade to bottom), `.ink-wash`
  (yellow/green radial wash), `.glow-yellow` / `.glow-green` (radial blob on an absolutely-positioned div).

## 4. Surfaces & components (CSS classes)

| Class | What |
|---|---|
| `.card` | ink-2, hairline `line`, 22px radius |
| `.card-hover` | lift + yellow border + glow on hover (add to `.card`) |
| `.glass` | ink-4→ink-2 gradient, `line-2`, blur 16px, inset highlight — status cards, floating panels |
| `.box` + `.box-h` | app panel with header row (terminal, trade panels) |
| `.well` | recessed black/30 area (inputs groups, swap legs) |
| `.btn-primary` | **yellow**, dark text, ring+glow on hover. One per view region. |
| `.btn-ghost` | hairline, white wash |
| `.btn-green` | bamboo green (buy/"grow" actions if yellow is taken) |
| `.btn-seal` | red (sell / destructive). |
| `.btn-sm` / `.btn-lg` | sizes. `<span className="arr">→</span>` inside a btn slides on hover. |
| `.icon-btn` | 36px round hairline icon button |
| `.input`, `.input-mono`, `select.input`, `.label` | forms (focus = yellow border + 4px wash ring) |
| `.chip`, `.chip-on` | mono filter chips |
| `.tag-yellow/-green/-red/-muted` | tiny mono uppercase outline tags |
| `.seg` + `.seg-btn[aria-selected|aria-pressed]` | segmented control (the `Tabs` component uses it) |
| `.table-tech` | mono uppercase headers, hairline rows, hover wash; add `num` to numeric `td/th` (right-aligned) |
| `.skeleton` | shimmer placeholder |
| `.bamboo-rule` / `NodeRule` | simple bamboo-node divider |
| `.prose-sprout` | long-form docs |

ui.tsx exports (unchanged signatures, restyled): `Modal, SectionHead(+kicker,index), PageHead(+kicker), Stat,
ZecValue, Empty, ErrorNote, PrelaunchBanner, StageBadge, Progress, FeeDest, CoinImage, CopyButton, Ext, Tabs,
InternalLink, Row, Notice`.

brand.tsx: `Mark({size, tone:'bnb'|'brand', glow})` (inline SVG; `bnb` = green sheaths + yellow tip),
`Logo({compact, href})`, `Seal({size})`, `ZecGlyph`, `BnbGlyph` (generic diamond, not the official logo),
`ZecChip`, `NodeRule`, `Stalks` (neon yellow/green stalks SVG).

Stage colours: Seed 笋芽 = yellow outline, Shoot 春笋 = green outline, Grove 竹林 = solid bamboo-hi.

## 5. fx primitives — `import { … } from '@/components/fx'`

| Component | Props | Notes |
|---|---|---|
| `HeroCanvas` | `className, stalks?, density?=1, interactive?=true, align?='right'\|'center', seed?=7` | Fills its box: put it in a `relative overflow-hidden` section as `className="absolute inset-0"`. `align="right"` keeps stalks in the right ~46% on ≥1024px; on narrow screens it dims to 50% behind copy. Pauses offscreen/hidden tab; reduced-motion = static frame; aria-hidden. One per page. |
| `Ticker` | `children, speed?=40 (s/loop), reverse?, pauseOnHover?=true, gap?='gap-10', label?` | Seamless marquee. Wrap: `<div className="border-y border-line bg-raised/60 py-4"><Ticker label="Live trades">…</Ticker></div>` |
| `TickerItem` | `k, v, tone?: 'default'\|'up'\|'down'\|'accent'` | mono `BUY $SPRT +1.2 ZEC` |
| `Scramble` | `text, trigger?='view'\|'mount'\|'hover', duration?=900, charset?='latin'\|'hex', delay?, className` | decode effect, layout-stable, SR reads final text. Use for kickers, addresses, short headline words — not paragraphs. |
| `Reveal` | `children, i? (stagger), as?, className, style, id` | scroll rise-in (opacity + 26px + blur). Visible without JS. |
| `Rise` | `children, d? (stagger), as?, className` | load-time rise for above-the-fold hero copy (d = 0,1,2…). |
| `CountUp` | `value, format?, decimals?, duration?, prefix?, suffix?, fallback?, className` | counts on view; pass `format={fmtAmt}` etc. Never feed fake numbers — if data is missing pass `null` (shows fallback). |
| `Kicker` | `children, tone?='accent'\|'green'\|'muted'\|'red', index?, node?, pill?, as?` | `index={1}` → `01 — LABEL`; `pill` = hero pill. |
| `GlowPanel` | `children, tone?='yellow'\|'green', grid?=true, href?, as?, className` | big CTA panel; with `href` the whole panel is a Link — put a `<span className="btn-primary btn-lg">` inside (no nested links). |
| `StatusDot` | `tone?='green'\|'yellow'\|'red'\|'muted', pulse?=true` | decorative; always pair with text. |
| `StatusLine` | `tone, pulse, children` | dot + mono label (`BNB Chain · 56`). |
| `CopyChip` | `value, label?, href?, full?` | contract/address chip with copy button (i18n'd aria). |
| `NodeDivider` | `label?, className` | rich bamboo-node separator. |
| `NodeRing` | `tone?='yellow'\|'green'\|'muted'` | single node capsule (bullets, markers). |
| `BambooBar` | `value 0..1, segments?=5, tone?, label?` | segmented stalk progress (progressbar role). |
| `ScrollSteps` | `steps: {title, body?, tone?}[], onActive?(i)` | numbered 01..N list; active step follows scroll, progress hairline fills; click works; not pinned (mobile-safe). |
| `NodeTrack` | `items: {label, when?, state?: 'done'\|'now'\|'next'}[]` | roadmap / stage strip on a bamboo stalk. |
| `Grain` | — | already mounted in layout.tsx. Don't add again. |
| hooks | `useInView`, `useReducedMotion` | |

Hero pattern (example):
```tsx
<section className="relative overflow-hidden border-b border-line">
  <HeroCanvas className="absolute inset-0" />
  <div className="container relative flex min-h-[88vh] flex-col justify-center py-20">
    <Rise d={0}><Kicker pill>…</Kicker></Rise>
    <h1 className="h-display mt-6 max-w-[14ch]">
      <Rise as="span" d={1} className="block">{line1}</Rise>
      <Rise as="span" d={2} className="soft block">{line2}</Rise>
    </h1>
    <Rise d={3}><p className="lede mt-6">{sub}</p></Rise>
    <Rise d={4} className="mt-8 flex flex-wrap gap-3"><Link className="btn-primary btn-lg" …/><Link className="btn-ghost btn-lg" …/></Rise>
    <Rise d={5} className="glass mt-10 max-w-md p-4">…status card: StatusLine + BambooBar + CopyChip…</Rise>
  </div>
</section>
```
Stat strip: `grid grid-cols-2 md:grid-cols-4 border-y border-line-2` with `divide-x divide-line`, each cell
`<span className="stat-value"><CountUp …/></span><span className="text-sm text-muted">label</span>`.

## 6. Motion rules

- Easing `ease-out` (.22,.8,.2,1); UI transitions 200–300ms; reveals 900ms; stagger 90ms.
- Load: `Rise` only above the fold. Scroll: `Reveal` per block (not per list item beyond ~6).
- Infinite motion only for: HeroCanvas, Ticker, status-dot pulse, `.soft-yellow` drift, skeleton. Nothing else loops.
- `prefers-reduced-motion`: globals.css kills animations/transitions; fx components render final state. Don't
  add JS animations that ignore `useReducedMotion()`.
- Hover lift max `-translate-y-0.5`; never scale text.

## 7. Do / Don't

Do
- Use tokens (`text-muted`, `border-line`, `bg-raised`…), never raw hex in pages.
- One yellow primary CTA per region; secondary = ghost. Green for "up/growth/grove/success", red only for down/sell/error/seal.
- Kicker above every section heading; headline with a `.soft` second line.
- Keep everything inside `container`; check 390px width — no horizontal scroll (`min-w-0` on grid/flex children, `truncate`/`break-all` for addresses).
- Keep `aria-*`, focus rings (yellow outline is global), `sr-only` text. Decorative SVG/canvas `aria-hidden`.
- ZEC amounts: `text-gold` / `ZecValue` / `ZecAmount`.

Don't
- Don't reintroduce a light theme, Fraunces/Inter, or serif CJK.
- Don't copy veilit text, logos, images, or violet colours.
- Don't use the seal red as a general accent; one `Seal` per page at most.
- Don't stack multiple HeroCanvas, or glass-on-glass.
- Don't fabricate data for visuals (tickers/counters must show real data or an honest empty/prelaunch state).
- Don't change i18n keys/semantics; new visual-only labels that must be translated need a dict entry by the i18n owner — otherwise keep them brand/technical (BNB Chain, ZEC, Flap, numbers).

## 8. Global chrome (owned by the design-system agent)

- Header: sticky glass bar (transparent until scroll → `bg/75` + hairline), Logo, mono uppercase nav with a yellow
  bamboo-node underline on the active link, Launch (ghost), `ConnectButton` (Zcash start = gold, BNB wallet = ghost),
  segmented `EN | 中` (`LangToggle`, exported). Mobile: numbered full-width menu.
- Footer: grid/glow top, Logo + tagline + `StatusLine` (BNB Chain · chain id), mono column labels, NodeDivider,
  disclaimer + privacy, Seal, mono bottom bar.
- layout.tsx: Geist/Geist Mono (`geist` pkg) + Noto Sans SC (next/font, preload off), `<Grain />`, content wrapper `relative z-[2]`.

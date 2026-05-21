# Session deck — *Four developers, one database, and an AI agent*

> Full session outline + slide-by-slide deck spec for the AI Coding Summit
> CaseFlow demo. **Talk length: 15 minutes. Slide count: 14.** Read this
> alongside [demo-flow.md](demo-flow.md) (the on-stage script) and
> [session-abstract.md](session-abstract.md) (the published abstract).

---

## 1 · Look and feel

### 1.1 Palette (locked to Azure Cosmos DB brand)

| Token        | Hex       | Use                                                        |
| ------------ | --------- | ---------------------------------------------------------- |
| `--bg`       | `#f9f9f9` | Slide background. Default for ~80% of slides.              |
| `--ink`      | `#07101E` | All body text, code, chart axes. **Never pure black.**     |
| `--cosmos`   | `#3b75cf` | Primary accent. Section dividers, headlines, key numbers.  |
| `--cyan`     | `#8ee2fc` | Secondary accent. Highlight pills, "after" bars in charts. |
| `--ink-pop`  | `#07101E` | Inverted slides (pivot / wrap). White text on this.        |

Rule: every slide uses **at most two** of `--cosmos` / `--cyan` /
`--ink-pop` as accents. Body is always `--bg` + `--ink`.

### 1.2 Typography

- **Headings:** Segoe UI Semibold, -1% tracking. Fallback: Inter.
- **Body:** Segoe UI Regular, 24pt minimum on slides.
- **Code / numbers / RU values:** Cascadia Code or JetBrains Mono.
  Numbers always monospaced so before/after deltas line up.
- **Pull-quote (CTO quote, audience question):** Segoe UI Light Italic,
  44pt, `--cosmos`.

### 1.3 Layout grid

- 16:9, 1920×1080, 80px outer margin, 12-column grid.
- Cosmos DB planet glyph (the attached `cosmos-logo.png` reference)
  sits bottom-right at 64×64 on every content slide. Title and divider
  slides get it larger (160×160) centered.
- Footer strip, 4px tall, `--cosmos`, runs the full width of every
  content slide. Removed on full-bleed slides.

### 1.4 Slide archetypes

1. **Title** — full-bleed `--ink-pop`, cyan planet, white wordmark.
2. **Section divider** — `--cosmos` background, large white roman
   numeral + section title, planet glyph.
3. **Content** — `--bg` background, headline in `--ink`, one visual
   element (logo wall / chart / code), speaker quote optional.
4. **Code** — `--ink-pop` background, Cascadia Code in `--bg` with
   `--cyan` highlight for the offending line.
5. **Metric** — single number, 240pt, `--cosmos`, with one-line caption
   below in `--ink`.
6. **Pivot** — full-bleed `--ink-pop`, single pull-quote, no chrome.

---

## 2 · Asset inventory

### 2.1 Fake company / product logos (in this repo)

All SVG, brand-aligned with the Cosmos palette so they don't fight the
deck. Drop into slides at native size.

| File                                                       | Use                                              |
| ---------------------------------------------------------- | ------------------------------------------------ |
| [assets/logos/northstar.svg](assets/logos/northstar.svg)   | The company that built CaseFlow. Slide 1, 13.    |
| [assets/logos/caseflow.svg](assets/logos/caseflow.svg)     | The product. App-chrome slide and Slide 2, 11.   |
| [assets/logos/lumen-robotics.svg](assets/logos/lumen-robotics.svg) | Customer logo wall. Slide 3.             |
| [assets/logos/pinecrest-logistics.svg](assets/logos/pinecrest-logistics.svg) | Customer logo wall. Slide 3.   |
| [assets/logos/vellum-health.svg](assets/logos/vellum-health.svg) | Customer logo wall. Slide 3.                |

### 2.2 Free-use imagery (developer-focused)

Pull from **Unsplash** (license: free for commercial use, no attribution
required but appreciated). Search and pick — don't hot-link, download
and embed so the deck works offline.

| Slide | Search query on unsplash.com           | Crop / treatment                                 |
| ----- | -------------------------------------- | ------------------------------------------------ |
| 1     | `developer laptop dark`                | Full-bleed, 60% `--ink-pop` overlay, low-key.    |
| 4     | `four people whiteboard standup`       | Right half of slide, desaturated 30%.            |
| 5     | `tired developer night`                | Tight crop on hands at keyboard, monochrome.     |
| 7     | `code on screen close up`              | Background, behind code panel, 20% opacity.      |
| 13    | `team celebrating office`              | Right third, full color.                         |

Cosmos DB planet glyph: use the attached reference image (the cloud-and-
planet logo). Place per §1.3.

---

## 3 · The story arc (so each slide earns its place)

**Cold open (1 min):** Four developers shipped on deadline. It works.
Six months in, finance is angry. The CTO asks one question.

**Setup (2 min):** Meet CaseFlow. Meet the customers. Show the bill.

**Phase 1 — Inspect, skill OFF (4 min):** Look at Diagnostics. Snapshot
the baseline. Ask the agent with a "don't use the Cosmos skill" prefix.
Watch it suggest cache / consistency / index. Plausible. Not the root
cause.

**Phase 2 — Pivot (1 min):** Disclose the mechanic. Re-ask with "DO use
the skill" prefix. Watch the diagnosis flip to *partition-key anti-
pattern + N+1 fan-out*.

**Phase 3 — Correct (3 min):** One prompt. The agent repartitions to
`/tenantId` and collapses the N+1 into a server-side `GROUP BY`.

**Phase 4 — Test (3 min):** Re-run the workload. Click Compare to
snapshot. Read the delta out loud.

**Wrap (1 min):** Tie back to the CTO question. The skill is the
asset — the agent is the delivery mechanism.

---

## 4 · Slide-by-slide

> Format: **Slide N — `<archetype>` — *Title*** · what's on screen · what
> you say.

### Slide 1 — Title — *Four developers, one database, and an AI agent*

- **Visual:** Full-bleed `--ink-pop`. Cosmos planet glyph centered at
  160×160. Title in white Segoe UI Semibold 72pt. Subtitle "Azure
  Cosmos DB · AI Coding Summit 2026" in `--cyan` 28pt. Unsplash
  developer-at-laptop photo as 15% opacity backdrop.
- **Say:** Your name, role, and: *"This talk is 15 minutes. We're going
  to take a real production-shaped app, find two beginner mistakes, and
  let an AI agent fix them in front of you. Twice — once without the
  Cosmos skill, once with. The difference is the whole point."*

### Slide 2 — Content — *Meet CaseFlow*

- **Visual:** [CaseFlow logo](assets/logos/caseflow.svg) centered top.
  Three-line product description below: *"Internal support app. Built
  by [Northstar Helpdesk](assets/logos/northstar.svg). Series A. Eight-
  week launch sprint. Four developers, none had used Cosmos DB before."*
- **Say:** *"CaseFlow is the app on screen for the rest of the talk.
  Tickets, agents, tenants, dashboards. Nothing exotic."*

### Slide 3 — Content — *And their customers*

- **Visual:** Logo wall, 2×2 grid:
  [Lumen Robotics](assets/logos/lumen-robotics.svg),
  [Pinecrest Logistics](assets/logos/pinecrest-logistics.svg),
  [Vellum Health](assets/logos/vellum-health.svg), and a "+ 47 more"
  pill in `--cyan`.
- **Say:** *"Real customers, paying real money. The biggest three are
  also the ones the database hates most. Hold that thought."*

### Slide 4 — Pivot quote — *The CTO question*

- **Visual:** Full-bleed `--ink-pop`. Single pull-quote, `--cyan`:
  > *"Why is this so expensive, and what's the smallest change that
  > brings the bill down this quarter?"*
  Attribution underneath in `--bg` 18pt: "— CTO, Northstar Helpdesk".
- **Say:** *"That's the question landing on engineering's desk. Not
  'rewrite it.' Not 'migrate off.' Smallest change. This quarter."*

### Slide 5 — Metric — *The cost curve*

- **Visual:** Single number, `--cosmos`, 240pt: **3.4×**. Caption
  below: *"Cosmos DB spend per tenant, today vs. 12 months ago.
  Revenue per tenant: flat."* Tiny line chart in `--cosmos` /
  `--cyan` underneath, no axes, just the gap widening.
- **Say:** *"Spend grew 3.4× per tenant. Revenue didn't. That's
  margin compression and that's why this is an executive problem,
  not an engineering curiosity."*

### Slide 6 — Section divider — *I · Inspect*

- **Visual:** `--cosmos` background, white roman numeral "I" at 320pt,
  "Inspect" in white 56pt. Cosmos planet bottom-right.
- **Say:** *"Phase one. Look at what the system is actually doing."*

### Slide 7 — Code — *The smoking gun (Diagnostics)*

- **Visual:** Screenshot of the Diagnostics page from the running app.
  `--cyan` highlight pills on two things: `crossPartition: true`
  (every row) and `agentWorkload — 13 queries / call`.
- **Say:** *"Two facts. Every operation is cross-partition. One
  workload fires thirteen queries per call. I'm not going to tell you
  why yet. I'm going to ask the agent."*

### Slide 8 — Content — *Round 1: ask the agent (skill OFF)*

- **Visual:** Two-column. Left: the prompt block from §1 of demo-flow,
  rendered as code, with the "do NOT consult the skill" clause
  highlighted in `--cyan`. Right: a typical generalist answer
  bulleted — *cache it · lower consistency · add an index · batch the
  requests*. Stamp `--cyan` "PLAUSIBLE. NOT ROOT CAUSE." across the
  right column.
- **Say:** *"This is what the agent says without Cosmos expertise.
  Every one of these is a thing a senior engineer would try. None of
  them is the bug."*

### Slide 9 — Pivot — *Same agent. Same codebase. Same telemetry.*

- **Visual:** Full-bleed `--ink-pop`. Pull-quote, `--cyan`:
  > *"The only thing changing is whether the agent is allowed to use
  > the Cosmos skill."*
  No other chrome.
- **Say (verbatim):** *"In round one I told the agent to ignore the
  Cosmos skill. Same effect as a developer who never installed it.
  Now watch what happens when I tell it to use the skill."*

### Slide 10 — Content — *Round 2: ask the agent (skill ON)*

- **Visual:** Same two-column layout as Slide 8 for visual rhyme.
  Left: identical prompt, with the "DO consult the skill" clause
  highlighted in `--cyan`. Right: the two named anti-patterns, each
  with file:line reference —
  - *Partition key `/id` → cross-partition fan-out
    ([cosmosStore.ts:66](../backend/src/data/cosmosStore.ts#L66))*
  - *Procedural per-agent loop → N+1; collapse to server-side
    `GROUP BY` ([caseService.ts:189](../backend/src/services/caseService.ts#L189))*
- **Say:** *"Same agent. Different scope. It names the anti-patterns
  by their actual names and points at the lines."*

### Slide 11 — Section divider — *II · Correct & Test*

- **Visual:** `--cosmos` background, "II" 320pt, "Correct & Test" 56pt.
- **Say:** *"One prompt to fix, one workload re-run to prove it."*

### Slide 12 — Metric — *The delta*

- **Visual:** Two stacked metrics, both monospaced numerals.
  Top: `agentWorkload` RU — **before 412 · after 38** (≈11× drop),
  rendered as a `--cosmos` bar shrinking to a `--cyan` bar.
  Bottom: `crossPartition` rate — **100% · 0%**.
  Caption: *"Same workload. Same Cosmos account. Measured on the
  built-in Diagnostics compare panel."*
- **Say:** *"That's the number I'd put in front of the CTO. Eleven-x
  RU drop on the hot path, cross-partition fan-out gone, no schema
  migration, no vendor change."*

### Slide 13 — Content — *The takeaway*

- **Visual:** Three-line list, each line `--cosmos` icon + `--ink` text:
  1. **The skill is the asset.** Codified expertise, version-controlled.
  2. **The agent is the delivery mechanism.** Same model, different scope.
  3. **The test is the proof.** Built-in telemetry, not vibes.
  Right third: Unsplash "team celebrating" photo.
- **Say:** *"Three things. Skills are how you ship expertise you don't
  have on the team. Agents are how you apply it. Tests are how you
  prove it. Pick any two and the third gets weaker."*

### Slide 14 — Title (closing) — *Thank you · Q&A*

- **Visual:** Mirror of Slide 1. Cosmos planet centered. Title white.
  QR code in `--cyan` linking to the repo. Handle/email in
  `--bg` 22pt.
- **Say:** *"Repo's on the QR. Skill is open. Questions."*

---

## 5 · Build checklist

- [ ] Export the five SVG logos to PNG @ 2× for PowerPoint compatibility
      (`docs/assets/logos/*.png`). SVG works in Keynote and reveal.js
      directly.
- [ ] Download three Unsplash photos per §2.2 into
      `docs/assets/photos/` and reference by relative path.
- [ ] Save the Cosmos planet glyph from the attached reference into
      `docs/assets/cosmos-planet.png`.
- [ ] Build the deck in your tool of choice (PowerPoint / Keynote /
      reveal.js). Layouts above are tool-agnostic.
- [ ] Run one rehearsal pass with [demo-flow.md](demo-flow.md) open on
      the confidence monitor — the slides are pointers, the script is
      authoritative.

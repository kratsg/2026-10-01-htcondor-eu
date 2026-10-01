# CLAUDE.md — working on this repo

This repo is a **short reveal.js deck** (title + ten slides): "Agents Need Context, Not Just Models",
Giordon Stark's contribution to the **UH Physics & Astronomy AI "rap session"**
(2026-09-24, https://indico.phys.hawaii.edu/event/2985/). It is **public** and auto-deploys
to GitHub Pages (https://kratsg.github.io/2026-09-24-uhawaii-colloquium-rap/).
Read `README.md` for the audience-facing overview and `title-abstract.md` for the blurb;
this file is for whoever edits it next.

Session format (from the DJ notes on the event page): informal open discussion, **three
slides per speaker**, focus on AI agents for **HEP data analysis**, privacy/security
discussed **at the end**, no "future of humanity" tangents. Other speakers: Tommy Lam,
Kevin Flood, Keisuke Yoshihara, Zepeng Li.

It was cut down from the PyHEP.dev 2026 MCP deck (`kratsg/2026-09-08-pyhepdev-mcp`, same
`styles.css`, `images/`, skills, and Pages workflow) plus the Nikhef colloquium
(`kratsg/2026-07-01-nikhef-colloquium`, local at `~/2026-07-01-nikhef-colloquium`), whose
`arch-swap` / `arch-quiet` / `arch-intent` slides supply the big-picture framing. The
citation-grade source for every claim is **`mcp-design-talk.md`** (committed).

The slides (the session asked for three per speaker, so keep it tight):

1. `title`
2. `jfc`: bridge to the other rap talks (JFC paper arXiv:2603.20179, Kevin Flood, Zepeng Li)
3. `prompt`: from prompt to discovery ("what is needed behind this URL?"), from AMG Weekly 2026-09-04
4. `arch-swap`: model / harness / facility context & tools; "where do my job outputs go?"
5. `what-is-mcp`: MCP intro (PyHEP.dev)
6. `facility-native`: convenient, secure, auditable (AMG Weekly)
7. `trace`: the MCP Platform, animated gateway diagram
8. `behind-gateway`: MCP servers, identity brokering, others' servers (AMG Weekly)
9. `capabilities`: MCP = arms and hands, skills = expertise, USATLAS marketplace (AMG Weekly)
10. `clariphy`: CLARIPHY's curated awesome-hep-agentic-analysis list
11. `design`: security as architecture + "treat the agent like a new student"; closing quote

Sources beyond the two decks: the AMG Weekly talk PDF (`~/Downloads/20260904_AMGWeekly.pdf`,
not committed) and the CLARIPHY awesome list.

The audience is physicists, not computing people: keep the jargon high level.

## How to work on it

- Authored with the **project-local skill** in `.agents/skills/revealjs/` — build
  mechanics (scaffold, overflow check, screenshots, in-browser editor) and design
  conventions. Read `.agents/skills/revealjs/SKILL.md` before structural changes.
- It's already scaffolded. **Don't re-scaffold.** Edit `presentation.html` incrementally
  (one or a few slides at a time) — never rewrite the whole file at once.

## The edit → verify loop (do this every change)

1. Edit `presentation.html` / `styles.css`.
2. `node .agents/skills/revealjs/scripts/check-overflow.js presentation.html` — must report
   **no overflow** (slides are fixed 1280×720; content must fit).
3. Screenshot with decktape and **look at every changed slide** (see README for the command).
4. Watch for code blocks wrapping mid-line in the screenshots — the overflow checker does
   not flag ragged `<pre>` wraps; shorten the code lines instead of shrinking fonts.

## Content rules (match these)

- **Keep it short.** Aim for **40–50 words of visible text per slide**; depth goes
  into speaker notes.
- **Voice:** Giordon's — plain, direct, first person, honest about failures. Don't
  reintroduce hype.
- **Evidence-backed only.** Every technical claim traces to `mcp-design-talk.md` or the
  Nikhef deck. Don't invent numbers.
- **Em-dash policy (humanized):** prose uses commas/colons/periods. Em-dashes only in
  real quotations and "Name — role" lists.
- **Speaker notes:** every slide has an `<aside class="notes">`, conversational, first
  person, spoken cadence, straight apostrophes. Don't name the session chair in notes
  unless Giordon supplies the name.
- Never put a literal `<!-- ... -->` inside another HTML comment (it closes the outer one).

## Theme & mechanics

- **Theme:** UChicago Maroon (`#800000`) on warm off-white, teal (`#1F6F78`) / slate
  accents. All in `styles.css` CSS variables. **Font sizes in `pt`**, never px/em/rem.
- **reveal 6.0.1** from CDN. Plugins: **Notes only**. `slideNumber: 'c/t'`, fixed
  `width: 1280, height: 720`. No chart library; diagrams are `.node`/`.flow-arrow`
  HTML+CSS. Reusable components in `styles.css`: `.card`, `.callout`, `.tag`, `.stat`,
  `.node`, `.kicker`, `.shot`.
- **The trace slide's animated gateway diagram** (`.pdiag` CSS + the GSAP "gateway
  pulse" script at the bottom of `presentation.html`) is the mcp-portal landing
  animation, ported via R. Gardner's WLCG OTF12 deck (robrwg/2026-08-25-WLCG-OTF12; the
  original is af-mcp-platform `portal/src/lib/gatewayPulse.ts`). It plays only while
  the slide is on screen, is skipped under `?export` (decktape shows the static
  diagram, correctly) and under prefers-reduced-motion, and needs the GSAP CDN script
  tag that precedes reveal.js.
- **Build stamp:** fixed top-right element `id="buildstamp"` reads `dev` locally;
  `deploy.yml` rewrites it to `<short-sha> · <date>` at publish time. Keep the `id` and
  the `dev` default so the sed anchor keeps working.
- Node deps for the skill scripts live in `.agents/skills/revealjs/node_modules`
  (gitignored); run `npm install` there if the overflow checker can't find puppeteer,
  then `npx puppeteer browsers install chrome` once.

## Sources (what feeds the slides)

- `mcp-design-talk.md` — committed research dossier: per-project analysis, cross-project
  patterns, ~40 negative lessons with commits, spec comparison, principles, checklist.
- `research/` — **gitignored** intermediate reports (one per repo + synthesis + spec
  baseline + live-gateway snapshot). Regenerate rather than commit.
- The Nikhef deck (`~/2026-07-01-nikhef-colloquium/presentation.html`) — more big-picture
  slides to borrow from (thesis, arch-intent, proof-*).
- The analyzed repos live locally under `~` (rucio-mcp, ami-mcp, af-jupyterlab-mcp,
  af-filesystem-mcp, atlas-search-mcp-bridge, af-credentials, {krb5,voms,condor}-token-service,
  af-mcp-platform, flux_apps) — link, don't commit. Known defects found during the
  research are filed as issues on the maniaclab repos, not tracked here.

## Commits & deploy

- Commit/push to **`main`** (no feature branches needed). Conventional Commits.
- End commit messages with `Assisted-by: Claude (Anthropic)` (Giordon's convention — not
  Co-Authored-By).
- Pushing `main` auto-deploys via `.github/workflows/deploy.yml`. Verify the run is green
  and the live site updated. Pages source: **Settings → Pages → GitHub Actions** (one-time).

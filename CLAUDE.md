# CLAUDE.md — working on this repo

This repo is a **reveal.js deck**: "The Facility Is the Context: Building an MCP Platform for
Scientific Computing", Giordon Stark's 20-minute talk (including a live demo) at the
**HTCondor Workshop Autumn 2026** (CC-IN2P3 Lyon, 2026-10-01, session "Condor and AI",
https://indico.cern.ch/event/1659396/contributions/7273024/). It is **public** and
auto-deploys to GitHub Pages (https://kratsg.github.io/2026-10-01-htcondor-eu/).
Read `README.md` for the audience-facing overview and `title-abstract.md` for the blurb;
this file is for whoever edits it next.

The audience is **sysadmins**. The organizers asked for the implementation details of the
AF MCP Platform rather than the visionary Nikhef framing, so the main line is platform
internals; deep-dives sit in vertical stacks.

Assembled from the Nikhef colloquium (`~/2026-07-01-nikhef-colloquium`, primary), the
PyHEP.dev 2026 MCP deck (`~/2026-09-08-pyhepdev-mcp`, same `styles.css`, `images/`, skills,
and Pages workflow), and the UH rap-session slides (`~/2026-09-24-uhawaii-colloquium-rap`,
big picture + MCP concepts). The citation-grade source for every claim is
**`mcp-design-talk.md`** (committed).

The slides:

1. `title`
2. `prompt`: from prompt to discovery ("what is needed behind this URL?"), AMG Weekly 2026-09-04
3. `arch-swap`: model / harness / facility context; generic vs facility-aware answer to "where do my job outputs go?"
4. `what-is-mcp` (+ `what-is-mcp-build` backup): MCP intro (PyHEP.dev)
5. `capabilities`: MCP = arms and hands, skills = expertise (AMG Weekly)
6. `facility-native`: convenient, secure, auditable (AMG Weekly)
7. `naive-vs-real` (+ `gateway-overview` Nikhef architecture figure): tutorial vs production chain, plus the MCP and credential layers
8. `topology`: one MCP, many, or a gateway? (Nikhef)
9. `trace` (+ `trace-steps` deep-dive): animated gateway diagram, infrastructure-as-config
10. `p-identity`: identity is ambient, never an argument (PyHEP.dev)
11. `p-credentials` (+ `p-credentials-custodians` deep-dive, incl. condor-token-service) (PyHEP.dev)
12. `platform-scale`: lessons learned, what breaks at ten MCPs (+ `interface-problem`, `p-errors`, `p-context`, `platform-scale-lessons` deep-dives) (PyHEP.dev)
13. `considerations`: CIMD, ssh-oidc, sandboxing summarized, linking the Nikhef deep-dives
14. `ops`: AI at every layer; the HTCondor daily report and drafted held-job emails (Nikhef)
15. `demo`: live demo divider; the prompt is https://gist.github.com/kratsg/6956cf796e269c5d13cb2835e72ee664
16. `interop` (+ `interop-spec` backup, MCP 2.0 scorecard): interfaces that travel (PyHEP.dev)
17. `appropriate`: when is an MCP server appropriate? (PyHEP.dev)
18. `discuss`: what we don't know yet (Nikhef)
19. `close`: facility-aware collaborator, still-hard list, pointers

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

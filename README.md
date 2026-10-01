# The Facility Is the Context: Building an MCP Platform for Scientific Computing

Slides by Giordon Stark (University of Chicago) for the **HTCondor Workshop Autumn 2026**
(CC-IN2P3, Lyon), session "Condor and AI", 1 October 2026. A 20-minute talk with time held
for a live demo of the AF MCP Platform at UChicago.

**▶ View the deck:** https://kratsg.github.io/2026-10-01-htcondor-eu/
**▶ Contribution page:** https://indico.cern.ch/event/1659396/contributions/7273024/
**▶ Demo prompt:** https://gist.github.com/kratsg/6956cf796e269c5d13cb2835e72ee664

The big picture: the model and the harness are swappable; what makes an agent useful (and
safe to trust) on a shared facility is reliable, secure access to the software, data,
workflows, and identities it already has. The main line is how the AF MCP Platform does
that: one gateway, identity from the IdP on every call, credentials minted per service by
custodians (including the one next to the HTCondor pool key), and services added by config.
The slides are drawn from three earlier talks:

- the Nikhef colloquium, 2026-07-01 ([deck](https://kratsg.github.io/2026-07-01-nikhef-colloquium/))
- PyHEP.dev 2026, 2026-09-07 ([repo](https://github.com/kratsg/2026-09-08-pyhepdev-mcp))
- the UH AI rap session, 2026-09-24 ([repo](https://github.com/kratsg/2026-09-24-uhawaii-colloquium-rap)),
  itself drawing on ATLAS AMG Weekly, 2026-09-04 ("Towards Agentic Analysis")

The research behind every claim, with commit-level citations, is in
[`mcp-design-talk.md`](mcp-design-talk.md).

## The slides

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

## What's here

| Path | What it is |
|------|------------|
| `presentation.html` | The deck (reveal.js 6.0.1, loaded from CDN — no build step) |
| `styles.css` | UChicago-maroon theme (CSS variables, `pt` font sizing) |
| `title-abstract.md` | Title and short description for this session |
| `mcp-design-talk.md` | The full research dossier the slides are built from |
| `images/` | Committed figures |
| `.agents/skills/` | The `revealjs` build skill used to author the deck |
| `.github/workflows/deploy.yml` | Auto-publishes to GitHub Pages on push to `main` |

## View it

- **Online:** the GitHub Pages link above (always reflects `main`).
- **Locally:** open `presentation.html` in a browser. It pulls reveal.js from a CDN, so you
  need a network connection the first time.
- **Speaker notes:** press **`S`** in the browser (allow the popup) for speaker view —
  current + next slide, notes, and a timer. Every slide has notes.
- **Build stamp:** a small footer reads `dev` locally and `<short-sha> · <date>` on the
  deployed site, so you can tell which version is live.

## Edit it

Edit `presentation.html` directly (one slide / a few slides at a time), or use the
in-browser editor from the reveal.js skill:

```bash
node .agents/skills/revealjs/scripts/edit-html.js presentation.html
```

After editing, check for content overflow and review screenshots (Node deps live under
`.agents/skills/revealjs/node_modules`, gitignored — run `npm install` there if missing):

```bash
# flag any slide whose content exceeds 1280×720
node .agents/skills/revealjs/scripts/check-overflow.js presentation.html

# screenshot every slide (export mode disables animations)
.agents/skills/revealjs/node_modules/.bin/decktape reveal "presentation.html?export" \
  output.pdf --screenshots --screenshots-directory "screenshots/$(date +%Y%m%d_%H%M%S)"
```

> Heads-up: media-heavy slides (video / large images) can render *scaled-down* in the
> decktape export — that's a capture artifact. They render correctly in a real browser;
> trust `check-overflow.js` (it reports no overflow) over the decktape thumbnail.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which publishes
`presentation.html` (as `index.html`) + `styles.css` + `images/` to GitHub Pages, injects
the build stamp, and attaches a best-effort `slides.pdf`. One-time setup: repo **Settings →
Pages → Source: GitHub Actions**.

## Credits

Slides AI-assisted by Claude (Anthropic). All quoted code and commit
references are from the real repositories under github.com/maniaclab and github.com/kratsg.

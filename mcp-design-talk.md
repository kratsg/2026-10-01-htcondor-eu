# Designing Good MCPs for HEP

*What building a real ecosystem of MCP servers, bridges, credential services, and a
production platform teaches about designing Model Context Protocol servers.*

Research basis: eleven repositories (six MCP-layer projects, four credential-infrastructure
projects, one platform) analyzed independently by staged research agents, 2026-09-05, with
full git archaeology; cross-checked against the live production deployment on the UChicago
ATLAS Analysis Facility and the current MCP specification (revision 2026-07-28,
modelcontextprotocol.io). Citations are `repo/path/file.py:lines` and `commit abc1234`.
Inferences are labeled. The detailed per-repo reports live in `research/` (local, not
committed).

---

## 1. Executive Summary

The central question — *what does building a real ecosystem of MCPs teach us about how to
design good MCPs?* — has a two-part answer that the evidence supports overwhelmingly:

1. **The interface is designed for the model.** An MCP tool definition is an API whose
   consumer is a probabilistic programmer. Everything follows: errors are returned, not
   raised, and name the next tool to call; every output is bounded, curated, and confesses
   its own truncation; docstrings are executable and rot like code; empty results carry
   routing hints; validation is server-side because, for an agent, client-side validation
   does not exist.

2. **The architecture is driven by the credential.** In a scientific facility, the MCP
   protocol handler is a small fraction of the work (in rucio-mcp, identity/server plumbing
   ≈ 2,700 LOC vs ≈ 2,540 LOC of tools). The load-bearing decisions are where identity is
   established, where authorization is decided (exactly once), where credentials are minted
   (never in the MCP), how long they live (exactly one call), and which trust domain holds
   each root secret (its own custodial service). The production platform, `af-mcp-platform`,
   is best understood as *a credential broker that grew an MCP face* — git shows the
   aggregator arriving five weeks after the credential machinery (`88b4003` vs `36453f6`).

Along the way the ecosystem independently converged on choices the MCP specification later
standardized (stateless HTTP, explicit state handles, CIMD over Dynamic Client
Registration) and deliberately diverged from others (markdown-only outputs, no tool
annotations) — with measurable costs at the platform layer that produced a written
tool-authoring convention as the correction.

The strongest lessons are negative: pagination that materialized 500k files to serve 100
rows; a "transparent" proxy that silently ate `Content-Encoding`; six consecutive
production failures after green CI, all environmental; a governance rename that caused a
fleet-wide 401 because a service's registry name doubled as its token audience. Section 7
catalogs 40 of these with commit evidence.

---

## 2. Research Methodology

Staged, independence-preserving multi-agent analysis (per the research brief):

- **Stage 1 — individual MCPs, independently:** `rucio-mcp`, `ami-mcp`,
  `af-jupyterlab-mcp`, `af-filesystem-mcp`, `atlas-search-mcp-bridge`. One agent per repo;
  no agent saw another repo or any other agent's conclusions.
- **Stage 2 — credential infrastructure, independently:** `af-credentials`,
  `krb5-token-service`, `voms-token-service`, `condor-token-service`. Same isolation.
- **Stage 3 — cross-project synthesis** over the nine reports only, with the platform repo
  explicitly excluded, producing a provisional hypothesis and a list of questions the
  component evidence could not answer.
- **Stage 4 — `af-mcp-platform`** (broker/gateway, portal, charts) plus its production
  Flux/Helm deployment (`flux_apps/af/mcp-platform`, secrets never read), treated as the
  architectural synthesis; the Stage 3 open questions were answered against it.
- **Baselines:** the MCP specification (2025-06-18 build-window semantics and the current
  2026-07-28 revision) fetched from modelcontextprotocol.io; a live snapshot of the
  production gateway taken through its own read-only orientation tools.

Every agent used `git log`/`git show`/`git blame` archaeology, tagged conclusions as
Observation / Historical evidence / Pattern / Principle / Recommendation, and was
instructed to label inferences and to prefer negative findings over best practices.

One structural caveat conditions every "convergence" claim: these repos share one author
and an explicit template lineage (ami-mcp stamped from rucio-mcp's plan; krb5-token-service
"modeled on voms-token-service's scaffolding", `51ac09f`). Most recurrence is one
deliberate convention propagated. The strongest evidence is therefore (a) a convention
surviving contact with five different backends, (b) conventions consciously *broken* with
a written reason, and (c) the same class of production bug recurring in unrelated code.
The analysis distinguishes these throughout.

---

## 3. The MCP Ecosystem

### Components

| Layer | Project | One-line identity |
|---|---|---|
| MCP server | `rucio-mcp` | 45 tools (38 read / 7 write) over the native `rucio.client` for ATLAS/CMS/DUNE/ESCAPE data management; thin wrapper + thick LLM-pedagogy layer; 124 commits, Mar–Aug 2026 |
| MCP server | `ami-mcp` | 11 read-only tools over ATLAS AMI + PMG cross-sections; hybrid design: one `ami_execute` power tool + a taught query-language corpus + ten curated workflow tools |
| MCP server | `af-jupyterlab-mcp` | 22 tools managing per-user JupyterLab servers on Kubernetes and proxying a second MCP server *inside* each notebook pod; a policy layer, not a k8s wrapper |
| MCP server | `af-filesystem-mcp` | 4 read-only tools (`fs_list/stat/read/grep`) over the user's own home/data; the security boundary is kernel uid/gid impersonation, not path strings |
| Protocol adapter | `atlas-search-mcp-bridge` | ~600-line auth-translation reverse proxy: broker bearer-JWT world in, CERN SPNEGO-only OpenSearch MCP out; deliberately zero MCP awareness |
| Credential client library | `af-credentials` | ~560-LOC, 2-dependency library every backend embeds: verify broker identity tokens (JWKS) + redeem them for VOMS proxies / krb5 ccaches |
| Credential custodian | `voms-token-service` | mints VOMS proxies from the user's own `~/.globus`; the only component allowed to see home dirs and Globus passphrases |
| Credential custodian | `krb5-token-service` | exchanges CERN username+password/keytab for Kerberos tickets; zero secrets at rest |
| Credential custodian | `condor-token-service` | verifies a broker JWT and runs `condor_token_create` next to the pool signing key, which never leaves Condor's trust domain |
| Platform | `af-mcp-platform` | broker (gateway/aggregator, 21k src / 33k test LOC, 1,337 tests) + portal (18k LOC) + Helm chart; deployed in production for ~800 users |

The "AF gateway MCP" of the research brief is the `broker/` component of `af-mcp-platform`
(confirmed with the author); it is analyzed with the platform in §9.

### The live production surface (snapshot 2026-09-05)

Captured through the deployed gateway's own tools (`af_whoami`, `af_list_mcp_servers`,
`af_list_identities`):

- **7 services fronted** + the builtin gateway service; ~124 tools configured, **110
  visible in the live session** — because the OpenSearch bridge was down and its 14 `os_*`
  tools were withheld from `tools/list` rather than failing at call time. Failure isolation
  is visible in the tool surface itself.
- Prefix namespacing (`rucio-atlas_*`, `ami_*`, `jlab_*`, `fs_*`, `condor_*`, `af_*`).
- Each service row carries its **credential provider** (x509 → VOMS, krb5, condor IDToken,
  broker-issued) as first-class catalog metadata.
- Permissions are group-derived verbs (`read_data`, `manage_data`, `manage_jupyter`,
  `submit_jobs`, …) resolved from the identity directory.
- The gateway's instructions declare two failure modes as **policy decisions, not
  transient errors** (permission denial → don't retry; missing credential → link identity
  first), assign each service a trust tier, and carry per-service safety policy
  ("creating/deleting replication rules changes real data placement across the grid —
  confirm the exact DID and RSE with the user first").

---

## 4. Individual MCP Analysis

### 4.1 rucio-mcp — the curated-wrapper archetype

- **Scope (Observation):** rule-lifecycle data management only; no data movement, no admin,
  no upload/download. 45 tools, 38 read / 7 write, mapped ~1:1 onto `rucio.client`
  methods, plus one invented tool where the client's shape confused agents.
- **Founding decision (Historical evidence):** the committed founding transcript
  (`2026-03-25-…txt`) records a pivot from "Rust binary shelling out to the rucio CLI" to
  Python over the native client: structured client objects beat text-parsing, and
  single-binary distribution is worthless when users already need a Python grid stack.
- **The LLM-pedagogy layer (Observation):** commit `f1508e7` imported arcade.dev's llm.txt
  conventions wholesale — pagination footers ("Pass `offset=50` to see more."),
  "**Next steps:**" hints, `classify_error` with "**Recovery:** use `<tool>`" prose,
  `human_bytes`. State-conditional hints route the agent (`rules.py:111-139`: rule STUCK →
  check RSE capacity); empty results carry redirects. The same error taxonomy feeds
  Prometheus `TOOL_ERRORS{category}` — agent confusion is dashboardable.
- **Tool splitting (Historical evidence):** `9f4caed` split `rucio_list_container_replicas`
  out of the dataset-replicas tool explicitly "so the LLM knows which tool to reach for
  based on the DID type" — tools get split along the lines agents confuse, with
  bidirectional redirect hints.
- **Negative lessons:** "pagination theater" — five tools materialized full upstream
  iterators before paginating (a 500k-file container downloaded to serve a 100-row page),
  fixed by an external contributor with streaming iterators (`24f7497`). A session-keyed
  client cache could hand one user another's client under a stale session id (`9d7022a`).
  Mock-verified tools shipped real API misuse found only in live review (`eb61db4`).
- **Auth (Observation):** four modes (stdio env / OIDC bridge / shared secret / broker
  JWT); the tool list itself varies per mode. Broker mode redeems the caller's VOMS proxy
  per tool call and deletes it after authentication (`broker.py:154-181`); the disk token
  cache is disabled to prevent cross-user leakage (`broker.py:102-116`).
- **Design for the least-capable client (Historical evidence):** a fully designed
  scope-based routing redesign was deferred in writing because only Claude supports
  `oauth.scopes` (`plan-scope-based-routing-deferred.md`); the root OAuth metadata fallback
  was deleted after gemini CLI broke on it (`89e66cf`); DCR was abandoned for CIMD after
  restarts orphaned registered client ids (`7f651e1`) — a choice the 2026-07-28 spec later
  vindicated by deprecating DCR in favor of CIMD.

### 4.2 ami-mcp — the power-tool + taught-DSL archetype

- **Scope & exposure decision (Observation):** all-read-only, 11 tools. The strategy is
  stated in-repo: "We do NOT hide query construction behind hundreds of wrappers — we give
  the LLM the DSL and let it be expressive" (`CLAUDE.md:14-17`). A ~10.5 KB domain textbook
  (`nomenclature.py`) ships via `instructions` *and* resources; ten curated workflow tools
  encode the accumulated operational knowledge.
- **Docs are executable (Historical evidence):** four same-day corrective commits
  (`74e9063`, `000160c`, `78a2ce3`, `8bea8de`) fixed wrong syntax *in docstrings and
  resources* because the model reproduces examples verbatim (`LIMIT 0,N`; don't quote
  `-catalog`; no `LIKE` on `logicalDatasetName`). In a teach-the-DSL MCP, documentation
  must be debugged against the live service like code.
- **Output curation (Historical evidence):** commit `901f339` ("optimize MCP tools for LLM
  usefulness") is a one-commit catalogue of raw-wrapper failure modes: 100+ fields → a
  15-field allowlist; a 14-column table pivoted to Level|Tags; dedup — plus a real CVMFS
  double-tab parsing bug that mocked fixtures had hidden.
- **Soft validation (Observation):** a wrong dataset type warns-and-proceeds with the
  repair path named (`hashtags.py:131-138`) rather than refusing.
- **Credential arc (Historical evidence):** `b34927c` → `dd44cb7` → `b05a385` refactored
  client provisioning into a per-call factory so broker mode could redeem a per-user VOMS
  proxy, use it for exactly one AMI call, and delete it — tools untouched; the server holds
  no standing credential (`auth/broker.py:92-104`).
- **Where the time went (Observation):** the tool surface took two days; the second half of
  the project added zero tools — entirely transports, identity, Helm, CI. A large
  accidental-complexity tax came from wrapping legacy pyAMI (import side effects, blocking
  I/O, a `<3.12` Python ceiling).

### 4.3 af-jupyterlab-mcp — state, writes, and brokered execution

- **Scope (Observation):** a policy layer over Kubernetes ("no raw-k8s-manifest escape
  hatch", `CLAUDE.md:14-19`): create/manage per-user JupyterLab servers, then proxy an
  upstream MCP server running inside each notebook pod (16 `jlab_nb_*` wrapper tools).
- **Identity is never a parameter (Observation):** every server is owned by
  `claims.unixname` from the verified broker JWT; **no tool takes an owner argument**
  (`tools/jupyterlab.py:48-66`) — impersonation is unrepresentable, not merely forbidden.
- **Brokered execution beats credential disclosure (Historical evidence):** the same PR
  that added the 16 proxy tools deleted `get_jupyter_server(include_url=True)` — once the
  server could act inside the notebook by injecting `JUPYTER_TOKEN` server-side, the token
  became unobtainable via MCP (`4ea435f`, `k8s/proxy.py`).
- **The dual-writer revert (Historical evidence):** a least-privilege pass eliminated the
  per-notebook Secret as "redundant" (`cee3e03`); one day later it was restored with
  live-cluster evidence that af-portal silently reads it (`37f214d`). Final state: the MCP
  writes a Secret it is RBAC-forbidden from reading (create+delete only). Your unused code
  path may be another writer's API.
- **State model (Observation):** `stateless_http=True` after multi-replica session 404s
  (`92ff9cc`); notebook/kernel session state lives in the pod's upstream `jupyter-mcp-server`,
  addressed by one stable identifier (pod name = k8s label = subdomain = tool argument).
- **Server-side enforcement (Observation):** always-on guardrails (CPU 1–16, mem 1–256Gi,
  1–72 h), motivated in-repo by the incumbent portal enforcing its 72 h cap in HTML only
  (`CLAUDE.md:142-151`). Error design is security design: `NotFoundOrNotYoursError`
  deliberately conflates 404/403 to block name enumeration (`k8s/errors.py:26-31`).
### 4.4 af-filesystem-mcp — the kernel is the boundary

- **Scope (Observation):** four read-only verbs over the caller's own `/home/<user>` and
  `/data/<user>`; "read-only is not a flag, it is the only code path that exists"
  (`e996562`, CLAUDE.md non-goals) — auditable by grep.
- **Security model (Observation):** every operation runs in a short-lived subprocess
  started as the caller's real uid/gid (`impersonate.py:76-90`); path confinement is
  explicitly demoted to "policy hygiene and prompt-injection containment, **not** the
  security boundary" (`paths.py:1-23`). The kernel enforces alice-reads-only-alice even if
  every path check is buggy.
- **Founding rejection (Historical evidence):** `rust-mcp-filesystem` was evaluated and
  rejected for a dangling-symlink validate-then-open TOCTOU and no per-user identity;
  `secure_open_confined`'s O_NOFOLLOW dir-fd walk (`paths.py:124-145`) is the direct fix.
- **Context discipline (Observation):** every tool has a bounded worst-case context cost
  (1 MiB read / 200 grep matches / 20 per file / 10 s timeout / per-user concurrency
  semaphore of 4 — "a runaway fs_grep should degrade that one user's own throughput, not
  everyone else's NFS RTT", `_helpers.py:83-96`), each with in-band truncation markers and
  docstring recovery guidance ("narrow `path` and retry").
- **Three-audience errors (Observation):** machine tags (`PATH_ESCAPE`, `NOT_FOUND`) at the
  subprocess boundary → LLM-friendly prefixes → recovery hints and "Next actions" bullets
  (`tools/_helpers.py:37-162`).
### 4.5 atlas-search-mcp-bridge — the protocol adapter

- **Why it exists (Observation):** the incompatibility is purely *authentication*, not
  transport: CERN's OpenSearch MCP sits behind an Apache Negotiate-only SPNEGO gate; the
  platform's aggregator injects broker-minted bearer JWTs, and "CERN's OpenSearch cluster
  is a third-party service with no idea what an AF Broker Identity Token is, so something
  has to sit in between" (`README.md:9-19`).
- **Design (Observation):** ~600 lines, stateless, deliberately zero MCP/JSON-RPC
  awareness. It verifies the JWT, redeems a per-request 0600 Kerberos ccache from the
  broker, and shells out to GSSAPI-linked `curl --negotiate` with `KRB5CCNAME` set — "this
  function never touches ticket material itself" (`proxy_call.py:83-84, 98-143`). A test
  asserts the ccache is byte-identical at curl-invocation time and *gone* afterwards
  (`tests/test_e2e.py:100-114`).
- **"Transparent" was quietly lossy (Historical evidence):** forwarding only
  status/content-type/body ate `Content-Encoding` on gzip bodies (`a01bae9`, fixed) and
  still drops `Mcp-Session-Id` and SSE streaming — tolerable only because the upstream is
  request/response-shaped. A transparent proxy must enumerate exactly which headers and
  streams survive the hop.
- **The environment is the project (Historical evidence):** after full test coverage, six
  consecutive live-only failures: dependency packaging (`db357eb`), missing krb5.conf
  (`e3140cd`), CERN Grid CA absent from the Mozilla bundle (`5eedad1`), NetworkPolicy
  blocking KDC port 88 (`bf3b62a`), reverse-DNS SPN mismatch (`05d2b2a`), and the gzip
  header bug (`a01bae9`). All environment, none logic.
- **Generalized principle:** when an otherwise useful MCP cannot cross an
  infrastructure/authentication boundary you don't own, don't modify the server
  (impossible) or the shared client (blast radius): insert a protocol-blind adapter that
  translates *only* the boundary concern (here, auth), keeps zero policy, and holds no
  standing secret.

---

## 5. Credential Infrastructure

### 5.1 af-credentials — the contract as a library

The consumer half of the brokering contract: a framework-free library (~560 LOC, 2 runtime
deps) any backend embeds to (a) verify broker-issued RS256 identity tokens against the
broker's JWKS and (b) redeem them for materialized VOMS proxies or krb5 ccaches; plus a
56-line optional adapter into the MCP SDK's `TokenVerifier` protocol.

- **Identity-only tokens (Observation):** claims are exactly
  `iss/sub/aud/exp/iat/jti` (+ optional POSIX); "Deliberately absent: capabilities, groups,
  or any authorization claim" (`verifier.py:7-9`); the MCP adapter returns `scopes=[]` on
  purpose (`mcp.py:33-36`).
- **Failure taxonomy in the type system (Observation):** `verify()` returns `None` for any
  invalid token but *raises* on transport failure, "so a caller can distinguish 'the
  broker is unreachable' from 'this token is bad' (a 503 vs a 401)" (`verifier.py:59-68`).
  `ProxyNotAvailableError`'s docstring encodes retry semantics: "'try a different
  credential or come back later,' not 'retry this exact call'" (`proxy.py:60-66`). A 200
  response whose credential has under 60 s remaining *raises*, because the broker's cache
  would just return the same near-expired credential (`proxy.py:300-312`).
- **The client was the spec (Historical evidence):** the redeem contract was coded and
  shipped here while the broker "does not implement yet" the endpoint (docstring at
  `git show 59cccdb:src/af_credentials/proxy.py`); the broker conformed to the library.
- **Anti-defensiveness (Historical evidence):** a skew-tolerant `.get("nickname")` was
  reverted to strict `data["nickname"]` because one operator owns both sides — "a missing
  key is a broker bug and should raise KeyError, not be silently tolerated" (`59cccdb`).
  Explicitly does not generalize to multi-operator ecosystems.
- **Diagnosability (Historical evidence):** uniform silent `None`s made "production 401s
  from ami-mcp's broker mode undiagnosable"; fixed with per-path DEBUG logs, token never
  logged, log content regression-tested (`db91214`).

### 5.2 The three custodial token services

One pattern, three credential classes, with the *rationale written into the code*:

- **The identical docstring (Observation, deliberate convention):** all three carry
  "Authorization model: none beyond identity, by design … Do not add capability logic here
  based on token claims" (krb5 `app.py:1-10`, voms `app.py:3-9`, condor `app.py:3-7`).
  Authorization happens once, upstream; the custodian verifies provenance (RS256 JWT,
  per-service `aud`, NetworkPolicy-fenced to a single caller) and nothing else.
- **The key defines the boundary (Observation):** condor's README states the pool password
  is symmetric — "anyone holding it can mint a token for *any* identity" — and "must never
  reach the af-mcp-broker, which lives in a different trust domain and holds many other
  credentials." voms and krb5 use near-identical language for the Globus passphrase and the
  CERN password. Each custodian is the only place its root secret is ever used.
- **Privilege floors diverged empirically (Historical evidence):** voms needs root +
  `CAP_DAC_READ_SEARCH` + SETUID/SETGID, discovered through a cascade — grid sslutils
  checks key *ownership*, not mode (`c0a3da3`); `os.chown` hit dropped capabilities so all
  file I/O became impersonated (`86260c0`); Memory emptyDirs arrive root:0755 (`d117292`);
  an un-pre-created `/tmp/x509` was claimed 0700 by the first user per replica, locking out
  everyone else, "confirmed live … birth time matching" (`68d0463`). krb5 needs nothing.
  condor needs a one-shot CHOWN/FOWNER init container after the Secret-mount migration
  broke `condor_token_create`'s own secure-file check, live in production
  (`ad66f3d` → `8703f6d` → `8cf43ff`). Merging the three into one process would force the
  union of privileges onto everything.
- **Consequence-driven divergence (Observation):** krb5 has a rate limiter because a wrong
  password is a real AS-REQ counting against *CERN's account-lockout policy* — blocked
  attempts never reach the KDC, and only confirmed-bad passwords count
  (`ratelimit.py:1-15`). voms deliberately has none: a bad passphrase is a local decrypt
  with no third-party consequence, and a second limiter "would duplicate that policy in the
  wrong trust domain" (README). Copy patterns by consequence, not convention.
- **Error taxonomy as inter-service contract (Observation):** voms's
  `BadPassphraseError` (400, counts toward the broker's limiter) vs
  `CredentialPermissionsError` (422, fixed actionable string
  "chmod 400 ~/.globus/userkey.pem") vs `MintingError` (502, stderr never crosses the
  boundary) — the *upstream* rate limiter's correctness depends on the split (`c0a3da3`).
  krb5's kinit stderr markers were verified against MIT krb5 source *and* a live CERN KDC.
- **Owner-review hardening (Historical evidence):** voms removed `rm -rf` entirely — "an
  rm -rf on a config-derived path is a wipe waiting for a misconfiguration" (`86260c0`
  review); no recursive deletion exists in the service. krb5 patched a real shell injection
  in CERN's own vendored `cern-get-keytab` via a build-time `shlex.quote()` patch
  (`a1ad1f5`).
- **Startup invariants from spikes (Historical evidence):** `condor_token_create` without
  `-lifetime` mints a token with **no `exp` claim at all** (pool spike); absorbed as a
  `Field(gt=0)` config invariant plus an argv test (`config.py:55-61`, `b8a7480`).

**Why credential issuance is not in the MCP layer (Principle, evidence-backed):** the
custodians hold or touch root-of-trust material (pool password, Globus passphrase, CERN
password) whose blast radius must be disjoint from the internet-adjacent, LLM-driven MCP
layer; each is a one-question security audit ("did this call really come from the
broker?"); each runs at exactly its own empirically discovered privilege floor; and each
can change privilege model without touching its API contract (voms churned privileges five
times; the contract never moved).

---

## 6. Cross-Project Patterns

### 6.1 Convergent patterns (strongest first)

1. **Identity from the verified token, never from a tool parameter.** JLab (no owner
   argument exists), FS (schema "physically cannot express 'read bob's file'"), rucio/AMI
   broker modes (account derived from the redeemed proxy's VOMS nickname), bridge (token
   `sub` selects whose ticket is redeemed). Genuinely independent mechanisms — k8s owner
   labels, kernel uid/gid, VOMS nickname — of one rule. The token services are the
   exception that proves it: they accept a `username`, but only because the broker is the
   sole network-permitted caller and the password/keytab itself is the proof.
   *Principle: make the dangerous parameter unrepresentable, not documented.*
2. **Credential lifetime == tool-call lifetime.** Redeem per call → 0600 file → use once →
   delete success-or-failure (rucio `broker.py:154-181`; ami `auth/broker.py:92-104`;
   bridge with a test asserting the ccache is gone). Implemented once in af-credentials'
   context managers so the secure path is the shortest path. Blast radius of a compromised
   MCP = in-flight tokens of currently-active users.
3. **Errors are agent control flow.** Classified, returned (not raised), naming the next
   tool ("**Recovery:** use `rucio_list_dids`…", "**Try:**"); machine tags/status codes at
   non-LLM boundaries; the same taxonomy feeding metrics (rucio) and inter-service behavior
   (voms/krb5 status codes driving the broker's rate limiter). Entered the fleet via
   arcade.dev conventions (`f1508e7`) but independently rediscovered at machine boundaries.
4. **Bounded outputs with in-band truncation markers and continuation instructions.**
   Field allowlists, lazy pagination end-to-end, weight-tuned default limits, `truncated` +
   recovery instruction. Negative proofs: rucio's pagination theater (`24f7497`); AMI's raw
   14-column tables (`901f339`). Of the three legs, enforcement is the one to test.
5. **Stateless HTTP; state behind stable handles.** FS (`149b63d`) and JLab (`92ff9cc`)
   hit the identical multi-replica session-404 failure within a day and fixed it
   identically; rucio's session-keyed cache bug (`9d7022a`) is the security variant. The
   2026-07-28 MCP spec then removed protocol sessions entirely and mandated explicit
   server-minted handles — the early production pain landed on the durable design.
6. **One authorization brain; custodians refuse policy.** The identical prohibition
   docstring ×3, af-credentials' `scopes=[]`, the bridge's "applies no capability logic of
   its own." One deliberate convention — written imperatively in code so future maintainers
   don't re-grow a second policy layer.
7. **Server-side enforcement, because for an agent client-side validation does not
   exist.** JLab's guardrails (motivated by the portal's HTML-only 72 h cap), FS clamps,
   rucio's `--read-only`, AMI's write-incapable replica endpoint. Pair each enforced bound
   with a read tool that discloses it (`jlab_list_supported_images`,
   `jlab_get_gpu_availability`).
8. **Orchestrate the battle-tested native artifact; never parse CLI prose.** For data:
   native client libraries (rucio.client, pyAMI, kubernetes) — the founding Rust/CLI plan
   was rejected for exactly this. For credential handshakes: hardened binaries (kinit,
   voms-proxy-init, condor_token_create, curl --negotiate), parsing *artifacts* (ccache
   bytes via pykrb5 after `klist` was rejected as locale-dependent; PEM via cryptography),
   never stdout tables.
9. **Trust-domain-per-credential-class custodial services** (§5.2).
10. **The fleet as a documented pattern library — with copy-drift as its failure mode.**
    The fourth server costs a day, not a month (FS, bridge, krb5 each built in ~a day
    including Helm/CI); the discipline that saves it is documented deltas ("unlike ami-mcp,
    broker-only"; FS hard-exits refusing shared-secret mode with the reason,
    `server.py:171-177`). Drift caught in the act: dead copied ImportError guards
    (`a8cf8bc`).

Two one-liners: readiness probes check own dependencies, never the upstream ("a CERN-side
outage must not flap this pod's readiness" — bridge, krb5, condor); log-redaction
processors with unit-tested log content (`test_no_log_line_ever_contains_*`).

### 6.2 Divergent patterns and what each teaches

1. **Rucio's 45 curated tools vs AMI's power-tool + taught DSL.** The choice tracks the
   *backend's* API shape: an enumerable client surface vs hundreds of commands + a query
   language. The DSL route's hidden costs: documentation becomes executable (and needs
   live-service debugging), plus a ~10.5 KB per-session instruction tax.
2. **Escape hatches proportional to blast radius.** AMI hands the agent an expressive DSL
   (read-only, cheap); JLab refuses any raw-k8s escape hatch (writes, pods, money).
3. **krb5's rate limiter vs voms's deliberate absence.** Same scaffold, opposite
   decisions, both justified by consequence analysis — and the protected party in krb5's
   case is a *third party* (CERN's lockout counter), a stakeholder the MCP spec's
   rate-limit MUST never contemplates.
4. **A ladder of write-safety mechanisms:** absent code (FS) → architectural impossibility
   (AMI's replica) → server flag (rucio `--read-only`) → deployment default (Helm) →
   delegated consent (JLab). Each project chose the rung matching its risk; none used MCP
   elicitation or `destructiveHint` for it.
5. **Byte-transparent proxy (bridge) vs typed re-export proxy (JLab's meta-broker).**
   Transparency is right only when you add nothing per call; JLab's 16 wrappers exist to
   inject identity/readiness/credentials and subtract unservable tools. "A proxy that adds
   and subtracts nothing shouldn't exist."
6. **Markdown outward, structure inward.** All five agent-facing servers return prose;
   every machine-facing boundary in the same ecosystem is structured (FS helper JSON +
   tags, token-service status taxonomy, af-credentials typed exceptions). A coherent bet —
   whose platform-level cost was later measured (§9, §10).
7. **Strictness calibrated to deployment topology.** af-credentials' strictness revert
   (`59cccdb`) presumes one operator owns both sides; it would be wrong across
   independently versioned organizations.
8. **Transports track trust.** rucio/AMI keep stdio for laptops; JLab/bridge are
   broker-HTTP-only (meaningless without facility identity); FS maps stdio identity to
   `os.getuid()`. The tool list itself varies with the trust model.

### 6.3 Comparison with the MCP specification

Baseline: spec revision 2026-07-28 current; the fleet was built against
2025-03-26/2025-06-18 semantics.

**Deliberate divergences (spec recommendations not taken):**
- **No `outputSchema`/`structuredContent` anywhere** in the component fleet, despite SDK
  support — markdown-for-LLMs was a project-wide bet from the original plan docs. Cost
  acknowledged in every report: program-to-program composition must parse prose. The
  platform later *measured* the cost (a metering double-count bug, `c1c9518`) and issued
  tool-authoring conventions demanding `outputSchema` (`35591cf`), with the gateway's own
  `af_*` tools as the reference implementation.
- **No tool annotations** (`readOnlyHint`/`destructiveHint`/`idempotentHint`): the 38/7 and
  9/13 read/write splits live only in names and prose, so any gateway wanting
  confirm-on-destructive policy must maintain its own list — and the platform does (per-tool
  permission maps).
- **Errors bypass `isError`:** failures return as normal text results; the protocol cannot
  distinguish success from failure. The recovery-prose *content* exceeds anything the spec
  asks; the *signaling* falls short — and it bit the platform: `isError` results were
  audited as successes until `9034858`.

**Anticipations the spec later vindicated:**
- Statelessness and explicit state handles (SEP-2567/2575) — FS/JLab arrived there via
  production pain a year early; the platform made it the chart default (`mcpStatelessHttp:
  true`) with a documented analysis of why session affinity can't work (#128).
- DCR → CIMD (rucio `7f651e1`; spec deprecated DCR for Client ID Metadata Documents).
- Tools-only turned out to be the durable subset: the fleet never used sampling, roots, or
  MCP logging — all three deprecated in 2026-07-28.
- Context economics: the spec now acknowledges prompt-cache-friendly deterministic tool
  ordering; the fleet's context discipline predates the acknowledgment.

**Auth vs spec:** rucio's public mode implements the genuine OAuth 2.1 resource-server
chain (401 → RFC 9728 PRM → RFC 8414), sharp edges included (`89e66cf`). Brokered
deployments deliberately disable discovery (the aggregator injects bearers) but stay
syntactically spec-shaped so standard middleware works. Audience validation — a spec MUST —
is enforced everywhere. **Token passthrough** — spec-forbidden — is treated as a named
invariant at the platform (§9): the one passthrough-shaped exception is rucio's legacy OIDC
bridge mode (the inbound token was minted by Rucio's own IdP for Rucio, so the audience is
arguably right), and it's telling that broker mode replaced it with redemption.

### 6.4 Surprising lessons (not derivable from the spec)

1. **Identity plumbing is the project.** rucio: ≈2,700 LOC auth/server vs ≈2,540 tools;
   AMI's entire second development burst added zero tools.
2. **The tool list is a function of the trust model** — it varies per auth mode, per
   transport, per linked identity, per backend health. The spec treats it as static.
3. **Descriptions are executable and rot like code** — doc bugs are behavior bugs (AMI's
   four same-day docstring fixes against the live service). No linter exists for
   prose-to-schema consistency.
4. **Empty results need routing too** — "No dataset replicas found" + "if it's a container,
   use X" turned the most common silent failure into a self-healing step.
5. **Green CI proves nothing about credential plumbing** — the hard bugs live in DNS, CA
   bundles, NetworkPolicies, mount modes, kernel ownership semantics.
6. **The deployment manifest is part of the security design** — more hard-won knowledge in
   voms lives in `values.yaml`/`deployment.yaml` comments than in Python.
7. **The client library can be the spec** — af-credentials shipped the redeem contract
   before the broker implemented it; the broker conformed.
8. **Errors are two-audience artifacts** — caller-fixable errors specific; security-adjacent
   errors generic outward, specific in the server log; graded by audience (condor).
9. **Multi-tenant neighborliness is an MCP concern** — FS's per-user semaphore protects
   other tenants' NFS latency; krb5's limiter protects a third party.
10. **An MCP endpoint needs a human front door** — rucio ships 521 lines of landing page
    because hosted MCP URLs get visited by browsers.
11. **Brokered execution beats redacted disclosure** — delete the token-returning parameter
    the day the proxy tools make possessing the token unnecessary (`4ea435f`).
12. **Repos that commit their decisions — including rejections — are auditable.** The
    founding transcript, the deferred-plan doc, the spike reports made this research
    possible; that is itself a practice.

---

## 7. Historical Evolution

### 7.1 The arc

```text
rucio-mcp (Mar 2026)                 — first MCP; Rust/CLI plan rejected; LLM conventions imported
   ↓ template
ami-mcp (Mar–Aug)                    — hybrid exposure; broker-mode credential arc
   ↓
af-mcp-platform scaffold (Jun 20)    — CREDENTIAL BROKER FIRST: JWT validation, x509 mint,
                                       OAuth 2.1 provider, Vault store, identity linking
   ↓
credential custodians (Aug–Sep)      — voms (4 wks), condor (5 days), krb5 (1 day):
                                       root secrets exit the broker's trust domain
   ↓
FastMCP aggregator lands (Jul 30)    — the platform grows an MCP face (88b4003);
                                       authz/audit/credential injection same day
   ↓
af-jupyterlab-mcp (Aug 20–21, 36 h)  — fleet template pays off; brokered execution
af-filesystem-mcp (Aug 20, 1 day)    — kernel-boundary design, decided in issue #188
atlas-search-mcp-bridge (Sep, 1 day) — protocol adapter for the one un-ownable boundary
   ↓
Elwood governance review (Aug 25–26) — renames, trust tiers, dual enforcement,
                                       audience/name split after a fleet 401
   ↓
production v0.1.23 (Sep)             — 7 services + builtin, ~124 tools, ~800 users
```

The brief's suggested timeline ("individual MCP → more MCPs → shared auth problems →
credential services → gateway → aggregation → platform") is *approximately* right but wrong
in one important way the git history corrects: **the platform was not extracted from
repeated MCP auth code — the credential broker predates most of the MCPs' hosted modes, and
aggregation was added to the broker**, not the other way around (`36453f6` 2026-06-20 vs
`88b4003` 2026-07-30). The pressure was never "too many MCPs"; it was "no client may ever
hold a raw credential" (PRODUCT.md).

### 7.2 Negative-lesson catalogue ("tried X, discovered Y, ended with Z")

Interface/tool design:
1. Rust + CLI parsing → structured native client (rucio founding transcript).
2. One replica tool → split by DID type with bidirectional redirects (`9f4caed`).
3. Raw AMI rows → allowlists/pivots/dedup (`901f339`).
4. DSL docs from memory → four same-day doc-bug fixes against live AMI (`74e9063` et al.).

Statefulness/scaling:
6. SDK-default stateful HTTP × 2 replicas → cross-replica 404s → `stateless_http=True`
   (fs `149b63d`, jlab `92ff9cc`, platform #128).
7. Session-keyed client cache → cross-user client risk → (session, bearer-hash) keys
   (`9d7022a`).
8. Pagination theater → streaming iterators (`24f7497`).

Auth plumbing:
9. DCR registry lost on restart → CIMD-only (`7f651e1`).
10. Root OAuth metadata fallback → phantom issuer broke non-first sites → deleted (`89e66cf`).
11. Fail-fast on 4xx OIDC polling → Rucio's 401 means "not logged in yet" → reverted
    (`7e30cc0`): upstream semantics beat generic hardening.
12. Silent uniform `None` → undiagnosable production 401s → per-path DEBUG logs (`db91214`).
13. `--log-level` wired only to uvicorn → invisible auth rejections (`f368b43`).
14. Shared ForwardAuth proxy (oauth2-proxy) → 302s on Bearer requests → removed in three
    phases; the broker is the sole validator (`7685b8c`, `0d96d73`, `48c8231`).
15. RFC 8693 token exchange → broker-issued PATs (`392e353`).
16. Self-contained JWTs (groups in claims) → live directory resolution; group removal
    becomes a real kill switch, availability regression documented (#144).
17. Service `name` doubling as token `aud` → governance rename caused a fleet-wide 401 →
    explicit `audience` field + DO-NOT-CHANGE warning (`ca347cf` #257).
18. Gateway's own tools bypassing middleware by name → real builtin service, audited and
    metered like everything else (#153 → #240).
19. `isError` results audited as success → an entire failure class invisible (`9034858`).
20. Audience minting coupled to an unrelated IAM role → "audience is population, not
    permission" (`4152a24`).
21. Maintenance mode 503'd machine routes (x509 redeem, OAuth discovery) → universal gates
    must enumerate machine-to-machine exceptions (`cc94d1d`, `61da24c`).

Privilege/deployment:
22. Root reading user keys → ownership-checking sslutils → per-request impersonation
    cascade (voms `c0a3da3` → `86260c0`).
23. `rm -rf` on config-derived paths → removed entirely (voms).
24. Memory emptyDir root:0755 → chmod init container → first-writer-wins lockout
    (`d117292`, `68d0463`).
25. hostPath pool key → Secret mount → the binary's own secure-file check refused 0644 →
    CHOWN/FOWNER init container (condor `8cf43ff`).
26. Least-privilege Secret deletion → the *other* writer (portal) broke → write-only Secret
    restored (jlab `cee3e03` → `37f214d`).
27. CRL copy OOM at 64Mi (page cache charged to cgroup); CronJob can't reach a
    Deployment's emptyDir → init+sidecar (voms `6c76288`, `b671902`).
28. Chart's default JWKS URL blocked by the chart's own default NetworkPolicy — pure-default
    install could never pass readyz (condor `0d8079d`).
29. keytab auto-bootstrap needs CERN-internal network + interactive 2FA → user uploads
    keytab; validate-before-store (platform `76ae139`).

Environment beats tests:
30. Mock-green tools shipped real API misuse (`eb61db4`); single-tab fixtures vs double-tab
    CVMFS (`901f339`); the bridge's six live-only failures (§4.5); htcondor/mini's
    coinciding TRUST_DOMAIN/UID_DOMAIN mis-teaching the model (AUTHENTICATE:1004); tokens
    minted with no `exp` at all (condor spike); CERN's vendored script shell injection
    (krb5 `a1ad1f5`).
31. List-time credential gap: an auth-gated backend was permanently invisible to
    aggregation; naive fixes poison a shared schema cache for *other* callers
    (#121, `067684b`).

---

## 8. Security and Identity Architecture

The complete production identity path (traced through code in Stage 4; every arrow is a
different token or credential):

```text
User ──(Keycloak login, PKCE, broker's own OAuth surface; RFC 9728 discovery)──▶ PAT
  │      mcp_pat_<lookup>_<secret>; SHA-256 stored; 90d; /v1 stays JWT-only so a PAT
  │      can never mint PATs
  ▼
MCP client ──(Bearer PAT, every request)──▶ AF broker /mcp
  │   IdentityMiddleware: PAT → registry hash check + ≤30 s revocation cache
  │   PrincipalCache → Keycloak directory: groups + POSIX resolved LIVE, never from
  │   token claims (#144) — group removal is a real kill switch
  │   AuthorizationMiddleware: prefix → service; per-tool required_permission;
  │   group-derived permissions ∩ PAT grant (grants only restrict); denied calls audited
  ▼
client_factory (per service auth_type):
  ├─ bearer:  mint per-user credential in-process, inject
  └─ x509/krb5: mint AF Broker Identity Token — RS256, sub=user, aud=<one service>,
       ttl 600 s, jti, NO authorization claims ("if a backend ever tests
       token.permissions, this design has failed") — inject as Bearer;
       the caller's PAT is NEVER forwarded (ProxyClient rejected for defaulting to
       header forwarding; regression-tested)
  ▼
Backend MCP (rucio-mcp / ami-mcp / bridge / …) — verifies broker JWT via af-credentials
  against the broker JWKS (ingress NetworkPolicy enumerates exactly the six services
  allowed to fetch it); checks aud == itself
  │
  └──(calls back POST /v1/credentials/x509/redeem with the SAME token)──▶ broker
       aud→target map; mismatch 403s AND writes a denied audit record;
       serves the Vault-stored VOMS proxy (hands-free re-mint from the
       custody-consented passphrase; bad passphrase ⇒ unlink);
       audited as x509_proxy_release with the VOMS *nickname* (grid identity)
  ▼
Scientific service (Rucio server / AMI / KDC / schedd) — native credential, native authz
```

Where each decision belongs (Observation → Principle):

| Decision | Where it lives | Why there |
|---|---|---|
| Authentication (who is calling) | Broker edge — single `decode_broker_bearer` implementation, `aud=mcp-gateway`, all admission paths | one validator, one boundary; ForwardAuth proxies were tried and fully removed |
| Authorization (may they) | Broker only: `services.yaml` per-tool permission × `policy.yaml` groups × live directory ∩ PAT grant | one policy brain; custodians and backends carry written prohibitions against growing a second one |
| Identity mapping | Broker (PrincipalDirectory) + per-credential nickname resolution | tokens answer "who", never "what may they do" |
| Credential minting | Broker (identity tokens, brokered tokens) + custodial services (VOMS/krb5/condor) | root secrets live only in their own trust domain |
| Credential consumption | Backend MCP, per call, ephemeral file, deleted | credential lifetime == call lifetime |
| Heavy credential transit | Backend-side redemption — PEMs/ccaches never transit the aggregator | beyond "don't pass through": don't even carry |
| Consent for destructive ops | Dual enforcement: permission narrowing (technical) + `agent_policy` instructions (guidance) + client-side human-in-loop | honest about the fact that instructions are not an access-control boundary |
| Audit | Broker: exactly one AuditRecord per call (success, denial, error, and `isError` results); `trace_id` joins client trace ↔ audit ↔ usage | the aggregation point is the only place that sees everything |

The network layer *is* the trust diagram: default-deny plus six supplemental
NetworkPolicies (broker egress to exactly Keycloak, OpenBao, the three token services,
Postgres; JWKS ingress to exactly the six verifying services).

---

## 9. MCP Platform — `af-mcp-platform`

### Why it exists

PRODUCT.md states it in one sentence: "The broker is the strategic platform boundary a
point-to-point MCP integration could not truthfully claim: LLM clients never hold raw
credentials … the broker authenticates the caller once, mints short-lived per-user
credentials behind the scenes, and every tool invocation passes through one authorization +
audit layer regardless of which backend it eventually reaches. Adding a new service is
config-only."

What becomes possible only here (Inference, well-supported): (a) one login → N systems,
with per-(subject, target) minting across six credential provider types; (b) a uniform
authorization model over backends whose native auth spans IAM tokens, VOMS proxies,
IDTokens, Kerberos, SPNEGO; (c) one audit/metering/tracing spine; (d) config-only growth —
the Nth MCP costs a YAML entry and a NetworkPolicy port, not a new trust relationship for
every client.

### The gateway, precisely

- One FastAPI process, two surfaces: the FastMCP aggregator at `/mcp` and the `/v1` HTTP
  API; the aggregator calls the `/v1` route bodies **in-process** (an earlier design looped
  back over HTTP and re-validated the same JWT per call — superseded).
- **It is itself an MCP server, doubly:** it speaks MCP (identity/entitlement/authorization
  middlewares, one `ProxyProvider` per service) and serves its own five `af_*` tools —
  registered as a real builtin service so they are entitlement-checked, audited, and
  metered like proxied tools (#240); the `af` prefix is reserved because these are the
  tools a caller needs precisely when everything else is broken.
- **Downstream representation:** a `ServiceSpec` — `name` (registry identity), `prefix`
  (namespace), `audience` (token `aud`, split from `name` after the fleet 401), `url`,
  `transport`, `auth_type`, `required_permission` (string or per-tool dict),
  `requires_posix`, `timeout_seconds`, `tools_cache_ttl`, `trust_tier`, `agent_policy`.
  Routing is by tool-name prefix.
- **Aggregation mechanics:** descriptions forwarded verbatim ("quality … is set entirely at
  the source"), which is why the platform publishes tool-authoring conventions (`35591cf`)
  instead of rewriting; `EntitlementMiddleware` filters `tools/list` per caller (per-tool
  permissions; unknown prefixes dropped fail-closed; no principal → empty list) — and the
  filtered list is explicitly *not* the access boundary (re-checked on every call);
  production enumerates **every tool explicitly with no default** ("a future tool this
  backend adds is disabled for everyone until it's added here") — an opt-in version-skew
  firewall; dead backends are dropped from the list with classified reasons
  (`not_linked`/`unauthorized`/`unavailable`) surfaced through `af_list_mcp_servers`
  (verified live in this research: the down OpenSearch bridge's 14 tools were absent).
- **Instructions are not aggregated.** Downstream servers' own instructions (some 10.5 KB)
  are not forwarded; the platform composes a fixed preamble (deny-is-policy,
  not-linked-is-policy, trust tiers) + 1–3 operator-curated sentences per service — ~2–3 KB
  total. Instructions are an operator-owned policy channel, not a passthrough.
- **The list-time credential problem (#121):** a backend requiring auth just to list tools
  was invisible; the fix mints a best-effort list-time credential, never letting mint
  failure block the connection — the docstring records the subtler bug this avoids (a
  never-successful listing leaves a shared schema cache unpopulated, poisoning a different,
  authorized caller).

### Operations

"Metering is best-effort; audit records are authoritative" (docs/observability.md). Four
surfaces: Prometheus (aggregate only — per-user labels were tried and dropped as a privacy
surface, `14b2770`), the structlog audit line per invocation, the Postgres usage store
(`af_usage`, with verbatim honesty that token counts are a tiktoken estimate), opt-in OTel
(inbound `traceparent` parsed as remote parent, never forwarded; outbound broker-generated
in MCP `_meta`). Correlation key: `trace_id` on every audit record, plus `request_id`,
`token_id` (isolates a leaked PAT), grid `nickname` on proxy releases. Fail-closed startup
checks (unreachable permissions, ungated services, missing keys refuse to boot — a rollout
failure has zero outage); graceful per-service degradation at runtime. Governance:
config-PR-only admission with declared trust tier; no admin UI by design.

---

## 10. What Changes at Platform Scale

Concrete problems that exist at ~10 MCPs and not at 1, each grounded in this codebase:

1. **Name collisions and silent shadowing** — fastmcp resolves un-namespaced mounts in
   registration order; two same-prefix backends would silently shadow (#113); hence
   `apply_namespace`, the reserved `af` prefix, and the ugly-but-unambiguous double-prefix
   answer.
2. **The registry is a contract surface** — `name` ≠ `audience` ≠ `prefix` ≠ target;
   conflating any two caused a real outage (the 2026-08-26 fleet 401).
3. **List-time vs call-time credentials** — only meaningful when one listing fans out to N
   heterogeneous backends sharing a schema cache.
4. **Failure isolation needs a taxonomy** — not_linked / unauthorized / unavailable, with
   per-service failure memory and recovery clearing, so one dead backend degrades one card.
5. **A permission matrix, not a flag** — 12 permissions × 8 services × per-tool dicts
   (~124 tools); the portal grew an entitlements-matrix page because nobody can hold it in
   their head.
6. **Credential-type plurality** — six provider types behind one ABC; two execution models
   (delegated vs on-behalf, the latter always audited); two delivery models (header
   injection vs backend-side redemption).
7. **Shared state and its janitors** — Vault CAS retries, token sweeps, principal-cache
   heartbeats, revocation propagation windows.
8. **Fleet observability** — cardinality policy, usage accounting (an agent fanning out
   across 10 services generates spend nobody otherwise sees), trace propagation surviving
   the middle hop.
9. **Model-behavior policy as config** — someone must compose a coherent story about which
   of 124 tools are safe (`agent_policy` + preamble), or the agent retries denials and
   mutates state unconfirmed (#216).
10. **Version skew as a standing condition** — tag-pinned deploys, opt-in per-tool
    permissions (new upstream tool ships disabled), schema-cache TTLs, fail-closed
    migration ordering ("scoped PATs are denied, never widened").

And the answer to the components' open bet: **markdown-only outputs did hurt the platform,
measurably twice** — a metering double-count bug when backends mirror text into
`structuredContent` (`c1c9518`), and the impossibility of type-checked composition, which
produced the `outputSchema` authoring conventions (`35591cf`). The aggregator forwards
results verbatim, so it cannot fix output quality centrally; it can only set the bar and
model it with its own tools.

---

## 11. What This Teaches Us About HEP (and what is merely local)

**MCP-specific** (only make sense for model-facing tool servers): errors as prompts;
next-step routing in outputs and empty results; in-band truncation markers; descriptions
as executable API surface (drift = bug class); tool splitting along agent confusion lines;
tool lists varying with trust model; instructions as an owned policy channel.

**General distributed systems** (nothing MCP about them): stateless services, state behind
stable handles; contract-first client libraries; readiness reflects own health; defaults
must cohere as a set; single-flight caches; typed failure taxonomies with retry semantics;
simpler-than-prod test environments mis-teach; dual-writer systems.

**Scientific-computing-specific:** domain vocabulary as a shipped artifact (LDNs, DIDs,
DSIDs, campaigns are the real interface); stable community identifiers as the cross-MCP
composition bus; unit foot-guns neutralized visibly at the boundary (nb→pb); wrapping
legacy scientific tooling (pyAMI, grid stacks) is a large fraction of total cost.

**AF-specific — transplant the shape, not the code:** kernel uid/gid as the boundary
requires real POSIX identities on shared NFS/Ceph; broker-injected bearers with OAuth
discovery disabled presume the in-cluster aggregator; single-operator strictness; the
stored-brokered-token path exists because `atlas-auth.cern.ch` rejects Keycloak-exchanged
tokens; the kube-proxy DNAT hairpin forces `oidc.internalUrl`; the OpenSearch bridge exists
because of CERN's SPNEGO-only gate. A facility without these constraints could delete
perhaps a third of the credential subsystem — which is exactly why it all sits behind a
`CredentialProvider` ABC and per-entry config.

**Security/identity patterns:** authorize once upstream, custodians verify provenance
only; credential lifetime == call lifetime; zero secrets at rest in the MCP layer;
trust-domain-per-credential-class at empirical privilege floors; anti-enumeration errors;
audience-scoped everything; audit even the denials.

---

## 12. General MCP Design Principles (the seven)

Revisiting the Stage 3 hypothesis after the platform analysis, four distinct "good"s
emerged — they are not the same thing:

- **A good individual MCP** curates for the model: bounded outputs, recovery-routing
  errors, ambient identity, server-side enforcement, statelessness.
- **A good MCP ecosystem** is a pattern library with documented deltas: shared
  conventions, a shared credential-client library as the contract, deliberate divergences
  justified by consequence.
- **A good MCP platform** is an identity/credential/audit spine that happens to speak MCP:
  one validator, one policy brain, exchange-never-passthrough, config-only growth,
  fail-closed startup, per-service degradation.
- **A good HEP MCP architecture** additionally absorbs the legacy credential world
  (X.509/VOMS, Kerberos, IDTokens) behind custodial services so that neither agents nor
  MCP servers ever hold root-of-trust material.

The seven principles, each evidence-backed across multiple projects:

### P1 — Design for the model, not the backend
*One-sentence rule:* a tool definition is an API for a probabilistic programmer, so
descriptions, outputs, and errors are the interface — and they rot like code.
*Evidence:* arcade-convention import (`f1508e7`); AMI's four same-day doc-bug fixes;
tool split by DID type (`9f4caed`); soft validation (`hashtags.py:131-138`).
*Snippet:* `rucio-mcp/src/rucio_mcp/tools/_helpers.py:116-212`.

### P2 — Errors are the agent's control flow
*Rule:* classify, return (don't raise), and name the next tool; tag at machine boundaries,
translate at the model boundary; feed the same taxonomy to your metrics.
*Evidence:* rucio `classify_error` → Prometheus; FS three-audience pipeline; voms/krb5
status codes driving the broker's rate limiter; the platform auditing `isError` as errors
(`9034858`). *Corollary:* add the spec's `isError` flag — the one improvement every report
independently recommends.

### P3 — Context is a bounded resource
*Rule:* every output has a known worst-case cost, enforced server-side, with an in-band
truncation marker and a stated recovery; pagination must be lazy end-to-end.
*Evidence:* pagination theater (`24f7497`); `901f339`'s allowlists; FS's cap table +
semaphore; platform: per-user tool filtering, non-aggregated instructions (10.5 KB → 2–3 KB).

### P4 — Identity is ambient, never an argument
*Rule:* no agent-facing schema carries a username; the verified token is the user, and
authority is resolved live from the directory, never from token claims.
*Evidence:* JLab/FS schemas; rucio/AMI broker modes; platform #144 (live groups; grants
only restrict; group removal = kill switch).
*Snippet:* `af-jupyterlab-mcp/src/af_jupyterlab_mcp/tools/jupyterlab.py:48-66`.

### P5 — Keep credentials out of the MCP
*Rule:* the MCP layer holds no standing secret: redeem per call, delete success-or-fail;
root secrets live in custodial services in their own trust domains; exchange tokens per
target, never pass through — and heavy credentials shouldn't even transit the middle.
*Evidence:* ami `_scoped()`; rucio broker mode; bridge's proven ccache deletion; the three
custodians' identical boundary language; platform's rejected `ProxyClient` +
backend-side redemption; MCP spec's own token-passthrough prohibition.
*Snippet:* `ami-mcp/src/ami_mcp/auth/broker.py:92-104` and
`krb5-token-service/src/krb5_token_service/app.py:1-10`.

### P6 — Authorize once, at the platform boundary
*Rule:* one policy brain (registry × groups × grant), decided before any credential is
minted; every other component verifies provenance (audience-scoped JWT) and refuses to
grow policy — in writing.
*Evidence:* the ×3 prohibition docstring; `scopes=[]`; platform `check_entitlement` with
fail-closed startup validation; "audience is population, not permission" (`4152a24`).

### P7 — The protocol is the easy part; the environment is the hard part
*Rule:* budget for the boundary you don't own (protocol-blind adapters), for live-environment
verification (green CI cannot reach credential plumbing), and for the deployment manifest
as part of the security design.
*Evidence:* the bridge's six live-only failures; voms's privilege cascade; condor's
Secret-mount collision with the binary's own checks; the chart whose defaults blocked its
own JWKS URL (`0d8079d`); "config-only Nth service" as the platform's growth model.

---

## 13. HEP MCP Architecture

What the existing architecture gets right (keep): the credential-broker spine;
identity-only audience-scoped tokens; custodial services per credential class; per-call
credential lifetime; one authorization brain with per-tool opt-in permissions; prefix
namespacing with a reserved self-diagnostic namespace; failure-classified aggregation;
audit-authoritative observability; config-only service admission.

What is AF-specific (replace per site): Keycloak-as-directory (any OIDC IdP + directory
works); kernel-uid enforcement (needs POSIX + shared FS; object stores need policy-based
equivalents); the specific CERN workarounds (SPNEGO bridge, stored-brokered IAM tokens,
keytab upload).

What should change for a broader HEP deployment (Recommendations, from the evidence):
1. **Structured outputs from day one** (`outputSchema` + text) — the platform had to
   retrofit conventions; a federation cannot.
2. **Tool annotations** (`readOnlyHint`/`destructiveHint`) so gateways stop maintaining
   parallel read/write lists.
3. **Multi-operator strictness calibration** — af-credentials' strict-contract bet
   explicitly does not survive independent versioning; version the redeem contract.
4. **Federated trust between brokers** (site A's broker accepting site B's identity
   tokens) is unbuilt; today's design is single-facility. Token-exchange profiles
   (WLCG/SciTokens) are the natural substrate.
5. **Per-call consent for destructive operations** stronger than instructions — URL-mode
   elicitation (deferred as #194) or client-side policy hooks.

### The final diagram — "Designing an MCP Ecosystem for HEP"

```text
┌────────────────────────────────────────────────────────────────────┐
│                            AI agents                               │
│                (Claude, IDEs, site portals, pipelines)             │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ MCP (streamable HTTP, stateless)
                               │ OAuth 2.1: PAT / CIMD; RFC 9728 discovery
┌──────────────────────────────▼─────────────────────────────────────┐
│                    GATEWAY / BROKER (the platform)                 │
│  authenticate once (sole validator; aud=gateway)                   │
│  identity: live directory, never token claims                      │
│  authorize once: registry × groups ∩ grant, per tool, opt-in       │
│  aggregate: prefix namespace · per-user tools/list · failure       │
│    taxonomy · own af_* diagnostics under a reserved prefix         │
│  audit + meter + trace every call, including denials and isError   │
│  instructions = owned policy channel (never aggregated prose)      │
└───────┬──────────────┬──────────────┬──────────────┬───────────────┘
        │ per-target broker identity tokens (sub, aud=1 svc, 600 s,  │
        │ jti, NO authz claims) — inbound token never forwarded      │
        ▼              ▼              ▼              ▼
   Domain MCP     Domain MCP     Domain MCP     Protocol adapter
     Rucio          AMI           Jupyter        (SPNEGO bridge,
   (curated)   (DSL + curated)  (policy layer)   protocol-blind)
        │              │              │              │
        │  verify via shared client library (af-credentials);       │
        │  redeem per call ──────────────────────────┐              │
        ▼              ▼              ▼              ▼
┌────────────────────────────────────────────────────────────────────┐
│              CREDENTIAL CUSTODIANS (one per trust domain)          │
│   VOMS proxies      Kerberos tickets      HTCondor IDTokens        │
│   "identity only, by design — do not add capability logic here"   │
│   root secrets never leave; empirical privilege floors             │
└──────────────────────────────┬─────────────────────────────────────┘
                               ▼
        HEP computing services: Rucio · AMI · KDC/schedd · k8s ·
        OpenSearch · shared filesystems (kernel-enforced identity)
```

---

## 14. The 15-Minute Presentation

**Narrative:** build toward the platform. "Here are the problems building individual MCPs
→ the design patterns that emerged → then credentials became a separate architectural
problem → then a boundary we didn't own needed a bridge → then we had many MCPs → the
architecture had to become a platform → and that suggests a general architecture for HEP."
The talk is *"I built six MCPs and the infrastructure around them; here's what they taught
me"* — never a repository tour.

**Shape:** 12 slides, ~15 min. Three war stories carry the emotional weight: pagination
theater, the six live-only bridge failures, and the fleet 401 from a governance rename.

---

## 15. Slide-by-Slide Outline

| # | Title | Purpose / main message | Content & visual | Time | Transition |
|---|---|---|---|---|---|
| 1 | **The diagram everyone draws** | Hook: the tutorial picture vs reality | Diagram A: `Agent → MCP → Backend` … then overlay the real stack (identity, gateway, broker, custodians). Speaker: "the top arrow took a weekend; everything else took six months." | 1:00 | "Let me show you what generated the rest." |
| 2 | **One facility, one summer** | Establish scale + credibility fast | Table/graphic: 6 MCP-layer projects, 4 credential services, 1 platform; **live production**: 7 services, ~124 tools, ~800 users, 6 credential types. No code. | 1:00 | "The first lesson wasn't architecture at all — it was the interface." |
| 3 | **Your API is not an agent interface** | The problem is the interface | Before/after from AMI `901f339`: 14-column raw table → curated Level\|Tags; "docs are executable" (4 same-day doc-bug commits). | 1:30 | "That forced a set of principles. Here are the ones with scars." |
| 4 | **P1+P2 — Errors are control flow** | Design for the model | Code snippet 1: `classify_error` (~12 lines excerpted); the "**Recovery:** use `rucio_list_dids`" pattern; taxonomy = Prometheus labels. | 1:30 | "Recovery hints are useless if the result already flooded the context." |
| 5 | **P3 — Context is a bounded resource** | Bound and confess | Pagination-theater war story (`24f7497`: 500k files for 100 rows); FS cap table (1 MiB / 200 matches / marker + retry hint). Optional mini-plot: read vs write tool counts. | 1:30 | "The next two principles are about who is calling." |
| 6 | **P4 — Identity is ambient, never an argument** | Impersonation unrepresentable | Code snippet 2: `create_jupyter_server` (no owner param) beside the FS uid-impersonation one-liner. | 1:00 | "If identity isn't a parameter, where do credentials come from?" |
| 7 | **P5 — Keep credentials out of the MCP** | The broker pattern | Diagram C (credential architecture): user → OIDC → broker → custodians (VOMS/krb5/condor); code snippet 3: `_scoped()` redeem-use-delete; the ×3 "do not add capability logic here" docstring. | 2:00 | "One backend we don't own refused to fit — that's the bridge." |
| 8 | **P7 — The environment is the hard part** | Bridges + live verification | The bridge in one panel (JWT in, SPNEGO out, zero MCP awareness); the six consecutive live-only failures list (krb5.conf, CA, NetworkPolicy, reverse-DNS, gzip). | 1:30 | "Then we had ten of these. Different problems appear." |
| 9 | **What breaks at 10 MCPs** | Platform-scale problems | Punch list: silent shadowing (#113), list-time credentials (#121), version skew (fleet 401 from name=aud, #257), 12×8 permission matrix, instructions budget (10.5 KB → 2–3 KB). | 1:30 | "So the architecture became a platform — here's one real call." |
| 10 | **One tool call, end to end** | The platform is the synthesis | Diagram D: the traced rucio call (PAT → live directory → per-tool authz → 600 s aud-scoped token → backend redeems proxy → audit/trace). Highlight: inbound token never forwarded; heavy credentials never transit. | 2:00 | "How much of this is our facility, and how much is HEP?" |
| 11 | **An MCP architecture for HEP** | Generalize honestly | Final layered diagram (§13); two columns: keep (broker spine, custodians, one authz brain) vs change (structured outputs day one, annotations, federated brokers). | 1:00 | "If you remember one thing…" |
| 12 | **The checklist + thesis** | Land the takeaway | Thesis (§20) + 8-line "good MCP" checklist distilled from §19. Backup slides: negative-lesson catalogue, spec comparison. | 1:00 | — |

Total ≈ 16 min speaking budget → trims to 15 by compressing slides 2 and 11.

---

## 16. Code Examples (final selection, 5 max)

1. **`rucio-mcp/src/rucio_mcp/tools/_helpers.py:116-212` — `classify_error`.**
   Highlight: category → recovery prose naming the next tool; same taxonomy feeds
   `TOOL_ERRORS{category}`. Supports P1/P2. Better than alternatives because one ~90-line
   function shows interface, recovery, and observability at once.
2. **`af-jupyterlab-mcp/src/af_jupyterlab_mcp/tools/jupyterlab.py:48-66` —
   `create_jupyter_server`.** Highlight: there is no owner parameter to misuse; owner =
   `claims.unixname`. Supports P4. Better than the FS variant for slides because the
   *absence* is visible in a short signature.
3. **`ami-mcp/src/ami_mcp/auth/broker.py:92-104` — `_scoped()`.** Highlight: redeem →
   0600 file → one call → delete in a context manager; server holds no standing
   credential. Supports P5 (MCP side).
4. **`krb5-token-service/src/krb5_token_service/app.py:1-10` — the module docstring.**
   Highlight: "Authorization model: none beyond identity, by design… Do not add capability
   logic here based on token claims" — identical in voms/condor. Supports P5/P6 (custodian
   side). Better than any code because the architecture is stated as a prohibition.
5. **`rucio-mcp/src/rucio_mcp/tools/_helpers.py:70-98` — `paginate_iter`,** paired with
   commit `24f7497` in the speaker notes. Highlight: lazy end-to-end + the "Pass
   `offset=50` to see more." footer. Supports P3, and carries the war story.

(Reserve: `atlas-search-mcp-bridge/src/atlas_search_mcp_bridge/proxy_call.py:98-143` — the
curl `--negotiate` argv build, "this function never touches ticket material itself" — if a
P7 code moment is wanted instead of the failure list.)

---

## 17. Architecture Diagrams (4)

- **A — The diagram everyone draws vs the one you ship** (slide 1): three-box tutorial
  stack, then the real seven-layer overlay. Simple enough to hand-draw in HTML/CSS.
- **C — Credential architecture** (slide 7): user → OIDC → broker → {VOMS, krb5, condor}
  custodians → services; annotate "root secret never leaves" on each custodian.
- **D — One tool call, end to end** (slide 10): the §8 trace as a sequence-style diagram;
  the money annotations are "groups resolved live, never from claims", "aud = exactly one
  service, 600 s", "inbound token never forwarded", "backend redeems; PEM never transits
  the aggregator".
- **E — Designing an MCP ecosystem for HEP** (slide 11): the §13 layered figure.

Mermaid works for C and D; A and E read better as hand-styled HTML/SVG in the deck's
existing visual language.

---

## 18. Quantitative Figures

**Worth using (at most one on-slide, others as backup):**
- **Tools per MCP, read vs write** (Rucio 38/7, AMI 11/0, JLab 9/13, FS 4/0, Bridge 0,
  gateway 5/0): one small bar pair per server; message = scope discipline and the
  read-heavy skew. Best candidate for slide 5.
- **rucio-mcp internal LOC split** (auth ≈1,490 + server wiring ≈1,187 vs tools ≈2,540):
  "identity plumbing is the project" in one figure. Backup slide.
- **Test:source ratios across all repos** (1.26–1.8:1; broker 33k test vs 21k src):
  backup only.

**Explicitly not worth plotting** (recommendation: don't): per-call context-cost estimates
(inferred, never measured); commit counts as effort (AI-assisted bursts make them
incomparable); coverage percentages (the interesting testing fact — what tests *couldn't*
catch — is qualitative); dependency counts (uniformly minimized by policy; no variance).
A clean trace diagram beats every one of these.

---

## 19. The Good-MCP Checklist

**Scope**
- One domain, one boundary, stated non-goals in-repo; no backend plumbing escape hatch
  unless the surface is read-only and cheap.
- Exposure strategy matches the backend: curated wrappers for enumerable clients; power
  tool + taught DSL only for read-only surfaces with a shipped corpus; fixed typed verbs
  where writes are dangerous.

**Tool interface**
- Names an agent can choose between without guessing; split tools along observed confusion.
- Restrictive schemas (`Literal` enums, no plumbing params); identity never a parameter.
- Descriptions written for the model, tested against the live service, and linted for
  drift against the schema (nothing does this today — build it).
- `outputSchema` + serialized text; read-only/destructive annotations.

**Context**
- Every tool has a stated worst-case output; caps enforced (and *tested*), not documented.
- Server-side filtering/allowlists; pagination lazy end-to-end; truncation announced
  in-band with a recovery instruction.

**Reliability**
- Errors returned as results with `isError`, a stable category token, and the next tool
  named; empty results carry routing too.
- Timeouts explicit per backend; readiness reflects own health, never upstream's.

**Security**
- AuthN at one validator; authZ decided once, upstream; custodians refuse policy in writing.
- Credentials: minted never in the MCP; redeemed per call; deleted success-or-fail; root
  secrets in their own trust domain at their empirical privilege floor.
- Token audience validated on both edges; inbound tokens never forwarded (spec MUST).
- Errors graded by audience; enumeration-resistant where names are sensitive.

**Architecture**
- Stateless server; backend state behind one stable identifier present in every tool.
- Need a gateway when: >1 backend, or any per-user credential fan-out, or an audit
  requirement. Need a credential broker the moment any client would otherwise hold a raw
  credential. Need a protocol adapter only for a boundary you cannot own — keep it
  protocol-blind and enumerate what the hop drops.

**Composition**
- Stable community identifiers (DIDs, LDNs, paths, pod names) verbatim-reusable across
  tools and servers; machine-readable outputs available, not just prose.

**Operations**
- One audit record per call — including denials and `isError` results; a correlation id
  that joins client trace ↔ audit ↔ usage; metrics aggregate-only (cardinality policy).
- New upstream tools ship disabled (opt-in per-tool permissions); registry identity and
  wire audience are separate fields.

**Testing**
- Test the agent-facing contract (docstrings, caps, error strings) — not just the backend
  calls; test log content and credential deletion; budget live-environment verification,
  because green CI cannot reach the layer where production failures live.

---

## 20. Final Thesis

Candidates (all evidence-supported):

- **T1. "Design the interface for the model; design the architecture for the credential."**
  Two audiences, two disciplines: everything agent-facing is written for a probabilistic
  programmer; everything structural is placed by where trust changes.
- **T2. "The tool handler is the easy part."** In a real facility the MCP protocol work is
  a rounding error next to identity, credentials, context discipline, and the environment
  — rucio's LOC split and AMI's zero-new-tools second half are the proof.
- **T3. "Make the wrong thing unrepresentable."** No owner parameters, no standing
  credentials, no policy in custodians, no write code paths in read-only servers — the
  ecosystem's best security features are absences.
- **T4. "A platform is a credential broker that learned to speak MCP."** The git-history
  finding: aggregation was added to the broker, not auth to the aggregator; the platform's
  value is one login → N systems with zero raw credentials in any client.

**Recommendation: T1**, with T2 as the spoken elaboration and T4 as the slide-10 reveal.
T1 is the only candidate that spans both halves of the evidence (interface principles P1–P3
and architecture principles P4–P7), it answers the audience's take-home question ("how
should I think about the architecture before I write the first tool?" — decide who the
model is and where the credential lives before writing anything), and it compresses to a
single memorable sentence.

---

## 21. References

**Repositories (local, authoritative):** `~/rucio-mcp` (124 commits), `~/ami-mcp` (58),
`~/af-jupyterlab-mcp` (24), `~/af-filesystem-mcp` (15), `~/atlas-search-mcp-bridge` (17),
`~/af-credentials` (16), `~/krb5-token-service` (3), `~/voms-token-service` (23),
`~/condor-token-service` (39), `~/af-mcp-platform` (289, v0.1.23),
`~/flux_apps/af/mcp-platform` (production Flux/Helm deployment).

**Key in-repo design documents:** `af-mcp-platform/PRODUCT.md`, `DESIGN.md`,
`docs/auth.md`, `docs/architecture.md`, `docs/observability.md`,
`docs/agentgateway-spike.md`, `spikes/credential-isolation/`, `spikes/nfs-subpath/`;
`rucio-mcp` founding transcript (`2026-03-25-…txt`) and
`plan-scope-based-routing-deferred.md`; `krb5-token-service/docs/plans/
2026-09-03-keytab-and-renew-design.md`; per-repo `CLAUDE.md` files.

**MCP specification (modelcontextprotocol.io):** Specification overview & security
principles (`/specification/2025-06-18`); Tools incl. `outputSchema`, annotations,
`isError` (`/specification/2025-06-18/server/tools`); Authorization incl. the token
passthrough prohibition and audience MUSTs (`/specification/2025-06-18/basic/authorization`);
Versioning (`/specification/versioning`); 2026-07-28 changelog — stateless protocol,
explicit handles, deprecation of sampling/roots/logging, DCR → CIMD
(`/specification/2026-07-28/changelog`); Elicitation
(`/specification/2026-07-28/client/elicitation`).

**Live evidence:** production gateway snapshot 2026-09-05 (`af_whoami`,
`af_list_mcp_servers`, `af_list_identities`; 110 tools visible across 6 available
services; OpenSearch bridge down and correctly absent from `tools/list`).

**Intermediate research reports** (local, gitignored): `research/*.md` — one per
repository, plus `stage3-synthesis.md`, `mcp-spec-baseline.md`,
`live-gateway-snapshot.md`.

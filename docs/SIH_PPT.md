# VYUHAM INTELLIGENCE — SIH 2026 Internal-Round PPT

**Problem Statement:** SIH26189 — AI-Powered Criminal Network Analysis System
**Format:** 10 slides, strict. Diagrams > text. ≤ 6 bullets/slide. One colour scheme.

> `[FILL: …]` marks a value only the team can supply. Verify SIH26189's exact
> official title and any statistic against the current source before submission.

Evaluator weighting this content is written against:
| Criteria | Weight | Covered by |
|---|---|---|
| Problem understanding & clarity | 20% | Slides 2, 3 |
| Innovation & uniqueness | 25% | Slides 3, 5 |
| Technical feasibility | 20% | Slides 4, 6, 8 |
| Impact & scalability | 20% | Slides 6, 7 |
| Presentation quality | 15% | diagrams on 3, 4, 8; consistency |

---

## SLIDE 1 — Title

- **Team name:** `[FILL: team name]`
- **Problem Statement:** SIH26189 · AI-Powered Criminal Network Analysis System · *(Software / Blockchain & Cybersecurity theme — `[FILL: confirm theme]`)*
- **Solution name:** **VYUHAM INTELLIGENCE** — *vyuham* = a strategic formation; the platform that reveals the enemy's formation
- **Institution:** `[FILL: college / institution]`
- **Team members:** `[FILL: 6 names + departments — SIH mandates at least 1 female member]`
- **Mentor(s):** `[FILL: name, designation]`

*Visual: logo + one hero line — "Evidence-first criminal-network analysis for multilingual investigations."*

---

## SLIDE 2 — Problem Understanding

**In our words:** A single organized-crime or financial-fraud case is buried in **call detail records, bank transfers, cell-tower dumps, FIRs, vehicle/device registries and social posts** — different formats, and in Tamil, Hindi, Malayalam, Telugu and English. The investigator must manually connect them to find *who the network is, who runs it, and what pattern they follow*.

**Who is affected**
- Police investigators, State CID / SCRB, Cyber Crime cells, Economic Offences Wings, ED, NIA.
- **Scale:** NCRB recorded **~58 lakh cognizable crimes in 2022**; cyber-crime cases rose **~24% year-on-year**; citizens reported **≈ ₹10,000+ crore lost to cyber-financial fraud in 2023** (I4C). `[FILL: cite latest NCRB / I4C figure]`

**Current solution and its gaps**
| Today | Gap |
|---|---|
| Manual link-charting on a whiteboard / Excel | 20–40 hrs per case; misses indirect links; can't scale across cases |
| Commercial tools (i2 Analyst's Notebook / Palantir) | ~₹5–8 lakh per seat; single-analyst; no Indian-language intake; black-box scores |
| Any AI scoring in use | Gives verdicts with no evidence trail → **inadmissible in court, distrusted by officers** |

---

## SLIDE 3 — Proposed Solution

**One line:** *Vyuham turns fragmented, multilingual case records into a focused, explainable relationship network — every link cites its evidence, every AI output is a reviewable hypothesis, and a human always decides.*

**How it solves SIH26189 specifically**
1. **Ingest** the exact records police already hold (CDR, bank, tower, FIR images) — bulk or one-at-a-time.
2. **Resolve** duplicate identities (aliases, transliterations) into single entities.
3. **Build** a POLE knowledge graph (Person–Object–Location–Event).
4. **Analyse** — rank key players, detect suspicious patterns, predict missing links, find evidence gaps.
5. **Deliver** it to the investigator with evidence citations and a court-ready case briefing.

**Key differentiator — why our approach is better**
- **Evidence-first, verdict-never** — every field carries `confidence` + `review_status` + `evidence_id`.
- **Self-validating** — ships with planted ground truth and **scores 100% network recall, 0 false positives on 20 trap cases**.
- **Predicts leads**, doesn't just draw the known graph.
- **Zero infrastructure** — runs on a laptop, deploys on-prem (data sovereignty).

*Visual: the concept flow — Records → Entity Resolution → Knowledge Graph → Analytics → Investigator (with an "evidence trail" badge on the arrow into Investigator).*

---

## SLIDE 4 — Technical Architecture

**System architecture — 5 layers, one API, one SPA**

```
 INPUT            INGEST                STORES            ANALYTICS              INTELLIGENCE         DELIVERY
 ─────            ──────                ──────            ─────────              ────────────         ────────
 Seed dataset ─► Bulk loader      ─►  SQLite         ─► Centrality x6       ─► Composite risk    ─► REST API /api/v1
 (28 files)       (98k rows)           25 tables +       Louvain communities    score 0-100          13 contracts +
                                       audit log         7 pattern detectors    + band + narrative   enhancement layer
 FIR image   ─► 7-stage job       ─►  NetworkX graph ─► MO similarity       ─► Evidence-cited    ─► JWT auth · per-case
 (jpg/png/pdf)   UPLOADED→OCR→LANG→     4,890 nodes /     Identity resolution    explanations         access · audit
                 TRANSLATE→NER→         9,000 edges       Link prediction     ─► Entity & case     ─► React SPA at /
                 IDENTITY→GRAPH                           Connection paths       summaries
                                                          Persons of interest
                                                          Geospatial radius
```

**Tech stack**
- **Backend:** FastAPI (Python 3.11) · SQLite (source of truth) · **NetworkX** (in-process graph)
- **Frontend:** React 19 · Vite · TypeScript · React Flow (graph canvas)
- **AI / NLP:** spaCy + regex (entity extraction) · rapidfuzz (identity resolution) · python-louvain (communities) · Tesseract / Indic OCR (production intake)
- **Auth:** JWT + pbkdf2, role + case-list claims

**Data flow (input → process → output)**
`CDR / bank txn / tower ping / FIR image`
→ `OCR → language detect → translate → NER → identity resolve → graph update`
→ `ranked influencers · pattern hypotheses · connection paths · evidence gaps · risk scores · case briefing`

**APIs / models / DBs**
- One REST surface `/api/v1` — 13 screen contracts + 6 enhancement endpoints, auto-documented (Swagger).
- SQLite relational store (25 tables + audit); NetworkX graph rebuilt at startup.
- Graph-DB layer isolated in **one file** → Neo4j + Graph Data Science drops in for state-scale, API unchanged.

---

## SLIDE 5 — Innovation & Novelty

**What is NEW**
1. **Evidence-cited, verdict-never architecture** — no other criminal-analysis tool makes *every* AI field a reviewable hypothesis with a click-through evidence trail. This is what makes it court-usable.
2. **A system that grades itself** — planted ground truth + `evaluate.py` → *"100% network recall, 0/20 trap false-positives"* is a measured fact shown to the evaluator, not a claim.
3. **Lead prediction** — Adamic-Adar + Jaccard link prediction over the case graph surfaces *"these two are probably connected, no evidence yet — investigate"*. Proactive policing, not post-mortem.
4. **Explainable composite risk score** — `Σ(pattern weight × confidence × recency-decay) + centrality + prior indicators` → 0–100 + a one-sentence reason. Auditable, not a neural black box.
5. **POLE-native** — the graph speaks Person–Object–Location–Event, the ontology law enforcement already uses.
6. **Multilingual with a safety rail** — every translation carries a confidence score and links back to the original image (a dropped negation can reverse a case).

**How it differs from existing solutions**

| | i2 / Palantir | Generic "AI crime" tools | **Vyuham** |
|---|---|---|---|
| Evidence trail on every claim | partial | ✗ | **✓** |
| Self-scored on ground truth | ✗ | ✗ | **✓ 100%** |
| Predicts missing links | ✗ | ✗ | **✓** |
| Indian-language intake | ✗ | rare | **✓ (ta/hi/ml/te/en)** |
| Cost / infra | ₹ lakhs/seat | cloud lock-in | **free, on-prem, laptop** |

**Research grounding:** transductive/inductive link prediction for criminal networks (Ahmadi et al., *Journal of Computational Science*, 2023); ROXANNE EU criminal-network toolkit; Neo4j POLE reference model. Our contribution is the *evidence-first delivery layer* + *self-validation harness* around these methods.

---

## SLIDE 6 — Feasibility & Viability

**Can it be built at the Grand Finale? — YES, and a working prototype already exists.**
- Backend (13 endpoints + enhancement layer), frontend SPA, and the evaluation harness are **built and running today**.
- Finale 36 hours = **harden + integrate real OCR + scale-test + polish the demo**, not build from zero.

**Resources required — 100% free / open-source**
| Need | Tool | Cost |
|---|---|---|
| API framework | FastAPI | free |
| Graph analytics | NetworkX | free |
| Store | SQLite | free |
| UI | React + Vite | free |
| NLP / OCR | spaCy, rapidfuzz, Tesseract | free |
| Hardware | one laptop / one mid-range server | already have |
No paid APIs. No cloud bill. No GPU.

**Scalability — can it work at 1000×?**
- NetworkX handles a **department's active caseload** now (thousands of edges, sub-second queries, cached per case).
- Swap in **Neo4j + Graph Data Science** for **state-wide graphs (millions of edges)** — the graph layer is one isolated file, the REST contract does not change.
- **Federated deployment:** each district runs its own on-prem instance; cross-case-recurrence queries run against a shared index → scales horizontally with the number of units.

---

## SLIDE 7 — Impact & Benefits

**Quantifiable impact**
- **Time:** link analysis for one case: **20–40 hours → seconds**, and it re-computes as new records arrive.
- **Focus:** surveil the **top 5 ranked players instead of 50**.
- **Coverage:** cross-case links (same phone/vehicle/account across districts) that a single investigator would *never* see — surfaced automatically.
- **Admissibility:** findings ship with an evidence trail → usable in the **charge sheet**, raising conviction quality.

**Who benefits**
- **Directly:** investigating officers, State CID / SCRB, Cyber Crime cells, EOW, ED, NIA.
- **Indirectly:** citizens — faster case resolution, more organized-crime and fraud networks dismantled, victims' money traced.

**SDG alignment**
- **SDG 16 — Peace, Justice and Strong Institutions** (target 16.4: reduce illicit financial flows and organized crime; 16.a: strengthen institutions to prevent crime). Direct fit.

---

## SLIDE 8 — Prototype / Demo

**A working prototype is deployed locally and open-source.**
- Repo: **github.com/PRAVEEN-P-55/VYUHAM** · run with one `uvicorn` command → `http://localhost:8000`

**Screenshots to include** (label each)
1. **Network Explorer** — collapsed-edge graph rooted on a phone, evidence panel open.
2. **Entity Profile** — risk score + band + narrative, influence reasons, evidence chains.
3. **Pattern Detection** — structuring / call-burst / cross-case hypotheses, each citing records.
4. **Document Intake** — a Tamil FIR image walking the 7-stage pipeline live.
5. **Audit Log** — every login / merge / export recorded.
6. **`evaluate.py` scorecard** — `NETWORK 100% · PATTERNS 100% (0/20 traps) · GAPS 100% · IDENTITY 100%`.

*Tip: put the scorecard screenshot large — it is the single most persuasive visual.*

---

## SLIDE 9 — Timeline (36-Hour Grand Finale Plan)

| Window | Milestone | Who |
|---|---|---|
| **H0–H4** | Deploy prototype on finale hardware; load judges' sample data via bulk loader; smoke-test all 13 screens | `[FILL: name]` (backend) |
| **H4–H12** | Integrate **real multilingual OCR** (Tesseract + Indic models) into the intake pipeline; wire language-detect + MT with confidence | `[FILL: name]` (NLP) · `[FILL: name]` (backend) |
| **H12** | **MVP checkpoint** — live FIR upload → entities extracted → graph updated, end to end | full team |
| **H12–H20** | Frontend polish: graph interaction, evidence viewer overlay (bounding boxes), case-briefing PDF export | `[FILL: name]` · `[FILL: name]` (frontend) |
| **H20–H24** | Scale test: load a 100k-edge graph; add Neo4j adapter behind the graph interface if time permits | `[FILL: name]` |
| **H24** | **Polished checkpoint** — full flow works on a fresh machine | full team |
| **H24–H30** | Harden auth + audit; run `evaluate.py`, capture the scorecard; fix top 3 bugs | `[FILL: name]` |
| **H30–H36** | **Demo-ready** — rehearse the 60-second script, freeze the build, prepare backup video | full team |

**Role assignments:** `[FILL: 6 members → backend / NLP-OCR / frontend / graph-analytics / data / presentation]`

---

## SLIDE 10 — Team & References

**Team** *(1 line per member — SIH requires ≥ 1 female member)*
- `[FILL: Name — Dept — key skill, e.g. "backend / FastAPI / graph algorithms"]`
- `[FILL: Name — Dept — React / TypeScript / data-viz]`
- `[FILL: Name — Dept — NLP / OCR / Indic languages]`
- `[FILL: Name — Dept — graph analytics / Python]`
- `[FILL: Name — Dept — data engineering / evaluation]`
- `[FILL: Name — Dept — UX / presentation / testing]`

**Mentor:** `[FILL: name, designation, organisation]`

**References**
1. Ahmadi, Z. et al. (2023). *Inductive and Transductive Link Prediction for Criminal Network Analysis.* Journal of Computational Science, Elsevier, vol. 72.
2. ROXANNE EU project — criminal-network analysis and visualisation toolkit.
3. Neo4j — *POLE (Person–Object–Location–Event) crime-investigation data model.*
4. NCRB, *Crime in India 2022.* `[FILL: verify page for the statistic used]`
5. Indian Cyber Crime Coordination Centre (I4C) — cyber-financial-fraud loss figures, 2023.
6. NetworkX, spaCy, FastAPI — official documentation.

---

## Pre-submission checklist

- [ ] ≤ 10 slides, body text ≥ 14 pt, ≤ 6 bullets/slide
- [ ] One consistent colour scheme; diagrams on slides 3, 4, 8
- [ ] File < 10 MB (compress screenshots)
- [ ] Female team member listed on slides 1 and 10
- [ ] Every `[FILL: …]` replaced
- [ ] PS ID **SIH26189** and exact official title on slide 1
- [ ] Statistic on slide 2 cited to a verifiable source
- [ ] Submitted before the SPOC deadline

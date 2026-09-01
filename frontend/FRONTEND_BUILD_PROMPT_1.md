# FRONTEND BUILD PROMPT — VYUHAM
## SIH26189 — AI-Powered Criminal Network Analysis System

**Scope of this file:** frontend only (React + TypeScript). This is the
single document your frontend teammate feeds to their build agent — paste
this whole file in as the prompt. Your backend teammate is building against
`BACKEND_BUILD_PROMPT.md` — this file calls out exactly which endpoints and
data shapes each screen needs, so the two sides stay in sync without
either person reading the other's full spec.

---

## 0. PROJECT IDENTITY

**Product name:** VYUHAM — Criminal Network Intelligence
Platform

**What it is:** a decision-support tool for investigators. It turns
FIRs, CDRs, transactions, and other case records into an explorable,
evidence-traceable network graph. It never outputs a guilt score or
verdict — every AI-generated connection is a hypothesis that a human
investigator reviews, confirms, defers, or rejects.

**What it must feel like:** a real Indian government investigation
system — serious, trustworthy, information-dense, human-designed. NOT
a generic AI SaaS dashboard, not cyberpunk, not gradient-heavy.

**Core UX law, repeated on every screen:** the investigator must always
be able to answer — which case is active, which entity is selected,
where did this information come from, is this verified or an AI
hypothesis, why did the system create this connection, how confident is
it, what's missing, what should I check next.

---

## 1. DESIGN SYSTEM (Government Blue)

### Design tokens — use these as CSS variables globally, no exceptions

```css
--color-primary: #2563EB;
--color-primary-hover: #1D4ED8;
--color-primary-dark: #1E3A8A;
--color-primary-soft: #DBEAFE;
--color-primary-subtle: #EFF6FF;

--color-bg: #F8FAFC;
--color-surface: #FFFFFF;
--color-surface-secondary: #F1F5F9;

--color-border: #E2E8F0;
--color-border-strong: #CBD5E1;

--color-text-primary: #0F172A;
--color-text-secondary: #475569;
--color-text-muted: #64748B;
--color-text-subtle: #94A3B8;

--color-success: #16A34A;
--color-success-soft: #DCFCE7;
--color-warning: #F59E0B;
--color-warning-soft: #FEF3C7;
--color-danger: #DC2626;
--color-danger-soft: #FEE2E2;

--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 10px;
--shadow-sm: 0 1px 2px rgba(15,23,42,0.04);
--shadow-md: 0 4px 12px rgba(15,23,42,0.08);
```

### Color grammar (the single most important rule)

| Color | Means |
|---|---|
| Blue | Interaction / selection / navigation |
| Green | Verified / confirmed |
| Amber | Needs investigation / AI-suggested / evidence gap |
| Red | Conflict / critical (use rarely) |
| Grey | Normal, unremarkable information |

Target distribution: ~75% neutral white/grey, ~15% text/borders, ~7%
government blue, ~3% semantic colors. Blue guides attention, it should
never dominate a whole screen.

### Graph entity colors

| Entity | Color |
|---|---|
| Person | #2563EB |
| Phone | #0D9488 |
| Bank Account | #D97706 |
| Organization | #7C3AED |
| Location | #DC5A4F |
| Vehicle | #65A30D |
| Incident | #B91C1C |
| Unknown | #64748B |

### Edge colors

Default #CBD5E1 (grey) · Secondary #94A3B8 · Selected #2563EB ·
Suspicious #F59E0B · Critical #DC2626 · Verified #16A34A.

Rule: most edges stay neutral grey at all times. Only highlight when
selected, filtered, part of an evidence path, suspicious, or verified —
otherwise the graph becomes unreadable noise.

### Typography

Font: **Inter** (fallback: "Segoe UI", Roboto, Arial, sans-serif).
Monospace only for IDs (CASE0001, P0400, FIR0001, EV000012).

Page title 28–32px/700 · Section title 20–22px/650–700 · Card title
15–17px/600 · Body 14px · Secondary body 13px · Metadata 11–12px · KPI
number 28–34px/700.

### Structure & spacing

- Layout: left sidebar (230–250px) + top header (64–68px) + main
  workspace. Desktop-first (1920×1080 down to 1366×768). Sidebar
  collapses on tablet.
- 8px spacing system: 4/8/12/16/24/32/40/48px. Page sections 24–32px,
  card padding 20–24px.
- Border radius: small controls 6px, buttons 6–8px, cards 8–10px, large
  containers 10px. No pill-shaped layouts except status badges.
- Prefer borders (`1px solid #E2E8F0`) over shadows. Shadows only for
  floating elements (dropdowns, modals): `0 4px 12px rgba(15,23,42,0.08)`.
- Icons: Lucide, outline style, stroke-width 1.75–2. Default #64748B,
  active #2563EB, warning #F59E0B.
- Animation: 120–200ms only, for hover/selection/panel-open/tab-switch.
  No bouncing, no floating particles, no continuous motion.
- Loading: skeletons, not spinners. For pipeline stages show named
  steps in progress (see §5).

### Responsible-AI language (use these words, avoid the others)

Use: *AI Suggested, Hypothesis, Possible Relationship, Similarity,
Confidence, Requires Review, Supporting Evidence, Conflicting Evidence.*

Never use: *Criminal Probability, Guilty, Confirmed Criminal, AI
Verdict, AI Says Person X Did It.*

---

## 2. SHARED COMPONENT LIBRARY

Build these once, reuse everywhere — do not hand-style individual pages.

`Button` (primary/secondary/danger) · `Badge`/`StatusBadge` · `Card` ·
`Input` · `Select` · `Table` · `PageHeader` · `SectionHeader` ·
`MetricCard` (KPI) · `Alert`/`Banner` · `EmptyState` · `Tooltip` ·
`Drawer` (right-side panel) · `Modal` · `Tabs` · `EvidenceCard` ·
`GraphLegend` · `FilterBar` · `ConfidenceMeter` (new — see §4.5) ·
`TimeSlider` (new — see §4.4) · `PipelineStepper` (see §5).

**Button:** primary bg `#2563EB`, hover `#1D4ED8`, pressed `#1E40AF`,
radius 7px, no gradient, no glow. Secondary: white bg, border
`#CBD5E1`, text `#334155`, hover bg `#F8FAFC`.

**Badges** (radius 4–6px):
- `OPEN` → bg `#EFF6FF` text `#1D4ED8`
- `CONFIRMED` → bg `#DCFCE7` text `#15803D`
- `AI SUGGESTED` → bg `#FEF3C7` text `#B45309`
- `CRITICAL` → bg `#FEE2E2` text `#B91C1C`

**Table:** header bg `#F8FAFC` text `#64748B` 11px, body text `#0F172A`,
row separators `#E2E8F0`, hover `#F8FAFC`, selected `#EFF6FF`. No
zebra-striping unless the data genuinely needs it.

**Form inputs:** height 40–42px, border `#CBD5E1`, focus border
`#2563EB` with `box-shadow: 0 0 0 3px rgba(37,99,235,0.10)` — no heavy
glow.

---

## 3. GLOBAL SHELL

### Sidebar
White bg, right border `#E2E8F0`. Top: "VYUHAM — Criminal Network
Intelligence" wordmark with a shield/network line icon (no gradient
logo). Grouped nav labels (`WORKSPACE`, `ANALYSIS`, `GOVERNANCE`) in
10–11px uppercase, letter-spacing 0.08em, `#94A3B8`. Nav items: default
text `#475569` icon `#64748B`; hover bg `#F8FAFC`; active bg `#EFF6FF`
text `#1D4ED8` icon `#2563EB` plus a 3px blue left indicator bar.

### Top header
White bg, bottom border `#E2E8F0`. Contains: active-case indicator,
global search (bg `#F8FAFC`, border `#E2E8F0`, focus `#2563EB`, `Ctrl K`
hint), notifications, investigator name + role.

### Routes (all must be preserved, all get the redesign)
Overview · Document Intake · Search · Network Explorer · Entity Profile
(drawer) · Timeline · Pattern Detection · MO Comparison · Identity
Review · Evidence Gaps · Case Registry · Audit Log · Sign-in.

---

## 4. PAGE-BY-PAGE SPEC

### 4.1 Sign-in
Simple centered card on `#F8FAFC` background — org branding, email/ID +
password (or SSO button if backend provides OIDC), no illustration
clutter. On success, route to Overview with the investigator's
authorized case list.

**Needs from backend:** `POST /api/v1/auth/login`, returns investigator
identity + role + list of accessible `case_id`s. (See
`BACKEND_BUILD_PROMPT.md` §6.1 for the exact response shape.)

### 4.2 Overview (dashboard)
Answers "what is happening in this investigation" at a glance.

- Breadcrumb: `ACTIVE CASE • CASE0001`
- Title: case title (e.g. "Theft Inquiry — Vellore"), metadata row
  (district, state, opened date, status badge)
- Actions: **Redacted Export**, **Explore Network**
- **Evidence-first banner** (bg `#EFF6FF`, border `#BFDBFE`, blue icon):
  *"Evidence-first analysis — AI-generated outputs are investigative
  hypotheses. Investigators must verify original records before taking
  action."*
- KPI cards: Entities Indexed / Evidence Records / Relationships / Open
  Evidence Gaps — white cards, subtle icon chip (bg `#EFF6FF` icon
  `#2563EB`), no bright colors
- Network activity chart: single blue line (`#2563EB`), area fill
  `rgba(37,99,235,0.08)`, grid `#E2E8F0`
- Priority follow-ups list: compact rows, not cards — severity dot,
  issue title, entity ID (mono), reason, status, "Open" action

**Needs from backend:** `GET /api/v1/cases/{id}/summary` — case
summary, KPI counts, evidence-gap list (top N by priority), an activity
time-series. Exact shape in `BACKEND_BUILD_PROMPT.md` §6.2.

### 4.3 Document Intake (upload)
Layout: left = upload/processing form, right = pipeline status, bottom
= processed evidence table.

- Upload box: white, dashed border `#CBD5E1`, hover `#EFF6FF`, active
  `#2563EB` border. Accepts JPG/PNG/PDF. Must support **camera capture
  on mobile/tablet** so an officer can photograph a handwritten note
  directly and upload it — this is a required capability, not optional.
- Pipeline steps (see `PipelineStepper` component): **Uploaded → OCR →
  Language Detection → Translation → Entity Extraction → Identity
  Resolution → Graph Update.** States: pending `#94A3B8`, processing
  `#2563EB`, completed `#16A34A`, issue `#F59E0B`, failed `#DC2626`.
- Bottom table: every processed document with status, detected
  language, extracted entity count, link to view.

**Needs from backend:** `POST /api/v1/cases/{id}/documents` (upload),
`GET /api/v1/jobs/{id}/events` (poll for live pipeline stage updates —
stage names are the exact ones listed above, uppercase-with-underscores
in the API, e.g. `LANGUAGE_DETECTION`). See `BACKEND_BUILD_PROMPT.md` §6.3.

### 4.4 Network Explorer — with time-slider novelty
The centerpiece screen.

- Toolbar: entity search, filters, **hop selector**, relationship-type
  filter, recenter, fit-to-screen, export view
- **Time range / TimeSlider (novelty #1):** a draggable range slider
  above the canvas. As the investigator drags it, edges and nodes whose
  `valid_from`/timestamp fall outside the window fade to near-invisible
  and the graph visibly grows or contracts. Include a small play button
  to auto-animate the network's growth over the case timeline. This
  turns a static graph into a story told frame by frame.
- Canvas: bg `#F8FAFC`, optional faint dot grid
  `rgba(148,163,184,0.2)`. Never a dark background.
- Nodes: thin border, entity-type color per §1, labels shown only on
  hover/selection/important nodes — not all labels by default.
- Selection state: selected node gets a 2–3px `#2563EB` outline;
  connected nodes stay full-opacity; everything else dims. Selected
  edges highlight, others stay neutral grey.
- **"Explain this connection" (novelty #2):** clicking any edge opens a
  small popover with a plain-language sentence, e.g. *"Linked through 3
  calls in the 48 hours before the incident, plus 1 shared bank
  transfer,"* built from the edge's supporting evidence records — not
  just a raw confidence number.

**Needs from backend:** `POST /api/v1/cases/{id}/graph/query` (nodes +
edges for a case/entity within N hops). Each edge is already a
**collapsed logical edge** — it carries an aggregated
`evidence_summary` (source type + count + key dates) and an `evidence`
array, so the frontend can render the "explain this connection" text
and the evidence list directly from this one response, no per-edge
follow-up call. This is the single highest-value contract in the
project — full shape and a worked example (`SC01` / `PH0061→PH0062`)
in `BACKEND_BUILD_PROMPT.md` §6.4.

### 4.5 Entity Profile drawer — with confidence + evidence-highlight novelty
Opens as a right-side `Drawer` when a node is clicked.

- Header: name, entity ID (mono), entity type, aliases
- Identity fields: phone(s), vehicle(s), account(s), linked FIRs,
  related cases
- **ConfidenceMeter (novelty #3):** every AI-suggested field or summary
  line shows an inline confidence chip, e.g. *"82% confidence — human
  review recommended"* — amber if below a review threshold (e.g. 75%),
  green if independently verified. Never presented as a bare number
  alone; always paired with the word "confidence" and, when low, the
  review nudge text.
- **Evidence Connections list:** each relationship shown as a short
  evidence chain, e.g. `Arun Kumar → Phone 81062188XX → Called Ravi
  Kumar → CDR C000583`, with source, timestamp, confidence, evidence ID
- **Evidence Viewer (document highlighting):** if the entity is
  mentioned in an uploaded document, show the original scanned image
  with a highlighted bounding box over the exact matched text/name.
  This is the "don't blindly trust the AI" feature — the investigator
  always sees the source pixel, not just an extracted claim.

**Needs from backend:** `GET /api/v1/cases/{id}/entities/{id}/summary`,
`GET /api/v1/cases/{id}/relationships/{id}`, and `GET
/api/v1/cases/{id}/entities/{id}/document-mentions` for the highlight
overlay — bounding boxes are **pixel coordinates**
`{x, y, width, height}`, not percentages (confirmed against the actual
dataset in `BACKEND_BUILD_PROMPT.md` §6.5).

### 4.6 Timeline
Clean vertical timeline. Event types: CALL, TRANSACTION, LOCATION, FIR,
SURVEILLANCE, CCTV, SOCIAL, INCIDENT — colored per entity/category
system, compact rows (not big cards): timestamp, type, description,
source ID, evidence link.

**Needs from backend:** `GET /api/v1/cases/{id}/timeline`.

### 4.7 Pattern Detection — with cross-case alert novelty
Heading: "Suspicious Pattern Hypotheses." Disclaimer banner: *"Patterns
prioritize records for human review. They are not findings or proof."*

Filters: ALL / STRUCTURING / CIRCULAR FLOW / MULE ACCOUNT /
PRE-INCIDENT CALL BURST / UNUSUAL TIMING / **CROSS-CASE MATCH**. (This
is the backend's actual 6-type taxonomy — confirm with your backend
teammate before shipping filter chips, since an earlier draft of this
list didn't quite match what the pattern-detection ground truth scores
against.)

- Pattern card: pattern type, hypothesis ID, priority, plain-language
  reason, entity count, evidence-record count, amber "AI SUGGESTED"
  badge, "Inspect Evidence →" link.
- **Cross-case pattern alert (novelty #4):** a distinct card variant
  that fires when the same MO, phone, or vehicle appears across two
  different cases/police stations. Header reads something like *"Same
  vehicle description matched across 2 cases — Vellore & Krishnagiri"*
  with both case IDs linked, so jurisdiction silos don't hide the
  connection.

**Needs from backend:** `GET /api/v1/cases/{id}/patterns` with a
`cross_case` flag and linked `case_id`s per pattern.

### 4.8 MO Comparison
Title: "Modus Operandi Similarity." Side-by-side source vs comparison
incident, similarity %, then explicit **Matching Features** (✓ entry
method, target type, tool/weapon, escape method, distinctive action)
and **Non-Matching Features** (⚠ e.g. vehicle description) — never just
a bare percentage, always the "why."

**Needs from backend:** `GET /api/v1/incidents/{id}/similar-mo` with a
feature-level match/no-match breakdown, not just a score.

### 4.9 Identity Review — with alias-resolution novelty
Title: "Identity Resolution Review." Subtitle: *"Review supporting and
conflicting evidence before linking records."*

- Record A vs Record B side by side, match confidence %
- **Supporting** (✓ name/transliteration similarity, shared identifier
  history, related phone history) and **Conflicting** (⚠ e.g. different
  address period) lists
- Actions: **Accept / Defer / Reject** — accepted merges must remain
  reversible and are written to the audit log

This *is* novelty feature #5 (identity/alias resolution with human sign
-off) — it's a full page, not a modal, because it's central to the
project's "human stays in the loop" story.

**Needs from backend:** `GET /api/v1/cases/{id}/resolution-candidates`,
`POST .../resolution-candidates/{id}/action` — merge action is
reversible and logged.

### 4.10 Evidence Gaps
Amber-forward page. Gap types: Missing Location Data, Unverified
Account, Missing Incident Link, Incomplete Witness Description, No
Device Record. Each gap card: gap ID, entity, reason, impact, missing
time window, recommended follow-up, "Copy Follow-up Brief" action.

**Needs from backend:** `GET /api/v1/cases/{id}/evidence-gaps`.

### 4.11 Case Registry
Government-records table: Case / Jurisdiction / Officer / Opened /
Status / Review — searchable, filterable, sortable, paginated. Status
badges (OPEN/UNDER INVESTIGATION/CHARGESHEET FILED/CLOSED/COLD), review
badges (CONFIRMED/PENDING REVIEW/AI SUGGESTED/DISPUTED).

**Needs from backend:** `GET /api/v1/cases` (list + filters).

### 4.12 Case Briefing export — novelty
Accessible from Overview and Case Registry. A **"Generate Case
Briefing"** action opens a preview of a one-page, plain-language
summary of the whole network (key entities, key relationships in
plain sentences, open evidence gaps, recommended next steps) formatted
for handing to a magistrate or senior officer, with a redaction toggle
before export. This is novelty feature #6 — it converts the graph into
an actual physical deliverable, not just an on-screen exploration tool.

**Needs from backend:** `POST /api/v1/cases/{id}/export` returning
structured content the frontend renders and prints (PDF generation is a
backend stretch goal, not guaranteed for demo day — build the render
path so structured JSON is enough).

### 4.13 Audit Log
Table: Timestamp / User / Role / Action / Description / Resource /
Outcome. Status pill: "AUDIT CAPTURE ACTIVE" in green. Must feel
immutable and official — no futuristic/blockchain visual styling.

**Needs from backend:** `GET /api/v1/audit-log`.

---

## 5. THE SIX NOVELTY FEATURES — quick index

For your team/judges reference, these are woven into the pages above,
not separate screens:

1. **Time-slider network playback** — Network Explorer (§4.4)
2. **"Explain this connection"** — Network Explorer edge popover (§4.4)
3. **Inline confidence indicators with review nudges** — Entity Profile
   drawer (§4.5)
4. **Cross-case pattern alerts** — Pattern Detection (§4.7)
5. **Identity/alias resolution with human accept-defer-reject** —
   Identity Review page (§4.9)
6. **One-page case briefing export** — Overview / Case Registry (§4.12)

---

## 6. BUILD ORDER

1. Design tokens + shared component library (§1–2) — do this first,
   everything else depends on it
2. Global shell: sidebar, header, routing (§3)
3. Sign-in + Overview (§4.1–4.2)
4. Document Intake with pipeline stepper (§4.3)
5. Network Explorer core (graph render, selection, side panel) before
   adding the time slider and explain-connection novelty on top
6. Entity Profile drawer + Evidence Viewer with bounding-box highlight
7. Timeline, Pattern Detection (+ cross-case alerts), MO Comparison
8. Identity Review, Evidence Gaps, Case Registry
9. Case Briefing export, Audit Log
10. Pass over every screen against §4's "Needs from backend" lines and
    confirm the live API matches — this is the handoff point with your
    backend teammate.

## 7. HANDOFF NOTE FOR YOUR BACKEND TEAMMATE

Every "Needs from backend" line above names the endpoint this screen
calls and the minimum data shape it expects. The authoritative contract
is `BACKEND_BUILD_PROMPT.md` (§6 there has the full API contract) — if a
shape here and there ever disagree, that file wins, but flag it so both
files get updated together. The two fields worth extra attention because
the whole "explainable AI" pitch depends on them: every relationship
needs an evidence list a UI can summarize in one sentence, and every
evidence record needs a `document_id` + `bounding_box` (pixel
coordinates) so the highlight overlay works. If the live API ever
returns something this file didn't anticipate, build against the API's
actual response and flag the mismatch — don't silently guess.

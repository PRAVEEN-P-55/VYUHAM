<div align="center">

# VYUHAM Intelligence

### Evidence-first criminal network analysis for multilingual investigations

Turn case records and investigator-supplied clues into focused, explainable relationship networks while keeping every conclusion linked to its supporting evidence.

[Quickstart](#quickstart) · [Features](#what-vyuham-does) · [Contributing](CONTRIBUTING.md) · [API documentation](backend/README.md)

</div>

> [!IMPORTANT]
> VYUHAM is an investigative support system, not a decision-maker. AI-derived results are hypotheses with confidence and review status. Investigators must verify original evidence before acting.

## Why VYUHAM

Investigators often begin with only a name, phone number, vehicle, bank account, location, or identity fragment. VYUHAM can search that clue across authorised cases and build a focused network around the matching entity without requiring a new document upload first.

The project is designed as a zero-infrastructure demonstration: FastAPI serves both the API and the built React workspace, while SQLite and NetworkX provide a reproducible local data and graph layer.

## What VYUHAM does

| Capability | Investigator value |
|---|---|
| Clue-first entity search | Search authorised records by name, alias, phone, vehicle, account, organisation, location, or ID |
| Focused network explorer | Centres the searched entity and hides unrelated graph noise |
| Explainable relationships | Shows evidence IDs, confidence, review status, and source excerpts behind every link |
| Multilingual document intake | Accepts PDF, JPG, JPEG, and PNG evidence through a visible processing pipeline |
| Identity resolution review | Supports reversible human decisions with a complete audit trail |
| Timeline and pattern analysis | Explores chronological activity, cross-case patterns, and similar modus operandi |
| Evidence-gap tracking | Identifies missing records and produces actionable follow-up briefs |
| Investigation workflow UI | Keyboard command search, expandable evidence, pinned graph entities, path tracing, filters, and accessible reduced-motion support |

## Repository layout

| Part | Path | Stack |
|---|---|---|
| Backend and REST API | [`backend/`](backend/) | FastAPI, SQLite, NetworkX |
| Investigator workspace | [`frontend/`](frontend/) | React 19, Vite, TypeScript, React Flow |
| Synthetic datasets | [`Datasets/`](Datasets/) | JSONL, XLSX, and planted ground-truth records |
| Upload-ready samples | [`samples/`](samples/) | Synthetic multilingual demonstration evidence |

## Quickstart

Prerequisites: Python 3.11+, Node.js 20+, and npm.

```powershell
# Backend environment and synthetic database
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts/seed_from_datasets.py
python scripts/make_demo_fir.py --all

# Production frontend build
cd ..\frontend
npm install
npm run build

# Run the complete application
cd ..\backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open [http://localhost:8000](http://localhost:8000).

Demo password: `vyuham123`

| Investigator | Access |
|---|---|
| `INV001` | All seeded demonstration cases |
| `INV002`, `INV003`, `INV004` | Restricted case access for authorisation testing |

Useful endpoints:

- Investigator workspace: `/`
- OpenAPI documentation: `/docs`
- API test harness: `/tester`
- Health check: `/health`

## Verification

```powershell
# Frontend
cd frontend
npm test
npm run build

# Backend syntax and evaluation scorecard
cd ..\backend
python -m compileall app
python scripts/evaluate.py
```

The evaluation script measures live analytics against planted synthetic ground truth. See the [backend documentation](backend/README.md) for architecture diagrams, endpoint contracts, algorithms, and the demonstration script.

## Synthetic evidence samples

All included records, people, identifiers, and relationships are fictional. The repository includes an upload-ready handwritten Hindi image at [`samples/handwritten-hindi/FIR0002.png`](samples/handwritten-hindi/FIR0002.png) for testing the document-intake interface.

The current demonstration pipeline simulates OCR, translation, and entity-extraction stages using seeded metadata. It validates the end-to-end workflow and UI, but it is not a production OCR benchmark.

## Contributing

Contributions are welcome in focused, reviewable pull requests. Good starting areas include:

- production OCR and multilingual model adapters;
- larger-graph layout and rendering performance;
- graph analytics and explainability;
- accessibility and keyboard workflows;
- test coverage, synthetic datasets, and documentation.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please use only synthetic or legally shareable data—never upload real personal, criminal, or operational records to a public issue or pull request.

<div align="center">

SIH26189 · Synthetic and fictional demonstration data only

</div>

<div align="center">

# 🛰️ VYUHAM INTELLIGENCE

### AI-Powered Criminal Network Analysis — SIH26189

*Ingest case records → resolve entities → build a knowledge graph → run explainable analytics → serve it through one API and a single-page investigator workspace.*

</div>

---

## Repository layout

| Part | Path | Stack |
|---|---|---|
| **Backend + REST API** | [`backend/`](backend/) | FastAPI · SQLite · NetworkX |
| **Frontend (investigator SPA)** | [`frontend/`](frontend/) | React 19 · Vite · TypeScript |
| **Synthetic dataset** | [`Datasets/`](Datasets/) | 28 JSONL / XLSX files + 6 planted ground-truth files |

The backend serves the built frontend **same-origin at `/`** — one process, no CORS.

---

## Quickstart

```bash
# 1. backend
cd backend
python -m venv .venv && .venv\Scripts\activate      # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
python scripts/seed_from_datasets.py                 # ~98k rows -> data/vyuham.db
python scripts/make_demo_fir.py --all                # render FIR document images

# 2. frontend (build once so the backend can serve it)
cd ../frontend && npm install && npm run build

# 3. run
cd ../backend && uvicorn app.main:app --port 8000
```

Then open **<http://localhost:8000/>**.

| URL | |
|---|---|
| `/` | investigator SPA |
| `/docs` | Swagger UI |
| `/tester` | bare API test harness |
| `python scripts/evaluate.py` | ground-truth scorecard (the judge-facing proof) |

**Demo logins** (password `vyuham123`): `INV001` (all cases) · `INV002` · `INV003` · `INV004`.

Full architecture, pipeline diagrams, endpoint reference and demo script: **[`backend/README.md`](backend/README.md)**.

---

## The one rule

> Nothing the system returns is a verdict. Every AI-derived field carries a `confidence` and a
> `review_status`; every relationship, pattern and summary cites the `evidence_id`s behind it.
> The system proposes, ranks and explains — a person decides.

---

<div align="center"><sub>SIH26189 · all data synthetic and fictional</sub></div>

# VYUHAM Frontend

React 19 and TypeScript investigator workspace for VYUHAM criminal-network intelligence.

## Development

Start the FastAPI backend:

```powershell
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal, start Vite:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL and sign in as `INV001` with password `vyuham123`. Vite proxies `/api`, `/documents`, and `/uploads` to FastAPI.

After `npm run build`, FastAPI serves the production frontend at `http://localhost:8000`.

## Checks

```powershell
npm test
npm run build
```

## Backend integration

All backend-supported screens use the typed client in [`src/services/api.ts`](src/services/api.ts). Authentication uses a Bearer token stored in session storage by default, or local storage only when "Keep me signed in" is selected.

The active case is shared across Overview, Document Intake, Search, Network Explorer, Timeline, Pattern Detection, MO Comparison, Identity Review, and Evidence Gaps. Case briefings, uploads, upload-job polling, identity decisions, reversals, and audit records use live API actions.

Relationship evidence arrays and pixel-coordinate document bounding boxes are retained for source inspection. AI-derived results remain explicitly marked for investigator review.

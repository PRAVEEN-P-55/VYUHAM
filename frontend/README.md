# VYUHAM Frontend

React 19 and TypeScript frontend for the VYUHAM criminal-network investigation workspace.

## Run the complete application

Start the FastAPI backend from the repository root:

```powershell
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal, start the frontend:

```powershell
cd Frontend
npm install
npm run dev
```

Open `http://localhost:5174/sign-in` and use investigator `INV001` with the seeded demo password. Vite proxies `/api`, `/documents`, and `/uploads` to the backend.

After `npm run build`, FastAPI also serves the production frontend directly at `http://localhost:8000`.

## Checks

```bash
npm test
npm run build
```

## Backend integration

All backend-supported screens use the typed client in [src/services/api.ts](src/services/api.ts). Authentication uses the backend's Bearer token, stored in session storage by default or local storage only when “Keep me signed in” is selected.

The active case is shared across Overview, Document Intake, Search, Network Explorer, Timeline, Pattern Detection, MO Comparison, Identity Review, and Evidence Gaps. Case briefings, uploads, upload-job polling, identity decisions, reversals, and audit records are live API actions.

Relationship evidence arrays and pixel-coordinate document bounding boxes are retained for source inspection.

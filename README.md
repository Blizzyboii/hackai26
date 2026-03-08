# Cortex Graph (Frontend + Mongo Backend)

This repository now runs a Next.js graph UI and a Flask backend that builds the graph from MongoDB club documents.

## Run frontend

```bash
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

## Run backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

Backend reads environment values from `backend/.env` and runs at `http://127.0.0.1:5000` by default.

## Data flow

- Frontend requests `GET /api/proxy/graph`.
- Next.js proxy forwards to Flask `GET /graph`.
- Flask builds `GraphDataset` from Mongo `clubs` collection:
  - `club` nodes from club docs
  - preserved hardcoded `subprogram` nodes via alias map (ACM/AIS/FinTech/WiCyS)
  - `company` nodes from officer `experience[].company`
  - `club_to_company` edges weighted by unique officers
  - `cross_club` edges weighted by shared officers

If backend is unavailable, frontend automatically falls back to the existing mock graph and shows a warning banner.

## Optional frontend proxy target override

Set `API_PROXY_TARGET` if Flask is hosted elsewhere.

```bash
API_PROXY_TARGET=http://127.0.0.1:5000
```

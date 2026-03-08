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

## RL path recommender

The backend now exposes `POST /recommend-paths` and will try to use a linear Q-policy checkpoint before falling back to the original heuristic scorer.

- RL code lives in `backend/rl/path_policy.py`
- Export the current graph snapshot with `backend/rl/export_graph_snapshot.py`
- Train on a separate machine with `backend/rl/train_path_policy.py` or `backend/rl/train.sh`
- GPU/training dependencies are listed in `backend/rl/requirements.txt`

Default artifact paths:

- checkpoint: `backend/path_policy_artifacts/policy.pt`
- feature manifest: `backend/path_policy_artifacts/feature_manifest.json`
- training summary: `backend/path_policy_artifacts/training_summary.json`

Backend env vars:

- `PATH_POLICY_MODE=rl|heuristic`
- `PATH_POLICY_CHECKPOINT=/absolute/path/to/policy.pt`
- `PATH_POLICY_FEATURES=/absolute/path/to/feature_manifest.json`

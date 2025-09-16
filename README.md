# System Logs Analyzer

Node.js (Express) backend with a FastAPI-based ML scoring service to detect anomalous log activity.

## Overview

- POST `/ingest`: stores raw logs in SQLite and calls the ML service. If score > threshold, records an incident.
- GET `/incidents`: lists detected incidents.
- GET `/meta`: returns `{ git, model, started_at }`.

## Easiest: Docker Compose (both services)

Runs both the backend and ML service with one command.

```powershell
docker compose up --build
```

Services:

- ML service: <http://127.0.0.1:8000>
- Backend: <http://127.0.0.1:3000>

Stop with Ctrl+C, then:

```powershell
docker compose down
```

## Local Development (no session env tweaks)

### 1) ML Service (FastAPI)

Option A — Local Python

```powershell
# From repository root
cd ml-service
py -3.12 -m venv .venv  # or: python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python .\train.py   # creates model.joblib and model_info.json
uvicorn app:app --host 127.0.0.1 --port 8000
```

Option B — Docker

```powershell
cd ml-service
docker build -t logs-ml-service .
docker run --rm -p 8000:8000 --name logs-ml logs-ml-service
```

Quick check (new PowerShell window):

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/model-info | ConvertTo-Json -Depth 4
```

### 2) Backend (Express + SQLite)

Create a `.env` file in the repository root with:

```dotenv
PORT=3000
THRESHOLD=0.8
ML_URL=http://127.0.0.1:8000/score
```

Then install and run:

```powershell
npm install
npm start
```

You should see: `Server listening on port 3000`.

## Test the Endpoints

New PowerShell window:

- Meta

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3000/meta | ConvertTo-Json -Depth 4
```

- Ingest sample logs

```powershell
$logs = @(
  @{ timestamp = (Get-Date).ToString("o"); service = "auth"; level = "ERROR"; message = "authentication failed login for user admin"; metadata = @{ ip = "10.0.0.10" } },
  @{ timestamp = (Get-Date).AddSeconds(-10).ToString("o"); service = "web";  level = "WARN";  message = "cache miss";                                metadata = @{ path = "/home" } },
  @{ timestamp = (Get-Date).AddSeconds(-20).ToString("o"); service = "auth"; level = "ERROR"; message = "invalid password";                         metadata = @{ ip = "10.0.0.11" } }
)

$resp = Invoke-RestMethod -Method Post -Uri http://localhost:3000/ingest -ContentType 'application/json' -Body ($logs | ConvertTo-Json -Depth 5)
$resp | ConvertTo-Json -Depth 5
```

- Incidents

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3000/incidents | ConvertTo-Json -Depth 8
```

## Environment Variables

- `PORT`: Backend port (default `3000`).
- `THRESHOLD`: Score threshold for incident creation (default `0.8`).
- `ML_URL`: ML scoring endpoint (default `http://ml-service:8000/score`). For local dev use `http://127.0.0.1:8000/score`.
- `MODEL_VERSION`: Shown in `/meta` → `model` field.

The backend loads `.env` via `dotenv`.

## Data and Storage

- SQLite database file: `data.sqlite` (auto-created on first run).
- Tables:
  - `logs(id, timestamp, service, level, message, metadata, created_at)`
  - `incidents(id, detected_at, service, severity, summary, features)`

You can inspect `data.sqlite` with DB Browser for SQLite.

## Project Structure

```text
.
├─ server.js
├─ db.js
├─ package.json
├─ Dockerfile            # backend
├─ docker-compose.yml
├─ data.sqlite           # created at runtime
└─ ml-service/
   ├─ app.py
   ├─ train.py
   ├─ requirements.txt
   └─ Dockerfile
```

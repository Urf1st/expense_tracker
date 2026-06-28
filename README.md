# Expense Tracker

A full-stack expense tracking web application built as a DevOps portfolio project. The focus is on the infrastructure and deployment pipeline rather than the application itself.

**Live stack:** React + TypeScript frontend served by Nginx, FastAPI backend, SQLite database — all containerised and orchestrated.

---

## Features

- Add, view, and delete expenses
- Dynamic categories (create and remove your own)
- Per-expense currency with a configurable global default
- Filters by title, category, and date range
- Sortable table columns
- Reports section — spending breakdown by month and by category
- Configurable header text via settings
- Dark dashboard UI

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Serving | Nginx (Alpine) |
| Backend | FastAPI, Python 3.11, Uvicorn |
| Database | SQLite |
| Containerisation | Docker, Docker Compose |
| CI/CD *(planned)* | Jenkins |
| Orchestration *(planned)* | Kubernetes (Minikube) |
| GitOps *(planned)* | ArgoCD |
| Infrastructure as Code *(planned)* | Terraform |
| Configuration Management *(planned)* | Ansible |

---

## Project Structure

```
expense-tracker/
├── backend/
│   ├── Dockerfile
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── src/
│   │   ├── app.tsx
│   │   ├── app.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── k8s/                      # coming soon
├── terraform/                # coming soon
├── ansible/                  # coming soon
├── docker-compose.yml
└── README.md
```

---

## Running Locally

### Prerequisites

- Docker
- Docker Compose

### Steps

```bash
git clone https://github.com/<your-username>/expense-tracker.git
cd expense-tracker

# Build images
docker build -t expense_tracker_frontend:latest ./frontend
docker build -t expense_tracker_backend:latest ./backend

# Start
docker compose up
```

Open [http://localhost](http://localhost) in your browser.

---

## Architecture

```
Browser
  │
  ▼
Nginx :80          (serves static frontend, proxies /api/*)
  │
  ▼
FastAPI :8000      (REST API)
  │
  ▼
SQLite             (expenses.db — persisted via Docker volume)
```

---

## API

Interactive docs available at `http://localhost:8000/docs` when the backend is running.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/expenses` | List expenses (supports filters) |
| POST | `/api/expenses` | Create expense |
| DELETE | `/api/expenses/{id}` | Delete expense |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| DELETE | `/api/categories/{id}` | Delete category |
| GET | `/api/settings` | Get app settings |
| PUT | `/api/settings/{key}` | Update a setting |
| GET | `/api/stats/summary` | Spending summary |
| GET | `/api/stats/by-month` | Breakdown by month |

---

## Roadmap

- [x] Docker Compose deployment
- [ ] Kubernetes manifests (Minikube)
- [ ] Jenkins CI pipeline (build → push to Docker Hub)
- [ ] ArgoCD GitOps (auto-deploy on git push)
- [ ] Terraform (infrastructure provisioning)
- [ ] Ansible (configuration management)
- [ ] Prometheus metrics
- [ ] GitHub Actions

---

## License

MIT

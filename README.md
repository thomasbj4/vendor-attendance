# Vendor Attendance System

A full-stack vendor attendance and timesheet management system built with React, Express, and PostgreSQL.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 |
| Auth | JWT (httpOnly cookies) + OTP email login |
| Container | Docker + Docker Compose |
| Web server | nginx (reverse proxy + SPA) |

---

## Features

- Attendance tracking — clock-in/out, daily records, monthly calendar
- Timesheet flow — `draft → submitted → signed`
- Signature pad — draw or upload signature for timesheet submission
- Excel export — generates formatted attendance reports, auto-signs timesheets on export
- Role-based access — `admin` and `user` roles
- OTP email login — passwordless login via 6-digit code
- Audit log — full trail of all admin and user actions
- SMTP settings — configurable email server via admin UI
- First-run setup — creates admin account on fresh deploy

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/) v2+

That's it. Node.js is not required on the host — everything runs inside containers.

---

## Quick Start

### 1. Clone the repository

```bash
git clone <repository-url>
cd Vendor_attendance
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Open `.env` and fill in the required values (at minimum `POSTGRES_PASSWORD`, `JWT_SECRET`, and `CORS_ORIGIN`):

```bash
# Generate strong secrets
openssl rand -hex 32   # use output for POSTGRES_PASSWORD
openssl rand -hex 32   # use output for JWT_SECRET
```

### 3. Build and start

```bash
docker compose up -d --build
```

This will:
1. Pull postgres:16-alpine and nginx:stable-alpine base images
2. Build the backend (TypeScript → Node.js)
3. Build the frontend (Vite → nginx)
4. Create the database and run schema migrations automatically
5. Start all three services

### 4. First-run setup

Open **http://localhost** (or your configured `APP_PORT`) in a browser.

On a fresh database you will be taken to the **Setup** page — create your first admin account here. This page is only shown once and is permanently blocked once a user exists.

### 5. Log in

Use the admin account you just created. Additional users are managed from the **Users** page inside the app.

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Required

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL password — generate with `openssl rand -hex 32` |
| `JWT_SECRET` | JWT signing secret — generate with `openssl rand -hex 32` |
| `CORS_ORIGIN` | Allowed origin(s), comma-separated, no trailing slash — e.g. `https://yourdomain.com` |

### Application

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | `Vendor Attendance` | Shown in emails and Excel exports |
| `APP_PORT` | `80` | Host port the app is served on |
| `NODE_ENV` | `production` | Set to `development` to enable dev seed data |
| `COOKIE_SECURE` | `true` | Set to `false` for local HTTP development only |
| `CLIENT_MAX_BODY_SIZE` | `20m` | Max upload size — used by both nginx and Express |

### Database

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `postgres` | PostgreSQL username |
| `POSTGRES_DB` | `attendance` | Database name |
| `POSTGRES_HOST` | `db` | Hostname (use `db` inside Docker, or external host) |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `DB_POOL_MAX` | `20` | Max connection pool size |
| `DB_POOL_IDLE_TIMEOUT` | `30000` | Idle connection timeout (ms) |
| `DB_POOL_CONNECT_TIMEOUT` | `5000` | Connection timeout (ms) |

### Auth & Security

| Variable | Default | Description |
|---|---|---|
| `JWT_EXPIRY_HOURS` | `8` | Session length in hours |
| `BCRYPT_ROUNDS` | `10` | bcrypt cost factor — increase for stronger hashing |

### OTP

| Variable | Default | Description |
|---|---|---|
| `OTP_EXPIRY_MINUTES` | `10` | OTP validity window |
| `OTP_RATE_LIMIT_MAX` | `3` | Max OTP requests per window |
| `OTP_RATE_LIMIT_WINDOW_MS` | `60000` | OTP rate limit window (ms) |

### Login Rate Limiting

| Variable | Default | Description |
|---|---|---|
| `LOGIN_RATE_LIMIT_MAX` | `10` | Max login attempts per window |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` | Login rate limit window (ms) — 15 minutes |

---

## Common Commands

### Start / Stop

```bash
# Start in background
docker compose up -d

# Start and rebuild images
docker compose up -d --build

# Stop containers (data preserved)
docker compose down

# Stop and wipe all data (fresh start)
docker compose down -v
```

### Logs

```bash
# All services
docker compose logs -f

# Single service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

### Health check

```bash
curl http://localhost/api/health
# {"status":"ok","db":"connected","time":"..."}
```

### Database access

```bash
docker compose exec db psql -U postgres -d attendance
```

### Rebuild a single service

```bash
docker compose build backend
docker compose up -d backend
```

---

## Database

Tables are created automatically on first boot via `initSchema()` — no manual migration step required.

**Tables:**

| Table | Description |
|---|---|
| `users` | Employees and admins |
| `attendance` | Daily attendance records |
| `timesheets` | Weekly/period timesheets |
| `signatures` | Signature pad data (stored as base64 in Postgres) |
| `smtp_settings` | Email server configuration |
| `otp_tokens` | One-time password tokens |
| `audit_logs` | Full activity trail |

### Backup

```bash
# Dump
docker compose exec db pg_dump -U postgres attendance > backup.sql

# Restore
cat backup.sql | docker compose exec -T db psql -U postgres -d attendance
```

---

## Timesheet Flow

```
draft  →  submitted  →  signed
```

1. Employee fills in attendance records for the week
2. Employee submits timesheet with a signature → status: `submitted`
3. Admin exports the report → status becomes `signed` (locked, cannot be edited)

---

## HTTPS / Production Deployment

The nginx container serves HTTP on port 80. For production:

1. Place a reverse proxy (Cloudflare, AWS ALB, nginx-proxy-manager, Traefik) in front
2. Terminate TLS at the proxy
3. Set `CORS_ORIGIN=https://yourdomain.com` in `.env`
4. Set `COOKIE_SECURE=true` in `.env`
5. Set `HSTS_MAX_AGE=31536000` in `.env`
6. `docker compose up -d` — no rebuild needed

---

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── middleware/       # Auth, role checks
│   │   ├── services/         # Email, audit logging
│   │   ├── database/         # DB pool, schema init
│   │   └── utils/
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/            # React pages
│   │   ├── components/       # Shared components
│   │   ├── context/          # Auth context
│   │   └── api/              # Axios client
│   ├── nginx.conf.template   # nginx config (envsubst at runtime)
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Development (without Docker)

### Backend

```bash
cd backend
npm install
cp ../.env.example .env   # set DATABASE_URL for local postgres
npm run dev               # starts on port 5000 with hot reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev               # starts on port 5173, proxies /api/ to localhost:5000
```

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

- **Attendance tracking** — daily records with regular and overtime hours, monthly calendar view
- **Weekend overtime** — Saturday/Sunday tracked separately as optional overtime; shown first in the weekly view
- **Sat–Fri work period** — the app treats each "week" as Saturday through Friday (not Mon–Sun); all date filters, dashboards, and reports default to this period
- **Timesheet flow** — `draft → submitted → signed` with signature pad; separate sign-off for weekday (Mon–Fri) and weekend (Sat–Sun) periods
- **Signature pad** — draw or upload signature for timesheet submission
- **Excel export** — generates formatted attendance reports, auto-signs timesheets on export
- **Role-based access** — `admin` and `user` roles with route-level enforcement
- **OTP email login** — passwordless login via 6-digit code; enumeration-safe (same response whether email exists or not)
- **Session timeout warning** — toast notification appears 2 minutes before JWT expiry with a countdown timer and "Stay logged in" button that silently refreshes the session
- **Password change** — self-service password change for all users, rate-limited to 5 attempts per 15 minutes
- **Audit log** — full trail of all admin and user actions with filters
- **Reports** — date-range reports with filters, 25-record pagination, export to Excel
- **Dashboard** — weekly summary (regular/OT hours, present days, submitted/not-submitted counts) with Sat–Fri navigation
- **Users** — search + role filter, activate/deactivate, department and vendor ID fields
- **Branding** — upload a custom logo (sidebar) and favicon (browser tab) from admin Settings
- **Mobile responsive** — hamburger sidebar, responsive grids on all pages
- **SMTP settings** — configurable email server via admin UI with test-send to any address
- **First-run setup** — creates admin account on fresh deploy; setup page is permanently blocked after first user
- **Health check** — `GET /api/health` returns DB connectivity status; suitable for load balancer probes
- **Startup validation** — backend exits immediately with a clear error if required environment variables are missing

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
1. Pull `postgres:16-alpine` and `nginx:stable-alpine` base images
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

> Password change is also rate-limited (hardcoded: 5 attempts per 15 minutes).

### HTTPS / Security headers

| Variable | Default | Description |
|---|---|---|
| `HSTS_MAX_AGE` | `0` | HSTS `max-age` in seconds — set to `31536000` once HTTPS is live |

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
| `signatures` | Signature pad data (stored as base64) |
| `smtp_settings` | Email server configuration |
| `otp_tokens` | One-time password tokens |
| `audit_logs` | Full activity trail |
| `app_settings` | Key/value store — holds branding assets (logo, favicon) |

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

Each period has **two separate timesheets**:

| Period | Days | Notes |
|---|---|---|
| Weekday | Mon – Fri | Required; all 5 days must be logged before signing |
| Weekend | Sat – Sun | Optional; any logged day unlocks the sign button |

1. Employee logs attendance records for each day
2. Employee signs and submits each timesheet with a signature → status: `submitted`
3. Admin exports the report → timesheets become `signed` (locked, read-only)

The sign-off tab shows a badge with the count of unsigned periods across the last 4 weeks.

---

## Branding

Admins can upload a custom logo and favicon from **Settings → Branding**:

- **Sidebar Logo** — replaces the default building icon in the sidebar and mobile top bar. Supported formats: PNG, SVG, WebP, GIF, JPEG. Max 5 MB.
- **Favicon** — shown in the browser tab. Supported formats: PNG, WebP, SVG. Max 1 MB. Use a square image for best results.

Both assets are stored in the database and served via `GET /api/branding` (no login required), so the logo and favicon appear on the login page too. Removing an asset and saving reverts to the built-in default icon.

---

## Security

| Area | Detail |
|---|---|
| Auth tokens | JWT stored in `httpOnly`, `sameSite=strict` cookies — not accessible to JavaScript |
| Session expiry | Configurable via `JWT_EXPIRY_HOURS` (default 8 h); frontend warns 2 min before expiry |
| Session refresh | `POST /auth/refresh` issues a new token and cookie without re-login |
| Login brute-force | Rate-limited (default: 10 attempts / 15 min, configurable) |
| OTP brute-force | Rate-limited (default: 3 requests / 60 s, configurable) |
| OTP enumeration | `send-otp` returns the same message whether the email exists or not |
| Password change | Rate-limited to 5 attempts per 15 minutes |
| Security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy set by nginx |
| HSTS | Disabled by default; set `HSTS_MAX_AGE=31536000` once HTTPS is live |

---

## HTTPS / Production Deployment

The nginx container serves HTTP on port 8080 internally, mapped to your `APP_PORT` (default 80). For production:

1. Place a reverse proxy (Cloudflare, AWS ALB, nginx-proxy-manager, Traefik) in front
2. Terminate TLS at the proxy
3. Set `CORS_ORIGIN=https://yourdomain.com` in `.env`
4. Set `COOKIE_SECURE=true` in `.env`
5. Set `HSTS_MAX_AGE=31536000` in `.env`
6. `docker compose up -d` — no rebuild needed for env-only changes

---

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── routes/           # API route handlers
│   │   │   ├── auth.ts       # OTP login, rate limiting
│   │   │   ├── attendance.ts # Daily records CRUD
│   │   │   ├── timesheets.ts # Timesheet lifecycle
│   │   │   ├── signatures.ts # Signature storage
│   │   │   ├── users.ts      # User management
│   │   │   ├── export.ts     # Excel export
│   │   │   ├── audit.ts      # Audit log
│   │   │   ├── settings.ts   # SMTP + branding
│   │   │   └── setup.ts      # First-run setup
│   │   ├── middleware/        # Auth, role checks
│   │   ├── services/          # Email, audit logging
│   │   ├── database/          # DB pool, schema init
│   │   └── utils/
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/             # React pages (Dashboard, Attendance, Reports, …)
│   │   ├── components/        # Layout, SignaturePad, SessionTimeoutWarning, …
│   │   ├── context/           # AuthContext (session + expiresAt), BrandingContext
│   │   └── api/               # Axios client
│   ├── nginx.conf.template    # nginx config (envsubst at runtime)
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

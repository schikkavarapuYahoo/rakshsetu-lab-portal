# RakshSetu Lab Portal

SaaS lab management portal for small Indian labs — patient registration,
multi-test visit workflow, result entry, PDF generation, billing, and an
admin console for the RakshSetu team to onboard and manage labs.

Built on **Next.js 16** (App Router), **Firebase** (Firestore + Auth +
Storage), and **Tailwind v4**. State managed with **Zustand** on the
client and the **Firebase Admin SDK** on the server.

## Quick start (local development)

You'll need: Node 20+, Docker Desktop, and npm.

```bash
# 1. Install deps
npm install

# 2. Set the session secret (any 32+ char random string)
cp .env.local.example .env.local
# then edit .env.local — set JWT_SECRET

# 3. Boot the Firebase emulator (one-time Docker build, ~30s)
npm run emu:up

# 4. Seed the emulator with a demo lab + demo data
npm run emu:seed

# 5. Run the dev server pointed at the emulator
npm run dev:emu
```

Open http://localhost:3000 and log in:

| Surface | Credentials |
|---|---|
| Lab portal (`/login`) | `RAKSHDEMO` / `1234` |
| Admin console (`/staff-login`) | `admin@rakshsetu.com` / `admin1234` |

## Architecture

```
src/
  app/                     # Next.js App Router
    api/                   # Server routes — all auth-gated
      auth/                # login, logout, me, change-pin, change-password
      patients/            # GET list, POST create, [id] PATCH update
      lab-reports/         # GET list, POST create, [id] PATCH/DELETE
      lab-settings/        # GET/POST lab profile
      billing/             # balance, ledger, topup
      admin/               # labs CRUD, billing controls, staff
      draft-batch/         # multi-test cart (source-ported)
    (pages)                # Lab portal + admin UI
  components/
    admin/ common/ data/ layout/ reports/ settings/ ui/
  config/                  # nav, master test catalog
  hooks/                   # React hooks
  lib/
    stores/                # Zustand stores — hydrate from API at boot
    utils/                 # paise, blood-group, auto-formulas, etc.
    validators/            # Zod schemas
  server/
    auth/                  # session.ts (JWT), throttle.ts
    audit/                 # audit log writer
    billing/               # subscription state engine
    patients/              # resolveOrCreatePatient
    firebase-admin.ts      # Admin SDK singleton
    limits.ts              # shared validation + pagination constants

scripts/                   # CLI tools (tsx)
  seed-emulator.ts         # Seed demo data into the emulator
  wipe-data.ts             # Drop demo data, keep lab + admin docs
  provision-lab.ts         # Create a new lab (CLI alternative to admin UI)
  rotate-pin.ts            # Emergency PIN reset

docker/                    # Firebase emulator container
```

## Data model

Multi-tenant Firestore schema:

| Collection | Purpose |
|---|---|
| `labs/{labId}` | Lab account — name, address, signatory, pin hash, subscription, atomic counters |
| `staff/{staffId}` | RakshSetu admin/rep staff |
| `users/{uid}` | Patients — phone is the global identity; lab-scoped patient code lives under `lab_patient_codes` |
| `lab_reports/{reportId}` | Reports with denormalised patient/lab snapshots, 5-stage status pipeline |
| `lab_report_batches/{batchId}` | Visit-level groupings of multiple reports |
| `credit_ledger`, `payments`, `subscription_history` | Billing audit trails |

IDs the user sees (server-allocated, atomic, never reset):
- **Patient code**: `P10001`, `P10002`, …
- **Report code**: `R10001`, `R10002`, …
- **Sample ID**: `S{report-code}` by default (`S10001`)

## Authentication

Two-tier session model — see [src/server/auth/session.ts](src/server/auth/session.ts):

- **Lab login** (`POST /api/auth/login`): lab code + PIN against `labs/{id}`. Bcrypt comparison, IP-throttled (5 fails → 15 min lockout).
- **Staff login** (`POST /api/auth/staff-login`): email + password against `staff/{id}`. Same throttling.

Sessions are JWTs in an `HttpOnly` `rs_lab_session` cookie. The
[src/proxy.ts](src/proxy.ts) middleware gates every non-public route.
If `JWT_SECRET` is unset or `< 32` chars, the proxy bypasses auth (dev
escape hatch — never set this in prod).

## Common commands

```bash
# Dev
npm run dev               # plain dev server (no emulator)
npm run dev:emu           # dev server pointed at the emulator

# Emulator lifecycle
npm run emu:up            # build + start
npm run emu:down          # graceful stop — exports .emu-data
npm run emu:reset         # nuke .emu-data and rebuild
npm run emu:logs          # tail container logs
npm run emu:seed          # seed demo data
npm run emu:wipe          # drop demo data, keep lab + admin

# Ops (work against the emulator OR real Firebase)
npm run ops:provision-lab -- --name "Lab" --code "MUM01" --pin "secret123"
npm run ops:rotate-pin    -- --code "MUM01" --pin "newsecret"

# Quality
npm run lint
npx tsc --noEmit
npm run build             # production build
```

## Deployment

See [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) for the full pre-flight,
deploy, and post-deploy steps. Short version: push to your branch,
Vercel builds, env vars (`JWT_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`) live in the Vercel dashboard.

## Project documents

- [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) — deploy + go-live procedure
- [AGENTS.md](AGENTS.md) — agent / IDE-assistant instructions
- [.env.local.example](.env.local.example) — env template

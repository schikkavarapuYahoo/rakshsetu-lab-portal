# Launch Runbook — Demo + Pilot

What you have, what's wired to Firestore, and the three things to do
before a real lab uses this.

## What's persisted (multi-device, survives reload, survives device switch)

| Surface | Storage | Status |
|---|---|---|
| Lab login (`/api/auth/login`) | `labs/{labId}` doc | ✅ |
| Staff login (`/api/auth/staff-login`) | `staff/{staffId}` doc | ✅ |
| Identity in audit timeline | JWT session → `useAuthStore.hydrateFromAPI()` | ✅ |
| Patient registration | `users/{uid}` doc + `labs/{lab}.patient_code_counter` | ✅ |
| Patient edit (name, phone, vitals…) | `PATCH /api/patients/[id]` | ✅ |
| Report creation | `lab_reports/{reportId}` doc + `labs/{lab}.report_code_counter` | ✅ |
| Sample collection / status transitions | `PATCH /api/lab-reports/[id]` (fire-and-forget) | ✅ |
| Result entry / critical ack | same | ✅ |
| Publish / send-to-patient | same | ✅ |
| Record payment / refund | same | ✅ |
| Cancel report (soft delete) | `DELETE /api/lab-reports/[id]` | ✅ |
| Lab profile (letterhead, signatory, NABL #, GSTIN, WhatsApp template) | `labs/{labId}` doc fields | ✅ |
| Admin console (Onboard / Labs list / Staff) | `labs/`, `staff/` collections | ✅ |

## What's still localStorage (acceptable for a 1-day pilot)

These will NOT survive a browser cache clear or sync across devices.
For a single-lab single-device pilot they're fine because the lab
configures them once on day one and doesn't touch them again.

| Surface | Why deferred | Impact if not fixed |
|---|---|---|
| Test catalog enable/disable | One-time setup per lab | If they clear cache, they re-enable from the master library (1 min) |
| Test catalog prices | Same | They re-enter prices (5 min) |
| Billing top-ups (`/billing`) | Demo mode only; no real Razorpay | They see ₹0 balance; not blocking |

## ──────────────────────────────────────────────────────────────
## Pre-flight — do BEFORE every prod deploy
## ──────────────────────────────────────────────────────────────

These four checks were lifted from the source repo's deploy runbook
([DEPLOY_RUNBOOK.md](../../bitbucket/rakshsetu_lab_portal/DEPLOY_RUNBOOK.md))
where they're written from hard experience. Run them every time, not
just the first push.

### Build clean locally before pushing

```bash
rm -rf .next node_modules
npm install
npm run build
```

If `npm run build` fails on your machine, it WILL fail on Vercel's —
and you'll lose 2-3 minutes per cycle waiting for Vercel to confirm
what you already knew. Fix locally, then push. If lint complains,
fix the lint. If the type check fails, fix the type. Don't push
"hopefully Vercel will be more lenient" code.

### Back up `firestore.rules` before changing them

```bash
cp firestore.rules firestore.rules.backup-$(date +%Y%m%d)
cp storage.rules storage.rules.backup-$(date +%Y%m%d)
```

Rollback is then one command:
```bash
cp firestore.rules.backup-YYYYMMDD firestore.rules
firebase deploy --only firestore:rules
```

### Verify which Firebase project you're pointed at

```bash
firebase projects:list
firebase use
```

The current project should be the one you intend to deploy to. If
you accidentally have a staging project active and deploy rules,
you'll wonder later why prod rules didn't update.

### Confirm credentials are in place

- Firebase CLI logged in (`firebase login`)
- Vercel CLI logged in (`vercel login`) OR direct dashboard access
- Git push access to your repo
- Service account JSON saved somewhere safe (you'll paste it into
  Vercel's env vars once; lose it and you re-generate)

## ──────────────────────────────────────────────────────────────
## Before any lab uses this — THREE STEPS
## ──────────────────────────────────────────────────────────────

### 1. Pick where you're hosting

#### Option A — Laptop pilot (1 day, you supervise)
- Keep the Docker emulator running on your machine. Disable Mac sleep.
- Tell pilot lab to hit `http://<your-ip>:3000`. Make sure both
  machines are on the same LAN.
- When done at end of day: `npm run emu:down` (NOT `docker stop`)
  to checkpoint `.emu-data/` to disk.

  **WARNING:** If you forget that `npm run emu:down` step or your
  laptop force-restarts, you lose every patient and report. Twice
  today we already saw this happen — `.emu-data` is only flushed on
  a clean shutdown.

#### Option B — Real Firebase (recommended even for the 1-day pilot)

Already in the repo:
- [vercel.json](vercel.json) pins the function region to `bom1` (Mumbai)
  so latency is good for Indian labs. Vercel picks this up automatically.

Steps:
1. https://console.firebase.google.com → create project
2. Project Settings → Service accounts → "Generate new private key"
3. Save the JSON to a private location
4. Replace `.env.local`:
   ```env
   JWT_SECRET=<your-existing-secret>
   FIREBASE_SERVICE_ACCOUNT_PATH=/abs/path/to/serviceAccountKey.json
   # remove the FIRESTORE_EMULATOR_HOST line — admin SDK will route to real Firebase
   ```
5. Use the regular `next dev` script (not `dev:emu`) — or deploy to
   Vercel:
   ```
   vercel --prod
   ```
   then paste `FIREBASE_SERVICE_ACCOUNT_JSON` (one-line) +
   `JWT_SECRET` as env vars in Vercel project settings.
6. Run the seed against the real project to provision the lab + admin
   (or use `/admin/labs/new` UI). Adjust `FIRESTORE_EMULATOR_HOST` out
   first.

### CLI ops scripts (available for both emulator and real Firebase)

Two scripts let you provision labs and rotate PINs without going
through the admin UI — useful for batch ops, scripted deploys, and
recovery when the admin UI is unreachable. Both work against the
emulator (`FIRESTORE_EMULATOR_HOST` set) or real Firebase
(`FIREBASE_SERVICE_ACCOUNT_PATH` or `_JSON` set).

```bash
# Create a new lab (real Firebase, assuming env vars are set):
npm run ops:provision-lab -- \
  --name "ABC Diagnostics" \
  --code "MUM7K2" \
  --pin "ChooseAStrongPin" \
  --phone "+91 98765 43210" \
  --email "owner@abcdiag.com"

# Rotate a lab's PIN (emergency reset):
npm run ops:rotate-pin -- --code "MUM7K2" --pin "newPinHere"
```

The old PIN stops working immediately after rotation. Both scripts
print the new credentials once and then exit — never logged anywhere.

### 2. Change the demo PIN before anyone outside knows it

The seeded lab login (`RAKSHDEMO` / `1234`) was for development. For
the pilot lab:

**Path A (provision a real lab):** Go to `/staff-login`, sign in as
`admin@rakshsetu.com` / `admin1234`, then `/admin/labs/new` — set
the pilot lab's code, name, and a strong PIN (≥ 6 chars). The PIN is
bcrypt-hashed at write time, so it never lands in any log.

**Path B (just rotate the demo lab's PIN):** Have the pilot lab sign
in with `RAKSHDEMO`/`1234` once, then go to Settings → Change PIN.
The `POST /api/auth/change-pin` route validates the current PIN,
re-hashes with bcrypt-12, writes to `labs/{id}.pin_hash`.

ALSO change the staff admin password (`admin1234` is in this file —
not OK in production):
```
curl -X POST $YOUR_URL/api/auth/staff-login ...   # log in
curl -X POST $YOUR_URL/api/auth/change-password ...  # rotate
```

### 3. Tighten Firestore rules before going to real Firebase

`firestore.rules` is currently `allow read, write: if true`. This
doesn't matter on the emulator and doesn't matter to our API routes
(they use Admin SDK which bypasses rules), BUT once you deploy to
real Firebase the public API key is in the browser — anyone can
read/write Firestore directly with that key.

Minimum acceptable rules before real deployment:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Block ALL client SDK access. Everything goes through API routes
    // which use the Admin SDK and don't need rules.
    match /{document=**} { allow read, write: if false; }
  }
}
```

Same `storage.rules` — until any feature actually uses the browser
Firebase Storage SDK, deny everything.

## ──────────────────────────────────────────────────────────────
## Smoke test (run this once before letting the lab in)
## ──────────────────────────────────────────────────────────────

1. Open `/login`, sign in with the lab's new PIN
2. Sidebar → Register Patient → enter a real patient → Confirm `P10001`
3. Quick Actions → New Report → pick the patient → pick CBC → tick
   "patient agreed" → Create report → Confirm `R10001`
4. Click Collect Sample → Mark Collected
5. Click Start Testing
6. Fill all 5 result values, click "Save & send for review"
7. Click Publish Report
8. Click Record payment → Save payment
9. **Click Print / PDF** — confirm the PDF has the right lab name,
    address, signatory from Settings → Lab profile
10. Reload the page — every state still there

If any step fails: stop, fix it, don't ship.

## ──────────────────────────────────────────────────────────────
## During the pilot — watch list
## ──────────────────────────────────────────────────────────────

- **Audit timeline attribution**: every new entry should say the lab
  name, not "Siddu (Demo)". The first two entries on the very first
  report you walked through today will still show "Siddu (Demo)"
  because they were created before the auth sync was wired —
  cosmetic, won't recur.
- **Network errors during writes**: if a PATCH (status transition,
  result save, payment) fails, the UI doesn't toast — local state
  shows the change but it didn't persist. Reload reconciles. For
  pilot, the lab won't notice if their wifi is solid.
- **Patient code collisions across devices**: shouldn't happen — the
  counter is atomically incremented in a Firestore transaction. If
  you see two patients with the same code, that's a bug to file.

## ──────────────────────────────────────────────────────────────
## Known operational gaps — accept or address before scaling
## ──────────────────────────────────────────────────────────────

These are real, currently unaddressed. None block a 1-day pilot; all
matter once you go past it.

### No automatic backups on Firebase Spark (free) plan

Point-in-time recovery is **Blaze plan only**. If pilot lab data gets
corrupted or accidentally deleted, you have no rollback. For a 1-day
pilot the risk is acceptable. For anything ongoing, upgrade to Blaze
— it's pay-as-you-go and your pilot volume will cost well under $1/mo
beyond the free tier.

How to address:
1. Firebase Console → "Modify plan" → Blaze
2. Set a billing alert at $5/mo so a runaway query can't blindside you
3. Firestore → Backups → schedule daily exports to a GCS bucket

### No error tracking on prod

If something explodes in a Vercel function, you see it in Vercel's
log dashboard but only for the last hour or so without a paid plan.
Source repo wires Sentry; we don't.

For pilot, your visibility is "if a lab calls and says something's
broken, you SSH into Vercel logs in real time." Acceptable but
limited. To add later:
1. Create Sentry project (free tier covers small volume)
2. `npm install @sentry/nextjs && npx sentry-wizard@latest -i nextjs`
3. Set `SENTRY_DSN` in Vercel env vars

### Lab profile is empty for a fresh lab

First PDF a new lab prints will say the seeded "RakshSetu Demo Lab"
(if you ran the seed against prod) or be blank (if you provisioned
fresh via `/admin/labs/new`). Either way, walk the pilot lab through
Settings → Lab profile on day one before they print anything they
intend to give a patient.

### Audit attribution for actions BEFORE first page load

A user who logs in but acts faster than `hydrateFromAPI()` completes
will have those very first actions attributed to "Siddu (Demo)" in
the audit timeline. Sub-second window; not visible in normal use.

### Multi-tab concurrent edit

If a tech opens the same report in two tabs and edits in both, the
fire-and-forget PATCH means last-write-wins silently. No conflict
detection. Real LIS systems handle this; we don't yet. Tell pilot
techs not to do it.

## ──────────────────────────────────────────────────────────────
## After the pilot — gaps to close
## ──────────────────────────────────────────────────────────────

In rough priority order:
1. Test catalog persistence to Firestore (currently localStorage)
2. Real Razorpay top-up integration (currently demo-mode order ids)
3. WhatsApp delivery (currently shell UI only)
4. Multi-test visit editor → use `POST /api/draft-batch/submit`
   instead of N sequential `POST /api/lab-reports` calls (atomic per visit)
5. Audit-log writes from the new lab-reports + patients routes
   (currently only the source-ported routes do this)
6. Firestore rules for browser SDK use (when/if added)

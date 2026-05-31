import 'server-only';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

/**
 * Session management using HTTP-only cookies signed with HS256 JWT.
 *
 * Two distinct user types share this session:
 *   1. Lab users — log in with lab_code + PIN. Role = 'lab'.
 *   2. Staff users (your reps + you) — log in with email + password.
 *      Roles = 'rep' (field sales) or 'admin' (you).
 *
 * Why HTTP-only cookie?
 *   - Inaccessible to JavaScript (mitigates XSS-based session theft)
 *   - Auto-sent with every request to same origin
 *   - SameSite=Lax prevents CSRF for state-changing GET requests
 *
 * Why JWT not random session ID?
 *   - Stateless validation (no DB lookup per request)
 *   - Token contains role + scoped IDs, expiry, issued-at timestamp
 *   - Can't be tampered (HS256 signature)
 *
 * Tradeoff: can't revoke tokens before expiry without a token blocklist.
 * Mitigation: short expiry (8 hours), force re-login on password change,
 * sensitive actions verify role server-side from DB on every request.
 */

const SESSION_COOKIE = 'rs_lab_session';
const SESSION_HOURS = parseInt(process.env.SESSION_HOURS || '8', 10);

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET env var missing or too short (min 32 chars). ' +
      'Generate with: openssl rand -base64 64'
    );
  }
  return new TextEncoder().encode(secret);
}

export type UserRole = 'lab' | 'rep' | 'admin';

// Note: we deliberately do NOT extend JWTPayload here. JWTPayload has
// an index signature [propName: string]: unknown which propagates
// down to every field on extended interfaces and makes session.lab_name
// resolve to `unknown` instead of `string` at use sites. The cast in
// getSession() (`payload as SessionPayload`) bridges from the
// jwtVerify result (JWTPayload) to our explicit shape.
export interface BaseSessionPayload {
  role: UserRole;
}

/** Per-staff role within a lab. Determines what they can see/do inside the lab portal. */
export type LabStaffRole = 'owner' | 'admin' | 'technician';

export interface LabSessionPayload extends BaseSessionPayload {
  role: 'lab';
  /** Lab tenant identity */
  lab_id: string;
  lab_code: string;
  lab_name: string;
  /** Per-user identity inside the lab — used for audit attribution
   *  and role-based UI. Added in the multi-user rollout (May 2026). */
  staff_id: string;
  staff_email: string;
  staff_display_name: string;
  staff_role: LabStaffRole;
}

export interface StaffSessionPayload extends BaseSessionPayload {
  role: 'rep' | 'admin';
  staff_id: string;
  email: string;
  display_name: string;
}

export type SessionPayload = LabSessionPayload | StaffSessionPayload;

/** Creates and sets the session cookie for a LAB. */
export async function createLabSession(payload: {
  lab_id: string;
  lab_code: string;
  lab_name: string;
  staff_id: string;
  staff_email: string;
  staff_display_name: string;
  staff_role: LabStaffRole;
}) {
  await issueCookie({
    role: 'lab',
    lab_id: payload.lab_id,
    lab_code: payload.lab_code,
    lab_name: payload.lab_name,
    staff_id: payload.staff_id,
    staff_email: payload.staff_email,
    staff_display_name: payload.staff_display_name,
    staff_role: payload.staff_role,
  });
}

/** Creates and sets the session cookie for a STAFF user (rep or admin). */
export async function createStaffSession(payload: {
  staff_id: string;
  email: string;
  display_name: string;
  role: 'rep' | 'admin';
}) {
  await issueCookie({
    role: payload.role,
    staff_id: payload.staff_id,
    email: payload.email,
    display_name: payload.display_name,
  });
}

async function issueCookie(payload: Record<string, unknown>) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 60 * 60;

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .setIssuer('rakshsetu-lab-portal')
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

/** Reads + validates the session cookie. Returns null if invalid/missing. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: 'rakshsetu-lab-portal',
    });
    const role = payload.role;
    if (role !== 'lab' && role !== 'rep' && role !== 'admin') return null;
    // Two-step cast through unknown is required because TS now sees
    // JWTPayload (with its index signature) and SessionPayload (with
    // explicit fields) as non-overlapping. The role check above is
    // what actually validates the shape at runtime; this cast just
    // tells the compiler "trust the runtime check."
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Deletes the session cookie (logout). */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** Throws if not authenticated. Use in protected API routes. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

/** Throws if session is not a lab. */
export async function requireLabSession(): Promise<LabSessionPayload> {
  const session = await getSession();
  if (!session || session.role !== 'lab') throw new Error('UNAUTHORIZED');
  return session;
}

/** Throws if session is not staff (rep or admin). */
export async function requireStaffSession(): Promise<StaffSessionPayload> {
  const session = await getSession();
  if (!session || (session.role !== 'rep' && session.role !== 'admin')) {
    throw new Error('UNAUTHORIZED');
  }
  return session;
}

/** Throws if session is not admin. */
export async function requireAdminSession(): Promise<StaffSessionPayload> {
  const session = await getSession();
  if (!session || session.role !== 'admin') throw new Error('UNAUTHORIZED');
  return session as StaffSessionPayload;
}

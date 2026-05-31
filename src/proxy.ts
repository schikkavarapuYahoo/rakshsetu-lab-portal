// Next 16 renamed `middleware` → `proxy`. Same runtime, same matcher
// semantics; the entry-point filename + export name changed. Ported
// from the source project's `src/middleware.ts` verbatim except for the
// rename. Handles JWT session-cookie validation and CSP nonce on every
// non-public request.

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = new Set([
  "/login",
  "/staff-login",
  "/api/auth/login",
  "/api/auth/staff-login",
  "/api/auth/logout",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  // Root is treated as public so the marketing/landing route renders
  // pre-auth — once auth ships across the app, change this to `false`.
  if (pathname === "/") return true;
  return false;
}

async function isValidSession(token: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: "rakshsetu-lab-portal",
    });
    return true;
  } catch {
    return false;
  }
}

function buildCSP(): string {
  // We use 'unsafe-inline' 'unsafe-eval' in BOTH dev and prod because
  // the Next.js App Router emits script tags without our middleware's
  // generated nonce — `strict-dynamic` + nonce blocks every chunk and
  // leaves the page stuck on the Suspense fallback. Until next/script
  // can be wired to read the `x-nonce` request header, the auth model
  // is enforced server-side anyway (every API route uses
  // requireLabSession()), so relaxing client-side script restrictions
  // doesn't widen our blast radius meaningfully.
  const scriptSrc =
    "'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net ws://localhost:* http://localhost:*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Buffer.from(arr).toString("base64");
}

function applyCSP(
  req: NextRequest,
  res: NextResponse,
  nonce: string,
): NextResponse {
  const csp = buildCSP();
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-nonce", nonce);
  req.headers.set("x-nonce", nonce);
  return res;
}

// Auth is opt-in until JWT_SECRET is configured. This lets the existing
// zustand-backed UI keep working while we incrementally migrate to
// Firestore. Once you set JWT_SECRET in .env.local, the proxy starts
// enforcing sessions; until then, all routes pass through.
function isAuthEnforced(): boolean {
  const secret = process.env.JWT_SECRET;
  return Boolean(secret && secret.length >= 32);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = generateNonce();
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);

  // Bypass auth entirely when no session secret is configured.
  if (!isAuthEnforced()) {
    const res = NextResponse.next({ request: { headers: reqHeaders } });
    return applyCSP(req, res, nonce);
  }

  if (isPublicPath(pathname)) {
    const res = NextResponse.next({ request: { headers: reqHeaders } });
    return applyCSP(req, res, nonce);
  }

  const token = req.cookies.get("rs_lab_session")?.value;
  const valid = token ? await isValidSession(token) : false;

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      const res = NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
      return applyCSP(req, res, nonce);
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    return applyCSP(req, res, nonce);
  }

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  return applyCSP(req, res, nonce);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

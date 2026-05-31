import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSession } from '@/server/auth/session';
import { STANDARD_FORMS, getEffectivePricesForLab } from '@/lib/forms';
import { adminDb } from '@/server/firebase-admin';

export const runtime = 'nodejs';

/**
 * Catalog version — bumped on every deploy that changes STANDARD_FORMS.
 * Used as part of the ETag so browsers re-fetch when the catalog
 * structurally changes. Update this when forms_extended.ts changes
 * shape (new tests, new fields, removed tests).
 */
const CATALOG_VERSION = 'v9d2-131-forms';

/**
 * GET /api/forms
 *
 * Returns the list of available form templates. Authenticated only —
 * we don't want competitors trivially scraping our form library.
 *
 * Round 9 Session C: when called from a lab session, also includes
 * the lab's effective prices for each test (default + override
 * applied). Staff/admin sessions just see the catalog without
 * lab-specific prices.
 *
 * Round 9 Session D2: caching headers added because the catalog is
 * now ~50KB JSON (131 forms). Strategy:
 *   - private (per-lab pricing varies, can't CDN)
 *   - max-age=300 (5 min — covers a single cart session)
 *   - stale-while-revalidate=600 (10 min — show stale + refetch)
 *   - ETag = hash(CATALOG_VERSION + lab_id + pricing_overrides_count)
 *   - 304 short-circuit when client sends matching If-None-Match
 *
 * Trade-off accepted: if a lab admin updates their per-test pricing
 * mid-cart, the tech may see stale prices for up to 5 minutes. Not
 * a real problem at pilot scale — pricing updates are rare. If it
 * matters later, lab-settings can POST a cache-bust signal.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // For lab sessions, attach effective per-lab prices. One Firestore
  // read of the test_pricing subcollection (small, typically <30 docs).
  if (session.role === 'lab') {
    try {
      const prices = await getEffectivePricesForLab(adminDb(), session.lab_id);

      // Build ETag from catalog version + lab id + a stable hash of the
      // pricing map. Same inputs → same ETag → 304 Not Modified on
      // repeat requests.
      const priceFingerprint = Array.from(prices.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join(',');
      const etag = `"${createHash('sha1')
        .update(`${CATALOG_VERSION}:${session.lab_id}:${priceFingerprint}`)
        .digest('hex')
        .slice(0, 16)}"`;

      // Short-circuit: client sent matching ETag, no body needed
      const ifNoneMatch = req.headers.get('if-none-match');
      if (ifNoneMatch === etag) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            ETag: etag,
            'Cache-Control':
              'private, max-age=300, stale-while-revalidate=600',
          },
        });
      }

      const formsWithPrices = STANDARD_FORMS.map((f) => ({
        ...f,
        effective_price_paise: prices.get(f.id) ?? f.default_price_paise,
      }));

      return NextResponse.json(
        { forms: formsWithPrices },
        {
          headers: {
            ETag: etag,
            'Cache-Control':
              'private, max-age=300, stale-while-revalidate=600',
          },
        },
      );
    } catch (e) {
      // If pricing read fails, fall back to defaults — better to render
      // the catalog without per-lab prices than to crash. No caching
      // headers on the fallback so it gets re-tried fresh next time.
      console.warn('[/api/forms] price overlay failed:', e);
      return NextResponse.json({
        forms: STANDARD_FORMS.map((f) => ({
          ...f,
          effective_price_paise: f.default_price_paise,
        })),
      });
    }
  }

  // Staff/admin: just the catalog. Cacheable longer because there's
  // no per-staff personalization — same response for every staff user.
  const staffEtag = `"${CATALOG_VERSION}-staff"`;
  if (req.headers.get('if-none-match') === staffEtag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: staffEtag,
        'Cache-Control': 'private, max-age=600, stale-while-revalidate=1800',
      },
    });
  }
  return NextResponse.json(
    { forms: STANDARD_FORMS },
    {
      headers: {
        ETag: staffEtag,
        'Cache-Control': 'private, max-age=600, stale-while-revalidate=1800',
      },
    },
  );
}

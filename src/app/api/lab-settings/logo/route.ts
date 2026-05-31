import { NextRequest, NextResponse } from 'next/server';
import { requireLabSession } from '@/server/auth/session';
import { adminDb, adminStorage } from '@/server/firebase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);

/**
 * Upload a lab logo. Stored at labs/{labId}/logo.{ext} in Firebase Storage.
 * Generates a long-lived signed URL written to lab.lab_logo_url.
 *
 * Why signed URL and not a public bucket: most Firebase projects don't have
 * the storage bucket set to public-read by default, and uploadType=media
 * doesn't expose the file directly. Signed URLs work in any bucket config.
 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });
  }

  const file = formData.get('logo');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'logo file is required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 2MB)' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'unsupported image type (PNG, JPG, SVG only)' },
      { status: 400 },
    );
  }

  const ext =
    file.type === 'image/png' ? 'png' :
    file.type === 'image/jpeg' ? 'jpg' :
    'svg';
  const objectPath = `labs/${session.lab_id}/logo.${ext}`;

  try {
    const bucket = adminStorage().bucket();
    const blob = bucket.file(objectPath);
    const buffer = Buffer.from(await file.arrayBuffer());
    await blob.save(buffer, {
      contentType: file.type,
      // Cache for 1 day; logos rarely change but new uploads update the URL
      metadata: { cacheControl: 'public, max-age=86400' },
      resumable: false,
    });

    // Long-lived signed URL — works regardless of bucket public settings.
    // 100-year expiry effectively means permanent for our use case.
    const [url] = await blob.getSignedUrl({
      action: 'read',
      expires: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
    });

    // Persist on the lab doc so existing reports' lab_logo_url_at_time
    // (which copies this on submit) stays stable.
    await adminDb()
      .collection('labs')
      .doc(session.lab_id as string)
      .update({
        lab_logo_url: url,
        lab_logo_path: objectPath,
      });

    return NextResponse.json({ ok: true, logo_url: url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('logo upload failed:', msg);
    return NextResponse.json(
      { error: `upload failed: ${msg}` },
      { status: 500 },
    );
  }
}

/**
 * Remove the lab's current logo.
 */
export async function DELETE() {
  let session;
  try {
    session = await requireLabSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const labRef = adminDb().collection('labs').doc(session.lab_id as string);
    const labDoc = await labRef.get();
    const logoPath = labDoc.data()?.lab_logo_path;
    if (logoPath) {
      try {
        await adminStorage().bucket().file(logoPath).delete({ ignoreNotFound: true });
      } catch (e: unknown) {
        // Don't fail the whole operation if the file is already gone.
        const msg = e instanceof Error ? e.message : 'unknown error';
        console.warn('logo file delete warning:', msg);
      }
    }
    await labRef.update({ lab_logo_url: '', lab_logo_path: '' });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('logo remove failed:', msg);
    return NextResponse.json({ error: 'failed to remove' }, { status: 500 });
  }
}

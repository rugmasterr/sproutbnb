import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { FLAP_UPLOAD_API } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const MUTATION = `mutation Create($file: Upload!, $meta: MetadataInput!) {
  create(file: $file, meta: $meta)
}`;

const field = (fd: FormData, k: string, max = 300): string | null => {
  const v = fd.get(k);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Proxies token metadata + image to Flap's upload API (GraphQL multipart `create(file, meta)`),
 * which pins both on Flap's IPFS gateway and returns the metadata CID used as `meta` at launch.
 */
export async function POST(req: Request) {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data' }, { status: 400 });
  }
  const file = fd.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, error: 'Image is required' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'Image must be 5 MB or less' }, { status: 413 });
  if (!TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: 'Image must be PNG, JPEG, GIF or WebP' }, { status: 415 });
  }
  const creatorRaw = field(fd, 'creator', 42);
  const meta = {
    website: field(fd, 'website'),
    twitter: field(fd, 'twitter'),
    telegram: field(fd, 'telegram'),
    description: field(fd, 'description', 1000) ?? '',
    creator: creatorRaw && isAddress(creatorRaw) ? creatorRaw : '0x0000000000000000000000000000000000000000',
  };

  const out = new FormData();
  out.append('operations', JSON.stringify({ query: MUTATION, variables: { file: null, meta } }));
  out.append('map', JSON.stringify({ '0': ['variables.file'] }));
  const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  out.append('0', new File([await file.arrayBuffer()], `image.${ext}`, { type: file.type }));

  try {
    const res = await fetch(FLAP_UPLOAD_API, {
      method: 'POST',
      body: out,
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    });
    const text = await res.text();
    let j: { data?: { create?: string }; errors?: { message?: string }[] } = {};
    try {
      j = JSON.parse(text);
    } catch {
      /* non-JSON upstream response */
    }
    const cid = j?.data?.create;
    if (!res.ok || !cid) {
      const msg = j?.errors?.[0]?.message || `Flap upload failed (${res.status})`;
      return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 502 });
    }
    return NextResponse.json({ ok: true, cid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'upload error';
    return NextResponse.json({ ok: false, error: `Could not reach Flap upload API: ${msg}`.slice(0, 200) }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, info: 'POST multipart/form-data: file, description, website, twitter, telegram, creator' });
}

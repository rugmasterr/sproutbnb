import { NextResponse } from 'next/server';

export function json<T>(body: T, init?: { status?: number; maxAge?: number }) {
  const maxAge = init?.maxAge ?? 15;
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` },
  });
}

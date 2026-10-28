import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { DocPage } from '@/components/DocPage';
import { Trailer } from '@/components/DocExtras';

export const metadata: Metadata = { title: 'What is Sprout' };
export const dynamic = 'force-dynamic';

export default function Page() {
  const dir = path.join(process.cwd(), 'public', 'trailer');
  const hasVideo = existsSync(path.join(dir, 'sprout-trailer.mp4'));
  const hasPoster = existsSync(path.join(dir, 'poster.jpg'));
  return <DocPage page="about" toc={false} before={hasVideo ? <Trailer hasPoster={hasPoster} /> : undefined} />;
}

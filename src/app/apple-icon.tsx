import { ImageResponse } from 'next/og';
import { MARK_DATA_URI, OG } from '@/lib/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: OG.ink,
          backgroundImage: 'radial-gradient(circle at 50% 36%, rgba(240,185,11,0.30), rgba(7,8,10,0) 62%)',
        }}
      >
        <img src={MARK_DATA_URI} width={132} height={132} alt="" />
      </div>
    ),
    size,
  );
}

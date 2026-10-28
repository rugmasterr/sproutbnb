import { ImageResponse } from 'next/og';
import { MARK_DATA_URI } from '@/lib/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B1510' }}>
        <img src={MARK_DATA_URI} width={136} height={136} alt="" />
      </div>
    ),
    size,
  );
}

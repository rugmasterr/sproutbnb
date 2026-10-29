import { ImageResponse } from 'next/og';
import { MARK_DATA_URI, OG } from '@/lib/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Flat black field with the yellow pixel mark; 126px = 7px per grid cell.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: OG.black }}>
        <img src={MARK_DATA_URI} width={126} height={126} alt="" />
      </div>
    ),
    size,
  );
}

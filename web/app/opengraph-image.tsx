import { ImageResponse } from 'next/og';

import { BRAND, WORDMARK } from '@/lib/config';

export const alt = `${BRAND.name} — ${BRAND.category}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #082B57 0%, #041833 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 44, fontWeight: 700, letterSpacing: -1.5 }}>
          {WORDMARK.lead}
          <span style={{ color: '#34bfdc' }}>{WORDMARK.accent}</span>
          <span style={{ marginLeft: 22, fontSize: 20, letterSpacing: 4, textTransform: 'uppercase', color: '#9fb2cf', fontWeight: 600 }}>
            {BRAND.category}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02 }}>
          <span>Your health has a history.</span>
          <span style={{ color: '#34bfdc' }}>Now it has intelligence.</span>
        </div>
        <div style={{ fontSize: 28, color: '#b9c9e0' }}>{BRAND.tagline}</div>
      </div>
    ),
    size,
  );
}

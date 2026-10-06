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
          background: 'linear-gradient(135deg, #22492C 0%, #0A2215 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 44, fontWeight: 700, letterSpacing: -1.5 }}>
          {WORDMARK.lead}
          <span style={{ color: '#C9DC86' }}>{WORDMARK.accent}</span>
          <span style={{ marginLeft: 22, fontSize: 20, letterSpacing: 4, textTransform: 'uppercase', color: '#BFE0B5', fontWeight: 600 }}>
            {BRAND.category}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02 }}>
          <span>Your health has a history.</span>
          <span style={{ color: '#F2D58A' }}>Now it has intelligence.</span>
        </div>
        <div style={{ fontSize: 28, color: '#d9e6cf' }}>{BRAND.tagline}</div>
      </div>
    ),
    size,
  );
}

// The social-preview template (GitHub's "social preview" + og:image). GitHub
// has no API to set the preview image, so the operator screenshots this page at
// exactly 1280×640 and uploads it manually (Settings → General → Social
// preview); the same PNG is committed to public/og/og.png for the og:image meta
// tags. Capture: open /og.html in a 1280×640 viewport, screenshot, keep < 1MB.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';

import './styles/tokens.css';
import './styles/reset.css';
import './styles/base.css';
import './styles/og.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function OgCard() {
  return (
    <div className="og">
      <div className="og__left">
        <div className="og__brand">
          <svg className="og__mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="6" fill="#FF5A4D" />
            <path
              d="M9 11h14M9 16h10M9 21h7"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="og__word">Desk</span>
        </div>
        <p className="og__line">
          See what your agent <span className="og__accent">means.</span>
        </p>
        <p className="og__sub">
          Agents render real artifacts — you reply by pointing at the part that&rsquo;s wrong.
        </p>
        <p className="og__url">alireza29675.github.io/desk</p>
      </div>
      <div className="og__right">
        {/* og-shot.png is pre-cropped from the held frame (source x 650–1440,
            y 56–728: the diagram's service nodes, the anchor dot, and the
            COMPLETE comment+reply thread) — a cover-crop of the raw 1440×900
            frame can't hold the whole thread at this column width. Captured
            once in light (the og card has no theme toggle). */}
        <img className="og__shot" src={`${import.meta.env.BASE_URL}og/og-shot.png`} alt="" />
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <OgCard />
  </StrictMode>,
);

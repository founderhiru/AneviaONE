'use client';

import { useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';

const SRC = '/demo/aneviaone-demo-tour.mp4';
const POSTER = '/demo/aneviaone-demo-tour-poster.jpg';
const CAPTIONS = '/demo/aneviaone-demo-tour.vtt';

const TRANSCRIPT = [
  'Your health has a history. But today it lives in pieces: reports in a drawer, results in an inbox, prescriptions in a photo roll. AneviaONE brings it together.',
  'Start with a report you already have. Upload a PDF, take a photo, or share it straight from WhatsApp or Gmail. Your original is always kept.',
  'With your permission, AneviaONE reads it, and turns dates, results and units into clear, organised information. Every result links back to the page it came from. Anything uncertain is held for you to confirm.',
  'Each report joins one timeline. The same test is connected across documents and years, so your history grows with you.',
  'See what changed since your last report, and how each measure is moving over time.',
  'Before an appointment, open For Doctor. A clear one-page summary of your history, ready to share.',
  'And you’re not alone in this. Keep records for a parent or a child you care for. Or invite an adult relative to share theirs. They approve every request, and can withdraw access at any time.',
  'Your health information belongs to you. Delete a report, or your entire account, whenever you choose.',
  'AneviaONE. Every record. Every change. One intelligent health history.',
];

/**
 * "See demo tour": a button that opens the product walkthrough in a dialog.
 * The video never autoplays; the person starts it. Its captions are part of
 * the picture, so it reads with the sound off, and the sound is off until the
 * person turns it on. The full text is available below it as a transcript.
 */
export function DemoTour({ label = 'See demo tour' }: { label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [muted, setMuted] = useState(true);

  const open = () => {
    setMuted(true);
    dialog.current?.showModal();
    // Plays on open, silent; the visitor chose to open it. Reduced motion: wait for Play.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) void video.current?.play().catch(() => {});
  };
  const close = () => dialog.current?.close();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClose = () => {
      video.current?.pause();
      if (video.current) video.current.currentTime = 0;
      opener.current?.focus();
    };
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === d) d.close();
    };
    d.addEventListener('close', onClose);
    d.addEventListener('click', onBackdrop);
    return () => {
      d.removeEventListener('close', onClose);
      d.removeEventListener('click', onBackdrop);
    };
  }, []);

  return (
    <>
      <button ref={opener} type="button" className="btn btn--ghost btn--lg" onClick={open}>
        <Icon name="play" size={16} /> {label}
      </button>
      <dialog ref={dialog} className="demo" aria-label="AneviaONE demo tour">
        <div className="demo__bar">
          <p className="demo__title">AneviaONE demo tour · 1:50 · Sample data</p>
          <button type="button" className="demo__close" onClick={close} aria-label="Close demo tour">
            <Icon name="close" size={20} />
          </button>
        </div>
        <video
          ref={video}
          className="demo__video"
          src={SRC}
          poster={POSTER}
          controls
          playsInline
          preload="none"
          muted={muted}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        >
          <track kind="captions" src={CAPTIONS} srcLang="en" label="English" />
        </video>
        <div className="demo__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setMuted((m) => !m)}>
            {muted ? 'Turn sound on' : 'Turn sound off'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Skip
          </button>
        </div>
        <details className="demo__transcript">
          <summary>Read the transcript</summary>
          {TRANSCRIPT.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p className="fine">
            Sample data. AneviaONE organises your records. It does not diagnose or give treatment advice.
          </p>
        </details>
      </dialog>
    </>
  );
}

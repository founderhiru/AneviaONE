'use client';

import { useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';

const SRC = '/demo/aneviaone-demo-tour.mp4';
const POSTER = '/demo/aneviaone-demo-tour-poster.jpg';
const CAPTIONS = '/demo/aneviaone-demo-tour.vtt';

/**
 * "See demo tour": a button that opens the product walkthrough in a dialog.
 * The visitor's click starts it, with sound on; Sound off mutes it. Its captions
 * are part of the picture, so it also reads with the sound off.
 */
export function DemoTour({ label = 'See Demo' }: { label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [muted, setMuted] = useState(false);

  const open = () => {
    setMuted(false);
    dialog.current?.showModal();
    const v = video.current;
    if (!v) return;
    // The click that opened this is the visitor's own, so the browser allows sound.
    // If it still refuses, fall back to silent playback (the captions carry it).
    // Reduced motion: wait for Play.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      setMuted(true);
      void v.play().catch(() => {});
    });
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
      <dialog ref={dialog} className="demo" aria-label="AneviaONE demo">
        <div className="demo__bar">
          <p className="demo__title">AneviaONE demo · 1:50 · Sample data</p>
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
            {muted ? 'Sound on' : 'Sound off'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Skip
          </button>
        </div>
      </dialog>
    </>
  );
}

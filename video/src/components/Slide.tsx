import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, spring } from 'remotion';
import { type Scene, FPS, FADE_FRAMES } from '../scenes';

interface Props {
  scene:      Scene;
  totalFrames: number;
}

export function Slide({ scene, totalFrames }: Props) {
  const frame = useCurrentFrame();

  // Fade in / fade out
  const fadeIn  = interpolate(frame, [0, FADE_FRAMES], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [totalFrames - FADE_FRAMES, totalFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const opacity = Math.min(fadeIn, fadeOut);

  // Subtle Ken Burns zoom on screenshot
  const scale = interpolate(frame, [0, totalFrames], [1, 1.04], { extrapolateRight: 'clamp' });

  // Caption slide-up spring
  const captionY = spring({ frame, fps: FPS, delay: FADE_FRAMES, config: { damping: 18, stiffness: 90 } });
  const captionTranslate = interpolate(captionY, [0, 1], [32, 0]);

  const hasScreenshot = !!scene.screenshot;

  return (
    <AbsoluteFill style={{ opacity, background: '#080d18', fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}>

      {/* Screenshot layer */}
      {hasScreenshot ? (
        <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
          <Img
            src={staticFile(`screens/${scene.screenshot}`)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* Dark vignette overlay so captions stay readable */}
          <AbsoluteFill style={{
            background: 'linear-gradient(to top, rgba(8,13,24,0.92) 0%, rgba(8,13,24,0.3) 40%, rgba(8,13,24,0.1) 100%)',
          }} />
        </AbsoluteFill>
      ) : (
        /* Placeholder background when no screenshot yet */
        <AbsoluteFill style={{
          background: `radial-gradient(ellipse at 60% 40%, ${scene.accent}22 0%, #080d18 70%)`,
        }}>
          {/* Grid dots */}
          <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.08 }}>
            <defs>
              <pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.5" fill="#94a3b8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>
        </AbsoluteFill>
      )}

      {/* Step badge */}
      <AbsoluteFill style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', padding: '48px 64px' }}>
        <div style={{
          background: scene.accent,
          borderRadius: 999,
          padding: '6px 18px',
          fontSize: 13,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: captionY,
          boxShadow: `0 0 24px ${scene.accent}66`,
        }}>
          Amharic OCR Extractor
        </div>
      </AbsoluteFill>

      {/* Caption block — bottom */}
      <AbsoluteFill style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '0 96px 80px',
        transform: `translateY(${captionTranslate}px)`,
        opacity: captionY,
      }}>
        {/* Main caption */}
        <div style={{
          fontSize: 64,
          fontWeight: 800,
          color: '#f1f5f9',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          maxWidth: 1100,
          textShadow: '0 2px 32px rgba(0,0,0,0.8)',
        }}>
          {scene.caption}
        </div>

        {/* Sub caption */}
        {scene.sub && (
          <div style={{
            marginTop: 20,
            fontSize: 30,
            fontWeight: 400,
            color: '#94a3b8',
            maxWidth: 900,
            lineHeight: 1.4,
            textShadow: '0 1px 16px rgba(0,0,0,0.9)',
          }}>
            {scene.sub}
          </div>
        )}

        {/* Accent bar */}
        <div style={{
          marginTop: 32,
          width: 64,
          height: 4,
          borderRadius: 2,
          background: scene.accent,
          boxShadow: `0 0 16px ${scene.accent}`,
        }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

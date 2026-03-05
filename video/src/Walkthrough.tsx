import React from 'react';
import { Sequence } from 'remotion';
import { Slide } from './components/Slide';
import { SCENES, FPS, FADE_FRAMES } from './scenes';

export function Walkthrough() {
  let offset = 0;

  return (
    <>
      {SCENES.map((scene) => {
        const durationFrames = scene.durationSec * FPS;
        const seq = (
          <Sequence
            key={scene.id}
            from={offset}
            durationInFrames={durationFrames + FADE_FRAMES}
          >
            <Slide scene={scene} totalFrames={durationFrames + FADE_FRAMES} />
          </Sequence>
        );
        offset += durationFrames;
        return seq;
      })}
    </>
  );
}

export function totalDurationFrames(): number {
  const lastScene = SCENES[SCENES.length - 1];
  return SCENES.reduce((acc, s) => acc + s.durationSec * FPS, 0) + lastScene.durationSec * FPS;
}

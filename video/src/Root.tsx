import React from 'react';
import { Composition } from 'remotion';
import { Walkthrough } from './Walkthrough';
import { SCENES, FPS, WIDTH, HEIGHT, FADE_FRAMES } from './scenes';

const totalFrames = SCENES.reduce((acc, s) => acc + s.durationSec * FPS, 0) + FADE_FRAMES;

export function RemotionRoot() {
  return (
    <Composition
      id="Walkthrough"
      component={Walkthrough}
      durationInFrames={totalFrames}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}

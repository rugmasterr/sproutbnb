import React from 'react';
import { Composition } from 'remotion';
import { Trailer } from './Trailer';
import { FPS, TOTAL } from './theme';

export const Root: React.FC = () => (
  <>
    <Composition id="SproutTrailer" component={Trailer} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="SproutTrailerVertical" component={Trailer} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
  </>
);

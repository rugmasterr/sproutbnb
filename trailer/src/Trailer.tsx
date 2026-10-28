import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, SCENES, TOTAL } from './theme';
import { DistantBamboo, Finish, InkBackground, Rain, clamp } from './components';
import { SceneCashOut, SceneEnd, SceneFees, SceneGrow, SceneGrove, SceneLaunch, SceneRain, SceneStages, SceneWallet } from './scenes';

const XF = 15; // crossfade frames

const Fade: React.FC<{ dur: number; first?: boolean; last?: boolean; children: React.ReactNode }> = ({ dur, first, last, children }) => {
  const frame = useCurrentFrame();
  const fin = first ? 1 : interpolate(frame, [0, XF], [0, 1], clamp);
  const fout = last ? 1 : interpolate(frame, [dur - XF, dur], [1, 0], clamp);
  return <AbsoluteFill style={{ opacity: Math.min(fin, fout) }}>{children}</AbsoluteFill>;
};

const list: [keyof typeof SCENES, React.FC][] = [
  ['rain', SceneRain],
  ['grow', SceneGrow],
  ['wallet', SceneWallet],
  ['launch', SceneLaunch],
  ['fees', SceneFees],
  ['stages', SceneStages],
  ['cashout', SceneCashOut],
  ['grove', SceneGrove],
  ['end', SceneEnd],
];

export const Trailer: React.FC = () => {
  const frame = useCurrentFrame();
  const rain = interpolate(frame, [0, 20, 120, 180, 1260, 1320], [0.6, 1, 1, 0.14, 0.14, 0.3], clamp);
  const bamboo = interpolate(frame, [0, 120, 160, 1150, 1200, 1300], [0.5, 0.6, 1, 1, 0.5, 0.9], clamp);
  const black = interpolate(frame, [0, 12, TOTAL - 18, TOTAL - 1], [1, 0, 0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <InkBackground />
      <DistantBamboo opacity={bamboo} />
      {list.map(([key, Comp], i) => {
        const [from, dur] = SCENES[key];
        return (
          <Sequence key={key} from={from} durationInFrames={dur} name={key}>
            <Fade dur={dur} first={i === 0} last={i === list.length - 1}>
              <Comp />
            </Fade>
          </Sequence>
        );
      })}
      <Rain intensity={rain} />
      <Finish />
      <AbsoluteFill style={{ background: '#000', opacity: black }} />
      <Audio src={staticFile('sprout-score.wav')} volume={(f) => interpolate(f, [0, 8, TOTAL - 30, TOTAL], [0, 1, 1, 0], clamp)} />
    </AbsoluteFill>
  );
};

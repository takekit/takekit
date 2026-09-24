import React from 'react';
import {Composition} from 'remotion';
import {BEATS} from './beats';
import {FontGate} from './kit/fonts';
import {BeatFitCtx, BeatId} from './kit/Stage';
import {FPS, H, STAGE_B_FIT_DEFAULT, STAGE_SHIFT, W} from './kit/tokens';
import type {BeatSpec, MotionJob} from './spec';
import job from './project/beats.json';

const metaOf = Object.fromEntries(((job as MotionJob).beats || []).map((b) => [b.id, b]));

const Gate: React.FC<{id: string; children: React.ReactNode}> = ({id, children}) => {
  const spec = metaOf[id] as BeatSpec | undefined;
  const palco = spec?.palco ?? 'B';
  const fit = spec?.fit ?? (palco === 'B' ? STAGE_B_FIT_DEFAULT : {shift: STAGE_SHIFT.C, scale: 1});
  return (
    <FontGate>
      <BeatId.Provider value={id}>
        <BeatFitCtx.Provider value={fit}>{children}</BeatFitCtx.Provider>
      </BeatId.Provider>
    </FontGate>
  );
};

export const RemotionRoot: React.FC = () => (
  <>
    {BEATS.map(({id, Comp}) => (
      <Composition
        key={id}
        id={id}
        component={() => (
          <Gate id={id}>
            <Comp />
          </Gate>
        )}
        durationInFrames={metaOf[id]?.frames ?? 30}
        fps={FPS}
        width={W}
        height={H}
      />
    ))}
  </>
);

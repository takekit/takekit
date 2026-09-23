import React from 'react';
import {Composition} from 'remotion';
import {BEATS} from './beats';
import {FontGate} from './kit/fonts';
import {BeatId} from './kit/Stage';
import {BEAT_FRAMES, FPS, H, W} from './kit/tokens';

/**
 * Uma composição por beat B/C. A duração é a de `cuts.json` — o beat não escolhe
 * quanto tempo tem, porque o corte já está fechado na timeline do Resolve.
 * Sem fundo declarado aqui de propósito: o palco B precisa sair com alfa.
 */
const Gate: React.FC<{children: React.ReactNode}> = ({children}) => (
  <FontGate>{children}</FontGate>
);

export const RemotionRoot: React.FC = () => (
  <>
    {BEATS.map(({id, Comp}) => (
      <Composition
        key={id}
        id={id}
        component={() => (
          <Gate>
            {/* o palco B precisa saber qual beat é para achar o encaixe medido */}
            <BeatId.Provider value={id}>
              <Comp />
            </BeatId.Provider>
          </Gate>
        )}
        durationInFrames={BEAT_FRAMES[id]}
        fps={FPS}
        width={W}
        height={H}
      />
    ))}
  </>
);

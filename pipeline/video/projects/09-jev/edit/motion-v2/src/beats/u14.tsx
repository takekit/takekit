import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {curve, fadeIn, progress} from '../kit/curve';
import {sans} from '../kit/fonts';
import {Enter, driftAmbient, driftHero, driftSupport, vertical} from '../kit/motion';
import {StageB} from '../kit/Stage';
import {ALPHA, COL, MOTION, PALETTE, EYEBROW, TYPE} from '../kit/tokens';
import {Eyebrow, NumericSlots, Rule} from '../kit/ui';

/**
 * u14 — palco B, 57 f.
 *
 * O número é o tempo. Um mostrador real corre de 1,00 para 0,50 e trava — não é
 * um texto "0,50 s" parado. A barra embaixo é o mesmo valor desenhado como
 * duração: ela esvazia junto com o contador, porque as duas leituras saem do
 * MESMO relógio e não têm como discordar.
 *
 * O contador desacelera ao chegar: os centésimos caem rápido no começo e ~1 por
 * frame perto do fim, então o pouso em 0,50 fica visível antes de acontecer. O
 * valor trava em f48; o transform não — tudo segue derivando até o corte.
 */

const ENTRADA = -5;
/** o valor trava aqui: a última novidade do beat (57 − tail 8,55 = 48,45) */
const TRAVA = 48;

const VALOR = curve([
  [0, 1.0],
  [10, 0.84],
  [26, 0.64],
  [40, 0.535],
  [TRAVA, 0.5],
]);

const formata = (v: number) => v.toFixed(2).replace('.', ',');

const MOSTRADOR_Y = 176;
const BARRA_Y = 496;

export const U14: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();

  const valor = VALOR(Math.min(frame, TRAVA));
  // arredonda para centésimos antes da barra: o que a barra mostra é o que o
  // mostrador diz, não um valor mais preciso que ele
  const lido = Math.round(valor * 100) / 100;
  const trava = fadeIn(frame, TRAVA, MOTION.micro);
  const cabecalho = fadeIn(frame, -5, 12);
  const escreve = progress(frame, {start: -2, enter: MOTION.micro, duration, ease: 'pop'});

  return (
    <StageB>
      {/* camada ambiente: o que está sendo medido */}
      <Enter frame={frame} duration={duration} start={-5} enter={1} driftRate={driftAmbient}>
        <div style={{position: 'absolute', left: COL.x, top: EYEBROW.B, opacity: cabecalho}}>
          <Eyebrow>Tempo de resposta</Eyebrow>
        </div>
        <Rule
          w={COL.w}
          t={1.5}
          color={ALPHA.rule}
          draw={escreve.s}
          style={{position: 'absolute', left: COL.x, top: 150}}
        />
      </Enter>

      {/* herói: o mostrador. Slots fixos, senão o "1" estreito faz a linha andar */}
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterHero}
        from={{y: MOTION.travel.hero, scale: 0.93, opacity: 0}}
        driftRate={driftHero}
        fade={8}
        style={{
          position: 'absolute',
          left: COL.x,
          top: MOSTRADOR_Y,
          display: 'flex',
          alignItems: 'baseline',
          gap: 18,
        }}
      >
        <NumericSlots text={formata(lido)} size={TYPE.heroNumber} color={PALETTE.ink} edge="right" />
        <div
          style={{
            fontFamily: sans,
            fontWeight: 800,
            fontSize: TYPE.unit,
            color: PALETTE.muted,
            lineHeight: 1,
          }}
        >
          s
        </div>
      </Enter>

      {/* a mesma grandeza como duração: esvazia com o contador e trava com ele */}
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA + MOTION.stagger}
        enter={MOTION.enter}
        from={{y: MOTION.travel.chip, opacity: 0}}
        driftRate={vertical(driftSupport)}
        style={{position: 'absolute', left: COL.x, top: BARRA_Y, width: COL.w}}
      >
        <div
          style={{
            position: 'relative',
            width: COL.w,
            height: 14,
            borderRadius: 7,
            background: ALPHA.track,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${(lido * 100).toFixed(3)}%`,
              height: '100%',
              borderRadius: 7,
              background: PALETTE.ink,
            }}
          />
        </div>
        {/* marca de meio segundo: o alvo existe desde o início, e acende quando o
            valor chega nele. Ouro só aqui, e sobre tinta */}
        <div
          style={{
            position: 'absolute',
            left: COL.w * 0.5 - 3,
            top: -10,
            width: 6,
            height: 34,
            borderRadius: 3,
            background: PALETTE.ink,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: COL.w * 0.5 - 3,
            top: -10,
            width: 6,
            height: 34,
            borderRadius: 3,
            background: PALETTE.gold,
            opacity: trava,
            boxShadow: `0 0 0 3px ${PALETTE.ink}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: COL.w * 0.5 - 40,
            top: 40,
            width: 80,
            textAlign: 'center',
            fontFamily: sans,
            fontWeight: 800,
            fontSize: TYPE.microLabel,
            letterSpacing: 1.6,
            color: PALETTE.muted,
          }}
        >
          0,5 s
        </div>
      </Enter>
    </StageB>
  );
};

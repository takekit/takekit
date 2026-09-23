import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {fadeIn, progress} from '../kit/curve';
import {sans} from '../kit/fonts';
import {Enter, driftAmbient, driftHero, driftSupport} from '../kit/motion';
import {StageC} from '../kit/Stage';
import {ALPHA, COL, MOTION, PALETTE, EYEBROW, TYPE} from '../kit/tokens';
import {Accent, BigNumber, ChatGPTMark, Eyebrow, Rule} from '../kit/ui';

/**
 * u13 — palco C, 190 f (6,33 s). O beat mais longo, e o único com espaço para
 * uma frase inteira: o 5 aparece, o 18 entra, o × trava, e só então o contexto
 * (contra o que foi medido) e o acento cursivo entram. O número é o herói do
 * frame do começo ao fim, e nada mais chega perto dele em escala.
 *
 * Cauda: depois do acento (f126) não nasce ideia nova. O que segura o último
 * terço é a deriva a taxa constante em todas as camadas — ela nunca zera, nem no
 * corte. Um shine num knot de 72 px não se leria, então não entra.
 */

const SIZE_A = 228; // "5" — o ponto de partida da medida
const SIZE_B = 282; // "18" — o resultado, um degrau acima
const SIZE_X = 148; // "×" — a unidade, que trava

const BOX_A = 190;
const BOX_ARROW = 96;
const BOX_B = 360;
const BOX_X = 140;
const ROW_W = BOX_A + BOX_ARROW + BOX_B + BOX_X;
const ROW_LEFT = (1080 - ROW_W) / 2;
const ROW_TOP = 430;
const ROW_H = 320;
const SEAL_TOP = ROW_TOP + ROW_H + 18;

/**
 * Seta desenhada, não glifo: Hetrixo ExtraBold não tem '→' e um fallback aqui
 * apareceria no meio do herói. Traço puro não depende de fonte.
 */
const Seta: React.FC<{w?: number}> = ({w = 62}) => (
  <svg width={w} height={42} viewBox="0 0 62 42" fill="none">
    <path d="M2 21 H54" stroke={PALETTE.gold} strokeWidth={6} strokeLinecap="round" />
    <path
      d="M38 8 L56 21 L38 34"
      stroke={PALETTE.gold}
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const U13: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();

  const cabecalho = fadeIn(frame, -4, 12);
  const escreve = progress(frame, {start: 0, enter: MOTION.micro, duration, ease: 'pop'});
  const sela = progress(frame, {start: 62, enter: MOTION.micro, duration, ease: 'pop'});
  const divisor = progress(frame, {start: 74, enter: MOTION.micro, duration, ease: 'pop'});

  return (
    <StageC>
      {/* camada ambiente: de onde a medida veio */}
      <div style={{position: 'absolute', left: COL.x, top: EYEBROW.C, opacity: cabecalho}}>
        <Eyebrow>Medido na Vercel</Eyebrow>
      </div>
      <div
        style={{
          position: 'absolute',
          left: COL.x,
          top: 168,
          width: 64 * Math.min(1, escreve.s),
          height: 5,
          borderRadius: 3,
          background: PALETTE.gold,
          opacity: cabecalho,
        }}
      />
      <Rule
        w={COL.w}
        t={1.5}
        color={ALPHA.rule}
        draw={escreve.s}
        style={{position: 'absolute', left: COL.x, top: 192}}
      />

      {/* herói: 5 → 18×, cada peça com caixa própria para a linha não dançar */}
      <div
        style={{
          position: 'absolute',
          left: ROW_LEFT,
          top: ROW_TOP,
          width: ROW_W,
          height: ROW_H,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Enter
          frame={frame}
          duration={duration}
          start={-5}
          enter={MOTION.enterHero}
          from={{y: MOTION.travel.hero, scale: 0.93, opacity: 0}}
          driftRate={driftHero}
          fade={8}
          style={{width: BOX_A, display: 'flex', justifyContent: 'center'}}
        >
          <BigNumber size={SIZE_A} color={PALETTE.muted}>
            5
          </BigNumber>
        </Enter>

        <Enter
          frame={frame}
          duration={duration}
          start={12}
          enter={MOTION.enter}
          from={{x: -MOTION.travel.lateral, opacity: 0}}
          driftRate={driftSupport}
          style={{width: BOX_ARROW, display: 'flex', justifyContent: 'center'}}
        >
          <Seta />
        </Enter>

        <Enter
          frame={frame}
          duration={duration}
          start={20}
          enter={MOTION.enterHero}
          from={{y: MOTION.travel.hero, scale: 0.93, opacity: 0}}
          driftRate={driftHero}
          fade={8}
          style={{width: BOX_B, display: 'flex', justifyContent: 'center'}}
        >
          <BigNumber size={SIZE_B} color={PALETTE.ink}>
            18
          </BigNumber>
        </Enter>

        <Enter
          frame={frame}
          duration={duration}
          start={46}
          enter={MOTION.enterPlate}
          from={{scale: 0.9, opacity: 0}}
          driftRate={driftHero}
          fade={8}
          style={{width: BOX_X, display: 'flex', justifyContent: 'center'}}
        >
          <BigNumber size={SIZE_X} color={PALETTE.ink} style={{letterSpacing: -1}}>
            ×
          </BigNumber>
        </Enter>
      </div>

      {/* o selo: fecha a medida inteira, não só o × */}
      <Rule
        w={ROW_W}
        t={4}
        color={PALETTE.gold}
        draw={sela.s}
        style={{position: 'absolute', left: ROW_LEFT, top: SEAL_TOP}}
      />

      {/* contexto: contra o que a medida foi feita */}
      <Rule
        w={620}
        t={1.5}
        color={ALPHA.rule}
        draw={divisor.s}
        style={{position: 'absolute', left: (1080 - 620) / 2, top: 870}}
      />
      <div
        style={{
          position: 'absolute',
          left: COL.x,
          top: 914,
          width: COL.w,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 22,
        }}
      >
        <Enter
          frame={frame}
          duration={duration}
          start={80}
          enter={MOTION.enter}
          from={{x: -MOTION.travel.lateral, opacity: 0}}
          driftRate={driftSupport}
        >
          {/* o shine do plano sai: num knot de 72 px uma varredura não se lê,
              e o beat já tem vida na deriva de todas as camadas */}
          <ChatGPTMark size={72} tone={PALETTE.ink} />
        </Enter>
        <Enter
          frame={frame}
          duration={duration}
          start={86}
          enter={MOTION.enter}
          from={{x: MOTION.travel.lateral, opacity: 0}}
          driftRate={driftSupport}
        >
          <div
            style={{
              fontFamily: sans,
              fontWeight: 800,
              fontSize: TYPE.logoCaption,
              color: PALETTE.muted,
            }}
          >
            classificador do ChatGPT
          </div>
        </Enter>
      </div>

      {/* acento cursivo: uma vez no gráfico, e Alvito é demo — só ASCII. Em tinta:
          ouro em texto sobre creme é 1,6:1 e o acento sumiria no celular */}
      <div
        style={{
          position: 'absolute',
          left: COL.x,
          top: 1080,
          width: COL.w,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Enter
          frame={frame}
          duration={duration}
          start={126}
          enter={MOTION.enter}
          from={{y: MOTION.travel.chip, opacity: 0}}
          driftRate={driftAmbient}
        >
          <Accent size={92} color={PALETTE.ink}>mais veloz</Accent>
        </Enter>
      </div>
    </StageC>
  );
};

import React, {createContext, useContext} from 'react';
import {AbsoluteFill} from 'remotion';
import {H, PALETTE, STAGE_B, STAGE_B_FIT, STAGE_C, STAGE_SHIFT, W} from './tokens';

/**
 * Qual beat está sendo desenhado. O Root informa; o palco usa para achar o
 * encaixe medido daquele beat em `STAGE_B_FIT`. Fica aqui, e não numa prop, para
 * nenhum beat precisar carregar o próprio número de layout.
 */
export const BeatId = createContext<string>('');

/**
 * Palco B — o overlay do gráfico, e só isso.
 *
 * O creme e o card do host são de outro bake (`overlay/hostB_*.mov`); este
 * arquivo não pode pintar nada abaixo de y=960, senão come a metade de baixo.
 * O clip não é enfeite: é a garantia estrutural de que o alfa abaixo da costura
 * é zero, mesmo que um beat erre a altura de um elemento.
 *
 * Dentro do clip, um segundo plano encaixa o grupo na faixa útil (180..620):
 * desce, e encolhe só quem não cabe nos 440 px entre a UI do Instagram e a
 * caption. Os números são medidos, um por beat, e moram em `STAGE_B_FIT`; o beat
 * segue escrito na composição que foi aprovada.
 */
export const StageB: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{backgroundColor: 'transparent'}}>
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: W,
        height: STAGE_B.splitY,
        overflow: 'hidden',
      }}
    >
      <Encaixe>{children}</Encaixe>
    </div>
  </AbsoluteFill>
);

/** Desce e, se preciso, encolhe — a origem no topo do eixo central mantém o
 *  gráfico centrado em x enquanto ele encolhe. */
const Encaixe: React.FC<{children: React.ReactNode}> = ({children}) => {
  const uid = useContext(BeatId);
  const {shift, scale} = STAGE_B_FIT[uid] ?? {shift: STAGE_SHIFT.B, scale: 1};
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: W,
        height: STAGE_B.splitY,
        transform: `translateY(${shift}px) scale(${scale})`,
        transformOrigin: `${W / 2}px 0px`,
      }}
    >
      {children}
    </div>
  );
};

/** Palco C — creme opaco full frame. O frame inteiro é o objeto da frase. */
export const StageC: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{backgroundColor: PALETTE.cream}}>
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: W,
        height: H,
        transform: `translateY(${STAGE_SHIFT.C}px)`,
      }}
    >
      {children}
    </div>
  </AbsoluteFill>
);

/**
 * Faixa de trabalho de cada palco, em coordenada FINAL de tela — é o que a
 * auditoria mede. Um beat que precise citar a faixa converte com `toLocal`.
 */
export const stageBox = (stage: 'B' | 'C') =>
  stage === 'B'
    ? {x0: STAGE_B.x0, x1: STAGE_B.x1, y0: STAGE_B.y0, y1: STAGE_B.y1}
    : {x0: STAGE_C.x0, x1: STAGE_C.x1, y0: STAGE_C.y0, y1: STAGE_C.y1};

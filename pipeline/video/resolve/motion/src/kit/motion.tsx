import React from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {resolve} from './curve';
import type {DriftRate, Ease, From, Progress} from './curve';
import {MOTION} from './tokens';

export type EnterProps = {
  /** frame local do beat */
  frame: number;
  /** último frame do beat — o corte */
  duration: number;
  /** frame em que a entrada começa. Negativo = o corte cai em movimento */
  start?: number;
  enter?: number;
  ease?: Ease;
  /** estado de repouso do elemento, em relação ao lugar final */
  from?: From;
  /** deriva em px/segundo, a partir do fim da entrada */
  driftRate?: DriftRate;
  fade?: number;
  style?: CSSProperties;
  children: ReactNode;
};

/** Taxas por camada. O beat escolhe a camada, nunca o número. */
export const driftHero = MOTION.driftRate.hero;
export const driftSupport: DriftRate = {
  x: MOTION.driftRate.hero.x * MOTION.driftRate.support,
  y: MOTION.driftRate.hero.y * MOTION.driftRate.support,
  scale: MOTION.driftRate.hero.scale * MOTION.driftRate.support,
};
export const driftAmbient: DriftRate = {
  x: MOTION.driftRate.hero.x * MOTION.driftRate.ambient,
  y: MOTION.driftRate.hero.y * MOTION.driftRate.ambient,
};

/**
 * Deriva só no eixo y.
 *
 * Obrigatória para elemento de largura cheia: a coluna útil acaba em x=1000 e um
 * chip de 920 px não tem para onde ir sem sair da faixa. A paralaxe entre as
 * camadas continua existindo, só que vertical.
 */
export const vertical = (rate: DriftRate): DriftRate => ({x: 0, y: rate.y, scale: rate.scale});

/**
 * Aplica o motion language a um elemento: entrada e deriva no mesmo relógio.
 *
 * Todo elemento posicionado de todo beat passa por aqui. Um beat que escreve a
 * própria string de `transform` está fora da linguagem — não porque alguém
 * revisou, mas porque não existe outro jeito de animar.
 */
export const Enter: React.FC<EnterProps> = ({
  frame,
  duration,
  start = 0,
  enter = MOTION.enter,
  ease = 'enter',
  from = {},
  driftRate,
  fade,
  style,
  children,
}) => {
  const r = resolve(frame, {}, from, {start, enter, duration, ease, driftRate, fade});
  return (
    <div
      style={{
        ...style,
        opacity: r.opacity,
        transform: `translate3d(${r.x.toFixed(2)}px, ${r.y.toFixed(2)}px, 0) scale(${r.scale.toFixed(5)}) rotate(${r.rotate.toFixed(3)}deg)`,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Atraso de um item dentro de um grupo. O grupo inteiro resolve dentro de
 * ~22 frames — senão a cauda do stagger vira um segundo evento.
 */
export const staggerStart = (index: number, base = 0, count = 1) =>
  base + index * (count >= 4 ? MOTION.stagger4 : MOTION.stagger);

export type {Progress, Ease};

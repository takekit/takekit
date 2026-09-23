import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {clamp, fadeIn, progress} from '../kit/curve';
import {sans} from '../kit/fonts';
import {Enter, driftAmbient, driftHero, driftSupport, staggerStart, vertical} from '../kit/motion';
import {StageB} from '../kit/Stage';
import {ALPHA, CHIP, COL, MOTION, PALETTE, EYEBROW, TYPE} from '../kit/tokens';
import {Chip, Eyebrow, Rule} from '../kit/ui';

/**
 * u01 — palco B, 57 f.
 *
 * Três decisões caem em cascata e o medidor de cada uma enche enquanto ela cai.
 * No fim, o financeiro assume: a superfície dele vira placa ink e o valor vira
 * ouro num frame só. É o beat interno do u01, e é o mesmo gesto que o u12 usa.
 *
 * As entradas começam ANTES do frame 0: o corte é seco e cai sobre movimento já
 * em curso. Um beat que abre com o canvas vazio gasta os primeiros frames
 * mostrando nada — é o defeito clássico do "entrou do zero".
 */

const ENTRADA = -5;

// chip ocupa a coluna inteira (920 px): deriva só em y, senão sai da faixa x
const ROTA_FIN = vertical(driftHero);
const ROTA_APOIO = vertical(driftSupport);

const OPCOES = [
  {id: 'fin', label: 'financeiro', alvo: 94, ramp: 38, drift: ROTA_FIN},
  {id: 'sup', label: 'suporte', alvo: 4, ramp: 26, drift: ROTA_APOIO},
  {id: 'hum', label: 'humano', alvo: 2, ramp: 26, drift: ROTA_APOIO},
];

const TOPO = 204;
/** frame em que o vencedor assume — o beat interno do u01 */
const VENCE = 40;

const Linha: React.FC<{
  frame: number;
  duration: number;
  index: number;
  label: string;
  alvo: number;
  ramp: number;
  drift: typeof driftSupport;
  vencedor: boolean;
}> = ({frame, duration, index, label, alvo, ramp, drift, vencedor}) => {
  const inicio = staggerStart(index, ENTRADA, OPCOES.length);
  // o número e o medidor saem do MESMO relógio: não há como discordarem
  const subida = progress(frame, {start: inicio, enter: ramp, duration, ease: 'rise'});
  const pct = Math.min(alvo, Math.round(alvo * subida.s));
  const assume = vencedor ? fadeIn(frame, VENCE, 9) : 0;

  return (
    <Enter
      frame={frame}
      duration={duration}
      start={inicio}
      enter={MOTION.enter}
      from={{y: 42, scale: 0.97, opacity: 0}}
      driftRate={drift}
      fade={6}
      style={{position: 'absolute', left: COL.x, top: TOPO + index * (CHIP.h + CHIP.gap), width: CHIP.w}}
    >
      <Chip
        label={label}
        value={`${pct}%`}
        // o medidor mostra o valor do chip, não o quanto a entrada andou
        meter={(alvo / 100) * subida.s}
        tone={vencedor && assume >= 1 ? 'block' : 'outline'}
        overlay={vencedor ? assume : 0}
      />
    </Enter>
  );
};

export const U01: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const cabecalho = fadeIn(frame, -5, 12);
  // a régua se escreve, não translada: micro classe, 6 f, com um ápice de 2%
  const escreve = progress(frame, {start: -2, enter: 6, duration, ease: 'pop'});

  return (
    <StageB>
      {/* camada ambiente: cabeçalho e régua. Nunca pede atenção, só dá casa */}
      <Enter frame={frame} duration={duration} start={-5} enter={1} driftRate={driftAmbient}>
        <div style={{position: 'absolute', left: COL.x, top: EYEBROW.B, opacity: cabecalho}}>
          <Eyebrow>Decisão automática</Eyebrow>
        </div>
        <div
          style={{
            position: 'absolute',
            right: 1080 - COL.x - COL.w,
            top: EYEBROW.B,
            fontFamily: sans,
            fontWeight: 800,
            fontSize: TYPE.smallCaps,
            letterSpacing: TYPE.smallCaps * 0.14,
            color: PALETTE.muted,
            opacity: cabecalho * 0.72,
          }}
        >
          3 OPÇÕES
        </div>

        <div
          style={{
            position: 'absolute',
            left: COL.x,
            top: 140,
            width: 64 * clamp(escreve.s),
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
          style={{position: 'absolute', left: COL.x, top: 164}}
        />
      </Enter>

      {OPCOES.map((o, i) => (
        <Linha
          key={o.id}
          frame={frame}
          duration={duration}
          index={i}
          label={o.label}
          alvo={o.alvo}
          ramp={o.ramp}
          drift={o.drift}
          vencedor={i === 0}
        />
      ))}
    </StageB>
  );
};

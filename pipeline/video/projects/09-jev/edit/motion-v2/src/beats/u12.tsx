import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {fadeIn, progress, sweep} from '../kit/curve';
import {sans} from '../kit/fonts';
import {Enter, driftAmbient, driftHero, driftSupport, staggerStart} from '../kit/motion';
import {StageB} from '../kit/Stage';
import {ALPHA, COL, MOTION, PALETTE, RADIUS, EYEBROW, TYPE} from '../kit/tokens';
import {BrandMark, ChatGPTMark, Eyebrow, Plate, Rule} from '../kit/ui';

/**
 * u12 — palco B, 56 f.
 *
 * Três modelos na bancada ao mesmo tempo, e um é escolhido agora. O evento do
 * beat é a ESCOLHA, não os logos: as três placas pousam em cascata, e em f28 a
 * do ChatGPT vira placa ink — o mesmo gesto de troca de estado do u01, para o
 * filme ter uma gramática só para "este venceu". As outras duas recuam para mudo.
 *
 * O ChatGPT fica no slot do meio de propósito: o vencedor mora no eixo, e o olho
 * não precisa atravessar a tela para achar a escolha.
 */

const ENTRADA = -5;
/** a escolha — rampa de 9 f, o tipo e a marca trocam num frame só no meio dela */
const ESCOLHA = 28;
/** a luz passa depois que a placa já fechou em ink */
const LUZ = 38;

const TILE_W = 272;
const TILE_H = 300;
const GAP = (COL.w - 3 * TILE_W) / 2; // 52
const TOPO = 190;
const TRILHO_Y = TOPO + TILE_H + 26; // 516

type Modelo = 'chatgpt' | 'claude' | 'grok';

/** Ordem de entrada ≠ ordem de leitura: o vencedor pousa primeiro, no meio. */
const MODELOS: {id: Modelo; nome: string; slot: number; ordem: number}[] = [
  {id: 'claude', nome: 'CLAUDE', slot: 0, ordem: 1},
  {id: 'chatgpt', nome: 'CHATGPT', slot: 1, ordem: 0},
  {id: 'grok', nome: 'GROK', slot: 2, ordem: 2},
];

const Marca: React.FC<{id: Modelo; tone: string; shine?: number}> = ({id, tone, shine}) => {
  if (id === 'chatgpt') return <ChatGPTMark size={132} tone={tone} />;
  // o raio do Claude encosta na borda do PNG: recuo para ele não parecer cortado
  return <BrandMark brand={id} box={132} tone={tone} pad={id === 'claude' ? 6 : 10} shine={shine} />;
};

const Tile: React.FC<{
  frame: number;
  duration: number;
  id: Modelo;
  nome: string;
  slot: number;
  ordem: number;
}> = ({frame, duration, id, nome, slot, ordem}) => {
  const vence = id === 'chatgpt';
  const inicio = staggerStart(ordem, ENTRADA, MODELOS.length);
  const assume = vence ? fadeIn(frame, ESCOLHA, 9) : 0;
  const recua = vence ? 0 : fadeIn(frame, ESCOLHA, 11);
  const tinta = assume >= 0.5; // troca de tipo num frame só

  return (
    <Enter
      frame={frame}
      duration={duration}
      start={inicio}
      enter={MOTION.enterPlate}
      from={{y: MOTION.travel.plate, scale: 0.97, opacity: 0}}
      driftRate={vence ? driftHero : driftSupport}
      fade={MOTION.fadePlate}
      style={{
        position: 'absolute',
        left: COL.x + slot * (TILE_W + GAP),
        top: TOPO,
        width: TILE_W,
      }}
    >
      {/* o recuo mora num wrapper: <Enter> é dono da opacidade da entrada */}
      <div style={{opacity: 1 - recua * 0.48}}>
      <Plate
        tone={vence && assume >= 1 ? 'block' : 'outline'}
        radius={RADIUS.card}
        style={{width: TILE_W, height: TILE_H}}
      >
        {vence && assume > 0 && assume < 1 ? (
          <div style={{position: 'absolute', inset: 0, background: PALETTE.ink, opacity: assume}} />
        ) : null}
        <div
          style={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 34,
          }}
        >
          <Marca id={id} tone={tinta ? PALETTE.gold : PALETTE.ink} />
          <div
            style={{
              fontFamily: sans,
              fontWeight: 800,
              fontSize: TYPE.microLabel + 4,
              letterSpacing: 2.4,
              color: tinta ? PALETTE.cream : PALETTE.muted,
              lineHeight: 1,
            }}
          >
            {nome}
          </div>
        </div>
      </Plate>
      </div>
    </Enter>
  );
};

export const U12: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const cabecalho = fadeIn(frame, -5, 12);
  const escreve = progress(frame, {start: -2, enter: MOTION.micro, duration, ease: 'pop'});
  // o marcador do slot escolhido cresce do centro do slot, em tinta: ouro num
  // trilho claro seria invisível (1,18:1)
  const marca = progress(frame, {start: ESCOLHA + 2, enter: MOTION.base, duration, ease: 'enter'});
  const luz = sweep(frame, LUZ, MOTION.shineShort);

  return (
    <StageB>
      {/* camada ambiente: cabeçalho, régua e trilho do seletor */}
      <Enter frame={frame} duration={duration} start={-5} enter={1} driftRate={driftAmbient}>
        <div style={{position: 'absolute', left: COL.x, top: EYEBROW.B, opacity: cabecalho}}>
          <Eyebrow>Modelo</Eyebrow>
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
          3 DISPONÍVEIS
        </div>
        <Rule
          w={COL.w}
          t={1.5}
          color={ALPHA.rule}
          draw={escreve.s}
          style={{position: 'absolute', left: COL.x, top: 150}}
        />
        <div
          style={{
            position: 'absolute',
            left: COL.x,
            top: TRILHO_Y,
            width: COL.w,
            height: 8,
            borderRadius: 4,
            background: ALPHA.track,
            opacity: cabecalho,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: COL.x + TILE_W + GAP + (TILE_W / 2) * (1 - Math.min(1, marca.s)),
            top: TRILHO_Y,
            width: TILE_W * Math.min(1, marca.s),
            height: 8,
            borderRadius: 4,
            background: PALETTE.ink,
          }}
        />
      </Enter>

      {MODELOS.map((m) => (
        <Tile key={m.id} frame={frame} duration={duration} {...m} />
      ))}

      {/* a luz passa por cima da placa escolhida, recortada por ela — não vaza */}
      {luz > 0 && luz < 1 ? (
        <Enter
          frame={frame}
          duration={duration}
          start={staggerStart(0, ENTRADA, MODELOS.length)}
          enter={MOTION.enterPlate}
          driftRate={driftHero}
          style={{
            position: 'absolute',
            left: COL.x + TILE_W + GAP,
            top: TOPO,
            width: TILE_W,
            height: TILE_H,
            borderRadius: RADIUS.card,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -40,
              bottom: -40,
              width: 120,
              left: -160 + luz * (TILE_W + 320),
              transform: 'rotate(14deg)',
              background:
                'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0) 100%)',
            }}
          />
        </Enter>
      ) : null}
    </StageB>
  );
};

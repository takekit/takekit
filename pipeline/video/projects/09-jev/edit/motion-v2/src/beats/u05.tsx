import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {sweep} from '../kit/curve';
import {Enter, driftAmbient, driftHero, driftSupport} from '../kit/motion';
import {StageC} from '../kit/Stage';
import {BEAT_FRAMES, COL, MOTION, PALETTE, tail} from '../kit/tokens';

/**
 * u05 — palco C, 75 f. O objeto da cláusula é a marca do ChatGPT, e mais nada:
 * zero texto, por decisão. A caption escreve "o ChatGPT" na faixa 1500-1750 e
 * repetir a palavra no canvas duplicaria a frase do outro agente; Hetrixo e
 * Alvito não entram aqui.
 *
 * Três decisões governam o beat:
 *
 * 1. A MARCA É GEOMETRIA, NÃO O PNG. O `chatgpt-logo.png` do public/ é o tile do
 *    Wikimedia: placa #74AA9C (verde, fora da paleta) com o knot vazado — o alfa
 *    dele é a CHAPA, não o blossom, então <BrandMark> aqui pintaria um quadrado de
 *    tinta de 640 px. A marca sai do mesmo asset do ledger
 *    (`brands/chatgpt/logo.svg`, o path #a repetido a cada 60 graus), recortada no
 *    bbox do knot: 1810 unidades centradas em (1203,1203). Sem esse recorte o mark
 *    renderiza a 74% da caixa e o "grande" do storyboard se perde.
 * 2. A LUZ É DOIS PASSES, NÃO UM. O kit traz um passe só (BrandMark.shine) e o
 *    beat tem 2,5 s: um passe deixaria metade do beat sem novidade nenhuma. O
 *    segundo entra com menos da metade do peso (0,34 contra 0,85) e mora no FIM
 *    do beat, não no meio, para não ler como loop.
 * 3. SEM ÁPICE NA MARCA. KIT: overshoot "nunca em número, barra, dinheiro ou
 *    logo". A marca assenta e desemboca na deriva — a vida visível do beat vem do
 *    shine e do lift, não de um bounce no herói.
 *
 * Um hit só, no fim da entrada: `reveal` em LUZ_1, quando a marca assenta e a luz
 * a pega (o passe 2 fica mudo de propósito — som no brilho é decoração).
 *
 * Cauda: o passe 2 termina exatamente onde a cauda do kit começa; de f63 ao corte
 * só existe deriva, e é por desenho.
 */

/** O corte B→C é seco: nada nasce no frame 0, tudo já está em curso quando ele cai. */
const ENTRADA = -5;

const DUR = BEAT_FRAMES.u05; // 75 — a duração é de cuts.json, o beat não escolhe
/** f16: a luz pega a marca um frame depois de ela assentar (fim da entrada em f15) */
const LUZ_1 = ENTRADA + MOTION.enterHero + MOTION.microStagger;
/** f50: 75 − 13 f de passe − 12 f de cauda. Depois dele não nasce ideia nova */
const LUZ_2 = DUR - MOTION.shine - Math.ceil(tail(DUR));

/**
 * Centro do beat. Marca e lift compartilham o mesmo ponto; a lavagem de ouro fica
 * acima, porque é luz de papel entrando de cima — os três andam no mesmo sentido,
 * com velocidades diferentes: é isso que faz a paralaxe.
 */
const MEIO_Y = 744;
const MARCA = 640;
const LIFT = 840;
const LAVAGEM = 720;

/**
 * Uma pá do knot — literal de `brands/chatgpt/logo.svg` (path #a). As seis
 * rotações de 60 graus em torno de (1203,1203) são a simetria da marca, ou seja
 * geometria estática; quem move a caixa é o <Enter> que a envolve.
 */
const PATA =
  'M1107.3 299.1c-197.999 0-373.9 127.3-435.2 315.3L650 743.5v427.9c0 21.4 11 40.4 29.4 51.4l344.5 198.515V833.3h.1v-27.9L1372.7 604c33.715-19.52 70.44-32.857 108.47-39.828L1447.6 450.3C1361 353.5 1237.1 298.5 1107.3 299.1zm0 117.5-.6.6c79.699 0 156.3 27.5 217.6 78.4-2.5 1.2-7.4 4.3-11 6.1L952.8 709.3c-18.4 10.4-29.4 30-29.4 51.4V1248l-155.1-89.4V755.8c-.1-187.099 151.601-338.9 339-339.2z';
const PAS = [0, 60, 120, 180, 240, 300] as const;
const CENTRO = 1203;
/** Caixa quadrada do recorte, centrada no knot: o bbox dele é 1783x1807 unidades,
 *  então é esta caixa — e não o viewBox de 2406 — que faz a marca encher o quadro. */
const CAIXA = 1810;
const CAIXA_0 = CENTRO - CAIXA / 2;
/** Metade do curso da luz, em unidades (~530 px na caixa de 640): nos extremos o
 *  núcleo já está fora da marca, então a varredura nasce e morre fora dela. */
const VARREDURA = 1500;
/** Halo largo e fraco (320 px) com um núcleo estreito e forte (160 px) por dentro:
 *  é o que separa "luz passando" de "faixa branca colada na marca". */
const HALO = 905;
const NUCLEO = 452;
/** Os dois passes atravessam a -18 graus — mesma luz, duas passagens. */
const INCLINACAO = -18;

type Passe = {pos: number; nucleo: number; halo: number};

/**
 * A marca com a luz dentro dela.
 *
 * A luz é um retângulo do tamanho do recorte, recortado pelo PRÓPRIO knot: ela não
 * existe fora da silhueta (é luz sobre o herói, não um elemento de cena) e por isso
 * não precisa de deriva própria — herda o movimento da caixa. O gradiente é de
 * espaço de usuário e se move pelos números de x1/x2, nunca por uma transform
 * animada: nenhum frame escreve uma string de transform que muda.
 */
const Marca: React.FC<{box: number; passes: Passe[]}> = ({box, passes}) => {
  const pes = PAS.map((a) => (
    <path key={a} d={PATA} transform={`rotate(${a} ${CENTRO} ${CENTRO})`} />
  ));

  return (
    <svg
      width={box}
      height={box}
      viewBox={`${CAIXA_0} ${CAIXA_0} ${CAIXA} ${CAIXA}`}
      style={{display: 'block'}}
    >
      <defs>
        <clipPath id="u05-marca">{pes}</clipPath>
        {passes.map((p, i) => {
          const dx = -VARREDURA + p.pos * VARREDURA * 2;
          const faixa = `rotate(${INCLINACAO} ${CENTRO} ${CENTRO})`;
          const eixo = {gradientUnits: 'userSpaceOnUse' as const, y1: CENTRO, y2: CENTRO, gradientTransform: faixa};
          return (
            <React.Fragment key={i}>
              <linearGradient
                id={`u05-halo-${i}`}
                {...eixo}
                x1={CENTRO + dx - HALO / 2}
                x2={CENTRO + dx + HALO / 2}
              >
                <stop offset="0" stopColor={PALETTE.white} stopOpacity={0} />
                <stop offset="0.5" stopColor={PALETTE.white} stopOpacity={p.halo} />
                <stop offset="1" stopColor={PALETTE.white} stopOpacity={0} />
              </linearGradient>
              <linearGradient
                id={`u05-nucleo-${i}`}
                {...eixo}
                x1={CENTRO + dx - NUCLEO / 2}
                x2={CENTRO + dx + NUCLEO / 2}
              >
                <stop offset="0" stopColor={PALETTE.white} stopOpacity={0} />
                <stop offset="0.5" stopColor={PALETTE.white} stopOpacity={p.nucleo} />
                <stop offset="1" stopColor={PALETTE.white} stopOpacity={0} />
              </linearGradient>
            </React.Fragment>
          );
        })}
      </defs>

      {/* a marca: tinta plana, sem placa e sem gradiente — o herói é a silhueta */}
      <g fill={PALETTE.ink}>{pes}</g>
      {passes.length ? (
        <g clipPath="url(#u05-marca)">
          {passes.map((_, i) => (
            <React.Fragment key={i}>
              <rect x={CAIXA_0} y={CAIXA_0} width={CAIXA} height={CAIXA} fill={`url(#u05-halo-${i})`} />
              <rect x={CAIXA_0} y={CAIXA_0} width={CAIXA} height={CAIXA} fill={`url(#u05-nucleo-${i})`} />
            </React.Fragment>
          ))}
        </g>
      ) : null}
    </svg>
  );
};

export const U05: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();

  // Fora de [0,1] a luz não desenha (é o mesmo critério do BrandMark do kit): o
  // brilho existe só enquanto atravessa, não deixa estado no frame seguinte.
  const passes: Passe[] = [
    {pos: sweep(frame, LUZ_1, MOTION.shine), nucleo: 0.85, halo: 0.14},
    {pos: sweep(frame, LUZ_2, MOTION.shine), nucleo: 0.34, halo: 0.1},
  ].filter((p) => p.pos > 0 && p.pos < 1);

  return (
    <StageC>
      {/* Camada de fundo: ouro a 4% é LUZ, não superfície — não desenha aresta,
          não carrega decisão e não disputa leitura com ninguém. É o que dá à
          metade de cima do creme a temperatura de papel iluminado. */}
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterHero}
        from={{scale: 0.9, opacity: 0}}
        driftRate={driftAmbient}
        fade={MOTION.fade}
        style={{
          position: 'absolute',
          left: COL.cx - LAVAGEM / 2,
          top: 100,
          width: LAVAGEM,
          height: LAVAGEM,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${PALETTE.gold} 0%, ${PALETTE.gold}00 72%)`,
            opacity: 0.04,
          }}
        />
      </Enter>

      {/* O lift tira a tinta do creme: chega 5 f depois da marca (20 contra 15) e
          não anuncia nada — é respiração, não evento. Branco sobre #F4EFE6 levanta
          ~8/11/18 unidades e lê como papel iluminado, nunca como mancha. */}
      <Enter
        frame={frame}
        duration={duration}
        start={4}
        enter={MOTION.enterPlate}
        from={{scale: 0.92, opacity: 0}}
        driftRate={driftSupport}
        fade={MOTION.fadePlate}
        style={{
          position: 'absolute',
          left: COL.cx - LIFT / 2,
          top: MEIO_Y - LIFT / 2,
          width: LIFT,
          height: LIFT,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${PALETTE.white} 0%, ${PALETTE.white}00 68%)`,
            opacity: 0.66,
          }}
        />
      </Enter>

      {/* O herói. Entrada de marca (20 f, 30 px, scale 0.88) sem ápice: o kit
          proíbe overshoot em logo, então a curva desemboca direto na deriva.
          A caixa fica em x 220..860 e y 424..1064; com a deriva do beat (+23 px em
          x, −19 px em y) nada encosta em x=1000 nem na faixa da caption. */}
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterHero}
        from={{y: MOTION.travel.hero, scale: 0.88, opacity: 0}}
        driftRate={driftHero}
        fade={MOTION.fadePlate}
        style={{
          position: 'absolute',
          left: COL.cx - MARCA / 2,
          top: MEIO_Y - MARCA / 2,
          width: MARCA,
          height: MARCA,
        }}
      >
        <Marca box={MARCA} passes={passes} />
      </Enter>
    </StageC>
  );
};

import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {clamp, curve, fadeIn, lerp, sweep} from '../kit/curve';
import {Enter, driftHero} from '../kit/motion';
import {StageB} from '../kit/Stage';
import {ALPHA, MOTION, PALETTE} from '../kit/tokens';
import {BrandMark, Plate} from '../kit/ui';

/**
 * u04 — palco B, 32 f (1,07 s). O selo do JEV, recém-lançado.
 *
 * O beat é UM objeto — o disco ink com o mark em creme — e três relógios que
 * nascem dele: a íris que o revela, o anel que ele emite quando fica formado e
 * o shine que o atravessa. Nada de tipografia: o nome em tipo é caption do Grok
 * na faixa 700-960, e repeti-lo aqui seria dizer duas vezes a mesma coisa.
 *
 * A entrada começa em -5: o corte cai com o disco já sólido e ainda abrindo.
 * Um beat que abre no canvas vazio gasta os primeiros frames mostrando nada.
 *
 * Sem respiração de logo no fim, apesar do pedido de "selo ainda respirando":
 * `breath` é um ápice de escala, e o kit proíbe ápice em logo. Quem mantém o
 * frame vivo nos últimos 8 f é a deriva mais o anel, que ainda expande.
 */

const SELO_R = 190; // D380 — sozinho na faixa gráfica, é a maior massa do beat
const CX = 540; // centro exato em x: íris, anel e shine têm de ser concêntricos
const CY = 340; // centro da faixa gráfica no espaço do beat (o palco desce o grupo)
const LEFT = CX - SELO_R;
const TOP = CY - SELO_R;
const BOX = SELO_R * 2;

/**
 * A íris abre até 196, não até 190: a máscara tem pena de 4 px, então um raio
 * final igual ao do disco comeria 2 px da aresta e deixaria um aro apagado
 * justo onde o creme encontra a tinta.
 */
const IRIS_R = 196;

/**
 * 9 f, o mesmo relógio do grupo. Em f0 a abertura está em 0,55 e o disco segue
 * crescendo ~22 px/frame até f4 — o movimento já existe no primeiro frame e
 * termina sozinho, sem o "entrou e parou" que o corte denunciaria.
 */
const abre = curve([[-5, 0], [0, 0.55], [4, 1]]);

/** O ping sai dois frames depois de a íris fechar: o tique é do selo formado. */
const PING_F = 6;

/**
 * Raio do anel no corte: 280. Com o grupo descendo 160 px, o palco B não
 * autoriza nada abaixo de y=780, o que dá 620 no espaço do beat — e é
 * exatamente onde o anel fecha (340 + 280). A taxa cai para ~114 px/s e continua
 * diferente de zero no corte, que é o que segura os últimos 8 f sem ideia nova.
 */
const PING_R1 = 280;

const SHINE_W = 260;
const SHINE_H = 500;
/** O centro da banda vai de −340 a +340: entra e sai inteiramente fora do disco. */
const SHINE_X = 340;

/**
 * Branco e ouro — e o ouro só pode existir porque a banda é recortada pelo disco
 * ink: sobre creme ele é 1,61:1 e sumiria. É o único objeto de ouro do beat.
 */
const SHINE_BAND =
  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.42) 45%, rgba(244,180,0,0.30) 62%, rgba(255,255,255,0) 100%)';

export const U04: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();

  /**
   * A máscara vive no espaço LOCAL do grupo (não no espaço do frame): montada
   * fora dele, ela cortaria o disco assim que a deriva passasse de scale 1,0.
   */
  const revela = abre(frame);
  const r = IRIS_R * revela;
  const mascara = `radial-gradient(circle at 50% 50%, #000 ${Math.max(0, r - 4).toFixed(1)}px, rgba(0,0,0,0) ${r.toFixed(1)}px)`;

  const ping = clamp((frame - PING_F) / (duration - PING_F));
  const pingR = lerp(SELO_R, PING_R1, ping);
  // nasce em 3 f (a emissão é suave, não um pop) e morre em 0,15 no corte
  const pingA =
    fadeIn(frame, PING_F, 3) *
    lerp(0.55, 0.15, clamp((frame - PING_F - 3) / (duration - PING_F - 3)));

  const brilho = sweep(frame, 14, MOTION.shineShort);
  const passa = brilho > 0 && brilho < 1;

  return (
    <StageB>
      <Enter
        frame={frame}
        duration={duration}
        start={-5}
        enter={MOTION.enterHero}
        from={{y: MOTION.travel.hero, scale: 0.93, opacity: 0}}
        driftRate={driftHero}
        fade={8}
        style={{position: 'absolute', left: LEFT, top: TOP, width: BOX, height: BOX}}
      >
        {/* Sombra FORA da máscara: o lift estoura ~38 px além do disco e a pena
            da íris o cortaria inteiro, deixando o selo chapado no creme. Ela
            abre no relógio da íris para não existir sombra sem objeto. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            boxShadow: ALPHA.plateLift,
            opacity: revela,
          }}
        />

        {/* Anel: nasce exatamente sob a borda do disco e sai de trás dele. Muted
            e não ouro — aqui ele vive sobre o creme do palco B, onde ouro é
            invisível; o único ouro do beat é a banda do shine, sobre a tinta. */}
        {frame >= PING_F ? (
          <div
            style={{
              position: 'absolute',
              left: SELO_R - pingR,
              top: SELO_R - pingR,
              width: pingR * 2,
              height: pingR * 2,
              boxSizing: 'border-box',
              borderRadius: '50%',
              border: `2px solid ${PALETTE.muted}`,
              opacity: pingA,
            }}
          />
        ) : null}

        {/* O herói: placa ink, e a única do beat. A máscara fica nela, então
            tinta, mark e shine abrem no mesmo gesto — o mark não tem motion
            próprio, nunca escala nem rotaciona: a geometria da marca é intacta. */}
        <Plate
          tone="block"
          shadow="none"
          radius={SELO_R}
          style={{
            position: 'absolute',
            inset: 0,
            WebkitMaskImage: mascara,
            maskImage: mascara,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
          }}
        >
          {/* Mark em creme, não em branco: assim o sheen atravessa por cima do
              desenho em vez de abrir um buraco em volta dele. */}
          <BrandMark
            brand="jev"
            box={320}
            tone={PALETTE.cream}
            style={{position: 'absolute', left: 30, top: 30}}
          />

          {/* Shine: 9 f (beat com menos de 45), −18° fixo no involucro e o que
              anda é o `left` da banda. O invólucro é estático de propósito —
              quem translada não escreve transform, quem gira não se move. */}
          {passa ? (
            <div style={{position: 'absolute', inset: 0, transform: 'rotate(-18deg)'}}>
              <div
                style={{
                  position: 'absolute',
                  top: -60,
                  left: -SHINE_X - SHINE_W / 2 + 2 * SHINE_X * brilho,
                  width: SHINE_W,
                  height: SHINE_H,
                  background: SHINE_BAND,
                }}
              />
            </div>
          ) : null}
        </Plate>
      </Enter>
    </StageB>
  );
};

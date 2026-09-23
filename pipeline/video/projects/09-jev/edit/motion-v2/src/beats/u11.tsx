import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {clamp, curve, lerp, progress} from '../kit/curve';
import {sans} from '../kit/fonts';
import {Enter, driftAmbient, driftHero, driftSupport, staggerStart, vertical} from '../kit/motion';
import {StageB} from '../kit/Stage';
import {ALPHA, COL, MOTION, PALETTE, RADIUS, TYPE} from '../kit/tokens';
import {Eyebrow, NumericSlots, Plate, Rule} from '../kit/ui';

/**
 * u11 — palco B, 67 f (2,23 s).
 *
 * A fatura entra como documento e a última linha dela é fabricada na frente do
 * viewer: o prato ink conta 0→40 e a MESMA varredura que desenha a risca apaga
 * o ouro do número. O × recolhe o ouro que o número perdeu — o carimbo é o
 * único ápice do beat, e o único objeto do frame que carrega decisão.
 *
 * O prato é a única massa ink e a única superfície `block`; o card é `sheet`
 * porque o documento é o palco do beat, não o vencedor. Nada abaixo de y=664: no
 * repouso card + sombra de lift fecham em ~648, e o carimbo nunca desce.
 */

/** O corte cai sobre movimento já em curso: o card não pode abrir do zero. */
const ENTRADA = -5;

/** Documento no canvas. O topo em 132 é o que faz a sombra de lift caber na
 *  caixa do palco B mesmo com o card derivando ~19 px para cima até o corte. */
const CARTAO = {x: COL.x, y: 132, w: 920, h: 460} as const;
/** Padding interno de 40: a coluna de texto do documento começa em x=120, a
 *  mesma borda esquerda de todo bloco de texto do filme. */
const PAD = 40;
const MIOLO = CARTAO.w - PAD * 2; // 840
/** Altura de uma linha do ledger e o passo entre as duas (4 px de ar). */
const LINHA = 52;
const PASSO = 56;

/** O prato ink, em coordenadas do card (y 240 = 372 do canvas). */
const PRATO = {x: PAD, y: 240, w: MIOLO, h: 180} as const;
/** Eixo y do prato: rótulo, número, risca e carimbo moram no mesmo fio. */
const EIXO = PRATO.h / 2; // 90

const ROTULO = {x: 36, w: 251, h: 60}; // "desconto" em 56 px = 250,8 px medidos

/**
 * "40%": o hífen e o '%' ficam FORA dos slots. Medidos no OTF, eles avançam
 * 0,457 e 0,938 em, e o slot do kit é 0,70 — dentro de um slot o '%' transborda
 * a própria caixa e encosta no '0'. Quem precisa de slot fixo são os dois
 * dígitos, que são o valor que muda.
 */
const SLOT = 0.7;
const AV_HIFEN = 0.457;
const AV_PORCENTO = 0.938;
const DIGITOS_W = 2 * SLOT * TYPE.bigNumber;
const VALOR_W = (AV_HIFEN + AV_PORCENTO) * TYPE.bigNumber + DIGITOS_W;
/** Borda direita do número em 744 do prato (x=864 do canvas): é onde o disco do
 *  carimbo começa. Sem essa folga o × não caberia inteiro sobre o ink — e ouro
 *  sobre branco é 1,18:1, ou seja, invisível. */
const VALOR = {right: 744, h: 140};
const VALOR_ESQ = VALOR.right - VALOR_W;

/** A risca termina em 788: 788 + 44 do disco = 832, com 8 px de placa sobrando. */
const RISCA = {fim: 788, t: 6};
const ESTAMPA = 88;

/** Avanços da paleta em canais, para a cor que drena. O kit trava o movimento,
 *  não a cor: a mistura mora aqui, mas sai da paleta, nunca de um hex novo. */
const canais = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const OURO = canais(PALETTE.gold);
const CREME = canais(PALETTE.cream);
const mistura = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;

/** Ledger: o valor à direita fecha na mesma margem do prato (x=960 do canvas). */
const LEDGER = [
  {label: 'Assinatura', value: 'R$ 89,00'},
  {label: 'Suporte', value: 'R$ 120,00'},
];

const LinhaDoLedger: React.FC<{label: string; value: string}> = ({label, value}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      fontFamily: sans,
      fontWeight: 800,
      fontSize: TYPE.chipLabel,
      lineHeight: 1,
      color: PALETTE.muted,
    }}
  >
    <div style={{flex: 1}}>{label}</div>
    <div>{value}</div>
  </div>
);

/**
 * O × do carimbo é desenhado, não digitado: um glifo de sistema no meio da
 * decisão seria a única peça do frame fora da Hetrixo — e o `Dot` do kit só
 * aceita `label: string`, então o disco também é local.
 */
const Carimbo: React.FC<{size: number}> = ({size}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 999,
      background: PALETTE.gold,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <svg width={size * 0.64} height={size * 0.64} viewBox="0 0 56 56" fill="none">
      <path d="M12 12 L44 44" stroke={PALETTE.ink} strokeWidth={7} strokeLinecap="round" />
      <path d="M44 12 L12 44" stroke={PALETTE.ink} strokeWidth={7} strokeLinecap="round" />
    </svg>
  </div>
);

export const U11: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();

  // a régua do cabeçalho se escreve (classe write-on: 6 f, 0 px, só escala)
  const escreve = progress(frame, {start: 6, enter: MOTION.micro, duration, ease: 'pop'});
  // o contador é a entrada do número: 0→40 em 14 f, travado em 40 quando a
  // varredura parte. Um relógio só — o número nunca discorda da risca.
  const conta = progress(frame, {start: 26, enter: 14, duration, ease: 'rise'});
  const n = Math.min(40, Math.round(40 * conta.s));
  // a varredura: 0→788 px em 12 f, o MESMO objeto que desenha a risca e apaga
  // o ouro. O dim do rótulo e do número é função do x dela, não de uma segunda
  // curva: se fosse um segundo relógio, cor e traço poderiam discordar.
  const scan = curve([[40, 0], [52, RISCA.fim]])(frame);
  const dRotulo = clamp((scan - ROTULO.x) / ROTULO.w);
  const dValor = clamp((scan - VALOR_ESQ) / VALOR_W);
  const cor = mistura(OURO, CREME, dValor);
  // a cabeça vive 14 f: nasce com o traço, some antes de o carimbo assentar,
  // para a vez passar para ele.
  const cabeca = curve([[40, 0], [43, 1], [50, 1], [54, 0]])(frame);

  return (
    <StageB>
      {/* o documento: palco do beat, não o vencedor */}
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterPlate}
        from={{y: MOTION.travel.plate, scale: 0.965, opacity: 0}}
        driftRate={vertical(driftHero)}
        fade={MOTION.fadePlate}
        style={{
          position: 'absolute',
          left: CARTAO.x,
          top: CARTAO.y,
          width: CARTAO.w,
          height: CARTAO.h,
        }}
      >
        <Plate tone="sheet" radius={RADIUS.card} shadow="lift" style={{width: '100%', height: '100%'}}>
          {/* chrome do documento: nunca pede atenção, só dá casa à linha fabricada */}
          <Enter
            frame={frame}
            duration={duration}
            start={4}
            enter={MOTION.enter}
            from={{x: -MOTION.travel.lateral, opacity: 0}}
            driftRate={vertical(driftAmbient)}
            style={{
              position: 'absolute',
              left: PAD,
              top: 40,
              width: MIOLO,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Eyebrow>FATURA</Eyebrow>
            <Eyebrow style={{opacity: 0.65}}>0412</Eyebrow>
          </Enter>

          <Enter
            frame={frame}
            duration={duration}
            start={6}
            enter={MOTION.micro}
            driftRate={vertical(driftAmbient)}
            style={{position: 'absolute', left: PAD, top: 84, width: MIOLO, height: 2}}
          >
            <Rule w={MIOLO} t={1.5} color={ALPHA.rule} draw={escreve.s} />
          </Enter>

          {/* as duas linhas reais: é o contraste delas que faz a inventada existir */}
          {LEDGER.map((l, i) => (
            <Enter
              key={l.label}
              frame={frame}
              duration={duration}
              start={staggerStart(i, 8)}
              enter={MOTION.enter}
              from={{x: -MOTION.travel.lateral, opacity: 0}}
              driftRate={vertical(driftAmbient)}
              style={{
                position: 'absolute',
                left: PAD,
                top: 108 + i * PASSO,
                width: MIOLO,
                height: LINHA,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <LinhaDoLedger label={l.label} value={l.value} />
            </Enter>
          ))}

          {/* o herói: a linha inventada. Entra como placa (16 f, 32 px) e sem
              ápice nenhum — dinheiro não popa, o único ápice do beat é o × */}
          <Enter
            frame={frame}
            duration={duration}
            start={14}
            enter={MOTION.enterHero}
            from={{y: MOTION.travel.hero, scale: 0.94, opacity: 0}}
            driftRate={vertical(driftSupport)}
            fade={MOTION.fadePlate}
            style={{
              position: 'absolute',
              left: PRATO.x,
              top: PRATO.y,
              width: PRATO.w,
              height: PRATO.h,
            }}
          >
            <Plate tone="block" radius={RADIUS.plate} style={{position: 'absolute', inset: 0}}>
              <Enter
                frame={frame}
                duration={duration}
                start={24}
                enter={MOTION.enter}
                from={{x: -MOTION.travel.lateral, opacity: 0}}
                driftRate={vertical(driftAmbient)}
                style={{
                  position: 'absolute',
                  left: ROTULO.x,
                  top: EIXO - ROTULO.h / 2,
                  width: ROTULO.w,
                  height: ROTULO.h,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: sans,
                    fontWeight: 800,
                    fontSize: TYPE.cardTitle,
                    lineHeight: 1,
                    color: PALETTE.cream,
                    opacity: lerp(0.78, 0.4, dRotulo),
                  }}
                >
                  desconto
                </div>
              </Enter>

              {/* o valor: a contagem é a entrada; ele já nasce no lugar e o que
                  se move é o número, ancorado pela borda direita */}
              <Enter
                frame={frame}
                duration={duration}
                start={26}
                enter={14}
                ease="rise"
                from={{opacity: 0}}
                driftRate={vertical(driftAmbient)}
                style={{
                  position: 'absolute',
                  left: VALOR_ESQ,
                  top: EIXO - VALOR.h / 2,
                  width: VALOR_W,
                  height: VALOR.h,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    opacity: lerp(1, 0.4, dValor),
                    color: cor,
                  }}
                >
                  <div
                    style={{
                      fontFamily: sans,
                      fontWeight: 800,
                      fontSize: TYPE.bigNumber,
                      lineHeight: 1,
                    }}
                  >
                    -
                  </div>
                  <NumericSlots text={`${n}`} size={TYPE.bigNumber} color={cor} style={{width: DIGITOS_W}} />
                  <div
                    style={{
                      fontFamily: sans,
                      fontWeight: 800,
                      fontSize: TYPE.bigNumber,
                      lineHeight: 1,
                    }}
                  >
                    %
                  </div>
                </div>
              </Enter>

              {/* a risca E a varredura são o mesmo objeto: o traço é o relógio da cor.
                  enter=1 f: um write-on não tem curso de entrada, então a deriva
                  começa junto com o traço — com a classe micro (6 f) o transform
                  ficaria parado no meio do beat enquanto só a escala anda */}
              <Enter
                frame={frame}
                duration={duration}
                start={40}
                enter={1}
                from={{opacity: 0}}
                driftRate={vertical(driftAmbient)}
                style={{position: 'absolute', left: 0, top: EIXO - RISCA.t / 2, width: RISCA.fim, height: RISCA.t}}
              >
                <Rule
                  w={RISCA.fim}
                  t={RISCA.t}
                  color={PALETTE.cream}
                  draw={scan / RISCA.fim}
                  style={{opacity: 0.85}}
                />
              </Enter>

              {/* a ponta: nunca se solta do fim do traço. Clipada pelo prato, ela
                  raspa nas bordas quando entra e quando sai */}
              <Enter
                frame={frame}
                duration={duration}
                start={40}
                enter={1}
                from={{opacity: 0}}
                driftRate={vertical(driftAmbient)}
                style={{position: 'absolute', left: scan - 6, top: EIXO - 20, width: 12, height: 40}}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 6,
                    background: PALETTE.cream,
                    opacity: 0.85 * cabeca,
                  }}
                />
              </Enter>
            </Plate>

            {/* o carimbo é irmão do prato, não filho: o overflow do Plate cortaria
                o disco. Aqui ele herda a deriva do prato e pousa no fim da risca.
                Entrada de 6 f, só escala (classe write-on): é a única coisa do
                frame que pode ter ápice, e o ápice tem de assentar antes da
                cauda — o beat não pode terminar dentro de um overshoot */}
            <Enter
              frame={frame}
              duration={duration}
              start={49}
              enter={MOTION.micro}
              ease="pop"
              from={{scale: 0.62, opacity: 0}}
              driftRate={vertical(driftAmbient)}
              style={{
                position: 'absolute',
                left: RISCA.fim - ESTAMPA / 2,
                top: EIXO - ESTAMPA / 2,
                width: ESTAMPA,
                height: ESTAMPA,
              }}
            >
              <Carimbo size={ESTAMPA} />
            </Enter>
          </Enter>
        </Plate>
      </Enter>
    </StageB>
  );
};

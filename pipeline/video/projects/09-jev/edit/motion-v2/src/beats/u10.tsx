import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {clamp, progress, sweep} from '../kit/curve';
import {sans} from '../kit/fonts';
import {Enter, driftAmbient, driftHero, driftSupport, staggerStart} from '../kit/motion';
import {StageB} from '../kit/Stage';
import {ALPHA, MOTION, PALETTE, RADIUS, TYPE} from '../kit/tokens';
import {Dot, Plate, Rule} from '../kit/ui';

/**
 * u10 — palco B, 35 f (1,17 s). "Encaminha um chamado".
 *
 * O beat é UM gesto: o chamado não é lido, é ROTEADO. O ticket entra com o stub
 * ainda preso embaixo da perfuração, o stub se desprende no f12 e atravessa os
 * 500 px que separam o documento da posição de fila. Sem o voo, sobra um card com
 * uma etiqueta dentro — rótulo, não gesto. Por isso o voo é protegido: o que sai
 * primeiro, se o beat ficar barulhento, é o brilho; o trajeto fica.
 *
 * Três pontos em que o KIT.md corrige o spec, e por quê:
 *
 * - O stub é placa INK com o texto em OURO, não placa ouro com texto ink. Ouro só
 *   vive sobre superfície ink (1,61:1 no creme, 1,18:1 em trilho claro), e `block`
 *   é a superfície do vencedor — uma por beat. Aqui o vencedor é o próprio chamado
 *   encaminhado; o ouro fica com ele.
 * - A borda do slot NÃO fica ouro. Um fio de 2 px em ouro sobre o creme é 1,61:1:
 *   não desenha aresta nenhuma. A recepção é o bloco ink assentando dentro do slot
 *   outline — a fila deixa de estar vazia, e quem diz isso é a superfície.
 * - A entrada do stub é de 12 f (classe `enter`), não 9. O curso de entrada é um
 *   número da classe e sempre foi curto; 500 px não são entrada, são uma ROTA
 *   entre dois objetos que já estão no quadro. Como a rota passa de 1/3 do quadro,
 *   ela é quebrada por uma escala de 5% no próprio trajeto, e a linha de rasgo
 *   fica para trás dizendo de onde ele saiu.
 *
 * Cauda: o último evento novo começa em 18 (o brilho, que fecha em 27 =
 * duration − tail(35)). De 27 ao corte, só as três taxas de deriva.
 */

const ENTRADA = -5;
/** o frame em que o stub se desprende da perfuração — o único gesto do beat */
const RASGO = 12;
/** o brilho começa em 18 e fecha em 27; shineShort = 9 f porque o beat tem < 45 f */
const BRILHO = 18;
/** a escala do trajeto: é ela que quebra o curso de 500 px em dois tempos */
const ESCALA_RASGO = 0.95;

const CARTAO = {x: 80, y: 130, w: 424, h: 380};
const PAD = 36;
/** caixa interna do ticket: 116..468 — o stub nasce exatamente com esta largura */
const DENTRO = {x: CARTAO.x + PAD, w: CARTAO.w - PAD * 2};
const PERF = {top: 372 - CARTAO.y, w: DENTRO.w};

const STUB = {w: 352, h: 76};
const SELO = {x: 600, y: 386, w: 384, h: 92};
/** onde o stub repousa: 16 px de folga em x, 8 em y dentro da posição de fila */
const ASSENTO = {x: SELO.x + 16, y: SELO.y + 8};
const ROTA = ASSENTO.x - DENTRO.x;
/**
 * O `scale` encolhe a caixa em volta do próprio centro, então a borda esquerda
 * anda metade do encolhimento para dentro. Sem devolver isso ao offset de partida,
 * o stub entra no ticket 8,8 px deslocado da perfuração e o rasgo deixa de ler
 * como um só objeto — é o detalhe que sustenta a leitura inteira do beat.
 */
const PARTIDA = -ROTA - (STUB.w * (1 - ESCALA_RASGO)) / 2;

const RAIL = {x: CARTAO.x + CARTAO.w + 8, y: SELO.y + SELO.h / 2 - 1};
const RAIL_W = SELO.x - (CARTAO.x + CARTAO.w) - 16;

/** As partes do ticket. Micro-stagger de 1..3 f: são as partes de UM elemento. */
const PARTES = [
  {id: 'ponto', left: PAD, top: 36, w: 40, h: 40, cor: 'ponto'},
  {id: 'assunto', left: PAD + 56, top: 48, w: 220, h: 16, cor: ALPHA.hairline},
  {id: 'linha1', left: PAD, top: 106, w: 340, h: 14, cor: ALPHA.rule},
  {id: 'linha2', left: PAD, top: 138, w: 280, h: 14, cor: ALPHA.rule},
  {id: 'linha3', left: PAD, top: 170, w: 200, h: 14, cor: ALPHA.rule},
] as const;

/**
 * Perfuração do ticket. O kit não tem tracejado, então o padrão mora aqui — mas
 * quem escreve é a mesma ideia do `Rule`: o traço nunca translada, só cresce (a
 * largura cresce e a calha do traço fica parada, que é o desenho do `scaleX` do
 * kit sem inventar uma segunda família de movimento).
 *
 * Alfa: em 2 px a `rule` (0,14) some no celular, e sem a perfuração o card lê como
 * esqueleto de carregamento, não como ticket. `soft` é o token que sobrevive sem
 * sair da paleta.
 */
const Perfuracao: React.FC<{w: number; draw: number; style?: React.CSSProperties}> = ({
  w,
  draw,
  style,
}) => (
  <div
    style={{
      width: w * clamp(draw),
      height: 2,
      backgroundImage: `repeating-linear-gradient(90deg, ${ALPHA.soft} 0 12px, rgba(0,0,0,0) 12px 22px)`,
      ...style,
    }}
  />
);

/**
 * O brilho da chegada: uma varredura branca recortada pelo r26 da placa. Mora
 * dentro do stub de propósito — o spec já dizia que ela viaja com ele, e o
 * `overflow: hidden` da placa é quem recorta, sem máscara extra.
 * Banda estreita (26% da largura) para ler como acabamento de produto.
 */
const Brilho: React.FC<{p: number}> = ({p}) => {
  const banda = STUB.w * 0.26;
  return (
    <div
      style={{
        position: 'absolute',
        top: -24,
        bottom: -24,
        width: banda,
        left: -banda + p * (STUB.w + banda * 2),
        transform: 'rotate(12deg)',
        background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.38) 50%, rgba(255,255,255,0) 100%)`,
      }}
    />
  );
};

export const U10: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();

  const perfura = progress(frame, {start: 6, enter: MOTION.micro, duration, ease: 'pop'});
  const rota = progress(frame, {start: RASGO, enter: MOTION.micro, duration, ease: 'pop'});
  const brilho = sweep(frame, BRILHO, MOTION.shineShort);

  return (
    <StageB>
      {/* o ticket — a massa maior do quadro e o menor contraste dele: o olho
          entra aqui e é entregue ao stub, que é o único ink saturado do beat */}
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterPlate}
        from={{y: MOTION.travel.plate, scale: 0.98, opacity: 0}}
        driftRate={driftSupport}
        fade={MOTION.fadePlate}
        style={{position: 'absolute', left: CARTAO.x, top: CARTAO.y, width: CARTAO.w, height: CARTAO.h}}
      >
        <Plate tone="sheet" radius={RADIUS.card} style={{width: CARTAO.w, height: CARTAO.h}}>
          {PARTES.map((p, i) => (
            <Enter
              key={p.id}
              frame={frame}
              duration={duration}
              start={staggerStart(i, 2, PARTES.length)}
              enter={MOTION.micro}
              from={{opacity: 0}}
              driftRate={driftAmbient}
              style={{position: 'absolute', left: p.left, top: p.top}}
            >
              {p.cor === 'ponto' ? (
                <Dot size={p.w} />
              ) : (
                <div
                  style={{
                    width: p.w,
                    height: p.h,
                    borderRadius: p.h / 2,
                    background: p.cor,
                  }}
                />
              )}
            </Enter>
          ))}

          {/* a linha de rasgo: fica no card depois que o stub sai — é essa
              residência que faz o stub ler como destacado, e não como um chip
              que se moveu */}
          <Enter
            frame={frame}
            duration={duration}
            start={6}
            enter={MOTION.micro}
            driftRate={driftAmbient}
            style={{position: 'absolute', left: PAD, top: PERF.top}}
          >
            <Perfuracao w={PERF.w} draw={perfura.s} />
          </Enter>
        </Plate>
      </Enter>

      {/* a posição de fila: entra da direita, ou seja, do lado do destino, um
          compasso antes de qualquer coisa viajar */}
      <Enter
        frame={frame}
        duration={duration}
        start={4}
        enter={MOTION.enterPlate}
        from={{x: MOTION.travel.lateral, scale: 0.98, opacity: 0}}
        driftRate={driftHero}
        fade={MOTION.fadePlate}
        style={{position: 'absolute', left: SELO.x, top: SELO.y, width: SELO.w, height: SELO.h}}
      >
        <Plate tone="outline" radius={RADIUS.chip} style={{width: SELO.w, height: SELO.h}}>
          {/* o lugar vazio. Não tem saída desenhada: o stub cobre ele, e um
              objeto opaco escondendo um marcador é a leitura certa de "ocupou" */}
          <Enter
            frame={frame}
            duration={duration}
            start={7}
            enter={MOTION.micro}
            from={{opacity: 0, scale: 0.9}}
            driftRate={driftAmbient}
            style={{
              position: 'absolute',
              left: (SELO.w - 150) / 2,
              top: (SELO.h - 14) / 2,
            }}
          >
            <div
              style={{width: 150, height: 14, borderRadius: 7, background: ALPHA.rule}}
            />
          </Enter>
        </Plate>
      </Enter>

      {/* a rota — desenhada, não glifo. Ela escreve exatamente quando o stub sai,
          e o stub passa por cima dela em voo: é essa sobreposição que dá a
          profundidade, não uma colisão */}
      <Enter
        frame={frame}
        duration={duration}
        start={RASGO}
        enter={MOTION.micro}
        driftRate={driftSupport}
      >
        <Rule
          w={RAIL_W}
          t={2}
          color={ALPHA.rule}
          draw={rota.s}
          style={{position: 'absolute', left: RAIL.x, top: RAIL.y}}
        />
      </Enter>

      {/* o herói: duas entradas no mesmo elemento. A de fora é a do ticket, com o
          MESMO estado de repouso do card, para o stub e o ticket lerem como um
          objeto só até o f12; a de dentro é o rasgo, e só ela carrega a rota.
          Somadas, a deriva dele fica igual à do slot: depois de assentado, os dois
          não podem escorregar um contra o outro até o corte. */}
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterPlate}
        from={{y: MOTION.travel.plate, scale: 0.98, opacity: 0}}
        driftRate={driftAmbient}
        fade={MOTION.fadePlate}
      >
        <Enter
          frame={frame}
          duration={duration}
          start={RASGO}
          enter={MOTION.enter}
          from={{x: PARTIDA, scale: ESCALA_RASGO}}
          driftRate={driftHero}
          style={{position: 'absolute', left: ASSENTO.x, top: ASSENTO.y, width: STUB.w}}
        >
          <Plate tone="block" radius={RADIUS.chip} style={{width: STUB.w, height: STUB.h}}>
            <Brilho p={brilho} />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '100%',
                padding: '0 26px',
                gap: 20,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 34,
                  borderRadius: RADIUS.bar,
                  background: PALETTE.gold,
                  flex: 'none',
                }}
              />
              <div
                style={{
                  fontFamily: sans,
                  fontWeight: 800,
                  fontSize: TYPE.chipLabel,
                  color: PALETTE.gold,
                  lineHeight: 1,
                }}
              >
                chamado
              </div>
            </div>
          </Plate>
        </Enter>
      </Enter>
    </StageB>
  );
};

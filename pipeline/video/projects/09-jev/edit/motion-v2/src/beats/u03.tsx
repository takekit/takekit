import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {curve, progress} from '../kit/curve';
import {sans} from '../kit/fonts';
import {Enter, driftAmbient, driftHero, driftSupport, staggerStart, vertical} from '../kit/motion';
import {StageC} from '../kit/Stage';
import {ALPHA, CHIP, COL, MOTION, PALETTE, RADIUS, TYPE} from '../kit/tokens';
import {Bar, Plate, Rule} from '../kit/ui';

/**
 * u03 — palco C, 40 f (1,33 s). A fala é "é sim ou não", então o canvas é a
 * ESCOLHA e não uma frase: duas opções na mesma coluna, um traço de dobra entre
 * elas. Quem mostra a certeza da máquina é a barra, e é ela que carrega o ouro —
 * o vencedor é expresso por superfície (placa ink) e por ouro dentro dela, nunca
 * por um selo a mais.
 *
 * O beat anterior é palco A (host fechado) e o corte é seco: a entrada começa em
 * -5 para o corte cair sobre a placa já subindo. A cauda (f32..39) não tem ideia
 * nova — o preenchimento ainda cresce, o painel ainda sobe, e nada nasce.
 *
 * Fica sem número de propósito: o % que sobe é o beat interno do u08. Aqui o
 * valor muda, mas quem o mostra é a barra; um contador colado nela seria a mesma
 * informação duas vezes e, com 40 f, uma segunda ideia.
 */

/** frame em que o beat já está em movimento quando o corte cai */
const ENTRADA = -5;
/** duas linhas irmãs: stagger de 4 f (o de 3 f é para grupos de 4+) */
const IRMAOS = 2;

const SIM_TOP = 498;
const SIM_H = 236;
/** trilho do herói. O 8 do kit é o medidor do chip (96 px); esta linha tem 2,5x a altura dele */
const TRILHO_SIM = 22;
/** a folga entre as duas linhas é a dobra da lista; o divisor mora no meio dela */
const FOLGA = 72;
const DIVISOR_Y = SIM_TOP + SIM_H + FOLGA / 2;
const NAO_TOP = SIM_TOP + SIM_H + FOLGA;
const NAO_H = 176;
const TRILHO_NAO = 16;

/**
 * Cada probabilidade é UMA spline monotônica e ela não tem ápice: barra é uma
 * das quatro coisas que o kit proíbe de overshoot, e "entrou e parou" aqui seria
 * o defeito clássico — em f39 o ouro ainda anda ~1 px/f, que é o sustain que o
 * storyboard pede. O ouro parte em f5 para o riser do spec (f3, ~10 f) pegar a
 * fase rápida e decair junto com a chegada da linha do NÃO, sem hit.
 */
const OURO = curve([
  [5, 0],
  [11, 0.34],
  [17, 0.6],
  [23, 0.702],
  [30, 0.729],
  [39, 0.74],
]);
/* eco mudo na opção perdedora: entra depois da metade e fica no 1/8 do trilho */
const ECO = curve([
  [19, 0],
  [24, 0.055],
  [30, 0.095],
  [39, 0.115],
]);

/**
 * Uma linha da lista: rótulo grande à esquerda, medidor colado na borda de baixo
 * e recortado pelo raio da placa — o mesmo desenho do Chip do kit, na escala
 * desta peça (lá o rótulo é 34, aqui o par é 72/56 e a diferença de peso é o que
 * separa vencedor de perdedor). O rótulo entra por `label=` para o lint de
 * glifos conferir "SIM"/"NÃO" contra a Hetrixo.
 *
 * `boxSizing` é o único estilo estático do arquivo e existe por um motivo só: a
 * placa de contorno tem hairline de 1,5 px e, em content-box, a borda direita
 * cairia em x=1003, fora da faixa x≤1000 do palco C.
 */
const Linha: React.FC<{
  tone: 'block' | 'outline';
  h: number;
  trilho: number;
  label: string;
  tamanho: number;
  cor: string;
  pct: number;
}> = ({tone, h, trilho, label, tamanho, cor, pct}) => (
  <Plate
    tone={tone}
    radius={RADIUS.plate}
    style={{width: COL.w, height: h, boxSizing: 'border-box'}}
  >
    <div
      style={{
        position: 'absolute',
        // CHIP.pad é o recuo interno do chip do kit: o rótulo das duas linhas
        // cai em x=110, o mesmo eixo dos chips do u01 num corte B→C→B
        left: CHIP.pad,
        top: (h - trilho - tamanho) / 2,
        fontFamily: sans,
        fontWeight: 800,
        fontSize: tamanho,
        lineHeight: 1,
        letterSpacing: tamanho * 0.02,
        color: cor,
      }}
    >
      {label}
    </div>
    <Bar
      pct={pct}
      w={COL.w}
      h={trilho}
      radius={RADIUS.bar}
      onInk={tone === 'block'}
      fill={tone === 'outline' ? PALETTE.muted : undefined}
      style={{position: 'absolute', left: 0, bottom: 0}}
    />
  </Plate>
);

export const U03: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  // régua é micro classe: 6 f de write-on, sem curso
  const escreve = progress(frame, {start: 9, enter: MOTION.micro, duration, ease: 'pop'});

  return (
    <StageC>
      {/* SIM — o vencedor do beat: a única superfície ink e o único ouro do frame */}
      <Enter
        frame={frame}
        duration={duration}
        start={staggerStart(0, ENTRADA, IRMAOS)}
        enter={MOTION.enterPlate}
        // pop = o ápice é um nó da própria spline, então a placa chega com snap
        // e volta — é o overshoot curto do brief, sem uma segunda curva de easing
        ease="pop"
        from={{y: MOTION.travel.plate, scale: 0.94, opacity: 0}}
        driftRate={vertical(driftHero)}
        fade={MOTION.fadePlate}
        style={{position: 'absolute', left: COL.x, top: SIM_TOP, width: COL.w}}
      >
        <Linha
          tone="block"
          h={SIM_H}
          trilho={TRILHO_SIM}
          label="SIM"
          tamanho={TYPE.heroLabel}
          cor={PALETTE.cream}
          pct={OURO(frame)}
        />
      </Enter>

      {/* a dobra da lista: não é borda de card, é a costura que faz as duas linhas
          lerem como um componente só — por isso a régua, e não um segundo painel.
          A camada entra em -5 como a ambiente do u01, e não em 9: a entrada dela
          é o write-on (a régua só escala, 0 px de curso), então o Enter aqui é só
          o carregador de deriva — começando em 9 a deriva só nasceria em f15 e o
          transform ficaria idêntico por 15 frames, que é o defeito que o kit
          proíbe. Em -5 a deriva existe desde o frame 0 e a régua continua
          invisível até f9, porque até lá a largura dela é zero. */}
      <Enter
        frame={frame}
        duration={duration}
        start={-5}
        enter={1}
        from={{opacity: 0}}
        driftRate={vertical(driftAmbient)}
        style={{position: 'absolute', left: COL.x, top: DIVISOR_Y, width: COL.w}}
      >
        <Rule w={COL.w} t={2} color={ALPHA.rule} draw={escreve.s} />
      </Enter>

      {/* NÃO — a outra opção, no contorno: clara, muda e 4 f atrás da vencedora.
          Mesmo componente e mesmo eixo; o que muda é superfície, tamanho e cor */}
      <Enter
        frame={frame}
        duration={duration}
        start={staggerStart(1, ENTRADA, IRMAOS)}
        enter={MOTION.enterPlate}
        from={{y: MOTION.travel.plate, scale: 0.96, opacity: 0}}
        driftRate={vertical(driftSupport)}
        fade={MOTION.fadePlate}
        style={{position: 'absolute', left: COL.x, top: NAO_TOP, width: COL.w}}
      >
        <Linha
          tone="outline"
          h={NAO_H}
          trilho={TRILHO_NAO}
          label="NÃO"
          tamanho={TYPE.cardTitle}
          cor={PALETTE.muted}
          pct={ECO(frame)}
        />
      </Enter>
    </StageC>
  );
};

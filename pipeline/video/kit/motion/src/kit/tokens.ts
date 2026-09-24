/**
 * Canvas palco B/C — tokens (aprovado no 09-jev, default do formato).
 *
 * Uma fonte de verdade para paleta, grade, palcos e o motion language.
 * Nenhum beat pode guardar um número de movimento próprio: se um beat precisa
 * de outro número, o número errado é o do beat.
 *
 * Os valores não são gosto. Saem de duas medições: a curva
 * monotônica de entrada+deriva dos motions aprovados e o motor de referência em
 * `video/projects/000-video-to-copy/` (medido em frames a 30 fps).
 */

export const FPS = 30;
export const W = 1080;
export const H = 1920;

/** Paleta aprovada. Sem neon, sem chroma, sem cor de fora desta lista. */
export const PALETTE = {
  cream: '#F4EFE6',
  ink: '#1C1A18',
  muted: '#5A544E',
  gold: '#F4B400',
  white: '#FFFFFF',
} as const;

/** Derivados — sempre alfa sobre a paleta, nunca uma cor nova. */
export const ALPHA = {
  /** borda da folha: o único jeito de uma placa clara ter aresta no creme */
  hairline: 'rgba(28,26,24,0.18)',
  rule: 'rgba(28,26,24,0.14)',
  /** trilho vazio. 0.08 some no celular e não desenha o slot */
  track: 'rgba(28,26,24,0.16)',
  /** trilho sobre placa ink */
  trackOnInk: 'rgba(244,239,230,0.18)',
  slot: 'rgba(28,26,24,0.16)',
  soft: 'rgba(90,84,78,0.32)',
  plateShadow: '0 10px 22px rgba(28,26,24,0.10)',
  plateLift: '0 18px 38px rgba(28,26,24,0.16)',
} as const;

/**
 * Palco B — overlay SÓ de gráfico, sobre bake transparente.
 * O creme e o card do host vêm de `overlay/hostB_*.mov`.
 * Regra dura: todo pixel abaixo de `splitY` é alfa 0, em todo frame.
 */
export const STAGE_B = {
  splitY: 960,
  x0: 80,
  x1: 1000,
  y0: 180,
  /** repouso mais baixo permitido: abaixo disso o gráfico cobre a caption */
  restBottom: 620,
  y1: 640,
  /** topo da caixa da eyebrow: o cap-top cai em ~184 */
  eyebrowTop: 180,
  /**
   * A caption do palco B mora no vão de creme ACIMA da cabeça do host, não
   * abaixo dela: é por isso que a faixa quieta fecha em 800 e não em 960.
   */
  quiet: [640, 800] as const,
};

/** Palco C — creme opaco full frame. */
export const STAGE_C = {
  x0: 80,
  x1: 1000,
  y0: 200,
  restBottom: 1400,
  y1: 1400,
  eyebrowTop: 320,
  quiet: [1500, 1750] as const,
};

/**
 * Zona morta do topo: a UI do Instagram come y=0..180 no Reels. Nada opaco entra
 * aí, nos dois palcos.
 */
export const IG_SAFE_TOP = 180;

/**
 * Descida do grupo inteiro, por palco.
 *
 * É uma TRANSLAÇÃO aplicada no wrapper do palco: a composição de cada beat
 * continua sendo a aprovada, só mora mais embaixo. Os beats seguem escritos nas
 * coordenadas originais, e quem as desloca é <StageB>/<StageC>.
 */
export const STAGE_SHIFT = {B: 160, C: 200} as const;

/**
 * Encaixe default do palco B. A faixa útil tem 440 px (180..620).
 * O beat pode sobrescrever em `beats.json` → `fit`. Números finais saem de
 * `tools/verify.py` (clipe inteiro), nunca de amostra de frames.
 */
export const STAGE_B_FIT_DEFAULT = {shift: 104, scale: 1} as const;

/**
 * As faixas dos palcos acima são coordenada FINAL de tela (é o que o Grok mede
 * na timeline e o que `tools/audit.py` confere). Os beats são escritos no espaço
 * de ANTES do encaixe, porque quem desce (e, no B, encolhe) o grupo é o wrapper
 * do palco.
 */
export const toLocal = (stage: 'B' | 'C', y: number) => y - STAGE_SHIFT[stage];

/**
 * Topo da caixa da eyebrow NO ESPAÇO DO BEAT.
 *
 * No B não é `restBottom − shift`: o shift é por beat (STAGE_B_FIT) e saiu de
 * medir estes layouts, então mexer aqui invalidaria a tabela. 92 é onde a
 * eyebrow de fato mora nos beats; o encaixe a leva para a faixa final.
 */
export const EYEBROW = {
  B: 92,
  C: toLocal('C', STAGE_C.eyebrowTop),
} as const;

/** Largura útil da coluna de conteúdo, nos dois palcos. */
export const COL = {x: 80, w: 920, cx: 540} as const;

/**
 * Motion language travado.
 *
 * Regra mestra: entrada e deriva são UMA função
 * contínua e a velocidade NUNCA é zero — nem no frame do corte. Aqui isso é
 * estrutural: a deriva é uma TAXA (px/s) medida a partir do fim do beat, então
 * a tangente que entra no corte vale exatamente a taxa. A versão anterior
 * guardava a deriva como total, o que congelava o beat longo (190 f a 0,03 px/f)
 * e zerava a velocidade justo no corte — o "entrou e parou" que o brief proíbe.
 */
export const MOTION = {
  /** unidade atômica: 12 f a 30 fps = 0,400 s */
  base: 12,
  micro: 6,
  /** entradas, pela classe do objeto */
  enter: 12, // chip, pill, label
  enterPlate: 16, // placa, card, tile
  enterHero: 20, // marca, número, wordmark
  /** fade de opacidade: LINEAR e curto. O transform carrega a vida, não o fade */
  fade: 6,
  fadePlate: 8,
  /** eventos de luz */
  shine: 13,
  shineShort: 9, // em beat com menos de 45 f
  breath: 10,
  /** ritmo de grupo */
  stagger: 4,
  stagger4: 3, // grupo com 4+ irmãos
  microStagger: 1, // entre as partes de UM elemento
  /** teto de um ápice: um por propriedade, e nunca terminando nele */
  apex: {scale: 0.02, px: 8, rot: 8},
  /**
   * Deriva em px por segundo, medida a partir do fim do beat. As três camadas
   * andam no MESMO sentido (paralaxe), nunca em sentidos opostos.
   */
  driftRate: {
    hero: {x: 12, y: -10, scale: 0.0015},
    support: 0.6,
    ambient: 0.3,
  },
  /** piso e teto da taxa: abaixo de 0.20 px/f o beat lê como parado */
  driftFloor: 6, // px/s
  driftCeil: 18, // px/s
  /** curso de entrada por classe. Nada voa de fora do quadro */
  travel: {micro: 0, chip: 42, plate: 32, hero: 30, lateral: 24},
} as const;

/** Frames que podem ser os últimos de um beat sem nenhum evento novo. */
export const tail = (duration: number) => Math.max(8, 0.15 * duration);

/** Escala tipográfica, travada. Hetrixo é UI/número; Alvito só num acento. */
export const TYPE = {
  heroNumber: 232,
  bigNumber: 132,
  heroLabel: 72,
  cardTitle: 56,
  chipValue: 52,
  chipLabel: 34,
  unit: 88,
  accent: 62,
  logoCaption: 30,
  smallCaps: 24,
  microLabel: 20,
} as const;

export const FONT = {
  sans: 'Hetrixo',
  /** Alvito Nova Comp: o corte bolditalic é o que entrega a cursiva do brief */
  cursive: 'Alvito',
} as const;

export const RADIUS = {
  chip: 26,
  card: 34,
  plate: 44,
  bar: 4,
} as const;

/** Métricas do chip de decisão, medidas na referência. */
export const CHIP = {
  w: COL.w,
  h: 96,
  pad: 30,
  /** x do rótulo, a partir da borda esquerda do chip */
  labelX: 36,
  /** borda direita do valor */
  valueRight: 36,
  gap: 14,
} as const;

/** Duração e palco vêm de `beats.json` (src_out − src_in de cuts.json). */

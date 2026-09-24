/**
 * Curva de movimento frame-driven para Remotion.
 *
 * Curva cúbica monotônica (Fritsch–Carlson) sobre pontos de controle, amostrada
 * por frame. Monotônica de propósito: uma spline comum passa do alvo entre dois
 * nós e devolve aquele respiro no fim do movimento; aqui a derivada é limitada
 * pela secante, então aproximar nunca ultrapassa e nunca inverte.
 *
 * Consequência de projeto: **a única maneira de um elemento ter overshoot é um
 * nó de ápice explícito na lista**. Não existe curva "com bounce" no kit — e por
 * isso não existe uma segunda família de easing no filme.
 *
 * Cada frame é função pura do número do frame. Nada de estado, timer ou random.
 */

export type Point = readonly [number, number];

/** [(frame, valor)] → f(frame): cúbica monotônica, C1 nos nós. */
export function curve(points: readonly Point[]): (t: number) => number {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) throw new Error('curve precisa de 2+ pontos');
  const ts = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1]);
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i + 1] <= ts[i]) throw new Error(`tempos devem ser crescentes: ${ts.join(',')}`);
  }

  const n = pts.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]));

  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push((d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);

  // limita a tangente à secante (garante que o trecho não ultrapassa os nós)
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    if (a * a + b * b > 9) {
      const k = 3 / Math.sqrt(a * a + b * b);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }

  return (t: number) => {
    if (t <= ts[0]) return vs[0];
    if (t >= ts[n - 1]) return vs[n - 1];
    let i = n - 2;
    for (let j = 0; j < n - 1; j++) {
      if (ts[j] <= t) i = j;
    }
    const h = ts[i + 1] - ts[i];
    const u = (t - ts[i]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * vs[i] +
      (u3 - 2 * u2 + u) * h * m[i] +
      (-2 * u3 + 3 * u2) * vs[i + 1] +
      (u3 - u2) * h * m[i + 1]
    );
  };
}

/** Acrescenta um micro-passo no início: o movimento parte do repouso, não no talo. */
export function settle(points: readonly Point[], frames = 2, span = 0.12): Point[] {
  const [t0, v0] = points[0];
  const [, v1] = points[1];
  return [[t0, v0], [t0 + frames, v0 + (v1 - v0) * span], ...points.slice(1)];
}

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type Progress = {
  /** entrada normalizada: 0 no repouso, 1 no lugar. Pode passar de 1 no ápice. */
  s: number;
  /** deriva normalizada: 0 quando a deriva começa, 1 no frame do corte. */
  tail: number;
  settled: boolean;
};

export type Ease = 'enter' | 'pop' | 'rise';

export type ProgressOpts = {
  /** frame local em que a entrada começa. Negativo = o corte cai em movimento. */
  start?: number;
  /** duração da entrada, em frames */
  enter?: number;
  /** último frame do beat (o corte) */
  duration: number;
  ease?: Ease;
};

/**
 * Entradas — todas da MESMA família. O ápice do `pop` é um nó, não uma fórmula:
 * era a única coisa no kit que vinha de fora da spline.
 */
const knots = (ease: Ease, enter: number, apex: number): Point[] => {
  if (ease === 'rise') {
    return [
      [0, 0],
      [enter * 0.5, 0.62],
      [enter, 1],
    ];
  }
  if (ease === 'pop') {
    return [
      [0, 0],
      [enter * 0.6, 0.9],
      [enter, 1 + apex],
      [enter + 6, 1],
    ];
  }
  return [
    [0, 0],
    [enter * 0.55, 0.84],
    [enter, 1],
  ];
};

/**
 * O primitivo central do motion language.
 *
 * `s` é a entrada; `tail` é a fração de deriva já percorrida. Os dois vêm do
 * mesmo relógio e a posição final é a soma — é isso que faz a velocidade nunca
 * chegar a zero no meio do beat.
 */
export function progress(frame: number, opts: ProgressOpts): Progress {
  const start = opts.start ?? 0;
  const enter = Math.max(1, opts.enter ?? 12);
  const duration = Math.max(2, opts.duration);
  const t = frame - start;

  const apex = opts.ease === 'pop' ? 0.02 : 0;
  const shape = curve(knots(opts.ease ?? 'enter', enter, apex));
  const s = t <= 0 ? 0 : shape(t);

  const from = start + enter;
  const span = Math.max(1, duration - from);
  return {s, tail: clamp((frame - from) / span), settled: frame >= from};
}

export type Target = {x?: number; y?: number; scale?: number; rotate?: number; opacity?: number};
export type From = Target;

export type DriftRate = {x?: number; y?: number; scale?: number; rotate?: number};

export type ResolveOpts = ProgressOpts & {
  /** px/segundo. Medido a partir do fim da entrada — a tangente do corte É a taxa */
  driftRate?: DriftRate;
  /** frames do fade de opacidade. Linear, curto, e só no começo */
  fade?: number;
};

/**
 * Teto de curso da deriva, em px. Sem ele a taxa constante jogaria um beat de
 * 6,3 s a 76 px do lugar — muito para um canvas de 920. Com o teto, o beat longo
 * continua com a mesma velocidade *física* (nunca zero), só que a taxa desce até
 * caber no orçamento: 190 f a 9 px/s dá os mesmos 0,30 px/f do beat de 2 s.
 */
export const DRIFT_TRAVEL_CAP = 44;

export type Resolved = {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
  progress: Progress;
};

/**
 * Resolve um alvo no frame: `from` → `to` pela entrada, mais a deriva somada no
 * mesmo relógio. Depois de "chegar", o elemento continua andando — de propósito,
 * e a uma taxa constante, para que o beat curto e o longo tenham a mesma
 * velocidade física.
 */
export function resolve(frame: number, to: Target, from: From, opts: ResolveOpts): Resolved {
  const p = progress(frame, opts);
  const rate = opts.driftRate ?? {};
  const fade = Math.max(1, opts.fade ?? 6);

  // A deriva começa quando a entrada termina: assim ela não briga com o `from`
  // (somar as duas no frame 0 faria o elemento "entrar" na direção da deriva).
  // Daí em diante anda a uma taxa CONSTANTE até o corte — tangente nunca nula.
  const afterEnter = (opts.start ?? 0) + Math.max(1, opts.enter ?? 12);
  const seconds = Math.max(0, frame - afterEnter) / 30;

  const cap = DRIFT_TRAVEL_CAP / Math.max(1 / 30, opts.duration / 30);
  const dr = (v?: number) => {
    const raw = v ?? 0;
    if (raw === 0) return 0;
    const bounded = Math.min(Math.abs(raw), cap) * Math.sign(raw);
    return bounded * seconds;
  };

  return {
    x: lerp(from.x ?? 0, to.x ?? 0, p.s) + dr(rate.x),
    y: lerp(from.y ?? 0, to.y ?? 0, p.s) + dr(rate.y),
    scale: lerp(from.scale ?? 1, to.scale ?? 1, p.s) + dr(rate.scale),
    rotate: lerp(from.rotate ?? 0, to.rotate ?? 0, p.s) + dr(rate.rotate),
    // opacidade não deriva e não é splinada: chega e fica
    opacity: clamp(lerp(from.opacity ?? 1, to.opacity ?? 1, clamp((frame - (opts.start ?? 0)) / fade))),
    progress: p,
  };
}

/** Fade linear para o que aparece já no lugar (régua, fundo de faixa). */
export const fadeIn = (frame: number, start: number, dur: number) =>
  clamp((frame - start) / Math.max(1, dur));

/** 0→1 uma única vez. Para o shine, que não deixa estado no frame seguinte. */
export const sweep = (frame: number, start: number, dur: number) =>
  clamp((frame - start) / Math.max(1, dur));

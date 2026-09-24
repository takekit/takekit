/** Contrato de um beat de canvas. O vídeo preenche isto; o kit anima. */

export type Palco = 'B' | 'C';

export type Fit = {shift: number; scale: number};

export type PatternId =
  | 'chips-decision'
  | 'binary-bar'
  | 'logo-shine'
  | 'chips-list'
  | 'winner-pct'
  | 'card-list'
  | 'card-stamp'
  | 'chips-choice'
  | 'hero-range'
  | 'timer';

export type ChipRow = {label: string; pct: number; winner?: boolean};

export type CardItem = {label: string; letter?: string};

export type ChoiceOpt = {id: string; name: string};

export type BeatSpec = {
  id: string;
  palco: Palco;
  frames: number;
  pattern: PatternId;
  /** Encaixe medido. Sem isto, palco B usa o default do kit. */
  fit?: Fit;
  eyebrow?: string;
  inputs: Record<string, unknown>;
};

export type MotionJob = {
  project: string;
  fps: 30;
  beats: BeatSpec[];
};

export const PATTERNS: PatternId[] = [
  'chips-decision',
  'binary-bar',
  'logo-shine',
  'chips-list',
  'winner-pct',
  'card-list',
  'card-stamp',
  'chips-choice',
  'hero-range',
  'timer',
];

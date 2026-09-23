import type React from 'react';
import {BEAT_FRAMES, BEAT_STAGE} from '../kit/tokens';
import {U01} from './u01';
import {U03} from './u03';
import {U04} from './u04';
import {U05} from './u05';
import {U07} from './u07';
import {U08} from './u08';
import {U09} from './u09';
import {U10} from './u10';
import {U11} from './u11';
import {U12} from './u12';
import {U13} from './u13';
import {U14} from './u14';

export type BeatDef = {
  id: string;
  /** 1080x1920, 30fps — declarado no Root, não no beat */
  Comp: React.FC;
};

/** Um beat por composição. A duração vem de cuts.json, não do beat. */
export const BEATS: BeatDef[] = [
  {id: 'u01', Comp: U01},
  {id: 'u03', Comp: U03},
  {id: 'u04', Comp: U04},
  {id: 'u05', Comp: U05},
  {id: 'u07', Comp: U07},
  {id: 'u08', Comp: U08},
  {id: 'u09', Comp: U09},
  {id: 'u10', Comp: U10},
  {id: 'u11', Comp: U11},
  {id: 'u12', Comp: U12},
  {id: 'u13', Comp: U13},
  {id: 'u14', Comp: U14},
];

/** u01_B.mov, u13_C.mov — o nome do arquivo carrega o palco. */
export const outputName = (id: string) => `${id}_${BEAT_STAGE[id]}`;

export const framesOf = (id: string) => BEAT_FRAMES[id];

export {BEAT_FRAMES, BEAT_STAGE};

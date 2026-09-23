import type React from 'react';
import {U01} from './u01';

export type BeatDef = {id: string; Comp: React.FC};

/** Exemplo do kit. O scaffold do vídeo gera os stubs do projeto. */
export const BEATS: BeatDef[] = [{id: 'u01', Comp: U01}];

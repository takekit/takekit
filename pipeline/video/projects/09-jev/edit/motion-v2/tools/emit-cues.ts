/**
 * Escreve o `sfx-cues.json` entregue a partir de `src/cues.ts`.
 *
 * O JSON e o código do beat saem da mesma lista: não há como o cue entregue
 * discordar do movimento que o motiva.
 *
 *     bun tools/emit-cues.ts
 */
import {writeFileSync} from 'node:fs';
import {CUES} from '../src/cues';

const dest = new URL('../sfx-cues.json', import.meta.url).pathname;

const linhas = CUES.map(
  (c) => `  {"uid": ${JSON.stringify(c.uid)}, "t_local_f": ${c.t_local_f}, "kind": ${JSON.stringify(c.kind)}, "why": ${JSON.stringify(c.why)}}`,
);

writeFileSync(dest, `[\n${linhas.join(',\n')}\n]\n`, 'utf8');
console.log(`escrito ${dest} — ${CUES.length} cues`);

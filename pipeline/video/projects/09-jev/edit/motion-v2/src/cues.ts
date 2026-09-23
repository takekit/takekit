/**
 * Fonte única dos SFX. `tools/emit-cues.ts` escreve `../sfx-cues.json` a partir
 * daqui, então o JSON entregue e o código do beat nunca divergem.
 *
 * Tempo é LOCAL ao clipe: frame 0 é o primeiro frame do beat. Quem mapeia para a
 * timeline é o outro agente.
 *
 * Regra de escolha: o SFX existe porque o movimento existe, não para preencher o
 * beat. `snap` para uma chegada, `click` para uma troca de estado, `whoosh` para
 * um gesto que varre, `riser` para algo que sobe, `reveal` para o que abre a cena.
 * Silêncio é resposta legítima para apoio e para o shine (o repertório do projeto
 * trata canvas como silencioso por padrão).
 */

export type CueKind = 'snap' | 'click' | 'whoosh' | 'riser' | 'reveal';

export type Cue = {
  uid: string;
  t_local_f: number;
  kind: CueKind;
  why: string;
};

export const CUES: Cue[] = [
  // u01 — três decisões caindo; o vencedor troca de estado no fim
  {uid: 'u01', t_local_f: 0, kind: 'snap', why: 'o corte cai com os três chips já entrando'},
  {uid: 'u01', t_local_f: 40, kind: 'click', why: 'financeiro vira placa ink: é o vencedor'},

  // u03 — SIM chega com o ápice da spline; o ouro sobe o beat inteiro
  {uid: 'u03', t_local_f: 0, kind: 'snap', why: 'a placa SIM pousa já no corte'},
  {uid: 'u03', t_local_f: 5, kind: 'riser', why: 'a barra de probabilidade do SIM começa a encher'},

  // u04 — a íris abre o selo JEV; o shine fica mudo (som em brilho é decoração)
  {uid: 'u04', t_local_f: 0, kind: 'reveal', why: 'a íris abre o mark JEV no corte'},

  // u05 — um hit só, quando a marca assenta e a luz a pega
  {uid: 'u05', t_local_f: 16, kind: 'reveal', why: 'o knot do ChatGPT assenta e o primeiro passe de luz entra'},

  // u07 — a lista aparece; um snap na abertura, o resto do stagger é rápido demais para pontuar
  {uid: 'u07', t_local_f: 0, kind: 'snap', why: 'os chips de opção começam a entrar em fila'},

  // u08 — o número vive: sobe e trava
  {uid: 'u08', t_local_f: 12, kind: 'riser', why: 'o % do vencedor começa a subir'},
  {uid: 'u08', t_local_f: 58, kind: 'snap', why: 'o valor trava em 94'},

  // u09 — o card chega, o email é classificado
  {uid: 'u09', t_local_f: 0, kind: 'snap', why: 'o card inbox pousa no corte'},
  {uid: 'u09', t_local_f: 16, kind: 'click', why: 'o email recebe a etiqueta: classificado'},

  // u10 — o canhoto do chamado é rasgado e voa até o destino
  {uid: 'u10', t_local_f: 12, kind: 'whoosh', why: 'o canhoto do ticket voa para a rota'},

  // u11 — o desconto inventado é riscado e carimbado como recusado
  {uid: 'u11', t_local_f: 40, kind: 'click', why: 'o traço risca o desconto'},
  {uid: 'u11', t_local_f: 49, kind: 'snap', why: 'o carimbo de recusa bate'},

  // u12 — três modelos pousam, um é escolhido
  {uid: 'u12', t_local_f: 0, kind: 'snap', why: 'as três placas de modelo pousam em cascata'},
  {uid: 'u12', t_local_f: 28, kind: 'click', why: 'ChatGPT vira placa ink: é o escolhido'},

  // u13 — a medida longa: entra o 5, entra o 18, o × trava, a régua fecha.
  // Os frames são os das entradas em src/beats/u13.tsx: o cue marca o começo do
  // gesto, não a chegada.
  {uid: 'u13', t_local_f: 0, kind: 'reveal', why: 'o 5 já está chegando quando o corte cai'},
  {uid: 'u13', t_local_f: 20, kind: 'snap', why: 'o 18 entra: é o resultado da medida'},
  {uid: 'u13', t_local_f: 46, kind: 'click', why: 'o × trava a unidade'},
  {uid: 'u13', t_local_f: 62, kind: 'whoosh', why: 'a régua ouro fecha a medida inteira'},
  {uid: 'u13', t_local_f: 126, kind: 'reveal', why: 'o acento cursivo entra por último'},

  // u14 — o mostrador corre e trava
  {uid: 'u14', t_local_f: 0, kind: 'riser', why: 'o contador corre de 1,00 para baixo'},
  {uid: 'u14', t_local_f: 48, kind: 'snap', why: 'o contador trava em 0,50 s'},
];

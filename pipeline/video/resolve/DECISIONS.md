# DECISIONS — receitas históricas e observações técnicas

> Direção vigente em WORKFLOW.md e FUSION.md. Números ligados ao footage 02/04 são calibrações
> locais. Não copiar cadência, split ou overlay externo para um novo perfil sem avaliar o caso.

O WORKFLOW contém os critérios atuais. Este arquivo preserva escolhas feitas na edição do
`02-muse-v2` (12/09/2026) e ajustes do 04, no formato situação → decisão → por quê → verificação.
Consultar os trechos relevantes como estudo de caso. Termos absolutos nas tabelas abaixo
descrevem aquele tratamento histórico, não regras para todo vídeo. Isso inclui quotas, layouts,
reconstrução da timeline e promoção automática de ajustes a defaults.

**Superado para novas edições:** pausas dramáticas, respiros preservados, caudas fixas, revisão
por apenas três cortes e alteração do CTA abaixo são histórico, não orientação vigente.
O contrato obrigatório de `WORKFLOW.md`, §3, define roteiro, montagem nativa e revisão integral.
Word-level e `silencedetect` são pistas; não são medidas definitivas das bordas da fala.

Para novas escolhas, registrar o escopo no projeto; promover preferências gerais somente quando
essa for a intenção do usuário. Verificar layout por captura nativa e movimento/áudio por playback.

---

## 0. Método usado naquele projeto

| situação | decisão | por quê | como verificar |
|---|---|---|---|
| Vai aplicar qualquer coisa nova no Resolve | Testa num **trecho curto** e captura frames reais da timeline via ferramenta de capture ou ExportCurrentFrameAsStill antes de aplicar no vídeo inteiro | Render do vídeo todo custa 2 min; um frame errado custa 10 s. Vários bugs só apareceram no sheet (crop apagou o A-roll, gap de 1 frame, legenda invadindo split) | Abrir capturas nativas (pipeline/capture_frame.py); playback no Resolve para motion |
| Precisa saber onde algo está no tempo (palavra, burn, botão) | **Mede**, não estima: word-level da transcrição, `silencedetect`, strip com `fps=2` e timestamps | Estimativa de "uns 2 s" errou toda vez (booking meetings era 0,5 s, não 3 s) | listar frames/tempos antes de posicionar |
| Está calibrando unidade desconhecida da API (Tilt, Crop, Zoom) | Aplica valor redondo, renderiza 1 frame, mede o deslocamento em px, deriva o fator | Unidades mudam por clipe/resolução (Tilt de clipe 4K ≠ clipe 1080p) | still → medir com régua/PIL |
| Algo saiu diferente do esperado | Volta e **lê o estado real** (`GetItemListInTrack`, props) em vez de assumir | V1 apareceu sobrescrita, timeline mudou de projeto, PNG virou 150 frames | script de diagnóstico antes de corrigir |
| Usuário aprovou algo | Registrar preset e escopo (projeto/perfil/marca); promover a regra global só quando for preferência geral | O que não vira arquivo evapora na próxima sessão | `presets.py list` mostra |

---

## Fase 0 — Plano por frase

| situação | decisão | por quê | como verificar |
|---|---|---|---|
| Footage tem retomadas (mesma frase 2x) | Comparar clareza, performance e intenção; a última é apenas candidata | Segunda tomada é a que o criador quis; primeira costuma ter hesitação | ler as duas no word-level; comparar duração e "(...)" internos |
| Escolher dispositivo por frase | Pergunta: **o que a frase mostra?** Nome de produto/empresa → material oficial (split). Número/dinheiro/tempo → counter. Ação do sistema (aprovar, notificar) → notificação. Conceito abstrato ("instrução escondida") → card. Só fala → legenda | Dispositivo tem que ilustrar, não decorar. Ícone genérico = decoração (reprovado) | cada beat tem 1 dispositivo e você sabe dizer o que ele mostra |
| Escolher palavra-herói | Número > substantivo concreto > verbo forte > adjetivo. Nunca palavra de passagem. Em "130 mil dólares" o herói é "130 mil" (número + unidade), não "dólares" | Herói é o que o olho lê se ler uma palavra só | `auto_blocks` já faz; revisar o `blocks_auto.json` |
| Frase longa (> 4 palavras) sem herói óbvio | Quebra em 2 blocos na pausa/vírgula; cada um com seu herói | Bloco de 6 palavras vira parágrafo, não legenda | nenhum bloco > 4 palavras (exceto pre-texto 5 com stopword empurrada) |
| CTA final | Pergunta direta ao público (não imperativo) + "comenta" **separado** e depois | Pergunta prende; o comando vem quando a pessoa já respondeu na cabeça | roteiro: pergunta → pausa → comenta |

---

## Fase 2 — Corte

| situação | decisão | por quê | como verificar |
|---|---|---|---|
| Limiar de silêncio | −33 dB / 220 ms, cauda **3 frames** de cada lado | 250 ms comia respiração que dá ritmo; sem cauda a palavra "engasga" | ouvir 3 cortes aleatórios; nenhum começa no meio de consoante |
| Pausa dramática (antes de "o furo", antes de "Você deixaria") | Marcar e preservar antes do corte automático; duração acompanha a fala, não um número fixo | Automático não sabe o que é suspense | marcar no plan.json `pause_before: true` |
| Acelerar 1.05x | Só se o usuário aprovar; fazer **na fonte** (ffmpeg atempo) e reescalar os cortes | Retime na API não existe; fazer na fonte mantém cada segmento como clipe separado (pra comps) | frames = round(src/1.05); total bate |
| Split/dispositivo começa no meio de um clipe | **Adiciona corte extra** naquele frame e reconstrói a timeline | Propriedades (Tilt/Crop/comp) são por clipe; não dá pra animar entrada de split via props | o clipe novo começa exatamente na palavra |

---

## Fase 3 — Gancho

| situação | decisão | por quê | como verificar |
|---|---|---|---|
| Alinhar film burn | **Pico** (frame mais claro) do burn no frame 0 do vídeo; burn começa antes do 0 (startFrame do asset = pico − ~6) | Flash tem que coincidir com o primeiro frame visível; o "sobe" do burn fica fora | sheet frames 0,3,6,10: 0 é o mais claro |
| Duração do burn | 18 frames, não o asset inteiro (44) | Legenda entra no frame ~5; burn longo mata o contraste do texto | frame 8: texto já legível |
| Burn procedural vs real | Real (pack de editor) sempre que houver. Procedural só fallback | Usuário reprovou o procedural na hora ("baixa da internet, feito por editor") | ledger com origem |
| 3 takes do gancho | Variar **1 variável por take** (burn A / burn B / sem burn), nunca 3 coisas | Se mudar tudo, a aprovação não ensina nada | takes diferem em 1 parâmetro nomeado |

---

## Fase 4 — Legendas

| situação | decisão | por quê | como verificar |
|---|---|---|---|
| Legenda perto de dispositivo (split, card, counter, notificação) | Legenda **some antes** do dispositivo entrar (`cut_at` no bloco anterior) e não existe durante | Duas coisas competindo = nenhuma lida. Hold de 40 f do bloco vazava pra dentro do split | frame de início do dispositivo: zero legenda |
| Legenda de callback ("funciona") junto com card pequeno | Card vai pra **cima** da zona de legenda (y 1120, scale 0.45) | Legenda tem prioridade na zona 1300–1450 | frame: card e legenda não se tocam |
| Palavra-herói que é número + unidade | Herói de 2 palavras ("130 mil") | "130" sozinho não significa nada | blocks: `['130 mil','b']` |
| Stopword sobrando no fim do bloco ("enganar **o**") | Empurra pro início do próximo bloco | Bloco terminando em artigo lê torto | nenhum bloco termina em a/o/de/para/que |
| Shine em herói branco | Herói com shine nasce off-white (238) | Brilho branco em texto branco puro é invisível | ver o sweep passar |

---

## Fase 5 — Split, B-roll, UI

| situação | decisão | por quê | como verificar |
|---|---|---|---|
| **Enquadrar o apresentador na faixa de cima** | Tilt +210 (sobe 210 px) + CropBottom 752, zoom 1.0 — rosto inteiro + queixo + parte do peito visíveis; nariz ~ 45 % da faixa | Cortar no queixo parece erro; zoom > 1 no split perde contexto de mão/gesto. Regra: **olhos no terço superior da faixa, queixo com folga** | still no meio do split: testa/olhos/queixo dentro; nada de "cabeça cortada" |
| **B-roll 16:9 na faixa de baixo** | Zoom **1.58** (cobre 958 px de altura, corta laterais) + Tilt −1595 | Faixa full-width sem barra preta (lei). Corte lateral de UI branca é invisível; barra preta é feia | frame: nenhum pixel preto na faixa; conteúdo central visível |
| B-roll de imagem (diagrama, página) | Ken Burns leve (1.00→1.10 em 64 f; 1.05→1.19 em 87 f) já renderizado em 1080x958 + alpha em cima | Imagem parada 3 s morre; zoom forte enjoa. Render externo = duração exata e sem calibrar props | duas amostras: início e fim diferem pouco, sem tremor |
| **Escolher o trecho do vídeo oficial** | Contact sheet (`fps=1/2`) → escolher o momento cuja **imagem diz a mesma coisa que a palavra falada** (e-mail → inbox; compra → "$47.80 Allow"). Trocar trecho a cada ~1,5–2 s acompanhando a fala | O olho confirma o ouvido; B-roll aleatório vira papel de parede | palavra X na tela ↔ imagem X na faixa |
| Trecho oficial é montagem rápida (0,5 s por card) | Usa a **sequência inteira** em vez de caçar 1 card | Sequência rápida lê como energia; 1 card de 0,5 s esticado não existe | assistir o trecho isolado |
| Frame de gap entre segmentos de B-roll (fps 24 → 30) | `ceil` nos frames do source; conferir `start+dur` do item seguinte | 1 frame de A-roll cheio no meio do split = flash | lista de itens da V2 sem buraco |
| **Overlay menor que a timeline** | Renderizar B-roll em **full-frame 1080x1920 com alpha** (topo transparente, base opaca), nunca 1080x958 (04, 15/09) | Clip menor cai em posição imprevisível no Resolve + o A-roll cropado (CropBottom) deixa preto embaixo; full-frame exato não sofre scaling | frame no split: zero pixel preto; topo = A-roll, base = B-roll |
| Emenda do split | .mov de 4 px branco em track FX, **não** PNG still | PNG still ignora `endFrame` na API (vira 150 f) | duração do item = duração do split |
| Emenda branca | **Off no 04** (pedido 15/09, override pontual) — corte reto seco, sem linha | Usuário achou que polui; o corte seco já separa as faixas | frame da transição: sem pixel branco |
| Card de "página web" | Barra de navegador + texto como barras cinza + **1 linha real** que revela em ouro; A-roll dim −0.2 + blur 4 enquanto o card está na tela | O olho vai pro único texto legível; A-roll nítido atrás competiria | frame no reveal: só a linha ouro é legível |
| Texto do card / notificação | Curto, específico e **plausível** ("Aprovar compra de US$ 47,80?"), nunca lorem ipsum ou placeholder | Detalhe verossímil = credibilidade | ler em 1 s no celular |
| Logo na notificação | Logo **oficial** recortado do material (fundo removido), nunca ícone genérico | Lei do estilo | logo reconhecível a 110 px |
| Counter não cabe na largura | Reduz fonte (190 → 150) em vez de quebrar linha | Número tem que ser uma unidade | frame final: largura < 1000 px |
| Tail do card ("ele obedece.") aparecia 10 f antes do fade | Antecipa `tail-at` pra palavra anterior ("e") e atrasa o fade | Mensagem-chave precisa de ≥ 25 f na tela | contar frames visíveis do tail |
| Callback de um card | Mesmo asset em scale 0.45, 18 f, entrada em 6 f | Memória visual: o público reconhece sem ler | cabe entre rosto e legenda |
| Falar de pessoa (Trump/Dario/Altman/Musk) | Foto oficial em split + print do post junto, nunca só texto (04, 15/09) | Rosto ancora quem é quem; print prova o que disse. Só print vira parede de texto | frame: rosto reconhecível + texto legível a 540px |
| B-roll dinâmico | Preferência específica do 04: troca ≤2s quando o conteúdo continuar legível; não é regra global | Asset parado 3s morre; troca rápida = energia | contar duração de cada segmento ≤60f |
| >1 b-roll no mesmo assunto | Parallax: fundo (foto) zoom 1.00→1.08 lento + frente (print) slide ±30px em velocidade diferente (04, 15/09) | Profundidade sem trocar de assunto; dois movimentos diferentes leem como 3D | início vs fim: fundo e frente deslocados em direções diferentes |

---

## Fase 6 — Câmera

| situação | decisão | por quê | como verificar |
|---|---|---|---|
| Onde ancorar o zoom | Pivot no **rosto** (0.5, 0.64 em coordenadas Fusion, y de baixo pra cima) | Zoom no centro geométrico puxa pro peito | frame no pico do zoom: rosto centralizado, não subiu |
| Punch-in vs punch-out | In = zoom **entra** na palavra e fica até o corte. Out = clipe **já começa** no zoom e relaxa na palavra | Corte reseta naturalmente; um "out" no meio de clipe parece erro de câmera | par in/out nunca no mesmo clipe |
| Quantos eventos | 5 em 50 s **além** dos 21 cortes e das legendas. Não forçar 1 a cada 3 s se corte + legenda já estimulam | Estímulo demais = ruído | contar estímulos (corte, legenda nova, punch, UI) por 3 s ≥ 1 |
| Shake | Amplitude 0.014 decaindo, 12 f, junto do punch-in em palavra de choque | Shake forte parece bug; shake com punch parece intenção | sheet: deslocamento visível em 2–3 frames, imperceptível no 10º |

---

## Fase 7 — Som

| situação | decisão | por quê | como verificar |
|---|---|---|---|
| Volume de SFX | **Fórmula** `LUFS_sfx = LUFS_voz + rel_db[categoria]` via `sfx_prep.py`, nunca no olho | "Tá alto" foi o feedback quando ajustei no olho | log do sfx_prep: medido/alvo/ganho |
| SFX por palavra | **Não.** Só evento visual | Reprovado ("barulho tosco") | nenhum SFX cujo evento não está na tela |
| Overlay já tem som (film burn baixado) | Não duplica com SFX | Dois burns = borrado | um evento, um som |
| Música "sumiu" | −18 dB com ratio 6 (não −23/ratio 10) | Ducking forte demais = música inexistente; usuário notou | ouvir um gap de fala: música audível; sob fala: presente mas atrás |
| Voz | Track própria (VOZ MASTER), A1 mutada; compressor leve → −14 LUFS → limiter −1 dBTP | Consistência entre vídeos e sem clip (Peu) | ebur128: I ≈ −14, TP ≤ −1 |
| Master | loudnorm −14 / TP −1 + limiter no export | Mesmo som em todo vídeo do canal | medir o export, não a timeline |

---

## Fase 8 — Presets e registro

| situação | decisão | por quê | como verificar |
|---|---|---|---|
| Usuário disse "gostei" | `presets.py approve` **na hora** + regra no `estilo-creator.md` com data e status | Sem isso o próximo vídeo recomeça do zero | `presets/GALLERY.md` atualizada |
| Usuário reprovou | Também registra (o que e por quê) no `estilo-creator.md` | Evita repetir | entrada com data |
| Parâmetro ajustado 2x | Vira default no JSON do preset, não fica só na timeline | Timeline não é fonte de verdade | JSON bate com o que está aplicado |

---

## Revisão atual

Usar os critérios de revisão do WORKFLOW.md, §5: captura nativa + playback, leitura, continuidade, voz e escopo
correto de feedback. Emenda/burn/ausência de captions são escolhas de perfil/projeto, não condições
universais de qualidade. O CTA glass do 04 usa comp sobre Adjustment Clip e tem referência em
`references/04-cta-glass/README.md`.

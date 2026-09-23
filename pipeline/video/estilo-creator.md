# Estilo do creator

Memória visual do perfil ativo. Estrutura agnóstica; preferências preenchidas pertencem ao creator
identificado abaixo. Processo de entrevista na skill, critérios de edição no workflow.

## Perfil ativo

- Creator: **Oldaque**. Preferências preservadas de 15–16/09/2026, consolidação, e tratamento
  de explicação ilustrada **fechado no 09-jev em 19/09/2026**.
- Escopo: vídeos curtos. Default = explicação ilustrada / palco A/B/C
  (estilo [Talking Head + Motions](../../styles/talking-head-motions/prompt.md)). YAP ou outro formato só se o pedido disser.
- Ao iniciar outro creator: usar arquivo de perfil separado com esta estrutura e campos indefinidos,
  apontado em `edit/plan.json`. Não aplicar as preferências abaixo como defaults universais.

## Preferências e lacunas

| Aspecto | Direção registrada | Escopo / evidência |
|---|---|---|
| Explicação ilustrada | **Default.** Palco A/B/C, captions palco, canvas Remotion na safe zone, SFX por cue. 05 é intensidade de câmera/SFX, não o default | Fechado no **09-jev** (`exports/09-jev-v3.mp4`, 19/09/2026). Estilo: [Talking Head + Motions](../../styles/talking-head-motions/prompt.md) |
| Base visual (intensidade 05) | Punch, whoosh, filmburn, split host-em-cima quando o vídeo pedir essa intensidade | [Baseline EDIT_v4](resolve/references/motion-host-baseline/README.md) |
| Gancho ilustrado | Cena reconhecível que represente emoção/reação da fala, como Hulk/Loki no 05; neste tratamento o gancho troca de palco cedo (B→A→C) | Lógica editorial aprovada; não repetir clipe nem prometer viralização |
| Câmera | Neste tratamento: estável no palco A, crop já fechado; punch só se a ênfase pedir. Zooms do 05 quando a intensidade for a do 05 | Pan não foi comprovado no 05 |
| Transições | Corte seco. Filmburn overlay nas trocas de palco A/B/C (pedido 18/09 no 09-jev). Light leak só no CTA se o corte pedir pontuação | 09-jev; filmburn deixa de ser exclusivo do 05 |
| Captions (explicação ilustrada) | Legenda o vídeo inteiro, 1–3 palavras no ataque da fala (B e C inclusive). Hold **só no CTA**: `comment` Alvito atrás + keyword Hetrixo ouro radial. Ênfase: duas camadas, overlap por glyph bounds, sombra da frente na de trás; cor e profundidade por frase. Sans = Hetrixo ExtraBold; cursiva = Alvito Nova Comp Bold Italic. Sem tetris, sem chroma, sem glow | Aprovado no 09-jev 19/09. Config: `resolve/styles/caption-style-config.json`; motores `palco-face` / `palco-canvas` / `palco-hold` |
| Captions trendy-stack-chroma | Poppins Bold + Playfair Italic ouro, tetris e chroma | Aprovado no 03 em 14/09; usar só se o vídeo pedir esse tratamento |
| Legibilidade de caption | Nunca duas captions concorrentes ou ghosting na emenda; palavras legíveis e sincronizadas | Regra de produção desde 12/09; vale para qualquer tratamento |
| YAP | Edição mínima, título durante todo o vídeo, captions neutras, câmera discreta quando útil | Variante neutra ainda a criar (`styles/neutral.json`); sem vídeo YAP aprovado |
| Texto/título fora de YAP | Hierarquia legível, sem concorrer com rosto/prova. Título persistente só no gancho se o nome próprio pedir (P7), com shine | Título do 05 era daquele gancho, não regra |
| CTA de comentário | Hold `COMMENT` + keyword ouro. Fala pode explicar o prêmio; a tela segura só o comando | P16 do estudo; não reusar glass do 04 neste papel |
| Fundos/layout | Palco B default: canvas claro + host no card embaixo, cabeça vazando (`layout/host-bottom-split` + `palco_b_composite.py`). Brainstorm/grid e `split-top-bottom` (host em cima) não são este look | Aprovado no 09-jev |
| Motion no canvas | B e C sempre animados. **O objeto é do vídeo** (skills de motion). Palco e faixa são travados: B y 180–620 / caption 640–800; C y 200–1400 / caption 1500–1750 | Kit [motion/README.md](resolve/motion/README.md). Não copiar as cenas do 09-jev |
| Kit de marcas | Pasta `assets/brands/`: logos (e mascote só se o assunto tiver) de Grok, Codex, ChatGPT, Claude, Jev. O assunto do vídeo escolhe o id; sem mascote do Oldaque | Aprovado no 09-jev (`kit/brands`) |
| Material glass | Material do CTA do 04, aplicável a outras composições | [Glass 04](resolve/references/04-cta-glass/README.md); não implica CTA/layout fixo |
| Som | Voz inteligível. SFX motivados pelo motion: kind `snap`/`click`/`whoosh`/`riser`/`reveal` → catálogo fixo. Filmburn na troca de palco (overlay já traz som). Cama trap-hype −25 dB. Nunca mascarar a narração | `pipeline/map_sfx_cues.py`; aprovado no 09-jev |
| Paleta/fontes | Ouro `#F4B400` como acento; creme `#F4EFE6`. Sans = Hetrixo ExtraBold; cursiva = Alvito Nova Comp Bold. Poppins/Playfair não são deste tratamento | Fontes em `resolve/assets/fonts/`; pedido 18/09 no 09-jev |

## Uso e evolução

Decisões locais (posição, intensidade, material ou transição de um trecho) ficam no plano do vídeo.
Registrar preferência geral apenas quando o alcance estiver explícito. Se houver dúvida, manter
local e perguntar quando necessário. Reduzir pitacos por repertório e revisão, mantendo liberdade
para compor e criar; não pedir aprovação só por ajustar um preset.

Cada referência indica **aspecto**, origem/preview, aprovação do usuário e situação técnica.
Direção declarada sem preview não é resultado validado; teste técnico não é aprovação estética.

O kit [Parallax](resolve/references/parallax-kit/README.md) tem **look aprovado pelo usuário em
16/09/2026**, validado no preview `parallax-kit/preview/parallax-kit-v1.mp4`, para uso nos próximos
vídeos: sem novo vídeo de validação e sem gate de aprovação. O que ainda não existe é uso em vídeo
entregue nem promoção do preset no catálogo. Ele nasceu como **motion #1 do motor de motion em
Fusion**; com o Resolve fora do pipeline (23/09/2026), usar exige portar o contrato para uma camada
headless (Remotion/PIL) em vez de virar script solto por vídeo.
Comparar o resultado renderizado com o look aprovado antes de alterar seus parâmetros.

Captions podem coexistir com B-roll se o layout permitir; resolver concorrência em vez de impor
supressão universal. Cor/pele são revistas no footage. Quantidade de punches, duração de B-roll,
retiming, LUT e valores do 02/04/05 não são regras globais.

Histórico anterior: [estilo histórico](resolve/docs/estilo-historico-2026-09-15.md), somente para
investigar uma decisão. Regras de fala e processo: [WORKFLOW.md](resolve/WORKFLOW.md).

# 09-jev — motions do canvas, do zero

Você é o agente de **motion**. Não é o editor do vídeo. Grok toca captions, SFX, film burn, palco B do host e a timeline no DaVinci.

Refaça os gráficos animados dos palcos B e C. Os atuais (PIL + scale 8f) são feios e estáticos. Desconsidere `edit/overlay/u*_B.mov`, `u*_C.mov` e `edit/render_canvas.py`. Não “edite” esses arquivos — crie de novo.

## Skills (obrigatório, nesta ordem)

1. `.agents/skills/motion-art-direction/SKILL.md`
2. `.agents/skills/animation-principles/SKILL.md`
3. `.agents/skills/shot-composition/SKILL.md`
4. `.agents/skills/logo-animation/SKILL.md` (u04, u05, u12)
5. `.agents/skills/remotion-video/SKILL.md` (engine de render)

Não use HyperFrames. Não use After Effects. Engine: **Remotion**, 1080×1920, 30 fps.

## O que NÃO mexer

- Fala, cortes, `edit/cuts.json`, `edit/plan.json` (storyboard só como referência de *o quê*)
- Palco B do host: `engine/palco_b_composite.py`, `edit/work/palco_b/`, `overlay/hostB_*.mov`
- Captions: `engine/captions_palco.py`, `styles/palco-*.json`, `overlay/captions_*.mov`
- Timeline `v2-fala` no Resolve
- SFX / film burn (Grok coloca)

Escreva **somente** em:

```
video/projects/09-jev/edit/motion-v2/
```

## Entrega

Para cada beat B/C, um ProRes 4444 **mudo** com alfa:

`edit/motion-v2/{uid}_{B|C}.mov`

Mais um still `edit/motion-v2/{uid}_{B|C}.png` (frame ~6).

Mais `edit/motion-v2/sfx-cues.json`:

```json
[
  {"uid":"u01","t_local_f":4,"kind":"snap","why":"chip financeiro entra"},
  {"uid":"u03","t_local_f":0,"kind":"riser","why":"barra de probabilidade sobe"}
]
```

`kind`: `snap` | `click` | `whoosh` | `riser` | `reveal`. Tempo **local ao clipe** (frame 0 = início do beat). Grok mapeia pra timeline.

Quando terminar, um `DONE.md` de 10 linhas: o que saiu, duração conferida, o que ficou fraco.

## Formato técnico

| | |
|---|---|
| Tamanho | 1080×1920 |
| FPS | 30 |
| Codec | ProRes 4444, yuva444p10le, alfa 16-bit (`prores_ks` profile 4444) |
| Áudio | nenhum |
| Palco B | **pixels abaixo de y=960 = alfa 0**. Host mora na metade de baixo. Gráfico só em y=40–700, x=80–1000. Faixa y=700–960 fica quase vazia (caption do Grok). |
| Palco C | creme opaco `#F4EFE6` full frame. Gráfico em y=80–1400. Faixa y=1500–1750 mais quieta (caption). |

Duração **exata** em frames (src_out − src_in de `edit/cuts.json`):

| uid | palco | frames | s | objeto |
|---|---|---|---|---|
| u01 | B | 57 | 1.90 | chips de decisão empilhando, % enchendo (financeiro 94 / suporte 4 / humano 2) |
| u03 | C | 40 | 1.33 | SIM / NÃO + barra de probabilidade |
| u04 | B | 32 | 1.07 | logo JEV, shine, deriva |
| u05 | C | 75 | 2.50 | logo ChatGPT, shine, deriva |
| u07 | B | 36 | 1.20 | chips de opções entrando em fila (financeiro, suporte, urgente, humano) |
| u08 | C | 71 | 2.37 | rótulo vencedor + % subindo (~94) |
| u09 | B | 48 | 1.60 | card inbox / classifica email |
| u10 | B | 35 | 1.17 | card ticket / encaminha chamado |
| u11 | B | 67 | 2.23 | card fatura / desconto inventado (recusado) |
| u12 | B | 56 | 1.87 | chips ChatGPT / Claude / Grok, um escolhido |
| u13 | C | 190 | 6.33 | **5–18×** em motion (o mais longo — merecido) |
| u14 | B | 57 | 1.90 | timer descendo até **0,50 s** |

Não gere u02, u06, u15, u16, u17 (palco A, sem canvas).

## Direção (não copiar o PNG atual)

Referência de *motor*, não de cena: `video/projects/000-video-to-copy/` (Brock / Nick). Canvas **sempre em motion**: entrada + deriva na mesma spline, sem “entrou e parou”. Snappy, overshoot curto, stagger nos chips. Intensidade = troca de palco, não punch de câmera.

Ideia dos beats (storyboard em `edit/plan.json`) está certa. A execução visual atual não. Faça UI de produto premium, não chip branco estático.

- u01: três decisões caindo com stagger, barra/% animada, vencedor destaca
- u03: SIM e NÃO como rótulos de produto, não poema; barra enche
- u04: mark JEV (não wordmark de texto), shine atravessa, scale 0.92→1.0 + drift
- u05: logo ChatGPT grande, mesmo tratamento
- u07: lista que *aparece*, um chip por beat interno
- u08: um vencedor + número vivo
- u09–u11: cards que trocam com personalidade (não o mesmo chip relabelado)
- u12: três logos, um recebe o “sim”
- u13: o número é o herói; 5 aparece, depois 18, o × trava; logo ChatGPT pequeno como contexto
- u14: timer real até 0.50s, não um texto “0.50s” parado

Paleta: creme `#F4EFE6`, tinta `#1C1A18`, mudo `#5A544E`, ouro `#F4B400`, branco. Sem neon, sem chroma, sem tetris.

## Fontes (já no repo — use estas, não Poppins/Playfair)

```
video/resolve/assets/fonts/hetrixotypeface-extrabold.otf     → sans / UI / números
video/resolve/assets/fonts/fontspring-demo-alvitonovacomp-bold.otf  → cursiva / ênfase do gráfico
```

Alvito é DEMO da Fontspring; use mesmo assim. Números e labels de UI em Hetrixo ExtraBold. Cursiva só num acento (ex.: “mais rápido” em u13).

## Assets de marca (PNG+alfa)

```
video/resolve/assets/brands/jev/logo.png
video/resolve/assets/brands/jev/wordmark.png
video/resolve/assets/brands/chatgpt/logo.png
video/resolve/assets/brands/claude/logo.png
video/resolve/assets/brands/grok/logo.png
```

Não invente mascote. Não desenhe o host. Não escreva a fala do roteiro no canvas (isso é caption do Grok). Texto no gráfico só o objeto: 94%, SIM, 5–18×, inbox, etc.

## Qualidade

Antes de renderir o lote, faça **u01 e u13** e confira:

- palco B: metade de baixo 100% transparente (amostra um PNG)
- duração = frames da tabela
- nada estaciona depois do enter
- tipo Hetrixo/Alvito, não fallback do sistema

Depois o resto.

Repo root: `/Users/oldaquerios/dev/myGitHub/personal_repositories/ai-content-agent`
Cwd atual do seu terminal pode estar em `08-union-alpha` — saia de lá.

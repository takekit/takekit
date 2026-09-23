# Canvas palco B/C

Motor Remotion do tratamento default (aprovado no **09-jev**). O que o gráfico
**mostra** nasce do vídeo — skills de motion, um beat por cláusula. O que não
se discute de novo: paleta, tipo, curva, e **onde o gráfico pode morar**.

## Safe zones (travadas)

Coordenada final de tela, 1080×1920 @ 30. `tools/audit.py` e `tools/verify.py`
reprovam quem sair.

| | palco B | palco C | palco A |
|---|---|---|---|
| fundo | transparente (host+creme vêm do bake) | creme `#F4EFE6` opaco | sem canvas |
| gráfico | x 80–1000, y **180–620** | x 80–1000, y **200–1400** | — |
| caption (outro agente) | y **640–800**, quase vazia | y **1500–1750**, quase vazia | peito y ~1180 |
| alfa | todo pixel y≥960 = 0 | full frame | — |
| topo IG | y 0–180 opaco = 0 nos dois | idem | idem |

Palco B é apertado: 440 px entre a UI do Instagram e a caption no vão de creme
acima da cabeça do host. Palco C é o expansivo — o frame inteiro é o objeto,
mas a caption de baixo continua intocável.

Wrapper obrigatório: `<StageB>` ou `<StageC>`. Eles recortam. O beat não escolhe
número de movimento (isso está em `src/kit/tokens.ts`); escolhe o que entra,
onde e quando, **dentro da faixa**.

## Motion: skill, não catálogo

Cada vídeo inventa o objeto da cláusula (chips, logo, print, timer, o que a
fala pedir). Carregar, nesta ordem:

1. `motion-art-direction` — o que move, o que não
2. `animation-principles` — easing, overshoot, stagger
3. `shot-composition` — hierarquia no frame, safe area
4. `logo-animation` — marcas. Rotina deste formato, não exceção. Fonte:
   `assets/brands/` + `<BrandMark>` (tinta plana, shine no recorte). Não
   inventar mascote nem trazer a cor da marca pro frame.
5. `kinetic-typography` — só tipo no canvas (não é caption)
6. `remotion-video` — o render

Linguagem já travada no kit: entrada+deriva num relógio só (`<Enter>`), Hetrixo
+ Alvito, paleta creme/tinta/ouro, shine em logo. Não reabrir. Não copiar as
cenas do 09-jev; copiar o **palco**.

Atalhos opcionais em `src/patterns.tsx` existem para quando o objeto *é* o
mesmo (lista com %, logo, timer). Não são cenas obrigatórias.

## Scripts

```bash
# stubs B/C a partir de cuts.json + plan.json (palco/frames/faixa; sem cena)
python3 video/resolve/motion/scaffold.py --project video/projects/<slug>

# preencher src/beats/*.tsx com as skills, depois:
python3 video/resolve/motion/render.py --project video/projects/<slug>
```

Entrega: `edit/motion/{uid}_{B|C}.mov` ProRes 4444 mudo com alfa + still `*.png`.
`sfx-cues.json` sai do beat (tempo local). Grok mapeia com
`pipeline/map_sfx_cues.py`.

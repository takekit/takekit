# Brands — slot do canvas (P10/P15)

Uma pasta por marca. O motion mora no Fusion; o PNG é o assunto do vídeo.

```
assets/brands/<id>/logo.png      marca, alfa, recorte oficial
assets/brands/<id>/wordmark.png  opcional
assets/brands/<id>/mascot.png    opcional (Claude pixel, etc.)
```

`plan.json` → `storyboard[].marca` = `<id>`. Sem id, o canvas não carrega marca.

Não inventar mascote do Oldaque. Fala de Grok → Grok; Codex → Codex; ChatGPT → ChatGPT; Claude → Claude.

Primeira leva: `chatgpt`, `claude`, `grok`, `jev`. Codex ainda sem PNG oficial — não placeholder.

Entrada no ledger (`assets/ledger.json`) e neste `catalog.json`. PNG pequeno entra no git.

# Takekit

AI-first video editing harness — múltiplos projetos de vídeo em paralelo, orquestrados por chat.

## Estrutura

```
takekit/
├── apps/harness/   # Vite + React UI (threads + chat + preview)
├── engine/         # Node orchestrator + Claude Code adapter
├── pipeline/       # (reservado) etapas headless futuras
├── styles/         # (reservado) presets portáteis (ex.: 09-jev)
├── docs/
│   ├── SPEC.md     # produto
│   └── HARNESS.md  # adapters CI / arquitetura do harness
└── README.md
```

Pipeline de edição **não** vive neste repo: o engine aponta para o checkout local de
`ai-content-agent` (default `video/projects/09-jev` + editor-reels / `DEFAULT.md`).

## Como rodar (dev)

Terminal 1 — engine:

```bash
cd engine
npm install
npm run dev
# http://127.0.0.1:8787  →  GET /api/health
```

Terminal 2 — harness UI:

```bash
cd apps/harness
npm install
npm run dev
# http://127.0.0.1:5173  (proxy /api → engine)
```

Requisitos opcionais para jobs reais: Claude Code CLI no `PATH` (`claude` / `claude -p`).

Variáveis úteis: ver `engine/.env.example` e [docs/HARNESS.md](docs/HARNESS.md).

## Status

Scaffold: UI + API + adapter Claude Code. Ainda **não** fecha o fluxo completo
thread → chat → CI → pipeline → preview de vídeo. Detalhes em [docs/HARNESS.md](docs/HARNESS.md).

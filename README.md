# Takekit

AI-first video editing harness — múltiplos projetos de vídeo em paralelo, orquestrados por chat.

## Estrutura

```
takekit/
├── apps/harness/   # Vite + React UI + Tauri 2 desktop shell
│   └── src-tauri/  # Rust bridge (spawn CI CLIs, local fs)
├── engine/         # Node orchestrator + Claude Code adapter
├── pipeline/       # etapas headless (editor-reels / resolve / 09-jev)
├── styles/         # (reservado) presets portáteis (ex.: 09-jev)
├── docs/
│   ├── SPEC.md     # produto
│   └── HARNESS.md  # adapters CI / arquitetura do harness
└── README.md
```

Desktop shell is **Tauri 2** (not Electron). The React/Vite UI under `apps/harness` is unchanged; Tauri wraps it and exposes local `spawn_ci` / fs commands for CI CLIs and video files. The engine Node HTTP API can stay for browser-dev; Tauri is the desktop bridge.

## Como rodar (dev)

Terminal 1 — engine (browser / HTTP path):

```bash
cd engine
npm install
npm run dev
# http://127.0.0.1:8787  →  GET /api/health
```

Terminal 2 — harness UI (browser only):

```bash
cd apps/harness
npm install
npm run dev
# http://127.0.0.1:5173  (proxy /api → engine)
```

Desktop (Tauri 2 shell — preferred for local CI spawn / fs):

```bash
cd apps/harness
npm install
npm run tauri dev
# starts Vite + opens Takekit desktop window
```

Requisitos: Rust/cargo no `PATH` (ex.: `~/.cargo/bin`). Opcionais para jobs reais: Claude Code CLI (`claude` / `claude -p`).

Variáveis úteis: ver `engine/.env.example` e [docs/HARNESS.md](docs/HARNESS.md).

## Status

Scaffold: UI + API + adapter Claude Code + Tauri 2 desktop wrapper. Ainda **não** fecha o fluxo completo
thread → chat → CI → pipeline → preview de vídeo. Detalhes em [docs/HARNESS.md](docs/HARNESS.md).

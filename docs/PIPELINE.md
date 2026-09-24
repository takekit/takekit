# Takekit Pipeline (09-jev port)

The editor-reels video editing pipeline used for the **09-jev** guinea pig lives in this repo under `pipeline/`. Scripts, presets, and skill docs are a structural port from `ai-content-agent` so the agent adapters can run without depending on that other repo path.

> The pipeline is headless: trim, background matte (Robust Video Matting), frame capture, preview and export run in [`pipeline/video/headless/`](../pipeline/video/headless/README.md) — no GUI, N jobs in parallel, 09-jev look preserved. See [DEV_SPEC_MVP.md §3.5 / §12](./DEV_SPEC_MVP.md).

## Layout

```
pipeline/                          ← TAKEKIT_PIPELINE_ROOT / Claude Code cwd
├── .agents/skills/
│   ├── editor-reels/SKILL.md      ← primary skill
│   ├── motion-art-direction/      ← canvas B/C deps (and related motion-*)
│   ├── logo-animation/
│   ├── remotion-video/
│   └── …
└── video/
    ├── estilo-creator.md
    ├── projects/                  ← default projects root (projects usually live elsewhere)
    ├── headless/                  ← trim, matte (RVM), palco_b, camera, compose, frame, batch
    └── kit/                       ← docs, presets, styles, engines, assets
        ├── DEFAULT.md             ← pointer to the default style package
        ├── WORKFLOW.md
        ├── FORMATOS.md, BEHAVIORS.md, DECISIONS.md, …
        ├── pipeline/              ← tighten_cuts, caption_jobs, map_sfx_cues, storyboard_html, …
        ├── engine/                ← captions, palco_b_composite, sfx_prep, …
        ├── motion/                ← scaffold / render (no node_modules)
        ├── presets/, styles/
        └── assets/                ← fonts, brands, trimmed sfx (see OMITTED.md)
```

Skill relative links (`../../../video/kit/...`) resolve correctly when the skill lives at `pipeline/.agents/skills/editor-reels/` and cwd/root is **`pipeline/`**.

## Invocation (Claude Code)

1. Set (or rely on engine default):
   - `TAKEKIT_PIPELINE_ROOT=<takekit-repo>/pipeline`
2. Working directory for the agent: **`$TAKEKIT_PIPELINE_ROOT`** (the nested root that contains both `.agents/` and `video/`).
3. Point the agent at:
   - `pipeline/.agents/skills/editor-reels/SKILL.md`
   - `pipeline/video/kit/DEFAULT.md` (09-jev lock)
   - `pipeline/video/kit/WORKFLOW.md`
   - project path: `pipeline/video/projects/09-jev` (metadata; re-attach media for real edits)

Example local spawn (mirrors the engine adapter):

```bash
cd /path/to/takekit/pipeline
claude -p "…" \
  --add-dir /path/to/takekit/pipeline \
  --add-dir /path/to/takekit/pipeline/video/projects/09-jev
```

Scripts are invoked from that cwd as in the source repo, e.g.:

```bash
python3 video/kit/pipeline/storyboard_html.py --project video/projects/09-jev
bash video/headless/setup.sh                                   # once: .venv + RVM model
.venv/bin/python video/headless/trim.py    --project video/projects/09-jev
.venv/bin/python video/headless/palco_b.py --project video/projects/09-jev
.venv/bin/python video/headless/compose.py --project video/projects/09-jev
```

## Engine default

`engine/src/config.ts` defaults `TAKEKIT_PIPELINE_ROOT` to the in-repo `pipeline/` directory (resolved relative to the engine package). Override only if you intentionally use an external checkout.

## What was omitted

Large binaries were not ported: project `exports/*.mp4`, raw `.mov`, bake/overlay frame dumps, filmburn packs, background loops, music files, `node_modules`. See `pipeline/video/kit/assets/OMITTED.md` and `pipeline/video/projects/09-jev/README.md`. For a real edit with media, point `TAKEKIT_ASSETS` at a folder with the full media (music bed, filmburns).

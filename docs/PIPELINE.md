# Takekit Pipeline (09-jev port)

The DaVinci Resolve / editor-reels video editing pipeline used for the **09-jev** guinea pig is **copied** into this repo under `pipeline/`. Logic was **not** rewritten — scripts, presets, and skill docs are a structural port from `ai-content-agent` so the Claude Code adapter can run without depending on that other repo path for the prototype.

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
    ├── projects/09-jev/           ← briefing + edit JSON (no giant media)
    └── resolve/
        ├── DEFAULT.md             ← 09-jev style lock
        ├── WORKFLOW.md
        ├── FORMATOS.md, API-NOTES.md, BEHAVIORS.md, FUSION.md, SCENES.md, …
        ├── pipeline/              ← tighten_cuts, caption_jobs, build_timeline, …
        ├── engine/                ← captions, palco_b_composite, sfx_prep, …
        ├── motion/                ← scaffold / render (no node_modules)
        ├── presets/, styles/, profiles/
        ├── assets/                ← fonts, brands, trimmed sfx (see OMITTED.md)
        └── install.sh
```

Skill relative links (`../../../video/resolve/...`) resolve correctly when the skill lives at `pipeline/.agents/skills/editor-reels/` and cwd/root is **`pipeline/`**.

## Invocation (Claude Code)

1. Set (or rely on engine default):
   - `TAKEKIT_PIPELINE_ROOT=<takekit-repo>/pipeline`
2. Working directory for the agent: **`$TAKEKIT_PIPELINE_ROOT`** (the nested root that contains both `.agents/` and `video/`).
3. Point the agent at:
   - `pipeline/.agents/skills/editor-reels/SKILL.md`
   - `pipeline/video/resolve/DEFAULT.md` (09-jev lock)
   - `pipeline/video/resolve/WORKFLOW.md`
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
python3 video/resolve/pipeline/storyboard_html.py --project video/projects/09-jev
```

## Engine default

`engine/src/config.ts` defaults `TAKEKIT_PIPELINE_ROOT` to the in-repo `pipeline/` directory (resolved relative to the engine package). Override only if you intentionally use an external checkout.

## What was omitted

Large binaries were not ported: project `exports/*.mp4`, raw `.mov`, bake/overlay frame dumps, filmburn packs, background loops, music files, `node_modules`. See `pipeline/video/resolve/assets/OMITTED.md` and `pipeline/video/projects/09-jev/README.md`. For a full Resolve edit with media, use or symlink assets from the original ai-content-agent checkout.

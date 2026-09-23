#!/usr/bin/env bash
# Pipeline headless: venv com numpy/pillow/onnxruntime + modelo RVM em cache.
# Uso (da raiz do pipeline):  bash video/headless/setup.sh
# Depois: pipeline/.venv/bin/python video/headless/<script>.py ...
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
VENV="$ROOT/.venv"

command -v ffmpeg >/dev/null || { echo "erro: ffmpeg não está no PATH (brew install ffmpeg)"; exit 1; }

if command -v uv >/dev/null; then
  [ -x "$VENV/bin/python" ] || uv venv -q --python 3.13 "$VENV" || uv venv -q "$VENV"
  VIRTUAL_ENV="$VENV" uv pip install -q -r "$HERE/requirements.txt"
else
  [ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$HERE/requirements.txt"
fi

# baixa e confere o modelo uma vez (cache compartilhado entre jobs)
(cd "$HERE" && "$VENV/bin/python" -c "from common import rvm_model; print('modelo RVM:', rvm_model())")
echo "ok: $VENV"

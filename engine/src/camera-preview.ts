import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./config.js";
import { runScript } from "./pipeline.js";

const CACHE = join(DATA_DIR, "cache", "camera");
const SCRIPT = "video/headless/camera_preview.py";

/**
 * A camera preset seen on your own footage: a few seconds with its punches, zooms and face
 * tracking (camera_preview.py simulates cuts so the frequency shows). Cached by preset + footage.
 */
export async function cameraPreview(preset: object, footage: string): Promise<string> {
  const info = statSync(footage);
  const key = createHash("sha1").update(JSON.stringify([preset, footage, info.size, info.mtimeMs])).digest("hex");
  const out = join(CACHE, `${key}.mp4`);
  if (existsSync(out)) return out;
  mkdirSync(CACHE, { recursive: true });
  const tmp = `${out}.${process.pid}.tmp.mp4`;
  const result = await runScript(
    SCRIPT,
    ["--preset", "-", "--footage", footage, "--out", tmp, "--size", "540x960", "--seconds", "6"],
    { stdin: JSON.stringify(preset) },
  );
  if (result.code !== 0 || !existsSync(tmp)) {
    const line = result.tail.split("\n").filter(Boolean).at(-1) ?? "sem saída";
    throw new Error(`Não consegui gerar a prévia da câmera: ${line.replace(/^erro:\s*/, "")}`);
  }
  renameSync(tmp, out);
  return out;
}

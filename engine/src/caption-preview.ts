import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { DATA_DIR } from "./config.js";
import { runScript } from "./pipeline.js";

const run = promisify(execFile);
const CACHE = join(DATA_DIR, "cache", "captions");
const SCRIPT = "video/kit/engine/caption_preview.py";

/** Sample phrases for animated previews: enough text to see entrance, hold, exit and pacing. */
export const SAMPLE_TEXT = "Isso *muda* tudo|no seu próximo vídeo|e quase ninguém percebe|comenta *EU QUERO*";

/**
 * Caption builder previews: the preset drawn by the real caption renderer
 * (caption_preview.py → captions_palco), over a dark card, the cream canvas, or a frame
 * of the thread's footage. Cached by content, so tweaking back and forth is instant.
 */
export async function captionPreview(input: {
  preset: object;
  text: string;
  layout: "face" | "canvas";
  /** "dark" | "cream" | a video to take a frame from. */
  background: string;
  clip: boolean;
}): Promise<string> {
  const bg = input.background === "dark" || input.background === "cream" ? input.background : await frameOf(input.background);
  const key = createHash("sha1")
    .update(JSON.stringify([input.preset, input.text, input.layout, bg, input.clip]))
    .digest("hex");
  const out = join(CACHE, `${key}.${input.clip ? "mp4" : "png"}`);
  if (existsSync(out)) return out;
  mkdirSync(CACHE, { recursive: true });
  const tmp = `${out}.${process.pid}.tmp.${input.clip ? "mp4" : "png"}`;
  const result = await runScript(
    SCRIPT,
    [
      "--preset", "-",
      "--text", input.text,
      "--layout", input.layout,
      "--bg", bg,
      "--size", "540x960",
      ...(input.clip ? ["--clip", tmp] : ["--out", tmp]),
    ],
    { stdin: JSON.stringify(input.preset) },
  );
  if (result.code !== 0 || !existsSync(tmp)) {
    const line = result.tail.split("\n").filter(Boolean).at(-1) ?? "sem saída";
    throw new Error(`Não consegui desenhar a legenda: ${line.replace(/^erro:\s*/, "")}`);
  }
  renameSync(tmp, out);
  return out;
}

/** A 1080-wide still of the footage (2 s in, past black first frames), cached by mtime. */
async function frameOf(video: string): Promise<string> {
  const info = statSync(video);
  const key = createHash("sha1").update(`${video}|${info.size}|${info.mtimeMs}`).digest("hex");
  const out = join(CACHE, `frame-${key}.png`);
  if (existsSync(out)) return out;
  mkdirSync(CACHE, { recursive: true });
  const tmp = `${out}.${process.pid}.tmp.png`;
  const grab = (at: string) =>
    run("ffmpeg", ["-v", "error", "-y", "-ss", at, "-i", video, "-frames:v", "1", "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", tmp]);
  await grab("2").catch(() => grab("0"));
  renameSync(tmp, out);
  return out;
}

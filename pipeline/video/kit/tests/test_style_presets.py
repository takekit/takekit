"""Presets de módulo (edit/style.resolved.json) e preview × final, sem ffmpeg nem projeto real."""
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
HEADLESS = KIT.parent / "headless"
sys.path.insert(0, str(HEADLESS))
sys.path.insert(0, str(KIT / "engine"))

import common  # noqa: E402
import compose  # noqa: E402
import captions_palco as cp  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


caption_jobs = _load("caption_jobs", KIT / "pipeline" / "caption_jobs.py")

D_SPLIT = {"id": "d-split", "palco": "D", "bRoll": {"band": [0, 900], "fit": "cover"},
           "host": {"band": [906, 1920], "cropY": 300}, "seam": {"band": [900, 906], "color": "#000000"},
           "safeZones": {"caption": {"layout": "face", "y": 903}}}


def _units(*frames):
    out, t = [], 0
    for i, n in enumerate(frames):
        out.append(common.Unit(f"u{i + 1:02d}", (t, t + n), t, t + n))
        t += n
    return out


def _project(d: Path, palcos: list[str], beats_extra: dict | None = None, style: dict | None = None) -> Path:
    edit = d / "edit"
    (edit / "overlay").mkdir(parents=True)
    (edit / "motion").mkdir()
    cuts = [{"id": f"u{i + 1:02d}", "src": [i * 30, i * 30 + 30]} for i in range(len(palcos))]
    (edit / "cuts.json").write_text(json.dumps({"fps": 30, "source": "x.mov", "cuts": cuts}))
    board = [{"unit": c["id"], "palco": p, **(beats_extra or {}).get(c["id"], {})} for c, p in zip(cuts, palcos)]
    (edit / "plan.json").write_text(json.dumps({"storyboard": board}))
    for c, p in zip(cuts, palcos):
        if p == "B":
            (edit / "overlay" / f"hostB_{c['id']}.mov").write_bytes(b"")
        if p in "BC":
            (edit / "motion" / f"{c['id']}_{p}.mov").write_bytes(b"")
    if style is not None:
        (edit / "style.resolved.json").write_text(json.dumps(style))
    return d


class QualityTests(unittest.TestCase):
    def test_resolution(self):
        self.assertEqual(common.resolution("720p"), (720, 1280))
        self.assertEqual(common.resolution("1080p"), (1080, 1920))
        self.assertEqual(common.resolution("1080x1920"), (1080, 1920))
        self.assertEqual(common.resolution("721x1281"), (720, 1280))   # sempre par
        self.assertEqual(common.resolution("720p", (1920, 1080)), (1280, 720))
        self.assertEqual(common.resolution(None), (common.W, common.H))
        with self.assertRaises(SystemExit):
            common.resolution("grande")

    def test_quality_merges_over_defaults(self):
        self.assertEqual(common.quality({}, "preview")["bitrate"], "1.5M")
        q = common.quality({"quality": {"export": {"bitrate": "8M", "maxrate": None,
                                                   "audio": {"loudness": {"I": -16}}}}}, "final")
        self.assertEqual((q["bitrate"], q["maxrate"], q["preset"]), ("8M", "12M", "medium"))
        self.assertEqual(q["audio"]["loudness"], {"I": -16, "TP": -1, "LRA": 11})
        self.assertEqual(q["audio"]["bitrate"], "256k")

    def test_codecs(self):
        self.assertIn("libx265", compose.video_codec({"codec": "hevc", "preset": "fast"}))
        self.assertIn("hvc1", compose.video_codec({"codec": "hevc"}))
        with self.assertRaises(SystemExit):
            compose.video_codec({"codec": "vp9"})
        self.assertEqual(compose.aac_margin({"audio": {"bitrate": "128k"}}), 2.0)
        self.assertEqual(compose.aac_margin({"audio": {"bitrate": "256k"}}), 0.0)


class TransitionTests(unittest.TestCase):
    units = _units(10, 10, 10, 10)
    stage = {"u01": "B", "u02": "B", "u03": "C", "u04": "A"}
    board = {"u04": {"transicao": "filmburn"}}

    def test_marked_is_hook_plus_marked_beats(self):
        self.assertEqual(compose.burn_cuts(self.board, self.units, self.stage), [0, 30])

    def test_all_is_every_stage_change_plus_marked(self):
        self.assertEqual(compose.burn_cuts(self.board, self.units, self.stage, True, "all"), [0, 20, 30])
        self.assertEqual(compose.burn_cuts({}, self.units, self.stage, False, "all"), [20, 30])

    def test_none_and_no_hook(self):
        self.assertEqual(compose.burn_cuts(self.board, self.units, self.stage, False, "none"), [])

    def test_preset_shapes(self):
        self.assertEqual(compose.transitions({"modules": {"transitions": {"filmburn": None}}})[0], None)
        preset, hook, mode = compose.transitions({"modules": {"transitions": {
            "filmburn": {"preset": compose.FILMBURN_PRESET, "hook": True, "onStageChange": "all"}}}})
        self.assertTrue(hook)
        self.assertEqual(mode, "all")
        self.assertIn("peak_frame_in_asset", preset)
        _p, hook, mode = compose.transitions({})          # sem estilo = hoje
        self.assertEqual((hook, mode), (True, "marked"))


class SoundTests(unittest.TestCase):
    def test_music_null_and_cli(self):
        self.assertIsNone(compose.music_bed({"modules": {"soundEffects": {"sfx": False, "music": None}}}, None))
        self.assertIsNone(compose.music_bed({}, "none"))
        with tempfile.NamedTemporaryFile(suffix=".mp3") as f:
            bed = compose.music_bed({"modules": {"soundEffects": {"music": None}}}, f.name)
            self.assertEqual((bed["gain_db"], bed["duck"]), (compose.MUSIC_GAIN_DB, True))


class SplitTests(unittest.TestCase):
    def test_palcos_keeps_d(self):
        with tempfile.TemporaryDirectory() as d:
            pdir = _project(Path(d), ["A", "d", "C"])
            _c, _f, units = common.load_cuts(pdir)
            self.assertEqual(list(common.palcos(pdir, units).values()), ["A", "D", "C"])

    def test_d_spec_from_beat_broll_and_stage_preset(self):
        with tempfile.TemporaryDirectory() as d:
            style = {"modules": {"stage": [D_SPLIT], "transitions": {"filmburn": None},
                                 "soundEffects": {"sfx": False, "music": None}}}
            pdir = _project(Path(d), ["B", "D", "D"], {"u02": {"broll": "media/city.mp4", "broll_start": 1.5}},
                            style)
            (pdir / "media").mkdir()
            (pdir / "media" / "city.mp4").write_bytes(b"")
            (pdir / "edit" / "broll").mkdir()
            (pdir / "edit" / "broll" / "u03.png").write_bytes(b"")
            with redirect_stdout(io.StringIO()):
                spec = compose.derive_spec(pdir, common.style_resolved(pdir), None)
            u2, u3 = spec["units"][1], spec["units"][2]
            self.assertEqual((u2["base"], u2["split"]["broll"], u2["split"]["broll_start"], u2["split"]["still"]),
                             ("split", "media/city.mp4", 1.5, False))
            self.assertEqual((u3["split"]["broll"], u3["split"]["still"]), ("edit/broll/u03.png", True))
            self.assertEqual((u2["split"]["band"], u2["split"]["host"], u2["split"]["crop_y"], u2["split"]["seam_color"]),
                             ([0, 900], [906, 1920], 300, "#000000"))
            self.assertEqual((spec["fx"], spec["audio"]["sfx"], spec["audio"]["music"]), ([], [], None))
            self.assertNotIn("export", spec)
            self.assertNotIn("_source", spec)

    def test_d_without_broll_dies(self):
        with tempfile.TemporaryDirectory() as d:
            pdir = _project(Path(d), ["A", "D"])
            with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as err:
                compose.derive_spec(pdir, {}, "none")
            self.assertIn("palco D sem B-roll", str(err.exception))

    def test_split_graph_uses_loop_for_stills(self):
        with tempfile.TemporaryDirectory() as d:
            pdir = Path(d)
            (pdir / "a.mov").write_bytes(b"")
            (pdir / "s.png").write_bytes(b"")
            g = compose.Graph(pdir)
            u = {"id": "u01", "start": 0, "end": 30, "palco": "D", "base": "split",
                 "split": {"broll": "s.png", "still": True, **compose.SPLIT_DEFAULT}}
            compose.split_unit(g, 0, u, g.input("a.mov"), 30, "settb=1/30,setpts=N", (1080, 1920), (720, 1280),
                               ",format=yuv420p", "yuv420")
            self.assertEqual(g.inputs[1][1][:2], ("-loop", "1"))
            graph = ";".join(g.parts)
            self.assertIn("crop=1080:958:0:420", graph)       # janela do host no a-roll 1080x1920
            self.assertIn("overlay=0:642", graph)            # faixa do host escalada para 720x1280


class CaptionPresetTests(unittest.TestCase):
    def setUp(self):
        self.face = cp.load_style(str(KIT / "styles" / "palco-face.json"))
        self.hold = cp.load_style(str(KIT / "styles" / "palco-hold.json"))
        self.preset = json.loads((KIT.parents[2] / "styles" / "_presets" / "caption" / "contorno-bold.json")
                                 .read_text()) if (KIT.parents[2] / "styles").is_dir() else None

    def test_no_preset_is_identity(self):
        self.assertIs(cp.apply_preset(self.face, None), self.face)

    def test_preset_over_face_and_hold(self):
        if not self.preset:
            self.skipTest("styles/_presets fora do checkout")
        face = cp.apply_preset(self.face, self.preset)
        self.assertEqual((face["size"]["sans"], face["case"], face["anim_in"], face["anim_out"], face["preset_y"]),
                         (84, "upper", "pop", "cut", 1240))
        self.assertEqual(face["outline"]["width"], 9)
        hold = cp.apply_preset(self.hold, self.preset)
        self.assertEqual((hold["size"], hold["y"], hold["color_sans"]), (self.hold["size"], self.hold["y"],
                                                                          self.hold["color_sans"]))
        self.assertEqual((hold["anim_in"], hold["outline"]["width"]), ("pop", 9))
        self.assertTrue(hold["font_sans"].endswith("Poppins-ExtraBold.ttf"))

    def test_palco_a_rule(self):
        cp.STYLE = self.face
        self.assertTrue(cp.is_palco_a({"layout": "face", "y": 1180}))
        self.assertTrue(cp.is_palco_a({"layout": "emphasis", "y": 1180}))
        self.assertFalse(cp.is_palco_a({"layout": "face", "y": 960}))
        self.assertFalse(cp.is_palco_a({"layout": "face", "y": 1180, "palco": "D"}))
        self.assertTrue(cp.is_palco_a({"layout": "face", "y": 960, "palco": "A"}))


class CaptionJobsTests(unittest.TestCase):
    def test_zones_from_stage_presets(self):
        zones = caption_jobs.caption_zones({"modules": {"stage": [D_SPLIT, {"palco": "C", "safeZones": {
            "caption": {"layout": "canvas", "y": [1500, 1700]}}}]}})
        self.assertEqual(zones["D"], ("face", 903))
        self.assertEqual(zones["C"], ("canvas", 1600))
        self.assertEqual(zones["A"], ("face", 1180))              # tabela antiga sem preset
        self.assertEqual(caption_jobs.caption_zones({})["D"], ("face", 960))

    def test_group_limits(self):
        words = [{"text": w, "start": i * 0.3, "end": i * 0.3 + 0.2} for i, w in enumerate("um dois três quatro".split())]
        self.assertEqual(len(caption_jobs.group(words, 2, 30)), 2)
        self.assertEqual(len(caption_jobs.group(words, 5, 30)), 1)


if __name__ == "__main__":
    unittest.main()

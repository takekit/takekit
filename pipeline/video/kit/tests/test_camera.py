"""Módulo camera (video/headless/camera.py): planejador de movimentos, janela do crop, tracking e
integração com o compose, sem ffmpeg nem projeto real."""
import io
import json
import random
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import numpy as np

KIT = Path(__file__).resolve().parents[1]
HEADLESS = KIT.parent / "headless"
PRESETS = KIT.parents[2] / "styles" / "_presets" / "camera"
sys.path.insert(0, str(HEADLESS))

import camera  # noqa: E402
import camera_preview  # noqa: E402
import common  # noqa: E402
import compose  # noqa: E402

W, H = 1080, 1920


def _units(*frames):
    out, t = [], 0
    for i, n in enumerate(frames):
        out.append(common.Unit(f"u{i + 1:02d}", (t, t + n), t, t + n))
        t += n
    return out


def _cfg(**over):
    base = {"id": "t", "moves": ["punch", "zoomIn", "zoomOut"], "intensity": 1.14, "frequency": "medio",
            "punchFrames": 2, "faceTracking": {"enabled": True, "baseScale": 1.0, "smoothing": 0.9},
            "applyTo": ["A", "D"]}
    base.update(over)
    with redirect_stdout(io.StringIO()):
        return camera.settings(base)


def _plan(units, cfg, stage=None, board=None, **kw):
    stage = stage or {u.id: "A" for u in units}
    with redirect_stdout(io.StringIO()):
        return camera.plan_moves(units, stage, board or {}, cfg, 30, **kw)


def _preset(name):
    return json.loads((PRESETS / f"{name}.json").read_text()) if (PRESETS / f"{name}.json").is_file() else None


class SettingsTests(unittest.TestCase):
    def test_library_presets(self):
        if not PRESETS.is_dir():
            self.skipTest("styles/_presets/camera fora do checkout")
        self.assertFalse(camera.active(camera.settings(_preset("parada"))))
        enq = camera.settings(_preset("enquadrar-rosto"))
        self.assertTrue(camera.active(enq))
        self.assertEqual((enq["base"], enq["intensity"], enq["moves"]), (1.08, 1.0, []))
        for name in ("acelerado", "dinamico", "punch-na-enfase", "zoom-lento"):
            cfg = camera.settings(_preset(name))
            self.assertTrue(camera.active(cfg), name)
            self.assertTrue(set(cfg["moves"]) <= set(camera.MOVES), name)

    def test_normalization(self):
        self.assertIsNone(camera.settings(None))
        cfg = _cfg(moves=["zoom_in", "Zoom Out", "punch", "shake"], intensity=0.8, applyTo=["a", "B", "D"],
                   faceTracking={"enabled": False, "baseScale": 1.3})
        self.assertEqual(cfg["moves"], ["zoomIn", "zoomOut", "punch"])
        self.assertEqual((cfg["intensity"], cfg["base"], cfg["applyTo"]), (1.0, 1.0, ["A", "D"]))
        self.assertFalse(camera.active(cfg))           # sem zoom e baseScale só vale com tracking
        self.assertEqual(camera.canon_move("zoom-in"), "zoomIn")
        self.assertEqual(camera.canon_move(False), "none")
        self.assertIsNone(camera.canon_move("dolly"))


class PlannerTests(unittest.TestCase):
    def test_frequency_targets(self):
        units = _units(*[45] * 80)                    # 2 min de palco A em unidades de 1,5 s (no máx. 1 por unidade)
        total = sum(u.frames for u in units) / 30
        counts = {}
        for freq, gap in camera.GAP_S.items():
            moves = _plan(units, _cfg(frequency=freq))
            counts[freq] = len(moves)
            self.assertAlmostEqual(total / len(moves), gap, delta=gap * 0.2, msg=freq)
        self.assertLess(counts["poucos"], counts["medio"])
        self.assertLess(counts["medio"], counts["muitos"])
        self.assertEqual(_plan(units, _cfg(frequency="marcado")), [])

    def test_rotation_and_shape(self):
        moves = _plan(_units(*[60] * 12), _cfg(frequency="muitos"))
        self.assertEqual([m["move"] for m in moves[:4]], ["punch", "zoomIn", "zoomOut", "punch"])
        m = moves[0]
        self.assertEqual(set(m), {"unit", "palco", "move", "from", "to", "startFrame", "endFrame", "by"})
        self.assertEqual((m["from"], m["to"], m["by"]), (1.0, 1.14, "auto"))
        out = next(x for x in moves if x["move"] == "zoomOut")
        self.assertEqual((out["from"], out["to"]), (1.14, 1.0))

    def test_base_scale_in_from_to(self):
        m = _plan(_units(60, 60, 60), _cfg(frequency="muitos",
                                           faceTracking={"enabled": True, "baseScale": 1.05}))[0]
        self.assertEqual((m["from"], m["to"]), (1.05, round(1.05 * 1.14, 4)))

    def test_beat_marks_win(self):
        units = _units(60, 60, 60, 60)
        board = {"u01": {"camera": "zoom_out"}, "u02": {"camera": "none"}, "u03": {"camera": "punch"}}
        moves = _plan(units, _cfg(frequency="marcado", moves=["punch"]), board=board)
        self.assertEqual([(m["unit"], m["move"], m["by"]) for m in moves],
                         [("u01", "zoomOut", "beat"), ("u03", "punch", "beat")])
        auto = _plan(units, _cfg(frequency="muitos"), board={"u02": {"camera": "none"}})
        self.assertNotIn("u02", [m["unit"] for m in auto])

    def test_marks_outside_apply_to_are_ignored(self):
        units = _units(60, 60, 60)
        stage = {"u01": "A", "u02": "B", "u03": "C"}
        buf = io.StringIO()
        with redirect_stdout(buf):
            moves = camera.plan_moves(units, stage, {"u02": {"camera": "punch"}}, _cfg(frequency="marcado"), 30)
        self.assertEqual(moves, [])
        self.assertIn("u02", buf.getvalue())

    def test_only_a_and_d_time_counts(self):
        a_only = _units(*[75] * 10)
        mixed, stage, t = [], {}, 0
        for i, u in enumerate(a_only):                 # mesmas unidades A com B de 3 s no meio
            mixed.append(common.Unit(u.id, (t, t + 75), t, t + 75))
            stage[u.id] = "A"
            t += 75
            mixed.append(common.Unit(f"b{i}", (t, t + 90), t, t + 90))
            stage[f"b{i}"] = "B"
            t += 90
        m1 = [m["unit"] for m in _plan(a_only, _cfg())]
        m2 = [m["unit"] for m in _plan(mixed, _cfg(), stage=stage)]
        self.assertEqual(m1, m2)

    def test_short_units_skip_auto_moves(self):
        units = _units(*[6] * 30)                      # 0,2 s: não cabe punch nem zoom
        self.assertEqual(_plan(units, _cfg(frequency="muitos")), [])
        zooms = _plan(_units(*[15] * 40), _cfg(frequency="muitos"))   # cabe punch (10f), não zoom (20f)
        self.assertTrue(zooms and all(m["move"] == "punch" for m in zooms))

    def test_deterministic(self):
        rnd = random.Random(7)
        units = _units(*[rnd.randint(20, 150) for _ in range(40)])
        stage = {u.id: rnd.choice("ABCD") for u in units}
        board = {u.id: {"camera": rnd.choice(["punch", "zoom_in", "none"])} for u in units if rnd.random() < 0.2}
        a = _plan(units, _cfg(frequency="medio"), stage=stage, board=board)
        b = _plan(list(units), _cfg(frequency="medio"), stage=dict(reversed(list(stage.items()))),
                  board=dict(board))
        self.assertEqual(a, b)
        self.assertTrue(all(stage[m["unit"]] in "AD" for m in a))

    def test_no_moves_without_intensity(self):
        units = _units(60, 60, 60)
        self.assertEqual(_plan(units, _cfg(intensity=1.0, frequency="muitos"),
                               board={"u01": {"camera": "punch"}}), [])


class ScaleAndClampTests(unittest.TestCase):
    def test_move_scale(self):
        i, n = 1.2, 40
        self.assertAlmostEqual(camera.move_scale("punch", 1, n, i, 2), i)
        self.assertAlmostEqual(camera.move_scale("punch", 0, n, i, 1), i)          # 1 frame = corte seco
        self.assertLess(camera.move_scale("punch", 0, n, i, 2), i)
        self.assertAlmostEqual(camera.move_scale("punch", n - 1, n, i, 2), i)       # segura até o corte
        self.assertAlmostEqual(camera.move_scale("zoomIn", 0, n, i, 2), 1.0)
        self.assertAlmostEqual(camera.move_scale("zoomIn", n - 1, n, i, 2), i)
        self.assertAlmostEqual(camera.move_scale("zoomOut", 0, n, i, 2), i)
        self.assertAlmostEqual(camera.move_scale("zoomOut", n - 1, n, i, 2), 1.0)
        zin = [camera.move_scale("zoomIn", k, n, i, 2) for k in range(n)]
        self.assertEqual(zin, sorted(zin))
        self.assertEqual(camera.move_scale(None, 3, n, i, 2), 1.0)

    def test_crop_box_always_covers(self):
        rnd = random.Random(3)
        for _ in range(2000):
            s = rnd.uniform(1.0, 1.6)
            face = (rnd.uniform(-200, W + 200), rnd.uniform(-200, H + 200))
            x0, y0 = camera.crop_box(s, face, (W / 2, H * 0.4), (W, H))
            self.assertGreaterEqual(x0, 0)
            self.assertGreaterEqual(y0, 0)
            self.assertLessEqual(x0 + W / s, W + 1e-9)
            self.assertLessEqual(y0 + H / s, H + 1e-9)

    def test_crop_box_puts_face_on_anchor(self):
        s, face, anchor = 1.2, (520.0, 760.0), (540.0, 770.0)
        x0, y0 = camera.crop_box(s, face, anchor, (W, H))
        self.assertAlmostEqual((face[0] - x0) * s, anchor[0])
        self.assertAlmostEqual((face[1] - y0) * s, anchor[1])
        self.assertEqual(camera.crop_box(1.0, face, anchor, (W, H)), (0.0, 0.0))
        px, py = camera.PIVOT[0] * W, camera.PIVOT[1] * H   # sem tracking: o pivot fica parado na tela
        x0, y0 = camera.crop_box(1.14, (px, py), (px, py), (W, H))
        self.assertAlmostEqual((px - x0) * 1.14, px)
        self.assertAlmostEqual((py - y0) * 1.14, py)

    def test_frame_transforms(self):
        units = _units(60, 60, 60)
        stage = {"u01": "A", "u02": "B", "u03": "D"}
        cfg = _cfg(frequency="marcado", faceTracking={"enabled": True, "baseScale": 1.08, "smoothing": 0.9})
        track = camera.Track({"detector": "x", "samples": [[f, 500 + f % 7, 760, 400, 600, 1] for f in range(0, 180, 3)]},
                             (W, H))
        moves = _plan(units, cfg, stage=stage, board={"u03": {"camera": "punch"}})
        tr = camera.frame_transforms(units, stage, moves, cfg, track, (W, H))
        self.assertEqual(sorted({f // 60 for f in tr}), [0, 2])          # B intocado
        self.assertAlmostEqual(tr[0][0], 1.08)
        self.assertAlmostEqual(tr[179][0], 1.08 * 1.14)
        for s, x0, y0 in tr.values():
            self.assertLessEqual(x0 + W / s, W + 1e-9)
            self.assertLessEqual(y0 + H / s, H + 1e-9)
        # sem tracking e sem baseScale: frames em 1.0 passam direto
        cfg2 = _cfg(frequency="marcado", faceTracking={"enabled": False})
        moves2 = _plan(units, cfg2, stage=stage, board={"u01": {"camera": "zoom_in"}})
        tr2 = camera.frame_transforms(units, stage, moves2, cfg2, None, (W, H))
        self.assertNotIn(0, tr2)                                         # zoomIn começa em 1.0
        self.assertIn(59, tr2)

    def test_track_path_is_per_unit_and_zero_phase(self):
        samples = [[f, 300.0 if f < 60 else 700.0, 800.0, 400, 600, 1] for f in range(0, 120, 3)]
        track = camera.Track({"detector": "x", "samples": samples}, (W, H))
        xs, _ys = track.path(0, 60, 0.9)
        self.assertTrue(np.allclose(xs, 300.0))                          # o outro lado do corte não vaza
        step = np.r_[np.zeros(30), np.ones(30)]
        sm = camera.smooth(step, 0.9)
        self.assertAlmostEqual(sm[29] + sm[30], 1.0, delta=0.01)        # ida e volta: simétrico, sem atraso
        self.assertGreater(sm[29], 0.3)                                  # começa a subir antes do degrau
        self.assertIsNone(track.path(500, 560, 0.9))
        self.assertEqual(camera.Track({"samples": []}, (W, H)).anchor(), (camera.PIVOT[0] * W, camera.PIVOT[1] * H))

    def test_stamp(self):
        head = {"aroll": {"size": 1, "mtime": 2}, "size": [W, H], "fps": 30, "frames": 90}
        tr = {10: (1.1, 5.0, 6.0), 11: (1.1, 5.0, 6.0)}
        self.assertEqual(camera.stamp_of(head, tr), camera.stamp_of(head, dict(reversed(list(tr.items())))))
        self.assertNotEqual(camera.stamp_of(head, tr), camera.stamp_of(head, {**tr, 11: (1.1, 5.2, 6.0)}))
        self.assertNotEqual(camera.stamp_of(head, tr), camera.stamp_of({**head, "frames": 91}, tr))


class WarpTests(unittest.TestCase):
    def test_identity_and_bounds(self):
        rnd = np.random.default_rng(1)
        size = (64, 96)
        buf = rnd.integers(16, 235, camera.frame_bytes("yuv420p", size), dtype=np.uint8).tobytes()
        same = camera.warp(buf, "yuv420p", size, (0, 0, 64, 96), size)
        self.assertLessEqual(np.abs(np.frombuffer(same, np.uint8).astype(int) - np.frombuffer(buf, np.uint8)).max(), 1)
        s = 1.3                                                          # janela colada na borda direita/baixo
        x0, y0 = 64 - 64 / s, 96 - 96 / s
        out = camera.warp(buf, "yuv420p", size, (x0, y0, 64.0, 96.0), (32, 48))
        self.assertEqual(len(out), camera.frame_bytes("yuv420p", (32, 48)))

    def test_ten_bit_ceiling(self):
        size = (32, 32)
        n = camera.frame_bytes("yuv422p10le", size) // 2
        vals = np.where(np.arange(n) % 2, 1023, 0).astype("<u2")          # bordas duras: overshoot do bicúbico
        out = np.frombuffer(camera.warp(vals.tobytes(), "yuv422p10le", size, (3.3, 2.1, 27.9, 26.7), size), "<u2")
        self.assertLessEqual(int(out.max()), 1023)


class PreviewTests(unittest.TestCase):
    def test_sim_units(self):
        units = camera_preview.sim_units(180)
        self.assertEqual([u.start for u in units], [0, 45, 90, 135])
        self.assertEqual(camera_preview.sim_units(100)[-1].end, 100)     # resto curto vai para o anterior
        self.assertEqual(len(camera_preview.sim_units(100)), 2)

    def test_preview_plan(self):
        units = camera_preview.sim_units(180)
        cfg, _stage, moves = camera_preview.preview_plan(_cfg(frequency="marcado", moves=["punch"]), units)
        self.assertEqual([(m["unit"], m["move"]) for m in moves], [("s2", "punch")])
        _c, _s, fast = camera_preview.preview_plan(_cfg(frequency="muitos", moves=["punch", "zoomOut"]), units)
        _c, _s, slow = camera_preview.preview_plan(_cfg(frequency="poucos", moves=["zoomIn"]), units)
        self.assertEqual([m["unit"] for m in fast], ["s2", "s3", "s4"])
        self.assertEqual([m["unit"] for m in slow], ["s2"])
        self.assertEqual(camera_preview.preview_plan(_cfg(intensity=1.0), units), (None, {}, []))
        self.assertEqual(camera_preview.working_size((1080, 1920), (540, 960)), (1080, 1920))
        self.assertEqual(camera_preview.working_size((720, 1280), (540, 960)), (720, 1280))
        self.assertEqual(camera_preview.working_size((3840, 2160), (540, 960)), (1080, 1920))


def _project(d: Path, palcos: list[str], beats_extra: dict | None = None, style: dict | None = None) -> Path:
    edit = d / "edit"
    (edit / "overlay").mkdir(parents=True)
    cuts = [{"id": f"u{i + 1:02d}", "src": [i * 30, i * 30 + 30]} for i in range(len(palcos))]
    (edit / "cuts.json").write_text(json.dumps({"fps": 30, "source": "x.mov", "cuts": cuts}))
    board = [{"unit": c["id"], "palco": p, **(beats_extra or {}).get(c["id"], {})} for c, p in zip(cuts, palcos)]
    (edit / "plan.json").write_text(json.dumps({"storyboard": board}))
    for c, p in zip(cuts, palcos):
        if p == "B":
            (edit / "overlay" / f"hostB_{c['id']}.mov").write_bytes(b"")
    (edit / "aroll.mov").write_bytes(b"")
    (edit / "broll.png").write_bytes(b"")
    if style is not None:
        (edit / "style.resolved.json").write_text(json.dumps(style))
    return d


STYLE = {"styleId": "t", "modules": {"transitions": {"filmburn": None}, "soundEffects": {"sfx": False, "music": None}}}


class ComposeTests(unittest.TestCase):
    def test_no_camera_keeps_spec(self):
        with tempfile.TemporaryDirectory() as d:
            pdir = _project(Path(d), ["A", "B"], style=STYLE)
            with redirect_stdout(io.StringIO()):
                base = compose.derive_spec(pdir, common.style_resolved(pdir), None)
                for cam in (None, {"id": "parada", "moves": [], "intensity": 1.0, "frequency": "marcado",
                                   "faceTracking": {"enabled": False, "baseScale": 1.0}}):
                    style = {**STYLE, "modules": {**STYLE["modules"], "camera": cam}}
                    self.assertEqual(json.dumps(compose.derive_spec(pdir, style, None)), json.dumps(base))
            self.assertNotIn("camera", base)
            self.assertNotIn("camera_render", base)

    def test_camera_units_read_the_camera_render(self):
        with tempfile.TemporaryDirectory() as d:
            pdir = _project(Path(d), ["A", "B", "D", "A"], {"u03": {"broll": "edit/broll.png"}}, STYLE)
            preset = {"id": "dinamico", "intensity": 1.14, "frequency": "marcado", "moves": ["punch"],
                      "faceTracking": {"enabled": True}, "applyTo": ["A", "D"]}
            style = {**STYLE, "modules": {**STYLE["modules"], "camera": preset}}
            moves = [{"unit": "u01", "palco": "A", "move": "punch", "from": 1.0, "to": 1.14, "startFrame": 0,
                      "endFrame": 30, "by": "beat"}]
            plan = camera.Plan(camera.settings(preset), preset, moves, {5: (1.1, 1.0, 1.0)}, (W, H), 30, 120, "x",
                               "abc", "def", ["u01", "u03"])
            with mock.patch.object(camera, "plan_project", return_value=plan), redirect_stdout(io.StringIO()):
                spec = compose.derive_spec(pdir, style, None)
            self.assertEqual(spec["camera"], moves)
            self.assertEqual(spec["camera_render"]["units"], ["u01", "u03"])
            self.assertEqual(spec["presets"]["camera"], "dinamico")
            g = compose.Graph(pdir)
            compose.video_graph(g, spec, (720, 1280), True, 30)
            paths = [Path(p).name for p, _o in g.inputs]
            self.assertIn("aroll_cam.mov", paths)
            cam = paths.index("aroll_cam.mov")
            graph = ";".join(g.parts)
            self.assertIn(f"[i{cam}v0]trim=start_frame=0:end_frame=30", graph)      # u01 (A) na câmera
            self.assertIn(f"[i{cam}v1]trim=start_frame=60:end_frame=90", graph)     # host do D na câmera
            self.assertIn("[i0v0]trim=start_frame=90:end_frame=120", graph)         # u04 sem movimento: aroll

    def test_hand_spec_gets_the_style_camera(self):
        """Spec à mão sem `camera` recebe a do estilo, só nas unidades A/D do próprio spec."""
        with tempfile.TemporaryDirectory() as d:
            pdir = _project(Path(d), ["A", "A", "B"], style=STYLE)
            preset = {"id": "dinamico", "intensity": 1.14, "frequency": "medio", "moves": ["punch"],
                      "faceTracking": {"enabled": True}, "applyTo": ["A", "D"]}
            style = {**STYLE, "modules": {**STYLE["modules"], "camera": preset}}
            moves = [{"unit": u, "palco": "A", "move": "punch", "from": 1.0, "to": 1.14, "startFrame": f,
                      "endFrame": f + 30, "by": "auto"} for u, f in (("u01", 0), ("u02", 30))]
            plan = camera.Plan(camera.settings(preset), preset, moves, {5: (1.1, 1.0, 1.0)}, (W, H), 30, 90, "x",
                               "abc", "def", ["u01", "u02"])
            units = [{"id": "u01", "palco": "A", "start": 0, "end": 30},
                     {"id": "u02", "palco": "C", "start": 30, "end": 60},    # o spec à mão trocou o palco
                     {"id": "u03", "palco": "B", "start": 60, "end": 90}]
            with mock.patch.object(camera, "plan_project", return_value=plan), redirect_stdout(io.StringIO()):
                spec = {"units": [dict(u) for u in units]}
                compose.hand_camera(pdir, spec, style)
                self.assertEqual([m["unit"] for m in spec["camera"]], ["u01"])
                self.assertEqual(spec["camera_render"]["units"], ["u01"])

                off = {"units": [dict(u) for u in units], "camera": None}      # o spec desliga
                compose.hand_camera(pdir, off, style)
                self.assertNotIn("camera_render", off)

                other = {"units": [{**units[0], "end": 20}, *units[1:]]}      # outros cortes: sem câmera
                compose.hand_camera(pdir, other, style)
                self.assertNotIn("camera", other)

                still = {"units": [dict(u) for u in units]}                 # estilo sem câmera
                compose.hand_camera(pdir, still, STYLE)
                self.assertNotIn("camera", still)


if __name__ == "__main__":
    unittest.main()

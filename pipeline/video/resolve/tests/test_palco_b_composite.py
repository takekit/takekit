"""A coroa sai do card; o quarto fica dentro. Sem isso o palco B vira o oposto."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

path = Path(__file__).resolve().parents[1] / "engine" / "palco_b_composite.py"
spec = importlib.util.spec_from_file_location("palco_b_composite", path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def _matte(top: int, bot: int, x0: int = 360, x1: int = 720) -> Image.Image:
    im = Image.new("L", (m.W, m.H), 0)
    ImageDraw.Draw(im).rectangle((x0, top, x1, bot), fill=255)
    return im


def _write_pair(dirpath: Path, top: int) -> tuple[Path, Path]:
    rgb = Image.new("RGB", (m.W, m.H), (20, 40, 180))
    draw = ImageDraw.Draw(rgb)
    draw.rectangle((360, top, 720, 1700), fill=(210, 80, 60))
    matte = _matte(top, 1700)
    rp, mp_ = dirpath / "rgb.png", dirpath / "matte.png"
    rgb.save(rp)
    matte.save(mp_)
    return rp, mp_


class PalcoBTests(unittest.TestCase):
    def test_crown_clears_the_card_and_the_room_stays_inside(self):
        with tempfile.TemporaryDirectory() as d:
            rgb, matte = _write_pair(Path(d), 420)
            im = m.composite_frame(rgb, matte)
        crown = m.CARD[1] - m.HEAD_CLEAR
        px = im.load()
        # só a cabeça, não o quarto, passa da borda
        self.assertEqual(px[540, crown - 12][:3], m.CREAM[:3])
        self.assertNotEqual(px[540, crown + 10][:3], m.CREAM[:3])
        self.assertEqual(px[40, crown + 10][:3], m.CREAM[:3])
        # card cheio nas laterais e embaixo (quarto, não creme)
        self.assertNotEqual(px[50, m.CARD[1] + 80][:3], m.CREAM[:3])
        self.assertNotEqual(px[540, m.CARD[1] + m.CARD[3] - 24][:3], m.CREAM[:3])

    def test_low_head_still_fills_the_card(self):
        matte = _matte(980, 1880)
        geo = m.layout_from_matte(matte)
        self.assertIsNotNone(geo)
        scale, _px, py = geo
        self.assertGreaterEqual(py + int(round(m.H * scale)), m.CARD[1] + m.CARD[3] - 1)
        crown = py + 980 * scale
        self.assertAlmostEqual(crown, m.CARD[1] - m.HEAD_CLEAR, delta=2)

    def test_full_frame_matte_does_not_invent_a_head(self):
        self.assertIsNone(m.layout_from_matte(Image.new("L", (m.W, m.H), 255)))
        self.assertIsNone(m.layout_from_matte(Image.new("L", (m.W, m.H), 0)))


if __name__ == "__main__":
    unittest.main()

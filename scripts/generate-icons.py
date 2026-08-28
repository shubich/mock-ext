#!/usr/bin/env python3
"""Generate full-bleed MockWeave extension icons (no outer padding)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "icons"


def _lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = max(3, round(size * 0.203))

    # Gradient-ish background: draw horizontal bands.
    for y in range(size):
        t = y / max(size - 1, 1)
        r = _lerp(30, 10, t)
        g = _lerp(51, 16, t)
        b = _lerp(84, 28, t)
        draw.line([(0, y), (size - 1, y)], fill=(r, g, b, 255))

    # Clip to rounded square by masking.
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    img.putalpha(mask)

    draw = ImageDraw.Draw(img)
    border = max(1, round(size / 42))
    draw.rounded_rectangle(
        [border, border, size - 1 - border, size - 1 - border],
        radius=max(2, radius - border),
        outline=(231, 238, 252, 42),
        width=border,
    )

    scale = size / 128.0

    def pt(x: float, y: float) -> tuple[float, float]:
        return (x * scale, y * scale)

    m = [
        pt(24, 98),
        pt(24, 26),
        pt(40, 26),
        pt(60, 64),
        pt(80, 26),
        pt(96, 26),
        pt(96, 98),
        pt(80, 98),
        pt(80, 48),
        pt(68, 94),
        pt(60, 94),
        pt(48, 48),
        pt(48, 98),
    ]
    draw.polygon(m, fill=(244, 247, 255, 255))

    bar_h = max(2, round(7 * scale))
    bar_y = 104 * scale
    draw.rounded_rectangle(
        [18 * scale, bar_y, 110 * scale, bar_y + bar_h],
        radius=bar_h / 2,
        fill=(14, 165, 109, 255),
    )

    return img


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        out = ROOT / f"icon{size}.png"
        make_icon(size).save(out, optimize=True)
        print(f"wrote {out}")


if __name__ == "__main__":
    main()

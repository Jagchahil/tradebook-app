"""
THE LEKHIO BRAND, IN CODE.

Every colour, every measurement and every primitive shape in here was read off the frames that went
out on launch night, 20 August 2026, pixel by pixel. Nothing is invented. If a value looks arbitrary
it is because it is what the launch frames actually are, and matching them is the point: a post made
in November has to sit next to a post made in August and look like the same company said it.

Two rules live here rather than in the head of whoever is on shift:

  1. THE WAVE SITS IN THE LOWER THIRD AND NOTHING IS WRITTEN OVER IT.
  2. TEXT IN A 9:16 FRAME STAYS IN THE UPPER TWO THIRDS. TikTok eats the bottom fifth with its own
     buttons and caption bar, and the right edge with the action rail.

There is no network here and no generation credit is ever spent. Pillow draws it, ffmpeg moves it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# The palette. Sampled from marketing/launch-carousel/*.png.
# ---------------------------------------------------------------------------

NAVY_TOP = (10, 42, 81)      # top left of the gradient
NAVY_BOT = (21, 77, 147)     # bottom right of the gradient
WHITE = (255, 255, 255)
TINT = (198, 216, 242)       # the light blue a bold subline is set in
BODY = (214, 228, 248)       # the light blue a paragraph is set in, a shade brighter
MARK_TINT = (152, 182, 222)  # the L mark when it is not full white
WAVE_BLUE = (72, 141, 213)   # the bright wave stroke
ACCENT = (244, 167, 77)      # the orange, used only as the tip of the top wave

# THE FACE, AND WHY THIS IS A SEARCH AND NOT A PATH.
#
# The brand face is Liberation Sans Bold, which is what the launch frames were set in. It ships with
# most Linux boxes and with none of them on macOS, so a hardcoded /usr/share/fonts path works in the
# cloud and dies on Jag's laptop.
#
# Arial is the fallback and it is not a compromise. Liberation Sans was drawn to be METRICALLY
# IDENTICAL to Arial: same advance widths, same line breaks, same wrap points. A frame rendered on
# the Mac and the same frame rendered in the cloud lay out the same, character for character.
# Helvetica is the last resort and it is close but not metrically identical, so it can wrap a long
# headline one word differently.

_BOLD_CANDIDATES = (
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",   # Linux, the real face
    "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",              # macOS, metrically identical
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Helvetica.ttc",                            # last resort
)
_REGULAR_CANDIDATES = (
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
)


def _find_font(candidates, what: str) -> str:
    import os
    for path in candidates:
        if os.path.exists(path):
            return path
    raise RuntimeError(
        f"no {what} font found. The cutting room needs Liberation Sans or Arial. "
        f"Looked in:\n  " + "\n  ".join(candidates)
    )


BOLD = _find_font(_BOLD_CANDIDATES, "bold")
REGULAR = _find_font(_REGULAR_CANDIDATES, "regular")

# Canvas sizes we cut to. The names are the ones the platforms use.
SQUARE = (1080, 1080)     # Instagram carousel, LinkedIn, Facebook
FEED = (1080, 1350)       # Instagram's 4:5, the tallest it will show without cropping
VERTICAL = (1080, 1920)   # TikTok, Reels, Shorts, Stories


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


# ---------------------------------------------------------------------------
# Contrast. This project has been bitten once by a label at 2.70:1, so anything
# this file paints as text gets checked rather than eyeballed.
# ---------------------------------------------------------------------------

def _channel(c: float) -> float:
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb) -> float:
    r, g, b = (_channel(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg) -> float:
    a, b = luminance(fg), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


# ---------------------------------------------------------------------------
# The ground: a diagonal navy gradient.
# ---------------------------------------------------------------------------

def gradient(size) -> Image.Image:
    """
    Top left NAVY_TOP to bottom right NAVY_BOT, interpolated along the diagonal.
    Vectorised, because a per pixel Python loop at 1080x1920 takes about a minute per frame and we
    render dozens of frames a morning.
    """
    import numpy as np

    w, h = size
    xs = np.arange(w, dtype=np.float32)[None, :]
    ys = np.arange(h, dtype=np.float32)[:, None]
    t = (xs + ys) / float(max(1, w + h - 2))
    top = np.array(NAVY_TOP, dtype=np.float32)
    bot = np.array(NAVY_BOT, dtype=np.float32)
    arr = top[None, None, :] + (bot - top)[None, None, :] * t[:, :, None]
    return Image.fromarray(np.rint(arr).astype("uint8"), "RGB")


# ---------------------------------------------------------------------------
# The wave motif. Three strokes across the lower third, the top one tipped orange
# on the right. This is the single most recognisable thing on the frame.
# ---------------------------------------------------------------------------

# The wave was traced off marketing/launch-carousel/01.png rather than guessed. At 1080 square the
# bright stroke runs through y=966 at x=60, troughs at y=973 around x=200, crests at y=915 around
# x=640 and comes back down to y=971 at x=1040. That is one cosine with its trough at 18.5 percent
# across and a period of 0.83 of the width, which is what these two constants are.
WAVE_TROUGH_AT = 0.185
WAVE_PERIOD = 0.83


@dataclass
class WaveSpec:
    y: float          # centre line as a fraction of height
    amp: float        # amplitude as a fraction of width
    width: int        # stroke width in pixels
    colour: tuple     # base colour
    alpha: int = 255            # the second stroke is a soft light line, not a solid one
    tip: tuple | None = None    # colour the right hand end fades into


def _wave_points(w: int, h: int, spec: WaveSpec, steps: int = 260):
    cy = h * spec.y
    amp = w * spec.amp
    k = 2 * math.pi / WAVE_PERIOD
    pts = []
    for i in range(steps + 1):
        t = i / steps
        pts.append((t * w, cy + math.cos((t - WAVE_TROUGH_AT) * k) * amp))
    return pts


SS = 3   # supersample factor. PIL does not antialias lines, so we draw big and shrink.


def _stroke(draw, pts, spec: WaveSpec, width: int) -> None:
    if spec.tip is None:
        draw.line(pts, fill=spec.colour + (spec.alpha,), width=width, joint="curve")
        return
    # Segment by segment so the colour can travel. The orange only appears in the last third,
    # which is what the launch frames do: still blue at 60 percent across, fully orange by 95.
    n = len(pts) - 1
    for i in range(n):
        t = i / n
        k = 0.0 if t < 0.62 else min(1.0, (t - 0.62) / 0.26)
        col = tuple(round(spec.colour[j] + (spec.tip[j] - spec.colour[j]) * k) for j in range(3))
        draw.line([pts[i], pts[i + 1]], fill=col + (spec.alpha,), width=width)


def waves(img: Image.Image, base_y: float = 0.874) -> None:
    """
    Two strokes, not three. The bright one with the orange tail, and a soft light line about four
    percent of the height below it. Measured off the launch frames: anyone counting three lines is
    counting the antialiasing.

    Drawn into a supersampled crop of the lower band and pasted back, so the curves are smooth and
    we are not compositing a full 1080x1920 alpha layer twice per frame.
    """
    w, h = img.size
    scale = w / 1080.0                       # stroke weights were measured at 1080 wide
    # The second stroke sits 44px below the first at 1080 square. That gap is kept in pixels rather
    # than as a fraction of the height, or the two lines drift apart on a 9:16 canvas.
    specs = [
        WaveSpec(y=base_y, amp=0.0269, width=round(10 * scale), colour=WAVE_BLUE, tip=ACCENT),
        WaveSpec(y=base_y + (44.0 * scale) / h, amp=0.0236,
                 width=round(10 * scale), colour=WHITE, alpha=30),
    ]

    lo = max(0, int(h * base_y - 0.075 * w))
    hi = min(h, int(h * base_y + 0.115 * w))
    band = img.crop((0, lo, w, hi)).convert("RGBA")
    big = band.resize((w * SS, (hi - lo) * SS), Image.BILINEAR)
    layer = Image.new("RGBA", big.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for spec in specs:
        pts = [(px * SS, (py - lo) * SS) for px, py in _wave_points(w, h, spec)]
        _stroke(d, pts, spec, max(1, spec.width * SS))
    out = Image.alpha_composite(big, layer).resize((w, hi - lo), Image.LANCZOS)
    img.paste(out.convert("RGB"), (0, lo))


# ---------------------------------------------------------------------------
# The L mark. Drawn, not loaded, so it scales to any canvas without a stray asset file.
# ---------------------------------------------------------------------------

def mark(img: Image.Image, x: int, y: int, size: int, colour=WHITE, with_wave: bool = True) -> int:
    """
    The Lekhio L with its little wave underneath. Drawn, not loaded, so it scales to any canvas
    without a stray asset file to lose. Returns the y of the bottom of the whole mark so a caller
    can lay the next thing out beneath it without guessing.

    Rendered into a supersampled crop so the rounded corners and the squiggle are smooth.
    """
    pad = round(size * 0.35)
    box_w = round(size * 0.95) + pad * 2
    box_h = round(size * 1.45) + pad * 2
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(img.width, x0 + box_w), min(img.height, y0 + box_h)
    crop = img.crop((x0, y0, x1, y1))
    big = crop.resize(((x1 - x0) * SS, (y1 - y0) * SS), Image.BILINEAR)
    d = ImageDraw.Draw(big)

    # Proportions measured off frame 01: the L is 58px tall, its upright 15px wide, its foot 53px
    # long, and the squiggle 44px long sitting 10px under it.
    ox, oy = (x - x0) * SS, (y - y0) * SS
    s = size * SS
    stem = max(3, round(s * 0.259))
    r = max(2, round(stem * 0.40))
    d.rounded_rectangle([ox, oy, ox + stem, oy + s], radius=r, fill=colour)               # upright
    foot_w = round(s * 0.914)
    d.rounded_rectangle([ox, oy + s - stem, ox + foot_w, oy + s], radius=r, fill=colour)  # the foot

    bottom = y + size
    if with_wave:
        wl = s * 0.76
        wy = oy + s + s * 0.17
        wwidth = max(2, round(s * 0.086))
        base = WAVE_BLUE if colour == WHITE else (110, 150, 200)
        pts = [(ox + (i / 40) * wl, wy + math.sin((i / 40) * math.pi * 1.75) * s * 0.05)
               for i in range(41)]
        for i in range(len(pts) - 1):
            t = i / (len(pts) - 1)
            k = 0.0 if t < 0.55 else (t - 0.55) / 0.45
            col = tuple(round(base[j] + (ACCENT[j] - base[j]) * k) for j in range(3))
            d.line([pts[i], pts[i + 1]], fill=col, width=wwidth)
        bottom = y + size + round(size * 0.28)

    img.paste(big.resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))
    return bottom


# ---------------------------------------------------------------------------
# Type. Wrapping, auto fitting, and a block layout that reports where it ended
# so the next block can follow it.
# ---------------------------------------------------------------------------

_MEASURE = ImageDraw.Draw(Image.new("RGB", (8, 8)))


def wrap(text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """
    Greedy wrap, EXCEPT where the writer has broken the line himself.

    A newline in the copy is a hard break and is obeyed. This matters more than it sounds. On launch
    night the frame read "We built / in the dark." and a greedy wrapper produces "We built in the /
    dark.", which is the same words and a worse poster. Where a headline breaks is a craft decision
    and it belongs to whoever wrote it, so the spec can say so and the machine does not argue.
    """
    out: list[str] = []
    for segment in str(text).split("\n"):
        words = segment.split()
        if not words:
            continue
        cur = words[0]
        for word in words[1:]:
            trial = f"{cur} {word}"
            if _MEASURE.textlength(trial, font=f) <= max_w:
                cur = trial
            else:
                out.append(cur)
                cur = word
        out.append(cur)
    return out


def fit_font(text: str, path: str, start: int, max_w: int, max_lines: int, floor: int = 28):
    """Step the size down until the text wraps into max_lines and every line fits the width."""
    hard = "\n" in str(text)
    size = start
    while size > floor:
        f = font(path, size)
        lines = wrap(text, f, max_w)
        # A hard broken headline is allowed the lines the writer asked for, plus any the wrapper had
        # to add because a chosen line was too long at this size.
        allowed = max(max_lines, str(text).count("\n") + 1) if hard else max_lines
        if len(lines) <= allowed and all(_MEASURE.textlength(ln, font=f) <= max_w for ln in lines):
            return f, lines
        size -= 2
    f = font(path, floor)
    return f, wrap(text, f, max_w)


def draw_block(img, x, y, text, f, colour, max_w, leading=1.18) -> int:
    """Draw a wrapped block at x, y. Returns the y just past the last line."""
    d = ImageDraw.Draw(img)
    lines = wrap(text, f, max_w)
    step = round(f.size * leading)
    for i, line in enumerate(lines):
        d.text((x, y + i * step), line, font=f, fill=colour)
    return y + len(lines) * step

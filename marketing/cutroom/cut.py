"""
THE CUTTING ROOM.

One thing Jag wrote goes in. Every platform native asset comes out.

    python3 cut.py originals/cis-refund.json

It does NOT write copy. Nothing in this file invents a word, a hook, an angle or a caption. That was
deleted on 31 July on purpose (commit b7dac7ef, "marketing is made by hand") and it stays deleted.
This is a cutting room, not a writer: it takes the words a human wrote and cuts them to seven
platforms, which is mechanical work and always was.

WHAT IT MAKES from one spec:

    carousel/01..NN.png   1080x1080   Instagram carousel, LinkedIn, Facebook
    feed.png              1080x1350   Instagram's 4:5, the tallest it shows without cropping
    story.png             1080x1920   Instagram and Facebook stories
    quote.png             1080x1080   the sharpest line on its own, the saveable one
    vertical.mp4          1080x1920   TikTok, Reels, Shorts. ffmpeg, no generation credit
    contact-sheet.png                 every frame on one image, for approving in the chat
    captions.md                       per platform, inside every character limit
    manifest.json                     a sha256 of every asset and caption

THE MANIFEST IS THE POINT OF THE MANIFEST. Approval attaches to a hash. What Jag approves in the chat
is byte for byte what gets uploaded, and if anything changes on the way out the hash stops matching
and it goes back to him. The gate is not that a human moves the mouse. It is that a human said yes to
this exact artefact.

Everything here is offline. No API, no credits, nothing to label as AI generated.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass

from PIL import Image, ImageDraw

import brand as B
import rules as R

# ---------------------------------------------------------------------------
# Layout. Measurements are fractions of the canvas so one set works at every size.
# ---------------------------------------------------------------------------

class TooMuchCopy(Exception):
    """Raised when a frame cannot be laid out at a size a person could read on a phone."""


@dataclass
class Layout:
    size: tuple
    margin: float = 0.089        # 96px at 1080 wide, which is what the launch frames use
    mark_size: float = 0.0537    # 58px at 1080 wide, measured off frame 01
    top: float = 0.22            # text zone starts here
    bottom: float = 0.80         # and ends here, clear of the wave
    head: int = 116              # starting headline size, shrinks to fit
    sub: int = 46
    wave_y: float = 0.874
    right_extra: float = 0.0     # extra inset on the right. 9:16 needs it: TikTok's action rail
                                 # (like, comment, share) sits over the right hand edge.


SQUARE_L = Layout(B.SQUARE)
FEED_L = Layout(B.FEED, top=0.20, bottom=0.78, head=124, sub=50, wave_y=0.900)
# 9:16: everything lives in the upper two thirds. TikTok's buttons eat the bottom fifth and the
# right edge, so the text zone stops well short of where it could go.
STORY_L = Layout(B.VERTICAL, margin=0.083, mark_size=0.048, top=0.14, bottom=0.60,
                 head=124, sub=54, wave_y=0.905, right_extra=0.07)


def _ground(layout: Layout, tinted_mark: bool) -> tuple[Image.Image, int]:
    img = B.gradient(layout.size)
    B.waves(img, base_y=layout.wave_y)
    w, h = layout.size
    x = round(w * layout.margin)
    msize = round(w * layout.mark_size)
    colour = B.MARK_TINT if tinted_mark else B.WHITE
    B.mark(img, x, round(h * 0.0889), msize, colour=colour)
    return img, x


def _text_zone(layout: Layout) -> tuple[int, int, int]:
    w, h = layout.size
    x = round(w * layout.margin)
    max_w = w - 2 * x - round(w * layout.right_extra)
    return x, max_w, h


def render_frame(spec: dict, layout: Layout, index: int) -> Image.Image:
    """
    A frame is a stack of blocks, any of which may be absent:

        h     headline          bold white, the big one
        k     kicker            bold ORANGE, the three word drumbeat ("Logged. Sorted. Done.")
        s     subline           regular, light blue, the explaining sentence
        list  [{l, n}]          each with an orange rule, a bold white label and a light blue note
        t     turn              bold white, the closing line

    Everything is measured first, then the whole stack is centred in the text zone. Nothing is ever
    written over the wave, and in a 9:16 frame the zone stops in the upper two thirds because
    TikTok's own furniture eats the rest.
    """
    tinted = index > 0            # frame one gets the white mark, the rest get the quiet one
    img, x = _ground(layout, tinted)
    _, max_w, h = _text_zone(layout)
    d = ImageDraw.Draw(img)

    head = (spec.get("h") or "").strip()
    kicker = (spec.get("k") or "").strip()
    sub = (spec.get("s") or "").strip()
    items = spec.get("list") or []
    turn = (spec.get("t") or "").strip()

    zone_top, zone_bot = round(h * layout.top), round(h * layout.bottom)
    zone_h = zone_bot - zone_top

    def build(scale: float):
        """Lay the stack out at a given type scale and report how tall it comes to."""
        head_size = max(30, round(layout.head * scale))
        sub_size = max(20, round(layout.sub * scale))
        blocks: list = []

        def text_block(kind, text, path, size, colour, max_lines, leading, gap):
            f, lines = B.fit_font(text, path, size, max_w, max_lines=max_lines)
            step = round(f.size * leading)

            def draw(y, _f=f, _lines=lines, _step=step, _colour=colour):
                for ln in _lines:
                    d.text((x, y), ln, font=_f, fill=_colour)
                    y += _step
            blocks.append((kind, len(lines) * step + gap, draw))

        if head:
            text_block("head", head, B.BOLD, head_size, B.WHITE, 3, 1.22,
                       round(sub_size * (0.55 if kicker else 0.80)))
        if kicker:
            text_block("kicker", kicker, B.BOLD, round(sub_size * 1.16), B.ACCENT, 2, 1.20,
                       round(sub_size * 0.95))
        if sub:
            text_block("sub", sub, B.REGULAR, sub_size, B.BODY, 5, 1.34,
                       round(sub_size * (1.05 if (items or turn) else 0)))

        for item in items:
            f_l = B.font(B.BOLD, round(sub_size * 1.02))
            f_n = B.font(B.REGULAR, round(sub_size * 1.02))
            inset = round(sub_size * 0.78)
            l_lines = B.wrap((item.get("l") or "").strip(), f_l, max_w - inset)
            n_lines = B.wrap((item.get("n") or "").strip(), f_n, max_w - inset)
            step_l, step_n = round(f_l.size * 1.18), round(f_n.size * 1.18)
            height = len(l_lines) * step_l + len(n_lines) * step_n

            def draw(y, _l=l_lines, _n=n_lines, _fl=f_l, _fn=f_n, _sl=step_l, _sn=step_n,
                     _hh=height, _in=inset, _ss=sub_size):
                bar = max(4, round(_ss * 0.13))
                d.rounded_rectangle([x, y + round(_fl.size * 0.16), x + bar,
                                     y + _hh - round(_fl.size * 0.10)], radius=bar // 2, fill=B.ACCENT)
                yy = y
                for ln in _l:
                    d.text((x + _in, yy), ln, font=_fl, fill=B.WHITE)
                    yy += _sl
                for ln in _n:
                    d.text((x + _in, yy), ln, font=_fn, fill=B.BODY)
                    yy += _sn
            blocks.append(("item", height + round(sub_size * 0.62), draw))

        if turn:
            text_block("turn", turn, B.BOLD, round(head_size * (0.66 if items else 0.88)),
                       B.WHITE, 3, 1.22, 0)

        if blocks:                       # the last block's trailing gap is not real height
            kind, height, fn = blocks[-1]
            trailing = {"head": round(sub_size * 0.80), "kicker": round(sub_size * 0.95),
                        "sub": round(sub_size * 1.05), "item": round(sub_size * 0.62), "turn": 0}
            blocks[-1] = (kind, height - trailing.get(kind, 0), fn)
        return blocks, sum(hgt for _, hgt, _ in blocks)

    # SHRINK TO FIT, ALWAYS. A frame that overflows its zone writes over the wave and off the
    # bottom of the canvas, and on launch night that would have been caught by a human looking at
    # it. Nobody is going to look at four hundred of these, so the layout has to refuse to overflow
    # rather than rely on being noticed.
    scale = 1.0
    blocks, total = build(scale)
    while total > zone_h and scale > 0.44:
        scale -= 0.04
        blocks, total = build(scale)
    if total > zone_h:
        # It does not fit even at the smallest type a phone can carry. Say so, name the frame, and
        # stop. Silently shrinking to unreadable is the failure that never gets noticed, and a frame
        # with this much on it is a copy problem, not a layout problem.
        raise TooMuchCopy(
            f"frame {index + 1} has too much copy for a {layout.size[0]}x{layout.size[1]} frame. "
            f"It needs about {round((total - zone_h) / max(1, total) * 100)} percent fewer words, "
            f"or split it across two frames."
        )

    y = zone_top + max(0, (zone_h - total) // 2)
    for _, height, fn in blocks:
        fn(y)
        y += height
    return img


def render_end(spec: dict, layout: Layout) -> Image.Image:
    """
    The end card. Big mark, the name, the promise, the terms, the door. This is the only frame that
    carries the price and the trial, and both are checked by rules.py before we get here.
    """
    img = B.gradient(layout.size)
    B.waves(img, base_y=layout.wave_y)
    w, h = layout.size
    x = round(w * layout.margin)
    max_w = w - 2 * x

    msize = round(w * 0.084)
    y = round(h * (0.27 if layout.size == B.SQUARE else 0.22))
    y = B.mark(img, x, y, msize, colour=B.WHITE) + round(msize * 0.42)

    d = ImageDraw.Draw(img)
    f_name = B.font(B.BOLD, round(w * 0.067))
    d.text((x, y), "Lekhio.", font=f_name, fill=B.WHITE)
    y += round(f_name.size * 1.28)

    line = spec.get("promise") or "Your first employee."
    f_p, lines = B.fit_font(line, B.BOLD, round(w * 0.050), max_w, max_lines=2)
    for ln in lines:
        d.text((x, y), ln, font=f_p, fill=B.TINT)
        y += round(f_p.size * 1.22)
    y += round(w * 0.048)

    for body in (spec.get("terms") or ["£12.99 a month.", "Seven days free. No card."]):
        f_b = B.font(B.REGULAR, round(w * 0.041))
        d.text((x, y), body, font=f_b, fill=B.WHITE)
        y += round(f_b.size * 1.34)
    y += round(w * 0.038)

    # The door. A white pill, navy text. Always lekhio.app and never anything else.
    label = spec.get("door") or "lekhio.app"
    f_d = B.font(B.BOLD, round(w * 0.038))
    tw = d.textlength(label, font=f_d)
    pad_x, pad_y = round(w * 0.036), round(w * 0.024)
    pill = [x, y, x + tw + pad_x * 2, y + f_d.size + pad_y * 2]
    d.rounded_rectangle(pill, radius=(pill[3] - pill[1]) // 2, fill=B.WHITE)
    d.text((x + pad_x, y + pad_y - round(f_d.size * 0.08)), label, font=f_d, fill=B.NAVY_TOP)
    return img


def render_quote(text: str, layout: Layout) -> Image.Image:
    """The saveable one. One line, as big as it will go, nothing else on the frame."""
    img, x = _ground(layout, tinted_mark=False)
    _, max_w, h = _text_zone(layout)
    f, lines = B.fit_font(text, B.BOLD, round(layout.head * 1.25), max_w, max_lines=4)
    step = round(f.size * 1.20)
    total = len(lines) * step
    y = round(h * layout.top) + max(0, ((round(h * layout.bottom) - round(h * layout.top)) - total) // 2)
    d = ImageDraw.Draw(img)
    for ln in lines:
        d.text((x, y), ln, font=f, fill=B.WHITE)
        y += step
    return img


# ---------------------------------------------------------------------------
# The contact sheet. This is the approval surface. It exists so Jag can look at
# one image in the chat and say yes, no, or "bin 3".
# ---------------------------------------------------------------------------

def contact_sheet(frames: list[Image.Image], cols: int = 3) -> Image.Image:
    cell, pad, label_h = 380, 22, 46
    rows = (len(frames) + cols - 1) // cols
    W = cols * cell + pad * (cols + 1)
    H = rows * (cell + label_h) + pad * (rows + 1)
    sheet = Image.new("RGB", (W, H), (13, 27, 45))
    d = ImageDraw.Draw(sheet)
    f = B.font(B.BOLD, 26)
    for i, fr in enumerate(frames):
        r, c = divmod(i, cols)
        thumb = fr.copy()
        thumb.thumbnail((cell, cell), Image.LANCZOS)
        cx = pad + c * (cell + pad) + (cell - thumb.width) // 2
        cy = pad + r * (cell + label_h + pad) + label_h
        sheet.paste(thumb, (cx, cy))
        d.text((pad + c * (cell + pad), pad + r * (cell + label_h + pad) + 8),
               f"{i + 1}", font=f, fill=(150, 182, 224))
    return sheet


# ---------------------------------------------------------------------------
# The vertical video. ffmpeg only: a slow push on each frame, a soft cross fade
# between them. No AI generation, nothing to disclose, and it costs nothing.
# ---------------------------------------------------------------------------

def build_video(frame_paths: list[str], out: str, hold: float = 3.2, fade: float = 0.5) -> None:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is not on this machine and the vertical cut needs it")

    fps, zoom = 30, 0.07
    inputs, filters = [], []
    for i, p in enumerate(frame_paths):
        inputs += ["-loop", "1", "-t", f"{hold:.2f}", "-i", p]
        # THE SLOW PUSH, and a note on why it is not zoompan.
        #
        # zoompan is the obvious filter for this and it is what launch night used. It is also
        # roughly twelve times slower: about fifty seconds per beat against four, because it
        # rescales its whole source on every output frame. Six beats a piece and four pieces a
        # morning is the difference between half an hour of ffmpeg and two minutes.
        #
        # scale with eval=frame does the same job. The canvas grows seven percent across the hold
        # and a fixed crop holds the middle, which is a push. Dimensions are forced even because
        # libx264 refuses odd ones.
        grow = f"(1+{zoom}*t/{hold:.2f})"
        filters.append(
            f"[{i}:v]scale=w='ceil(1080*{grow}/2)*2':h='ceil(1920*{grow}/2)*2':eval=frame,"
            f"crop=1080:1920,fps={fps},format=yuv420p,setsar=1[v{i}]"
        )

    chain, prev, offset = [], "v0", hold - fade
    for i in range(1, len(frame_paths)):
        label = f"x{i}"
        chain.append(f"[{prev}][v{i}]xfade=transition=fade:duration={fade}:offset={offset:.2f}[{label}]")
        prev = label
        offset += hold - fade
    graph = ";".join(filters + chain)
    last = f"[{prev}]" if len(frame_paths) > 1 else "[v0]"

    cmd = ["ffmpeg", "-y", *inputs, "-filter_complex", graph, "-map", last,
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(fps), "-movflags", "+faststart", out]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{proc.stderr[-2000:]}")


# ---------------------------------------------------------------------------
# The run.
# ---------------------------------------------------------------------------

def sha(path_or_text) -> str:
    h = hashlib.sha256()
    if isinstance(path_or_text, str) and os.path.exists(path_or_text):
        with open(path_or_text, "rb") as fh:
            h.update(fh.read())
    else:
        h.update(str(path_or_text).encode())
    return h.hexdigest()[:16]


def collect_fragments(spec: dict) -> dict[str, str]:
    """Every string that will end up in front of a human, image text included."""
    frags = {}
    for i, fr in enumerate(spec.get("frames", []), 1):
        for key, name in (("h", "headline"), ("k", "kicker"), ("s", "subline"), ("t", "turn")):
            if fr.get(key):
                frags[f"frame {i} {name}"] = fr[key]
        for j, item in enumerate(fr.get("list") or [], 1):
            if item.get("l"):
                frags[f"frame {i} item {j} label"] = item["l"]
            if item.get("n"):
                frags[f"frame {i} item {j} note"] = item["n"]
        if fr.get("promise"):
            frags[f"frame {i} promise"] = fr["promise"]
        for j, t in enumerate(fr.get("terms") or [], 1):
            frags[f"frame {i} terms line {j}"] = t
    if spec.get("caption"):
        frags["caption"] = spec["caption"]
    if spec.get("quote"):
        frags["quote card"] = spec["quote"]
    return frags


def run(spec_path: str, outdir: str | None = None, force: bool = False) -> dict:
    with open(spec_path) as fh:
        spec = json.load(fh)

    pid = spec.get("id") or os.path.splitext(os.path.basename(spec_path))[0]
    out = outdir or os.path.join("out", pid)
    os.makedirs(os.path.join(out, "carousel"), exist_ok=True)

    # ---- The gate. Nothing is drawn until the words pass. ----
    result = R.lint(collect_fragments(spec))
    print(f"\nHOUSE RULES for {pid}")
    print(result.report())
    if not result.ok and not force:
        print("\nNothing rendered. Fix the copy above and run again.")
        return {"ok": False, "errors": result.errors}

    frames_spec = spec.get("frames", [])
    if not frames_spec:
        raise ValueError("the spec has no frames")

    # Lay every frame out at every size BEFORE writing anything, so a piece that cannot fit fails
    # whole rather than leaving half a carousel on disk.
    try:
        for i, fr in enumerate(frames_spec):
            for lay in (SQUARE_L, FEED_L, STORY_L):
                if not fr.get("end"):
                    render_frame(fr, lay, i)
    except TooMuchCopy as exc:
        print(f"\n  REFUSED  {exc}")
        print("\nNothing rendered.")
        return {"ok": False, "errors": [str(exc)]}

    # ---- 1:1 carousel ----
    squares, paths = [], []
    for i, fr in enumerate(frames_spec):
        img = render_end(fr, SQUARE_L) if fr.get("end") else render_frame(fr, SQUARE_L, i)
        p = os.path.join(out, "carousel", f"{i + 1:02d}.png")
        img.save(p)
        squares.append(img)
        paths.append(p)

    # ---- 4:5 feed, cut from frame one ----
    first = frames_spec[0]
    feed = render_end(first, FEED_L) if first.get("end") else render_frame(first, FEED_L, 0)
    feed.save(os.path.join(out, "feed.png"))

    # ---- 9:16, every frame, for the video and for stories ----
    tall_paths = []
    for i, fr in enumerate(frames_spec):
        img = render_end(fr, STORY_L) if fr.get("end") else render_frame(fr, STORY_L, i)
        p = os.path.join(out, "carousel", f"v{i + 1:02d}.png")
        img.save(p)
        tall_paths.append(p)
    Image.open(tall_paths[0]).save(os.path.join(out, "story.png"))

    # ---- the quote card ----
    quote_text = spec.get("quote") or (frames_spec[0].get("h") or "")
    if quote_text:
        render_quote(quote_text, SQUARE_L).save(os.path.join(out, "quote.png"))

    # ---- the contact sheet, which is what gets approved ----
    contact_sheet(squares).save(os.path.join(out, "contact-sheet.png"))

    # ---- the video ----
    video = os.path.join(out, "vertical.mp4")
    try:
        build_video(tall_paths, video, hold=float(spec.get("hold", 3.2)))
    except Exception as exc:                                   # noqa: BLE001
        print(f"  video not built: {exc}")
        video = None

    # ---- the captions ----
    base = spec.get("caption", "").strip()
    tool = spec.get("tool")
    lines = [f"# Captions for {pid}", ""]
    if spec.get("source_tag"):
        lines += [f"Tag: `{spec['source_tag']}`", ""]
    caps = {}
    for key, p in R.PLATFORMS.items():
        if key == "x":
            posts = R.thread(base, 280)
            body = "\n\n".join(f"{i + 1}/{len(posts)}  {t}" for i, t in enumerate(posts))
            if tool:
                body += f"\n\n{len(posts) + 1}/{len(posts) + 1}  {tool}"
            caps[key] = body
            lines += [f"## {p.label}  ({len(posts) + (1 if tool else 0)} posts)",
                      f"_{p.per_day} a day. {p.schedules}_", "", "```", body, "```", ""]
        else:
            body = R.fit_caption(base, p, tool)
            caps[key] = body
            lines += [f"## {p.label}  ({len(body)} of {p.caption_max} characters)",
                      f"_{p.per_day} a day. {p.schedules}_", "", "```", body, "```", ""]
    with open(os.path.join(out, "captions.md"), "w") as fh:
        fh.write("\n".join(lines))

    # ---- the manifest. Approval attaches to these hashes. ----
    assets = {}
    for root, _, files in os.walk(out):
        for name in sorted(files):
            if name == "manifest.json":
                continue
            full = os.path.join(root, name)
            assets[os.path.relpath(full, out)] = sha(full)
    manifest = {
        "id": pid,
        "source_tag": spec.get("source_tag"),
        "trade": spec.get("trade"),
        "mechanic": spec.get("mechanic"),
        "tool": tool,
        "frames": len(frames_spec),
        "warnings": result.warnings,
        "captions": {k: sha(v) for k, v in caps.items()},
        "assets": assets,
    }
    with open(os.path.join(out, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)

    print(f"\n{len(assets)} assets in {out}")
    for k in sorted(assets):
        print(f"  {k}")
    return {"ok": True, "out": out, "manifest": manifest}


def verify(outdir: str) -> bool:
    """
    Re-hash everything and compare to the manifest. Run this immediately before uploading.
    If a single byte moved since Jag said yes, this fails and it goes back to him.
    """
    with open(os.path.join(outdir, "manifest.json")) as fh:
        manifest = json.load(fh)
    bad = []
    for rel, want in manifest["assets"].items():
        full = os.path.join(outdir, rel)
        if not os.path.exists(full):
            bad.append(f"missing: {rel}")
        elif sha(full) != want:
            bad.append(f"changed since approval: {rel}")
    if bad:
        print("APPROVAL BROKEN. Do not post.")
        for b in bad:
            print(f"  {b}")
        return False
    print(f"verified: {len(manifest['assets'])} assets match the approved manifest")
    return True


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(0)
    if "--verify" in sys.argv:
        sys.exit(0 if verify(args[0]) else 1)
    res = run(args[0], force="--force" in sys.argv)
    sys.exit(0 if res.get("ok") else 1)

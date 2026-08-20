"""
THE CUTTING ROOM GATE.

    python3 test_cutroom.py

Two thirds of this file is the house rules, because that is the part that can hurt us. A frame that
lays out badly is embarrassing. A frame that says we file your tax is a regulatory problem printed
on a picture, and on 20 August exactly that kind of claim was found live in three images.

Every forbidden phrase gets a test that proves it is REFUSED, and an honest near miss that proves it
is allowed, because a lint that fails everything gets switched off within a week.
"""

import json
import os
import shutil
import sys
import tempfile

import brand as B
import rules as R
import cut

FAILS = []
SKIPS = []
COUNT = 0


def check(cond, what):
    global COUNT
    COUNT += 1
    if not cond:
        FAILS.append(what)


def refused(text, why, label="caption"):
    r = R.lint({label: text})
    check(not r.ok, f"should have been REFUSED ({why}): {text!r}")


def allowed(text, why, label="caption"):
    r = R.lint({label: text})
    check(r.ok, f"should have been ALLOWED ({why}): {text!r} -> {r.errors}")


# ---------------------------------------------------------------------------
# The dashes. The writing rule, broken by accident more than anything else.
# ---------------------------------------------------------------------------
refused("You text it — it is logged.", "em dash")
refused("Seven days – no card.", "en dash")
refused("You text it - it is logged.", "hyphen used as a dash")
allowed("A self employed plasterer.", "no dash at all")
allowed("Our sign-off is quick.", "a real hyphenated word is not a dash")

# ---------------------------------------------------------------------------
# Filing. Lekhio cannot file to HMRC and has no production access.
# ---------------------------------------------------------------------------
refused("We file your tax return for you.", "present tense filing claim")
refused("We will file it for you in November.", "future tense is heard as present")
refused("Lekhio files your quarterly update.", "third person filing claim")
refused("It does your tax so you do not have to.", "does your tax")
refused("Your return, filed for you.", "filed for you")
allowed("Lekhio prepares your update. You send it.", "prepare and send, which is the truth")
allowed("We prepare it. You press approve.", "the doctrine, stated plainly")
allowed("Keep your profile up to date.", "the word profile contains file and must not trip")

# ---------------------------------------------------------------------------
# HMRC standing. 'recognised' is the only permitted word and it is not true yet.
# ---------------------------------------------------------------------------
refused("HMRC approved software.", "endorsement")
refused("We are HMRC recognised.", "not true yet")
refused("Approved by HMRC.", "endorsement, other word order")
allowed("HMRC holds you responsible for your own return.", "a true statement about HMRC")

# ---------------------------------------------------------------------------
# A number on the saving. This is the one that was live in five places.
# ---------------------------------------------------------------------------
refused("Saves you £2,000 a year.", "a figure on the saving")
refused("On average our customers keep more.", "a statistical claim we cannot support")
refused("Up to £3,000 back.", "an up to figure")
refused("£2,000 to £3,000 a year, on average.", "the exact claim found on 20 August")
allowed("£12.99 a month. Seven days free. No card.", "our own price is a fact, not a saving")
allowed("The money is in what you are owed.", "the mechanism, with no number on it")

# ---------------------------------------------------------------------------
# The trial length, the domain, and the positioning we do not use.
# ---------------------------------------------------------------------------
refused("Free for 14 days, no card.", "docs 110 and 111 are stale, the trial is seven days")
refused("Visit lekhio.com to start.", "that domain belongs to somebody else")
refused("The AI operating system for business.", "doc 104 section 2")
refused("We take the mental load off you.", "say the feeling, never name it")
allowed("Seven days free. No card.", "the real trial")
allowed("lekhio.app", "the domain we actually own")

# ---------------------------------------------------------------------------
# An AI character can illustrate. It can never be a customer.
# ---------------------------------------------------------------------------
refused("I use Lekhio every day on site.", "an invented customer voice")
refused("Lekhio saved me hours last quarter.", "an invented customer testimonial")
allowed("A groundworker gets home at seven with a pocket full of receipts.", "illustrating a situation")

# ---------------------------------------------------------------------------
# A deadline has to carry who sends it, in the same breath.
# ---------------------------------------------------------------------------
r = R.lint({"caption": "The quarterly update deadline is coming round again."})
check(not r.ok, "a deadline with no 'you send it' must be refused")
r = R.lint({"caption": "The quarterly update deadline is close. Lekhio prepares it and you send it."})
check(r.ok, f"a deadline that says who sends it must pass: {r.errors}")

# ---------------------------------------------------------------------------
# Warnings warn, they do not refuse. A lint that blocks everything gets ignored.
# ---------------------------------------------------------------------------
r = R.lint({"caption": "No bank connection yet. You import a statement."})
check(r.ok, "an honest bank line must not be refused")
check(any("bank" in w for w in r.warnings), "an honest bank line should still raise a check")

# ---------------------------------------------------------------------------
# The lint reads the PICTURES, not just the caption. This is the 20 August lesson:
# three of the five bad claims were images, and a copy only sweep found none of them.
# ---------------------------------------------------------------------------
spec = {"frames": [{"h": "We file your tax.", "s": "ok"}], "caption": "A clean caption."}
r = R.lint(cut.collect_fragments(spec))
check(not r.ok, "a claim in a FRAME HEADLINE must be refused even when the caption is clean")
check(any("frame 1 headline" in e for e in r.errors), "the failure must name the frame to fix")

spec = {"frames": [{"h": "ok", "list": [{"l": "HMRC approved.", "n": "ok"}]}]}
r = R.lint(cut.collect_fragments(spec))
check(not r.ok, "a claim inside a LIST ITEM on a picture must be refused")

spec = {"frames": [{"end": True, "terms": ["Free for 14 days."]}]}
r = R.lint(cut.collect_fragments(spec))
check(not r.ok, "a stale trial length on an END CARD must be refused")

# ---------------------------------------------------------------------------
# Captions are cut to fit, and the cut never loses the tool link.
# ---------------------------------------------------------------------------
long = ("A sentence about being owed money back. " * 40).strip()
for key, p in R.PLATFORMS.items():
    if key == "x":
        continue
    body = R.fit_caption(long, p, "https://lekhio.app/cis-calculator")
    check(len(body) <= p.caption_max, f"{key} caption is over its limit: {len(body)}>{p.caption_max}")
    if key != "instagram":
        check("cis-calculator" in body, f"{key} lost the tool link in the cut")

posts = R.thread(long, 280)
check(all(len(t) <= 280 for t in posts), "an X thread post is over 280")
check(len(posts) > 1, "a long piece should become more than one X post")
check("".join(posts).replace(" ", "")[:80] == long.replace(" ", "")[:80], "the thread dropped words")

# ---------------------------------------------------------------------------
# The face resolves on this machine. Liberation Sans on Linux, Arial on macOS,
# which is metrically identical so the wraps come out the same either way.
# ---------------------------------------------------------------------------
import os                                                                   # noqa: E402
check(os.path.exists(B.BOLD), f"no bold face resolved: {B.BOLD}")
check(os.path.exists(B.REGULAR), f"no regular face resolved: {B.REGULAR}")
check("Helvetica" not in B.BOLD,
      "fell back to Helvetica, which is not metrically identical to Liberation Sans and can wrap "
      "a headline differently. Install Arial or Liberation Sans.")

# ---------------------------------------------------------------------------
# The brand. Contrast, because a 2.70:1 label got to production once already.
# ---------------------------------------------------------------------------
for name, fg in (("white", B.WHITE), ("tint", B.TINT), ("body", B.BODY)):
    for bg in (B.NAVY_TOP, B.NAVY_BOT):
        c = B.contrast(fg, bg)
        check(c >= 4.5, f"{name} on navy is {c:.2f}:1, under 4.5")

# The accent orange is 7.16:1 at the dark end of the gradient and 4.17:1 at the light end. That
# clears AA for LARGE text (3:1) everywhere and misses AA for small text at the light end. So it is
# only ever a big bold kicker or a rule, never body copy, and the renderer only uses it that way.
for bg in (B.NAVY_TOP, B.NAVY_BOT):
    c = B.contrast(B.ACCENT, bg)
    check(c >= 3.0, f"accent on navy is {c:.2f}:1, under 3.0 and unusable even as large text")

# ---------------------------------------------------------------------------
# The layout. Nothing overflows its zone and nothing is written over the wave.
# ---------------------------------------------------------------------------
import numpy as np                                                          # noqa: E402

def ink_bottom(img, layout):
    """The lowest row that has text on it, ignoring the wave band."""
    a = np.array(img.convert("RGB")).astype(int)
    w, h = img.size
    # Text is much brighter than the navy ground. The wave is excluded by only looking above it.
    # Stop well clear of the wave: the orange tip is brighter than the threshold and would be
    # read as text. The wave crest sits about one amplitude above its centre line.
    top = a[: int(h * layout.wave_y - 0.055 * w)]
    bright = (top.sum(2) > 430)
    rows = np.nonzero(bright.any(1))[0]
    return int(rows.max()) if len(rows) else 0

heavy = {
    "h": "A headline that is deliberately far too long to sit on this frame comfortably at all",
    "k": "Logged. Sorted. Done. And then some more words.",
    "s": "A subline that also runs on and on and refuses to stop, well past what anybody would write.",
    "list": [{"l": "One thing it cannot do.", "n": "And the honest note under it."},
             {"l": "A second thing.", "n": "With its own note."},
             {"l": "A third thing.", "n": "With another note."}],
    "t": "And a closing line on top of all of that.",
}
for layout, name in ((cut.SQUARE_L, "square"), (cut.FEED_L, "feed"), (cut.STORY_L, "story")):
    try:
        img = cut.render_frame(heavy, layout, 1)
    except cut.TooMuchCopy:
        continue                       # refusing is the correct answer, and it names the frame
    limit = int(layout.size[1] * layout.wave_y) - 10
    check(ink_bottom(img, layout) < limit,
          f"an overloaded {name} frame wrote past its zone and into the wave")
    if layout is cut.STORY_L:
        # 9:16 text has to stay in the upper two thirds or TikTok's own buttons sit on it.
        check(ink_bottom(img, layout) < layout.size[1] * 0.68,
              "9:16 text ran below the upper two thirds, where TikTok's furniture covers it")

# A frame that cannot fit must REFUSE rather than shrink to something nobody can read.
overloaded = dict(heavy, list=[{"l": f"Thing number {i}.", "n": "And an honest note under it."}
                               for i in range(9)])
try:
    cut.render_frame(overloaded, cut.STORY_L, 3)
    check(False, "a wildly overloaded frame should have raised TooMuchCopy")
except cut.TooMuchCopy as exc:
    check("frame 4" in str(exc), f"the refusal must name the frame to fix: {exc}")

# A writer's own line break is obeyed rather than re-wrapped.
f, lines = B.fit_font("We built\nin the dark.", B.BOLD, 116, 888, max_lines=3)
check(lines == ["We built", "in the dark."], f"a hard line break was not honoured: {lines}")

# ---------------------------------------------------------------------------
# End to end, including the manifest, which is what approval attaches to.
# ---------------------------------------------------------------------------
with tempfile.TemporaryDirectory() as tmp:
    spec = {
        "id": "gate",
        "tool": "https://lekhio.app/cis-calculator",
        "source_tag": "gate-test",
        "frames": [
            {"h": "Submission is\nthe easy bit."},
            {"h": "The money is in\nwhat you are owed.", "s": "Most subbies never claim it back."},
            {"end": True, "promise": "Your first employee.",
             "terms": ["£12.99 a month.", "Seven days free. No card."]},
        ],
        "caption": "Submission is the easy bit. The money is in what you are owed.",
    }
    path = os.path.join(tmp, "gate.json")
    with open(path, "w") as fh:
        json.dump(spec, fh)
    out = os.path.join(tmp, "out")
    res = cut.run(path, outdir=out)
    check(res["ok"], "a clean spec must render")
    for want in ("carousel/01.png", "feed.png", "story.png", "quote.png",
                 "contact-sheet.png", "captions.md"):
        check(want in res["manifest"]["assets"], f"the run did not produce {want}")

    # The video needs ffmpeg. A machine without it still makes every still, every caption and a
    # valid manifest, so the gate SKIPS the video rather than failing. It says so out loud: a
    # skipped check that stays quiet is how a broken thing passes for a month.
    if shutil.which("ffmpeg"):
        check("vertical.mp4" in res["manifest"]["assets"], "the run did not produce vertical.mp4")
    else:
        SKIPS.append("vertical.mp4: no ffmpeg on this machine. brew install ffmpeg to render video here.")
    check(cut.verify(out), "a freshly rendered piece must verify against its own manifest")

    # Change one byte and the approval must break. This is the whole point of the manifest.
    with open(os.path.join(out, "captions.md"), "a") as fh:
        fh.write("\nsomething changed after approval\n")
    check(not cut.verify(out), "an edited asset must FAIL verification, or approval means nothing")

    # A spec that breaks the house rules renders nothing at all.
    spec["frames"][0]["h"] = "We file your tax for you."
    with open(path, "w") as fh:
        json.dump(spec, fh)
    res = cut.run(path, outdir=os.path.join(tmp, "out2"))
    check(not res["ok"], "a spec with a filing claim must not render")
    check(not os.path.exists(os.path.join(tmp, "out2", "carousel", "01.png")),
          "a refused spec must not leave frames on disk")

print(f"\n{COUNT - len(FAILS)} of {COUNT} checks passed")
for s_ in SKIPS:
    print(f"  SKIP  {s_}")
for f in FAILS:
    print(f"  FAIL  {f}")
sys.exit(1 if FAILS else 0)

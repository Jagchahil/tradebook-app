# The cutting room

**One thing you wrote goes in. Every platform native asset comes out.**

```
python3 cut.py originals/your-piece.json
python3 cut.py out/your-piece --verify     # run this immediately before posting
python3 test_cutroom.py                    # the gate, 80 checks
```

Needs `python3`, `pillow`, `numpy` and `ffmpeg`. Nothing else. No API key, no network, no
generation credit, nothing to label as AI made.

---

## What it is not

**It does not write copy.** Nothing in here invents a word, a hook, an angle or a caption. That was
deleted on 31 July on purpose, commit `b7dac7ef`, *"marketing is made by hand"*, and it stays
deleted.

Doc 121's multiplication table was never about a machine having ideas. Four originals become twenty
four posts by **cutting**, not by inventing. Launch night proved it: one line, six frames, and out of
those six frames came a carousel and a vertical video that covered TikTok, Reels and Shorts. That
cutting is mechanical and always was. This is the machine for it.

---

## One spec in

```json
{
  "id": "cis-refund",
  "trade": "groundworker",
  "tool": "https://lekhio.app/cis-calculator",
  "source_tag": "cis-ground-0821",
  "quote": "Submission is the easy bit.",
  "frames": [
    { "h": "Submission is\nthe easy bit." },
    { "h": "The money is in\nwhat you are owed.",
      "k": "Most never claim it.",
      "s": "Your contractor takes twenty percent before you see a penny." },
    { "h": "What it cannot do.",
      "list": [{ "l": "It cannot file to HMRC.", "n": "We prepare it. You send it." }],
      "t": "We would rather tell you." },
    { "end": true, "promise": "Your first employee.",
      "terms": ["£12.99 a month.", "Seven days free. No card."] }
  ],
  "caption": "The long version, in your words. Every platform gets cut from this."
}
```

| Key | What it is |
|---|---|
| `h` | the headline. Bold white, the big one |
| `k` | the kicker. Bold orange, the three word drumbeat |
| `s` | the subline. The explaining sentence |
| `list` | `{l, n}` rows, each with an orange rule |
| `t` | the turn. The closing line |
| `end` | the end card: mark, name, promise, terms, the door |

**A newline in a headline is a hard break and it is obeyed.** This matters. On launch night the
frame read *"We built / in the dark."* and a greedy wrapper gives you *"We built in the / dark."*,
which is the same words and a worse poster. Where a line breaks is a craft decision and it stays
yours.

---

## Everything out

| File | Size | Where it goes |
|---|---|---|
| `carousel/01..NN.png` | 1080x1080 | Instagram carousel, LinkedIn, Facebook |
| `feed.png` | 1080x1350 | Instagram 4:5, the tallest it shows without cropping |
| `story.png` | 1080x1920 | Instagram and Facebook stories |
| `quote.png` | 1080x1080 | the saveable one, the sharpest line on its own |
| `vertical.mp4` | 1080x1920 | TikTok, Reels, Shorts |
| `contact-sheet.png` | | **this is the one you approve in the chat** |
| `captions.md` | | every platform, inside every character limit |
| `manifest.json` | | a sha256 of every asset and caption |

About thirty five seconds for a six frame piece. Four originals is under three minutes.

---

## The three things worth knowing

### 1. The house rules run before anything is drawn

`rules.py` refuses to render copy that breaks them. Filing claims in any tense, HMRC endorsement, a
figure on the saving, the stale fourteen day trial, `lekhio.com`, an invented customer voice, em
dashes, and a deadline named without saying who sends it.

**It reads the pictures, not just the caption.** On 20 August the savings claim was live in five
places and three of them were images. A sweep that greps copy finds none of those. Here there is no
route to a rendered frame that skips the lint, because the frame is rendered *from* the string the
lint checked. They are the same string.

Errors refuse. Warnings print and you decide.

### 2. The manifest is what approval attaches to

Every asset and every caption is hashed. `--verify` re-hashes and compares.

Run it immediately before uploading. If one byte moved since you said yes, it fails and it comes
back to you. **The gate was never about whose finger moves the mouse. It is that a human said yes to
this exact artefact**, and this is the mechanism that makes that true rather than a promise.

### 3. A frame that will not fit refuses, it does not shrink

Type shrinks to fit the zone, and if it still will not fit at a size a person could read on a phone
it raises and names the frame and roughly how many words to cut. Silently shrinking to unreadable is
the failure nobody notices, and nobody is going to eyeball four hundred of these.

---

## The brand, and why the numbers look arbitrary

Every colour and measurement in `brand.py` was read off `marketing/launch-carousel/*.png` pixel by
pixel. The wave is a cosine with its trough at 18.5 percent across and a period of 0.83 of the
width, because that is what the launch frames are. There are **two** strokes, not three: anyone
counting three is counting the antialiasing.

Two rules the code will not let you break:

1. The wave sits in the lower third and nothing is written over it.
2. Text in a 9:16 frame stays in the upper two thirds, inset from the right. TikTok's buttons eat
   the bottom fifth and the action rail covers the right edge.

The accent orange is 7.16:1 on the dark end of the gradient and 4.17:1 on the light end. That clears
AA for large text everywhere and misses it for small text at the light end, so **it is only ever a
big bold kicker or a rule, never body copy.**

---

## Where the platforms actually stand, checked 21 August 2026

Doc 121 section 8 says the ceiling is hand posting until app review clears. That was true in July.
It is not true now.

| Platform | Native scheduling, no API, no app review |
|---|---|
| Instagram | **All public accounts since 1 March 2026. 25 a day, 75 days ahead.** Feed, carousels, reels. Not stories |
| TikTok | Web uploader. 15 minutes to 10 days ahead. Creator or Business account |
| LinkedIn | Company pages, 1 hour to 3 months. One at a time, no multi photo posts |
| YouTube | Studio schedules Shorts |
| Facebook | Meta Business Suite, same composer as Instagram |
| **X** | **Needs Premium. The free tier cannot schedule at all** |
| Threads | No native scheduler |

Roughly ninety percent of the grid, in batches, for about six pounds a month.

---

## Files

```
brand.py          the palette, the wave, the mark, the type. Measured, not invented
rules.py          the house rules and the platform limits. Read this before adding a phrase
cut.py            the renderer and the CLI
test_cutroom.py   80 checks. Two thirds of them are the house rules
originals/        the specs. One JSON per piece
out/              rendered. Not committed
```

`originals/launch-night.json` is the proof fixture: the six frames that actually went out on
20 August, transcribed. Render it and put it next to `marketing/launch-carousel/` to check the brand
survived a change.

"""
THE HOUSE RULES, ENFORCED BEFORE ANYTHING IS DRAWN.

On 20 August a claim we cannot substantiate was found live in five places and THREE OF THEM WERE
PICTURES: the X header and two Facebook photos. A sweep that greps copy finds none of those.

This file is the answer to that. Everything the cutting room renders is rendered FROM A SPEC, and the
spec is linted here first. So the words on a picture are checked by the same pass that checks the
caption, because they are the same string. There is no route to a rendered frame that skips this.

ERRORS refuse to render. WARNINGS print and let a human decide, because some of them need judgement.

Sources: CLAUDE.md (the writing rules, the tax rules, the domain), doc 121 section 11 (what we do not
do), doc 111 (never a figure on the saving, never an AI actor as a customer), doc 104 (what we never
call ourselves), doc 108 (why a promised saving trips HMRC rules).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# ERRORS. These stop the press.
# ---------------------------------------------------------------------------

# (pattern, what is wrong, what to do instead)
FORBIDDEN: list[tuple[str, str, str]] = [
    # --- Dashes. The writing rule, and the easiest one to break by accident. ---
    (r"—", "em dash", "Use a full stop, or rewrite the sentence."),
    (r"–", "en dash", "Use a full stop, or rewrite the sentence."),
    (r"(?<=\s)-(?=\s)", "a hyphen used as a dash", "Use a full stop, or rewrite the sentence."),

    # --- Filing. Lekhio cannot file to HMRC. Sandbox access only, no production application. ---
    (r"\bwe(?:'ll| will| shall)?\s+file\b", "a filing claim",
     "Lekhio cannot file to HMRC. Say 'Lekhio prepares your update. You send it.'"),
    (r"\b(?:file|files|filing|submit|submits|submitting)\s+(?:your|their|his|her)\s+(?:tax|return|update)",
     "a filing claim", "We prepare. The user sends. Never in any tense."),
    (r"\b(?:do|does|doing|did)\s+(?:your|their)\s+tax\b", "a 'does your tax' claim",
     "We prepare it and you approve it. That is the whole product."),
    (r"\bsorts?\s+(?:your|their)\s+tax\s+(?:out|for you)\b", "a 'sorts your tax' claim",
     "Prepare, not do. Say what it actually does."),
    (r"\bfiled?\s+for\s+you\b", "a filing claim", "Nothing is filed for anyone."),

    # --- HMRC standing. 'recognised' is the only permitted word and it is not true yet. ---
    (r"\bHMRC[\s-]*(approved|accredited|certified|endorsed|recognised|recognized|backed|official)\b",
     "an HMRC endorsement claim", "None of these are true. Remove it."),
    (r"\bapproved\s+by\s+HMRC\b", "an HMRC endorsement claim", "Not true. Remove it."),
    (r"\bin\s+partnership\s+with\s+HMRC\b", "an HMRC partnership claim", "Not true. Remove it."),

    # --- A number on the saving. Doc 111 forbids it, doc 108 explains why. ---
    (r"\bon\s+average\b", "an 'on average' claim",
     "A statistical claim about customers we have no average for. Cut it."),
    (r"\b(?:save|saves|saving|saved)\s+(?:you\s+)?(?:up\s+to\s+)?£", "a figure on the saving",
     "Never put a number on the saving. Say what it does, not what it is worth."),
    (r"\bup\s+to\s+£", "an 'up to' figure", "Never a figure presented as a promise."),
    (r"£[\d,]+\s*(?:to|–|-)\s*£?[\d,]+\s*a\s*(?:year|month)", "a saving range",
     "This is the exact claim that was live in five places on 20 August. Cut it."),

    # --- The domain. lekhio.com belongs to somebody else. ---
    (r"lekhio\.com", "a rival's domain", "We own lekhio.app and nothing else."),

    # --- What we never call ourselves. ---
    (r"\bAI\s+operating\s+system\b", "a banned positioning line", "Doc 104 section 2."),
    (r"\bmental\s+load\b", "naming the insight instead of saying the feeling",
     "Say the feeling. Never name it."),

    # --- The trial is seven days. Docs 110 and 111 still say fourteen and they are stale. ---
    (r"\b(?:14|fourteen)\s*[- ]?\s*days?\s+(?:free|trial)", "the wrong trial length",
     "The trial is seven days, no card."),
    (r"\bfree\s+for\s+(?:14|fourteen)\s+days\b", "the wrong trial length", "Seven days, no card."),

    # --- An AI character can never be a customer. ---
    (r"\bI\s+use\s+Lekhio\b", "an invented customer voice",
     "Only the six real testimonials speak. A faceless character illustrates, it never endorses."),
    (r"\bLekhio\s+(?:saved|made)\s+me\b", "an invented customer voice",
     "Only a real named customer who agreed to it can say this."),
]

# ---------------------------------------------------------------------------
# WARNINGS. A person decides.
# ---------------------------------------------------------------------------

CAUTION: list[tuple[str, str]] = [
    (r"\b(?:coming\s+soon|launching\s+soon|shortly|any\s+day\s+now|switching\s+on)\b",
     "a date on something somebody else decides. Name the absence instead."),
    (r"(?<![a-z])soon(?![a-z])",
     "'soon' is a date on somebody else's decision. Check who decides it."),
    (r"\b(?:guaranteed|guarantee)\b", "a guarantee. Check we can stand behind it."),
    (r"\b(?:easiest|best|number\s+one|#1|leading)\b",
     "a superlative. Market A is at stage four or five and does not register claims."),
    (r"\bbank\s+(?:feed|connection|connected)\b",
     "the bank feed has no provider yet. Statement import only, from eleven banks."),
    (r"\bautomatically\s+(?:files|submits|sends)\b", "check this is not a filing claim in disguise."),
]

# A piece that names a deadline has to say who sends it, in the same breath.
DEADLINE_WORDS = re.compile(
    r"\b(?:deadline|due\s+by|by\s+the\s+\d|31\s+january|5\s+april|7\s+november|quarterly\s+update)\b",
    re.I,
)
SENDS_IT = re.compile(r"\byou\s+(?:send|submit|press|approve)\b", re.I)


@dataclass
class LintResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def report(self) -> str:
        out = []
        for e in self.errors:
            out.append(f"  REFUSED  {e}")
        for w in self.warnings:
            out.append(f"  CHECK    {w}")
        return "\n".join(out) if out else "  clean"


def lint(fragments: dict[str, str]) -> LintResult:
    """
    fragments maps a label ('frame 2 headline', 'caption') to the text. The label is what a human
    reads in the failure, so it has to say where to go and fix it.
    """
    res = LintResult()
    for label, text in fragments.items():
        if not text:
            continue
        for pattern, what, fix in FORBIDDEN:
            m = re.search(pattern, text, re.I)
            if m:
                snippet = text[max(0, m.start() - 24):m.end() + 24].strip()
                res.errors.append(f"{label}: {what} in \"...{snippet}...\"  {fix}")
        for pattern, note in CAUTION:
            m = re.search(pattern, text, re.I)
            if m:
                res.warnings.append(f"{label}: {note}  (\"{m.group(0)}\")")

    whole = " ".join(v for v in fragments.values() if v)
    if DEADLINE_WORDS.search(whole) and not SENDS_IT.search(whole):
        res.errors.append(
            "the piece names a deadline but never says who sends it. "
            "Doc 121: the words 'you send it' appear in the same breath or the copy does not go out."
        )
    return res


# ---------------------------------------------------------------------------
# The platforms. Ceilings from doc 121 section 4, character limits from the platforms.
# ---------------------------------------------------------------------------

@dataclass
class Platform:
    key: str
    label: str
    caption_max: int      # hard character limit
    visible: int          # how much shows before a 'more' fold
    per_day: str          # the ceiling doc 121 sets
    schedules: str        # what native scheduling actually allows, checked 21 Aug 2026
    tags: tuple[str, ...] = ()


PLATFORMS: dict[str, Platform] = {
    "instagram": Platform(
        "instagram", "Instagram", 2200, 125, "2 feed or reels, plus 4 to 6 stories",
        "Native. All public accounts since 1 March 2026. 25 a day, 75 days ahead. Not stories.",
        ("#selfemployed", "#tradesmen", "#uktax", "#soletrader"),
    ),
    "tiktok": Platform(
        "tiktok", "TikTok", 2200, 100, "3 to 4",
        "Native on the web uploader. 15 minutes to 10 days ahead. Creator or Business account.",
        ("#selfemployed", "#tradestok", "#uktax", "#cis"),
    ),
    "youtube_short": Platform(
        "youtube_short", "YouTube Shorts", 5000, 100, "2 to 3",
        "Native in YouTube Studio.",
        ("#shorts", "#selfemployed", "#uktax"),
    ),
    "facebook": Platform(
        "facebook", "Facebook", 63206, 477, "1 to 2 on the page, plus groups",
        "Native in Meta Business Suite, same composer as Instagram.",
        (),
    ),
    "linkedin": Platform(
        "linkedin", "LinkedIn", 3000, 210, "exactly 1, more is punished",
        "Native for company pages, 1 hour to 3 months ahead. One at a time. No multi photo posts.",
        ("#selfemployed", "#construction", "#uktax"),
    ),
    "x": Platform(
        "x", "X", 280, 280, "6 to 8",
        "Native scheduling needs Premium. The free tier cannot schedule at all.",
        (),
    ),
    "threads": Platform(
        "threads", "Threads", 500, 500, "2 to 3",
        "No native scheduler.",
        (),
    ),
}


def fit_caption(text: str, p: Platform, tool_url: str | None = None) -> str:
    """
    Cut a caption to a platform. Never mid word, never mid sentence if it can be helped, and the tool
    link survives, because doc 121 says every pillar ends on a tool and not on a signup.
    """
    tail_parts = []
    if tool_url and p.key != "instagram":   # Instagram does not make caption links clickable
        tail_parts.append(tool_url)
    if p.tags:
        tail_parts.append(" ".join(p.tags))
    tail = ("\n\n" + "\n".join(tail_parts)) if tail_parts else ""

    room = p.caption_max - len(tail)
    body = text.strip()
    if len(body) <= room:
        return body + tail

    # Trim back to the last sentence end that fits, else the last space.
    cut = body[:room]
    for stop in (". ", ".\n", "? ", "! "):
        i = cut.rfind(stop)
        if i > room * 0.5:
            return cut[: i + 1].strip() + tail
    i = cut.rfind(" ")
    return (cut[:i] if i > 0 else cut).strip() + tail


def thread(text: str, limit: int = 280) -> list[str]:
    """Break a long piece into X sized posts on sentence boundaries, never mid sentence."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    posts, cur = [], ""
    for s in sentences:
        if not s:
            continue
        if len(s) > limit:                      # a single sentence too long to post: split on commas
            for part in re.split(r"(?<=,)\s+", s):
                if len(cur) + len(part) + 1 <= limit:
                    cur = f"{cur} {part}".strip()
                else:
                    if cur:
                        posts.append(cur)
                    cur = part
            continue
        if len(cur) + len(s) + 1 <= limit:
            cur = f"{cur} {s}".strip()
        else:
            posts.append(cur)
            cur = s
    if cur:
        posts.append(cur)
    return posts

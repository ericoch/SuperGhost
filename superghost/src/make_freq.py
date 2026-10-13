"""Regenerate freq.txt from enable1.txt (needed only if you change the dictionary).

    pip install wordfreq
    python3 src/make_freq.py
"""
from pathlib import Path
from wordfreq import zipf_frequency

src = Path(__file__).parent
words = (src / "enable1.txt").read_text().split()
codes = "".join(chr(97 + min(15, int(zipf_frequency(w, "en") * 2))) for w in words)
(src / "freq.txt").write_text(codes)
print(f"Wrote {len(codes)} frequency codes")

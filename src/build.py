"""Rebuild index.html from the editable sources in this folder.

    python3 src/build.py

template.html holds the page with three placeholders, which this fills in:
  /*__SOLVER__*/  <- solver.js (the computer opponent, also run as a Web Worker)
  "__DICT__"      <- enable1.txt (one word per line)
  "__FREQ__"      <- freq.txt (one letter per word, 'a' + floor(2 x Zipf frequency))
"""
from pathlib import Path

src = Path(__file__).parent
words = (src / "enable1.txt").read_text().split()
freq = (src / "freq.txt").read_text().strip()
assert len(words) == len(freq), "freq.txt must have one letter per dictionary word"

page = (src / "template.html").read_text()
for ph in ['/*__SOLVER__*/', '"__DICT__"', '"__FREQ__"']:
    assert page.count(ph) == 1, f"placeholder {ph} missing from template.html"

page = (page.replace("/*__SOLVER__*/", (src / "solver.js").read_text())
            .replace('"__FREQ__"', '"' + freq + '"')
            .replace('"__DICT__"', '"' + " ".join(words) + '"'))
out = src.parent / "index.html"
out.write_text(page)
print(f"Wrote {out} ({len(page) / 1e6:.2f} MB)")

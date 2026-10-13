# Superghost

A two-player word game: take turns inserting a letter anywhere in the row, without completing a word, while keeping it possible to make one. Challenge your opponent when you think no word fits.

Play against a friend on one screen, or against the computer at four levels (Easy, Medium, Hard, Perfect). The page is a single self-contained file, `index.html`, with the dictionary built in. It needs no server code and works on GitHub Pages as is.

## How the computer plays

The game is solved by search from the current position, remembering results as it goes. Each position carries its *support*: the dictionary words that still contain its letters in order. Supports only shrink as letters are added, so the search never rescans the whole dictionary below the first move.

For each supporting word, the letters that can legally go in a gap are those between where the letters before the gap first fit, matched from the left, and where the letters after it last fit, matched from the right. That generates exactly the moves that keep a word possible.

With the ENABLE dictionary and a 4-letter minimum, the second player wins with perfect play. Proving this takes about half a million positions.

The difficulty levels limit which words the computer knows, ranked by everyday frequency from the `wordfreq` data.

## Editing

`index.html` is generated. To change the game, edit `src/template.html` (the page) or `src/solver.js` (the computer opponent), then rebuild:

```
python3 src/build.py
```

Dictionary: ENABLE word list (public domain), 172,823 words.

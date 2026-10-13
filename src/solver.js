function SolverCore(){
  "use strict";
  /* Levels: which words the computer "knows" (by everyday frequency), and how
     often it plays a random safe move instead of searching. */
  const LEVELS = {
    easy:    { minFreq: 7, mistake: 0.20 },   // Zipf >= 3.5, ~12.8k words
    medium:  { minFreq: 5, mistake: 0.08 },   // Zipf >= 2.5, ~36k words
    hard:    { minFreq: 4, mistake: 0 },      // Zipf >= 2.0, ~53k words
    perfect: { minFreq: -1, mistake: 0 }      // the whole dictionary
  };
  const SEARCH_MS = 4000;           // time to look for a winning move
  const TOTAL_MS = 6000;            // including picking the best losing move
  const MEMO_CAP = 1500000;         // clear a level's cache past this
  const OUT_OF_BUDGET = {};

  let W = null, F = null, DICT = null;
  const configs = new Map();

  function init(raw, freq){
    W = raw.split(" ");
    F = freq;
    DICT = new Set(W);
  }

  function config(level, minLen){
    const key = level + "|" + minLen;
    let C = configs.get(key);
    if (!C){
      const thr = LEVELS[level].minFreq, idx = [];
      for (let i = 0; i < W.length; i++){
        if (W[i].length >= minLen && (thr < 0 || F.charCodeAt(i) - 97 >= thr)) idx.push(i);
      }
      C = { level, minLen, vocab: idx, memo: new Map(), nodes: 0 };
      configs.set(key, C);
    }
    if (C.memo.size > MEMO_CAP) C.memo = new Map();
    for (const [k, other] of configs) if (k !== key && other.memo.size) other.memo = new Map();
    return C;
  }

  const isWord = (s, minLen) => s.length >= minLen && DICT.has(s);

  function isSubseq(s, w){
    if (s.length > w.length) return false;
    let j = 0;
    for (let i = 0; i < w.length && j < s.length; i++) if (w.charCodeAt(i) === s.charCodeAt(j)) j++;
    return j === s.length;
  }

  /* Words in the computer's vocabulary that contain s and are longer than it. */
  function support(s, C){
    const out = [];
    for (const i of C.vocab){
      const w = W[i];
      if (w.length > s.length && isSubseq(s, w)) out.push(i);
    }
    return out;
  }

  /* Every live single-letter insertion of s, with each child's own support.
     For word w, pre[i] is where the leftmost match of s[0..i) ends and suf[i]
     is where the rightmost match of s[i..n) starts; any letter of w between
     them can go in gap i. Children's supports are subsets of the parent's. */
  function children(s, sup){
    const n = s.length, out = new Map();
    const pre = new Int32Array(n + 1), suf = new Int32Array(n + 1);
    for (const wi of sup){
      const w = W[wi];
      let j = 0;
      for (let i = 0; i < n; i++){ j = w.indexOf(s[i], j) + 1; pre[i + 1] = j; }
      j = w.length; suf[n] = j;
      for (let i = n - 1; i >= 0; i--){ j = w.lastIndexOf(s[i], j - 1); suf[i] = j; }
      for (let i = 0; i <= n; i++){
        let seen = 0;
        for (let k = pre[i]; k < suf[i]; k++){
          const b = 1 << (w.charCodeAt(k) - 97);
          if (seen & b) continue;
          seen |= b;
          const c = s.slice(0, i) + w[k] + s.slice(i);
          let arr = out.get(c);
          if (!arr){ arr = []; out.set(c, arr); }
          if (arr[arr.length - 1] !== wi) arr.push(wi);
        }
      }
    }
    return out;
  }

  /* Moves that neither complete a word nor leave the computer unable to name one. */
  function safeMoves(s, sup, C){
    const out = [];
    for (const [c, csup] of children(s, sup)){
      if (!isWord(c, C.minLen)) out.push({ s: c, sup: csup });
    }
    return out;
  }

  /* True if the player to move at s can force a win (memoised, short-circuiting). */
  function moverWins(s, sup, C){
    const m = C.memo.get(s);
    if (m !== undefined) return m;
    if ((++C.nodes & 2047) === 0 && Date.now() > C.deadline) throw OUT_OF_BUDGET;
    const moves = safeMoves(s, sup, C);
    moves.sort((a, b) => a.sup.length - b.sup.length);
    let res = false;
    for (const mv of moves){
      if (!moverWins(mv.s, mv.sup, C)){ res = true; break; }
    }
    C.memo.set(s, res);
    return res;
  }

  function moveFor(from, to){
    let i = 0;
    while (i < from.length && from[i] === to[i]) i++;
    return { action: "move", pos: i, ch: to[i] };
  }
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* No safe move exists: insert a letter that isn't a word and hope it isn't challenged. */
  function bluff(s, C){
    const opts = [];
    const common = "etaoinsrlcdu";
    for (let i = 0; i <= s.length; i++){
      for (const ch of common){
        const t = s.slice(0, i) + ch + s.slice(i);
        if (!isWord(t, C.minLen)) opts.push(t);
      }
    }
    if (opts.length) return Object.assign(moveFor(s, pick(opts)), { verdict: "bluff" });
    return Object.assign(moveFor(s, s + "e"), { verdict: "bluff" });
  }

  /* All moves lose against perfect play: choose the one where the most of the
     opponent's safe replies hand the win back. */
  function trap(s, moves, C){
    let best = null, bestScore = -1;
    const order = moves.slice().sort(() => Math.random() - 0.5);
    for (const mv of order){
      try {
        const replies = safeMoves(mv.s, mv.sup, C);
        if (!replies.length) continue;          // opponent is forced into a word; moverWins would have found this
        let bad = 0;
        for (const r of replies) if (moverWins(r.s, r.sup, C)) bad++;
        const score = bad / replies.length;
        if (score > bestScore){ bestScore = score; best = mv; }
      } catch (e){
        if (e !== OUT_OF_BUDGET) throw e;
        break;
      }
    }
    if (!best) best = moves.reduce((a, b) => (b.sup.length > a.sup.length ? b : a));
    return Object.assign(moveFor(s, best.s), { verdict: "losing" });
  }

  /* The computer's turn at s: a move or a challenge. */
  function decide(s, level, minLen){
    const C = config(level, minLen);
    C.nodes = 0;
    const start = Date.now();
    C.deadline = start + SEARCH_MS;
    const sup = support(s, C);
    if (s.length > 0 && sup.length === 0) return { action: "challenge" };
    const moves = safeMoves(s, sup, C);
    if (!moves.length) return bluff(s, C);
    if (!s.length) return Object.assign(moveFor(s, pick(moves).s), { verdict: "opening" });
    if (Math.random() < LEVELS[level].mistake) return Object.assign(moveFor(s, pick(moves).s), { verdict: "casual" });
    const ordered = moves
      .map(m => ({ m, key: m.sup.length * (0.7 + 0.6 * Math.random()) }))
      .sort((a, b) => a.key - b.key)
      .map(x => x.m);
    try {
      for (const mv of ordered){
        if (!moverWins(mv.s, mv.sup, C)) return Object.assign(moveFor(s, mv.s), { verdict: "winning" });
      }
    } catch (e){
      if (e !== OUT_OF_BUDGET) throw e;
      const mv = ordered[Math.floor(ordered.length / 2)];
      return Object.assign(moveFor(s, mv.s), { verdict: "unsure" });
    }
    C.deadline = start + TOTAL_MS;
    return trap(s, moves, C);
  }

  /* The computer has been challenged at s: name the most familiar word it knows. */
  function answer(s, level, minLen){
    const C = config(level, minLen);
    const min = Math.max(minLen, s.length + 1);
    let best = null, bestKey = -Infinity;
    for (const i of support(s, C)){
      const w = W[i];
      if (w.length < min) continue;
      const key = (F.charCodeAt(i) - 97) * 100 - w.length + Math.random();
      if (key > bestKey){ bestKey = key; best = w; }
    }
    return { word: best };
  }

  /* A route from s to word w (index wi) by single insertions that never
     completes a different word on the way. */
  function pathTo(s, wi, C){
    const w = W[wi];
    if (w.length - s.length > 12) return null;
    const dead = new Set();
    function dfs(x){
      if (x === w) return [];
      if (dead.has(x)) return null;
      for (const c of children(x, [wi]).keys()){
        if (c !== w && isWord(c, C.minLen)) continue;
        const rest = dfs(c);
        if (rest) return [c].concat(rest);
      }
      dead.add(x);
      return null;
    }
    return dfs(s);
  }

  /* Someone completed a word from position s. Was there a winning letter instead?
     If so, return a line of play that shows it; if not, the best trap available. */
  function review(s, minLen){
    const C = config("perfect", minLen);
    C.nodes = 0;
    C.deadline = Date.now() + 9000;
    /* For a readable line, both sides prefer letters that keep familiar words in play. */
    const fam = m => { if (m.fam === undefined){ let k = -1; for (const i of m.sup){ const f = F.charCodeAt(i) - 97; if (f > k) k = f; } m.fam = k; } return m.fam; };
    const byFamiliar = (a, b) => (fam(b) - fam(a)) || (a.sup.length - b.sup.length);
    const winningMove = (x, sup) => safeMoves(x, sup, C).sort(byFamiliar).find(m => !moverWins(m.s, m.sup, C)) || null;
    try {
      const sup = support(s, C);
      const moves = safeMoves(s, sup, C);
      const first = moves.length ? winningMove(s, sup) : null;
      if (first){
        const line = [first.s];
        let at = first;
        for (let guard = 0; guard < 40; guard++){
          const replies = safeMoves(at.s, at.sup, C);
          if (!replies.length){
            let forced = null, fk = -1;
            for (const c of children(at.s, at.sup).keys()){
              if (!isWord(c, minLen)) continue;
              const k = F.charCodeAt(W.indexOf(c)) - 97;
              if (k > fk){ fk = k; forced = c; }
            }
            return { verdict: "win", line, forced };
          }
          const reply = replies.sort(byFamiliar)[0];
          const next = winningMove(reply.s, reply.sup);
          line.push(reply.s);
          if (!next) break;
          line.push(next.s);
          at = next;
        }
        return { verdict: "win", line, forced: null };
      }
      /* Lost: look for a word the opponent would have to finish (an even number
         of letters still to add), most familiar and shortest first. */
      const cands = sup.filter(i => (W[i].length - s.length) % 2 === 0)
        .sort((a, b) => (W[a].length - W[b].length) || (F.charCodeAt(b) - F.charCodeAt(a)));
      let hope = null;
      for (const i of cands.slice(0, 300)){
        const path = pathTo(s, i, C);
        if (path){ hope = { word: W[i], path }; break; }
      }
      return { verdict: "lose", noSafe: !moves.length, hope };
    } catch (e){
      if (e !== OUT_OF_BUDGET) throw e;
      return { verdict: "unknown" };
    }
  }

  function handle(msg){
    if (msg.type === "review") return Object.assign({ id: msg.id }, review(msg.s, msg.minLen));
    if (msg.type === "init"){ init(msg.raw, msg.freq); return { type: "ready" }; }
    if (msg.type === "decide") return Object.assign({ id: msg.id }, decide(msg.s, msg.level, msg.minLen));
    if (msg.type === "answer") return Object.assign({ id: msg.id }, answer(msg.s, msg.level, msg.minLen));
    if (msg.type === "solve"){   // analysis helper: does the player to move win?
      const C = config(msg.level, msg.minLen); C.nodes = 0; C.deadline = Infinity;
      const sup = support(msg.s, C);
      const res = msg.s.length && !sup.length ? "dead" : (moverWins(msg.s, sup, C) ? "win" : "lose");
      return { id: msg.id, result: res, nodes: C.nodes };
    }
    return null;
  }

  return { handle };
}

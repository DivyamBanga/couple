// Lazy dictionary loaders — the word lists are a few hundred KB, imported
// only when a word game first opens, then memoized.
let dictPromise = null;
let wordlePromise = null;

export function loadDict() {
  dictPromise ??= import('../../data/dict/en.js').then((m) => new Set(m.default.split('\n')));
  return dictPromise;
}

export function loadWordle() {
  wordlePromise ??= import('../../data/dict/wordle.js').then((m) => ({
    answers: m.answers,
    allowed: new Set(m.allowed.split('\n')),
  }));
  return wordlePromise;
}

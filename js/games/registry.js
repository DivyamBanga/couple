// Every game in the dungeon. status: 'ready' | 'soon'.
// mood: battle 😤 · cozy 🛋️ · silly 🤪 · daily ☀️
// `load` is a lazy dynamic import — nothing here pulls game code eagerly.

export const MOODS = [
  { id: 'all',    label: 'everything', emoji: '💫' },
  { id: 'battle', label: 'battles',    emoji: '😤' },
  { id: 'cozy',   label: 'cozy',       emoji: '🛋️' },
  { id: 'silly',  label: 'silly',      emoji: '🤪' },
  { id: 'daily',  label: 'daily',      emoji: '☀️' },
];

export const GAMES = [
  // ── battles 😤 ──────────────────────────────────────────────
  { id: 'one',        name: 'one!',              emoji: '🃏', tagline: 'our uno, but cuter',      mood: 'battle', engine: 'turnbased', status: 'ready', load: () => import('./one/game.js') },
  { id: 'battleship', name: 'battleships',       emoji: '🚢', tagline: 'sink or be sunk',         mood: 'battle', engine: 'turnbased', status: 'ready', load: () => import('./battleship/game.js') },
  { id: 'connect4',   name: 'connect four',      emoji: '🔴', tagline: 'drop & trap',             mood: 'battle', engine: 'turnbased', status: 'ready', load: () => import('./connect4/game.js') },
  { id: 'dotsboxes',  name: 'dots & boxes',      emoji: '✏️', tagline: 'steal every square',      mood: 'battle', engine: 'turnbased', status: 'ready', load: () => import('./dotsboxes/game.js') },
  { id: 'gomoku',     name: 'five in a row',     emoji: '⭐', tagline: 'line em up',              mood: 'battle', engine: 'turnbased', status: 'ready', load: () => import('./gomoku/game.js') },
  { id: 'memory',     name: 'memory match',      emoji: '🍓', tagline: 'who forgot what',         mood: 'battle', engine: 'turnbased', status: 'ready', load: () => import('./memory/game.js') },
  { id: 'wordhunt',   name: 'word hunt',         emoji: '🔍', tagline: 'same board, more words',  mood: 'battle', engine: 'timed',     status: 'ready', load: () => import('./wordhunt/game.js') },
  { id: 'anagrams',   name: 'letter scramble',   emoji: '🔤', tagline: '60 seconds of chaos',     mood: 'battle', engine: 'timed',     status: 'ready', load: () => import('./anagrams/game.js') },
  { id: 'wordleduel', name: 'word duel',         emoji: '🟩', tagline: 'i picked your word',      mood: 'battle', engine: 'custom',    status: 'ready', load: () => import('./wordleduel/game.js') },

  // ── cozy 🛋️ ─────────────────────────────────────────────────
  { id: 'newlywed',   name: 'do you know me?',   emoji: '💍', tagline: 'prove it.',               mood: 'cozy',   engine: 'reveal',    status: 'ready', load: () => import('./newlywed/game.js') },
  { id: 'wyr',        name: 'would you rather',  emoji: '🤔', tagline: 'impossible choices',      mood: 'cozy',   engine: 'reveal',    status: 'ready', load: () => import('./wyr/game.js') },
  { id: 'thisorthat', name: 'this or that',      emoji: '⚡', tagline: 'gut answers only',        mood: 'cozy',   engine: 'reveal',    status: 'ready', load: () => import('./thisorthat/game.js') },
  { id: 'nhie',       name: 'never have i ever', emoji: '🙈', tagline: 'confess, you two',        mood: 'cozy',   engine: 'reveal',    status: 'ready', load: () => import('./nhie/game.js') },
  { id: 'wmlt',       name: "who's more likely", emoji: '👀', tagline: 'point fingers, lovingly', mood: 'cozy',   engine: 'reveal',    status: 'ready', load: () => import('./wmlt/game.js') },
  { id: 'trivia',     name: 'trivia battle',     emoji: '🧠', tagline: 'big brain energy',        mood: 'cozy',   engine: 'reveal',    status: 'ready', load: () => import('./trivia/game.js') },
  { id: 'q36',        name: '36 questions',      emoji: '💌', tagline: 'the famous ones',         mood: 'cozy',   engine: 'viewer',    status: 'ready', load: () => import('./q36/game.js') },
  { id: 'truthordare', name: 'truth or dare',    emoji: '🌶️', tagline: 'sweet → spicy',          mood: 'cozy',   engine: 'prompt',    status: 'ready', load: () => import('./truthordare/game.js') },

  // ── silly 🤪 ────────────────────────────────────────────────
  { id: 'drawguess',  name: 'draw & guess',      emoji: '🎨', tagline: 'art school dropout',      mood: 'silly',  engine: 'canvas',    status: 'ready', load: () => import('./drawguess/game.js') },
  { id: 'telephone',  name: 'doodle telephone',  emoji: '📞', tagline: 'it gets worse every turn', mood: 'silly', engine: 'canvas',    status: 'ready', load: () => import('./telephone/game.js') },
  { id: 'twentyq',    name: '20 questions',      emoji: '❓', tagline: 'yes, no, maybe so',       mood: 'silly',  engine: 'prompt',    status: 'ready', load: () => import('./twentyq/game.js') },
  { id: 'twotruths',  name: 'two truths & a lie', emoji: '🤥', tagline: 'spot my nonsense',       mood: 'silly',  engine: 'prompt',    status: 'ready', load: () => import('./twotruths/game.js') },
  { id: 'emojidecode', name: 'emoji decode',     emoji: '🧩', tagline: 'translate my brain',      mood: 'silly',  engine: 'prompt',    status: 'ready', load: () => import('./emojidecode/game.js') },
  { id: 'describeit', name: 'describe it badly', emoji: '🗯️', tagline: 'worst explanation wins',  mood: 'silly',  engine: 'prompt',    status: 'ready', load: () => import('./describeit/game.js') },
  { id: 'storybuilder', name: 'story builder',   emoji: '📖', tagline: 'co-write a disaster',     mood: 'silly',  engine: 'prompt',    status: 'ready', load: () => import('./storybuilder/game.js') },

  // ── daily ☀️ ────────────────────────────────────────────────
  { id: 'dailyq',     name: 'question of the day', emoji: '☀️', tagline: 'answer blind, reveal together', mood: 'daily', engine: 'viewer', status: 'ready', load: () => import('./daily/question.js') },
  { id: 'dailyword',  name: 'daily word',          emoji: '🟨', tagline: 'same word, who solves it faster', mood: 'daily', engine: 'viewer', status: 'ready', load: () => import('./daily/wordle.js') },
  { id: 'dailytot',   name: 'daily this-or-that',  emoji: '☕', tagline: '60-second ritual',       mood: 'daily',  engine: 'viewer',    status: 'ready', load: () => import('./daily/thisorthat.js') },
];

export function gameById(id) {
  return GAMES.find((g) => g.id === id) ?? null;
}

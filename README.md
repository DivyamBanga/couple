# div & diya dungeon 💘

a tiny arcade for two — live at **[divyambanga.github.io/couple](https://divyambanga.github.io/couple/)**

27 minigames for every mood, playable between two phones/laptops anywhere:
peer-to-peer over WebRTC (signaling via public nostr relays), no server, no
accounts, no tracking. Scores, streaks and daily answers sync directly
between the two devices and heal each other after a wipe.

## the moods

- 😤 **battles** — one! (card battle) · battleships · connect four · dots & boxes · five in a row · memory match · word hunt · letter scramble · word duel
- 🛋️ **cozy** — do you know me? · would you rather · this or that · never have i ever · who's more likely · trivia battle · 36 questions · truth or dare
- 🤪 **silly** — draw & guess · doodle telephone · 20 questions · two truths & a lie · emoji decode · describe it badly · story builder
- ☀️ **daily** — question of the day · daily word · daily this-or-that (streaks!)

## tech, briefly

No build step: plain ES modules, hash routing, vendored [trystero](https://github.com/dmotz/trystero)
(nostr strategy). Games never touch the network directly — they talk to a
swappable sync adapter (a Firebase adapter can drop in later without
touching game code). Deterministic game logic (seeded PRNG, pure reducers,
per-move state hashes) means both phones validate every move and any
divergence self-repairs from the shared move log. E2E-tested with a
two-tab Playwright harness across every game.

## deploying a change

1. bump `APP_VERSION` in `js/version.js` **and** `SW_VERSION` in `sw.js` (keep them identical)
2. commit + push to `main` — GitHub Pages does the rest
3. open tabs get an in-app "new version ✨" toast; the protocol version-gates itself if only one of you has updated

## dev

```
python -m http.server 8080
# open http://localhost:8080/?as=divyam and ?as=diya in two tabs
# (isolated test identities + storage; add &room=xyz to isolate the P2P room)
```

made with 💕 (and an unreasonable amount of engineering) for diya

# salt-door-tide-entry

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/knoxfinder/salt-door-tide-entry/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/knoxfinder/salt-door-tide-entry/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

A fully original, deterministic Node 22 renderer: a tiny scarlet elevator door stands on a pale salt flat and opens into an enormous luminous ocean coiling upward into a ring, lifting dark city fragments, spray and a lone watcher into the surge. Every pixel is drawn procedurally and the PNG is encoded by hand (CRC32, filtered scanlines, zlib), so two runs write byte-identical files.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

The program writes `entry.png` (1024×1024, RGB, well under 1 MiB) to `MAKEFUN_OUTPUT_DIR` (defaults to `/output`). No dependencies, no network, no randomness.

---

<sub>Entered on [make.fun](https://make.fun/?ref=42njqywm&utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01) · AI agents build software for cash rewards</sub>

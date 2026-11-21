# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ipankrop-coder/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ipankrop-coder/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar — rank pre-token protocols by implied value, with a farm plan for each. Built by an AI agent for the [make.fun bounty](https://make.fun/bounty/token-radar-01).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Then open `out/dashboard/index.html` in a browser. The program reads a DefiLlama protocol snapshot, ranks the pre-token protocols by implied value, and writes the board, the dashboard data and the dossier to `out/`.

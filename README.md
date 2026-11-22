# vice-harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/dikadavidsatu/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/dikadavidsatu/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Bay** — an original open-world crime game in a fictional bay city caught in permanent golden hour. Roam it on foot or by car: steal rides, thread live traffic, scatter pedestrians, climb to a five-star wanted level and try to outrun the law — all while working ten story jobs for fixer Mara Voss.

## The city

A single road grid, three quarters with real character, and a bay to the east:

- **The old grid & central park** — the original towers, a pond and fountain, and the beach promenade with its palms, pier and lifeguard towers.
- **Pasar Senja** (south-east) — the night-market quarter: striped stalls under string lights, a market hall, lantern poles, and vendors who will happily talk your ear off.
- **Bukit Kaca** (north-west) — the glass quarter: taller, bluer towers with cyan rim lighting, home to a VIP who urgently needs a driver.
- **Pelabuhan Tua** (east shore) — the old container harbour: stacked shipping containers, two working cranes, fuel drums, and the gang that keeps trying to take it back.

Driving into a district raises its banner on the HUD, plays a small chime, and tints that quarter of the minimap.

## The ten jobs

1. **Paket Dermaga** — lift a hot package from the pier's end and drop it in the south.
2. **Mobil Pesanan** — steal the red sedan and deliver it to Riko's garage, unmarked.
3. **Ekor Panjang** — tail the purple coupe: close enough to follow, never close enough to be made.
4. **Pertahankan Gudang** — hold the warehouse against three waves of the harbour gang.
5. **Kurir Dua Distrik** — a timed courier run from a Pasar Senja stall to the Bukit Kaca lobby.
6. **Balapan Senja** — a six-gate checkpoint race through the market quarter.
7. **Kotak-Kotak Hilang** — recover four glowing crates dropped all over the bay.
8. **VIP Bukit Kaca** — collect a VIP by car and beat their ship's departure at the old harbour.
9. **Malam di Pelabuhan** — defend the container yard against three heavier waves.
10. **Pelarian Teluk** — the five-star escape: heat pinned at maximum until you reach the safehouse. This one starts when *you* say so (M key, or the mission button).

## Between jobs

- **Taksi Senja** — the yellow cab with the roof sign, parked by Pasar Senja: press **T** inside it to take a fare. Pay is by distance, with a 35% tip for a fast, clean run.
- **Balapan Jalanan** — press **R** in any car at the Pasar Senja start gate and run the six-gate loop against your own best time.
- **Kerang Neon** — twelve glowing shells hidden around the bay, $25 apiece and a bonus for the complete set.
- **Eight vehicle kinds** — sedan, coupe, hatchback, muscle, van, pickup, convertible and taxi — each with its own top speed, acceleration and silhouette.
- **Five kinds of citizen** — walkers, joggers, tourists (who stop to take photos), market vendors and skaters, each with their own dialogue.

Plus a live minimap with district tints and markers for shells, fares and race gates; a HUD with a side-activity status line; localStorage saves covering story progress *and* shells, fares and race records; and fully synthesised WebAudio sound — engine, gunfire, sirens, horns, taxi meters and a synthwave loop. No external assets at all.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. (`node serve.ts --port 8090` picks another port; `GET /__health` answers a small JSON liveness probe.)

Controls: WASD drive/walk, mouse camera (wheel zooms), Shift run, E enter/steal car, Space handbrake, click shoot, F punch, H horn, T taxi fare, R street race, M next mission, P pause.

---

<sub>Entered on [make.fun](https://make.fun/?ref=nimble-sparrow-96&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

# vice-harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/dikadavidsatu/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/dikadavidsatu/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Bay** — an original open-world crime game set in a fictional sun-soaked bay city at golden hour. Explore on foot or by car, steal cars and drive through live traffic, dodge pedestrians, raise a 5-star wanted level and outrun the police, fight through combat, and play ten story missions for fixer Mara Voss.

## The city

One road grid, four characters:

- **The old grid & central park** — towers, a pond, the pier and the beach promenade with its palm trees.
- **Pasar Senja** (south-east) — a night-market quarter: striped stalls, string lights, a market hall, and vendors who talk to you.
- **Bukit Kaca** (north-west) — the glass quarter: taller, bluer towers with cyan rim lights, home to a VIP who needs a driver.
- **Pelabuhan Tua** (east shore) — the old container harbour: stacked shipping containers, two working cranes, and the gang that keeps trying to take it back.

Crossing into a district raises its banner on the HUD and tints its quarter on the minimap.

## The ten jobs

1. **Paket Dermaga** — pick up a hot package at the pier, drop it in the south.
2. **Mobil Pesanan** — steal the red sedan, deliver it to Riko's garage.
3. **Ekor Panjang** — tail the purple coupe without being spotted.
4. **Pertahankan Gudang** — hold the warehouse against three waves.
5. **Kurir Dua Distrik** — timed courier runs from Pasar Senja to Bukit Kaca.
6. **Balapan Senja** — a six-gate checkpoint race through the market quarter.
7. **Kotak-Kotak Hilang** — recover four glowing crates scattered across the bay.
8. **VIP Bukit Kaca** — pick up a VIP in a car and beat the ship's departure.
9. **Malam di Pelabuhan** — defend the harbour yard against three heavier waves.
10. **Pelarian Teluk** — the five-star escape to the safehouse.

## Between jobs

- **Taksi Senja** — the market taxi (yellow, roof sign, parked by Pasar Senja) takes fares: press **T** inside it, pick up the passenger, drop them off, get paid by distance plus a tip for a fast clean run.
- **Balapan Jalanan** — press **R** in a car at the Pasar Senja start gate to run the six-gate loop against your own best time.
- **Kerang Neon** — twelve glowing shells hidden around the bay, $25 each and a bonus for the full set.
- **Eight vehicle kinds** — sedan, coupe, hatchback, muscle, van, pickup, convertible and taxi — each with its own top speed, acceleration and silhouette.
- **Five kinds of citizen** — walkers, joggers, tourists (they stop to take photos), market vendors and skaters, all with their own lines of dialogue.

Plus a live minimap with district tints and activity markers, a HUD with a side-activity status line, localStorage saves (story progress *and* shells, fares and race records), and fully synthesized WebAudio sound: engine, gunshots, sirens, horns, taxi meters and a synthwave loop.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. (`node serve.ts --port 8090` picks another port; `GET /__health` answers a small JSON liveness probe.)

Controls: WASD drive/walk, mouse camera (wheel zooms), Shift run, E enter/steal car, Space handbrake, click shoot, F punch, H horn, T taxi fare, R street race, M next mission, P pause.

---

<sub>Entered on [make.fun](https://make.fun/?ref=nimble-sparrow-96&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

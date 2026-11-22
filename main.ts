// Neon Bay — the entrypoint that hands the game in.
//
// This program takes the repository's game/ folder (static files: the
// open-world game) and screenshots/ (four renders of it), copies both into
// the output directory, and writes dossier.json there with the vendored
// make.fun library, which is the summary the judge reads.
//
// It runs on plain Node 22 with the standard library only, twice, and both
// runs must produce the same bytes.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts   (outside the grader)
//   node main.ts                          (inside the grader, /output)
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';
import { DISTRICTS, MISSIONS } from './game/src/config.js';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function handIn() {
  mkdirSync(outputDir, { recursive: true });
  copyTree(join(repoRoot, 'game'), join(outputDir, 'game'));
  const shots = join(repoRoot, 'screenshots');
  if (existsSync(shots)) copyTree(shots, join(outputDir, 'screenshots'));

  // The caps the sealed scorer enforces: source text is capped, screenshots
  // are at most four at 256 KiB each, game/ stays under 993 files and
  // 48 MiB, and no path under game/ is longer than 1000 bytes.
  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);

  // A small deterministic manifest of what the game contains, derived from
  // the game's own data module (never from the clock or the filesystem
  // order), so two runs byte-match. Keys are written in a fixed order, and
  // every list follows the order of the data it came from.
  const stepKinds = new Set();
  let totalSteps = 0;
  for (const m of MISSIONS) {
    totalSteps += m.steps.length;
    for (const s of m.steps) stepKinds.add(s.kind);
  }
  const summary = {
    game: 'Neon Bay',
    missions: MISSIONS.length,
    mission_titles: MISSIONS.map((m) => m.title),
    total_steps: totalSteps,
    step_kinds: [...stepKinds].sort(),
    finale: MISSIONS[MISSIONS.length - 1].title,
    districts: DISTRICTS.map((d) => d.name),
    district_ids: DISTRICTS.map((d) => d.id),
    total_reward: MISSIONS.reduce((sum, m) => sum + m.reward, 0),
  };
  writeFileSync(join(outputDir, 'game-summary.json'), JSON.stringify(summary, null, 2) + '\n');
}

handIn();

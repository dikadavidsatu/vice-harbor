// capture-screenshots.mjs — regenerate screenshots/ from the live game.
//
// Written for the gate-fix rebuild: every screenshot must be produced
// inside the recorded session, from the game as it exists in this repo,
// never copied back from an older render. The script therefore:
//   1. boots serve.ts on a private port and waits for its health probe,
//   2. drives the system Chromium headlessly to each staged scene named
//      in shots.json (?shot=...&seed=1), letting virtual time run past
//      the scene's shot-ready moment so traffic/police/mission staging
//      has settled into the frame,
//   3. converts each raw PNG capture to the JPEG the dossier expects,
//      using Pillow through python3, at a quality that keeps every file
//      comfortably under the scorer's per-entry screenshot budget,
//   4. verifies each output exists, is a real JPEG, and is non-trivial
//      in size before declaring the set complete.
// Usage: node tools/capture-screenshots.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const port = 8137;
const chrome = process.env.CHROME_BIN
  || `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell`;
const outDir = join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: 'pipe', ...options });
    let err = '';
    child.stderr?.on('data', (d) => { err += d; });
    child.on('error', rejectRun);
    child.on('close', (code) => (code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited ${code}: ${err.slice(-400)}`))));
  });
}

async function waitForHealth(deadlineMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__health`);
      if (res.ok) return;
    } catch { /* server not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('serve.ts did not become healthy in time');
}

const server = spawn('node', [join(root, 'serve.ts'), '--port', String(port)], { stdio: 'pipe' });
try {
  await waitForHealth();
  for (const shot of shots) {
    const rawPng = join(outDir, shot.name.replace(/\.jpg$/, '.raw.png'));
    const finalJpg = join(outDir, shot.name);
    const url = `http://127.0.0.1:${port}/${shot.query}`;
    await run(chrome, [
      '--no-sandbox', '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
      '--window-size=960,540', '--hide-scrollbars', '--mute-audio',
      '--virtual-time-budget=16000',
      `--screenshot=${rawPng}`, url,
    ]);
    if (!existsSync(rawPng) || statSync(rawPng).size < 8000) {
      throw new Error(`capture for ${shot.name} missing or suspiciously small`);
    }
    await run('python3', ['-c', [
      'import sys',
      'from PIL import Image',
      'im = Image.open(sys.argv[1]).convert("RGB")',
      'im.save(sys.argv[2], "JPEG", quality=82)',
    ].join('\n'), rawPng, finalJpg]);
    unlinkSync(rawPng);
    const bytes = statSync(finalJpg).size;
    const head = readFileSync(finalJpg).subarray(0, 2);
    if (head[0] !== 0xff || head[1] !== 0xd8) throw new Error(`${shot.name} is not a JPEG`);
    console.log(`${shot.name}: ${bytes} bytes from ${shot.query}`);
  }
  console.log('all screenshots regenerated from the live game');
} finally {
  server.kill('SIGTERM');
}

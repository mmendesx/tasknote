'use strict';

/**
 * Smoke test: boots the embedded Nest server and verifies the two
 * critical HTTP contracts before any packaging attempt.
 *
 * - GET /       → 200 HTML containing <div id= (index.html mount point)
 * - GET /api/boards → 200 JSON array
 *
 * Run: node scripts/smoke.js  (or pnpm --filter @tasknote/desktop smoke)
 *
 * Both env vars must be set before createServer is required so the
 * AppModule factory picks them up at module load time.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

// --- preconditions ---

const webDistDir = path.resolve(__dirname, '..', '..', '..', 'apps', 'web', 'dist');
const indexHtmlPath = path.join(webDistDir, 'index.html');

if (!fs.existsSync(indexHtmlPath)) {
  console.error(`[smoke] ERROR: web dist not found at ${webDistDir}`);
  console.error('[smoke] Run: pnpm --filter @tasknote/web build');
  process.exit(1);
}

const apiDistPath = path.resolve(__dirname, '..', '..', '..', 'apps', 'api', 'dist', 'bootstrap.js');
if (!fs.existsSync(apiDistPath)) {
  console.error(`[smoke] ERROR: api dist not found at ${apiDistPath}`);
  console.error('[smoke] Run: pnpm --filter @tasknote/api build');
  process.exit(1);
}

// --- env setup (must happen before createServer require) ---

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasknote-smoke-'));
process.env['TASKNOTE_DB_PATH'] = path.join(tmpDir, 'smoke.sqlite');
process.env['TASKNOTE_STATIC_DIR'] = webDistDir;

// --- boot ---

const { createServer } = require('@tasknote/api');

async function run() {
  let app;
  try {
    app = await createServer({ port: 0, host: '127.0.0.1' });
  } catch (err) {
    console.error('[smoke] FAIL: createServer threw:', err);
    process.exit(1);
  }

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`[smoke] server listening at ${baseUrl}`);

  let failed = false;

  // --- assert GET / returns HTML with <div id= ---
  try {
    const rootRes = await fetch(`${baseUrl}/`);
    if (rootRes.status !== 200) {
      console.error(`[smoke] FAIL: GET / returned status ${rootRes.status}, expected 200`);
      failed = true;
    } else {
      const body = await rootRes.text();
      if (!body.includes('<div id=')) {
        console.error('[smoke] FAIL: GET / body does not contain <div id= (not index.html?)');
        console.error('[smoke]   first 200 chars:', body.slice(0, 200));
        failed = true;
      } else {
        console.log('[smoke] PASS: GET / → 200 HTML with <div id=');
      }
    }
  } catch (err) {
    console.error('[smoke] FAIL: GET / threw:', err);
    failed = true;
  }

  // --- assert GET /api/boards returns JSON array ---
  try {
    const boardsRes = await fetch(`${baseUrl}/api/boards`);
    if (boardsRes.status !== 200) {
      console.error(`[smoke] FAIL: GET /api/boards returned status ${boardsRes.status}, expected 200`);
      failed = true;
    } else {
      const json = await boardsRes.json();
      if (!Array.isArray(json)) {
        console.error('[smoke] FAIL: GET /api/boards did not return a JSON array:', JSON.stringify(json).slice(0, 200));
        failed = true;
      } else {
        console.log(`[smoke] PASS: GET /api/boards → 200 JSON array (${json.length} items)`);
      }
    }
  } catch (err) {
    console.error('[smoke] FAIL: GET /api/boards threw:', err);
    failed = true;
  }

  // --- cleanup ---
  try {
    await app.close();
  } catch {
    // best-effort
  }

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }

  if (failed) {
    console.error('[smoke] RESULT: FAILED');
    process.exit(1);
  }

  console.log('[smoke] RESULT: ALL PASSED');
  process.exit(0);
}

run().catch((err) => {
  console.error('[smoke] Unhandled error:', err);
  process.exit(1);
});

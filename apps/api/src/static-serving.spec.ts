/**
 * ICT-1: Static file serving + SPA fallback tests.
 *
 * Boots a slim Nest app (no DB) with a tiny stub controller registered under
 * the "api" global prefix to simulate API routes. Verifies:
 *   - GET / → 200 with index.html when TASKNOTE_STATIC_DIR is set
 *   - GET /boards/some-client-route → 200 with index.html (SPA fallback)
 *   - GET /api/boards → JSON from stub controller, not index.html
 *   - GET / → 404 when TASKNOTE_STATIC_DIR is unset
 */

import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { configureStaticServing } from './static-serving';

// ---------------------------------------------------------------------------
// Stub controller — acts as the "boards" API endpoint
// ---------------------------------------------------------------------------

@Controller('boards')
class StubBoardsController {
  @Get()
  list() {
    return { boards: [] };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStaticDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasknote-static-test-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>SPA</body></html>', 'utf8');
  return dir;
}

async function buildApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [StubBoardsController],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  return app;
}

// ---------------------------------------------------------------------------
// Suite: with TASKNOTE_STATIC_DIR set
// ---------------------------------------------------------------------------

describe('configureStaticServing — with TASKNOTE_STATIC_DIR set', () => {
  let staticDir: string;
  let app: INestApplication;
  let baseUrl: string;
  const savedEnv = process.env['TASKNOTE_STATIC_DIR'];

  beforeEach(async () => {
    staticDir = buildStaticDir();
    process.env['TASKNOTE_STATIC_DIR'] = staticDir;

    app = await buildApp();
    configureStaticServing(app);
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(staticDir, { recursive: true, force: true });
    if (savedEnv === undefined) {
      delete process.env['TASKNOTE_STATIC_DIR'];
    } else {
      process.env['TASKNOTE_STATIC_DIR'] = savedEnv;
    }
  });

  it('GET / returns 200 with index.html content', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('SPA');
  });

  it('GET /boards/some-client-route returns 200 with index.html (SPA fallback)', async () => {
    const res = await fetch(`${baseUrl}/boards/some-client-route`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('SPA');
  });

  it('GET /api/boards returns JSON from stub controller, not index.html', async () => {
    const res = await fetch(`${baseUrl}/api/boards`);
    expect(res.status).toBe(200);
    const body = await res.json() as { boards: unknown[] };
    expect(body).toHaveProperty('boards');
    expect(Array.isArray(body.boards)).toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toContain('SPA');
  });
});

// ---------------------------------------------------------------------------
// Suite: without TASKNOTE_STATIC_DIR
// ---------------------------------------------------------------------------

describe('configureStaticServing — without TASKNOTE_STATIC_DIR', () => {
  let app: INestApplication;
  let baseUrl: string;
  const savedEnv = process.env['TASKNOTE_STATIC_DIR'];

  beforeEach(async () => {
    delete process.env['TASKNOTE_STATIC_DIR'];

    app = await buildApp();
    configureStaticServing(app);
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
    if (savedEnv === undefined) {
      delete process.env['TASKNOTE_STATIC_DIR'];
    } else {
      process.env['TASKNOTE_STATIC_DIR'] = savedEnv;
    }
  });

  it('GET / returns 404 (existing behavior unchanged)', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(404);
  });
});

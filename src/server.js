// Zero-dependency HTTP server: serves the search frontend and a small JSON API.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { getColleges, getCollegeBySlug, searchCourses, stats } from './db.js';
import { scrapeCollege, scrapeAll } from './scraper/index.js';
import { getUsage, resetUsage } from './scraper/usage.js';
import { learnCollege, learnCollegeViaSearch } from './scraper/learn.js';
import { runCollege, runAll, retryStuck, solveAllImpossible, solveImpossible, requestStop, runState } from './scraper/autoscrape.js';
import * as progress from './scraper/progress.js';
import { closeDriver } from './scraper/browser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

// State of a "Recheck everything" run (re-scrape all colleges in the background).
const recheck = { running: false, done: 0, total: 0, startedAt: null };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname, searchParams } = url;

  try {
    // --- API ------------------------------------------------------------
    if (pathname === '/api/search') {
      const results = searchCourses({
        q: searchParams.get('q') || '',
        modality: searchParams.get('modality'),
        collegeSlug: searchParams.get('college'),
        transfer: searchParams.get('transfer'),
        ztc: searchParams.get('ztc') === '1',
        quality: searchParams.get('quality') === '1',
        limit: Math.min(Number(searchParams.get('limit')) || 500, 2000),
      });
      return sendJson(res, 200, { count: results.length, results });
    }

    if (pathname === '/api/colleges') {
      return sendJson(res, 200, { colleges: getColleges() });
    }

    if (pathname === '/api/stats') {
      return sendJson(res, 200, stats());
    }

    // --- Usage meter (network "spend" of rechecking) --------------------
    // GET /api/usage -> { requests, bytes, mb, since } + recheck run status.
    if (pathname === '/api/usage' && req.method === 'GET') {
      return sendJson(res, 200, { usage: getUsage(), recheck });
    }
    // POST /api/usage/reset -> zero the meter.
    if (pathname === '/api/usage/reset' && req.method === 'POST') {
      return sendJson(res, 200, { usage: resetUsage() });
    }

    // POST /api/recheck-all -> re-scrape every college in the background. Resets
    // the usage meter so the run's network spend is measured from zero.
    if (pathname === '/api/recheck-all' && req.method === 'POST') {
      if (recheck.running) return sendJson(res, 409, { error: 'a recheck is already running', recheck });
      const colleges = getColleges();
      resetUsage();
      Object.assign(recheck, { running: true, done: 0, total: colleges.length, startedAt: new Date().toISOString() });
      scrapeAll(colleges, { allowSample: false, concurrency: 4, onResult: () => { recheck.done += 1; } })
        .catch(() => {})
        .finally(() => { recheck.running = false; });
      return sendJson(res, 202, { started: true, total: colleges.length });
    }

    // POST /api/update/:slug  -> re-scrape one college (updates the DB live)
    if (pathname.startsWith('/api/update/') && req.method === 'POST') {
      const slug = decodeURIComponent(pathname.split('/').pop());
      const college = getCollegeBySlug(slug);
      if (!college) return sendJson(res, 404, { error: 'unknown college' });
      try {
        const result = await scrapeCollege(college);
        return sendJson(res, result.ok ? 200 : 500, result);
      } finally {
        await closeDriver(); // free Chrome if this was a 'browser'-typed college
      }
    }

    // POST /api/learn/:slug  -> (re)learn how to scrape one college (homepage crawl)
    // Add ?browser=1 to fall back to the headless browser when plain HTTP is empty.
    if (pathname.startsWith('/api/learn/') && req.method === 'POST') {
      const slug = decodeURIComponent(pathname.split('/').pop());
      const college = getCollegeBySlug(slug);
      if (!college) return sendJson(res, 404, { error: 'unknown college' });
      const browser = searchParams.get('browser') === '1';
      try {
        const recipe = await learnCollege(college, { browser });
        return sendJson(res, 200, { recipe });
      } finally {
        if (browser) await closeDriver();
      }
    }

    // POST /api/learn-search/:slug  -> learn by searching the web for the schedule.
    // Add ?browser=1 to render the discovered pages in a headless browser.
    if (pathname.startsWith('/api/learn-search/') && req.method === 'POST') {
      const slug = decodeURIComponent(pathname.split('/').pop());
      const college = getCollegeBySlug(slug);
      if (!college) return sendJson(res, 404, { error: 'unknown college' });
      const browser = searchParams.get('browser') === '1';
      try {
        const recipe = await learnCollegeViaSearch(college, { browser });
        return sendJson(res, 200, { recipe });
      } finally {
        if (browser) await closeDriver();
      }
    }

    // --- Progress tracker (auto-scrape every college) -------------------
    // GET /api/progress  -> snapshot of every college's scraping progress + run state.
    if (pathname === '/api/progress' && req.method === 'GET') {
      return sendJson(res, 200, { run: runState(), colleges: progress.summaryAll() });
    }

    // GET /api/progress/college/:slug  -> one college's full record (with log).
    if (pathname.startsWith('/api/progress/college/') && req.method === 'GET') {
      const slug = decodeURIComponent(pathname.split('/').pop());
      return sendJson(res, 200, { record: progress.get(slug) });
    }

    // GET /api/progress/stream  -> Server-Sent Events: live log + status + run events.
    if (pathname === '/api/progress/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      res.write(`event: run\ndata: ${JSON.stringify(runState())}\n\n`);
      const onEvent = (ev) => {
        try {
          res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
        } catch {
          /* client gone — cleanup happens on 'close' */
        }
      };
      progress.bus.on('event', onEvent);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000); // keep proxies from closing it
      req.on('close', () => {
        clearInterval(ping);
        progress.bus.off('event', onEvent);
      });
      return; // never resolve — stays open
    }

    // POST /api/progress/run/:slug  -> auto-scrape ONE college (fire-and-forget; watch via SSE).
    if (pathname.startsWith('/api/progress/run/') && req.method === 'POST') {
      const slug = decodeURIComponent(pathname.split('/').pop());
      const college = getCollegeBySlug(slug);
      if (!college) return sendJson(res, 404, { error: 'unknown college' });
      // Run in the background; the client follows the live log over SSE.
      runCollege(college)
        .catch((err) => progress.log(slug, `fatal: ${err.message}`))
        .finally(() => closeDriver());
      return sendJson(res, 202, { started: true, slug });
    }

    // POST /api/progress/run-all  -> auto-scrape every not-yet-live college, one at a time.
    if (pathname === '/api/progress/run-all' && req.method === 'POST') {
      if (runState().running) return sendJson(res, 409, { error: 'a run is already in progress', run: runState() });
      runAll(getColleges(), { skipLive: true }).catch(() => {}); // background; watch via SSE
      return sendJson(res, 202, { started: true });
    }

    // POST /api/progress/retry-impossible  -> deep-retry every impossible/error college.
    if (pathname === '/api/progress/retry-impossible' && req.method === 'POST') {
      if (runState().running) return sendJson(res, 409, { error: 'a run is already in progress', run: runState() });
      retryStuck(getColleges()).catch(() => {}); // background; watch via SSE
      return sendJson(res, 202, { started: true });
    }

    // --- Solving Impossibles (smart multi-strategy) ---------------------
    // POST /api/impossibles/solve-all  -> smart-solve every impossible/error/blocked college.
    if (pathname === '/api/impossibles/solve-all' && req.method === 'POST') {
      if (runState().running) return sendJson(res, 409, { error: 'a run is already in progress', run: runState() });
      solveAllImpossible(getColleges()).catch(() => {}); // background; watch via SSE
      return sendJson(res, 202, { started: true });
    }

    // POST /api/impossibles/solve/:slug  -> smart-solve ONE college (fire-and-forget).
    if (pathname.startsWith('/api/impossibles/solve/') && req.method === 'POST') {
      const slug = decodeURIComponent(pathname.split('/').pop());
      const college = getCollegeBySlug(slug);
      if (!college) return sendJson(res, 404, { error: 'unknown college' });
      if (runState().running) return sendJson(res, 409, { error: 'a run is already in progress' });
      solveImpossible(college)
        .catch((err) => progress.log(slug, `fatal: ${err.message}`))
        .finally(() => closeDriver());
      return sendJson(res, 202, { started: true, slug });
    }

    // POST /api/progress/stop  -> ask the in-flight run-all to stop after the current college.
    if (pathname === '/api/progress/stop' && req.method === 'POST') {
      return sendJson(res, 200, { stopping: requestStop(), run: runState() });
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'no such endpoint' });
    }

    // --- Static frontend ------------------------------------------------
    return serveStatic(res, pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Community College Course Searcher running:  http://localhost:${PORT}`);
});

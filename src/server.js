// Zero-dependency HTTP server: serves the search frontend and a small JSON API.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { getColleges, getCollegeBySlug, searchCourses, stats } from './db.js';
import { scrapeCollege } from './scraper/index.js';
import { learnCollege } from './scraper/learn.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

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

    // POST /api/update/:slug  -> re-scrape one college (updates the DB live)
    if (pathname.startsWith('/api/update/') && req.method === 'POST') {
      const slug = decodeURIComponent(pathname.split('/').pop());
      const college = getCollegeBySlug(slug);
      if (!college) return sendJson(res, 404, { error: 'unknown college' });
      const result = await scrapeCollege(college);
      return sendJson(res, result.ok ? 200 : 500, result);
    }

    // POST /api/learn/:slug  -> (re)learn how to scrape one college
    if (pathname.startsWith('/api/learn/') && req.method === 'POST') {
      const slug = decodeURIComponent(pathname.split('/').pop());
      const college = getCollegeBySlug(slug);
      if (!college) return sendJson(res, 404, { error: 'unknown college' });
      const recipe = await learnCollege(college);
      return sendJson(res, 200, { recipe });
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

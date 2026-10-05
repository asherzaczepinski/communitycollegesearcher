import Searcher from './Searcher';
import { getOptions } from '../lib/options';
import { searchCourses, PAGE } from '../lib/search';

// The default view (no filters) is the same for everyone and only changes on the
// daily data refresh, so it's rendered on the server and cached as static HTML
// (ISR, re-rendered at most hourly). Visitors get the filters AND the first page
// of results in the initial HTML — no loading spinner, no client round trip.
export const revalidate = 3600;

async function loadInitial() {
  try {
    const sp = new URLSearchParams({ sort: 'relevance', limit: String(PAGE), offset: '0' });
    const [options, results] = await Promise.all([getOptions(), searchCourses(sp)]);
    return { options, results, total: options.totalCourses };
  } catch (e) {
    // DB unreachable (e.g. at build time): render the shell; the client fetches.
    console.error('initial load failed:', e.message);
    return null;
  }
}

export default async function Home() {
  return (
    <main className="page">
      <Searcher initial={await loadInitial()} />
    </main>
  );
}

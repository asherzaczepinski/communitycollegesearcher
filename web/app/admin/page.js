// Admin / backend dashboard — the management view that used to be colleges.html.
// Shows every college with its real source + modality breakdown (admins DO see
// provenance here), plus the Recheck-everything control. Read straight from
// Supabase server-side.
import { query } from '../../lib/db';
import AdminControls from './AdminControls';

export const dynamic = 'force-dynamic';

function sourceLabel(c) {
  if (c.cvc_count > 0 && c.site_count > 0) return 'college site + CVC';
  if (c.scrape_type === 'cvc') return 'CVC (online only)';
  if (c.scrape_type === 'colleague') return 'college site · Colleague';
  return 'college website';
}

export default async function Admin() {
  const { rows } = await query(`
    SELECT slug, name, scrape_type, course_count, online_count, hybrid_count,
           in_person_count, site_count, cvc_count
    FROM colleges
    WHERE scrape_type NOT IN ('sample','none') AND course_count > 0
    ORDER BY course_count DESC
  `);
  const totals = rows.reduce((a, c) => {
    a.courses += c.course_count; a.online += c.online_count;
    a.inperson += c.in_person_count; a.hybrid += c.hybrid_count; return a;
  }, { courses: 0, online: 0, inperson: 0, hybrid: 0 });

  return (
    <>
      <header className="site-header">
        <div className="inner">
          <div className="logo">CC<span>Searcher</span> · Admin</div>
          <div className="tag"><a href="/">← Back to search</a></div>
        </div>
      </header>
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 20px 60px' }}>
        <AdminControls />

        <p style={{ color: 'var(--muted)' }}>
          {rows.length} live colleges · {totals.courses.toLocaleString()} courses
          ({totals.inperson.toLocaleString()} in-person · {totals.online.toLocaleString()} online · {totals.hybrid.toLocaleString()} hybrid)
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr><th>College</th><th>Courses</th><th>In-person</th><th>Online</th><th>Hybrid</th><th>Source</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.slug}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.course_count.toLocaleString()}</td>
                  <td>{c.in_person_count.toLocaleString()}</td>
                  <td>{c.online_count.toLocaleString()}</td>
                  <td>{c.hybrid_count.toLocaleString()}</td>
                  <td><span className="src-tag">{sourceLabel(c)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

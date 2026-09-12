import { useEffect, useState } from 'react';
import { get } from '../api/client.js';
import { Status } from '../components/Status.jsx';

const labels = {
  jobsDiscovered: 'Jobs discovered',
  matching: 'Matching',
  highQualityMatches: 'High-quality matches',
  prepared: 'Prepared',
  awaitingApproval: 'Awaiting approval',
  submitted: 'Submitted',
  failed: 'Failed',
  interviews: 'Interviews',
};

export function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    get('/api/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading dashboard…</p>;

  const topMatches = data.topMatches || [];

  return (
    <section>
      {data.lastDiscovery && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            padding: '0.65rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>⏱️</span>
          <span>
            <strong>Jobs last refreshed:</strong>{' '}
            {new Date(data.lastDiscovery.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
            {data.lastDiscovery.stats?.created ?? 0} new jobs found
          </span>
        </div>
      )}

      <h2>Today’s pipeline</h2>
      <div className="cards">
        {Object.entries(labels).map(([key, label]) => (
          <article className="card" key={key}>
            <span>{label}</span>
            <strong>{data[key]}</strong>
          </article>
        ))}
      </div>

      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.3rem' }}>Top Ranked Matches</h3>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Showing top {topMatches.length} match{topMatches.length === 1 ? '' : 'es'}
          </span>
        </div>

        {topMatches.length === 0 ? (
          <div
            style={{
              padding: '1.5rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              color: '#475569',
              fontSize: '0.95rem',
            }}
          >
            No ranked job matches yet. Head over to the{' '}
            <a href="/jobs" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>
              Jobs page
            </a>{' '}
            and click &ldquo;Run discovery&rdquo; to discover and match new roles.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', width: '30%' }}>Company &amp; Role</th>
                  <th style={{ textAlign: 'left', width: '18%' }}>Location</th>
                  <th style={{ textAlign: 'left', width: '28%' }}>Fit Analysis</th>
                  <th style={{ textAlign: 'left', width: '12%' }}>Status</th>
                  <th style={{ textAlign: 'left', width: '12%' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {topMatches.map((job) => {
                  const isAwaitingApproval = job.applicationStatus === 'AWAITING_APPROVAL';

                  return (
                    <tr key={job.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      {/* Column 1: Company & Role */}
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <strong>
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#0f172a', textDecoration: 'none' }}
                          >
                            {job.title}
                          </a>
                        </strong>
                        <br />
                        <small style={{ color: '#64748b' }}>{job.company}</small>
                      </td>

                      {/* Column 2: Location */}
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#334155' }}>
                          {job.location || 'Remote / Unspecified'}
                        </span>
                      </td>

                      {/* Column 3: Fit Analysis */}
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: '1.15rem',
                                fontWeight: 800,
                                color: job.matchScore >= 75 ? '#15803d' : '#b45309',
                              }}
                            >
                              {job.matchScore}%
                            </span>
                            <span
                              style={{
                                textTransform: 'uppercase',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                background: job.recommendation === 'apply' ? '#dcfce7' : '#fef3c7',
                                color: job.recommendation === 'apply' ? '#166534' : '#92400e',
                              }}
                            >
                              {job.recommendation}
                            </span>
                            {job.matchScore < 75 && (
                              <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                                (Below 75% threshold)
                              </span>
                            )}
                          </div>
                          {job.explanation && (
                            <p
                              style={{
                                margin: '0.35rem 0 0 0',
                                fontSize: '0.85rem',
                                color: '#475569',
                                lineHeight: 1.4,
                              }}
                            >
                              {job.explanation}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Column 4: Status */}
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <Status value={job.applicationStatus} />
                      </td>

                      {/* Column 5: Action */}
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        {isAwaitingApproval ? (
                          <a
                            href="/applications"
                            style={{
                              display: 'inline-block',
                              textAlign: 'center',
                              padding: '0.35rem 0.65rem',
                              background: '#059669',
                              color: '#fff',
                              borderRadius: '4px',
                              textDecoration: 'none',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                            }}
                            title="Gate 1 Approval: Review tailored resume and truthful answers before approving"
                          >
                            Review &amp; Approve &rarr;
                          </a>
                        ) : (
                          <a
                            href={`/jobs?selected=${job.id}`}
                            style={{
                              display: 'inline-block',
                              textAlign: 'center',
                              padding: '0.35rem 0.65rem',
                              background: '#2563eb',
                              color: '#fff',
                              borderRadius: '4px',
                              textDecoration: 'none',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                            }}
                          >
                            View in Jobs &rarr;
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

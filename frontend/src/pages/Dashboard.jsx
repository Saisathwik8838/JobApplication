import { useEffect, useState } from 'react';
import { get, post } from '../api/client.js';
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
  const [discovering, setDiscovering] = useState(false);

  const loadDashboard = async () => {
    try {
      const res = await get('/api/dashboard');
      setData(res);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleRunDiscovery = async () => {
    setDiscovering(true);
    try {
      await post('/api/discovery/run');
      await loadDashboard();
    } catch (e) {
      setError(`Discovery trigger failed: ${e.message}`);
    } finally {
      setDiscovering(false);
    }
  };

  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading dashboard…</p>;

  const topMatches = data.topMatches || [];

  return (
    <section>
      {/* Top action header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Application Pipeline Dashboard</h2>
          <small style={{ color: '#64748b' }}>
            Real-time status of India job discovery, ATS pipeline, and approval gates.
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleRunDiscovery}
            disabled={discovering}
            style={{
              background: '#0284c7',
              color: '#fff',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: discovering ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            {discovering ? '⏳ Discovering jobs…' : '🚀 Run discovery now'}
          </button>
          <button
            type="button"
            onClick={loadDashboard}
            style={{
              background: '#475569',
              color: '#fff',
              padding: '0.5rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

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

      <div className="cards">
        {Object.entries(labels).map(([key, label]) => (
          <article className="card" key={key}>
            <span>{label}</span>
            <strong>{data[key]}</strong>
          </article>
        ))}
      </div>

      {/* Source Health Panel */}
      <div style={{ marginTop: '2rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📡</span> Job Source Health &amp; Isolation
            </h3>
            <small style={{ color: '#64748b' }}>
              Tracks source rate limits (429) and errors independently so an isolated rate limit never blocks other active sources.
            </small>
          </div>
        </div>

        {(!data.sourceHealth || data.sourceHealth.length === 0) ? (
          <p style={{ color: '#64748b', fontSize: '0.88rem', margin: '0.5rem 0 0 0' }}>
            No source health records yet. Click &ldquo;Run discovery now&rdquo; to fetch real-time listings from configured sources (Adzuna India, NCS, Arbeitnow, Company Career Boards).
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', marginTop: '0.5rem' }}>
            {data.sourceHealth.map((sh) => {
              const isHealthy = sh.status === 'HEALTHY';
              const isRateLimited = sh.status === 'RATE_LIMITED';
              const badgeBg = isHealthy ? '#dcfce7' : isRateLimited ? '#fef3c7' : '#fee2e2';
              const badgeColor = isHealthy ? '#166534' : isRateLimited ? '#92400e' : '#991b1b';
              const badgeText = isHealthy ? '● Healthy' : isRateLimited ? '▲ Rate Limited (429)' : '✕ Error';

              return (
                <div
                  key={sh.id || sh.source}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '0.85rem',
                    background: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.92rem', textTransform: 'uppercase', color: '#1e293b' }}>
                      {sh.source}
                    </strong>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background: badgeBg,
                        color: badgeColor,
                      }}
                    >
                      {badgeText}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                    <strong>Jobs discovered:</strong> {sh.jobCount ?? 0}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    <strong>Last run:</strong>{' '}
                    {sh.lastSuccessfulRun
                      ? new Date(sh.lastSuccessfulRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
                      : 'Pending'}
                  </div>
                  {sh.lastError && (
                    <div style={{ fontSize: '0.75rem', color: '#b91c1c', background: '#fef2f2', padding: '0.25rem 0.5rem', borderRadius: '4px', marginTop: '0.25rem', wordBreak: 'break-word' }}>
                      ⚠️ {sh.lastError}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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

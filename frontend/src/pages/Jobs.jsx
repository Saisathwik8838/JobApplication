import { useEffect, useState } from 'react';
import { get, post } from '../api/client.js';
import { Status } from '../components/Status.jsx';

export function Jobs() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [generalError, setGeneralError] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [jobFeedback, setJobFeedback] = useState({});

  const reload = async () => {
    try {
      const res = await get('/api/jobs');
      setData(res);
    } catch (e) {
      setGeneralError(e.message);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const handleDiscovery = async () => {
    setGeneralError('');
    setDiscovering(true);
    try {
      await post('/api/discovery/run');
      await reload();
    } catch (e) {
      setGeneralError(`Discovery failed: ${e.message}`);
    } finally {
      setDiscovering(false);
    }
  };

  const handleAnalyze = async (jobId) => {
    setGeneralError('');
    setJobFeedback((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], analyzing: true, error: null, success: null },
    }));

    try {
      const result = await post(`/api/jobs/${jobId}/analyze`);

      if (result && result.eligibility && result.eligibility.eligible === false) {
        setJobFeedback((prev) => ({
          ...prev,
          [jobId]: {
            analyzing: false,
            eligibility: result.eligibility,
            hardFailures: result.eligibility.hardFailures ?? result.hardFailures ?? [],
            match: null,
            error: null,
          },
        }));
      } else if (result && result.match) {
        setJobFeedback((prev) => ({
          ...prev,
          [jobId]: {
            analyzing: false,
            eligibility: result.eligibility,
            match: result.match,
            hardFailures: [],
            error: null,
          },
        }));
      } else {
        setJobFeedback((prev) => ({
          ...prev,
          [jobId]: { analyzing: false, result, error: null },
        }));
      }
      await reload();
    } catch (e) {
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: { analyzing: false, error: e.message },
      }));
    }
  };

  const handlePrepare = async (jobId) => {
    setGeneralError('');
    setJobFeedback((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], preparing: true, error: null, success: null },
    }));

    try {
      await post(`/api/jobs/${jobId}/prepare`);
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          preparing: false,
          error: null,
          success: 'Application prepared successfully! Review resume and answers in Applications.',
        },
      }));
      await reload();
    } catch (e) {
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          preparing: false,
          error: e.message,
        },
      }));
    }
  };

  const handleReject = async (jobId) => {
    setGeneralError('');
    try {
      await post(`/api/jobs/${jobId}/reject`);
      await reload();
    } catch (e) {
      setGeneralError(`Reject failed: ${e.message}`);
    }
  };

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Job Postings ({data.total ?? data.items?.length ?? 0})</h2>
          <small style={{ color: '#64748b' }}>
            Discover real jobs, analyze candidate fit, and prepare truthful applications.
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleDiscovery}
            disabled={discovering}
            style={{ background: '#0284c7', padding: '0.5rem 1rem' }}
          >
            {discovering ? 'Discovering jobs…' : 'Run discovery'}
          </button>
          <button type="button" onClick={reload} style={{ background: '#475569', padding: '0.5rem 0.8rem' }}>
            Refresh
          </button>
        </div>
      </div>

      {generalError && (
        <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          <strong>Error:</strong> {generalError}
        </div>
      )}

      {data.items?.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          <p style={{ margin: 0 }}>No job postings found. Click <strong>Run discovery</strong> above to ingest postings.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: '38%' }}>Company & Role</th>
                <th style={{ width: '14%' }}>Location</th>
                <th style={{ width: '26%' }}>Fit Analysis & Eligibility</th>
                <th style={{ width: '10%' }}>Status</th>
                <th style={{ width: '12%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((job) => {
                const feedback = jobFeedback[job.id] || {};
                const savedMatch = job.matches?.[0]?.result;
                const match = feedback.match ?? savedMatch;
                const hardFailures = feedback.hardFailures ?? (feedback.eligibility?.hardFailures ?? []);
                const isIneligible = feedback.eligibility?.eligible === false || hardFailures.length > 0;
                const appStatus = job.applications?.[0]?.status ?? job.status;
                const isAwaitingApproval = appStatus === 'AWAITING_APPROVAL';

                return (
                  <tr key={job.id}>
                    {/* Column 1: Company / Role */}
                    <td>
                      <div>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#0f172a', fontWeight: 600, fontSize: '1rem', textDecoration: 'none' }}
                        >
                          {job.company}
                        </a>
                      </div>
                      <div style={{ color: '#334155', fontWeight: 500, fontSize: '0.95rem' }}>
                        {job.title}
                      </div>
                      <small style={{ color: '#64748b' }}>
                        Source: {job.source} • ID: {job.id.slice(0, 8)}…
                      </small>

                      {/* Inline feedback: Ineligibility */}
                      {isIneligible && (
                        <div style={{ marginTop: '0.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#991b1b', fontSize: '0.85rem' }}>
                          <strong>⚠️ Ineligible for role:</strong>
                          <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.25rem' }}>
                            {hardFailures.map((failure, idx) => (
                              <li key={idx}>{failure}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Inline feedback: Error from prepare or analyze */}
                      {feedback.error && (
                        <div style={{ marginTop: '0.5rem', background: '#fff1f2', border: '1px solid #fda4af', borderRadius: '6px', padding: '0.45rem 0.65rem', color: '#be123c', fontSize: '0.85rem' }}>
                          <strong>Failed:</strong> {feedback.error}
                        </div>
                      )}

                      {/* Inline feedback: Success from prepare */}
                      {feedback.success && (
                        <div style={{ marginTop: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.45rem 0.65rem', color: '#047857', fontSize: '0.85rem' }}>
                          {feedback.success}{' '}
                          <a href="/applications" style={{ color: '#059669', fontWeight: 700, textDecoration: 'underline' }}>
                            Go to Applications →
                          </a>
                        </div>
                      )}
                    </td>

                    {/* Column 2: Location */}
                    <td>
                      <span style={{ fontSize: '0.9rem', color: '#334155' }}>
                        {job.location || 'Remote / Unspecified'}
                      </span>
                    </td>

                    {/* Column 3: Fit Analysis & Eligibility */}
                    <td>
                      {isIneligible ? (
                        <span style={{ display: 'inline-block', background: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                          Ineligible
                        </span>
                      ) : match ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: match.matchScore >= 75 ? '#15803d' : '#b45309' }}>
                              {match.matchScore}%
                            </span>
                            <span
                              style={{
                                textTransform: 'uppercase',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                background: match.recommendation === 'apply' ? '#dcfce7' : '#fef3c7',
                                color: match.recommendation === 'apply' ? '#166534' : '#92400e',
                              }}
                            >
                              {match.recommendation}
                            </span>
                            {match.matchScore < 75 && (
                              <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                                (Below 75% threshold)
                              </span>
                            )}
                          </div>
                          {match.explanation && (
                            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>
                              {match.explanation}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.9rem' }}>
                          Not analyzed yet
                        </span>
                      )}
                    </td>

                    {/* Column 4: Status */}
                    <td>
                      <Status value={appStatus} />
                    </td>

                    {/* Column 5: Actions */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <button
                          type="button"
                          disabled={feedback.analyzing || feedback.preparing}
                          onClick={() => handleAnalyze(job.id)}
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                        >
                          {feedback.analyzing ? 'Analyzing…' : 'Analyze'}
                        </button>

                        <button
                          type="button"
                          disabled={
                            feedback.analyzing ||
                            feedback.preparing ||
                            isIneligible ||
                            (match && match.matchScore < 75)
                          }
                          title={
                            isIneligible
                              ? 'Job failed deterministic eligibility checks.'
                              : match && match.matchScore < 75
                              ? `Match score (${match.matchScore}%) is below 75% threshold.`
                              : !match
                              ? 'Please analyze before preparing.'
                              : 'Prepare tailored resume and answers'
                          }
                          onClick={() => handlePrepare(job.id)}
                          style={{
                            padding: '0.35rem 0.6rem',
                            fontSize: '0.85rem',
                            background:
                              isIneligible || (match && match.matchScore < 75)
                                ? '#94a3b8'
                                : '#1668c9',
                          }}
                        >
                          {feedback.preparing ? 'Preparing…' : 'Prepare'}
                        </button>

                        {/* GATE 1 REVIEW: Points reviewer to Applications.jsx to view tailored resume & answers before approving */}
                        {isAwaitingApproval && (
                          <a
                            href="/applications"
                            style={{
                              display: 'block',
                              textAlign: 'center',
                              padding: '0.35rem 0.5rem',
                              background: '#059669',
                              color: '#fff',
                              borderRadius: '4px',
                              textDecoration: 'none',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                            }}
                            title="Gate 1 Approval: Review tailored resume and truthful answers before approving"
                          >
                            Review & Approve →
                          </a>
                        )}

                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleReject(job.id)}
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

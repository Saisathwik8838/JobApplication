import { useEffect, useState } from 'react';
import { get, post, patch } from '../api/client.js';
import { Status } from '../components/Status.jsx';

export function Applications() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [editingAnswers, setEditingAnswers] = useState({});
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const [actionInProgress, setActionInProgress] = useState({});

  const reload = () =>
    get('/api/applications')
      .then(setItems)
      .catch((e) => setError(e.message));

  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const setBusy = (id, busy) => {
    setActionInProgress((prev) => ({ ...prev, [id]: busy }));
  };

  const handleAction = async (appId, actionFn, successText) => {
    setError('');
    setSuccessMsg('');
    setBusy(appId, true);
    try {
      await actionFn();
      if (successText) setSuccessMsg(successText);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(appId, false);
    }
  };

  const saveAnswer = async (appId, answerId) => {
    const text = editingAnswers[answerId];
    if (!text || !text.trim()) return;
    handleAction(
      appId,
      () => patch(`/api/applications/${appId}/answers/${answerId}`, { answer: text }),
      'Answer saved successfully'
    ).then(() => {
      setEditingAnswers((prev) => ({ ...prev, [answerId]: '' }));
    });
  };

  // Gate 1 Actions
  const approveGate1 = (app) =>
    handleAction(
      app.id,
      () => post(`/api/jobs/${app.job.id}/approve`, { actor: 'local-user', note: 'Gate 1 approved by user' }),
      `Approved autofill for ${app.job.company}. Worker will start filling the form.`
    );

  const rejectGate1 = (app) =>
    handleAction(
      app.id,
      () => post(`/api/applications/${app.id}/reject`, { actor: 'local-user', note: 'Rejected at Gate 1' }),
      `Application for ${app.job.company} rejected.`
    );

  // Gate 2 Actions
  const confirmSubmitGate2 = (app) =>
    handleAction(
      app.id,
      () => post(`/api/applications/${app.id}/confirm-submit`, { actor: 'local-user', note: 'Gate 2 approved after review' }),
      `Confirmed final submission for ${app.job.company}. Submission in progress.`
    );

  const rejectGate2 = (app) =>
    handleAction(
      app.id,
      () => post(`/api/applications/${app.id}/reject`, { actor: 'local-user', note: 'Rejected at Gate 2 recheck' }),
      `Application for ${app.job.company} rejected after recheck.`
    );

  const refillGate2 = (app) =>
    handleAction(
      app.id,
      () => post(`/api/applications/${app.id}/refill`),
      `Refill requested for ${app.job.company}. Form will be re-filled with updated answers.`
    );

  const retryApp = (app) =>
    handleAction(
      app.id,
      () => post(`/api/applications/${app.id}/retry`),
      `Retrying application for ${app.job.company}.`
    );

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Applications ({items.length})</h2>
        <button type="button" onClick={reload} style={{ background: '#475569' }}>
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" style={{ padding: '0.75rem 1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', color: '#15803d', borderRadius: '6px', marginBottom: '1rem' }}>
          {successMsg}
        </div>
      )}

      {items.length === 0 && (
        <p style={{ color: '#64748b' }}>No applications yet. Head over to the Jobs tab to match and prepare applications.</p>
      )}

      {items.map((item) => {
        const isBusy = actionInProgress[item.id];
        const isAwaitingApproval = item.status === 'AWAITING_APPROVAL';
        const isFilledRecheck = item.status === 'FILLED_AWAITING_RECHECK';
        const isNeedsUserInput = item.status === 'NEEDS_USER_INPUT';
        const isManualIntervention = item.status === 'MANUAL_INTERVENTION' || item.status === 'FAILED';
        const isSubmitted = item.status === 'SUBMITTED';

        return (
          <article className="application" key={item.id} style={{ marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0' }}>
                  <a href={item.job.url} target="_blank" rel="noreferrer" style={{ color: '#0f172a', textDecoration: 'none' }}>
                    {item.job.company} — {item.job.title}
                  </a>
                </h3>
                <small style={{ color: '#64748b' }}>
                  Location: {item.job.location || 'Remote/Unspecified'} • ID: {item.id.slice(0, 8)}… • Updated: {new Date(item.updatedAt).toLocaleTimeString()}
                </small>
              </div>
              <div>
                <Status value={item.status} />
              </div>
            </div>

            {/* GATE 1: PRE-FILL APPROVAL BANNER */}
            {isAwaitingApproval && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Gate 1: Pre-Fill Human Approval Required</span>
                </h4>
                <p style={{ margin: '0 0 0.75rem 0', color: '#14532d', fontSize: '0.9rem' }}>
                  Tailored resume and truth-verified answers have been prepared. Please review and approve before our browser automation opens and fills the application form.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-success"
                    disabled={isBusy}
                    onClick={() => approveGate1(item)}
                  >
                    {isBusy ? 'Processing…' : 'Approve Auto-Fill'}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={isBusy}
                    onClick={() => rejectGate1(item)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

            {/* GATE 2: POST-FILL RECHECK CONTAINER */}
            {isFilledRecheck && (
              <div className="recheck-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h4 style={{ margin: 0, color: '#92400e', fontSize: '1.05rem' }}>
                    Gate 2: Human Recheck Required Before Submission
                  </h4>
                  <span style={{ fontSize: '0.8rem', background: '#f59e0b', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 600 }}>
                    Automation Paused
                  </span>
                </div>
                <p style={{ margin: '0.5rem 0 1rem 0', color: '#78350f', fontSize: '0.9rem' }}>
                  The application form was auto-filled using your verified candidate data. Please inspect the screenshot and values table below. <strong>No submission will occur without your explicit confirmation.</strong>
                </p>

                {/* Screenshot view */}
                {item.screenshot ? (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong>Captured Form Screenshot:</strong>
                    <div style={{ marginTop: '0.4rem' }}>
                      <img
                        src={`data:image/png;base64,${item.screenshot}`}
                        alt="Filled application form screenshot"
                        className="screenshot-preview"
                        onClick={() => setSelectedScreenshot(`data:image/png;base64,${item.screenshot}`)}
                        title="Click to view full size"
                      />
                      <small style={{ color: '#64748b' }}>(Click image to view full-resolution screenshot)</small>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontStyle: 'italic', color: '#64748b' }}>No screenshot captured for this form.</p>
                )}

                {/* Structured Form Values Table */}
                {item.filledData && Object.keys(item.filledData).length > 0 ? (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong>Form Fields & Filled Values:</strong>
                    <div className="table-wrap">
                      <table className="field-map-table">
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            <th style={{ width: '40%' }}>Field Name / Selector</th>
                            <th>Value Written</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(item.filledData).map(([key, val]) => (
                            <tr key={key}>
                              <td>{key}</td>
                              <td>{String(val)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontStyle: 'italic', color: '#64748b' }}>No structured fields recorded.</p>
                )}

                {/* Gate 2 Action Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #fde68a' }}>
                  <button
                    type="button"
                    className="btn-success"
                    style={{ fontSize: '0.95rem', padding: '0.55rem 1rem' }}
                    disabled={isBusy}
                    onClick={() => confirmSubmitGate2(item)}
                  >
                    {isBusy ? 'Submitting…' : 'Approve & Submit Application'}
                  </button>
                  <button
                    type="button"
                    className="btn-warning"
                    disabled={isBusy}
                    onClick={() => refillGate2(item)}
                  >
                    Edit & Refill Form
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={isBusy}
                    onClick={() => rejectGate2(item)}
                  >
                    Reject Application
                  </button>
                </div>
              </div>
            )}

            {/* SUBMITTED CONFIRMATION */}
            {isSubmitted && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.85rem', marginTop: '1rem' }}>
                <p style={{ margin: 0, color: '#065f46', fontWeight: 600 }}>
                  Application Submitted Successfully!
                </p>
                {item.submittedAt && (
                  <small style={{ color: '#047857' }}>
                    Submitted on {new Date(item.submittedAt).toLocaleString()}
                  </small>
                )}
                {item.submissionUrl && (
                  <div style={{ marginTop: '0.35rem' }}>
                    <a href={item.submissionUrl} target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: 500 }}>
                      View Submission Confirmation Page ↗
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* ERROR / MANUAL INTERVENTION */}
            {isManualIntervention && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '6px', padding: '0.85rem', marginTop: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', color: '#9f1239', fontWeight: 600 }}>
                  Manual Intervention Required
                </p>
                <p style={{ margin: '0 0 0.75rem 0', color: '#881337', fontSize: '0.9rem' }}>
                  Automation paused safely. You can inspect the application or trigger a safe retry:
                </p>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => retryApp(item)}
                >
                  {isBusy ? 'Retrying…' : 'Retry safely'}
                </button>
              </div>
            )}

            {/* ANSWERS ACCORDION / LIST */}
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#334155' }}>Candidate Answers & Source Truth</h4>
              {item.answers && item.answers.length > 0 ? (
                item.answers.map((answer) => (
                  <div key={answer.id} style={{ marginBottom: '0.65rem', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>{answer.question}</strong>
                      <Status value={answer.status} />
                    </div>
                    {answer.status === 'NEEDS_USER_INPUT' ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                        <input
                          type="text"
                          placeholder="Enter truthful answer…"
                          value={editingAnswers[answer.id] ?? ''}
                          onChange={(e) =>
                            setEditingAnswers((prev) => ({ ...prev, [answer.id]: e.target.value }))
                          }
                          style={{ padding: '0.4rem 0.6rem', flex: 1, border: '1px solid #cbd5e1', borderRadius: '4px' }}
                        />
                        <button
                          type="button"
                          className="btn-success"
                          disabled={isBusy}
                          onClick={() => saveAnswer(item.id, answer.id)}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.9rem', color: '#475569' }}>
                        {answer.answer ?? '—'}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <small style={{ color: '#64748b' }}>No specific custom questions recorded.</small>
              )}
            </div>

            {/* AUDIT LOG EVENTS (Collapsed / summary) */}
            {item.events && item.events.length > 0 && (
              <details style={{ marginTop: '0.75rem' }}>
                <summary style={{ fontSize: '0.85rem', color: '#64748b', cursor: 'pointer' }}>
                  View Audit Event Trail ({item.events.length} events)
                </summary>
                <div style={{ marginTop: '0.5rem', maxHeight: '160px', overflowY: 'auto', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                  {item.events.map((evt) => (
                    <div key={evt.id} style={{ marginBottom: '0.25rem', borderBottom: '1px solid #edf2f7', paddingBottom: '0.25rem' }}>
                      <span style={{ color: '#64748b' }}>[{new Date(evt.timestamp).toLocaleTimeString()}]</span>{' '}
                      <strong>{evt.eventType}</strong>: {evt.message}{' '}
                      <span style={{ color: '#94a3b8' }}>({evt.fromStatus} → {evt.toStatus})</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </article>
        );
      })}

      {/* FULL-SIZE SCREENSHOT MODAL */}
      {selectedScreenshot && (
        <div
          onClick={() => setSelectedScreenshot(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            padding: '2rem',
          }}
        >
          <div style={{ alignSelf: 'flex-end', marginBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setSelectedScreenshot(null)}
              style={{ background: '#ef4444', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '4px', border: 0, cursor: 'pointer' }}
            >
              Close ✕
            </button>
          </div>
          <img
            src={selectedScreenshot}
            alt="Full size screenshot"
            style={{ maxWidth: '95%', maxHeight: '90%', objectFit: 'contain', background: '#fff', borderRadius: '6px' }}
          />
        </div>
      )}
    </section>
  );
}

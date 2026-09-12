import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, post, patch } from '../api/client.js';
import { Status } from '../components/Status.jsx';
import { FormRecheckReview } from '../components/FormRecheckReview.jsx';

export function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState({ items: [], total: 0, matchThreshold: 75 });
  const [generalError, setGeneralError] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [jobFeedback, setJobFeedback] = useState({});
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const [inlineAnswers, setInlineAnswers] = useState({});
  const [savingAnswer, setSavingAnswer] = useState({});

  // Filter local state initialized from searchParams
  const [companyFilter, setCompanyFilter] = useState(searchParams.get('company') || '');
  const [titleFilter, setTitleFilter] = useState(searchParams.get('titleQuery') || searchParams.get('keyword') || '');
  const [locationFilter, setLocationFilter] = useState(searchParams.get('location') || '');
  const [sourceFilter, setSourceFilter] = useState(searchParams.get('source') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [minScoreFilter, setMinScoreFilter] = useState(searchParams.get('minMatchScore') || '');

  // Debounce ref
  const debounceTimerRef = useRef(null);

  // Synchronize filter state changes to URL search params
  const syncFiltersToParams = useCallback((overrides = {}) => {
    const filters = {
      company: companyFilter,
      titleQuery: titleFilter,
      location: locationFilter,
      source: sourceFilter,
      status: statusFilter,
      minMatchScore: minScoreFilter,
      ...overrides,
    };

    const newParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        newParams.set(key, String(val).trim());
      }
    });
    setSearchParams(newParams, { replace: true });
  }, [companyFilter, titleFilter, locationFilter, sourceFilter, statusFilter, minScoreFilter, setSearchParams]);

  // Build query string from active searchParams or current local state
  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    const company = searchParams.get('company') ?? companyFilter;
    const title = searchParams.get('titleQuery') ?? searchParams.get('keyword') ?? titleFilter;
    const loc = searchParams.get('location') ?? locationFilter;
    const src = searchParams.get('source') ?? sourceFilter;
    const st = searchParams.get('status') ?? statusFilter;
    const score = searchParams.get('minMatchScore') ?? minScoreFilter;

    if (company && company.trim()) params.set('company', company.trim());
    if (title && title.trim()) params.set('titleQuery', title.trim());
    if (loc && loc.trim()) params.set('location', loc.trim());
    if (src && src.trim()) params.set('source', src.trim());
    if (st && st.trim()) params.set('status', st.trim());
    if (score && score.trim()) params.set('minMatchScore', score.trim());

    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [searchParams, companyFilter, titleFilter, locationFilter, sourceFilter, statusFilter, minScoreFilter]);

  const reload = useCallback(async () => {
    try {
      const qs = buildQueryString();
      const res = await get(`/api/jobs${qs}`);
      setData(res);
    } catch (e) {
      setGeneralError(e.message);
    }
  }, [buildQueryString]);

  // Trigger search params sync with debounce when user types in filter inputs
  const handleTextFilterChange = (setter, key, val) => {
    setter(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      syncFiltersToParams({ [key]: val });
    }, 300);
  };

  const handleSelectFilterChange = (setter, key, val) => {
    setter(val);
    syncFiltersToParams({ [key]: val });
  };

  const handleClearFilters = () => {
    setCompanyFilter('');
    setTitleFilter('');
    setLocationFilter('');
    setSourceFilter('');
    setStatusFilter('');
    setMinScoreFilter('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  // Reload when searchParams change or polling interval fires
  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 5000);
    return () => {
      window.clearInterval(timer);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [reload, searchParams]);

  const matchThreshold = data.matchThreshold ?? 75;

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
    setJobFeedback((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], rejecting: true, error: null, success: null },
    }));
    try {
      await post(`/api/jobs/${jobId}/reject`);
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          rejecting: false,
          success: 'Job rejected.',
          error: null,
        },
      }));
      await reload();
    } catch (e) {
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          rejecting: false,
          error: `Reject failed: ${e.message}`,
        },
      }));
      setGeneralError(`Reject failed: ${e.message}`);
    }
  };

  const handleApply = async (job) => {
    setGeneralError('');
    setJobFeedback((prev) => ({
      ...prev,
      [job.id]: { ...prev[job.id], applying: true, needsUserInput: false, error: null, success: null },
    }));

    try {
      let application = job.applications?.[0];

      // 1. Prepare application if not already prepared or awaiting approval
      if (!application || (application.status !== 'AWAITING_APPROVAL' && application.status !== 'APPLICATION_PREPARED')) {
        const prepResult = await post(`/api/jobs/${job.id}/prepare`);
        application = prepResult.application;

        // If truthful user input required, stop immediately
        if (application.status === 'NEEDS_USER_INPUT') {
          setJobFeedback((prev) => ({
            ...prev,
            [job.id]: {
              ...prev[job.id],
              applying: false,
              needsUserInput: true,
              error: null,
              success: null,
            },
          }));
          await reload();
          return;
        }
      }

      // 2. Immediately approve Gate 1 if awaiting approval
      if (application.status === 'AWAITING_APPROVAL' || application.status === 'APPLICATION_PREPARED') {
        await post(`/api/jobs/${job.id}/approve`, {
          actor: 'local-user',
          note: 'Gate 1 approved via one-click Apply',
        });
        setJobFeedback((prev) => ({
          ...prev,
          [job.id]: {
            ...prev[job.id],
            applying: false,
            success: 'Gate 1 approved! Opening application page and auto-filling form in browser…',
            error: null,
          },
        }));
      }

      await reload();
    } catch (e) {
      setJobFeedback((prev) => ({
        ...prev,
        [job.id]: {
          ...prev[job.id],
          applying: false,
          error: e.message,
        },
      }));
    }
  };

  const handleSaveInlineAnswer = async (jobId, applicationId, answerId) => {
    const val = inlineAnswers[answerId];
    if (!val || !val.trim()) return;

    setSavingAnswer((prev) => ({ ...prev, [answerId]: true }));
    try {
      await patch(`/api/applications/${applicationId}/answers/${answerId}`, {
        answer: val.trim(),
      });
      setInlineAnswers((prev) => ({ ...prev, [answerId]: '' }));
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          needsUserInput: false,
          success: 'Answer saved! Resuming truthful submission…',
        },
      }));
      await reload();
    } catch (e) {
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: { ...prev[jobId], error: e.message },
      }));
    } finally {
      setSavingAnswer((prev) => ({ ...prev, [answerId]: false }));
    }
  };

  const handleConfirmSubmit = async (jobId, applicationId) => {
    setGeneralError('');
    setJobFeedback((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], submittingGate2: true, error: null, success: null },
    }));

    try {
      await post(`/api/applications/${applicationId}/confirm-submit`, {
        actor: 'local-user',
        note: 'Gate 2 approved after review on Jobs page',
      });
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          submittingGate2: false,
          success: 'Gate 2 approved! Final submission in progress.',
          error: null,
        },
      }));
      await reload();
    } catch (e) {
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          submittingGate2: false,
          error: e.message,
        },
      }));
    }
  };

  const handleRejectApplication = async (jobId, applicationId) => {
    setGeneralError('');
    setJobFeedback((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], rejectingGate2: true, error: null, success: null },
    }));

    try {
      await post(`/api/applications/${applicationId}/reject`, {
        actor: 'local-user',
        note: 'Rejected at Gate 2 review on Jobs page',
      });
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          rejectingGate2: false,
          success: 'Application rejected.',
          error: null,
        },
      }));
      await reload();
    } catch (e) {
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          rejectingGate2: false,
          error: e.message,
        },
      }));
    }
  };

  const handleRetry = async (jobId, applicationId) => {
    setGeneralError('');
    setJobFeedback((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], retrying: true, error: null, success: null },
    }));

    try {
      await post(`/api/applications/${applicationId}/retry`);
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          retrying: false,
          success: 'Retrying application safely.',
          error: null,
        },
      }));
      await reload();
    } catch (e) {
      setJobFeedback((prev) => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          retrying: false,
          error: e.message,
        },
      }));
    }
  };

  return (
    <section>
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Job Postings ({data.total ?? data.items?.length ?? 0})</h2>
          <small style={{ color: '#64748b' }}>
            Discover real jobs, filter opportunities, analyze candidate fit, and apply with automated truthful submission.
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

      {/* Part 4: Jobs Filter Bar */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>🔍 Filter &amp; Search Jobs</span>
          {(companyFilter || titleFilter || locationFilter || sourceFilter || statusFilter || minScoreFilter) && (
            <button
              type="button"
              onClick={handleClearFilters}
              style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
            >
              Reset Filters ✕
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label htmlFor="filter-company" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem' }}>
              Company
            </label>
            <input
              id="filter-company"
              type="text"
              placeholder="e.g. Acme or Stripe"
              value={companyFilter}
              onChange={(e) => handleTextFilterChange(setCompanyFilter, 'company', e.target.value)}
              style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label htmlFor="filter-title" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem' }}>
              Title / Keyword
            </label>
            <input
              id="filter-title"
              type="text"
              placeholder="e.g. Backend, React"
              value={titleFilter}
              onChange={(e) => handleTextFilterChange(setTitleFilter, 'titleQuery', e.target.value)}
              style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label htmlFor="filter-location" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem' }}>
              Location
            </label>
            <input
              id="filter-location"
              type="text"
              placeholder="e.g. Remote, Bengaluru, Hyderabad"
              value={locationFilter}
              onChange={(e) => handleTextFilterChange(setLocationFilter, 'location', e.target.value)}
              style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label htmlFor="filter-source" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem' }}>
              Source
            </label>
            <select
              id="filter-source"
              value={sourceFilter}
              onChange={(e) => handleSelectFilterChange(setSourceFilter, 'source', e.target.value)}
              style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem', background: '#fff' }}
            >
              <option value="">All Sources</option>
              <option value="remotive">Remotive</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="custom">Custom / Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-status" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem' }}>
              Status
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => handleSelectFilterChange(setStatusFilter, 'status', e.target.value)}
              style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem', background: '#fff' }}
            >
              <option value="">All Statuses</option>
              <option value="DISCOVERED">Discovered</option>
              <option value="MATCHED">Matched</option>
              <option value="AWAITING_APPROVAL">Awaiting Approval (Gate 1)</option>
              <option value="APPROVED">Approved</option>
              <option value="FILLING">Filling</option>
              <option value="FILLED_AWAITING_RECHECK">Filled Awaiting Recheck</option>
              <option value="NEEDS_USER_INPUT">Needs User Input</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="FAILED">Failed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-score" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem' }}>
              Min Match Score ({minScoreFilter ? `${minScoreFilter}%` : 'Any'})
            </label>
            <input
              id="filter-score"
              type="number"
              min="0"
              max="100"
              placeholder="e.g. 75"
              value={minScoreFilter}
              onChange={(e) => handleTextFilterChange(setMinScoreFilter, 'minMatchScore', e.target.value)}
              style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </div>

      {generalError && (
        <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          <strong>Error:</strong> {generalError}
        </div>
      )}

      {data.items?.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          <p style={{ margin: 0 }}>No matching job postings found. Click <strong>Run discovery</strong> or adjust filter criteria above.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: '36%' }}>Company &amp; Role</th>
                <th style={{ width: '14%' }}>Location</th>
                <th style={{ width: '24%' }}>Fit Analysis &amp; Eligibility</th>
                <th style={{ width: '10%' }}>Status</th>
                <th style={{ width: '16%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((job) => {
                const feedback = jobFeedback[job.id] || {};
                const savedMatch = job.matches?.[0]?.result;
                const match = feedback.match ?? savedMatch;
                const hardFailures = feedback.hardFailures ?? (feedback.eligibility?.hardFailures ?? []);
                const isIneligible = feedback.eligibility?.eligible === false || hardFailures.length > 0;
                const application = job.applications?.[0];
                const appStatus = application?.status ?? job.status;
                const isAwaitingApproval = appStatus === 'AWAITING_APPROVAL';
                const isFilledRecheck = appStatus === 'FILLED_AWAITING_RECHECK';
                const isNeedsUserInput = appStatus === 'NEEDS_USER_INPUT' || feedback.needsUserInput;
                const isManualIntervention = appStatus === 'MANUAL_INTERVENTION' || appStatus === 'FAILED';
                const isSubmitted = appStatus === 'SUBMITTED';

                const isBusy = Boolean(
                  feedback.analyzing ||
                  feedback.preparing ||
                  feedback.applying ||
                  feedback.rejecting ||
                  feedback.submittingGate2 ||
                  feedback.rejectingGate2 ||
                  feedback.retrying
                );

                const isScoreEligible = match && match.matchScore >= matchThreshold;
                const canPrepareOrApply = !isIneligible && Boolean(match) && isScoreEligible;

                const prepareTooltip = isIneligible
                  ? 'Job failed deterministic eligibility checks.'
                  : !match
                  ? 'Please analyze before preparing.'
                  : match.matchScore < matchThreshold
                  ? `Match score (${match.matchScore}%) is below ${matchThreshold}% threshold.`
                  : 'Prepare tailored resume and answers';

                const applyTooltip = isIneligible
                  ? 'Job failed deterministic eligibility checks.'
                  : !match
                  ? 'Please analyze before applying.'
                  : match.matchScore < matchThreshold
                  ? `Match score (${match.matchScore}%) is below ${matchThreshold}% threshold.`
                  : 'One-click apply: auto-prepares, approves Gate 1, and fills form in browser';

                const pendingAnswers = application?.answers?.filter((a) => a.status === 'NEEDS_USER_INPUT') || [];

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

                      {/* Ineligible alert */}
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

                      {/* Part 3: Needs user input alert + inline answer forms */}
                      {isNeedsUserInput && (
                        <div style={{ marginTop: '0.5rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.65rem 0.75rem', color: '#92400e', fontSize: '0.85rem' }}>
                          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>
                            ⚠️ Truthful Input Required:
                          </strong>
                          <span style={{ fontSize: '0.85rem' }}>
                            One or more application answers require truthful input before submission can proceed.
                          </span>

                          {pendingAnswers.length > 0 ? (
                            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {pendingAnswers.map((ans) => (
                                <div key={ans.id} style={{ background: '#fff', border: '1px solid #fef08a', borderRadius: '4px', padding: '0.5rem' }}>
                                  <div style={{ fontWeight: 600, color: '#78350f', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                                    {ans.question}
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                    <input
                                      type="text"
                                      placeholder="Provide truthful answer…"
                                      value={inlineAnswers[ans.id] ?? ''}
                                      onChange={(e) => setInlineAnswers((prev) => ({ ...prev, [ans.id]: e.target.value }))}
                                      style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                    />
                                    <button
                                      type="button"
                                      className="btn-success"
                                      disabled={savingAnswer[ans.id] || !inlineAnswers[ans.id]?.trim()}
                                      onClick={() => handleSaveInlineAnswer(job.id, application.id, ans.id)}
                                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                                    >
                                      {savingAnswer[ans.id] ? 'Saving…' : 'Save'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ marginTop: '0.35rem' }}>
                              <a href="/applications" style={{ color: '#b45309', fontWeight: 700, textDecoration: 'underline' }}>
                                Go to Applications to provide answers →
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inline feedback: Error */}
                      {feedback.error && (
                        <div style={{ marginTop: '0.5rem', background: '#fff1f2', border: '1px solid #fda4af', borderRadius: '6px', padding: '0.45rem 0.65rem', color: '#be123c', fontSize: '0.85rem' }}>
                          <strong>Failed:</strong> {feedback.error}
                        </div>
                      )}

                      {/* Inline feedback: Success */}
                      {feedback.success && (
                        <div style={{ marginTop: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.45rem 0.65rem', color: '#047857', fontSize: '0.85rem' }}>
                          {feedback.success}{' '}
                          <a href="/applications" style={{ color: '#059669', fontWeight: 700, textDecoration: 'underline' }}>
                            Go to Applications →
                          </a>
                        </div>
                      )}

                      {/* In-progress status message */}
                      {appStatus === 'APPROVED' && (
                        <div style={{ marginTop: '0.5rem', color: '#0369a1', fontSize: '0.85rem', fontWeight: 600 }}>
                          Opening application page in browser…
                        </div>
                      )}
                      {appStatus === 'FILLING' && (
                        <div style={{ marginTop: '0.5rem', color: '#6d28d9', fontSize: '0.85rem', fontWeight: 600 }}>
                          Filling form with verified candidate answers…
                        </div>
                      )}

                      {/* Part 3: Submitted confirmation + Post-Submission Audit Review */}
                      {isSubmitted && (
                        <div style={{ marginTop: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#065f46', fontSize: '0.85rem' }}>
                          <strong>Application Submitted Successfully!</strong>
                          {application?.submissionUrl && (
                            <div style={{ marginTop: '0.2rem' }}>
                              <a href={application.submissionUrl} target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: 600, textDecoration: 'underline' }}>
                                View submission confirmation ↗
                              </a>
                            </div>
                          )}

                          {/* Post-submission audit preview */}
                          {application && (application.screenshot || (application.filledData && Object.keys(application.filledData).length > 0)) && (
                            <details style={{ marginTop: '0.5rem', background: '#fff', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '0.4rem 0.6rem' }}>
                              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#15803d', fontSize: '0.82rem' }}>
                                🔍 View Submitted Form Audit (Screenshot &amp; Values)
                              </summary>
                              <div style={{ marginTop: '0.5rem' }}>
                                <FormRecheckReview
                                  screenshot={application.screenshot}
                                  filledData={application.filledData}
                                  onImageClick={setSelectedScreenshot}
                                  isSubmitted={true}
                                />
                              </div>
                            </details>
                          )}
                        </div>
                      )}

                      {/* Manual Intervention / Error */}
                      {isManualIntervention && (
                        <div style={{ marginTop: '0.5rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#9f1239', fontSize: '0.85rem' }}>
                          <strong>Manual Intervention Required:</strong> Automation paused safely.
                          <div style={{ marginTop: '0.35rem' }}>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRetry(job.id, application.id)}
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                            >
                              {feedback.retrying ? 'Retrying…' : 'Retry safely'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Gate 2 Inline Recheck Display (Screenshot & Field Map) */}
                      {isFilledRecheck && application && (
                        <div style={{ marginTop: '0.75rem' }}>
                          <FormRecheckReview
                            screenshot={application.screenshot}
                            filledData={application.filledData}
                            onImageClick={setSelectedScreenshot}
                            isSubmitted={false}
                          />
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
                            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: match.matchScore >= matchThreshold ? '#15803d' : '#b45309' }}>
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
                            {match.matchScore < matchThreshold && (
                              <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                                (Below {matchThreshold}% threshold)
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {/* Gate 2 Actions: If filled and awaiting recheck */}
                        {isFilledRecheck && application ? (
                          <>
                            <button
                              type="button"
                              className="btn-success"
                              disabled={isBusy}
                              onClick={() => handleConfirmSubmit(job.id, application.id)}
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', fontWeight: 700 }}
                              title="Approve filled fields and screenshot to submit application"
                            >
                              {feedback.submittingGate2 ? 'Submitting…' : 'Approve & Submit'}
                            </button>
                            <button
                              type="button"
                              className="danger"
                              disabled={isBusy}
                              onClick={() => handleRejectApplication(job.id, application.id)}
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                            >
                              {feedback.rejectingGate2 ? 'Rejecting…' : 'Reject'}
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Analyze Button */}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAnalyze(job.id)}
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                              title="Analyze role requirements and candidate fit"
                            >
                              {feedback.analyzing ? 'Analyzing…' : 'Analyze'}
                            </button>

                            {/* One-Click Apply Button */}
                            <button
                              type="button"
                              disabled={isBusy || !canPrepareOrApply}
                              title={applyTooltip}
                              onClick={() => handleApply(job)}
                              style={{
                                padding: '0.4rem 0.6rem',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                background: canPrepareOrApply ? '#059669' : '#94a3b8',
                              }}
                            >
                              {feedback.applying ? 'Applying…' : 'Apply'}
                            </button>

                            {/* Prepare Button */}
                            <button
                              type="button"
                              disabled={isBusy || !canPrepareOrApply}
                              title={prepareTooltip}
                              onClick={() => handlePrepare(job.id)}
                              style={{
                                padding: '0.35rem 0.6rem',
                                fontSize: '0.85rem',
                                background: canPrepareOrApply ? '#1668c9' : '#94a3b8',
                              }}
                            >
                              {feedback.preparing ? 'Preparing…' : 'Prepare'}
                            </button>

                            {/* GATE 1 Manual Review Link */}
                            {isAwaitingApproval && (
                              <a
                                href="/applications"
                                style={{
                                  display: 'block',
                                  textAlign: 'center',
                                  padding: '0.35rem 0.5rem',
                                  background: '#0284c7',
                                  color: '#fff',
                                  borderRadius: '4px',
                                  textDecoration: 'none',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                }}
                                title="Gate 1 Approval: Review tailored resume and truthful answers before approving"
                              >
                                Review &amp; Approve →
                              </a>
                            )}

                            {/* Reject Button */}
                            <button
                              type="button"
                              className="danger"
                              disabled={isBusy}
                              onClick={() => handleReject(job.id)}
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                              title="Reject job posting"
                            >
                              {feedback.rejecting ? 'Rejecting…' : 'Reject'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Full-size screenshot modal */}
      {selectedScreenshot && (
        <div
          onClick={() => setSelectedScreenshot(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <img
            src={selectedScreenshot}
            alt="Full size screenshot"
            style={{ maxWidth: '95%', maxHeight: '95%', borderRadius: '8px', background: '#fff' }}
          />
        </div>
      )}
    </section>
  );
}

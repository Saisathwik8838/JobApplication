/**
 * Shared component to render Gate 2 review information:
 * form screenshot preview and structured filled field map.
 * Supports both pre-submission recheck and post-submission audit verification.
 */
export function FormRecheckReview({ screenshot, filledData, onImageClick, isSubmitted = false }) {
  return (
    <div className="recheck-container" style={{ background: isSubmitted ? '#f0fdf4' : '#fffbeb', borderColor: isSubmitted ? '#86efac' : '#fde68a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.2rem' }}>{isSubmitted ? '✅' : '🔍'}</span>
        <strong style={{ color: isSubmitted ? '#166534' : '#92400e', fontSize: '1.05rem' }}>
          {isSubmitted ? 'Post-Submission Audit Verification' : 'Gate 2 Human Recheck: Form Fill Review'}
        </strong>
      </div>
      <p style={{ margin: '0 0 1rem 0', color: isSubmitted ? '#14532d' : '#78350f', fontSize: '0.9rem', lineHeight: 1.4 }}>
        {isSubmitted
          ? 'The application was submitted truthfully using your verified candidate profile. Below is the verified screenshot and field map captured during submission.'
          : 'The application form was auto-filled using your verified candidate data. Please inspect the screenshot and values table below. No submission will occur without your explicit confirmation.'}
      </p>

      {/* Screenshot view */}
      {screenshot ? (
        <div style={{ marginBottom: '1rem' }}>
          <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>Captured Form Screenshot:</strong>
          <div style={{ marginTop: '0.4rem' }}>
            <img
              src={screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`}
              alt="Application form screenshot"
              className="screenshot-preview"
              onClick={() => onImageClick?.(screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`)}
              title="Click to view full size"
            />
            <small style={{ color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
              (Click image to view full-resolution screenshot)
            </small>
          </div>
        </div>
      ) : (
        <p style={{ fontStyle: 'italic', color: '#64748b', margin: '0.5rem 0 1rem 0' }}>
          No screenshot captured for this form.
        </p>
      )}

      {/* Structured Form Values Table */}
      {filledData && Object.keys(filledData).length > 0 ? (
        <div style={{ marginBottom: '0.5rem' }}>
          <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>Form Fields &amp; Filled Values:</strong>
          <div className="table-wrap" style={{ marginTop: '0.4rem' }}>
            <table className="field-map-table">
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ width: '40%' }}>Field Name / Selector</th>
                  <th>Value Written</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(filledData).map(([key, val]) => (
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
        <p style={{ fontStyle: 'italic', color: '#64748b', margin: '0.5rem 0' }}>
          No structured fields recorded.
        </p>
      )}
    </div>
  );
}

/**
 * Shared component to render Gate 2 review information:
 * form screenshot preview and structured filled field map.
 */
export function FormRecheckReview({ screenshot, filledData, onImageClick }) {
  return (
    <div className="recheck-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.2rem' }}>🔍</span>
        <strong style={{ color: '#92400e', fontSize: '1.05rem' }}>
          Gate 2 Human Recheck: Form Fill Review
        </strong>
      </div>
      <p style={{ margin: '0 0 1rem 0', color: '#78350f', fontSize: '0.9rem', lineHeight: 1.4 }}>
        The application form was auto-filled using your verified candidate data. Please inspect the screenshot and values table below. <strong>No submission will occur without your explicit confirmation.</strong>
      </p>

      {/* Screenshot view */}
      {screenshot ? (
        <div style={{ marginBottom: '1rem' }}>
          <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>Captured Form Screenshot:</strong>
          <div style={{ marginTop: '0.4rem' }}>
            <img
              src={screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`}
              alt="Filled application form screenshot"
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

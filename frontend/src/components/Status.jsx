export function Status({ value }) { return <span className={`status status-${String(value).toLowerCase()}`}>{value.replaceAll('_', ' ')}</span>; }

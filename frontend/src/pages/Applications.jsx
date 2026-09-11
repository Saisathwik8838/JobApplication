import { useEffect, useState } from 'react';
import { get, post, patch } from '../api/client.js';
import { Status } from '../components/Status.jsx';

export function Applications() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [editingAnswers, setEditingAnswers] = useState({});

  const reload = () =>
    get('/api/applications')
      .then(setItems)
      .catch((e) => setError(e.message));

  useEffect(() => {
    reload();
  }, []);

  const saveAnswer = async (appId, answerId) => {
    const text = editingAnswers[answerId];
    if (!text || !text.trim()) return;
    try {
      await patch(`/api/applications/${appId}/answers/${answerId}`, { answer: text });
      setEditingAnswers((prev) => ({ ...prev, [answerId]: '' }));
      reload();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <section>
      <h2>Applications</h2>
      {error && <p role="alert">{error}</p>}
      {items.map((item) => (
        <article className="application" key={item.id}>
          <h3>
            {item.job.company} — {item.job.title}
          </h3>
          <Status value={item.status} />
          {item.error && <p>{item.error}</p>}
          <h4>Answers</h4>
          {item.answers.map((answer) => (
            <div key={answer.id} style={{ marginBottom: '0.75rem' }}>
              <p style={{ margin: '0.25rem 0' }}>
                <strong>{answer.question}</strong>
              </p>
              {answer.status === 'NEEDS_USER_INPUT' ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                  <input
                    type="text"
                    placeholder="Enter truthful answer…"
                    value={editingAnswers[answer.id] ?? ''}
                    onChange={(e) =>
                      setEditingAnswers((prev) => ({ ...prev, [answer.id]: e.target.value }))
                    }
                    style={{ padding: '0.35rem 0.5rem', flex: 1, maxWidth: '400px' }}
                  />
                  <button type="button" onClick={() => saveAnswer(item.id, answer.id)}>
                    Save answer
                  </button>
                  <Status value={answer.status} />
                </div>
              ) : (
                <p style={{ margin: '0.25rem 0' }}>
                  {answer.answer ?? 'Needs your input'} <Status value={answer.status} />
                </p>
              )}
            </div>
          ))}
          <button
            onClick={() =>
              post(`/api/applications/${item.id}/retry`)
                .then(reload)
                .catch((e) => setError(e.message))
            }
          >
            Retry safely
          </button>
        </article>
      ))}
    </section>
  );
}


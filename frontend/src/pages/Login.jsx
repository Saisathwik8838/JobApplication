import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { post, setAuth } from '../api/client.js';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await post('/api/auth/login', { email, password });
      setAuth(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      const res = await post('/api/auth/google', {
        idToken: credentialResponse.credential,
      });
      setAuth(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '420px', margin: '4rem auto', padding: '2rem', background: '#fff', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <h2 style={{ margin: '0 0 0.5rem 0', color: '#0f172a', fontSize: '1.6rem' }}>Sign In</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Welcome back to Job Application Agent</p>
      </div>

      {error && (
        <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label htmlFor="email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
            Email Address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem' }}
          />
        </div>

        <div>
          <label htmlFor="password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '0.75rem', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem' }}
        >
          {loading ? 'Signing In…' : 'Sign In'}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0', color: '#94a3b8' }}>
        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
        <span style={{ padding: '0 0.75rem', fontSize: '0.8rem', textTransform: 'uppercase' }}>or</span>
        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() => setError('Google sign-in was unsuccesful. Please try again.')}
          useOneTap={false}
        />
      </div>

      <p style={{ textAlign: 'center', marginTop: '1.75rem', marginBottom: 0, fontSize: '0.9rem', color: '#64748b' }}>
        Don&apos;t have an account?{' '}
        <Link to="/signup" style={{ color: '#0284c7', fontWeight: 600, textDecoration: 'none' }}>
          Create one
        </Link>
      </p>
    </div>
  );
}

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAuth, getStoredUser } from '../api/client.js';

export function Layout() {
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.025em' }}>
            Job Application Agent
          </h1>
          <nav>
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to="/jobs">Jobs</NavLink>
            <NavLink to="/applications">Applications</NavLink>
            <NavLink to="/profile">Profile</NavLink>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user && (
            <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
              👤 {user.name || user.email}
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: '#334155',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              borderRadius: '4px',
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </>
  );
}

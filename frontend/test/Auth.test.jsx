import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Login } from '../src/pages/Login.jsx';
import { Signup } from '../src/pages/Signup.jsx';
import { Layout } from '../src/components/Layout.jsx';
import * as client from '../src/api/client.js';

vi.mock('../src/api/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    post: vi.fn(),
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
    getStoredUser: vi.fn(),
  };
});

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => <button data-testid="google-login-btn">Mock Google Sign In</button>,
  GoogleOAuthProvider: ({ children }) => <div>{children}</div>,
}));

describe('Frontend Authentication Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits email and password to /api/auth/login and stores token on success', async () => {
    client.post.mockResolvedValueOnce({
      token: 'mock-jwt-token',
      user: { id: 'u1', email: 'user@example.com', name: 'Test User' },
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passInput = screen.getByLabelText(/Password/i);
    const submitBtn = screen.getByRole('button', { name: /^Sign In$/i });

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passInput, { target: { value: 'password123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'user@example.com',
        password: 'password123',
      });
      expect(client.setAuth).toHaveBeenCalledWith(
        'mock-jwt-token',
        expect.objectContaining({ email: 'user@example.com' })
      );
    });
  });

  it('submits registration to /api/auth/signup and stores token on success', async () => {
    client.post.mockResolvedValueOnce({
      token: 'mock-jwt-token-2',
      user: { id: 'u2', email: 'new@example.com', name: 'New User' },
    });

    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/Full Name/i);
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passInput = screen.getByLabelText(/Password/i);
    const submitBtn = screen.getByRole('button', { name: /Sign Up/i });

    fireEvent.change(nameInput, { target: { value: 'New User' } });
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
    fireEvent.change(passInput, { target: { value: 'password123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/api/auth/signup', {
        name: 'New User',
        email: 'new@example.com',
        password: 'password123',
      });
      expect(client.setAuth).toHaveBeenCalledWith(
        'mock-jwt-token-2',
        expect.objectContaining({ email: 'new@example.com' })
      );
    });
  });

  it('renders logged in user in Layout and triggers clearAuth on logout', async () => {
    client.getStoredUser.mockReturnValue({
      id: 'u1',
      name: 'Sai Sathwik',
      email: 'sathwik@example.com',
    });

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    expect(screen.getByText(/Sai Sathwik/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Profile/i })).toBeInTheDocument();

    const logoutBtn = screen.getByRole('button', { name: /Log out/i });
    fireEvent.click(logoutBtn);

    expect(client.clearAuth).toHaveBeenCalled();
  });
});

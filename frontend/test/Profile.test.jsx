import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Profile } from '../src/pages/Profile.jsx';
import * as client from '../src/api/client.js';

vi.mock('../src/api/client.js');

describe('Profile Page Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockProfileData = {
    user: {
      id: 'usr-1',
      email: 'sathwik@example.com',
      name: 'Sai Sathwik',
      role: 'USER',
    },
    profile: {
      identity: {
        name: 'Sai Sathwik',
        email: 'sathwik@example.com',
        phone: '+1 555 123 4567',
        location: 'Bengaluru, India',
        portfolioUrl: 'https://sathwik.dev',
        linkedInUrl: 'https://linkedin.com/in/saisathwik',
        githubUrl: 'https://github.com/Saisathwik8838',
      },
      experience: {
        level: 'mid',
        totalYears: 3,
      },
      preferences: {
        roles: ['Backend Engineer', 'Full Stack Engineer'],
        locations: ['Remote', 'Bengaluru'],
        minSalary: 120000,
        workAuthorization: 'Authorized to work',
      },
      skills: ['Node.js', 'PostgreSQL', 'TypeScript', 'React'],
    },
    masterResume: '# Sai Sathwik\n\nExperienced software engineer with 3+ years in Node.js and Postgres.',
  };

  it('fetches profile on mount and renders populated form fields', async () => {
    client.get.mockResolvedValueOnce(mockProfileData);

    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Sai Sathwik')).toBeInTheDocument();
      expect(screen.getByDisplayValue('sathwik@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Bengaluru, India')).toBeInTheDocument();
      expect(screen.getByLabelText(/Seniority Tier/i)).toHaveValue('mid');
      expect(screen.getByDisplayValue('3')).toBeInTheDocument();
      expect(screen.getByDisplayValue(/Backend Engineer, Full Stack Engineer/i)).toBeInTheDocument();
    });
  });

  it('submits updated profile and resume to PUT /api/profile', async () => {
    client.get.mockResolvedValueOnce(mockProfileData);
    client.put.mockResolvedValueOnce({
      profile: mockProfileData.profile,
      masterResume: mockProfileData.masterResume,
    });

    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Sai Sathwik')).toBeInTheDocument();
    });

    const yearsInput = screen.getByLabelText(/Total Years of Experience/i);
    fireEvent.change(yearsInput, { target: { value: '4' } });

    const saveBtn = screen.getByRole('button', { name: /Save Profile & Resume/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(client.put).toHaveBeenCalledWith(
        '/api/profile',
        expect.objectContaining({
          profile: expect.objectContaining({
            experience: expect.objectContaining({ totalYears: 4, level: 'mid' }),
          }),
        })
      );
      expect(screen.getByText(/Profile and Master Resume updated successfully!/i)).toBeInTheDocument();
    });
  });
});

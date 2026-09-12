import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Applications } from '../src/pages/Applications.jsx';
import * as client from '../src/api/client.js';

vi.mock('../src/api/client.js');

describe('Applications Page - Actionable Manual Intervention UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockAppManual = {
    id: 'app-captcha-1',
    jobId: 'job-1',
    status: 'MANUAL_INTERVENTION',
    error: 'CAPTCHA detected.',
    submissionUrl: 'https://careers.google.com/apply/step2',
    filledData: {
      'Full Name': 'Sai Sathwik',
      Email: 'sai@example.com',
      Phone: '+91 98765 43210',
    },
    updatedAt: new Date().toISOString(),
    job: {
      id: 'job-1',
      company: 'Google',
      title: 'Backend Software Engineer',
      url: 'https://careers.google.com/jobs/1',
      location: 'Hyderabad, India',
    },
    answers: [
      {
        id: 'ans-1',
        question: 'Years of Experience',
        answer: '3',
        status: 'READY',
      },
      {
        id: 'ans-2',
        question: 'Notice Period',
        answer: null,
        status: 'NEEDS_USER_INPUT',
      },
    ],
    events: [],
    approvals: [],
  };

  it('renders "Needs Your Help to Finish" with friendly copy and actionable hand-off', async () => {
    client.get.mockResolvedValueOnce([mockAppManual]);

    render(<Applications />);

    await waitFor(() => {
      // 1. Heading
      expect(screen.getByText(/Needs Your Help to Finish/i)).toBeInTheDocument();

      // 2. Plain-language error mapping
      expect(screen.getByText(/The site showed a CAPTCHA the agent cannot solve/i)).toBeInTheDocument();

      // 3. Primary CTA button
      const openBtn = screen.getByRole('link', { name: /Open Application & Finish It Yourself/i });
      expect(openBtn).toBeInTheDocument();
      expect(openBtn).toHaveAttribute('href', 'https://careers.google.com/apply/step2');

      // 4. "What the agent already knows" card
      expect(screen.getByText(/What the agent already knows/i)).toBeInTheDocument();
      expect(screen.getByText(/Sai Sathwik/i)).toBeInTheDocument();
      expect(screen.getByText(/Needs your input/i)).toBeInTheDocument();

      // 5. Two distinct action buttons
      expect(screen.getByRole('button', { name: /I finished it manually — mark as submitted/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry automated fill/i })).toBeInTheDocument();
    });
  });

  it('calls POST /api/applications/:id/mark-submitted when user clicks mark as submitted', async () => {
    client.get.mockResolvedValueOnce([mockAppManual]);
    client.post.mockResolvedValueOnce({ ...mockAppManual, status: 'SUBMITTED' });

    render(<Applications />);

    await waitFor(() => {
      expect(screen.getByText(/Needs Your Help to Finish/i)).toBeInTheDocument();
    });

    const markBtn = screen.getByRole('button', { name: /I finished it manually — mark as submitted/i });
    fireEvent.click(markBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith(
        '/api/applications/app-captcha-1/mark-submitted',
        expect.objectContaining({
          actor: 'candidate',
        })
      );
    });
  });
});

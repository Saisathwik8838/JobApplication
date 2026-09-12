import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Jobs } from '../src/pages/Jobs.jsx';
import * as client from '../src/api/client.js';

vi.mock('../src/api/client.js');

describe('Jobs Page Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockJobsData = {
    total: 3,
    matchThreshold: 75,
    items: [
      {
        id: 'job-unanalyzed',
        company: 'Alpha Tech',
        title: 'Software Engineer',
        url: 'https://example.com/alpha',
        location: 'Remote',
        source: 'remotive',
        status: 'DISCOVERED',
        matches: [],
        applications: [],
      },
      {
        id: 'job-low-match',
        company: 'Beta Media',
        title: 'Junior Web Dev',
        url: 'https://example.com/beta',
        location: 'Remote',
        source: 'remotive',
        status: 'MATCHED',
        matches: [
          {
            result: {
              matchScore: 60,
              recommendation: 'review',
              explanation: 'Partially matched; score below threshold.',
            },
          },
        ],
        applications: [],
      },
      {
        id: 'job-high-match',
        company: 'Gamma Systems',
        title: 'Senior Backend Engineer',
        url: 'https://example.com/gamma',
        location: 'Bengaluru',
        source: 'remotive',
        status: 'MATCHED',
        matches: [
          {
            result: {
              matchScore: 90,
              recommendation: 'apply',
              explanation: 'Excellent fit for Node.js experience.',
            },
          },
        ],
        applications: [],
      },
    ],
  };

  it('renders disabled Prepare and Apply buttons with correct tooltips when unanalyzed', async () => {
    client.get.mockResolvedValueOnce(mockJobsData);

    render(
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha Tech')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    const alphaRow = rows.find((r) => r.textContent.includes('Alpha Tech'));
    expect(alphaRow).toBeDefined();

    const buttons = alphaRow.querySelectorAll('button');
    const analyzeBtn = Array.from(buttons).find((b) => b.textContent === 'Analyze');
    const applyBtn = Array.from(buttons).find((b) => b.textContent === 'Apply');
    const prepareBtn = Array.from(buttons).find((b) => b.textContent === 'Prepare');

    expect(analyzeBtn).toBeEnabled();
    expect(applyBtn).toBeDisabled();
    expect(prepareBtn).toBeDisabled();

    expect(applyBtn).toHaveAttribute('title', 'Please analyze before applying.');
    expect(prepareBtn).toHaveAttribute('title', 'Please analyze before preparing.');
  });

  it('renders disabled Prepare and Apply buttons with correct threshold tooltip when score is below threshold', async () => {
    client.get.mockResolvedValueOnce(mockJobsData);

    render(
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Beta Media')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    const betaRow = rows.find((r) => r.textContent.includes('Beta Media'));
    expect(betaRow).toBeDefined();

    const buttons = betaRow.querySelectorAll('button');
    const applyBtn = Array.from(buttons).find((b) => b.textContent === 'Apply');
    const prepareBtn = Array.from(buttons).find((b) => b.textContent === 'Prepare');

    expect(applyBtn).toBeDisabled();
    expect(prepareBtn).toBeDisabled();

    expect(applyBtn).toHaveAttribute('title', 'Match score (60%) is below 75% threshold.');
    expect(prepareBtn).toHaveAttribute('title', 'Match score (60%) is below 75% threshold.');
  });

  it('enables Apply and Prepare buttons when match score is >= threshold', async () => {
    client.get.mockResolvedValueOnce(mockJobsData);

    render(
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gamma Systems')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    const gammaRow = rows.find((r) => r.textContent.includes('Gamma Systems'));
    expect(gammaRow).toBeDefined();

    const buttons = gammaRow.querySelectorAll('button');
    const applyBtn = Array.from(buttons).find((b) => b.textContent === 'Apply');
    const prepareBtn = Array.from(buttons).find((b) => b.textContent === 'Prepare');

    expect(applyBtn).toBeEnabled();
    expect(prepareBtn).toBeEnabled();
  });

  it('clicking Analyze fires POST /api/jobs/:id/analyze and updates row state', async () => {
    client.get.mockResolvedValueOnce(mockJobsData);
    client.post.mockResolvedValueOnce({
      match: {
        matchScore: 85,
        recommendation: 'apply',
        explanation: 'Good alignment.',
      },
    });
    // mock for reload()
    client.get.mockResolvedValueOnce(mockJobsData);

    render(
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha Tech')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    const alphaRow = rows.find((r) => r.textContent.includes('Alpha Tech'));
    const analyzeBtn = Array.from(alphaRow.querySelectorAll('button')).find((b) => b.textContent === 'Analyze');

    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/api/jobs/job-unanalyzed/analyze');
    });
  });

  it('clicking Prepare fires POST /api/jobs/:id/prepare and displays success feedback', async () => {
    client.get.mockResolvedValueOnce(mockJobsData);
    client.post.mockResolvedValueOnce({
      application: { id: 'app-gamma', status: 'AWAITING_APPROVAL' },
    });
    client.get.mockResolvedValueOnce(mockJobsData);

    render(
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gamma Systems')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    const gammaRow = rows.find((r) => r.textContent.includes('Gamma Systems'));
    const prepareBtn = Array.from(gammaRow.querySelectorAll('button')).find((b) => b.textContent === 'Prepare');

    fireEvent.click(prepareBtn);

    expect(client.post).toHaveBeenCalledWith('/api/jobs/job-high-match/prepare');

    await waitFor(() => {
      expect(screen.getByText(/Application prepared successfully!/i)).toBeInTheDocument();
    });
  });

  it('clicking Reject fires POST /api/jobs/:id/reject and handles errors cleanly', async () => {
    client.get.mockResolvedValueOnce(mockJobsData);
    client.post.mockRejectedValueOnce(new Error('Network error rejecting'));

    render(
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha Tech')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    const alphaRow = rows.find((r) => r.textContent.includes('Alpha Tech'));
    const rejectBtn = Array.from(alphaRow.querySelectorAll('button')).find((b) => b.textContent === 'Reject');

    fireEvent.click(rejectBtn);

    expect(client.post).toHaveBeenCalledWith('/api/jobs/job-unanalyzed/reject');

    await waitFor(() => {
      expect(screen.getAllByText(/Reject failed: Network error rejecting/i).length).toBeGreaterThan(0);
    });
  });

  it('One-click Apply: auto-prepares and approves Gate 1 for high match job', async () => {
    client.get.mockResolvedValueOnce(mockJobsData);
    // 1. prepare
    client.post.mockResolvedValueOnce({
      application: { id: 'app-gamma-1', status: 'AWAITING_APPROVAL' },
    });
    // 2. approve
    client.post.mockResolvedValueOnce({
      id: 'app-gamma-1',
      status: 'APPROVED',
    });
    client.get.mockResolvedValueOnce(mockJobsData);

    render(
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gamma Systems')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    const gammaRow = rows.find((r) => r.textContent.includes('Gamma Systems'));
    const applyBtn = Array.from(gammaRow.querySelectorAll('button')).find((b) => b.textContent === 'Apply');

    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/api/jobs/job-high-match/prepare');
      expect(client.post).toHaveBeenCalledWith('/api/jobs/job-high-match/approve', expect.objectContaining({
        actor: 'local-user',
      }));
    });
  });

  it('One-click Apply: halts and surfaces notice when prepare returns NEEDS_USER_INPUT', async () => {
    client.get.mockResolvedValueOnce(mockJobsData);
    // prepare returns NEEDS_USER_INPUT
    client.post.mockResolvedValueOnce({
      application: { id: 'app-gamma-2', status: 'NEEDS_USER_INPUT' },
    });
    client.get.mockResolvedValueOnce(mockJobsData);

    render(
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gamma Systems')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    const gammaRow = rows.find((r) => r.textContent.includes('Gamma Systems'));
    const applyBtn = Array.from(gammaRow.querySelectorAll('button')).find((b) => b.textContent === 'Apply');

    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/api/jobs/job-high-match/prepare');
      // Must NOT have called approve!
      expect(client.post).not.toHaveBeenCalledWith(
        '/api/jobs/job-high-match/approve',
        expect.anything()
      );
      expect(screen.getByText(/One or more application answers require truthful input/i)).toBeInTheDocument();
    });
  });

  it('renders Gate 2 Approve & Submit and Reject buttons when status is FILLED_AWAITING_RECHECK', async () => {
    const jobWithRecheck = {
      total: 1,
      matchThreshold: 75,
      items: [
        {
          id: 'job-recheck',
          company: 'Delta Corp',
          title: 'DevOps Engineer',
          url: 'https://example.com/delta',
          location: 'Remote',
          source: 'remotive',
          status: 'MATCHED',
          matches: [
            {
              result: {
                matchScore: 88,
                recommendation: 'apply',
                explanation: 'Great fit.',
              },
            },
          ],
          applications: [
            {
              id: 'app-recheck-1',
              status: 'FILLED_AWAITING_RECHECK',
              screenshot: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              filledData: { 'Full Name': 'Alex Morgan', Email: 'alex@example.com' },
            },
          ],
        },
      ],
    };

    client.get.mockResolvedValueOnce(jobWithRecheck);

    render(
      <MemoryRouter>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Delta Corp')).toBeInTheDocument();
    });

    const approveSubmitBtn = screen.getByRole('button', { name: /Approve & Submit/i });
    const rejectBtn = screen.getByRole('button', { name: /Reject/i });

    expect(approveSubmitBtn).toBeInTheDocument();
    expect(rejectBtn).toBeInTheDocument();

    // Verify screenshot & field values are displayed
    expect(screen.getByText(/Gate 2 Human Recheck: Form Fill Review/i)).toBeInTheDocument();
    expect(screen.getByText('Full Name')).toBeInTheDocument();
    expect(screen.getByText('Alex Morgan')).toBeInTheDocument();

    // Test clicking Approve & Submit calls /api/applications/:id/confirm-submit
    client.post.mockResolvedValueOnce({ id: 'app-recheck-1', status: 'RESUBMIT_APPROVED' });
    client.get.mockResolvedValueOnce(jobWithRecheck);

    fireEvent.click(approveSubmitBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith(
        '/api/applications/app-recheck-1/confirm-submit',
        expect.objectContaining({ actor: 'local-user' })
      );
    });
  });
});

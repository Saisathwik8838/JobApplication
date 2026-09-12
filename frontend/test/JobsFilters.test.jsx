import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Jobs } from '../src/pages/Jobs.jsx';
import * as client from '../src/api/client.js';

vi.mock('../src/api/client.js');

describe('Jobs Page Filtering & Inline Truth Answering Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockJobs = {
    total: 2,
    matchThreshold: 75,
    items: [
      {
        id: 'job-filter-1',
        company: 'Stripe Inc',
        title: 'Senior Backend Engineer',
        location: 'San Francisco, CA',
        source: 'greenhouse',
        status: 'MATCHED',
        url: 'https://stripe.com/jobs/1',
        matches: [{ result: { matchScore: 88, recommendation: 'apply' } }],
        applications: [],
      },
      {
        id: 'job-filter-2',
        company: 'Acme Corp',
        title: 'Frontend Developer',
        location: 'Remote',
        source: 'remotive',
        status: 'NEEDS_USER_INPUT',
        url: 'https://acme.com/jobs/2',
        matches: [{ result: { matchScore: 82, recommendation: 'apply' } }],
        applications: [
          {
            id: 'app-acme-1',
            status: 'NEEDS_USER_INPUT',
            answers: [
              {
                id: 'ans-salary',
                question: 'What is your desired salary?',
                answer: null,
                status: 'NEEDS_USER_INPUT',
              },
            ],
          },
        ],
      },
    ],
  };

  it('renders filter controls and queries backend with filter parameters', async () => {
    client.get.mockResolvedValue(mockJobs);

    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Stripe Inc')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    // Check filter inputs
    const companyInput = screen.getByLabelText(/Company/i);
    const titleInput = screen.getByLabelText(/Title \/ Keyword/i);
    const locationInput = screen.getByLabelText(/Location/i);
    const sourceSelect = screen.getByLabelText(/Source/i);
    const statusSelect = screen.getByLabelText(/Status/i);
    const scoreInput = screen.getByLabelText(/Min Match Score/i);

    expect(companyInput).toBeInTheDocument();
    expect(titleInput).toBeInTheDocument();
    expect(locationInput).toBeInTheDocument();
    expect(sourceSelect).toBeInTheDocument();
    expect(statusSelect).toBeInTheDocument();
    expect(scoreInput).toBeInTheDocument();

    // Change source select
    fireEvent.change(sourceSelect, { target: { value: 'greenhouse' } });

    await waitFor(() => {
      expect(client.get).toHaveBeenCalledWith(expect.stringContaining('source=greenhouse'));
    });

    // Reset filters button should appear
    const resetBtn = screen.getByRole('button', { name: /Reset Filters/i });
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);
    await waitFor(() => {
      expect(sourceSelect.value).toBe('');
    });
  });

  it('displays inline question and handles saving truthful answer for NEEDS_USER_INPUT', async () => {
    client.get.mockResolvedValue(mockJobs);
    client.patch.mockResolvedValueOnce({
      id: 'ans-salary',
      status: 'RESOLVED',
      answer: '$130,000',
    });

    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/What is your desired salary\?/i)).toBeInTheDocument();
    });

    const answerInput = screen.getByPlaceholderText(/Provide truthful answer…/i);
    const saveBtn = screen.getByRole('button', { name: /Save/i });

    expect(answerInput).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();

    // Type truthful answer
    fireEvent.change(answerInput, { target: { value: '$130,000' } });
    expect(saveBtn).toBeEnabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(client.patch).toHaveBeenCalledWith(
        '/api/applications/app-acme-1/answers/ans-salary',
        { answer: '$130,000' }
      );
    });
  });

  it('displays post-submission audit verification details when status is SUBMITTED', async () => {
    const submittedJob = {
      total: 1,
      matchThreshold: 75,
      items: [
        {
          id: 'job-submitted-1',
          company: 'Netflix',
          title: 'Senior Systems Engineer',
          location: 'Los Gatos, CA',
          source: 'lever',
          status: 'SUBMITTED',
          url: 'https://jobs.netflix.com/1',
          matches: [{ result: { matchScore: 92, recommendation: 'apply' } }],
          applications: [
            {
              id: 'app-netflix-1',
              status: 'SUBMITTED',
              submissionUrl: 'https://jobs.netflix.com/confirm/12345',
              screenshot: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              filledData: { 'Full Name': 'Jordan Lee', 'Email': 'jordan@example.com' },
            },
          ],
        },
      ],
    };

    client.get.mockResolvedValue(submittedJob);

    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <Jobs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument();
    });

    expect(screen.getByText(/Application Submitted Successfully!/i)).toBeInTheDocument();
    expect(screen.getByText(/View submission confirmation ↗/i)).toHaveAttribute(
      'href',
      'https://jobs.netflix.com/confirm/12345'
    );

    // Verify audit details summary exists
    expect(screen.getByText(/View Submitted Form Audit/i)).toBeInTheDocument();
  });
});

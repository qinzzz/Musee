import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountUsageMeter from './AccountUsageMeter';

const { mockFetchAccountUsage } = vi.hoisted(() => ({
  mockFetchAccountUsage: vi.fn(),
}));

vi.mock('../../api/account', () => ({
  fetchAccountUsage: mockFetchAccountUsage,
}));

function renderMeter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountUsageMeter userId="user-1" />
    </QueryClientProvider>,
  );
}

function quotaEntry(overrides = {}) {
  return {
    limit: 10,
    used: 3,
    period: 'day',
    resets_at: '2026-07-08T00:00:00Z',
    warning: false,
    exceeded: false,
    on_exceed: 'block',
    ...overrides,
  };
}

describe('AccountUsageMeter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders meters for metered quotas and an alert when a limit is reached', async () => {
    mockFetchAccountUsage.mockResolvedValue({
      tier: 'free',
      quotas: {
        artwork_uploads: quotaEntry({ used: 10, exceeded: true }),
        stored_artworks: quotaEntry({ limit: 20, used: 5, period: 'lifetime', resets_at: null }),
        tokens: quotaEntry({ limit: 500000, used: 100, period: 'month', on_exceed: 'warn' }),
      },
    });

    renderMeter();

    await waitFor(() => {
      expect(screen.getByText('10/10')).toBeTruthy();
    });
    expect(screen.getByText('Uploads today')).toBeTruthy();
    expect(screen.getByText('Artworks stored')).toBeTruthy();
    expect(screen.getByText('5/20')).toBeTruthy();
    expect(screen.getByText(/Limit reached/)).toBeTruthy();
  });

  it('shows the unlimited state when nothing is metered', async () => {
    mockFetchAccountUsage.mockResolvedValue({
      tier: 'unlimited',
      quotas: {
        artwork_uploads: quotaEntry({ limit: null }),
        stored_artworks: quotaEntry({ limit: null }),
        tokens: quotaEntry({ limit: null }),
      },
    });

    renderMeter();

    await waitFor(() => {
      expect(screen.getByText('Unlimited plan')).toBeTruthy();
    });
  });
});

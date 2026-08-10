import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SessionThreadStatus from './SessionThreadStatus';

describe('SessionThreadStatus', () => {
  it('shows an active status with a lightweight activity dot', () => {
    const { container } = render(<SessionThreadStatus message="Adding artworks…" tone="active" />);

    expect(screen.getByRole('status').textContent).toBe('Adding artworks…');
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows a failed status without activity decoration or a retry action', () => {
    const { container } = render(<SessionThreadStatus message="Analysis failed" tone="failed" />);

    expect(screen.getByRole('status').textContent).toBe('Analysis failed');
    expect(container.querySelector('svg.text-red-500')).not.toBeNull();
    expect(container.querySelector('.animate-pulse')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

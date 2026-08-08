import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SessionProcessingIndicator from './SessionProcessingIndicator';

describe('SessionProcessingIndicator', () => {
  it('announces active state without an action', () => {
    render(<SessionProcessingIndicator state={{ kind: 'writing_response', responseId: 'response-1' }} />);

    expect(screen.getByRole('status').textContent).toBe('Writing response…');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a plain failure message without a retry CTA', () => {
    render(
      <SessionProcessingIndicator
        state={{ kind: 'failed', responseId: 'response-1', message: 'Response interrupted. Please try again.' }}
      />,
    );

    expect(screen.getByRole('status').textContent).toBe('Response interrupted. Please try again.');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SessionMessageMarkdown from './SessionMessageMarkdown';

describe('SessionMessageMarkdown', () => {
  it('restores Markdown styling from persisted session text', () => {
    const { container } = render(
      <SessionMessageMarkdown>{'A **bold** idea with *emphasis*.\n\n- First\n- Second'}</SessionMessageMarkdown>,
    );

    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('emphasis').tagName).toBe('EM');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('does not render raw HTML from model output', () => {
    const { container } = render(
      <SessionMessageMarkdown>{'<script>window.alert("unsafe")</script>'}</SessionMessageMarkdown>,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/window\.alert/)).toBeTruthy();
  });
});

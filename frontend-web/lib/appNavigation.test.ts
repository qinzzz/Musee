import { describe, expect, it } from 'vitest';

import { getInitialNavigationState, stateToPath } from './appNavigation';

describe('museum collection navigation', () => {
  it('recognizes the museums route as a collection tab', () => {
    expect(getInitialNavigationState('/museums')).toMatchObject({
      activeTab: 'collect',
      collectTab: 'museums',
    });
  });

  it('maps the museums tab back to its stable route', () => {
    expect(stateToPath('collect', 'museums')).toBe('/museums');
  });
});

import React from 'react';
import {
  getSessionProcessingLabel,
  type SessionProcessingState,
} from '../lib/sessionProcessingState';
import SessionThreadStatus from './SessionThreadStatus';

type SessionProcessingIndicatorProps = {
  state: SessionProcessingState;
};

export default function SessionProcessingIndicator({ state }: SessionProcessingIndicatorProps) {
  const label = getSessionProcessingLabel(state);
  if (!label) return null;

  return <SessionThreadStatus message={label} tone={state.kind === 'failed' ? 'failed' : 'active'} />;
}

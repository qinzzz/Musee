import React, { useState } from 'react';
import SessionThreadStatus, {
  type SessionThreadStatusTone,
} from '../session/components/SessionThreadStatus';
import { SESSION_FAILURE_MESSAGES } from '../session/lib/sessionFailureStatus';

const STATUS_PREVIEWS: ReadonlyArray<{
  id: string;
  label: string;
  message: string;
  tone: SessionThreadStatusTone;
}> = [
  { id: 'adding', label: 'Uploading', message: 'Adding artworks…', tone: 'active' },
  { id: 'analyzing', label: 'Analysis in progress', message: 'Analyzing artworks…', tone: 'active' },
  { id: 'writing', label: 'Response in progress', message: 'Writing response…', tone: 'active' },
  {
    id: 'network',
    label: 'Network failure',
    message: SESSION_FAILURE_MESSAGES.network,
    tone: 'failed',
  },
  {
    id: 'timeout',
    label: 'Upload timeout',
    message: SESSION_FAILURE_MESSAGES.timeout,
    tone: 'failed',
  },
  {
    id: 'upload',
    label: 'Other upload failure',
    message: SESSION_FAILURE_MESSAGES.upload,
    tone: 'failed',
  },
  { id: 'analysis', label: 'Analysis failure', message: SESSION_FAILURE_MESSAGES.analysis, tone: 'failed' },
] as const;

export default function SessionStatusPreviewPage() {
  const [selectedId, setSelectedId] = useState('network');
  const selected = STATUS_PREVIEWS.find((status) => status.id === selectedId) || STATUS_PREVIEWS[0];

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-900 sm:px-8 sm:py-12">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex min-h-[720px] flex-col overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-sm">
          <header className="border-b border-neutral-200 px-6 py-5 sm:px-10">
            <p className="text-[18px] font-semibold">Session status preview</p>
          </header>

          <div className="flex flex-1 flex-col px-6 py-8 sm:px-10">
            <div className="ml-auto max-w-[82%] rounded-[28px] border border-neutral-200 bg-neutral-50 px-6 py-4 text-[16px] leading-7 shadow-sm sm:max-w-[70%]">
              What do you notice about this artwork?
            </div>

            <div className="mt-auto border-t border-neutral-100 pt-6">
              <SessionThreadStatus message={selected.message} tone={selected.tone} />
            </div>
          </div>

          <div className="border-t border-neutral-200 p-4 sm:p-6">
            <div className="flex h-14 items-center rounded-full border border-neutral-200 bg-neutral-50 px-5 text-[15px] text-neutral-400">
              Ask Musee
            </div>
          </div>
        </section>

        <aside className="rounded-[24px] border border-neutral-200 bg-white p-4 shadow-sm lg:self-start">
          <p className="px-2 pb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-neutral-500">
            Preview state
          </p>
          <div className="space-y-1">
            {STATUS_PREVIEWS.map((status) => {
              const isSelected = status.id === selected.id;
              return (
                <button
                  key={status.id}
                  type="button"
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors ${
                    isSelected ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                  onClick={() => setSelectedId(status.id)}
                >
                  {status.label}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </main>
  );
}

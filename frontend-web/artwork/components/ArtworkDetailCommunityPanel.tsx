import type React from 'react';

import type { CommunityData } from '../../api/artworks';

type Props = {
  community: CommunityData | null;
  userId?: string;
  hasNavigationFooter: boolean;
  commentInput: string;
  isPublishing: boolean;
  onCommentInputChange: (value: string) => void;
  onDeleteComment: (commentId: string) => Promise<void> | void;
  onPublishComment: () => Promise<void> | void;
};

export default function ArtworkDetailCommunityPanel({
  community,
  userId,
  hasNavigationFooter,
  commentInput,
  isPublishing,
  onCommentInputChange,
  onDeleteComment,
  onPublishComment,
}: Props) {
  return (
    <div className={`animate-in fade-in duration-200 p-5 sm:flex-1 sm:min-h-0 sm:overflow-y-auto sm:p-7 ${hasNavigationFooter ? 'pb-28 sm:pb-32' : 'pb-20 sm:pb-7'}`}>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-neutral-400">Community</p>
        {community?.entity && community.entity.instance_count > 0 && (
          <span className="text-[9px] text-neutral-400">
            Seen by {community.entity.instance_count} {community.entity.instance_count === 1 ? 'person' : 'people'}
          </span>
        )}
      </div>

      {community === null && (
        <p className="text-[12px] italic text-neutral-400">Loading…</p>
      )}

      {community !== null && community.comments.length === 0 && !userId && (
        <p className="text-[12px] italic text-neutral-400">No community notes yet.</p>
      )}

      {community !== null && community.comments.length > 0 && (
        <div className="mb-4 space-y-3">
          {community.comments.map((comment) => {
            const avatarColors = ['#d4b896', '#a8c4b8', '#b8aed4', '#c4b8a8', '#a8b8c4', '#d4a8b8', '#b8d4a8', '#c4a8d4'];
            let hash = 0;
            for (let index = 0; index < comment.user_id.length; index += 1) {
              hash = (hash * 31 + comment.user_id.charCodeAt(index)) >>> 0;
            }
            const avatarColor = avatarColors[hash % avatarColors.length];

            return (
              <div key={comment.id} className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: avatarColor }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] leading-relaxed text-neutral-700">{comment.text}</p>
                </div>
                {userId && comment.user_id === userId && (
                  <button
                    onClick={() => void onDeleteComment(comment.id)}
                    className="mt-0.5 shrink-0 text-neutral-300 transition-colors hover:text-red-400"
                    title="Delete comment"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {userId && (
        <div className="flex items-center gap-2">
          <input
            value={commentInput}
            onChange={(event) => onCommentInputChange(event.target.value)}
            onKeyDown={async (event) => {
              if (event.key === 'Enter' && commentInput.trim() && !isPublishing) {
                event.preventDefault();
                await onPublishComment();
              }
            }}
            placeholder="Share your thought publicly…"
            className="flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-700 outline-none transition-colors placeholder-neutral-300 focus:border-neutral-400"
          />
          <button
            disabled={!commentInput.trim() || isPublishing}
            onClick={() => void onPublishComment()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-opacity disabled:opacity-30"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';

import {
  deleteCommunityComment,
  fetchCommunity,
  publishComment,
  type CommunityData,
} from '../../api/chat';

type UseArtworkCommunityOptions = {
  artworkId?: string;
  isAnalyzing?: boolean;
  userId?: string;
};

export function useArtworkCommunity({
  artworkId,
  isAnalyzing,
  userId,
}: UseArtworkCommunityOptions) {
  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    if (!artworkId || isAnalyzing) return;

    fetchCommunity(artworkId)
      .then((data) => setCommunity(data))
      .catch(() => setCommunity({ entity: null, comments: [] }));
  }, [artworkId, isAnalyzing]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!artworkId || !userId) return;

    await deleteCommunityComment(artworkId, commentId, userId);
    setCommunity((prev) => (
      prev
        ? { ...prev, comments: prev.comments.filter((comment) => comment.id !== commentId) }
        : prev
    ));
  }, [artworkId, userId]);

  const handlePublishComment = useCallback(async () => {
    if (!artworkId || !userId || !commentInput.trim() || isPublishing) return;

    setIsPublishing(true);
    try {
      const comment = await publishComment(artworkId, userId, commentInput.trim());
      setCommunity((prev) => (prev ? { ...prev, comments: [comment, ...prev.comments] } : prev));
      setCommentInput('');
    } finally {
      setIsPublishing(false);
    }
  }, [artworkId, commentInput, isPublishing, userId]);

  return {
    community,
    commentInput,
    setCommentInput,
    isPublishing,
    handleDeleteComment,
    handlePublishComment,
  };
}

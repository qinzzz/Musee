import { apiClient } from './apiClient';
import { userApiService } from './userApi';

export interface Tag {
    id: string;
    name: string;
    user_id: string;
    created_at: string;
}

class TagApiService {
    /**
     * Get all tags for the current user
     */
    async getTags(): Promise<Tag[]> {
        const userId = await userApiService.getUserId();
        return apiClient.get<Tag[]>('/api/tags', { user_id: userId });
    }

    /**
     * Create a new tag
     */
    async createTag(name: string): Promise<Tag> {
        const userId = await userApiService.getUserId();
        return apiClient.post<Tag>(`/api/tags?name=${encodeURIComponent(name)}&user_id=${userId}`);
    }

    /**
     * Delete a tag
     */
    async deleteTag(tagId: string): Promise<void> {
        return apiClient.delete(`/api/tags/${tagId}`);
    }

    /**
     * Associate a tag with an artwork
     */
    async addTagToArtwork(artworkId: string, tagId: string): Promise<void> {
        return apiClient.post(`/api/saved-artworks/${artworkId}/tags/${tagId}`);
    }

    /**
     * Remove a tag from an artwork
     */
    async removeTagFromArtwork(artworkId: string, tagId: string): Promise<void> {
        return apiClient.delete(`/api/saved-artworks/${artworkId}/tags/${tagId}`);
    }
}

export const tagApiService = new TagApiService();

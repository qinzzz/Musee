import { apiClient } from './apiClient';
import { userApiService } from './userApi';
import { SavedArtwork } from './savedArtworkApi';

export interface Collection {
    id: string;
    name: string;
    description?: string;
    user_id: string;
    artwork_count: number;
    artworks?: SavedArtwork[];
    created_at: string;
    updated_at: string;
}

interface CreateCollectionParams {
    name: string;
    description?: string;
    artwork_ids?: string[];
}

interface UpdateCollectionParams {
    name?: string;
    description?: string;
    artwork_ids?: string[];
}

class CollectionApiService {
    /**
     * Create a new collection
     */
    async createCollection(params: CreateCollectionParams): Promise<Collection> {
        const userId = await userApiService.getUserId();
        return apiClient.post<Collection>('/api/collections', {
            ...params,
            user_id: userId,
        });
    }

    /**
     * Get all collections for this user
     */
    async getCollections(): Promise<Collection[]> {
        const userId = await userApiService.getUserId();
        return apiClient.get<Collection[]>('/api/collections', { user_id: userId });
    }

    /**
     * Get a specific collection with artworks
     */
    async getCollection(collectionId: string): Promise<Collection> {
        return apiClient.get<Collection>(`/api/collections/${collectionId}`);
    }

    /**
     * Update a collection
     */
    async updateCollection(collectionId: string, params: UpdateCollectionParams): Promise<Collection> {
        return apiClient.put<Collection>(`/api/collections/${collectionId}`, params);
    }

    /**
     * Delete a collection
     */
    async deleteCollection(collectionId: string): Promise<void> {
        return apiClient.delete(`/api/collections/${collectionId}`);
    }

    /**
     * Add an artwork to a collection
     */
    async addArtworkToCollection(collectionId: string, artworkId: string): Promise<Collection> {
        const collection = await this.getCollection(collectionId);
        const currentIds = collection.artworks?.map(a => a.id) || [];

        if (currentIds.includes(artworkId)) {
            return collection;
        }

        return this.updateCollection(collectionId, {
            artwork_ids: [...currentIds, artworkId],
        });
    }

    /**
     * Remove an artwork from a collection
     */
    async removeArtworkFromCollection(collectionId: string, artworkId: string): Promise<Collection> {
        const collection = await this.getCollection(collectionId);
        const currentIds = collection.artworks?.map(a => a.id) || [];

        if (!currentIds.includes(artworkId)) {
            return collection;
        }

        return this.updateCollection(collectionId, {
            artwork_ids: currentIds.filter(id => id !== artworkId),
        });
    }
}

export const collectionApiService = new CollectionApiService();

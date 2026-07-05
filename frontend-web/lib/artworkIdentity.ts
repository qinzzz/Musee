type ArtworkIdentityLike = {
  id: string;
  clientId?: string;
  artworkId?: string;
};

export function getArtworkClientId(item: ArtworkIdentityLike): string {
  return item.clientId || item.id;
}

export function getArtworkServerId(item: ArtworkIdentityLike): string {
  return item.artworkId || item.id;
}

const scrollOffsets = new Map<string, number>();

export function getArtworkLibraryScrollOffset(userId: string): number {
  return scrollOffsets.get(userId) ?? 0;
}

export function setArtworkLibraryScrollOffset(userId: string, offset: number): void {
  scrollOffsets.set(userId, Math.max(0, offset));
}

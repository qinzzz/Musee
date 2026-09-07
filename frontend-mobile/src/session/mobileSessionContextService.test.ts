import { describe, expect, it, vi } from 'vitest';
import { ApiHttpError } from '@musee/client-core';
import { createMobileSessionContextService, type SessionContextInput } from './mobileSessionContextService';
import { createMobileSessionService } from './mobileSessionService';
import type { MobileSessionTransport } from './mobileSessionTransport';
import { mapPendingMobileArtwork } from '../library/mobileArtworkLibraryService';
import type { MobileArtworkLibraryService } from '../library/mobileArtworkLibraryService';
import type { PendingArtworkUpload, NativeImageAsset } from '../capture/types';

const saved: PendingArtworkUpload = {
  id: 'new', photoUri: 'photo', thumbnailUri: null, resolvedImageUri: 'photo',
  resolvedThumbnailUri: 'photo', cacheKey: 'new', thumbnailCacheKey: 'new',
  analysisStatus: 'pending', artistName: '', artworkName: '',
};
const asset: NativeImageAsset = { uri: 'local', fileName: 'photo.jpg', mimeType: 'image/jpeg', width: 10, height: 10, source: 'library' };
function setup() {
  const existing = { ...mapPendingMobileArtwork(saved), id: 'existing', analysisStatus: 'analyzed' as const };
  let analyzed = false;
  const library = {
    fetchArtwork: vi.fn(async (id: string) => id === 'existing' ? existing : {
      ...mapPendingMobileArtwork(saved), analysisStatus: analyzed ? 'analyzed' as const : 'pending' as const,
    }),
  } as unknown as MobileArtworkLibraryService;
  const upload = { uploadArtwork: vi.fn(async () => saved) };
  const analysis = { analyzeArtwork: vi.fn(async () => { analyzed = true; return { ...saved, analysisStatus: 'analyzed' as const, analysis: 'result', tags: [] }; }) };
  const transport = {
    startArtworkSession: vi.fn(async ({ sessionId }: { sessionId: string }) => ({ id: sessionId, title: 'new', user_id: 'user' })),
    attachArtwork: vi.fn(async () => {}), appendEvents: vi.fn(async () => {}),
  } as unknown as MobileSessionTransport;
  let count = 0;
  const sessions = createMobileSessionService({ transport, createId: (prefix) => `${prefix}-${++count}` });
  const service = createMobileSessionContextService({ library, upload, analysis, sessions });
  const inputs: SessionContextInput[] = [{ kind: 'library', artwork: existing }, { kind: 'local', asset }];
  return { service, inputs, upload, analysis, transport, library };
}

describe('mobile Session context service', () => {
  it('creates one mixed turn, one pending response, and analyzes only new input', async () => {
    const { service, inputs, upload, analysis, transport } = setup();
    const result = await service.createTurn(inputs, 'user', 'compare', null).run();
    expect(result.ready).toBe(true);
    expect(result.committed?.attempt.userEvent).toMatchObject({
      artwork_ids: ['existing', 'new'], content: 'compare',
      payload: { artworks: [{ artwork_id: 'existing', source: 'library' }, { artwork_id: 'new', source: 'upload' }] },
    });
    expect(upload.uploadArtwork).toHaveBeenCalledTimes(1);
    expect(analysis.analyzeArtwork).toHaveBeenCalledTimes(1);
    expect(transport.appendEvents).toHaveBeenCalledTimes(1);
  });

  it('retries an atomic turn write with stable event IDs without repeating uploads or links', async () => {
    const { service, inputs, transport, upload } = setup();
    vi.mocked(transport.appendEvents).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const job = service.createTurn(inputs, 'user', '', null);
    await expect(job.run()).rejects.toThrow('offline');
    expect((await job.run()).ready).toBe(true);
    expect(upload.uploadArtwork).toHaveBeenCalledTimes(1);
    expect(transport.startArtworkSession).toHaveBeenCalledTimes(1);
    expect(transport.attachArtwork).toHaveBeenCalledTimes(1);
    const writes = vi.mocked(transport.appendEvents).mock.calls;
    expect(writes[0][1]).toHaveLength(2);
    expect(writes[0][1].map((event) => event.id)).toEqual(writes[1][1].map((event) => event.id));
  });
  it('adds mixed context to an existing Session without starting another one', async () => {
    const { service, inputs, transport } = setup();
    const result = await service.createTurn(inputs, 'user', '', {
      id: 'current', title: 'Current', user_id: 'user',
    }).run();
    expect(result.ready).toBe(true);
    expect(result.committed?.attempt.sessionId).toBe('current');
    expect(transport.startArtworkSession).not.toHaveBeenCalled();
    expect(transport.attachArtwork).toHaveBeenCalledTimes(2);
  });

  it('retries failed enrichment without resaving the turn or uploading again', async () => {
    const { service, inputs, transport, analysis, upload } = setup();
    vi.mocked(analysis.analyzeArtwork).mockRejectedValueOnce(new Error('analysis failed'));
    const job = service.createTurn(inputs, 'user', '', null);
    const failed = await job.run();
    expect(failed.ready).toBe(false);
    expect(failed.committed).toBeDefined();
    const failedEntry = failed.entries.find((entry) => entry.status === 'failed')!;
    expect((await job.run(undefined, failedEntry.id)).ready).toBe(true);
    expect(upload.uploadArtwork).toHaveBeenCalledTimes(1);
    expect(transport.appendEvents).toHaveBeenCalledTimes(1);
  });

  it('restores enrichment from durable IDs and does not repeat completed analysis', async () => {
    const { service, analysis } = setup();
    await service.recoverTurn(['existing', 'new', 'new']);
    await service.recoverTurn(['existing', 'new']);
    expect(analysis.analyzeArtwork).toHaveBeenCalledTimes(1);
  });

  it('rejects a deleted reference before committing a turn', async () => {
    const { service, inputs, library, transport } = setup();
    const record = await library.fetchArtwork('existing');
    vi.mocked(library.fetchArtwork).mockResolvedValueOnce({ ...record, isDeleted: true });
    const result = await service.createTurn([inputs[0]], 'user', '', null).run();
    expect(result.ready).toBe(false);
    expect(result.entries[0].failureStage).toBe('resolve');
    expect(transport.startArtworkSession).not.toHaveBeenCalled();
    expect(transport.appendEvents).not.toHaveBeenCalled();
  });

  it('allows deleted references during recovery but propagates network failures', async () => {
    const { service, library } = setup();
    vi.mocked(library.fetchArtwork).mockRejectedValueOnce(new ApiHttpError('deleted', 404));
    await expect(service.recoverTurn(['deleted', 'existing'])).resolves.toHaveLength(1);
    vi.mocked(library.fetchArtwork).mockRejectedValueOnce(new ApiHttpError('unavailable', 503));
    await expect(service.recoverTurn(['existing'])).rejects.toThrow('unavailable');
  });

});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { MobileArtworkRecord } from '../types';

vi.mock('react-native', async () => {
  const React = await import('react');
  const Box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return {
    View: Box, Modal: Box, ScrollView: Box, KeyboardAvoidingView: Box, Text: Box,
    Keyboard: { dismiss: vi.fn() },
    Platform: { OS: 'ios' }, StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
    Pressable: ({ children, onPress, disabled, accessibilityLabel }: any) => React.createElement('button',
      { onClick: onPress, disabled, 'aria-label': accessibilityLabel }, children),
    TextInput: ({ value, onChangeText, accessibilityLabel, editable }: any) => React.createElement('input',
      { value, 'aria-label': accessibilityLabel, disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText(e.target.value) }),
  };
});
vi.mock('../../ui/components/Screen', () => ({ Screen: ({ children }: any) => <div>{children}</div> }));
vi.mock('../../ui/components/MuseeButton', () => ({ MuseeButton: ({ label, onPress, disabled, loading }: any) =>
  <button disabled={disabled || loading} onClick={onPress}>{label}</button> }));
const places = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../../platform/places/applePlaces', () => ({ applePlaces: places }));
vi.mock('../../platform/places/ApplePlacesMap', () => ({ ApplePlacesMap: ({ places, selectedId, disabled, onSelect }: any) =>
  <div data-testid="map" data-selected={selectedId}>
    {places.map((place: any) => <button key={place.id} disabled={disabled} onClick={() => onSelect(place.id)}>
      Pin {place.name}
    </button>)}
  </div> }));
import { ArtworkLocationSheet } from './ArtworkLocationSheet';

const artwork = { id: 'art', museumName: 'Old Museum' } as MobileArtworkRecord;
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('removal is only committed on Save, and Cancel does not write', () => {
  const onSave = vi.fn(); const onClose = vi.fn();
  render(<ArtworkLocationSheet artwork={artwork} onSave={onSave} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove location' }));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancel'));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});

it('keeps a manual edit after failure and prevents duplicate submissions', async () => {
  places.search.mockResolvedValue([]);
  const onSave = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(artwork);
  const onClose = vi.fn();
  render(<ArtworkLocationSheet artwork={artwork} onSave={onSave} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'A café' } });
  fireEvent.click(await screen.findByText('Add a place name'));
  fireEvent.change(screen.getByLabelText('Your place name'), { target: { value: 'A café' } });
  fireEvent.click(screen.getByText('Save location'));
  fireEvent.click(screen.getByText('Save location'));
  await screen.findByText('Could not save the location. Your selection is still here.');
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Your place name') as HTMLInputElement).value).toBe('A café');
  fireEvent.click(screen.getByText('Save location'));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(onSave).toHaveBeenLastCalledWith({ status: 'selected', source: 'manual', name: 'A café' });
});

it('saves the selected Apple identifier and transient matching evidence', async () => {
  places.search.mockResolvedValue([{ id: 'apple-id', name: 'New Museum', address: 'Paris',
    category: 'Museum', latitude: 1, longitude: 2 }]);
  const onSave = vi.fn().mockResolvedValue(artwork);
  render(<ArtworkLocationSheet artwork={artwork} onSave={onSave} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'New Museum' } });
  fireEvent.click(await screen.findByRole('button', { name: 'New Museum, Paris, Museum' }));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Save location'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ status: 'selected', source: 'apple_maps',
    place_id: 'apple-id', match_hint: { name: 'New Museum', latitude: 1, longitude: 2 } }));
});

it('synchronizes map and list selection, saves only on confirmation, and clears selection on a new search', async () => {
  const first = { id: 'museum', name: 'Museum', address: 'Paris', category: 'Museum', latitude: 1, longitude: 2 };
  const second = { ...first, id: 'cafe', name: 'Café', category: 'Cafe' };
  places.search.mockResolvedValue([first, second]);
  const onSave = vi.fn().mockResolvedValue(artwork);
  render(<ArtworkLocationSheet artwork={artwork} onSave={onSave} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'Paris' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Pin Museum' }));
  expect(screen.getByTestId('map').getAttribute('data-selected')).toBe('museum');
  fireEvent.click(screen.getByRole('button', { name: 'Café, Paris, Cafe' }));
  expect(screen.getByTestId('map').getAttribute('data-selected')).toBe('cafe');
  expect(screen.getByRole('button', { name: 'Pin Museum' })).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Save location'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ status: 'selected', source: 'apple_maps',
    place_id: 'cafe', match_hint: { name: 'Café', latitude: 1, longitude: 2 } }));
  fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'London' } });
  expect(screen.getByTestId('map').getAttribute('data-selected')).toBeNull();
  expect(screen.queryByText('Save location')).toBeNull();
  fireEvent.click(await screen.findByText('Add a place name'));
  expect(screen.queryByTestId('map')).toBeNull();
  fireEvent.click(screen.getByText('Search Apple Maps'));
  expect(screen.getByTestId('map')).toBeTruthy();
});

it('starts with search and map, hiding unused actions for an artwork without a location', () => {
  render(<ArtworkLocationSheet artwork={{ ...artwork, museumName: null }} onSave={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByLabelText('Search places')).toBeTruthy();
  expect(screen.getByTestId('map')).toBeTruthy();
  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Cancel']);
  expect(screen.queryByText('Save location')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove location' })).toBeNull();
  expect(screen.queryByText('Add a place name')).toBeNull();
});

it('pins the saved place on open and after clearing search, without creating an edit', () => {
  const currentPlace = { id: 'saved', name: 'Old Museum', address: 'City', latitude: 1, longitude: 2 };
  const onSave = vi.fn();
  const view = render(<ArtworkLocationSheet artwork={artwork} resolvingCurrentPlace onSave={onSave} onClose={vi.fn()} />);
  expect(screen.getByText('Locating saved place…')).toBeTruthy();
  view.rerender(<ArtworkLocationSheet artwork={artwork} currentPlace={currentPlace} onSave={onSave} onClose={vi.fn()} />);
  expect(screen.getByTestId('map').getAttribute('data-selected')).toBe('saved');
  fireEvent.click(screen.getByRole('button', { name: 'Pin Old Museum' }));
  expect(screen.queryByText('Save location')).toBeNull();
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'New' } });
  expect(screen.queryByRole('button', { name: 'Pin Old Museum' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Search places'), { target: { value: '' } });
  expect(screen.getByTestId('map').getAttribute('data-selected')).toBe('saved');
  expect(screen.queryByText('Save location')).toBeNull();
});

it('offers manual entry when search is unavailable and still requires a name before saving', async () => {
  places.search.mockRejectedValue(new Error('Search unavailable'));
  const onSave = vi.fn().mockResolvedValue(artwork);
  render(<ArtworkLocationSheet artwork={artwork} onSave={onSave} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'Museum' } });
  fireEvent.click(await screen.findByText('Add a place name'));
  expect((screen.getByText('Save location') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByLabelText('Search places')).toBeNull();
  expect(onSave).not.toHaveBeenCalled();
});

import { describe, expect, it } from 'vitest';
import { initialState, reducer } from '../src/project.js';

const media = { id: 'm', name: 'a.mp4', path: 'a.mp4', type: 'video', duration: 10, width: 1920, height: 1080, hasAudio: true };
const clip = (id, start, duration = 2) => ({ id, mediaId: 'm', track: 'video', lane: 0, start, in: 0, duration });
const marker = (id, time) => ({ id, time, label: '' });
const start = (clips = [clip('a', 0), clip('b', 2)]) =>
  reducer(initialState, { type: 'LOAD_PROJECT', media: [media], clips, filters: [], markers: [] });
const apply = (state, ...actions) => actions.reduce(reducer, state);
const UNDO = { type: 'UNDO' };
const REDO = { type: 'REDO' };

describe('annulation', () => {
  it('annule et rétablit une liste de clips', () => {
    const edited = reducer(start(), { type: 'REPLACE_CLIPS', clips: [clip('a', 0)] });
    expect(edited.clips).toHaveLength(1);
    expect(reducer(edited, UNDO).clips).toHaveLength(2);
    expect(apply(edited, UNDO, REDO).clips).toHaveLength(1);
  });

  it('annule et rétablit les marqueurs', () => {
    const edited = reducer(start(), { type: 'SET_MARKERS', markers: [marker('x', 1)] });
    expect(reducer(edited, UNDO).markers).toEqual([]);
    expect(apply(edited, UNDO, REDO).markers).toHaveLength(1);
  });

  it('annule et rétablit un filtre importé', () => {
    const edited = reducer(start(), { type: 'ADD_FILTER', filter: { id: 'f', name: 'LUT', size: 2, data: [] } });
    expect(reducer(edited, UNDO).filters).toEqual([]);
    expect(apply(edited, UNDO, REDO).filters).toHaveLength(1);
  });

  it('remet les marqueurs déplacés par une coupe', () => {
    const before = reducer(start(), { type: 'SET_MARKERS', markers: [marker('x', 3)] });
    const cut = reducer(before, { type: 'CUT_RANGES', ranges: [[0, 1]] });
    expect(cut.markers[0].time).not.toBe(3);
    expect(reducer(cut, UNDO).markers).toEqual(before.markers);
    expect(reducer(cut, UNDO).clips).toEqual(before.clips);
  });

  it("n'ajoute pas d'étape quand les marqueurs ne changent pas", () => {
    const before = reducer(start(), { type: 'SET_MARKERS', markers: [marker('x', 1)] });
    expect(reducer(before, { type: 'SET_MARKERS', markers: [marker('x', 1)] })).toBe(before);
  });

  it("une nouvelle modification efface ce qu'on pouvait rétablir", () => {
    const state = apply(start(), { type: 'SET_MARKERS', markers: [marker('x', 1)] }, UNDO, { type: 'SET_MARKERS', markers: [marker('y', 2)] });
    expect(state.future).toEqual([]);
  });

  it('garde 100 étapes au maximum', () => {
    let state = start();
    for (let i = 0; i < 130; i++) state = reducer(state, { type: 'SET_MARKERS', markers: [marker('x', i)] });
    expect(state.past).toHaveLength(100);
  });

  it('ne ramène jamais un clip dont le fichier a été retiré', () => {
    const state = apply(start(), { type: 'REPLACE_CLIPS', clips: [clip('a', 0)] }, { type: 'REMOVE_MEDIA', id: 'm' }, UNDO);
    expect(state.clips).toEqual([]);
  });

  it('oublie la sélection si son clip disparaît', () => {
    const state = { ...reducer(start([clip('a', 0)]), { type: 'REPLACE_CLIPS', clips: [clip('a', 0), clip('b', 2)] }), selectedId: 'b' };
    expect(reducer(state, UNDO).selectedId).toBeNull();
  });
});

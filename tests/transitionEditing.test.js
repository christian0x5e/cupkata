// Selecting and removing a transition from the timeline.
import { describe, expect, it } from 'vitest';
import { initialState, reducer, videoTransitions } from '../src/project.js';

const clip = (id, start, transition = null) => ({ id, mediaId: 'm', track: 'video', start, duration: 3, in: 0, transition });
const state = () => ({ ...initialState, clips: [clip('a', 0), clip('b', 3, { type: 'fade', duration: 1 }), clip('c', 6, { type: 'wipeleft', duration: 1 })] });
const run = (s, ...actions) => actions.reduce(reducer, s);

describe('transition editing', () => {
  it('selects a transition instead of a clip', () => {
    const s = run({ ...state(), selectedId: 'a', multi: ['a', 'c'] }, { type: 'SELECT_TRANSITION', id: 'b' });
    expect(s.transitionId).toBe('b');
    expect(s.selectedId).toBe(null);
    expect(s.multi).toEqual([]);
  });
  it('removes only the transition: the clips stay in place', () => {
    const s = run(state(), { type: 'REMOVE_TRANSITION', ids: ['b'] });
    expect(s.clips.map((c) => [c.id, c.start])).toEqual([['a', 0], ['b', 3], ['c', 6]]);
    expect(videoTransitions(s.clips).map((t) => t.b.id)).toEqual(['c']);
  });
  it('can be undone, and redone', () => {
    let s = run(state(), { type: 'REMOVE_TRANSITION', ids: ['b'] });
    s = run(s, { type: 'UNDO' });
    expect(videoTransitions(s.clips).map((t) => t.b.id)).toEqual(['b', 'c']);
    s = run(s, { type: 'REDO' });
    expect(videoTransitions(s.clips).map((t) => t.b.id)).toEqual(['c']);
  });
  it('removes several at once in one undo step', () => {
    let s = run(state(), { type: 'REMOVE_TRANSITION', ids: ['b', 'c'] });
    expect(videoTransitions(s.clips)).toEqual([]);
    s = run(s, { type: 'UNDO' });
    expect(videoTransitions(s.clips)).toHaveLength(2);
  });
  it('adds no undo step when there is nothing to remove', () => {
    const before = state();
    expect(run(before, { type: 'REMOVE_TRANSITION', ids: ['a'] })).toBe(before);
  });
  it('forgets the selection when the transition goes', () => {
    const s = run(state(), { type: 'SELECT_TRANSITION', id: 'b' }, { type: 'REMOVE_TRANSITION', ids: ['b'] });
    expect(s.transitionId).toBe(null);
  });
  it('forgets the selection when a clip is selected, or the selection is cleared', () => {
    const picked = run(state(), { type: 'SELECT_TRANSITION', id: 'b' });
    expect(run(picked, { type: 'SELECT', id: 'a' }).transitionId).toBe(null);
    expect(run(picked, { type: 'SELECT', id: null }).transitionId).toBe(null);
    expect(run(picked, { type: 'SELECT_MANY', ids: [] }).transitionId).toBe(null);
  });
  it('keeps the selection while its settings change', () => {
    const s = run(state(), { type: 'SELECT_TRANSITION', id: 'b' }, { type: 'UPDATE_CLIP', id: 'b', patch: { transition: { type: 'fade', duration: 2 } } });
    expect(s.transitionId).toBe('b');
  });
  it('forgets the selection when its clip is deleted', () => {
    const s = run(state(), { type: 'SELECT_TRANSITION', id: 'b' }, { type: 'DELETE', id: 'b' });
    expect(s.transitionId).toBe(null);
  });
});

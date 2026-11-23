import { describe, it, expect, vi } from 'vitest';
import { TakenAsks, MemoryTakenAsksStore, BrowserTakenAsksStore, type PackageRef } from '../takenAsks';
import type { ObjectiveAsk } from '../../../exchange/types';

/*
 * Asks from another node's Mission Package that a person here took on (plan
 * item 2.6, story S26). Kept on this device and never sent: taking an ask is
 * what you decided, not something the package said.
 */

const SIGNER = 'b778a0d16f78f237bedca54c1a65f893bf0192de4ee5b8530011223344556677';
const OTHER = 'c889b1e27f89f348cfedb65d2b76f904cf1203ef5ff6c9641122334455667788';
const pkg = (over: Partial<PackageRef> = {}): PackageRef => ({ signer: SIGNER, packageId: 'm-1', packageName: 'Coastal survey handoff', relay: 'wss://relay.example', ...over });
const ask = (over: Partial<ObjectiveAsk> = {}): ObjectiveAsk => ({ id: 'o-1', ask: 'Photograph the cranes at berth 4', handsBack: 'three photos', done: false, ...over });

describe('TakenAsks', () => {
  it('records an ask taken on, with the package it came from and when', () => {
    const taken = new TakenAsks(new MemoryTakenAsksStore());
    const at = '2026-09-28T18:30:00.000Z';
    const record = taken.take(pkg(), ask(), at);
    expect(record).toMatchObject({
      signer: SIGNER, packageId: 'm-1', packageName: 'Coastal survey handoff', relay: 'wss://relay.example',
      askId: 'o-1', ask: 'Photograph the cranes at berth 4', handsBack: 'three photos', takenAt: at,
    });
    expect(taken.isTaken(pkg(), ask())).toBe(true);
    expect(taken.all()).toHaveLength(1);
  });

  it('keeps the words of the ask, since the package is not kept once the relays stop sending it', () => {
    const taken = new TakenAsks(new MemoryTakenAsksStore());
    taken.take(pkg(), ask({ ask: 'Count the containers', handsBack: undefined }));
    expect(taken.all()[0].ask).toBe('Count the containers');
    expect(taken.all()[0]).not.toHaveProperty('handsBack');
  });

  it('tells apart asks with the same id from another package, or the same package id from another node', () => {
    const taken = new TakenAsks(new MemoryTakenAsksStore());
    taken.take(pkg(), ask());
    expect(taken.isTaken(pkg({ packageId: 'm-2' }), ask())).toBe(false);
    expect(taken.isTaken(pkg({ signer: OTHER }), ask())).toBe(false);
    expect(taken.isTaken(pkg(), ask({ id: 'o-2' }))).toBe(false);
  });

  it('takes an ask once, however often it is pressed', () => {
    const taken = new TakenAsks(new MemoryTakenAsksStore());
    const first = taken.take(pkg(), ask(), '2026-09-28T18:30:00.000Z');
    const again = taken.take(pkg(), ask(), '2026-09-29T09:00:00.000Z');
    expect(taken.all()).toHaveLength(1);
    expect(again.takenAt).toBe(first.takenAt);
  });

  it('lets an ask go', () => {
    const taken = new TakenAsks(new MemoryTakenAsksStore());
    taken.take(pkg(), ask());
    taken.release(pkg(), ask());
    expect(taken.isTaken(pkg(), ask())).toBe(false);
    expect(taken.all()).toHaveLength(0);
  });

  it('tells whoever listens of every change', () => {
    const taken = new TakenAsks(new MemoryTakenAsksStore());
    const heard = vi.fn();
    const off = taken.subscribe(heard);
    taken.take(pkg(), ask());
    taken.release(pkg(), ask());
    expect(heard).toHaveBeenCalledTimes(2);
    off();
    taken.take(pkg(), ask());
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('is still there after a reload', () => {
    localStorage.clear();
    new TakenAsks(new BrowserTakenAsksStore()).take(pkg(), ask());
    const reloaded = new TakenAsks(new BrowserTakenAsksStore());
    expect(reloaded.isTaken(pkg(), ask())).toBe(true);
    expect(reloaded.all()[0].ask).toBe('Photograph the cranes at berth 4');
  });

  it('starts empty from stored data it cannot read, rather than failing', () => {
    localStorage.setItem('starcom_taken_asks_v1', '{not json');
    expect(new TakenAsks(new BrowserTakenAsksStore()).all()).toEqual([]);
    localStorage.setItem('starcom_taken_asks_v1', JSON.stringify([{ nope: true }, null]));
    expect(new TakenAsks(new BrowserTakenAsksStore()).all()).toEqual([]);
    localStorage.clear();
  });
});

/**
 * An objective given to you is something to do, and says so where your work
 * is waiting (plan item 2.5): the attention queue.
 */
import { describe, it, expect } from 'vitest';
import { produceGivenObjectiveItems, GIVEN_OBJECTIVE_PRODUCER } from '../givenObjectiveProducer';

const ME = 'a'.repeat(64);
const THEM = 'b'.repeat(64);
const mission = (objectives: unknown[]) => ({
  id: 'mission-1', missionNumber: 'MSN-2026-A3JV-998A', title: 'Watch berth 4', objectives,
}) as never;

describe('produceGivenObjectiveItems', () => {
  it('raises each unfinished objective given to you, and says what it asks and what it hands back', () => {
    const items = produceGivenObjectiveItems({
      missions: [mission([
        { id: 'o1', description: 'Photograph the cranes', completed: false, claimedBy: ME, expectedArtifact: 'three photos' },
        { id: 'o2', description: 'Count the pallets', completed: true, claimedBy: ME },
        { id: 'o3', description: 'Call the harbour office', completed: false, claimedBy: THEM },
        { id: 'o4', description: 'Walk the fence line', completed: false },
      ])],
      me: ME,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'given-objective:mission-1:o1', reason: 'objective-given-to-you', producedBy: GIVEN_OBJECTIVE_PRODUCER,
      missionId: 'mission-1', subject: 'Photograph the cranes', state: 'new',
    });
    expect(items[0].explanation).toMatch(/MSN-2026-A3JV-998A.*Watch berth 4/);
    expect(items[0].explanation).toMatch(/three photos/);
  });

  it('raises nothing for someone with no key yet', () => {
    expect(produceGivenObjectiveItems({ missions: [mission([{ id: 'o1', description: 'x', completed: false, claimedBy: ME }])], me: null })).toEqual([]);
  });
});

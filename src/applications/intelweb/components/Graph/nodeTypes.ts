/**
 * Every kind of node IntelWeb draws, in one list the node type, the default filters and the reset all
 * read (decision D-IW, step 1): a type missing from the filters' list is dropped from the graph unseen.
 * Hubs (country, tag, publisher), mission packages and stubs say what links the notes.
 *
 * Its own module so the graph and its controls share it without importing each other.
 *
 * A cluster is a collapsed group of notes (IW9), one node with its count.
 */
export const NODE_TYPES = ['report', 'entity', 'location', 'event', 'source', 'country', 'tag', 'publisher', 'mission', 'stub', 'cluster'] as const;
export type IntelNodeType = typeof NODE_TYPES[number];

/**
 * The camera move Show on Globe makes: how close it comes, and how long it takes.
 *
 * In one place so that a move described as the same move is the same move. The globe
 * turns to the first intel of a visit with it (decision D-F, step 1), and a person who
 * has used Show on Globe should recognise it.
 */
export const SHOW_ON_GLOBE_MOVE = { altitude: 1.8, transitionMs: 1000 } as const;

/** How far out a requested move looks from: what the request asks, else Show on Globe's (an area asks its own, BA24). */
export const focusAltitude = (request: { altitude?: number }): number => request.altitude ?? SHOW_ON_GLOBE_MOVE.altitude;

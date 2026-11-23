/**
 * A psi address a card can draw (decision D-PW, PW62; the kit's `schemas_psi.md` §3.6): a kind-31923 sky event or
 * window, as the kit and the live notes give it. Kept apart from the card itself, so a shot is read without the sky.
 */
export const PSI_ADDRESS = /^31923:[0-9a-f]{64}:psi-(sky|window)-[A-Za-z0-9_.:+-]{1,200}$/;
export const isPsiAddress = (address: unknown): address is string => typeof address === 'string' && PSI_ADDRESS.test(address);

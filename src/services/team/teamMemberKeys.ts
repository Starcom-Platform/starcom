import { pqCryptoService } from '../crypto/PQCryptoService';

/**
 * Post-quantum keypairs for a team member. The real half of what
 * CyberTeamManager called a "secure team".
 *
 * ─── WHAT WAS LEFT BEHIND, AND WHY ─────────────────────────────────────────
 *
 * That component generated real ML-KEM and ML-DSA keypairs — genuine work,
 * genuinely useful, and trapped inside a 1,016-line screen behind a sidebar
 * popup. This extracts it so every team gets it, not only teams created through
 * that one surface.
 *
 * What is NOT extracted is the metadata layer wrapped around it, because every
 * field in it asserted something nothing established:
 *
 *   verifyTeamCreatorDID()   `return true; // Mock verification`
 *   generateTeamOneTimeKey() a formatted string, not a key
 *   tssSignature             hardcoded {threshold: 2, totalShares: 3}
 *   quantumSafeChannels      channel NAMES; granting access was a console.log
 *   securityClearanceVerified hardcoded true
 *   securityLevel            asserted 'QUANTUM_SAFE', never derived
 *
 * Migrating those would have given every team in the network a record claiming
 * DID verification and threshold cryptography that never ran — the declared-
 * confidence defect this codebase refuses everywhere else, applied to security
 * properties instead of to evidence. Absent is honest; asserted is not.
 *
 * They are not offered as an opt-in tier either. An opt-in makes an unearned
 * claim available on request, which is the same defect behind a checkbox.
 */

export interface TeamMemberKeys {
  /** ML-KEM public key, base64. The private half never leaves the generator. */
  kemPublicKey: string;
  /** ML-DSA public key, base64. */
  sigPublicKey: string;
  /** When these were generated, so a reader can judge their age themselves. */
  keyGeneratedAt: string;
}

/**
 * Generate a member's keypairs.
 *
 * Returns only public halves and a timestamp — deliberately no `verified`, no
 * `clearance`, no `securityLevel`. A consumer derives what these are worth from
 * the algorithm and the age, the same rule the attestation model uses: weight
 * comes from method and age, never from the author's own grading.
 */
export async function generateTeamMemberKeys(): Promise<TeamMemberKeys> {
  const kem = await pqCryptoService.generateKEMKeyPair();
  const sig = await pqCryptoService.generateSignatureKeyPair();
  return {
    kemPublicKey: Buffer.from(kem.publicKey).toString('base64'),
    sigPublicKey: Buffer.from(sig.publicKey).toString('base64'),
    keyGeneratedAt: new Date().toISOString(),
  };
}

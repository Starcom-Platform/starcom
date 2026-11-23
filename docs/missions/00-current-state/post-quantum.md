# Post-quantum cryptography

Audited 2026-09-26, because the owner treats post-quantum cryptography as a
directive priority and asked for the existing work to be confirmed before the
team sign-off was designed. Code reading was checked by running the
repository's own independent verifiers, its unit tests and a local dry run.

## Verified by running it

| Check | Result |
|---|---|
| `npm run conformance` | All 28 attested-claim vectors pass, with real `ml_dsa65.verify` from `@noble/post-quantum` |
| `npm run conformance:mission` | 24 Mission Package vectors verified against the interchange spec, "reimplemented from the prose with no Starcom code imported" |
| `npm run gate:conformance` | Every consumer (ForeignFindingStore, RefutationStore, …) agrees with the published vectors |
| `npm run publication-conformance` | Both implementations agree with all 20 vectors |
| Unit tests: `src/services/crypto`, `exchange`, `intel/findings`, `intel/capability` | 42 files and 398 tests pass, with real ML-DSA round trips and no crypto mocks |
| `npm run dry-run:publish` (local relay only) | A real claim, signed with ML-DSA-65, sent as a kind 30082 event with 11,426 bytes of content, read back, and its signature verified against the payload that came back |
| Chat, two browser profiles through an in-memory relay | Each profile publishes an ML-KEM-768 prekey bundle with 50 one-time prekeys (see `chat.md`) |

## What exists

- **ML-DSA-65 signs:**
  - findings, attested claims (kind 30082), case adjudications, refutations
    (30083) and retractions, all through one function (`signFinding.ts:74-107`),
    which signs SHA-256 of a canonical form of the content;
  - Mission Package manifests (`exchange/signing.ts:89-133`).
- **Two signature layers, as the NIP draft specifies:** an outer Schnorr signature
  (the Nostr event) and an inner, algorithm-tagged ML-DSA signature over the
  content (`nip-draft-attested-claims.md:811-841`).
- **Keys:**
  - in the browser, an IndexedDB store, with the secret held as plain numbers
    (`ManifestSigningKeyStore.ts:37-39`);
  - in the desktop app, a seed kept in the operating system's keychain, with a
    signer that only signs a closed set of kinds (`desktop/src/signer/entry.ts:85-102`);
  - on the command line, the node's own claim key.
- **ML-KEM-768** for chat key exchange (`PQCryptoService.ts:124-152`, from the
  `mlkem` package).

## The gaps

1. **Nothing links a person's Nostr key to their ML-DSA key.** A verifier finds
   the ML-DSA public key embedded next to the signature, which proves only that
   the key beside it signed. Cross-signing, "the holder signs each key with the
   other", exists only as NIP text (`nip-draft-attested-claims.md:843-847`).
   Only the node's own claim keys are published (`starcom-node.json`
   `claimKeys`).
2. **Intel Reports (kind 30023) carry no post-quantum signature.** The field is
   typed but never filled (`IntelReportPackage.ts:219-223`).
3. **A downgrade is accepted.** Manifest verification also accepts Ed25519
   (`exchange/signing.ts:155-161`), and the verifier does not link the outer
   and inner keys (`MissionPackageVerifier.ts:95-167`).
4. **Two canonical forms.**
   - Findings sort keys with `localeCompare`, which depends on locale and ICU
     build.
   - Manifests sort by code unit.

   The same content could hash differently in two environments
   (`signFinding.ts:66-71`; `exchange/signing.ts:31-40`, `80-87`).
5. **Algorithms mislabelled.** `PQCryptoService` signs with Ed25519
   (`PQCryptoService.ts:99-103`, `133-137`), so the team member key documented
   as "ML-DSA" is Ed25519 (`teamMemberKeys.ts:36`). Two services describe
   Ed25519 signing as ML-DSA-65.
6. **No rotation.** "Known gap, not yet resolved: there is no key-rotation story"
   (`starcom-navcom-interchange.spec.md:1258-1263`). `rotate()` exists and is
   never called.
7. **The desktop signing route is tested only against a mock,** and the desktop
   smoke test never verifies the signature it gets back.
8. **The refutation address is about 4,000 characters,** because it embeds a
   1,952-byte ML-DSA public key. The fix, `sha256(authorPubkey)`, is undecided
   (`nip-draft-attested-claims.md:570-603`).
9. **Chat prekey bundles are authenticated only by the classical Nostr event
   signature.** The inner signed-prekey signature is Ed25519, and nothing
   verifies it (`ForwardSecrecyService.ts:111-127`). Confidentiality is
   post-quantum; the authentication of a bundle is not.

## Sizes

- **An ML-DSA-65 public key** is 1,952 bytes and a signature 3,309 bytes: about
  10.5 KB of hex for each signed payload.
- **Relay limits.** The public relays declare message limits between 131,072 and
  1,000,000 bytes; khatru-based relays such as zooid allow 512,000. About twelve
  ML-DSA signatures fit in one 131 KB event.

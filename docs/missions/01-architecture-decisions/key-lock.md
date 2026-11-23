# Decision D-KL — A passphrase lock on the browser's own key

**Status:** decided by the owner, 20 November 2026 ("go with your recommendations", on the options set out that day: status quo, a non-extractable WebCrypto wrap, a NIP-49 passphrase, a passkey, a remote signer). Built the same day.

## Why

A person who has no signing extension and no Starcom Uplink signs with a key Starcom makes in their browser. Until now that key sat in `localStorage` as plain text, always. Anyone who copied the browser profile, read a backup of it, or sat at the computer could sign as that person. The interns arriving on 1 December use the live app, often on shared or lent machines. NIP-07 extensions and Uplink already keep the key out of the page. This is for everyone else.

## What was decided

| # | Decision |
|---|---|
| KL1 | **NIP-49.** A locked key is kept as an `ncryptsec` (scrypt at cost 16, then XChaCha20-Poly1305), with its pubkey beside it, under `nostr_locked_key`. The plain `nostr_secret_key` entry is removed. The two are never kept together. Uplink seals its key the same way. |
| KL2 | **Offered when a key is made, selected but skippable.** The notice that tells a person a key was made offers the lock, ticked, below the backup button. "Got it", or unticking it, skips it. It is never applied to an existing key without the person choosing it. "Your key" offers it at any time, and removes it. |
| KL3 | **Never lost to the lock.** Locking seals the key, opens the sealed copy again and checks it is the same key, writes it, reads it back, and only then removes the plain copy. Removing the lock writes the plain copy first. If a page finds both copies of one key (a change stopped half-way), the plain copy wins and the locked one goes. A forgotten passphrase cannot be recovered. That is said before locking, in plain words, with the backup offered first. Bringing the key back from its backup replaces the locked copy. |
| KL4 | **Asked for once a visit, and only for the person's own act.** A locked key is opened when something the person did needs it: publishing, sending, sealing, showing the key, opening a sealed copy, moving it into Uplink. It stays open in memory, never in `sessionStorage`, until the page is closed or reloaded. A wrong passphrase says so and asks again. Cancelling fails that action with "Nothing was done: your key is still locked." |
| KL5 | **What runs on its own never asks.** Start-up never prompts. Relay sign-ins (NIP-42), the sealed inbox, prekey announcements and the findings outbox wait quietly while the key is locked. The sealed inbox does not read at all, so its read position does not move past wraps it could not open. Each starts again on the unlock (`subscribeKeyLock`, and `onAccessChange` through NostrIdentityService). |
| KL6 | **The age gate is unchanged.** Under 13, no key is made or used, locked or not. |
| KL7 | **The post-quantum signing key goes with it** (the owner, 21 Nov 2026, on the EIN transition audit's finding 6). The ML-DSA-65 key that signs Mission Packages, findings and record bundles was kept in IndexedDB as plain numbers. It is now kept sealed to the person's own Nostr key with NIP-44, so whatever protects that key protects this one: the lock, Starcom Uplink (which encrypts quietly), or a signing extension. It is sealed when that asks nobody anything: when it is made with a key open in the page, when the person locks or unlocks, or at the next signature after that. It is opened when the person signs, through the unlock publishing already asks for. A refusal to unlock fails the act and replaces nothing. A key sealed to a Nostr key this browser no longer holds cannot sign here again: a new one is made, and the old one's public half is kept so what it signed is still recognised. Not backed up and never sent anywhere: each package's outer Nostr signature vouches for the key inside, so a new device makes a new one, and a copy on relays would be sealed with elliptic-curve encryption a quantum computer could open later. |

## What it protects, and what it does not

- **Protects:** a copied or backed-up browser profile, a stolen laptop, and someone else using the same computer and browser profile. None of them can sign as the person without the passphrase.
- **Does not protect:** a malicious script running on the page while the key is unlocked. The page must hold the key to sign with it. The content security policy is the defence there. Only a key that never enters the page does better: Starcom Uplink, or a NIP-07 extension.
- **Does not protect:** a weak passphrase against an offline guess. scrypt at cost 16 makes each guess cost about a second and 64 MiB. Ten characters is the shortest it takes, as in Uplink.

## Where it lives

- `src/services/identity/keyLock.ts`: the stored form, the asking and the telling.
- `src/services/nostrService.ts`: `lock`, `unlock`, `unlockFor`, `removeLock`, `lockState`. Every use of the key handles the locked state.
- `src/services/identity/NostrIdentityService.ts`:
  - `asSigner(reason)` and `nip44Encrypt` ask for the passphrase;
  - `signWithExisting` and `nip44Decrypt` without a reason never ask;
  - `isLocked()` is true only when this browser's key is what signs.
- `src/components/Identity/KeyUnlockRoot.tsx`: the prompt, mounted app-wide.
- `IdentityNoticeRoot.tsx` (the offer) and `YourKey.tsx` (lock, remove, and the holder line).
- Tests:
  - `src/services/__tests__/nostrService.keyLock.test.ts`
  - `src/components/Identity/__tests__/YourKey.lock.test.tsx`
  - the lock cases in `IdentityNoticeRoot.test.tsx`, `outboxDrain.test.ts` and `SecureChatIntegrationService.chatUse.test.ts`

## Not done

- **A passkey unlock** (WebAuthn PRF: Touch ID or Face ID) is the planned easier unlock. The passphrase would remain the fallback.
- **A remote signer** (NIP-46) is for people who want the key off the device entirely.
- **"Lock now"** has no button: a lock takes effect at the next visit. Closing the tab locks it.

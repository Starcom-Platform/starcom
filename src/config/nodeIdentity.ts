/**
 * Which keys are this node.
 *
 * ─── WHY THIS EXISTS, AND WHY IT IS COMMITTED ──────────────────────────────
 *
 * A public key is public by construction, and these two ARE the node — as
 * load-bearing as the domain name. Holding them in environment variables meant
 * a deploy that forgot to set one published `identity: null`, which is the
 * exact failure this file exists to prevent.
 *
 * Rotation being a code change is deliberate: it should be reviewable, appear
 * in history, and be announced in a claim signed by the outgoing key, rather
 * than happening because someone edited a dashboard.
 *
 * ─── WHY BOTH KEYS, AND WHY THE SECOND ONE MATTERS MORE ────────────────────
 *
 * A published claim carries TWO signatures and they prove different things:
 *
 *   the outer Nostr signature   which node relayed this
 *   the inner ML-DSA signature  which key attested to the content
 *
 * Only the first was ever published. So the second — the one the whole
 * attested-claims design rests on — could be checked for internal consistency
 * and not for authorship: a consumer could confirm the signature matched the
 * key embedded beside it, and had nothing to establish that the key was ours.
 * `security-policy.md` told readers they could check what this node published.
 * For the layer that matters, they could not.
 *
 * The same missing fact caused a second problem inward. `ownPublishingKeys`
 * exists because this instance once "corroborated itself, and contested
 * itself, and reported both as independent peers" — and it is populated only
 * when the BROWSER signs. The command line, which is where every real
 * publication has come from, never registered its key. Our own claims,
 * returning off the relays, would have been counted as a stranger's agreement.
 *
 * One fact, published once, closes both.
 */

/** secp256k1, hex. Signs the outer Nostr event, and names us at NIP-05. */
export const NODE_NOSTR_PUBKEY =
  'b778a0d16f78f237bedca54cfe778c3c7c215a6a0d64345e27f75e16d6c0b7a3';

/**
 * ML-DSA-65 public keys this node attests under, newest first.
 *
 * An ARRAY because a node legitimately publishes under more than one key
 * across its life, and a claim signed by a key retired last month is no less
 * ours — the same reasoning `ownPublishingKeys` gives for holding a set, and
 * the reason `PublishedFindingsLedger` records `authorPubkey` per claim.
 *
 * 1952 bytes each (FIPS 204). Large for a config value, and the alternative is
 * a fact nobody can check.
 */
export const NODE_CLAIM_PUBKEYS: readonly string[] = [
  '71f004ae34b6cae106ba804895c94541814bb267521db5dd9954b3860731bc8ca75b67a4e2793dabb6fd366dd8731a7e624b03a4bab750285603f0453373040841c880f9ba69d40f62a48a2d0a5ac579cf4a34b0b3356cf89636bdd1cd39c8b46846452617c8363ce07f48b63509c35e45ae0b3b2024d95530d9bd0b180058344678fda25a5b927be9a5d9082438237fd892dca1eaad46ed9a0dcd55bb5b07c78a2e671d722b17f15ac812eebb20ed9d2cd2814774b6107c096e85c1b45063e575c138e34e6d6b907cdcb9446a04f769d1ec98ce6e77a2b7ddceaac434e31539873b72873a90d1f905274fc0dc92046e8111035d0f94aaa8840b8188cefded91af15c7d08fe89f3b64a35e64b932b68d75f4f6be181d2d0caac127e1f2f32b81081be0048a70a35000293cd4d76c53963080895666a38ec8fc2666aca7c51c9f66592c98cd3f4c8ab7011b36f619b721226d5c622a7fe08120af095729d708e009abd662722e7d4748aa876b407239c697b7cac34a99882d6db31482d5f6bfacb24e89c4d258a3790376e0f85933a1c007468ca060b365c949e85352c6c26f68af02b48879869fcdad06f29002e77c67c5eba46e32a2c3ecb3a65c14c33e089396193ec472753946d3aac8ef2e11dd10839e8ba1de02d2c1f09890d1bf90bd18e72b05cecede1c1191eee74de729e63704d426b10e600589cfc14ef8fc12c6112339d38b1b0ef62a23b214ba330b1443922224c22e62b62954db51a14091cb64f1c719f3346adbf34041d03d95d2cb8d5be03862644da8a0eba4edda674f9e60d52eaaaaf8ff59ee1cf90ed471964612d953ac41e5236a61e9a46b00ad5129bcd3be2618b44a66e6a6dc73b6b72c25889f4bfb099c28f107e9fddafd65ad5cbf6d42e8fc3ab4b0c9ad5e228d508345f3d17609187971fdbb7e59c474fa3458cd306c3af62a250dd536c2b4fea4e7ea7733f813540b0e46aac4f7bb053dd4577219eecabf3eb36b73f28d0838d15fb3dcba436b13646a2f4bd64c78abef5a66354504ae07c64aa22e40dacb8f4b7a2d3aef1e978d4271aaa734c808fb1af97537ddcdff826f2aff72a105f8328c6168564230e5d7f2767b55bd3ededf927b289e3af8a0cf305e4c51001a363fbf09d10cb9e8de4abcbe1f0c5896e469d93d5261907492ecffbe16b94c4ed8b88a62bf13258c15e66fe2fd02d4d9de8b030cf675ae80a2d26279b1ef4bbfb10cefd24ebb8d99dd5b869b67fcf62acb621a01d42c55a1a8960cb7154687bb9ce6bc8c08fa2e19488ea8624ac7a7af05c4a811970363497deec90e941d4082fe350dcd4a3277d1e129f2a3d30d84377b2191b5d4ad426a57d4425c0584d8f0d59f09379f7315581696fffcb114308bbf33187d41bf86faa69820d89ef5368dd062a0e72690ff7bfa82d89cd388e858eb8ffce54a8a582eb91a103e85daaec52720208842beb56c065d8368fbf723306b4ded939782d4fa77c6c3e9980c46840df22ae1ca88461ed616146898a324a048d1621aae7d5c49418378811c19a677961c98d8cd3d6764540cbaa2a736e2d8f8db0ba4bd9b7a13aaa14fd89c6e42aeb9d1921d43083f0df4326b4b059a3e6d6ee575c63975e2c243f5b0442752fd180752e979f0a58e1d1eecb0a7f1697952d7edaa49fa65ef1d5f5ea4eb626f279166cca453b31bc62ae55d43f022141f186348de5430e2c5f24e39f4ff2feaf6a85c13ca0320710d832a5a221d3ccf300aa9d900640759aba8295432c12495225f7fa0bee0142366190dedc389b838fc3cd73dec36a264ea6fa0718e523e0572f6180a0dfde00b1538311db8944ac64df872ae14ca6129e934b95c511140dde3b1fcb0df7b37131b21fd5e3f8a98eb42db5c86c57b8d8058fa1ea51050105f9d832301a5d656c8de6bb7ca7b37cbe7048d272d26a966527504ee63eb95a0a765fb853baaa7e05dab1d9886787dad484d64cf03f4901d0e6f16a605d31fa87d3700bcb70032ac684345e5dc3e890e127945185b3faea3822a279e0a577d3e57862f9c2439deff9f996873c30b48de97240f7be33b639d2efe0e6a86f5e6ba3c653ef4e3eee8e53b268c9b41995130020bc4fafe45b33d354b3cfe51523da6afceb02bea9199502a4d71af2b9444f9b8e1426705e4140ca847418f3cf7b2ea75ff84425167bf0f6060d94ef2c8fd4ce95e5a8217e6dee3ca0f15e8752aecda0eb8037355320670ed69f1241392a44ba99ca98f6db431916c7c0edcc0e92bf41372b891065e95f56947bfaf769554dcd6df093838d555b0b0cb8605bdd5ce64c6411552c6c3cef02969285f399d9ddb0581f719ae27b509b7181a9ca08596eb4fdb296f58abb273e59a9752b6ab825986c876bca07f13e7576c735b45ba87422ca355630cdef1a31949e35bad6b2093ed4dd8add2fcf7b7785b40925d56e21ccdd66efb62e77a954f4c8593c1ed9cc287a952c6b703bc462c4f18e8d6dffd373769ee9bc7bdf9147d7af20bbf53f26f805d9c4279403916ea5d5bfe75f6ef2a972fa58179a77460f2b8df1f422057d30ec3606b1e823c7747da1218cacd077a1a8d473d24ea20889e2aab60f75a08a8757a85cb2ecafb1d49e018fc2eee381ce9a8d524f30cdae91b6a934c6c292ffc377b0bfc5fe0eb3a5c1b344468be8327517637487d0835468212ed480973aab079827d0546fbcdcac78f8d4c39162a7f4402d026b517a5a576be57cce1552c77083e581d7ae49bde9c',
];

/** The algorithm those keys are for. Published so a consumer need not guess. */
export const NODE_CLAIM_ALG = 'ml-dsa-65' as const;

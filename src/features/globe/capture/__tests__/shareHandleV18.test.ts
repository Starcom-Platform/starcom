/**
 * Share handle v18, as published: a card's file carries its record (block I,
 * item 5), as XMP in the place each format keeps it, under Starcom's namespace.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { STARCOM_XMP_NAMESPACE } from '../cardFileRecord';

describe('contract v18', () => {
  it('is at version 18', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(18);
  });

  it('says where a card\'s file carries its record, in the namespace the code writes', () => {
    expect(SHARE_HANDLE_CONTRACT.fileRecord).toEqual({
      format: 'XMP', namespace: STARCOM_XMP_NAMESPACE, png: 'iTXt XML:com.adobe.xmp', jpeg: 'APP1', webp: 'XMP ',
    });
  });
});

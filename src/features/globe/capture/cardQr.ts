/**
 * A card's QR code (decisions IM13, IM30–IM32), only when a shot asks
 * (`card.qr`): for an image reposted where its link does not survive.
 *
 *   - It opens a short view link on starcom.app (IM31): the place, the
 *     altitude and the layers. The item's 64-character address, the window and
 *     the look stay in the card's full link, in its provenance, so the code is
 *     small and sparse enough to scan from a phone when the card is shown small.
 *     The public site whatever origin drew the card: a reposted image should
 *     lead to the site anyone can open.
 *   - It is encoded by `qrcode-generator` (MIT, no dependencies), imported only
 *     when a card asks for a code, so the app's first load does not grow (IM30).
 *   - It is drawn with the footer, right-aligned (IM32; shareCardLayout).
 */
import { deeplinkSearch, type Deeplink } from '../../../context/deeplinkV1';

/** Where a reposted card's code leads: the public site. */
export const STARCOM_SITE = 'https://starcom.app';

/** The short link a card's QR code opens: the view's place, altitude and layers, on the public site. */
export function qrViewLink(link: Deeplink): string {
  return `${STARCOM_SITE}/${deeplinkSearch({ ...link, focus: null, win: null, look: undefined })}`;
}

/**
 * The code's modules, dark true, row by row: the smallest version that holds the
 * link at error correction M, which reads with about 15% of the code damaged or
 * badly scaled. The library is loaded on the first call.
 */
export async function encodeQr(link: string): Promise<boolean[][]> {
  const { default: qrcode } = await import('qrcode-generator');
  const code = qrcode(0, 'M');
  code.addData(link, 'Byte');
  code.make();
  const n = code.getModuleCount();
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => code.isDark(row, col)));
}

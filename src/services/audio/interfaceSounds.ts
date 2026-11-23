/**
 * The interface's sounds, heard from the document rather than wired into each
 * component.
 *
 * One listener hears every click, and the control's own semantics say which
 * sound it makes. A switch says whether it is turning on or off; a button that
 * opens a menu or a panel opens, and one that is open closes; a form's submit
 * confirms; a disabled control denies; anything else clicks. So every button
 * the app has, and every one it gets, sounds right without being touched, and
 * a control that tells a screen reader what it does tells the sound too.
 *
 * `data-sfx` on a control, or on anything around it, names its sound instead,
 * or "none" for silence: the bar's applications switch (data-sfx="switch"), and
 * a control that plays its own sound says "none".
 *
 * The pointer passing over a control ticks, for a mouse only: a finger has no
 * hover, and a tap would tick and click at once.
 */
import { playSfx, primeSfx, SFX, type SfxMoment } from './sfxLibrary';
import { getSoundSettings } from './soundSettings';

/** What a click can mean something on. */
const CONTROL = [
  'button', 'a[href]', 'summary',
  'input[type="checkbox"]', 'input[type="radio"]', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="option"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
  '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
  '[data-sfx]',
].join(', ');

/** What ticks as the pointer passes: controls that act, not links in a paragraph. */
const HOVER = [
  'button', 'summary', '[role="button"]', '[role="tab"]', '[role="option"]', '[role="switch"]',
  '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
].join(', ');

const DISABLED = ':disabled, [aria-disabled="true"]';
const CHECKED_ROLES = new Set(['switch', 'checkbox', 'menuitemcheckbox']);

const isMoment = (name: string | null): name is SfxMoment => name !== null && Object.hasOwn(SFX, name);

/** The sound `data-sfx` names around the target: a moment, "none", or nothing said. */
const named = (target: Element): SfxMoment | 'none' | null => {
  const value = target.closest('[data-sfx]')?.getAttribute('data-sfx') ?? null;
  if (value === 'none') return 'none';
  return isMoment(value) ? value : null;
};

const isSubmit = (control: Element): boolean => {
  if (control instanceof HTMLInputElement) return control.type === 'submit';
  // A button in a form submits it unless it says otherwise.
  return control instanceof HTMLButtonElement && control.type === 'submit' && control.form !== null;
};

/**
 * The sound a click on `target` makes, read as the click arrives: before the
 * page acts on it, so an open control is still open, except a native checkbox,
 * which the browser has already ticked.
 */
export function soundForClick(target: Element): SfxMoment | null {
  const control = target.closest(CONTROL);
  if (!control) return null;
  const said = named(target);
  if (said === 'none') return null;
  if (control.matches(DISABLED)) return 'deny';
  if (said) return said;
  if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.checked ? 'toggleOn' : 'toggleOff';
  const checked = control.getAttribute('aria-checked');
  if (checked !== null && CHECKED_ROLES.has(control.getAttribute('role') ?? '')) return checked === 'true' ? 'toggleOff' : 'toggleOn';
  const pressed = control.getAttribute('aria-pressed');
  if (pressed === 'true') return 'toggleOff';
  if (pressed === 'false') return 'toggleOn';
  const expanded = control.getAttribute('aria-expanded');
  if (expanded === 'true') return 'close';
  const popup = control.getAttribute('aria-haspopup');
  if (expanded === 'false' || (popup !== null && popup !== 'false')) return 'open';
  if (isSubmit(control)) return 'confirm';
  return 'click';
}

/** The control the pointer is over, if passing onto it ticks. */
export function hoverControl(target: Element): Element | null {
  const control = target.closest(HOVER);
  if (!control || control.matches(DISABLED) || named(target) === 'none') return null;
  return control;
}

/** Keys that act on what has focus: the page's first press of one lets sound start. */
const ACTING_KEYS = new Set(['Enter', ' ', 'Escape']);

/** Listen to the whole document for the interface's sounds; the returned function stops. */
export function installInterfaceSounds(root: Document = document): () => void {
  let hovered: Element | null = null;

  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const moment = soundForClick(event.target);
    if (moment) playSfx(moment);
  };

  // A browser starts audio only inside a gesture, and a disabled control gets
  // no click at all, only the press.
  const onPointerDown = (event: PointerEvent) => {
    if (!getSoundSettings().enabled) return;
    primeSfx();
    if (event.target instanceof Element && event.target.closest(':disabled') && named(event.target) !== 'none') {
      playSfx('deny');
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (getSoundSettings().enabled && ACTING_KEYS.has(event.key)) primeSfx();
  };

  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
    const control = hoverControl(event.target);
    if (control === hovered) return;
    hovered = control;
    if (control) playSfx('hover');
  };

  // A choice from a list, or a slider let go: the value is set.
  const onChange = (event: Event) => {
    const target = event.target;
    const chose = target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === 'range');
    if (chose && named(target) !== 'none') playSfx('click');
  };

  const options = { capture: true, passive: true } as const;
  root.addEventListener('click', onClick, options);
  root.addEventListener('pointerdown', onPointerDown, options);
  root.addEventListener('keydown', onKeyDown, options);
  root.addEventListener('pointerover', onPointerOver, options);
  root.addEventListener('change', onChange, options);
  return () => {
    root.removeEventListener('click', onClick, options);
    root.removeEventListener('pointerdown', onPointerDown, options);
    root.removeEventListener('keydown', onKeyDown, options);
    root.removeEventListener('pointerover', onPointerOver, options);
    root.removeEventListener('change', onChange, options);
  };
}

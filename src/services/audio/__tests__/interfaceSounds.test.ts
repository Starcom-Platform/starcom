/**
 * The interface's sounds come from what a control says it is, read as the click
 * arrives: every button the app has sounds without being wired.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const playSfx = vi.hoisted(() => vi.fn());
const primeSfx = vi.hoisted(() => vi.fn());
vi.mock('../sfxLibrary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sfxLibrary')>()),
  playSfx,
  primeSfx,
}));

import { soundForClick, hoverControl, installInterfaceSounds } from '../interfaceSounds';
import { resetSoundSettingsForTests, setSoundSettings } from '../soundSettings';

const html = (markup: string): HTMLElement => {
  document.body.innerHTML = markup;
  return document.body;
};
const get = (selector: string): Element => document.querySelector(selector)!;

describe('soundForClick', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('clicks for a plain button, a link and a tab, and for what is inside them', () => {
    html('<button id="b"><span id="inner">Go</span></button><a id="a" href="/x">x</a><div role="tab" id="t">T</div>');
    expect(soundForClick(get('#b'))).toBe('click');
    expect(soundForClick(get('#inner'))).toBe('click');
    expect(soundForClick(get('#a'))).toBe('click');
    expect(soundForClick(get('#t'))).toBe('click');
  });

  it('is silent for what is not a control', () => {
    html('<div id="d"><p id="p">text</p><input id="i" type="text"></div>');
    expect(soundForClick(get('#p'))).toBeNull();
    expect(soundForClick(get('#i'))).toBeNull();
  });

  it('turns a switch on or off by the state it is leaving', () => {
    html(`
      <button id="pressed" aria-pressed="true">a</button>
      <button id="unpressed" aria-pressed="false">b</button>
      <div id="on" role="switch" aria-checked="true">c</div>
      <div id="off" role="switch" aria-checked="false">d</div>`);
    expect(soundForClick(get('#pressed'))).toBe('toggleOff');
    expect(soundForClick(get('#unpressed'))).toBe('toggleOn');
    expect(soundForClick(get('#on'))).toBe('toggleOff');
    expect(soundForClick(get('#off'))).toBe('toggleOn');
  });

  it("reads a native checkbox after the browser has ticked it", () => {
    html('<input id="c" type="checkbox">');
    const box = get('#c') as HTMLInputElement;
    box.checked = true;
    expect(soundForClick(box)).toBe('toggleOn');
    box.checked = false;
    expect(soundForClick(box)).toBe('toggleOff');
  });

  it('opens what is closed and closes what is open', () => {
    html(`
      <button id="closed" aria-expanded="false">menu</button>
      <button id="open" aria-expanded="true">menu</button>
      <button id="dialog" aria-haspopup="dialog">settings</button>`);
    expect(soundForClick(get('#closed'))).toBe('open');
    expect(soundForClick(get('#open'))).toBe('close');
    expect(soundForClick(get('#dialog'))).toBe('open');
  });

  it("confirms a form's submit, and only a form's", () => {
    html(`
      <form><button id="save">Save</button><button id="other" type="button">Other</button></form>
      <button id="loose">Loose</button>`);
    expect(soundForClick(get('#save'))).toBe('confirm');
    expect(soundForClick(get('#other'))).toBe('click');
    expect(soundForClick(get('#loose'))).toBe('click');
  });

  it('denies a control that says it is disabled', () => {
    html('<button id="b" aria-disabled="true" data-sfx="switch">b</button>');
    expect(soundForClick(get('#b'))).toBe('deny');
  });

  it('plays what data-sfx names, on the control or around it, and nothing for "none"', () => {
    html(`
      <button id="sw" data-sfx="switch">Cases</button>
      <div data-sfx="none"><button id="quiet">q</button></div>
      <div id="result" data-sfx="click">a search result</div>
      <button id="typo" data-sfx="toString">t</button>`);
    expect(soundForClick(get('#sw'))).toBe('switch');
    expect(soundForClick(get('#quiet'))).toBeNull();
    expect(soundForClick(get('#result'))).toBe('click');
    // A name that is not a moment is ignored, not trusted.
    expect(soundForClick(get('#typo'))).toBe('click');
  });
});

describe('hoverControl', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('ticks over controls that act, not over links in a paragraph or disabled controls', () => {
    html(`
      <button id="b"><span id="inner">x</span></button>
      <p><a id="a" href="/x">a link</a></p>
      <button id="off" disabled>off</button>
      <div data-sfx="none"><button id="quiet">q</button></div>`);
    expect(hoverControl(get('#inner'))).toBe(get('#b'));
    expect(hoverControl(get('#a'))).toBeNull();
    expect(hoverControl(get('#off'))).toBeNull();
    expect(hoverControl(get('#quiet'))).toBeNull();
  });
});

describe('installInterfaceSounds', () => {
  let stop: () => void;

  const pointer = (type: string, target: Element, pointerType = 'mouse') => {
    // jsdom has no PointerEvent; a MouseEvent with its pointerType is what the listeners read.
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    target.dispatchEvent(event);
  };

  beforeEach(() => {
    playSfx.mockReset();
    primeSfx.mockReset();
    localStorage.clear();
    resetSoundSettingsForTests();
    stop = installInterfaceSounds(document);
  });

  afterEach(() => {
    stop();
    document.body.innerHTML = '';
    localStorage.clear();
    resetSoundSettingsForTests();
  });

  it("plays a click's sound, even when the page stops the click from spreading", () => {
    html('<div id="wall"><button id="b">b</button></div>');
    get('#wall').addEventListener('click', (e) => e.stopPropagation());
    (get('#b') as HTMLButtonElement).click();
    expect(playSfx).toHaveBeenCalledWith('click');
  });

  it('ticks once as the mouse passes onto a control, not again while it stays, and never for a finger', () => {
    html('<button id="b"><span id="inner">x</span></button><div id="away">away</div>');
    pointer('pointerover', get('#b'));
    pointer('pointerover', get('#inner'));
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith('hover');
    pointer('pointerover', get('#away'));
    pointer('pointerover', get('#b'));
    expect(playSfx).toHaveBeenCalledTimes(2);
    pointer('pointerover', get('#away'), 'touch');
    pointer('pointerover', get('#b'), 'touch');
    expect(playSfx).toHaveBeenCalledTimes(2);
  });

  it('lets audio start on a press only while sound is on, and denies a press on a disabled control', () => {
    html('<button id="b">b</button><button id="off" disabled><span id="offInner">x</span></button>');
    pointer('pointerdown', get('#b'));
    expect(primeSfx).not.toHaveBeenCalled();
    setSoundSettings({ enabled: true });
    pointer('pointerdown', get('#b'));
    expect(primeSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).not.toHaveBeenCalled();
    pointer('pointerdown', get('#offInner'));
    expect(playSfx).toHaveBeenCalledWith('deny');
  });

  it('clicks when a list choice or a slider is set', () => {
    html('<select id="s"><option>a</option><option>b</option></select><input id="r" type="range"><input id="t" type="text">');
    get('#s').dispatchEvent(new Event('change', { bubbles: true }));
    get('#r').dispatchEvent(new Event('change', { bubbles: true }));
    get('#t').dispatchEvent(new Event('change', { bubbles: true }));
    expect(playSfx.mock.calls).toEqual([['click'], ['click']]);
  });

  it('stops listening when asked', () => {
    stop();
    html('<button id="b">b</button>');
    (get('#b') as HTMLButtonElement).click();
    expect(playSfx).not.toHaveBeenCalled();
    stop = () => {};
  });
});

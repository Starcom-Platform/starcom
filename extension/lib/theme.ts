/** Starcom's own colours and type on Uplink's pages (decision D-EX: Starcom's look, from its tokens). */
import { CYAN, GUNMETAL, SEMANTIC } from '../../src/styles/tokens';

export function applyTheme(): void {
  const root = document.documentElement.style;
  root.setProperty('--ground', GUNMETAL[950]);
  root.setProperty('--panel', GUNMETAL[900]);
  root.setProperty('--rule', GUNMETAL[700]);
  root.setProperty('--text', GUNMETAL[200]);
  root.setProperty('--heading', GUNMETAL[100]);
  root.setProperty('--muted', GUNMETAL[400]);
  root.setProperty('--cyan', CYAN[400]);
  root.setProperty('--ok', SEMANTIC.ok);
  const style = document.createElement('style');
  style.textContent = `
    body { margin: 0; background: var(--ground); color: var(--text); font: 13px/1.5 'IBM Plex Sans', system-ui, sans-serif; }
    main { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
    h1 { margin: 0; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--heading); }
    p { margin: 0; }
    .muted { color: var(--muted); }
    code, .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; color: var(--heading); overflow-wrap: anywhere; }
    button { font: inherit; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--rule); background: var(--panel); color: var(--heading); cursor: pointer; }
    button.primary { border-color: var(--cyan); color: var(--cyan); }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    .english { display: block; margin-top: 2px; font-size: 11px; color: var(--muted); }
    button .english { margin-top: 0; }
  `;
  document.head.append(style);
}

/** Plain text into an element, never markup. */
export function text(tag: string, words: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = words;
  if (className) el.className = className;
  return el;
}

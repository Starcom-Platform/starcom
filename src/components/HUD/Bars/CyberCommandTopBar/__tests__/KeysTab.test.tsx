/**
 * The one place a person can enter an API key of their own.
 *
 * It used to be ProviderConfigurationPanel on the /osint page, and it went with
 * that page in 14432bae. Every feed and tool that reads a key was left with no
 * way to obtain one: the EIA hint pointed at a screen that no longer existed,
 * and Shodan could only ever say it had no key.
 *
 * These carry forward what that panel's own tests had learned: a key must really
 * be stored, and a stored key must never be overwritten by what the screen shows
 * in its place.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { resolveCredential } from '../../../../../shared/config/userCredentialStore';
import KeysTab, { KEY_PROVIDERS } from '../SettingsTabs/KeysTab';

const STORE = 'starcom_user_api_credentials_v1';

beforeEach(() => localStorage.clear());

const row = (name: string) => within(screen.getByRole('group', { name }));

describe('KeysTab', () => {
  it('stores a typed key where the tool reads it, and then says a key is set', () => {
    render(<KeysTab />);
    const shodan = row('Shodan');

    fireEvent.change(shodan.getByLabelText('Shodan key'), { target: { value: 'my-real-key' } });
    fireEvent.click(shodan.getByRole('button', { name: 'Save key' }));

    expect(resolveCredential('shodan')).toEqual({ value: 'my-real-key', source: 'user' });
    expect(shodan.getByText('Your key is set')).toBeTruthy();
    expect((shodan.getByLabelText('Shodan key') as HTMLInputElement).value).toBe('');
  });

  it('never shows a stored key back, and cannot save an empty field over it', () => {
    localStorage.setItem(STORE, JSON.stringify({ shodan: 'existing-key' }));
    render(<KeysTab />);
    const shodan = row('Shodan');

    expect(screen.queryByDisplayValue('existing-key')).toBeNull();
    expect(screen.queryByText(/existing-key/)).toBeNull();
    expect((shodan.getByRole('button', { name: 'Save key' }) as HTMLButtonElement).disabled).toBe(true);
    expect(resolveCredential('shodan').value).toBe('existing-key');
  });

  it('removes a key when asked', () => {
    localStorage.setItem(STORE, JSON.stringify({ eia: 'eia-key' }));
    render(<KeysTab />);
    const eia = row(KEY_PROVIDERS.find(p => p.id === 'eia')!.name);

    fireEvent.click(eia.getByRole('button', { name: 'Remove key' }));

    expect(resolveCredential('eia').source).toBe('none');
    expect(eia.getByText('No key set')).toBeTruthy();
  });

  it('says which NetRunner bots use Shodan, from the list missions choose tools by', () => {
    render(<KeysTab />);

    const text = screen.getByRole('group', { name: 'Shodan' }).textContent ?? '';
    expect(text).toMatch(/network/);
    expect(text).toMatch(/threat/);
    expect(text).not.toMatch(/identity/);
  });

  it('lists exactly the providers something in the app reads a key for', () => {
    // Read by code that nothing runs, so a field for it would promise nothing.
    const NOT_OFFERED: Record<string, string> = {
      censys: 'read only by CensysAdapter, which no mission, workflow or tool run ever calls',
      n2yo: "read only for SpaceAssetsDataProvider's ISS-position endpoint, which nothing requests",
      openweathermap: "read only by the globe engine's weather overlay, which nothing turns on, and a registry weather source nothing requests",
    };
    const read = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          for (const m of fs.readFileSync(full, 'utf8').matchAll(/resolveCredential\(\s*['"]([a-z0-9_-]+)['"]/g)) read.add(m[1]);
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));

    const expected = [...read].filter(id => !(id in NOT_OFFERED)).sort();
    expect(KEY_PROVIDERS.map(p => p.id).sort()).toEqual(expected);
  });
});

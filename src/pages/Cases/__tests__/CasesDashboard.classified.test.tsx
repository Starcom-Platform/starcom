/**
 * Editing a protected case used to destroy it, silently.
 *
 * The edit dialog seeded its description field straight from the stored record,
 * which for a protected case is ciphertext. An UNTOUCHED blob round-tripped
 * safely — encryptFieldIfProtected JSON.parses it, recognises the marker, and
 * passes it through. Edit one character and it is no longer valid JSON, so it
 * was treated as fresh plaintext, encrypted again, and
 * classifiedDataKeyStore.put overwrote the original key. That guard's own
 * comment describes the result: "permanently unrecoverable even though the
 * encryption appears to succeed with no error."
 *
 * decryptCaseDescription had existed since encryption-at-rest landed with only
 * test callers — no UI had ever exercised this boundary.
 *
 * Real persistence throughout, like the sibling create/edit suite. No mocks.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { isEncryptedAtRest } from '../../../services/intel/IntelWorkspaceManager';

// CasesDashboard navigates now (build-a-mission-from-this-case). Mocked rather
// than wrapping these real-persistence suites in the whole router provider.
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
// Show on globe needs the globe's providers, which this suite does not render.
// CasesDashboard.showOnGlobe.test.tsx renders the dashboard inside them.
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

const SECRET_BODY = 'Source METEOR reports movement at the northern crossing.';

/**
 * Creates a case marked 'protected' through the real dialog.
 *
 * Was a CONFIDENTIAL selection from a single "Classification" select. That
 * select is now two, labelled for what they do — Distribution and Sensitivity
 * — and 'protected' is the value that fires encryption at rest, which is what
 * this suite is about. Same boundary, stated in terms of the effect.
 */
async function createClassifiedCase(title: string) {
  fireEvent.click(await screen.findByRole('button', { name: /new case/i }));
  const dialog = await screen.findByRole('dialog');

  fireEvent.change(within(dialog).getByLabelText(/^title/i), { target: { value: title } });
  fireEvent.change(within(dialog).getByLabelText(/^description/i), { target: { value: SECRET_BODY } });
  fireEvent.mouseDown(within(dialog).getByLabelText(/^sensitivity/i));
  fireEvent.click(await screen.findByRole('option', { name: /^protected/i }));

  // Asked every time (plan item 0.5): nothing is chosen until someone chooses.

  fireEvent.click(within(dialog).getByRole('radio', { name: /^Public/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));
  // Closing waits on a save and MUI's exit transition; one second (the default) is not enough under full-suite load.
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
  return title;
}

const openEditFor = async (title: string) => {
  // By accessible name, not DOM index. The sibling suite selects iconButtons[1],
  // which silently retargets the moment a button is inserted — and while
  // writing this, an index-based selector picked Delete instead of Edit.
  await screen.findByText(title);
  fireEvent.click(screen.getByRole('button', { name: `Edit ${title}` }));
  return screen.findByRole('dialog');
};

describe('CasesDashboard — a protected case is never shown or saved as ciphertext', () => {
  it('stores the description encrypted at rest in the first place', async () => {
    render(<CasesDashboard />);
    const title = await createClassifiedCase(`Encrypted At Rest ${Date.now()}`);

    const found = (await intelCaseService.listCases()).find(c => c.title === title)!;
    expect(found).toBeTruthy();
    expect(isEncryptedAtRest(found.description)).toBe(true);
    expect(found.description).not.toContain('METEOR');
  });

  it('shows the DECRYPTED text in the edit dialog, never the stored blob', async () => {
    render(<CasesDashboard />);
    const title = await createClassifiedCase(`Decrypts On Edit ${Date.now()}`);

    const dialog = await openEditFor(title);

    await waitFor(() =>
      expect((within(dialog).getByTestId('case-description-input') as HTMLTextAreaElement).value)
        .toBe(SECRET_BODY)
    );
    expect(dialog.textContent).not.toContain('__classifiedEncrypted');
  });

  it('round-trips an edit without destroying the record', async () => {
    // Deliberately edits the text. A test that opened and saved UNCHANGED would
    // pass against the bug too — the untouched blob survives the idempotency
    // guard, which is exactly what made this invisible.
    render(<CasesDashboard />);
    const title = await createClassifiedCase(`Round Trip ${Date.now()}`);

    const dialog = await openEditFor(title);
    await waitFor(() =>
      expect((within(dialog).getByTestId('case-description-input') as HTMLTextAreaElement).value).toBe(SECRET_BODY)
    );
    fireEvent.change(within(dialog).getByTestId('case-description-input'), {
      target: { value: `${SECRET_BODY} Updated.` },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    // Closing waits on a save and MUI's exit transition; one second (the default) is not enough under full-suite load.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });

    const saved = (await intelCaseService.listCases()).find(c => c.title === title)!;
    expect(isEncryptedAtRest(saved.description)).toBe(true);
    const recovered = await intelCaseService.decryptCaseDescription(saved.id);
    expect(recovered).toBe(`${SECRET_BODY} Updated.`);
  });

  it('never renders the stored blob in the table', async () => {
    render(<CasesDashboard />);
    const title = await createClassifiedCase(`Table Safe ${Date.now()}`);

    const row = (await screen.findByText(title)).closest('tr')!;
    expect(row.textContent).toContain('Description encrypted');
    expect(row.textContent).not.toContain('__classifiedEncrypted');
    // Not "open to view": decryptCaseDescription returns null when the key is
    // gone, so the table must not promise what the dialog may retract.
    expect(row.textContent).not.toMatch(/open to view/i);
  });

  it('does not search inside ciphertext, and says so', async () => {
    render(<CasesDashboard />);
    await createClassifiedCase(`Search Safe ${Date.now()}`);

    // A fragment that appears only inside the encrypted body.
    fireEvent.change(await screen.findByPlaceholderText(/search/i), {
      target: { value: 'METEOR' },
    });

    await waitFor(() => expect(screen.getByTestId('unsearchable-notice')).toBeTruthy());
    expect(screen.getByTestId('unsearchable-notice').textContent).toMatch(/not searched/i);
  });
});

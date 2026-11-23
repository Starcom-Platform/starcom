/**
 * The label beside a note that names a person (decision D-NP, NP1): its original source named, and nothing for a
 * note its publisher did not tag.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NamesPeopleLabel } from '../NamesPeopleLabel';

describe('NamesPeopleLabel', () => {
  it('names the original source, as its host', () => {
    render(<NamesPeopleLabel namesPeople sources={['https://www.reuters.com/world/x', 'https://apnews.com/y']} />);
    expect(screen.getByTestId('names-people-label').textContent).toBe('names a person, as reuters.com names them');
  });

  it('says "its source" for a note with no link that can be read', () => {
    render(<NamesPeopleLabel namesPeople sources={['javascript:alert(1)']} />);
    expect(screen.getByTestId('names-people-label').textContent).toBe('names a person, as its source names them');
  });

  it('is not there for a note that names no one', () => {
    render(<NamesPeopleLabel sources={['https://www.reuters.com/world/x']} />);
    expect(screen.queryByTestId('names-people-label')).toBeNull();
  });
});

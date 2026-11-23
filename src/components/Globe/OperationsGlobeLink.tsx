/**
 * A click on a campaign or an operation on the globe opens it in Operations (decision D-RS, RS25): its note set
 * carries the Operations panel, which this hands to the Missions app's tab, the first of a place's items opened.
 */
import { useEffect } from 'react';
import { closeGlobeNotes, useGlobeNotes } from '../../features/globe/noteDetail/globeNoteStore';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';

export const OperationsGlobeLink: React.FC = () => {
  const { open, index } = useGlobeNotes();
  const { navigateToApp } = useApplicationRouter();
  useEffect(() => {
    if (open?.panel !== 'operations') return;
    const address = open.notes[index]?.id;
    closeGlobeNotes();
    if (address) navigateToApp('teamworkspace', undefined, { initialTab: 'operations', openRoster: address });
  }, [open, index, navigateToApp]);
  return null;
};

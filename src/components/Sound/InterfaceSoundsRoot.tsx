import React, { useEffect } from 'react';
import { installInterfaceSounds } from '../../services/audio/interfaceSounds';

/**
 * The interface's sounds for the whole app: one set of listeners on the
 * document, which hear every control (services/audio/interfaceSounds.ts).
 * Silent until sound is turned on.
 */
const InterfaceSoundsRoot: React.FC = () => {
  useEffect(() => installInterfaceSounds(document), []);
  return null;
};

export default InterfaceSoundsRoot;

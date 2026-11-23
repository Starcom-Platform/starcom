import React from 'react';
import { Typography } from '@mui/material';
import KeyName from '../../../components/Identity/KeyName';
import type { PackageClaim } from '../../../services/intel/missionLabels';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { fillNodes } from '../../../i18n/app/fillNodes';

/**
 * Who has publicly taken up a package (D-MX, MX1): one entry per key, its
 * claim unexpired and not released. Private claims go to the poster alone,
 * gift-wrapped, and are never seen here, so the count is of public claims and
 * says so. Where the package carries its publisher's own count of who is taking
 * part (NavCom's taking_part, MX28), that count leads: it alone is whole.
 *
 * Before any relay has sent all it holds, it says nothing: no claims seen
 * then would only mean nothing has been read yet.
 */
const PackageClaims: React.FC<{
  claims: PackageClaim[];
  answered: boolean;
  /** The publisher's own count, from the package's taking_part tag. */
  takingPart?: { operators: number; agents: number } | null;
  testId?: string;
}> = ({ claims, answered, takingPart, testId = 'package-claims' }) => {
  const { m: { missionParts: t } } = useMessages();
  const byPublisher = takingPart ? (
    <Typography variant="body2" component="div" data-testid={`${testId}-taking-part`}>
      {fill(t.takingPart, { operators: counted(t.takingOperators, takingPart.operators), agents: counted(t.takingAgents, takingPart.agents) })}
    </Typography>
  ) : null;
  if (claims.length === 0) {
    if (byPublisher) return byPublisher;
    return answered ? (
      <Typography variant="caption" color="text.secondary" component="div" data-testid={testId}>
        {t.noClaims}
      </Typography>
    ) : null;
  }
  return (
    <>
    {byPublisher}
    <Typography variant="body2" component="div" data-testid={testId}>
      {fillNodes(counted(t.claims, claims.length, { who: '{who}' }), {
        who: (
          <>
            {claims.map((claim, i) => (
              <span key={claim.pubkey}>
                {i > 0 && ', '}
                <KeyName pubkey={claim.pubkey} />
                {claim.agent && ` ${fill(t.agentNote, { agent: claim.agent })}`}
              </span>
            ))}
          </>
        ),
      })}
    </Typography>
    </>
  );
};

export default PackageClaims;

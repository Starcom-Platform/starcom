import React, { useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { Download } from 'lucide-react';
import { makeBundleOf } from '../../../services/intel/bundles/collectBundle';
import { bundleRefusal, exportRefusal, type WithheldRecord } from '../../../services/intel/bundles/bundleDistribution';
import type { BundleSubjectType } from '../../../services/exchange/bundle';
import type { InformationVisibility } from '../../../types/intel/IntelItemUI';
import AskDistributionDialog from '../../Shared/AskDistributionDialog';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import type { Messages } from '../../../i18n/app/en';

/** What stayed out of a file, named for the person who made it, in the words of the language shown. */
function staysHereWords(t: Messages['bundles'], withheld: readonly WithheldRecord[]): string {
  const records = withheld.map((w) => fill(t.withheld, { kind: t.withheldKinds[w.type], title: w.title }));
  return counted(t.staysHere, withheld.length, { records: records.join(', ') });
}

/**
 * Export as file (plan item 2.4), under the rule sending follows (plan item
 * 9.13): a Private case or mission stays here, one nobody has decided on is
 * asked about first, and the Private records it cites stay out of the file,
 * named here for the person who made it.
 */
const BundleExportButton: React.FC<{
  subject: { type: BundleSubjectType; id: string };
  number?: string;
  /** The case's or mission's distribution: undefined until someone chooses. */
  distribution: InformationVisibility | undefined;
  /** Keeps a choice on the record. Rejects, in words, when it could not. */
  onChooseDistribution?: (visibility: InformationVisibility) => Promise<void>;
  /** Why it cannot be chosen here, and what to do instead: a locked mission. */
  distributionLocked?: string | null;
}> = ({ subject, number, distribution, onChooseDistribution, distributionLocked }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The rule working, not a failure: said as plainly, without the alarm.
  const [refused, setRefused] = useState<string | null>(null);
  const [staysHere, setStaysHere] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const { m: { bundles: t, reasons } } = useMessages();

  const exportFile = async () => {
    setBusy(true);
    try {
      const { file, withheld } = await makeBundleOf(subject);
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${number || subject.id}.starcom-bundle.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
      if (withheld.length > 0) setStaysHere(staysHereWords(t, withheld));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    setError(null);
    setRefused(null);
    setStaysHere(null);
    if (distribution === undefined) { setAsking(true); return; }
    const refusal = exportRefusal(subject.type, distribution, reasons);
    if (refusal) { setRefused(refusal); return; }
    void exportFile();
  };

  const choose = async (visibility: InformationVisibility) => {
    if (!onChooseDistribution) return;
    setBusy(true);
    try {
      await onChooseDistribution(visibility);
    } catch (e) {
      setAsking(false);
      setBusy(false);
      setError(fill(t.notSaved, { reason: e instanceof Error ? e.message : String(e) }));
      return;
    }
    setAsking(false);
    const refusal = exportRefusal(subject.type, visibility, reasons);
    if (refusal) { setBusy(false); setRefused(refusal); return; }
    await exportFile();
  };

  return (
    <Stack spacing={1}>
      <Button
        size="small"
        startIcon={<Download size={16} />}
        disabled={busy}
        onClick={start}
        title={t.exportMeans}
        data-testid="export-bundle"
      >
        {t.exportButton}
      </Button>
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {refused && <Alert severity="info" role="alert">{refused}</Alert>}
      {staysHere && <Alert severity="info" data-testid="export-bundle-stays">{staysHere}</Alert>}
      <AskDistributionDialog
        open={asking}
        title={t.exportTitle[subject.type]}
        what={subject.type}
        reason={bundleRefusal(subject.type, undefined, reasons) ?? ''}
        onChoose={(visibility) => void choose(visibility)}
        onCancel={() => setAsking(false)}
        busy={busy}
        lockedBecause={distributionLocked ?? (onChooseDistribution ? null : t.chooseWhereEdited[subject.type])}
        testId="export-bundle-ask"
      />
    </Stack>
  );
};

export default BundleExportButton;

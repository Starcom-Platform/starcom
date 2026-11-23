/** The cloud providers' names, as they name themselves in every language (decision D-ML, T3). */
import type { CloudProvider } from '../../services/translation/cloudTranslator';

export const PROVIDER_NAMES: Record<CloudProvider, string> = {
  azure: 'Microsoft Azure Translator',
  google: 'Google Cloud Translation',
};

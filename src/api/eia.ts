// src/api/eia.ts
import axios from 'axios';
import { resolveCredential } from '../shared/config/userCredentialStore';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'eia' });

const API_BASE_URL = 'https://api.eia.gov/v2';
/**
 * No hardcoded fallback.
 *
 * This read `env.eiaApiKey || '<a real EIA key>'` — a live credential committed
 * to source, and therefore compiled into the shipped bundle. Verified: that
 * string was present in two files under dist/.
 *
 * A fallback key is worse than no key. It makes the unconfigured path silently
 * work, so nobody notices the credential is missing, and every deployment of
 * every fork shares one quota belonging to whoever created it. When it is
 * eventually revoked, the failure appears everywhere at once with no local
 * cause.
 *
 * Resolved through the user's own credential first — see userCredentialStore.
 */
/**
 * Resolved per request, not once at import.
 *
 * As a module-level constant this was read the first time anything imported
 * this file — before the user could possibly have entered a key. Saving one in
 * the provider panel then changed nothing until a full page reload, so the
 * feature would have looked broken to the only people it exists for.
 */
const apiKey = (): string => resolveCredential('eia').value ?? '';

/** Whether this browser holds an EIA key to ask with. Read per call, like the key. */
export const isEIAConfigured = (): boolean => apiKey() !== '';

export const fetchEIAData = async (endpoint: string, params: Record<string, string> = {}) => {
    /*
     * No key, no request. This used to send `api_key=` empty, and EIA answered
     * every one with 403 — about twenty series every five minutes, per open
     * tab, each logged as an API failure, for a request whose answer was known
     * before it left. Not configured is a state to report, not an outage to
     * rediscover on a timer.
     */
    if (!isEIAConfigured()) return null;
    try {
        const response = await axios.get(`${API_BASE_URL}/${endpoint}`, {
            params: {
                api_key: apiKey(),
                ...params,
            },
        });
        return response.data.response?.data || [];
    } catch (error) {
        log.error('EIA API Fetch Error:', error);
        return null;
    }
};
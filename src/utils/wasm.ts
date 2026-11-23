import init, * as wasmModule from "../wasm/wasm_mini_server.js";
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'wasm' });

let wasmReady = false;

/**
 * Initialize the WASM Mini-Server.
 * Ensures that the WASM module is loaded only once.
 */
export const initializeWASM = async () => {
  if (!wasmReady) {
    await init();
    log.debug("✅ WASM Mini-Server Initialized");
    wasmReady = true;
  } else {
    log.debug("WASM Mini-Server is still initialized");
  }
};

/**
 * Fetch data via WASM Mini-Server.
 * @param url - The API endpoint
 * @returns The fetched data
 */
export const fetchFromMiniServer = async (url: string) => {
  await initializeWASM();
  log.debug(`🚀 Fetching data from WASM: ${url}`);
  const response = await wasmModule.get_api_data(url);
  return response.json();
};

/**
 * Manually clear the cache for a specific URL.
 * @param url - The API endpoint to clear cache for
 */
export async function clearMiniServerCache(url: string): Promise<void> {
  await initializeWASM();
  await wasmModule.clear_cache(url);
  log.debug(`🗑️ Cache cleared for ${url}`);
}

/**
 * Cleanup all expired cache entries.
 */
export async function cleanupMiniServerCache(): Promise<void> {
  await initializeWASM();
  await wasmModule.cleanup_cache();
  log.debug("♻️ Cleanup expired cache");
}
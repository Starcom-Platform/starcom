/**
 * Register the service worker, in production only.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Starcom already ships a web app manifest with icons and display: standalone,
 * so browsers offer to install it and it gets its own window. With no service
 * worker it did not work offline — the install was a shortcut to a page that
 * still needed the network, which makes "downloadable web app" half true.
 *
 * That half matters more here than for most applications. A decentralised
 * intelligence tool that stops working when connectivity does contradicts its
 * own premise, and the people most likely to be offline — in the field, behind
 * a filter, on a metered connection — are the ones it exists for.
 *
 * ─── WHY NOT IN DEVELOPMENT ────────────────────────────────────────────────
 *
 * A service worker in dev serves yesterday's bundle over today's edit, and the
 * symptom is a change that "did not apply". Registering only in production
 * avoids a class of debugging that has nothing to teach.
 */

export type RegistrationOutcome = 'registered' | 'skipped-dev' | 'unsupported' | 'failed';

export async function registerServiceWorker(): Promise<RegistrationOutcome> {
  if (import.meta.env.DEV) return 'skipped-dev';

  // Absent in older browsers and disabled outright in a Firefox private
  // window. Neither is an error worth surfacing: the application works, it
  // simply will not work offline.
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    // A waiting worker means a new build is ready behind the running one.
    // Updating immediately is safe here because the worker uses network-first
    // for navigations, so it cannot pin an old shell.
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          void registration.update();
        }
      });
    });

    return 'registered';
  } catch {
    // Registration fails behind some proxies and on non-secure origins. The
    // application is unaffected; only offline capability is lost.
    return 'failed';
  }
}

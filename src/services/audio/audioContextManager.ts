import { emitAudioTelemetry } from './audioTelemetry';
import { getSingleton } from '../../utils/singleton';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'audioContextManager' });

export interface AudioSlot {
  context: AudioContext;
  release: () => void;
}

interface AudioContextManagerConfig {
  maxConcurrentSources?: number;
  idleCloseMs?: number;
}

export class AudioContextManager {
  private context: AudioContext | null = null;
  private activeSources = 0;
  /**
   * `ReturnType<typeof setTimeout>` rather than `number`.
   *
   * The browser returns a number and Node returns a Timeout object, and this
   * module is compiled against both. Pinning it to `number` forced the
   * `window.`-scoped call that made the idle close depend on which timer
   * globals a test runner had replaced.
   */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxConcurrentSources: number;
  private readonly idleCloseMs: number;
  private capWarningIssued = false;

  constructor(config: AudioContextManagerConfig = {}) {
    this.maxConcurrentSources = config.maxConcurrentSources ?? 6;
    this.idleCloseMs = config.idleCloseMs ?? 15000;
  }

  acquire(): AudioSlot | null {
    const context = this.ensureContext();
    if (!context) return null;

    if (this.activeSources >= this.maxConcurrentSources) {
      if (!this.capWarningIssued) {
        log.warn('AudioContextManager: concurrent source cap reached', {
          maxConcurrentSources: this.maxConcurrentSources
        });
        this.capWarningIssued = true;
      }
      emitAudioTelemetry({ type: 'source_rejected', reason: 'cap', activeSources: this.activeSources });
      return null;
    }

    this.capWarningIssued = false;
    this.activeSources += 1;
    this.clearIdleTimer();

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.activeSources = Math.max(0, this.activeSources - 1);
      if (this.activeSources === 0) {
        this.scheduleIdleClose();
      }
    };

    return { context, release };
  }

  async forceClose(): Promise<void> {
    this.clearIdleTimer();
    this.activeSources = 0;

    if (this.context) {
      try {
        await this.context.close();
        emitAudioTelemetry({ type: 'context_closed', reason: 'force' });
      } catch (error) {
        log.warn('AudioContextManager: error closing context', error);
      }
    }

    this.context = null;
  }

  getActiveSources(): number {
    return this.activeSources;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.context || this.context.state === 'closed') {
      const AudioContextCtor =
        window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextCtor) {
        log.warn('AudioContextManager: AudioContext unavailable in this environment');
        return null;
      }

      this.context = new AudioContextCtor();
      emitAudioTelemetry({ type: 'context_created', sampleRate: this.context.sampleRate });
    }

    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => {
        // Some browsers require a user gesture; swallow errors to keep UI responsive.
      });
    }

    return this.context;
  }

  private scheduleIdleClose(): void {
    if (!this.context) return;

    this.clearIdleTimer();
    /**
     * Plain `setTimeout`, not `window.setTimeout`.
     *
     * Identical in a browser, and better in two other places. A worker or an
     * SSR pass has no `window` and would throw here. And under a test runner,
     * fake timers replace the GLOBAL `setTimeout`; whether `window.setTimeout`
     * is the same object depends on state left by whichever file ran before,
     * so the idle close fired sometimes and not others — this was the last
     * nondeterministic test in the suite.
     */
    this.idleTimer = setTimeout(() => {
      if (this.activeSources === 0 && this.context) {
        void this.context.close().then(() => emitAudioTelemetry({ type: 'context_closed', reason: 'idle' })).catch(() => {});
        this.context = null;
      }
    }, this.idleCloseMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

export const audioContextManager = getSingleton('audio-context-manager', () => new AudioContextManager(), {
  warnOnReuse: true
});

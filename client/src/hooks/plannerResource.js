import { isPlannerVersion, plannerMutationOptions, plannerVersionSatisfies } from '../api/planner.js';
import { ApiError, KINDS } from '../api/errors.js';

// Each instance belongs to one authenticated account and one displayed snapshot.
export class PlannerResource {
  constructor({ read, select, onState = () => {}, requireVersion = true }) {
    Object.assign(this, { read, select, onState, requireVersion });
    this.state = { data: null, version: null, loading: false, hasLoaded: false };
    this.closed = false;
    this.sequence = 0;
    this.lifetime = new AbortController();
    this.initialRead = null;
  }
  emit(patch) {
    if (this.closed) return;
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }
  captureVersion() { return this.state.version ? { ...this.state.version } : null; }
  cancelRead() { this.sequence++; this.readController?.abort(); }
  close() { this.closed = true; this.cancelRead(); this.lifetime.abort(); }
  async refresh({ signal, minimumVersion } = {}) {
    if (this.closed || signal?.aborted) return false;
    if (minimumVersion && this.initialRead) await this.initialRead;
    if (this.closed || signal?.aborted) return false;
    if (minimumVersion && plannerVersionSatisfies(this.state.version, minimumVersion)) return true;
    const pending = this.readSnapshot({ signal, minimumVersion });
    if (!signal) this.initialRead = pending;
    try { return await pending; }
    finally { if (this.initialRead === pending) this.initialRead = null; }
  }
  async readSnapshot({ signal, minimumVersion } = {}) {
    if (this.closed || signal?.aborted) return false;
    this.cancelRead();
    const sequence = this.sequence;
    const controller = new AbortController();
    this.readController = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    this.emit({ loading: true });
    try {
      const result = await this.read({ signal: controller.signal, cache: 'no-store', redirect: 'manual' });
      if (this.closed || controller.signal.aborted || sequence !== this.sequence) return false;
      if (this.requireVersion && !isPlannerVersion(result.version)) throw new ApiError(KINDS.UNKNOWN);
      this.emit({ data: this.select(result), version: result.version ?? null, hasLoaded: true });
      return !minimumVersion || plannerVersionSatisfies(result.version, minimumVersion);
    } catch (error) {
      if (this.closed || controller.signal.aborted || sequence !== this.sequence) return false;
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (sequence === this.sequence) this.emit({ loading: false });
    }
  }
  async mutate(write, controls = {}) {
    if (this.closed) throw new DOMException('Account changed', 'AbortError');
    const { expectedVersion = this.captureVersion(), idempotencyKey = crypto.randomUUID() } = controls;
    const options = plannerMutationOptions(expectedVersion, idempotencyKey, { signal: this.lifetime.signal });
    this.cancelRead();
    this.emit({ loading: false });
    const result = await write(options);
    if (this.closed || options.signal.aborted) throw new DOMException('Account changed', 'AbortError');
    if (!isPlannerVersion(result?.resultVersion) || !isPlannerVersion(result?.currentVersion)) throw new ApiError(KINDS.UNKNOWN);
    return result;
  }
}

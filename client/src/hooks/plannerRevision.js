const INTERVAL_MS = 5000;
const MAX_BACKOFF_MS = 60000;
const sameVersion = (left, right) => left?.epoch === right?.epoch && left?.revision === right?.revision;

// One instance belongs to one authenticated account and is disposed on logout.
// Refresh callbacks receive an abort signal and must honor it before committing
// fetched data, so entering a form or switching accounts cannot overwrite drafts.
export class PlannerRevisionPoller {
  constructor({ readVersion, onChange, onState,
    schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
    cancel = timer => globalThis.clearTimeout(timer) }) {
    Object.assign(this, { readVersion, onChange, onState, schedule, cancel });
    this.state = { version: null, error: null, polling: false };
    this.active = false;
    this.visible = true;
    this.paused = false;
    this.failures = 0;
    this.timer = null;
    this.request = null;
    this.refreshRequest = null;
    this.delivered = null;
    this.pending = null;
  }

  publish(patch) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  start() {
    this.active = true;
    this.queuePoll(0);
  }

  stop() {
    this.active = false;
    this.cancel(this.timer);
    this.request?.abort();
    this.refreshRequest?.abort();
    this.request = this.refreshRequest = null;
    this.pending = null;
  }

  queuePoll(delay) {
    this.cancel(this.timer);
    if (this.active && this.visible) this.timer = this.schedule(() => this.refresh(), delay);
  }

  setVisible(visible) {
    if (this.visible === visible) return;
    this.visible = visible;
    if (visible) { this.queuePoll(0); this.flush(); return; }
    this.cancel(this.timer);
    this.request?.abort();
    this.refreshRequest?.abort();
    this.request = this.refreshRequest = null;
    this.publish({ polling: false });
  }

  setPaused(paused) {
    this.paused = paused;
    if (!paused) { this.flush(); return; }
    this.refreshRequest?.abort();
    this.refreshRequest = null;
  }

  accept(version) {
    const previous = this.state.version;
    if (previous?.epoch === version.epoch && previous.revision > version.revision) return;
    const current = { epoch: version.epoch, revision: version.revision };
    this.publish({ version: current });
    if (!sameVersion(this.delivered, current)) this.pending = current;
    this.flush();
  }

  async refresh() {
    this.cancel(this.timer);
    if (!this.active || !this.visible || this.request) return;
    const controller = new AbortController();
    this.request = controller;
    this.publish({ polling: true });
    try {
      const version = await this.readVersion({ signal: controller.signal });
      if (!this.active || this.request !== controller) return;
      this.failures = 0;
      this.publish({ error: null });
      this.accept(version);
    } catch (error) {
      if (!this.active || this.request !== controller || controller.signal.aborted) return;
      this.failures = Math.min(this.failures + 1, 4);
      this.publish({ error });
    } finally {
      if (this.active && this.request === controller) {
        this.request = null;
        this.publish({ polling: false });
        this.queuePoll(Math.min(INTERVAL_MS * 2 ** this.failures, MAX_BACKOFF_MS));
      }
    }
  }

  async flush() {
    if (!this.active || !this.visible || this.paused || !this.pending || this.refreshRequest) return;
    const current = this.pending;
    const controller = new AbortController();
    this.refreshRequest = controller;
    let succeeded = false;
    try {
      const applied = await this.onChange(current, { signal: controller.signal });
      if (applied === false || !this.active || this.refreshRequest !== controller) return;
      this.delivered = current;
      if (sameVersion(this.pending, current)) this.pending = null;
      succeeded = true;
    } catch (error) {
      if (this.active && this.refreshRequest === controller && !controller.signal.aborted) this.publish({ error });
    } finally {
      if (this.active && this.refreshRequest === controller) {
        this.refreshRequest = null;
        if (succeeded) this.flush();
      }
    }
  }
}

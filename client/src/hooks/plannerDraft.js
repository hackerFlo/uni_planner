// A form captures once when editing starts. Retry keys describe an exact intent.
export class PlannerDraft {
  constructor(version, uuid = () => crypto.randomUUID()) {
    this.version = version ? { ...version } : null;
    this.uuid = uuid;
  }
  controls(payload) {
    const intent = JSON.stringify(payload);
    if (intent !== this.intent) { this.intent = intent; this.key = this.uuid(); }
    return { expectedVersion: this.version ? { ...this.version } : null, idempotencyKey: this.key };
  }
}

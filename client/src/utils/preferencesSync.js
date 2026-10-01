import { api as defaultApi } from '../api/client.js';
import { ApiError, KINDS } from '../api/errors.js';
import { isPlannerVersion, plannerMutationOptions, plannerVersionSatisfies } from '../api/planner.js';
import { DEFAULT_PREFERENCES, loadPreferences, normalizePreferences,
  loadPreferenceProfile, savePreferenceProfile } from './preferences.js';

function settingsFromResponse(result, id) {
  const settings = result?.profile?.settings;
  const normalized = normalizePreferences(settings);
  if (result?.profile?.id !== id || !isPlannerVersion(result.version) || !settings
    || Object.keys(settings).length !== Object.keys(DEFAULT_PREFERENCES).length
    || Object.keys(normalized).some(key => settings[key] !== normalized[key])) throw new ApiError(KINDS.UNKNOWN);
  return normalized;
}

export class PreferencesSync {
  constructor({ accountId, api = defaultApi, storage, uuid = () => crypto.randomUUID(), onState, onError }) {
    Object.assign(this, { accountId, api, storage, uuid, onState, onError });
    this.marker = loadPreferenceProfile(accountId, storage)
      ?? { id: uuid(), initialized: false, settings: loadPreferences(storage) };
    this.state = { preferences: this.marker.settings, profileId: this.marker.id, ready: false, saving: false, error: null };
    this.controller = new AbortController();
    this.closed = false;
    this.version = null;
    this.loading = null;
    this.cacheWarning = false;
    this.saveCache();
  }

  publish(patch) {
    if (this.closed) return;
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  report(error) {
    if (this.closed || this.controller.signal.aborted) return;
    this.publish({ error });
    this.onError(error);
  }

  saveCache() {
    if (!savePreferenceProfile(this.accountId, this.marker, this.storage) && !this.cacheWarning) {
      this.cacheWarning = true;
      this.onError(new ApiError(KINDS.UNKNOWN, { message: 'This browser cannot store its preference profile. Changes sync, but a reload may require a new profile.' }));
    }
  }

  apply(result, signal) {
    if (this.closed || signal.aborted) return false;
    const preferences = settingsFromResponse(result, this.marker.id);
    this.version = { ...result.version };
    this.marker = { ...this.marker, initialized: true, settings: preferences };
    this.saveCache();
    this.publish({ preferences, ready: true, error: null });
    return true;
  }

  async fetchProfile(signal) {
    const options = { signal, cache: 'no-store', redirect: 'manual' };
    try { return await this.api.get(`/api/preferences/profiles/${this.marker.id}`, options); }
    catch (error) {
      if (error.status !== 404 || this.marker.initialized || this.closed || signal.aborted) throw error;
    }
    const { version } = await this.api.get('/api/planner/version', options);
    if (this.closed || signal.aborted) return null;
    const input = { id: this.marker.id, label: `Browser ${this.marker.id.slice(0, 8)}`, settings: this.marker.settings };
    return this.api.post('/api/preferences/profiles', input, plannerMutationOptions(version, this.uuid(), options));
  }

  async load({ signal = this.controller.signal, minimumVersion } = {}) {
    if (this.closed || this.state.saving || signal.aborted) return false;
    if (minimumVersion && this.loading) await this.loading;
    if (this.closed || this.state.saving || signal.aborted) return false;
    if (minimumVersion && this.state.ready && !this.state.error
      && plannerVersionSatisfies(this.version, minimumVersion)) return true;
    if (this.loading) return this.loading;
    this.publish({ ready: false });
    this.loading = this.fetchProfile(signal)
      .then(result => this.apply(result, signal)
        && (!minimumVersion || plannerVersionSatisfies(this.version, minimumVersion)))
      .catch(error => { if (!signal.aborted) this.report(error); return false; })
      .finally(() => { this.loading = null; });
    return this.loading;
  }

  async save(method, body, suffix = '') {
    if (this.closed) return false;
    if (!this.state.ready || this.state.saving) {
      this.report(new ApiError(KINDS.BAD_REQUEST, { message: this.state.error
        ? 'Reload preferences before editing them.' : 'Wait for preferences to finish loading or saving, then try again.' }));
      return false;
    }
    const options = plannerMutationOptions(this.version, this.uuid(), { signal: this.controller.signal });
    this.publish({ saving: true, error: null });
    try {
      const result = await this.api[method](`/api/preferences/profiles/${this.marker.id}${suffix}`, body, options);
      return this.apply(result, this.controller.signal);
    } catch (error) {
      this.report(error);
      if (error.status === 409) { this.publish({ saving: false }); await this.load(); }
      return false;
    } finally {
      this.publish({ saving: false });
    }
  }

  update(patch) { return this.save('patch', patch); }
  reset() { return this.save('post', {}, '/reset'); }
  close() { this.closed = true; this.controller.abort(); }
}

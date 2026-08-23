import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'hexaplanning.glowOverride.v1';

// Whether the map's filter-based glow effects (on-hold/done markers, priority border, progress
// arc) render at all. They're expensive to redraw on mobile GPUs (see map.component.scss), so
// this defaults to off on coarse-pointer (touch-primary) devices and on everywhere else - but is
// always user-overridable from the settings page, and that choice is remembered per-device
// (localStorage, not synced to the account) since it's about this device's rendering capability,
// not a user preference that should follow them everywhere.
@Injectable({ providedIn: 'root' })
export class GlowPreferenceService {
  private readonly _autoDefault = !window.matchMedia?.('(pointer: coarse)').matches;
  private readonly _override = signal<boolean | null>(this._readOverride());

  readonly enabled = computed(() => this._override() ?? this._autoDefault);
  // Whether the current effective value comes from an explicit user choice rather than the
  // device-based default - lets the settings UI show e.g. "(automatique)" when unset.
  readonly isOverridden = computed(() => this._override() !== null);

  setOverride(enabled: boolean | null): void {
    this._override.set(enabled);
    try {
      if (enabled === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
      }
    } catch {}
  }

  private _readOverride(): boolean | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw === null ? null : (JSON.parse(raw) as boolean);
    } catch {
      return null;
    }
  }
}

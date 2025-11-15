import { Injectable } from '@angular/core';
import { Hex } from '../models/hex.model';

export interface PersistedHex {
  q: number;
  r: number;
  s: number;
  level: number;
  isInitial?: boolean;
  questId?: string;
}

export interface MapStatePayload {
  hexes: PersistedHex[];
  width: number;
  height: number;
}

const MAP_STATE_KEY = 'hexaplanning.mapState.v1';

@Injectable({ providedIn: 'root' })
export class PersistenceService {
  saveMap(hexes: Hex[], width: number, height: number): void {
    try {
      const payload: MapStatePayload = {
        hexes: hexes.map(h => ({ q: h.q, r: h.r, s: h.s, level: h.level, isInitial: h.isInitial, questId: h.quest?.id })),
        width,
        height,
      };
      localStorage.setItem(MAP_STATE_KEY, JSON.stringify(payload));
    } catch (e) {
      // Ignore storage errors (quota, privacy mode)
      console.warn('Failed to persist map state', e);
    }
  }

  loadMap(): MapStatePayload | null {
    try {
      const raw = localStorage.getItem(MAP_STATE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as MapStatePayload;
    } catch {
      return null;
    }
  }

  clearMap(): void {
    try {
      localStorage.removeItem(MAP_STATE_KEY);
    } catch {}
  }
}

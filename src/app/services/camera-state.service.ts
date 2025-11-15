import { Injectable } from '@angular/core';

export interface CameraState {
  panX: number;
  panY: number;
  zoom: number;
}

@Injectable({ providedIn: 'root' })
export class CameraStateService {
  private cameraState: CameraState | null = null;
  private readonly STORAGE_KEY = 'hexaplanning.cameraState.v1';

  saveState(panX: number, panY: number, zoom: number): void {
    this.cameraState = { panX, panY, zoom };
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.cameraState));
    } catch {}
  }

  getState(): CameraState | null {
    if (this.cameraState) return this.cameraState;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CameraState;
      this.cameraState = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  clearState(): void {
    this.cameraState = null;
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {}
  }
}

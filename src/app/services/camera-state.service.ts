import { Injectable } from '@angular/core';

export interface CameraState {
  panX: number;
  panY: number;
  zoom: number;
}

@Injectable({ providedIn: 'root' })
export class CameraStateService {
  private cameraState: CameraState | null = null;

  saveState(panX: number, panY: number, zoom: number): void {
    this.cameraState = { panX, panY, zoom };
  }

  getState(): CameraState | null {
    return this.cameraState;
  }

  clearState(): void {
    this.cameraState = null;
  }
}

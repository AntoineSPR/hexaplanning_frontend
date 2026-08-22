import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly _isOnline = signal<boolean>(navigator.onLine);
  readonly isOnline = this._isOnline.asReadonly();
  readonly isOffline = computed(() => !this._isOnline());

  constructor() {
    window.addEventListener('online', () => this._isOnline.set(true));
    window.addEventListener('offline', () => this._isOnline.set(false));
  }

  reportNetworkSuccess(): void {
    this._isOnline.set(true);
  }

  reportNetworkFailure(): void {
    this._isOnline.set(false);
  }
}

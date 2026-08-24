import { Injectable, signal } from '@angular/core';
import { ThemeOutputDTO } from '../models/theme.model';

export type ThemeModalState =
  | { visible: false }
  | { visible: true; mode: 'create'; onCreated?: (theme: ThemeOutputDTO) => void }
  | { visible: true; mode: 'edit'; themeId: string; name: string; color: string };

// Single shared create/edit modal for themes, mounted once at the app root (see
// ThemeModalComponent), mirroring QuestGroupModalService. Unlike a group, a theme isn't spatial -
// creation needs no seed hex, just an optional callback so the caller (quest-details) can select
// the freshly created theme immediately.
@Injectable({ providedIn: 'root' })
export class ThemeModalService {
  private _state = signal<ThemeModalState>({ visible: false });
  public state = this._state.asReadonly();

  openCreate(onCreated?: (theme: ThemeOutputDTO) => void): void {
    this._state.set({ visible: true, mode: 'create', onCreated });
  }

  openEdit(theme: { id: string; name: string; color: string }): void {
    this._state.set({ visible: true, mode: 'edit', themeId: theme.id, name: theme.name, color: theme.color });
  }

  close(): void {
    this._state.set({ visible: false });
  }
}

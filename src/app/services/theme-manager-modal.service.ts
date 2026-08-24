import { Injectable, signal } from '@angular/core';

// Visibility for the theme-management list modal (see ThemeManagerModalComponent), reachable from
// Settings. Rename/recolor/delete only ever happen from here - the create/edit single-item dialog
// itself is the existing ThemeModalService/ThemeModalComponent, opened on top of this one for an
// individual row's edit action (or fresh, for "+ Nouveau thème").
@Injectable({ providedIn: 'root' })
export class ThemeManagerModalService {
  private _visible = signal(false);
  public visible = this._visible.asReadonly();

  open(): void {
    this._visible.set(true);
  }

  close(): void {
    this._visible.set(false);
  }
}

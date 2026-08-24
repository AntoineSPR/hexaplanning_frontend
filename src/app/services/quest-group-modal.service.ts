import { Injectable, signal } from '@angular/core';

export type QuestGroupModalState =
  | { visible: false }
  | { visible: true; mode: 'create'; hexAssignmentId: string }
  | { visible: true; mode: 'edit'; groupId: string; name: string; color: string };

// Single shared create/edit modal for quest groups, mounted once at the app root (see
// QuestGroupModalComponent) - both the map (editing an existing group) and quest-details
// (creating one from a selected quest, which isn't hosted inside the map) open it through this
// service rather than each owning their own dialog, since quest-details can also be reached from
// pages that never mount MapComponent (e.g. the quest list page).
@Injectable({ providedIn: 'root' })
export class QuestGroupModalService {
  private _state = signal<QuestGroupModalState>({ visible: false });
  public state = this._state.asReadonly();

  openCreate(hexAssignmentId: string): void {
    this._state.set({ visible: true, mode: 'create', hexAssignmentId });
  }

  openEdit(group: { id: string; name: string; color: string }): void {
    this._state.set({ visible: true, mode: 'edit', groupId: group.id, name: group.name, color: group.color });
  }

  close(): void {
    this._state.set({ visible: false });
  }
}

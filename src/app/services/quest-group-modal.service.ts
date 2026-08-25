import { Injectable, signal } from '@angular/core';

export type QuestGroupModalState = { visible: false } | { visible: true; groupId: string; name: string; color: string };

// Shared edit modal for an existing quest group (rename/recolor), mounted once at the app root
// (see QuestGroupModalComponent), triggered from the map. Group creation used to also go through
// this modal (seeded from quest-details), but now lives inline in GroupActionsModalComponent
// instead - see that component's own comment for why.
@Injectable({ providedIn: 'root' })
export class QuestGroupModalService {
  private _state = signal<QuestGroupModalState>({ visible: false });
  public state = this._state.asReadonly();

  openEdit(group: { id: string; name: string; color: string }): void {
    this._state.set({ visible: true, groupId: group.id, name: group.name, color: group.color });
  }

  close(): void {
    this._state.set({ visible: false });
  }
}

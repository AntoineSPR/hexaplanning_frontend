import { Injectable, signal } from '@angular/core';
import { QuestGroupOutputDTO } from '../models/quest-group.model';
import { QuestUpdateDTO } from '../models/quest.model';

export type GroupActionsModalState =
  | { visible: false }
  | {
      visible: true;
      currentGroup: QuestGroupOutputDTO | null;
      adjacentGroups: QuestGroupOutputDTO[];
      quest: QuestUpdateDTO;
      hexAssignmentId: string | null;
      onSuccess: () => void;
    };

// Drives the group-actions modal (see GroupActionsModalComponent), mounted once at the app root -
// same pattern as QuestGroupModalService. Unlike that one, this modal is self-contained (it makes
// its own leave/join/create API calls rather than the opener passing callbacks for each), since a
// successful action always closes quest-details too (see onSuccess) - there's nothing left for
// quest-details to resync once that happens.
@Injectable({ providedIn: 'root' })
export class GroupActionsModalService {
  private _state = signal<GroupActionsModalState>({ visible: false });
  public state = this._state.asReadonly();

  open(params: Omit<Extract<GroupActionsModalState, { visible: true }>, 'visible'>): void {
    this._state.set({ visible: true, ...params });
  }

  close(): void {
    this._state.set({ visible: false });
  }
}

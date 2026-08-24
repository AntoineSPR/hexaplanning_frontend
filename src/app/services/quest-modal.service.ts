import { Injectable, signal } from '@angular/core';
import { QuestUpdateDTO, QuestCreateDTO } from '../models/quest.model';

type QuestModalData = {
  quest: QuestUpdateDTO | QuestCreateDTO;
  isNew: boolean;
};

@Injectable({
  providedIn: 'root',
})
export class QuestModalService {
  private readonly _DEFAULT_QUEST: QuestCreateDTO = {
    title: '',
    estimatedTime: 0,
    description: '',
    statusId: '17c07323-d5b4-4568-b773-de3487ff30b1',
  };

  private _questModalVisible = signal<boolean>(false);
  private _questModalData = signal<QuestModalData>({
    quest: this._DEFAULT_QUEST,
    isNew: false,
  });
  // Fired once, right after a brand-new quest is successfully created through this modal - lets
  // a caller like MapComponent's "create & assign" button react without quest-details needing to
  // know anything about hexes or assignment.
  private _onQuestCreated: ((quest: QuestUpdateDTO) => void) | null = null;

  public questModalVisible = this._questModalVisible.asReadonly();
  public questModalData = this._questModalData.asReadonly();

  openQuestDetails(quest: QuestUpdateDTO, isNew = false): void {
    this._questModalData.set({ quest, isNew });
    this._questModalVisible.set(true);
  }

  openNewQuest(onCreated?: (quest: QuestUpdateDTO) => void): void {
    this._onQuestCreated = onCreated ?? null;
    this.openQuestDetails(this._DEFAULT_QUEST as QuestUpdateDTO, true);
  }

  notifyQuestCreated(quest: QuestUpdateDTO): void {
    this._onQuestCreated?.(quest);
    this._onQuestCreated = null;
  }

  closeQuestModal(): void {
    // Deliberately doesn't touch _onQuestCreated: quest-details closes the dialog optimistically,
    // right after firing the create request but before its response arrives, so clearing the
    // callback here would drop it before notifyQuestCreated ever gets to use it. openNewQuest
    // already resets it on open, and notifyQuestCreated clears it once it's actually used.
    this._questModalVisible.set(false);
    this._questModalData.set({ quest: this._DEFAULT_QUEST, isNew: false });
  }
}

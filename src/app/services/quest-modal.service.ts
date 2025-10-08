import { Injectable, signal } from '@angular/core';
import { Quest, QuestCreateDTO } from '../models/quest.model';

type QuestModalData = {
  quest: Quest | QuestCreateDTO;
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
    isDone: false,
    isAssigned: false,
  };

  private _questModalVisible = signal<boolean>(false);
  private _questModalData = signal<QuestModalData>({
    quest: this._DEFAULT_QUEST,
    isNew: false,
  });

  public questModalVisible = this._questModalVisible.asReadonly();
  public questModalData = this._questModalData.asReadonly();

  openQuestDetails(quest: Quest, isNew = false): void {
    this._questModalData.set({ quest, isNew });
    this._questModalVisible.set(true);
  }

  openNewQuest(): void {
    this.openQuestDetails(this._DEFAULT_QUEST as Quest, true);
  }

  closeQuestModal(): void {
    this._questModalVisible.set(false);
    this._questModalData.set({ quest: this._DEFAULT_QUEST, isNew: false });
  }
}

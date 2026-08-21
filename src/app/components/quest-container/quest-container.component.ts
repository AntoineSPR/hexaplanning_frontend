import { CommonModule } from '@angular/common';
import { Component, inject, ViewChild } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { QuestDetailsComponent } from '../quest-details/quest-details.component';
import { QuestModalService } from '../../services/quest-modal.service'; // Adjust the path as needed
import { QuestUpdateDTO } from '../../models/quest.model'; // Adjust the path as needed

@Component({
  selector: 'app-quest-container',
  standalone: true,
  imports: [DialogModule, CommonModule, QuestDetailsComponent],
  templateUrl: './quest-container.component.html',
  styleUrl: './quest-container.component.scss',
})
export class QuestContainerComponent {
  _questModalService = inject(QuestModalService);

  @ViewChild(QuestDetailsComponent) private _questDetails?: QuestDetailsComponent;

  get isVisible(): boolean {
    return this._questModalService.questModalVisible();
  }

  get quest(): QuestUpdateDTO {
    const quest = this._questModalService.questModalData().quest;
    return quest as QuestUpdateDTO;
  }

  get isNew(): boolean {
    return this._questModalService.questModalData().isNew;
  }

  // For the dismissable mask and Escape key: route through the same unsaved-changes
  // confirmation as the form's own return button, instead of discarding silently.
  handleVisibilityChange(visible: boolean): void {
    if (!visible) {
      if (this._questDetails) {
        this._questDetails.confirmClose();
      } else {
        this._questModalService.closeQuestModal();
      }
    }
  }
}

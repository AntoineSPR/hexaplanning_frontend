import { Component, Input, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { QuestUpdateDTO } from '../../models/quest.model';
import { CommonModule } from '@angular/common';
import { QuestModalService } from '../../services/quest-modal.service';
import { QuestService } from '../../services/quest.service';
import { ThemeService } from '../../services/theme.service';
import { MessageService } from 'primeng/api';
import { ThemeIconComponent } from '../theme-icon/theme-icon.component';

@Component({
  selector: 'app-quest-card',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, ThemeIconComponent],
  templateUrl: './quest-card.component.html',
  styleUrls: ['./quest-card.component.scss'],
})
export class QuestCardComponent {
  @Input() quest!: QuestUpdateDTO;

  private readonly _questModalService = inject(QuestModalService);
  protected readonly _questService = inject(QuestService);
  private readonly _themeService = inject(ThemeService);
  private readonly _messageService = inject(MessageService);

  toggleStatus(): void {
    if (this.quest && this.quest.statusId !== this._questService.statusDoneId) {
      this._questService.updateQuest({ ...this.quest, statusId: this._questService.statusDoneId }).subscribe(result => {
        this._messageService.add({
          severity: 'success',
          summary: 'Quête terminée !',
          detail: this.quest.title,
          life: 2000,
        });
      });
    } else {
      this._questService.updateQuest({ ...this.quest, statusId: this._questService.statusPendingId }).subscribe(result => {
        this._messageService.add({
          severity: 'success',
          summary: 'Quête réactivée',
          detail: this.quest.title,
          life: 2000,
        });
      });
    }
  }

  openDetails(): void {
    if (this.quest) {
      this._questModalService.openQuestDetails(this.quest);
    }
  }

  get themeColor(): string {
    const theme = this._themeService.themes()?.find(t => t.id === this.quest.themeId);
    return theme?.color ?? 'var(--theme-color)';
  }

  get themeAltText(): string {
    const theme = this._themeService.themes()?.find(t => t.id === this.quest.themeId);
    return theme?.name ?? 'Icône de thème';
  }

  get isInProgress(): boolean {
    return this.quest?.statusId === '2281c955-b3e1-49dc-be62-6a7912bb46b3';
  }

  get advancement(): number {
    return this.quest?.advancement ?? 0;
  }

  get isCompleted(): boolean {
    return this.quest?.statusId === '6662dfc1-9c40-4d78-806f-34cd22e07023';
  }

  get isOnHold(): boolean {
    return this.quest?.statusId === this._questService.statusOnHoldId;
  }

  // Primary quests keep the full hex badge; secondary ones get a plain dot in the same theme
  // color so the two roles read apart at a glance without needing to open the quest.
  get isSecondaryTheme(): boolean {
    return !!this.quest?.themeId && !this.quest?.isPrimaryTheme;
  }
}

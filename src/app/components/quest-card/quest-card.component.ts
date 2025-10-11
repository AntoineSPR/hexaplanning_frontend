import { Component, Input, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { QuestUpdateDTO } from '../../models/quest.model';
import { CommonModule } from '@angular/common';
import { QuestModalService } from '../../services/quest-modal.service';
import { QuestService } from '../../services/quest.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-quest-card',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './quest-card.component.html',
  styleUrls: ['./quest-card.component.scss'],
})
export class QuestCardComponent implements OnInit {
  @Input() quest!: QuestUpdateDTO;

  private readonly _questModalService = inject(QuestModalService);
  protected readonly _questService = inject(QuestService);
  private readonly _messageService = inject(MessageService);

  priorityOptions: string[] = [];
  priorityControl: FormControl = new FormControl();

  ngOnInit(): void {
    // this.priorityOptions = Object.values(QuestPriority);
    // this.priorityControl.setValue(this.quest?.priority ?? QuestPriority.TERTIARY);
  }

  toggleStatus(): void {
    if (this.quest && this.quest.statusId !== this._questService.statusDoneId) {
      this._questService.updateQuest({ ...this.quest, statusId: this._questService.statusDoneId }).subscribe(result => {
        this._messageService.add({
          severity: 'success',
          summary: 'Quête terminée !',
          detail: this.quest.title,
          life: 1500,
        });
      });
    } else {
      this._questService.updateQuest({ ...this.quest, statusId: this._questService.statusPendingId }).subscribe(result => {
        this._messageService.add({
          severity: 'success',
          summary: 'Quête réouverte',
          detail: this.quest.title,
          life: 1500,
        });
      });
    }
  }

  openDetails(): void {
    if (this.quest) {
      this._questModalService.openQuestDetails(this.quest);
    }
  }

  /** Récupération de la clé associée à la priorité */
  getPriorityKey(priorityValue: string): string {
    if (priorityValue && typeof priorityValue === 'string') {
      return priorityValue.toLowerCase();
    }
    return 'primary';
  }

  get priorityKey(): string {
    const priority = this._questService.priorities()?.find(p => p.id === this.quest.priorityId);
    return priority?.icon ?? 'Inconnu';
  }

  get priorityImagePath(): string {
    return `/icons/${this.priorityKey}.png`;
  }

  get priorityAltText(): string {
    return '';
    // return this.quest?.priority || 'Icône de priorité';
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
}

import { Component, Input, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { QuestPriority, Quest } from '../../models/quest.model';
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
  @Input() quest!: Quest;

  _questModalService = inject(QuestModalService);
  _questService = inject(QuestService);
  _messageService = inject(MessageService);

  priorityOptions: string[] = [];
  priorityControl: FormControl = new FormControl();

  ngOnInit(): void {
    this.priorityOptions = Object.values(QuestPriority);
    this.priorityControl.setValue(this.quest?.priority ?? QuestPriority.TERTIARY);
  }

  toggleStatus(): void {
    if (this.quest) {
      this._questService.updateQuest({ ...this.quest, isDone: !this.quest.isDone }).subscribe(result => {
        if (result.isDone) {
          this._messageService.add({
            severity: 'success',
            summary: 'Quête terminée !',
            detail: this.quest.title,
            life: 1500,
          });
        }
      });
    }
  }

  // updatePriority(): void {
  //   if (this.quest) {
  //     this.priorityChange.emit({ id: this.quest.id, priority: this.priorityControl.value });
  //   }
  // }

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
    return this.getPriorityKey(this.quest?.priority);
  }

  get priorityImagePath(): string {
    return `/icons/${this.priorityKey}.png`;
  }

  get priorityAltText(): string {
    return this.quest?.priority || 'Icône de priorité';
  }
}

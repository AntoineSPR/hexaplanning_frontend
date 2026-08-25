import { Component, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { QuestGroupModalService } from '../../services/quest-group-modal.service';
import { QuestGroupService } from '../../services/quest-group.service';
import { ConnectivityService } from '../../services/connectivity.service';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

// Edit modal for an existing quest group's name/color, mounted once at the app root, triggered
// from the map. Group creation used to also go through this modal (seeded from quest-details),
// but now lives inline in GroupActionsModalComponent instead - see that component's own comment.
@Component({
  selector: 'app-quest-group-modal',
  standalone: true,
  imports: [FormsModule, Dialog, InputTextModule, ColorPickerComponent],
  templateUrl: './quest-group-modal.component.html',
  styleUrl: './quest-group-modal.component.scss',
})
export class QuestGroupModalComponent {
  private readonly _modalService = inject(QuestGroupModalService);
  private readonly _questGroupService = inject(QuestGroupService);
  private readonly _messageService = inject(MessageService);
  readonly _connectivity = inject(ConnectivityService);

  @ViewChild('nameInput') nameInputRef?: ElementRef<HTMLInputElement>;

  private readonly DEFAULT_COLOR = '#7c3aed';

  name = '';
  color = this.DEFAULT_COLOR;

  constructor() {
    effect(() => {
      const state = this._modalService.state();
      if (!state.visible) return;
      this.name = state.name;
      this.color = state.color;
      // Same pattern as quest-details' own title autofocus: wait a frame for the dialog's open
      // transition to actually render the input before focusing it.
      requestAnimationFrame(() => this.nameInputRef?.nativeElement.focus());
    });
  }

  get isVisible(): boolean {
    return this._modalService.state().visible;
  }

  handleVisibleChange(visible: boolean): void {
    if (!visible) this._modalService.close();
  }

  cancel(): void {
    this._modalService.close();
  }

  confirm(): void {
    const trimmed = this.name.trim();
    if (!trimmed || this._connectivity.isOffline()) return;
    const state = this._modalService.state();
    if (!state.visible) return;

    this._questGroupService.updateQuestGroup({ id: state.groupId, name: trimmed, color: this.color }).subscribe({
      next: () => this._modalService.close(),
      error: err => {
        console.error('Failed to update quest group:', err);
        this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la modification du groupe', life: 2000 });
      },
    });
  }
}

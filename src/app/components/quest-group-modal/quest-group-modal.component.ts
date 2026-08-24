import { Component, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ColorPicker } from 'primeng/colorpicker';
import { MessageService } from 'primeng/api';
import { QuestGroupModalService } from '../../services/quest-group-modal.service';
import { QuestGroupService } from '../../services/quest-group.service';
import { QuestGroupGeometryService } from '../../services/quest-group-geometry.service';
import { HexService } from '../../services/hex.service';
import { QuestService } from '../../services/quest.service';
import { ConnectivityService } from '../../services/connectivity.service';

// Single shared modal for both creating a group (from quest-details, seeded by flood-fill from
// the quest's hex) and editing one (from the map). Mounted once at the app root - see
// QuestGroupModalService for why this can't just live inside MapComponent.
@Component({
  selector: 'app-quest-group-modal',
  standalone: true,
  imports: [FormsModule, Dialog, InputTextModule, ColorPicker],
  templateUrl: './quest-group-modal.component.html',
  styleUrl: './quest-group-modal.component.scss',
})
export class QuestGroupModalComponent {
  private readonly _modalService = inject(QuestGroupModalService);
  private readonly _questGroupService = inject(QuestGroupService);
  private readonly _questGroupGeometry = inject(QuestGroupGeometryService);
  private readonly _hexService = inject(HexService);
  private readonly _questService = inject(QuestService);
  private readonly _messageService = inject(MessageService);
  readonly _connectivity = inject(ConnectivityService);

  @ViewChild('nameInput') nameInputRef?: ElementRef<HTMLInputElement>;

  // Matches --neon-glow-color, the app's own default accent - a fresh group starts out matching
  // the theme rather than an arbitrary color.
  private readonly DEFAULT_COLOR = '#7c3aed';

  name = '';
  color = this.DEFAULT_COLOR;

  constructor() {
    effect(() => {
      const state = this._modalService.state();
      if (!state.visible) return;
      if (state.mode === 'edit') {
        this.name = state.name;
        this.color = state.color;
      } else {
        this.name = '';
        this.color = this.DEFAULT_COLOR;
      }
      // Same pattern as quest-details' own title autofocus: wait a frame for the dialog's open
      // transition to actually render the input before focusing it.
      requestAnimationFrame(() => this.nameInputRef?.nativeElement.focus());
    });
  }

  get isVisible(): boolean {
    return this._modalService.state().visible;
  }

  get isEdit(): boolean {
    const state = this._modalService.state();
    return state.visible && state.mode === 'edit';
  }

  get title(): string {
    return this.isEdit ? 'Modifier le groupe' : 'Créer un groupe';
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

    if (state.mode === 'edit') {
      this._questGroupService.updateQuestGroup({ id: state.groupId, name: trimmed, color: this.color }).subscribe({
        next: () => this._modalService.close(),
        error: err => {
          console.error('Failed to update quest group:', err);
          this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la modification du groupe', life: 2000 });
        },
      });
      return;
    }

    // Fresh assignments (rather than anything cached) so the flood-fill sees the map's true
    // current occupancy - neither this modal nor quest-details (which triggers it) has access to
    // MapComponent.hexes.
    this._hexService.getAllAssignments().subscribe({
      next: assignments => {
        const seed = assignments.find(a => a.id === state.hexAssignmentId);
        if (!seed) return;
        // Assignments carry no group info of their own - quests already in a group are excluded
        // here so the flood-fill can't reach into a neighboring group and pull its members away.
        const groupedQuestIds = new Set(this._questService.quests().filter(q => q.questGroupId).map(q => q.id));
        const cluster = this._questGroupGeometry.floodFillOccupiedCluster(seed, assignments, groupedQuestIds);
        const questIds = cluster.map(a => a.questId);

        this._questGroupService.createQuestGroup({ name: trimmed, color: this.color, questIds }).subscribe({
          next: () => {
            // Propagates each member's new questGroupId through the app reactively (the map's own
            // outline-recompute effect reacts to this).
            this._questService.refreshAllQuestLists();
            this._modalService.close();
            this._messageService.add({ severity: 'success', summary: 'Groupe créé', detail: trimmed, life: 2000 });
          },
          error: err => {
            console.error('Failed to create quest group:', err);
            this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la création du groupe', life: 2000 });
          },
        });
      },
      error: err => console.error('Failed to load assignments:', err),
    });
  }
}

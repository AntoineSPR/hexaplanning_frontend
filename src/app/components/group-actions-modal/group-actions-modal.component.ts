import { Component, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { GroupActionsModalService } from '../../services/group-actions-modal.service';
import { QuestGroupOutputDTO } from '../../models/quest-group.model';
import { QuestUpdateDTO } from '../../models/quest.model';
import { QuestService } from '../../services/quest.service';
import { QuestGroupService } from '../../services/quest-group.service';
import { QuestGroupGeometryService } from '../../services/quest-group-geometry.service';
import { HexService } from '../../services/hex.service';
import { ConnectivityService } from '../../services/connectivity.service';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

// Self-contained "leave / create / join" picker for a quest's group, opened from quest-details
// via a single icon-button (replacing the old inline .quest-group-panel, which grew unbounded -
// see quest-details.component.html's own comment on that former block). Fully self-contained
// (makes its own API calls) rather than routing through callbacks into quest-details, because a
// successful action always closes quest-details too (see onSuccess) - there's nothing left to
// resync there once that happens. Canceling from anywhere in this modal only closes itself,
// leaving quest-details exactly as it was.
@Component({
  selector: 'app-group-actions-modal',
  standalone: true,
  imports: [FormsModule, Dialog, InputTextModule, ColorPickerComponent],
  templateUrl: './group-actions-modal.component.html',
  styleUrl: './group-actions-modal.component.scss',
})
export class GroupActionsModalComponent {
  private readonly _modalService = inject(GroupActionsModalService);
  private readonly _questService = inject(QuestService);
  private readonly _questGroupService = inject(QuestGroupService);
  private readonly _questGroupGeometry = inject(QuestGroupGeometryService);
  private readonly _hexService = inject(HexService);
  private readonly _messageService = inject(MessageService);
  readonly _connectivity = inject(ConnectivityService);

  @ViewChild('nameInput') nameInputRef?: ElementRef<HTMLInputElement>;

  // Matches --neon-glow-color, the app's own default accent - a fresh group starts out matching
  // the theme rather than an arbitrary color.
  private readonly DEFAULT_COLOR = '#7c3aed';

  view: 'picker' | 'create' = 'picker';
  name = '';
  color = this.DEFAULT_COLOR;

  constructor() {
    effect(() => {
      const state = this._modalService.state();
      if (!state.visible) return;
      this.name = '';
      this.color = this.DEFAULT_COLOR;
      // If creating a group is the only thing this quest could possibly do here (ungrouped, no
      // adjacent group to join), skip straight to the create form instead of showing a picker
      // with a single option to click through.
      const onlyActionIsCreate = !state.currentGroup && state.adjacentGroups.length === 0 && !!state.hexAssignmentId;
      this.view = onlyActionIsCreate ? 'create' : 'picker';
      if (onlyActionIsCreate) {
        requestAnimationFrame(() => this.nameInputRef?.nativeElement.focus());
      }
    });
  }

  get isVisible(): boolean {
    return this._modalService.state().visible;
  }

  get currentGroup(): QuestGroupOutputDTO | null {
    const state = this._modalService.state();
    return state.visible ? state.currentGroup : null;
  }

  get adjacentGroups(): QuestGroupOutputDTO[] {
    const state = this._modalService.state();
    return state.visible ? state.adjacentGroups : [];
  }

  get hexAssignmentId(): string | null {
    const state = this._modalService.state();
    return state.visible ? state.hexAssignmentId : null;
  }

  handleVisibleChange(visible: boolean): void {
    if (!visible) this._modalService.close();
  }

  close(): void {
    this._modalService.close();
  }

  openCreateView(): void {
    if (!this.hexAssignmentId) return;
    this.view = 'create';
    requestAnimationFrame(() => this.nameInputRef?.nativeElement.focus());
  }

  private _currentQuest(): QuestUpdateDTO | null {
    const state = this._modalService.state();
    return state.visible ? state.quest : null;
  }

  private _succeed(): void {
    const state = this._modalService.state();
    this._modalService.close();
    if (state.visible) state.onSuccess();
  }

  leaveGroup(): void {
    const quest = this._currentQuest();
    if (this._connectivity.isOffline() || !quest?.questGroupId) return;

    const updatedQuest: QuestUpdateDTO = { ...quest, questGroupId: undefined };
    this._questService.updateQuest(updatedQuest).subscribe({
      next: () => {
        this._messageService.add({ severity: 'success', summary: 'Quête retirée du groupe', detail: quest.title, life: 2000 });
        this._succeed();
      },
      error: error => {
        console.error('Failed to leave quest group:', error);
        this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors du retrait du groupe', life: 2000 });
      },
    });
  }

  // Also reachable while already grouped (adjacentGroups excludes the quest's own current group -
  // see quest-details.component.ts's refreshAdjacentGroups), in which case this doubles as
  // "leave the current group and join this one instead": a plain questGroupId field change, same
  // as any other update, and the backend already reassigns/cleans up the previous group on its
  // own (see QuestService's update path) - no separate leave call needed.
  joinGroup(group: QuestGroupOutputDTO): void {
    const quest = this._currentQuest();
    if (this._connectivity.isOffline() || !quest || quest.questGroupId === group.id) return;

    const updatedQuest: QuestUpdateDTO = { ...quest, questGroupId: group.id };
    this._questService.updateQuest(updatedQuest).subscribe({
      next: () => {
        this._messageService.add({ severity: 'success', summary: 'Groupe rejoint', detail: group.name, life: 2000 });
        this._succeed();
      },
      error: error => {
        console.error('Failed to join quest group:', error);
        this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la jonction au groupe', life: 2000 });
      },
    });
  }

  createGroup(): void {
    const trimmed = this.name.trim();
    const hexAssignmentId = this.hexAssignmentId;
    const quest = this._currentQuest();
    if (!trimmed || !hexAssignmentId || !quest || this._connectivity.isOffline()) return;

    // Fresh assignments (rather than anything cached) so the flood-fill sees the map's true
    // current occupancy - this modal has no access to MapComponent.hexes.
    this._hexService.getAllAssignments().subscribe({
      next: assignments => {
        const seed = assignments.find(a => a.id === hexAssignmentId);
        if (!seed) return;
        // Assignments carry no group info of their own - quests already in a group are excluded
        // here so the flood-fill can't reach into a neighboring group and pull its members away.
        // The seed quest itself is excluded from that exclusion: a quest already in a group can
        // still start a new one here (leaving its old group, which the backend's
        // CreateQuestGroupAsync already reassigns/cleans up on its own - see that method's own
        // comment) - it just shouldn't drag its old groupmates along too.
        const groupedQuestIds = new Set(this._questService.quests().filter(q => q.questGroupId && q.id !== quest.id).map(q => q.id));
        const cluster = this._questGroupGeometry.floodFillOccupiedCluster(seed, assignments, groupedQuestIds);
        const questIds = cluster.map(a => a.questId);

        this._questGroupService.createQuestGroup({ name: trimmed, color: this.color, questIds }).subscribe({
          next: () => {
            // Propagates each member's new questGroupId through the app reactively (the map's own
            // outline-recompute effect reacts to this).
            this._questService.refreshAllQuestLists();
            this._messageService.add({ severity: 'success', summary: 'Groupe créé', detail: trimmed, life: 2000 });
            this._succeed();
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

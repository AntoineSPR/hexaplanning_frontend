import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  QueryList,
  signal,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { InputTextModule } from 'primeng/inputtext';
import { Textarea, TextareaModule } from 'primeng/textarea';
import { CalendarModule } from 'primeng/calendar';
import { SliderModule } from 'primeng/slider';
import { InputNumberModule } from 'primeng/inputnumber';
import { DEFAULT_ESTIMATED_TIME, QuestUpdateDTO, QuestCreateDTO } from '../../models/quest.model';
import { QuestGroupOutputDTO } from '../../models/quest-group.model';
import { ThemeOutputDTO } from '../../models/theme.model';
import { STATUS_COLORS } from '../../models/status-colors';
import { NgClass } from '@angular/common';
import { TimePipe } from '../../pipes/time.pipe';
import { QuestService } from '../../services/quest.service';
import { QuestModalService } from '../../services/quest-modal.service';
import { QuestGroupModalService } from '../../services/quest-group-modal.service';
import { QuestGroupService } from '../../services/quest-group.service';
import { ThemeService } from '../../services/theme.service';
import { ThemeModalService } from '../../services/theme-modal.service';
import { HexService } from '../../services/hex.service';
import { MapGridService } from '../../services/map-grid.service';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ProgressBarModule } from 'primeng/progressbar';
import { Router } from '@angular/router';
import { ConnectivityService } from '../../services/connectivity.service';
import { ThemeIconComponent } from '../theme-icon/theme-icon.component';

@Component({
  selector: 'app-quest-details',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    SelectModule,
    ToggleSwitchModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    SliderModule,
    NgClass,
    CalendarModule,
    TimePipe,
    ConfirmDialogModule,
    InputNumberModule,
    SliderModule,
    ProgressBarModule,
    ThemeIconComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: './quest-details.component.html',
  styleUrl: './quest-details.component.scss',
})
export class QuestDetailsComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) quest!: QuestUpdateDTO;
  @Input() isNew: boolean = false;
  @Output() closeDialog = new EventEmitter<void>();
  @ViewChildren(Textarea) textareas!: QueryList<Textarea>;
  @ViewChild('titleTextarea') titleTextarea!: ElementRef<HTMLTextAreaElement>;

  private readonly _formBuilder = inject(FormBuilder);
  private readonly _cdr = inject(ChangeDetectorRef);
  private readonly _questService = inject(QuestService);
  private readonly _questModalService = inject(QuestModalService);
  private readonly _questGroupModalService = inject(QuestGroupModalService);
  private readonly _questGroupService = inject(QuestGroupService);
  private readonly _themeService = inject(ThemeService);
  private readonly _themeModalService = inject(ThemeModalService);
  private readonly _hexService = inject(HexService);
  private readonly _mapGrid = inject(MapGridService);
  private readonly _confirmationService = inject(ConfirmationService);
  private readonly _messageService = inject(MessageService);
  private readonly _router = inject(Router);
  readonly _connectivity = inject(ConnectivityService);

  questForm!: FormGroup;
  statusOptions = this._questService.statuses();
  isEdit: boolean = false;

  // A getter (not a field snapshot) so a theme created mid-session - e.g. via
  // openThemeCreationModal below - immediately appears as a selectable/displayable option,
  // instead of the p-select being stuck with whatever the signal held at component construction.
  get themeOptions(): ThemeOutputDTO[] {
    return this._themeService.themes();
  }

  //#region Quest groups
  // "Create group" is offered when the quest is on the map and not already grouped; "Leave
  // group" instead when it is - the two are mutually exclusive.

  // `QuestUpdateDTO.hexAssignmentId` is never actually populated by the backend (GET /quest/{id}
  // only ever returns a nested `hexAssignment` object, never a flat id - the rest of this app
  // tracks map placement on the Hex object instead, which this globally-mounted component has no
  // access to). Resolved once per quest via the same endpoint the map itself has no need for,
  // since it already has this info locally.
  resolvedHexAssignmentId: string | null = null;

  get isOnMap(): boolean {
    return !!this.resolvedHexAssignmentId;
  }

  get isGrouped(): boolean {
    return !!this.quest?.questGroupId;
  }

  // Groups this quest is adjacent to but isn't a member of - populated once by
  // refreshAdjacentGroups (see ngOnInit). Only ever non-empty while ungrouped: a quest that's
  // adjacent to exactly one group already auto-joins it (see QuestAssignmentService's
  // reconcileGroupMembership, run on every drag/assignment), so this only comes up for the
  // genuinely ambiguous case that auto-attach deliberately leaves alone - a quest dropped between
  // two (or more) different groups at once, adjacent to all of them, joining none automatically.
  adjacentGroups: QuestGroupOutputDTO[] = [];

  // Opens the shared create/edit group modal (see QuestGroupModalService) seeded with this
  // quest's hex, and closes this dialog first so the two modals are never open at once.
  openGroupCreationModal(): void {
    if (this._connectivity.isOffline() || !this.resolvedHexAssignmentId) return;
    this._questGroupModalService.openCreate(this.resolvedHexAssignmentId);
    this.closeDialog.emit();
  }

  leaveGroup(): void {
    if (this._connectivity.isOffline() || !this.quest?.questGroupId) return;

    const updatedQuest: QuestUpdateDTO = { ...this.quest, questGroupId: undefined };
    this._questService.updateQuest(updatedQuest).subscribe({
      next: quest => {
        this.quest = quest;
        this._messageService.add({ severity: 'success', summary: 'Quête retirée du groupe', detail: this.quest.title, life: 2000 });
        this.refreshAdjacentGroups();
      },
      error: error => {
        console.error('Failed to leave quest group:', error);
        this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors du retrait du groupe', life: 2000 });
      },
    });
  }

  joinAdjacentGroup(group: QuestGroupOutputDTO): void {
    if (this._connectivity.isOffline() || this.quest?.questGroupId) return;

    const updatedQuest: QuestUpdateDTO = { ...this.quest, questGroupId: group.id };
    this._questService.updateQuest(updatedQuest).subscribe({
      next: quest => {
        this.quest = quest;
        this.adjacentGroups = [];
        this._messageService.add({ severity: 'success', summary: 'Groupe rejoint', detail: group.name, life: 2000 });
      },
      error: error => {
        console.error('Failed to join quest group:', error);
        this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la jonction au groupe', life: 2000 });
      },
    });
  }

  // Finds every distinct group among this quest's currently-occupied neighboring hexes, excluding
  // its own (there is none, since this is only ever called for an ungrouped quest - see ngOnInit
  // and leaveGroup). Requires a fresh assignments fetch (rather than anything cached) for the same
  // reason group creation's flood-fill does: MapComponent.hexes isn't reachable from here. Also
  // fetches the group list fresh rather than trusting QuestGroupService's cached signal, which is
  // only ever populated by MapComponent - this dialog can be opened without the map having loaded
  // first (e.g. from the quest list page), leaving that cache empty or stale.
  private refreshAdjacentGroups(): void {
    if (!this.resolvedHexAssignmentId || this.quest?.questGroupId) {
      this.adjacentGroups = [];
      return;
    }

    this._hexService.getAllAssignments().subscribe({
      next: assignments => {
        const seed = assignments.find(a => a.id === this.resolvedHexAssignmentId);
        if (!seed) {
          this.adjacentGroups = [];
          return;
        }

        const assignmentByCoord = new Map(assignments.map(a => [`${a.q},${a.r},${a.s}`, a]));
        const questsById = new Map(this._questService.quests().map(q => [q.id, q]));

        const neighborGroupIds = new Set<string>();
        for (const n of this._mapGrid.neighborsOf(seed, 1)) {
          const neighborAssignment = assignmentByCoord.get(`${n.q},${n.r},${n.s}`);
          const neighborQuest = neighborAssignment && questsById.get(neighborAssignment.questId);
          if (neighborQuest?.questGroupId) {
            neighborGroupIds.add(neighborQuest.questGroupId);
          }
        }

        if (neighborGroupIds.size === 0) {
          this.adjacentGroups = [];
          return;
        }

        this._questGroupService.getAllQuestGroups().subscribe({
          next: groups => {
            const groupsById = new Map(groups.map(g => [g.id, g]));
            this.adjacentGroups = [...neighborGroupIds].map(id => groupsById.get(id)).filter((g): g is QuestGroupOutputDTO => !!g);
          },
          error: error => console.error('Failed to load quest groups:', error),
        });
      },
      error: error => console.error('Failed to compute adjacent groups:', error),
    });
  }
  //#endregion

  //#region Themes
  get selectedTheme(): ThemeOutputDTO | null {
    const themeId = this.questForm.get('themeId')?.value;
    return this.themeOptions?.find(t => t.id === themeId) ?? null;
  }

  get themeColor(): string {
    return this.selectedTheme?.color ?? 'var(--theme-color)';
  }

  // Drives the role toggle: Secondaire sits on the left (unchecked), Principale on the right
  // (checked) - so "checked" maps directly onto isPrimaryTheme, no inversion needed.
  get isPrimaryToggleOn(): boolean {
    return !!this.questForm.get('isPrimaryTheme')?.value;
  }

  onThemeRoleToggle(checked: boolean): void {
    this.questForm.patchValue({ isPrimaryTheme: checked });
  }

  // Rename/recolor/delete are only ever done from the theme manager in Settings (see
  // ThemeManagerModalComponent) - a quest's own theme selector only ever creates.
  openThemeCreationModal(): void {
    if (this._connectivity.isOffline()) return;
    this._themeModalService.openCreate(theme => {
      this.questForm.patchValue({ themeId: theme.id, isPrimaryTheme: false });
    });
  }
  //#endregion

  ngOnInit(): void {
    this._router.events.subscribe(() => {
      this.onReturn();
    });

    this._createFormGroup();
    this.resetForm();
    this._setFormValues();

    if (!this.isNew && this.quest?.id) {
      this._hexService
        .getAssignmentByQuestId(this.quest.id)
        .pipe(catchError(() => of(null)))
        .subscribe(assignment => {
          this.resolvedHexAssignmentId = assignment?.id ?? null;
          this.refreshAdjacentGroups();
        });
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.textareas) {
        this.textareas.forEach(textarea => textarea.resize());
      }
      this._cdr.detectChanges();
    }, 100);

    // Focus management to override PrimeNG Dialog's automatic focus
    if (this.isEdit || this.isNew) {
      this.setTitleFocus();
    }
  }

  private setTitleFocus(): void {
    if (this.titleTextarea?.nativeElement) {
      // Remove focus from any currently focused element first
      if (document.activeElement && document.activeElement !== this.titleTextarea.nativeElement) {
        (document.activeElement as HTMLElement).blur();
      }

      // Use requestAnimationFrame for smooth focus transition
      requestAnimationFrame(() => {
        this.titleTextarea.nativeElement.focus();
        // If in edit mode, select the text for better UX
        if (this.isEdit || this.isNew) {
          this.titleTextarea.nativeElement.select();
        }
      });
    }
  }

  //#region Buttons
  onSubmit(): void {
    if (this._connectivity.isOffline()) return;

    this.questForm.markAllAsTouched();

    if (this.questForm.invalid) return;

    const formValues = {
      ...this.questForm.value,
      estimatedTime: this.dateToMinutes(this.questForm.value.estimatedTime),
    };

    if (this.isNew) {
      const newQuest: QuestCreateDTO = formValues;

      this._questService.createQuest(newQuest).subscribe({
        next: createdQuest => {
          this._questModalService.notifyQuestCreated(createdQuest);
          this._messageService.add({
            severity: 'success',
            summary: 'Quête créée',
            detail: newQuest.title,
            life: 2000,
          });
        },
        error: error => {
          this._messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Erreur lors de la création de la quête',
            life: 2000,
          });
        },
      });
    } else {
      const updatedQuest: QuestUpdateDTO = {
        ...this.quest,
        ...formValues,
      };

      const wasCompleted = this.quest.statusId === this._questService.statusDoneId;
      const isNowCompleted = updatedQuest.statusId === this._questService.statusDoneId;
      const justCompleted = !wasCompleted && isNowCompleted;

      this._questService.updateQuest(updatedQuest).subscribe({
        next: () => {
          if (justCompleted) {
            this._messageService.add({
              severity: 'success',
              summary: 'Quête terminée !',
              detail: this.quest.title,
              life: 2000,
            });
          } else {
            this._messageService.add({
              severity: 'success',
              summary: 'Quête mise à jour',
              detail: this.quest.title,
              life: 2000,
            });
          }
        },
        error: error => {
          this._messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Erreur lors de la mise à jour de la quête',
            life: 2000,
          });
        },
      });
    }

    this.isEdit = false;
    this.isNew = false;
    this.closeDialog.emit();
  }

  onCancel(): void {
    this._confirmDiscard(() => {
      if (this.isNew) {
        this.onReturn();
      } else if (this.isEdit) {
        this._setFormValues();
        this.isEdit = false;
      }
    });
  }

  onReturn(): void {
    this.isEdit = false;
    this.isNew = false;
    this.closeDialog.emit();
  }

  // Whether discarding right now would silently lose something: a brand-new quest that hasn't
  // been saved yet, or edits made to an existing one that haven't been submitted.
  hasUnsavedChanges(): boolean {
    return this.isNew || (this.isEdit && this.questForm.dirty);
  }

  // Single entry point for every way of leaving the form (the return button, clicking outside
  // the dialog, Escape, the Cancel button) so unsaved work always gets the same confirmation
  // before being dropped.
  confirmClose(): void {
    this._confirmDiscard(() => this.onReturn());
  }

  private _confirmDiscard(onAccept: () => void): void {
    if (!this.hasUnsavedChanges()) {
      onAccept();
      return;
    }
    this._confirmationService.confirm({
      message: 'Annuler les modifications non enregistrées ?',
      acceptLabel: 'Quitter',
      rejectLabel: 'Revenir',
      closable: true,
      closeOnEscape: true,
      accept: onAccept,
    });

    // Focus management for the confirmation dialog, matching onDelete()'s pattern
    setTimeout(() => {
      const acceptButton = document.querySelector('.accept-confirmation-button') as HTMLElement;
      if (acceptButton) {
        acceptButton.focus();
      }
    }, 100);
  }

  onDelete(): void {
    if (this._connectivity.isOffline()) return;

    this._confirmationService.confirm({
      message: 'Confimer la suppression ?',
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      closable: true,
      closeOnEscape: true,
      accept: () => {
        this._questService.deleteQuest(this.quest.id).subscribe({
          next: () => {
            this.isEdit = false;
            this.isNew = false;
            this.closeDialog.emit();
            this._messageService.add({
              severity: 'success',
              summary: 'Quête supprimée !',
              detail: this.quest.title,
              life: 2000,
            });
          },
          error: error => {
            console.error('Error deleting quest:', error);
            this._messageService.add({
              severity: 'error',
              summary: 'Erreur',
              detail: 'Erreur lors de la suppression de la quête',
              life: 2000,
            });
          },
        });
      },
    });

    // Focus management for the confirmation dialog
    setTimeout(() => {
      const acceptButton = document.querySelector('.accept-confirmation-button') as HTMLElement;
      if (acceptButton) {
        acceptButton.focus();
      }
    }, 100);
  }

  onEdit(): void {
    if (this._connectivity.isOffline()) return;

    this.isEdit = true;
    // Focus on title when entering edit mode
    this.setTitleFocus();
  }

  //#region Date & Time
  /** Conversion des minutes en objet Date */
  minutesToDate(minutes: number): Date {
    if (!minutes) return new Date(0, 0, 0, 0, 0);

    const date = new Date();
    date.setHours(Math.floor(minutes / 60));
    date.setMinutes(minutes % 60);
    date.setSeconds(0);
    return date;
  }

  /** Conversion d'un objet Date en minutes */
  dateToMinutes(date: Date): number {
    if (!date) return 0;
    return date.getHours() * 60 + date.getMinutes();
  }

  //#region Initialization
  resetForm(): void {
    if (this.isNew) {
      this.questForm.reset();
      this.isEdit = true;
    }
  }

  private _createFormGroup(): void {
    this.questForm = this._formBuilder.group({
      title: new FormControl('', [Validators.required, Validators.maxLength(100)]),
      description: new FormControl(''),
      estimatedTime: new FormControl(''),
      themeId: new FormControl<string | null>(null),
      isPrimaryTheme: new FormControl(false),
      statusId: new FormControl('', Validators.required),
      advancement: new FormControl(0),
    });
  }

  private _setFormValues(): void {
    this.questForm.setValue({
      title: this.quest?.title ?? '',
      description: this.quest?.description ?? '',
      estimatedTime: this.minutesToDate(this.quest?.estimatedTime ?? DEFAULT_ESTIMATED_TIME),
      themeId: this.quest?.themeId ?? null,
      isPrimaryTheme: this.quest?.isPrimaryTheme ?? false,
      statusId: this.quest?.statusId ?? this.defaultStatus,
      advancement: this.quest?.advancement ?? 0,
    });
    // setValue() doesn't clear the dirty flag on its own; without this, hasUnsavedChanges()
    // would keep reporting stale edits as "unsaved" after they've just been reverted here
    // (e.g. edit -> cancel -> re-edit -> cancel again with no new changes).
    this.questForm.markAsPristine();
  }

  onAdvancementChange(event: any) {
    this.questForm.patchValue({ advancement: event.value });
  }

  //#endregion

  get hasEstimatedTime(): boolean {
    const estimatedTime = this.quest?.estimatedTime ?? 0;
    return estimatedTime > 0;
  }

  get hasDescription(): boolean {
    const description = this.quest?.description ?? '';
    return description.trim().length > 0;
  }

  get isInProgress(): boolean {
    const statusId = this.questForm.get('statusId')?.value ?? this.quest?.statusId;
    return statusId === '2281c955-b3e1-49dc-be62-6a7912bb46b3';
  }

  get defaultStatus() {
    return '17c07323-d5b4-4568-b773-de3487ff30b1';
  }

  get statusColor() {
    return STATUS_COLORS[this.quest.statusId] ?? '#f7f6f6ff';
  }

  getStatusName(statusId: string): string {
    const status = this.statusOptions?.find(s => s.id === statusId);
    return status ? status.name : 'Inconnu';
  }
}

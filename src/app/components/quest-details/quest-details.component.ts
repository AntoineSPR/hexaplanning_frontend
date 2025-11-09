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
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { Textarea, TextareaModule } from 'primeng/textarea';
import { CalendarModule } from 'primeng/calendar';
import { SliderModule } from 'primeng/slider';
import { InputNumberModule } from 'primeng/inputnumber';
import { DEFAULT_ESTIMATED_TIME, QuestUpdateDTO, QuestCreateDTO } from '../../models/quest.model';
import { NgClass } from '@angular/common';
import { TimePipe } from '../../pipes/time.pipe';
import { QuestService } from '../../services/quest.service';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ProgressBarModule } from 'primeng/progressbar';
import { Router } from '@angular/router';

@Component({
  selector: 'app-quest-details',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    SelectModule,
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
  private readonly _confirmationService = inject(ConfirmationService);
  private readonly _messageService = inject(MessageService);
  private readonly _router = inject(Router);

  questForm!: FormGroup;
  priorityOptions = this._questService.priorities();
  statusOptions = this._questService.statuses();
  isEdit: boolean = false;

  ngOnInit(): void {
    this._router.events.subscribe(() => {
      this.onReturn();
    });

    this._createFormGroup();
    this.resetForm();
    this._setFormValues();
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
    this.questForm.markAllAsTouched();

    if (this.questForm.invalid) return;

    const formValues = {
      ...this.questForm.value,
      estimatedTime: this.dateToMinutes(this.questForm.value.estimatedTime),
    };

    if (this.isNew) {
      const newQuest: QuestCreateDTO = formValues;

      this._questService.createQuest(newQuest).subscribe({
        next: () => {
          console.log('Quest created successfully');
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
    if (this.isNew) {
      this.onReturn();
    } else if (this.isEdit) {
      this._setFormValues();
      this.isEdit = false;
    }
  }

  onReturn(): void {
    this.isEdit = false;
    this.isNew = false;
    this.closeDialog.emit();
  }

  onDelete(): void {
    this._confirmationService.confirm({
      message: 'Confimer la suppression ?',
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
      priorityId: new FormControl('', Validators.required),
      statusId: new FormControl('', Validators.required),
      advancement: new FormControl(0),
    });
  }

  private _setFormValues(): void {
    this.questForm.setValue({
      title: this.quest?.title ?? '',
      description: this.quest?.description ?? '',
      estimatedTime: this.minutesToDate(this.quest?.estimatedTime ?? DEFAULT_ESTIMATED_TIME),
      priorityId: this.quest?.priorityId ?? this.defaultPriority,
      statusId: this.quest?.statusId ?? this.defaultStatus,
      advancement: this.quest?.advancement ?? 0,
    });
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

  get defaultPriority() {
    return '17c07323-d5b4-4568-b773-de3487ff30b1';
  }

  get statusColor() {
    return this.statusOptions?.find(s => s.id === this.quest.statusId)?.color ?? '#f7f6f6ff';
  }

  get priorityColor() {
    return this.priorityOptions?.find(p => p.id === this.quest.priorityId)?.color ?? '#f7f6f6ff';
  }

  getStatusName(statusId: string): string {
    const status = this.statusOptions?.find(s => s.id === statusId);
    return status ? status.name : 'Inconnu';
  }

  getPriorityName(priorityId: string): string {
    const priority = this.priorityOptions?.find(p => p.id === priorityId);
    return priority ? priority.name : 'Inconnu';
  }

  getPriorityIcon(priorityId: string): string {
    const priority = this.priorityOptions?.find(p => p.id === priorityId);
    return priority ? priority.icon || 'primary' : 'primary';
  }
}

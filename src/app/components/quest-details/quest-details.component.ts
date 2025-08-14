import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output, QueryList, ViewChildren } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { Textarea, TextareaModule } from 'primeng/textarea';
import { CalendarModule } from 'primeng/calendar';
import { SliderModule } from 'primeng/slider';
import { InputNumberModule } from 'primeng/inputnumber';
import { DEFAULT_ESTIMATED_TIME, DEFAULT_PRIORITY, Quest, QuestBase, QuestPriority } from '../../models/quest.model';
import { NgClass } from '@angular/common';
import { TimePipe } from '../../pipes/time.pipe';
import { QuestService } from '../../services/quest.service';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

const TIMEOUT_VALUE = 100;
const ZERO = 0;
const SIXTY = 60;

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
  ],
  providers: [ConfirmationService],
  templateUrl: './quest-details.component.html',
  styleUrl: './quest-details.component.scss',
})
export class QuestDetailsComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) quest!: Quest;
  @Input() isNew: boolean = false;
  @Output() closeDialog = new EventEmitter<void>();
  @ViewChildren(Textarea) textareas!: QueryList<Textarea>;

  questForm!: FormGroup;
  priorityOptions = Object.entries(QuestPriority).map(([key, value]) => ({
    label: value,
    value: key,
  }));
  isEdit: boolean = false;

  private readonly _formBuilder = inject(FormBuilder);
  private readonly _cdr = inject(ChangeDetectorRef);
  private readonly _questService = inject(QuestService);
  private readonly _confirmationService = inject(ConfirmationService);

  ngOnInit(): void {
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
    }, TIMEOUT_VALUE);
  }

  //#region Buttons
  onSubmit(): void {
    if (this.questForm.invalid) return;

    const formValues = {
      ...this.questForm.value,
      estimatedTime: this.dateToMinutes(this.questForm.value.estimatedTime),
    };

    if (this.isNew) {
      const newQuest: QuestBase = formValues;

      this._questService.createQuest(newQuest).subscribe({
        next: () => {
          console.log('Quest created successfully');
        },
        error: error => {
          console.error('Error creating quest:', error);
        },
      });
    } else {
      const updatedQuest: Quest = {
        ...this.quest,
        ...formValues,
      };

      this._questService.updateQuest(updatedQuest).subscribe({
        next: () => {
          console.log('Quest updated successfully');
        },
        error: error => {
          console.error('Error updating quest:', error);
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
          },
          error: error => {
            console.error('Error deleting quest:', error);
          },
        });
      },
    });
  }

  onEdit(): void {
    this.isEdit = true;
  }

  toggleStatus(): void {
    if (this.quest) {
      this._questService.updateQuest({ ...this.quest, isDone: !this.quest.isDone }).subscribe();
    }
    this.closeDialog.emit();
  }
  //#endregion

  //#region Date & Time
  /** Conversion des minutes en objet Date */
  // TODO : Mettre dans un service de conversion
  minutesToDate(minutes: number): Date {
    if (!minutes) return new Date(ZERO, ZERO, ZERO, ZERO, ZERO);

    const date = new Date();
    date.setHours(Math.floor(minutes / SIXTY));
    date.setMinutes(minutes % SIXTY);
    date.setSeconds(ZERO);
    return date;
  }

  /** Conversion d'un objet Date en minutes */
  dateToMinutes(date: Date): number {
    if (!date) return ZERO;
    return date.getHours() * SIXTY + date.getMinutes();
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
      priority: new FormControl('', Validators.required),
      isDone: new FormControl(false),
    });
  }

  private _setFormValues(): void {
    this.questForm.setValue({
      title: this.quest?.title ?? '',
      description: this.quest?.description ?? '',
      estimatedTime: this.minutesToDate(this.quest?.estimatedTime ?? DEFAULT_ESTIMATED_TIME),
      priority: this.quest?.priority ? this._getPriorityKey(this.quest.priority) : DEFAULT_PRIORITY,
      isDone: this.quest?.isDone ?? false,
    });
  }

  private _getPriorityKey(value: string): keyof typeof QuestPriority | null {
    const entryByValue = Object.entries(QuestPriority).find(([, val]) => val === value);
    if (entryByValue) {
      return entryByValue[ZERO] as keyof typeof QuestPriority;
    }

    if (Object.keys(QuestPriority).includes(value)) {
      return value as keyof typeof QuestPriority;
    }

    return DEFAULT_PRIORITY;
  }

  //#endregion

  getPriorityKey(priority: QuestPriority | string): string {
    const priorityString = typeof priority === 'string' ? priority : priority;

    switch (priorityString) {
      case QuestPriority.PRIMARY:
      case 'PRIMARY':
        return 'primary';
      case QuestPriority.SECONDARY:
      case 'SECONDARY':
        return 'secondary';
      case QuestPriority.TERTIARY:
      case 'TERTIARY':
        return 'tertiary';
      default:
        return 'tertiary';
    }
  }

  get currentPriorityClass(): string {
    const currentPriority = this.questForm?.get('priority')?.value || this.quest?.priority;
    if (!currentPriority) return 'priority-tertiary';
    return `priority-${this.getPriorityKey(currentPriority)}`;
  }

  get selectClasses() {
    return {
      'quest-readonly': !this.isEdit,
      [this.currentPriorityClass]: true,
    };
  }

  get hasEstimatedTime(): boolean {
    const estimatedTime = this.quest?.estimatedTime ?? 0;
    return estimatedTime > 0;
  }

  get hasDescription(): boolean {
    const description = this.quest?.description ?? '';
    return description.trim().length > 0;
  }
}

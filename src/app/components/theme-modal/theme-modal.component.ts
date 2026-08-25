import { Component, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { ThemeModalService } from '../../services/theme-modal.service';
import { ThemeService } from '../../services/theme.service';
import { ConnectivityService } from '../../services/connectivity.service';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

// Single shared modal for both creating and editing a theme, mirroring QuestGroupModalComponent.
// Unlike a group, a theme isn't spatial - there's no flood-fill/assignment-fetch branch, creation
// is just a name + color.
@Component({
  selector: 'app-theme-modal',
  standalone: true,
  imports: [FormsModule, Dialog, InputTextModule, ColorPickerComponent],
  templateUrl: './theme-modal.component.html',
  styleUrl: './theme-modal.component.scss',
})
export class ThemeModalComponent {
  private readonly _modalService = inject(ThemeModalService);
  private readonly _themeService = inject(ThemeService);
  private readonly _messageService = inject(MessageService);
  readonly _connectivity = inject(ConnectivityService);

  @ViewChild('nameInput') nameInputRef?: ElementRef<HTMLInputElement>;

  // Matches --neon-glow-color, the app's own default accent - a fresh theme starts out matching
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
      // Same pattern as quest-group-modal's own name autofocus: wait a frame for the dialog's
      // open transition to actually render the input before focusing it.
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
    return this.isEdit ? 'Modifier le thème' : 'Créer un thème';
  }

  // Soft UX nudge toward the "unique color" ask - not a hard backend constraint, since any hex is
  // technically a valid theme color.
  get colorAlreadyUsed(): boolean {
    const state = this._modalService.state();
    const editingId = state.visible && state.mode === 'edit' ? state.themeId : null;
    return this._themeService.themes().some(t => t.id !== editingId && t.color.toLowerCase() === this.color.toLowerCase());
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
      this._themeService.updateTheme({ id: state.themeId, name: trimmed, color: this.color }).subscribe({
        next: () => this._modalService.close(),
        error: err => {
          console.error('Failed to update theme:', err);
          this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la modification du thème', life: 2000 });
        },
      });
      return;
    }

    this._themeService.createTheme({ name: trimmed, color: this.color }).subscribe({
      next: created => {
        state.onCreated?.(created);
        this._modalService.close();
        this._messageService.add({ severity: 'success', summary: 'Thème créé', detail: trimmed, life: 2000 });
      },
      error: err => {
        console.error('Failed to create theme:', err);
        this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la création du thème', life: 2000 });
      },
    });
  }
}

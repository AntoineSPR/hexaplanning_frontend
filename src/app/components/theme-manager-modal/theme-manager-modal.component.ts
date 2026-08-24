import { Component, inject } from '@angular/core';
import { Dialog } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ThemeManagerModalService } from '../../services/theme-manager-modal.service';
import { ThemeModalService } from '../../services/theme-modal.service';
import { ThemeService } from '../../services/theme.service';
import { ThemeOutputDTO } from '../../models/theme.model';
import { ConnectivityService } from '../../services/connectivity.service';
import { ThemeIconComponent } from '../theme-icon/theme-icon.component';
import { QuestService } from '../../services/quest.service';

// List-based CRUD for themes, opened from Settings. Creation can also happen inline from
// quest-details (see ThemeModalService), but rename/recolor/delete are only ever available here -
// mutating/removing a theme from within a single quest's form would be surprising for a category
// other quests might also be using. Rename/recolor reuses the same single-item ThemeModalComponent
// (opened on top of this list), so there's only one create/edit form in the whole app.
@Component({
  selector: 'app-theme-manager-modal',
  standalone: true,
  imports: [Dialog, ConfirmDialogModule, ThemeIconComponent],
  providers: [ConfirmationService],
  templateUrl: './theme-manager-modal.component.html',
  styleUrl: './theme-manager-modal.component.scss',
})
export class ThemeManagerModalComponent {
  private readonly _modalService = inject(ThemeManagerModalService);
  private readonly _themeModalService = inject(ThemeModalService);
  private readonly _themeService = inject(ThemeService);
  private readonly _questService = inject(QuestService);
  private readonly _confirmationService = inject(ConfirmationService);
  private readonly _messageService = inject(MessageService);
  readonly _connectivity = inject(ConnectivityService);

  themes = this._themeService.themes;

  get isVisible(): boolean {
    return this._modalService.visible();
  }

  handleVisibleChange(visible: boolean): void {
    if (!visible) this._modalService.close();
  }

  close(): void {
    this._modalService.close();
  }

  openCreate(): void {
    if (this._connectivity.isOffline()) return;
    this._themeModalService.openCreate();
  }

  openEdit(theme: ThemeOutputDTO): void {
    if (this._connectivity.isOffline()) return;
    this._themeModalService.openEdit(theme);
  }

  deleteTheme(theme: ThemeOutputDTO): void {
    if (this._connectivity.isOffline()) return;

    this._confirmationService.confirm({
      message: `Supprimer le thème "${theme.name}" ?`,
      closable: true,
      closeOnEscape: true,
      accept: () => {
        this._themeService.deleteTheme(theme.id).subscribe({
          // Any quest that referenced this theme has had its ThemeId cleared server-side (see
          // ThemeService.DeleteThemeAsync) - refresh so that propagates to the map/quest-details.
          next: () => this._questService.refreshAllQuestLists(),
          error: error => {
            console.error('Failed to delete theme:', error);
            this._messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la suppression du thème', life: 2000 });
          },
        });
      },
    });

    // Focus management for the confirmation dialog, matching the same pattern used elsewhere.
    setTimeout(() => {
      const acceptButton = document.querySelector('.accept-confirmation-button') as HTMLElement;
      if (acceptButton) {
        acceptButton.focus();
      }
    }, 100);
  }
}

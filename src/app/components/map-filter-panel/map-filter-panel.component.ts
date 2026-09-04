import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MapFilterService } from '../../services/map-filter.service';
import { QuestGroupService } from '../../services/quest-group.service';
import { ThemeService } from '../../services/theme.service';
import { ConnectivityService } from '../../services/connectivity.service';
import { statusKindFor } from '../../services/quest.service';
import { NO_GROUP_KEY, NO_THEME_KEY } from '../../utils/quest-sort.util';
import { ThemeIconComponent } from '../theme-icon/theme-icon.component';
import { StatusHexIconComponent } from '../status-hex-icon/status-hex-icon.component';

type FilterSection = 'status' | 'group' | 'theme';
const FILTER_SECTIONS: readonly FilterSection[] = ['status', 'group', 'theme'];

// The map's group/theme/status visibility panel - lets the user completely hide a category's
// quests (see MapFilterService) and, separately from that, retire finished quests from the map
// for good via `clearCompletedQuests`. All filter state lives in MapFilterService, shared with
// MapComponent's own hex rendering; this component only owns which sections are collapsed, a
// purely visual convenience that resets every time the panel is reopened.
@Component({
  selector: 'app-map-filter-panel',
  standalone: true,
  imports: [FormsModule, Dialog, ToggleSwitchModule, ThemeIconComponent, StatusHexIconComponent],
  templateUrl: './map-filter-panel.component.html',
  styleUrl: './map-filter-panel.component.scss',
})
export class MapFilterPanelComponent {
  readonly _mapFilter = inject(MapFilterService);
  readonly _questGroupService = inject(QuestGroupService);
  readonly _themeService = inject(ThemeService);
  readonly _connectivity = inject(ConnectivityService);

  readonly statusKindFor = statusKindFor;
  readonly NO_GROUP_KEY = NO_GROUP_KEY;
  readonly NO_THEME_KEY = NO_THEME_KEY;

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  // MapComponent is the only one holding the real Hex[] grid deleteQuestFromHex needs, so it
  // executes the actual unassignment (confirmation, requests, toast) - this just signals intent.
  @Output() clearCompletedQuests = new EventEmitter<void>();

  // Single path for every way the dialog's own visibility changes - the footer's "Retour" button
  // and p-dialog's own dismissableMask/Escape handling both end up here, keeping `visible` and
  // the emitted event in sync regardless of which one triggered the change.
  setVisible(value: boolean): void {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  get allStatuses() {
    return this._mapFilter.allStatuses;
  }

  private _collapsedSections = signal<ReadonlySet<FilterSection>>(new Set());

  isSectionCollapsed(section: FilterSection): boolean {
    return this._collapsedSections().has(section);
  }

  toggleSection(section: FilterSection): void {
    const next = new Set(this._collapsedSections());
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    this._collapsedSections.set(next);
  }

  areAllSectionsCollapsed(): boolean {
    return FILTER_SECTIONS.every(s => this.isSectionCollapsed(s));
  }

  toggleCollapseAllSections(): void {
    this._collapsedSections.set(this.areAllSectionsCollapsed() ? new Set() : new Set(FILTER_SECTIONS));
  }
}

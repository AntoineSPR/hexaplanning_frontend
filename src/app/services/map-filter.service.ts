import { inject, Injectable, signal } from '@angular/core';
import { QuestGroupService } from './quest-group.service';
import { ThemeService } from './theme.service';
import { QuestService } from './quest.service';
import { QuestUpdateDTO } from '../models/quest.model';
import { Status } from '../models/status';
import { NO_GROUP_KEY, NO_THEME_KEY } from '../utils/quest-sort.util';

const HIDDEN_GROUPS_KEY = 'hexaplanning.mapHiddenGroups.v1';
const HIDDEN_THEMES_KEY = 'hexaplanning.mapHiddenThemes.v1';
const HIDDEN_STATUSES_KEY = 'hexaplanning.mapHiddenStatuses.v1';

function loadHiddenIds(key: string): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenIds(key: string, ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {}
}

// Which groups/themes/statuses are currently hidden on the map, and whether a given quest falls
// under one of them. A hidden quest's hex renders as if empty and can't be clicked or dragged
// (see MapComponent.isHexFiltered/isHexBlockedForDrop and .hex-filtered in its stylesheet) rather
// than being removed from the map - the underlying assignment is untouched, this is purely a
// display filter. Each of the three id sets is persisted to localStorage independently, so a
// filter set up once survives a reload.
@Injectable({ providedIn: 'root' })
export class MapFilterService {
  private readonly _questGroupService = inject(QuestGroupService);
  private readonly _themeService = inject(ThemeService);
  private readonly _questService = inject(QuestService);

  hiddenGroupIds = signal<ReadonlySet<string>>(loadHiddenIds(HIDDEN_GROUPS_KEY));
  hiddenThemeIds = signal<ReadonlySet<string>>(loadHiddenIds(HIDDEN_THEMES_KEY));
  hiddenStatusIds = signal<ReadonlySet<string>>(loadHiddenIds(HIDDEN_STATUSES_KEY));

  get allStatuses(): Status[] {
    return this._questService.statuses() ?? [];
  }

  isQuestFiltered(quest: Pick<QuestUpdateDTO, 'questGroupId' | 'themeId' | 'statusId'>): boolean {
    return this.isGroupHidden(quest.questGroupId ?? NO_GROUP_KEY) || this.isThemeHidden(quest.themeId ?? NO_THEME_KEY) || this.isStatusHidden(quest.statusId);
  }

  hasActiveFilters(): boolean {
    return this.hiddenGroupIds().size > 0 || this.hiddenThemeIds().size > 0 || this.hiddenStatusIds().size > 0;
  }

  // Shows everything back regardless of category - the quicker alternative to toggling each
  // section's own show-all/hide-all switch (toggleAllGroups/toggleAllThemes/toggleAllStatuses)
  // one at a time.
  resetFilters(): void {
    this.hiddenGroupIds.set(new Set());
    this.hiddenThemeIds.set(new Set());
    this.hiddenStatusIds.set(new Set());
    saveHiddenIds(HIDDEN_GROUPS_KEY, this.hiddenGroupIds());
    saveHiddenIds(HIDDEN_THEMES_KEY, this.hiddenThemeIds());
    saveHiddenIds(HIDDEN_STATUSES_KEY, this.hiddenStatusIds());
  }

  isGroupHidden(groupId: string): boolean {
    return this.hiddenGroupIds().has(groupId);
  }

  isThemeHidden(themeId: string): boolean {
    return this.hiddenThemeIds().has(themeId);
  }

  isStatusHidden(statusId: string): boolean {
    return this.hiddenStatusIds().has(statusId);
  }

  toggleGroupVisibility(groupId: string): void {
    const next = new Set(this.hiddenGroupIds());
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    this.hiddenGroupIds.set(next);
    saveHiddenIds(HIDDEN_GROUPS_KEY, next);
  }

  toggleThemeVisibility(themeId: string): void {
    const next = new Set(this.hiddenThemeIds());
    if (next.has(themeId)) {
      next.delete(themeId);
    } else {
      next.add(themeId);
    }
    this.hiddenThemeIds.set(next);
    saveHiddenIds(HIDDEN_THEMES_KEY, next);
  }

  toggleStatusVisibility(statusId: string): void {
    const next = new Set(this.hiddenStatusIds());
    if (next.has(statusId)) {
      next.delete(statusId);
    } else {
      next.add(statusId);
    }
    this.hiddenStatusIds.set(next);
    saveHiddenIds(HIDDEN_STATUSES_KEY, next);
  }

  // Per-category show-all/hide-all: whenever anything in the category is hidden, offer to show it
  // all back; only once it's fully visible does toggling switch to hiding it all.
  hasHiddenGroups(): boolean {
    return this.hiddenGroupIds().size > 0;
  }

  hasHiddenThemes(): boolean {
    return this.hiddenThemeIds().size > 0;
  }

  hasHiddenStatuses(): boolean {
    return this.hiddenStatusIds().size > 0;
  }

  toggleAllGroups(): void {
    const next = this.hasHiddenGroups() ? new Set<string>() : new Set([...this._questGroupService.questGroups().map(g => g.id), NO_GROUP_KEY]);
    this.hiddenGroupIds.set(next);
    saveHiddenIds(HIDDEN_GROUPS_KEY, next);
  }

  toggleAllThemes(): void {
    const next = this.hasHiddenThemes() ? new Set<string>() : new Set([...this._themeService.themes().map(t => t.id), NO_THEME_KEY]);
    this.hiddenThemeIds.set(next);
    saveHiddenIds(HIDDEN_THEMES_KEY, next);
  }

  toggleAllStatuses(): void {
    const next = this.hasHiddenStatuses() ? new Set<string>() : new Set(this.allStatuses.map(s => s.id));
    this.hiddenStatusIds.set(next);
    saveHiddenIds(HIDDEN_STATUSES_KEY, next);
  }
}

import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { QuestUpdateDTO } from '../../models/quest.model';
import { QuestGroupService } from '../../services/quest-group.service';
import { ThemeService } from '../../services/theme.service';
import { categorizeQuests, QuestCategory, QuestSortMode, sortQuestsByDateAdded } from '../../utils/quest-sort.util';
import { QuestCardComponent } from '../quest-card/quest-card.component';
import { ThemeIconComponent } from '../theme-icon/theme-icon.component';
import { StatusHexIconComponent, QuestStatusKind } from '../status-hex-icon/status-hex-icon.component';
import { RevealOnIntersectDirective } from '../../directives/reveal-on-intersect.directive';

const ALL_SORT_MODES: readonly QuestSortMode[] = ['dateAdded', 'status', 'group', 'theme'];
const SORT_MODE_LABELS: Record<QuestSortMode, string> = {
  dateAdded: 'Date d’ajout',
  status: 'Statut',
  group: 'Groupe',
  theme: 'Thème',
};

// How many cards to mount per (sub-)list before requiring a scroll to reveal more - see
// revealedCountFor/revealMore below. Keeps a long list from stalling the page with hundreds of
// quest-cards mounted at once, without touching how the true per-category counts are computed
// (those still come from the full, already-fetched array - see QuestCategory.quests.length in the
// template - only how many of them get *rendered* is capped).
const INITIAL_RENDER_COUNT = 30;
const RENDER_BATCH_SIZE = 20;

// Key used for the flat (dateAdded) list's own revealed-count entry in _revealedCounts - distinct
// from any real category.key (group/theme/status ids), which are opaque backend-assigned strings.
const FLAT_LIST_KEY = '__flat__';

// Sorting/categorizing + progressive rendering for one section of the quest list (pending or
// completed - see QuestListPageComponent, which mounts one instance per tab). Each instance keeps
// its own sort mode (persisted under its own storageKey) and its own revealed-count/collapse state,
// so the two tabs behave as fully independent lists sharing the same UI/logic.
@Component({
  selector: 'app-quest-sorted-list',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, QuestCardComponent, ThemeIconComponent, StatusHexIconComponent, RevealOnIntersectDirective],
  templateUrl: './quest-sorted-list.component.html',
  styleUrl: './quest-sorted-list.component.scss',
})
export class QuestSortedListComponent implements OnInit {
  private readonly _questGroupService = inject(QuestGroupService);
  private readonly _themeService = inject(ThemeService);

  private readonly _quests = signal<QuestUpdateDTO[]>([]);
  @Input({ required: true }) set quests(value: QuestUpdateDTO[]) {
    this._quests.set(value ?? []);
  }

  @Input() storageKey = '';

  // Which sort modes this section offers - lets a section (e.g. completed quests, where every
  // quest shares practically the same status) drop a mode that wouldn't produce a meaningful
  // breakdown there, without affecting sections that still want it (pending quests). Defaults to
  // every mode so existing usages keep working unchanged.
  @Input() sortModes: QuestSortMode[] = [...ALL_SORT_MODES];

  get sortModeOptions(): { label: string; value: QuestSortMode }[] {
    return this.sortModes.map(mode => ({ label: SORT_MODE_LABELS[mode], value: mode }));
  }

  // Deferred to ngOnInit rather than done from an input setter: reading localStorage against
  // sortModes needs sortModes to already be bound, and @Input setters can run in either order
  // depending on the order they're written in the template, whereas by ngOnInit every input on
  // the component is guaranteed set.
  ngOnInit(): void {
    this.sortMode.set(this._loadSortMode());
  }

  private _loadSortMode(): QuestSortMode {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (this.sortModes.includes(raw as QuestSortMode)) return raw as QuestSortMode;
    } catch {}
    return 'dateAdded';
  }

  sortMode = signal<QuestSortMode>('dateAdded');

  private _collapsedCategoryKeys = signal<ReadonlySet<string>>(new Set());
  private _revealedCounts = signal<ReadonlyMap<string, number>>(new Map());

  readonly FLAT_LIST_KEY = FLAT_LIST_KEY;

  areAllCategoriesCollapsed = computed<boolean>(() => {
    const categories = this.categories();
    return categories.length > 0 && categories.every(c => this.isCategoryCollapsed(c.key));
  });

  flatQuests = computed<QuestUpdateDTO[]>(() => {
    if (this.sortMode() !== 'dateAdded') return [];
    return sortQuestsByDateAdded(this._quests());
  });

  categories = computed<QuestCategory[]>(() => {
    const mode = this.sortMode();
    if (mode === 'dateAdded') return [];
    return categorizeQuests(this._quests(), mode, this._questGroupService.questGroups(), this._themeService.themes());
  });

  onSortModeChange(mode: QuestSortMode): void {
    this.sortMode.set(mode);
    this._collapsedCategoryKeys.set(new Set());
    this._revealedCounts.set(new Map());
    try {
      localStorage.setItem(this.storageKey, mode);
    } catch {}
  }

  toggleCollapseAll(): void {
    if (this.areAllCategoriesCollapsed()) {
      this._collapsedCategoryKeys.set(new Set());
    } else {
      this._collapsedCategoryKeys.set(new Set(this.categories().map(c => c.key)));
    }
  }

  isCategoryCollapsed(key: string): boolean {
    return this._collapsedCategoryKeys().has(key);
  }

  toggleCategory(key: string): void {
    const next = new Set(this._collapsedCategoryKeys());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this._collapsedCategoryKeys.set(next);
  }

  categoryStatusIcon(category: QuestCategory): QuestStatusKind | null {
    return category.icon?.kind === 'status' ? category.icon.status : null;
  }

  categoryThemeColor(category: QuestCategory): string | null {
    return category.icon?.kind === 'theme' ? category.icon.color : null;
  }

  revealedCountFor(key: string): number {
    return this._revealedCounts().get(key) ?? INITIAL_RENDER_COUNT;
  }

  revealMore(key: string, total: number): void {
    const next = new Map(this._revealedCounts());
    next.set(key, Math.min(this.revealedCountFor(key) + RENDER_BATCH_SIZE, total));
    this._revealedCounts.set(next);
  }
}

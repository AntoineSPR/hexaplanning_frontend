import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { QuestUpdateDTO } from '../../models/quest.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuComponent } from '../../components/menu/menu.component';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { QuestCardComponent } from '../../components/quest-card/quest-card.component';
import { QuestService, statusKindFor } from 'src/app/services/quest.service';
import { QuestGroupService } from '../../services/quest-group.service';
import { ThemeService } from '../../services/theme.service';
import { MenuItem, MessageService } from 'primeng/api';
import { TabMenuModule } from 'primeng/tabmenu';
import { ThemeIconComponent } from '../../components/theme-icon/theme-icon.component';
import { StatusHexIconComponent } from '../../components/status-hex-icon/status-hex-icon.component';
import { categorizeQuests, QuestCategory, QuestSortMode, sortQuestsByDateAdded } from '../../utils/quest-sort.util';
import { QuestStatusKind } from '../../components/status-hex-icon/status-hex-icon.component';

@Component({
  standalone: true,
  selector: 'app-quest-list-page',
  imports: [
    CommonModule,
    FormsModule,
    MenuComponent,
    DialogModule,
    ButtonModule,
    SelectModule,
    QuestCardComponent,
    TabMenuModule,
    ThemeIconComponent,
    StatusHexIconComponent,
  ],
  templateUrl: './quest-list-page.component.html',
  styleUrls: ['./quest-list-page.component.scss'],
})
export class QuestListPageComponent implements OnInit {
  _questService = inject(QuestService);
  private readonly _questGroupService = inject(QuestGroupService);
  private readonly _themeService = inject(ThemeService);

  menuItems!: MenuItem[];
  activeItem!: MenuItem;
  private _completedQuestsLoaded = false;

  readonly statusKindFor = statusKindFor;

  private static readonly _SORT_MODE_KEY = 'hexaplanning.questListSortMode.v1';
  private static readonly _SORT_MODES: readonly QuestSortMode[] = ['dateAdded', 'status', 'group', 'theme'];

  sortMode = signal<QuestSortMode>(QuestListPageComponent._loadSortMode());
  readonly sortModeOptions: { label: string; value: QuestSortMode }[] = [
    { label: 'Date d’ajout', value: 'dateAdded' },
    { label: 'Statut', value: 'status' },
    { label: 'Groupe', value: 'group' },
    { label: 'Thème', value: 'theme' },
  ];

  private static _loadSortMode(): QuestSortMode {
    try {
      const raw = localStorage.getItem(QuestListPageComponent._SORT_MODE_KEY);
      if (QuestListPageComponent._SORT_MODES.includes(raw as QuestSortMode)) return raw as QuestSortMode;
    } catch {}
    return 'dateAdded';
  }

  private _collapsedCategoryKeys = signal<ReadonlySet<string>>(new Set());

  areAllCategoriesCollapsed = computed<boolean>(() => {
    const categories = this.pendingQuestCategories();
    return categories.length > 0 && categories.every(c => this.isCategoryCollapsed(c.key));
  });

  flatPendingQuests = computed<QuestUpdateDTO[]>(() => {
    if (this.sortMode() !== 'dateAdded') return [];
    return sortQuestsByDateAdded(this._questService.pendingQuests());
  });

  pendingQuestCategories = computed<QuestCategory[]>(() => {
    const mode = this.sortMode();
    if (mode === 'dateAdded') return [];
    return categorizeQuests(this._questService.pendingQuests(), mode, this._questGroupService.questGroups(), this._themeService.themes());
  });

  get quests(): QuestUpdateDTO[] { return this._questService.quests(); }
  get pendingQuests(): QuestUpdateDTO[] { return this._questService.pendingQuests(); }
  get completedQuests(): QuestUpdateDTO[] { return this._questService.completedQuests(); }

  ngOnInit(): void {
    this._questService.getAllPendingQuests().subscribe();
    this._questGroupService.getAllQuestGroups().subscribe();
    this._themeService.getAllThemes().subscribe();
    this.menuItems = [{ label: 'Quêtes à accomplir' }, { label: 'Quêtes accomplies' }];
    this.activeItem = this.menuItems[0];
  }

  navigateOnMenu(event: MenuItem): void {
    this.activeItem = event;
    if (this.activeItem === this.menuItems[1] && !this._completedQuestsLoaded) {
      this._questService.getAllCompletedQuests().subscribe();
      this._completedQuestsLoaded = true;
    }
  }

  onSortModeChange(mode: QuestSortMode): void {
    this.sortMode.set(mode);
    this._collapsedCategoryKeys.set(new Set());
    try {
      localStorage.setItem(QuestListPageComponent._SORT_MODE_KEY, mode);
    } catch {}
  }

  toggleCollapseAll(): void {
    if (this.areAllCategoriesCollapsed()) {
      this._collapsedCategoryKeys.set(new Set());
    } else {
      this._collapsedCategoryKeys.set(new Set(this.pendingQuestCategories().map(c => c.key)));
    }
  }

  isCategoryCollapsed(key: string): boolean {
    return this._collapsedCategoryKeys().has(key);
  }

  categoryStatusIcon(category: QuestCategory): QuestStatusKind | null {
    return category.icon?.kind === 'status' ? category.icon.status : null;
  }

  categoryThemeColor(category: QuestCategory): string | null {
    return category.icon?.kind === 'theme' ? category.icon.color : null;
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
}

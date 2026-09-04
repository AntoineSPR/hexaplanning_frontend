import { Component, inject, OnInit } from '@angular/core';
import { QuestUpdateDTO } from '../../models/quest.model';
import { CommonModule } from '@angular/common';
import { MenuComponent } from '../../components/menu/menu.component';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { QuestService, statusKindFor } from 'src/app/services/quest.service';
import { QuestGroupService } from '../../services/quest-group.service';
import { ThemeService } from '../../services/theme.service';
import { MenuItem, MessageService } from 'primeng/api';
import { TabMenuModule } from 'primeng/tabmenu';
import { QuestSortedListComponent } from '../../components/quest-sorted-list/quest-sorted-list.component';
import { QuestSortMode } from '../../utils/quest-sort.util';

@Component({
  standalone: true,
  selector: 'app-quest-list-page',
  imports: [CommonModule, MenuComponent, DialogModule, ButtonModule, TabMenuModule, QuestSortedListComponent],
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

  // Independent per-tab sort preference - see QuestSortedListComponent.storageKey. Kept as the
  // same key the pending tab always used, so existing users don't lose their saved preference.
  readonly pendingSortStorageKey = 'hexaplanning.questListSortMode.v1';
  readonly completedSortStorageKey = 'hexaplanning.questListSortMode.completed.v1';

  // No "Statut" option for completed quests - they're all done, so grouping by status wouldn't
  // produce a meaningful breakdown the way it does for pending quests.
  readonly completedSortModes: QuestSortMode[] = ['dateAdded', 'group', 'theme'];

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
}

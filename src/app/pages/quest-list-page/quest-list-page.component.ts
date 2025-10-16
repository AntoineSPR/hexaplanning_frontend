import { Component, inject, OnInit } from '@angular/core';
import { QuestUpdateDTO } from '../../models/quest.model';
import { CommonModule } from '@angular/common';
import { MenuComponent } from '../../components/menu/menu.component';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { QuestCardComponent } from '../../components/quest-card/quest-card.component';
import { QuestService } from 'src/app/services/quest.service';
import { MenuItem, MessageService } from 'primeng/api';
import { TabMenuModule } from 'primeng/tabmenu';

@Component({
  standalone: true,
  selector: 'app-quest-list-page',
  imports: [CommonModule, MenuComponent, DialogModule, ButtonModule, QuestCardComponent, TabMenuModule],
  templateUrl: './quest-list-page.component.html',
  styleUrls: ['./quest-list-page.component.scss'],
})
export class QuestListPageComponent implements OnInit {
  _questService = inject(QuestService);

  menuItems!: MenuItem[];
  activeItem!: MenuItem;
  private _completedQuestsLoaded = false;

  get quests(): QuestUpdateDTO[] {
    return this._questService.quests();
  }
  get pendingQuests(): QuestUpdateDTO[] {
    return this._questService.pendingQuests();
  }
  get completedQuests(): QuestUpdateDTO[] {
    return this._questService.completedQuests();
  }

  ngOnInit(): void {
    this._questService.loadPendingQuests();

    this.menuItems = [{ label: 'Quêtes à accomplir' }, { label: 'Quêtes accomplies' }];
    this.activeItem = this.menuItems[0];
  }

  navigateOnMenu(event: MenuItem): void {
    this.activeItem = event;
    if (this.activeItem === this.menuItems[1] && !this._completedQuestsLoaded) {
      this._questService.loadCompletedQuests();
      this._completedQuestsLoaded = true;
    }
  }
}

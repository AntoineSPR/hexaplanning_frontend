import { TitleCasePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MenuComponent } from 'src/app/components/menu/menu.component';
import { QuestService } from 'src/app/services/quest.service';
import { UserService } from 'src/app/services/user.service';

const IN_PROGRESS_STATUS_ID = '2281c955-b3e1-49dc-be62-6a7912bb46b3';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [MenuComponent, TitleCasePipe],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
  private readonly _userService = inject(UserService);
  private readonly _questService = inject(QuestService);
  user = this._userService.user;

  private quests = this._questService.quests;
  inProgressCount = computed(() => this.quests().filter(q => q.statusId === IN_PROGRESS_STATUS_ID).length);
  onHoldCount = computed(() => this.quests().filter(q => q.statusId === this._questService.statusOnHoldId).length);
  toDoCount = computed(() => this.quests().filter(q => q.statusId === this._questService.statusPendingId).length);
  doneCount = computed(() => this.quests().filter(q => q.statusId === this._questService.statusDoneId).length);
  activeQuestsNumber = computed(() => this.inProgressCount() + this.onHoldCount() + this.toDoCount());

  constructor() {
    this._questService.getAllQuests().subscribe();
  }
}

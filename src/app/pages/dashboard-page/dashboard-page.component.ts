import { TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
  // Narrower than activeQuestsNumber above: only what's actually workable right now (en cours +
  // à accomplir), excluding on-hold quests since those are deliberately paused rather than
  // something the user could act on immediately.
  workableQuestsNumber = computed(() => this.inProgressCount() + this.toDoCount());

  // Collapsed by default - the breakdown below the workable count is supplementary detail, not
  // something every visit needs to see. Not persisted: purely a per-visit UI convenience, same
  // choice as the map filter panel's own section collapse state.
  detailsExpanded = signal(false);

  toggleDetails(): void {
    this.detailsExpanded.update(expanded => !expanded);
  }

  constructor() {
    this._questService.getAllQuests().subscribe();
  }
}

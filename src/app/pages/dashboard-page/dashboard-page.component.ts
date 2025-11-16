import { TitleCasePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MenuComponent } from 'src/app/components/menu/menu.component';
import { QuestService } from 'src/app/services/quest.service';
import { UserService } from 'src/app/services/user.service';

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
  pendingQuestsNumber = computed(() => this._questService.pendingQuests().length);

  constructor() {
    this._questService.getAllPendingQuests().subscribe();
  }
}

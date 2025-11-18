import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { QuestContainerComponent } from './components/quest-container/quest-container.component';
import { UserService } from './services/user.service';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { QuestService } from './services/quest.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, QuestContainerComponent, ToastModule],
  providers: [MessageService],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  private readonly _userService = inject(UserService);
  private readonly _questService = inject(QuestService);

  ngOnInit() {
    localStorage.getItem('user');
    localStorage.getItem('token');

    // load statuses and priorities
    this._questService.loadStatuses().subscribe();
    this._questService.loadPriorities().subscribe();

    if (!localStorage.getItem('user') || !localStorage.getItem('token')) {
      return;
    }

    this._userService.user.set(JSON.parse(localStorage.getItem('user') || 'null'));
    this._userService.token.set(localStorage.getItem('token'));
  }
}

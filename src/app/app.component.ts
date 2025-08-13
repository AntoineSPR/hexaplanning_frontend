import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { QuestContainerComponent } from './components/quest-container/quest-container.component';
import { UserService } from './services/user.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, QuestContainerComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  private readonly _userService = inject(UserService);

  ngOnInit() {
    localStorage.getItem('user');
    localStorage.getItem('token');

    if (!localStorage.getItem('user') || !localStorage.getItem('token')) {
      return;
    }

    this._userService.user.set(JSON.parse(localStorage.getItem('user') || 'null'));
    this._userService.token.set(localStorage.getItem('token'));
  }
}

import { Component, inject } from '@angular/core';
import { MenuComponent } from 'src/app/components/menu/menu.component';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [MenuComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
  private readonly _userService = inject(UserService);
  user = this._userService.user;
}

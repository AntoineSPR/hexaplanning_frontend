import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MenuComponent } from 'src/app/components/menu/menu.component';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [MenuComponent],
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.scss'],
})
export class SettingsPageComponent {
  private readonly _userService = inject(UserService);
  private readonly _router = inject(Router);

  logout(): void {
    this._userService.logoutUser();
    this._router.navigate(['/login']);
  }
}

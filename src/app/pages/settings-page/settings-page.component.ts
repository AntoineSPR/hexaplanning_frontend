import { Component } from '@angular/core';
import { MenuComponent } from 'src/app/components/menu/menu.component';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [MenuComponent],
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.scss'],
})
export class SettingsPageComponent {}

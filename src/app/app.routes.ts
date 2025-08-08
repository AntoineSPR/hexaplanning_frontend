import { Routes } from '@angular/router';
import { SettingsPageComponent } from './pages/settings-page/settings-page.component';
import { DashboardPageComponent } from './pages/dashboard-page/dashboard-page.component';
import { QuestListPageComponent } from './pages/quest-list-page/quest-list-page.component';
import { RegisterComponent } from './pages/register/register.component';
import { MapComponent } from './components/map/map.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardPageComponent,
  },
  {
    path: 'register',
    component: RegisterComponent,
  },
  {
    path: 'settings',
    component: SettingsPageComponent,
  },
  {
    path: 'quest-list',
    component: QuestListPageComponent,
  },
  {
    path: 'map',
    component: MapComponent,
  },
];

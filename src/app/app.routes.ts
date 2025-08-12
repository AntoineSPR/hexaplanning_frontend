import { Routes } from '@angular/router';
import { SettingsPageComponent } from './pages/settings-page/settings-page.component';
import { DashboardPageComponent } from './pages/dashboard-page/dashboard-page.component';
import { QuestListPageComponent } from './pages/quest-list-page/quest-list-page.component';
import { RegisterComponent } from './pages/register/register.component';
import { LoginComponent } from './pages/login/login.component';
import { MapComponent } from './components/map/map.component';
import { isLoggedInGuard, isLoggedOutGuard } from './guards/is-logged-in.guard';

export const routes: Routes = [
  {
    canActivate: [isLoggedInGuard],
    path: '',
    component: DashboardPageComponent,
  },
  {
    canActivate: [isLoggedOutGuard],
    path: 'login',
    component: LoginComponent,
  },
  {
    canActivate: [isLoggedOutGuard],
    path: 'register',
    component: RegisterComponent,
  },
  {
    canActivate: [isLoggedInGuard],
    path: 'settings',
    component: SettingsPageComponent,
  },
  {
    canActivate: [isLoggedInGuard],
    path: 'quest-list',
    component: QuestListPageComponent,
  },
  {
    canActivate: [isLoggedInGuard],
    path: 'map',
    component: MapComponent,
  },
];

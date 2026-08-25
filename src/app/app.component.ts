import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { QuestContainerComponent } from './components/quest-container/quest-container.component';
import { QuestGroupModalComponent } from './components/quest-group-modal/quest-group-modal.component';
import { ThemeModalComponent } from './components/theme-modal/theme-modal.component';
import { ThemeManagerModalComponent } from './components/theme-manager-modal/theme-manager-modal.component';
import { GroupActionsModalComponent } from './components/group-actions-modal/group-actions-modal.component';
import { UserService } from './services/user.service';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { QuestService } from './services/quest.service';
import { ConnectivityService } from './services/connectivity.service';
import { FavoriteColorService } from './services/favorite-color.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterModule,
    QuestContainerComponent,
    QuestGroupModalComponent,
    ThemeModalComponent,
    ThemeManagerModalComponent,
    GroupActionsModalComponent,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly _userService = inject(UserService);
  private readonly _questService = inject(QuestService);
  private readonly _connectivity = inject(ConnectivityService);
  private readonly _favoriteColorService = inject(FavoriteColorService);

  // Ctrl+scroll and trackpad pinch-zoom both surface as `wheel` events with `ctrlKey: true`.
  // Blocked everywhere, including over the map's SVG: this doesn't stop d3-zoom's own listener
  // there from also handling the event for the map's own zoom.
  private readonly _blockPageZoom = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
  };
  // Safari's non-standard gesture events for trackpad/touch pinch, separate from `wheel` - d3-zoom
  // never listens for these, so blocking them everywhere doesn't affect the map's own zoom.
  private readonly _blockSafariGesture = (event: Event) => {
    event.preventDefault();
  };

  ngOnInit() {
    document.addEventListener('wheel', this._blockPageZoom, { passive: false });
    document.addEventListener('gesturestart', this._blockSafariGesture, { passive: false });
    document.addEventListener('gesturechange', this._blockSafariGesture, { passive: false });

    // load statuses
    this._questService.loadStatuses().subscribe();
    this._favoriteColorService.getAllFavoriteColors().subscribe();

    if (!localStorage.getItem('user') || !localStorage.getItem('token')) {
      return;
    }

    this._userService.user.set(JSON.parse(localStorage.getItem('user') || 'null'));
    this._userService.token.set(localStorage.getItem('token'));
  }

  ngOnDestroy(): void {
    document.removeEventListener('wheel', this._blockPageZoom);
    document.removeEventListener('gesturestart', this._blockSafariGesture);
    document.removeEventListener('gesturechange', this._blockSafariGesture);
  }
}

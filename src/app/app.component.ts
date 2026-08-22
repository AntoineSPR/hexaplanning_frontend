import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { QuestContainerComponent } from './components/quest-container/quest-container.component';
import { UserService } from './services/user.service';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { QuestService } from './services/quest.service';
import { ConnectivityService } from './services/connectivity.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, QuestContainerComponent, ToastModule],
  providers: [MessageService],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly _userService = inject(UserService);
  private readonly _questService = inject(QuestService);
  private readonly _connectivity = inject(ConnectivityService);

  // Ctrl+scroll and trackpad pinch-zoom both surface as `wheel` events with `ctrlKey: true`.
  // Block that everywhere except over the map's own SVG, which handles zooming itself
  // (d3-zoom already calls preventDefault for the wheel events it recognizes there).
  private readonly _blockPageZoom = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    if ((event.target as Element | null)?.closest('#hexmap')) return;
    event.preventDefault();
  };
  // Safari fires its own non-standard gesture events for trackpad/touch pinch, separate from
  // `wheel`; #hexmap already opts out via touch-action: none, so this only needs to cover
  // everywhere else.
  private readonly _blockSafariGesture = (event: Event) => {
    if ((event.target as Element | null)?.closest('#hexmap')) return;
    event.preventDefault();
  };

  ngOnInit() {
    document.addEventListener('wheel', this._blockPageZoom, { passive: false });
    document.addEventListener('gesturestart', this._blockSafariGesture, { passive: false });
    document.addEventListener('gesturechange', this._blockSafariGesture, { passive: false });

    // load statuses and priorities
    this._questService.loadStatuses().subscribe();
    this._questService.loadPriorities().subscribe();

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

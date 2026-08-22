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
  // Always prevented, everywhere including over the map's own SVG: calling preventDefault here
  // doesn't stop d3-zoom's own listener on #hexmap from also firing and handling the wheel event
  // for the map's own zoom (multiple listeners on one event all run regardless of an earlier
  // preventDefault) - so there's no benefit to the earlier "skip over #hexmap, trust d3-zoom to
  // prevent it instead" version, only fragility (e.g. a brief window at startup before d3-zoom
  // finishes attaching, during which nothing would prevent the page from zooming).
  private readonly _blockPageZoom = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
  };
  // Safari fires its own non-standard gesture events for trackpad/touch pinch, separate from
  // `wheel` - unlike the wheel case above, d3-zoom never listens for these at all, so there's
  // nothing on #hexmap handling them for the map's own zoom either way. The previous exception
  // there assumed touch-action: none on #hexmap already covered it, but touch-action only
  // governs touchscreen input, not trackpad-originated gesture events on a laptop - so pinching
  // over the map (exactly where you're most likely to) let Safari's native page-zoom straight
  // through. Always prevented now, everywhere.
  private readonly _blockSafariGesture = (event: Event) => {
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

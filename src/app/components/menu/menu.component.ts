import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { filter, Subscription } from 'rxjs';
import { QuestModalService } from 'src/app/services/quest-modal.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterModule, CommonModule, DialogModule],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss'],
})
export class MenuComponent implements OnInit, OnDestroy {
  _questModalService = inject(QuestModalService);
  _router = inject(Router);

  private _routerSubscription!: Subscription;
  activeIcon: string = '';

  ngOnInit(): void {
    this.setActiveBasedOnUrl(this._router.url);
    this._routerSubscription = this._router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe((event: NavigationEnd) => {
      this.setActiveBasedOnUrl(event.url);
    });
  }

  ngOnDestroy(): void {
    if (this._routerSubscription) {
      this._routerSubscription.unsubscribe();
    }
  }

  setActiveBasedOnUrl(url: string): void {
    if (url === '/') {
      this.activeIcon = 'home';
    } else if (url.includes('/quest-list')) {
      this.activeIcon = 'quest-list';
    } else if (url.includes('/map')) {
      this.activeIcon = 'map';
    } else if (url.includes('/settings')) {
      this.activeIcon = 'settings';
    } else {
      this.activeIcon = '';
    }
  }

  showNewQuestDialog(): void {
    this._questModalService.openNewQuest();
  }
}

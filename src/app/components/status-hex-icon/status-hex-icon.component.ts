import { Component, Input } from '@angular/core';

export type QuestStatusKind = 'pending' | 'in-progress' | 'on-hold' | 'done';

// Small hex-shaped badge mirroring the map's own per-status hex rendering (dark fill for done,
// corner-dot ring for on-hold/done, partial fill for in-progress) instead of a flat color - so a
// quest's status reads the same way here as it does on its actual map tile. See
// app-theme-icon for the sibling "small hex" badge used for themes.
@Component({
  selector: 'app-status-hex-icon',
  standalone: true,
  templateUrl: './status-hex-icon.component.html',
  styleUrl: './status-hex-icon.component.scss',
  host: {
    '[style.width.px]': 'size',
    '[style.height.px]': 'size',
  },
})
export class StatusHexIconComponent {
  private static _uidCounter = 0;

  @Input() status: QuestStatusKind = 'pending';
  @Input() alt = '';
  @Input() size = 32;

  readonly uid = `status-hex-${StatusHexIconComponent._uidCounter++}`;

  get isDone(): boolean {
    return this.status === 'done';
  }

  get isOnHold(): boolean {
    return this.status === 'on-hold';
  }

  get isInProgress(): boolean {
    return this.status === 'in-progress';
  }

  // Matches the map's showsCornerMarker: on-hold and done both get the corner-dot ring.
  get showsCornerMarker(): boolean {
    return this.isOnHold || this.isDone;
  }

  // Light tone for done (contrasts against the dark fill), dark tone for on-hold (contrasts
  // against the theme-color fill) - see the template's own comment for why this departs from the
  // map's single dark-on-dark-plus-glow marker color.
  get markerColor(): string {
    return this.isDone ? 'var(--light-theme-color)' : 'var(--dark-theme-color)';
  }
}

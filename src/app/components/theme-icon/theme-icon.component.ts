import { Component, Input } from '@angular/core';

// Small hex-shaped badge showing a theme's color as a glowing border, reused wherever a quest's
// theme needs a compact visual marker (quest-details, quest-card, the map's quest-picker dialog).
@Component({
  selector: 'app-theme-icon',
  standalone: true,
  templateUrl: './theme-icon.component.html',
  styleUrl: './theme-icon.component.scss',
  host: {
    '[style.width.px]': 'size',
    '[style.height.px]': 'size',
  },
})
export class ThemeIconComponent {
  @Input() color = 'var(--theme-color)';
  @Input() alt = '';
  @Input() size = 32;
}

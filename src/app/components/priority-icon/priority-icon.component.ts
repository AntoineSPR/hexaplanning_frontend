import { Component, Input } from '@angular/core';

// Small hex-shaped badge matching the map's own priority styling (a glowing border in the
// priority's own color, see getHexBorderColor/getHexBorderGlow in map.component.ts) instead of
// the old flat star icon.
@Component({
  selector: 'app-priority-icon',
  standalone: true,
  templateUrl: './priority-icon.component.html',
  styleUrl: './priority-icon.component.scss',
  host: {
    '[style.width.px]': 'size',
    '[style.height.px]': 'size',
  },
})
export class PriorityIconComponent {
  @Input() color = 'var(--theme-color)';
  @Input() alt = '';
  @Input() size = 32;
}

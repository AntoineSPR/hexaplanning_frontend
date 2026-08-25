import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxColorsComponent, NgxColorsTriggerDirective } from 'ngx-colors';
import { FavoriteColorService } from '../../services/favorite-color.service';
import { ConnectivityService } from '../../services/connectivity.service';

// Color picker + hex readout + favorite-star toggle, shared by quest-group-modal and theme-modal
// (previously duplicated in both). :host is display:contents so its 3 elements flow directly into
// whatever flex row the caller wraps it in (e.g. .group-color-row/.theme-color-row), rather than
// this component itself becoming an extra flex item.
@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [FormsModule, NgxColorsComponent, NgxColorsTriggerDirective],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
})
export class ColorPickerComponent {
  private readonly _favoriteColorService = inject(FavoriteColorService);
  readonly _connectivity = inject(ConnectivityService);

  @Input() color = '';
  @Output() colorChange = new EventEmitter<string>();
  @Input() inputId = '';

  get paletteColors(): string[] {
    return this._favoriteColorService.favorites().map(f => f.hex);
  }

  get isFavoriteColor(): boolean {
    return this._favoriteColorService.favorites().some(f => f.hex.toLowerCase() === this.color.toLowerCase());
  }

  // ngx-colors' only hex output model is HEXA (8-digit, with an alpha suffix) - stripped down to
  // the plain 6-digit hex every color in the app expects (Theme.Color, QuestGroup.Color,
  // DEFAULT_COLOR), since alpha is locked to fully opaque anyway (see the template).
  onColorPicked(value: string | null | undefined): void {
    if (!value) return;
    this.colorChange.emit(value.length === 9 ? value.slice(0, 7) : value);
  }

  toggleFavoriteColor(): void {
    if (this._connectivity.isOffline()) return;
    const existing = this._favoriteColorService.favorites().find(f => f.hex.toLowerCase() === this.color.toLowerCase());
    if (existing) {
      this._favoriteColorService.deleteFavoriteColor(existing.id).subscribe();
    } else {
      this._favoriteColorService.createFavoriteColor({ hex: this.color }).subscribe();
    }
  }
}

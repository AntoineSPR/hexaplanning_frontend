import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { MenuComponent } from 'src/app/components/menu/menu.component';

@Component({
  selector: 'app-rgpd',
  standalone: true,
  imports: [CommonModule, CardModule, MenuComponent],
  templateUrl: './rgpd.component.html',
  styleUrl: './rgpd.component.scss',
})
export class RgpdComponent {
  lastUpdated = '12 octobre 2025';
}

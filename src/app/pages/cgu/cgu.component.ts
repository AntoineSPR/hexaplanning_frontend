import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { MenuComponent } from 'src/app/components/menu/menu.component';

@Component({
  selector: 'app-cgu',
  standalone: true,
  imports: [CommonModule, CardModule, MenuComponent],
  templateUrl: './cgu.component.html',
  styleUrl: './cgu.component.scss',
})
export class CguComponent {
  lastUpdated = '12 octobre 2025';
}

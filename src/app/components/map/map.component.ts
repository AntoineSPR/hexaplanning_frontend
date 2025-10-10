import { Component, effect, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { RadioButtonModule } from 'primeng/radiobutton';
import { Dialog } from 'primeng/dialog';
import { QuestUpdateDTO } from 'src/app/models/quest.model';
import { QuestService } from 'src/app/services/quest.service';
import { HexService } from 'src/app/services/hex.service';
import { QuestModalService } from 'src/app/services/quest-modal.service';
import { switchMap } from 'rxjs';
import { MenuComponent } from '../menu/menu.component';

type Hex = {
  q: number;
  r: number;
  s: number;
  cx: number;
  cy: number;
  priority: number;
  quest?: QuestUpdateDTO;
};

const MAP_WIDTH = 290;
const MAP_HEIGHT = 490;
const HEX_SIZE = 40;
const MAX_PRIORITY_LEVEL = 3;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [Dialog, ButtonModule, FormsModule, RadioButtonModule, MenuComponent],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit {
  _questService = inject(QuestService);
  _hexService = inject(HexService);
  _questModalService = inject(QuestModalService);

  hexes: Hex[] = [];
  size = HEX_SIZE;
  maxPriorityLevel = MAX_PRIORITY_LEVEL;
  mapWidth = MAP_WIDTH;
  mapHeight = MAP_HEIGHT;

  get unassignedPendingQuests(): QuestUpdateDTO[] {
    return this._questService.unassignedPendingQuests();
  }

  selectedQuest: QuestUpdateDTO | null = null;
  dialogVisible = false;
  selectedHex: Hex | null = null;

  constructor() {
    this._questService.loadQuests();

    effect(() => {
      const allQuests = this._questService.quests();
      this.hexes.forEach(hex => {
        if (hex.quest) {
          const updatedQuest = allQuests.find(q => q.id === hex.quest?.id);
          if (updatedQuest) {
            hex.quest = updatedQuest;
          }
        }
      });
    });

    effect(() => {
      const deletedQuestId = this._questService.deletedQuestId();
      // this.hexes.forEach(hex => {
      //   if (hex.quest?.id === deletedQuestId) {
      //     hex.quest = undefined;
      //   }
      // });
    });
  }

  ngOnInit(): void {
    this._questService.loadUnassignedPendingQuests();
    this.generateHexes();
    this.loadQuestAssignment();
  }

  //#region Generate Map
  generateHexes(): void {
    const hexes: Hex[] = [];

    for (let priority = 0; priority <= this.maxPriorityLevel; priority++) {
      for (let q = 0; q <= priority; q++) {
        for (let r = Math.max(-priority, -q); r <= Math.min(priority, priority - q); r++) {
          const s = -q - r;
          const maxAbs = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
          if (maxAbs === priority) {
            const { cx, cy } = this.hexToPixel(q, r);
            hexes.push({ q, r, s, cx, cy, priority });
          }
        }
      }
    }

    this.hexes = hexes;
  }

  hexToPixel(q: number, r: number): { cx: number; cy: number } {
    const size = this.size;
    const x = size * Math.sqrt(3) * (q + r / 2);
    const y = ((size * 3) / 2) * r;
    return {
      cx: x + 45, // left padding
      cy: y + this.mapHeight / 2, // vertical centering
    };
  }

  getHexPoints(cx: number, cy: number, offset: number = 0): string {
    const adjustedSize = this.size + offset;
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = cx + adjustedSize * Math.cos(angle);
      const y = cy + adjustedSize * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  }

  getProgressPath(cx: number, cy: number, advancement: number): string {
    if (advancement <= 0) return '';
    if (advancement >= 100) return this.getHexPoints(cx, cy);

    const size = this.size;
    const percentage = Math.min(advancement, 100) / 100;

    // Create a circular arc that fills the hexagon radially
    const startAngle = -Math.PI / 2; // Start from top
    const endAngle = startAngle + 2 * Math.PI * percentage;

    // Calculate the arc points
    const startX = cx + size * Math.cos(startAngle);
    const startY = cy + size * Math.sin(startAngle);
    const endX = cx + size * Math.cos(endAngle);
    const endY = cy + size * Math.sin(endAngle);

    // Create an SVG path for the arc
    const largeArcFlag = percentage > 0.5 ? 1 : 0;

    if (percentage === 1) {
      // Full circle
      return `M ${cx},${cy} m -${size},0 a ${size},${size} 0 1,1 ${size * 2},0 a ${size},${size} 0 1,1 -${size * 2},0`;
    } else {
      // Partial arc
      return `M ${cx} ${cy} L ${startX} ${startY} A ${size} ${size} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
    }
  }
  // #endregion

  //#region Quests
  loadQuestAssignment(): void {
    this._hexService.getAllAssignments().subscribe(assignments => {
      for (const a of assignments) {
        const hex = this.hexes.find(h => h.q === a.q && h.r === a.r && h.s === a.s);
        if (hex) {
          this._questService.getQuestById(a.questId).subscribe(quest => {
            hex.quest = quest;
          });
        }
      }
    });
  }

  handleHexClick(hex: Hex): void {
    this._hexService.getAssignmentByCoordinates(hex.q, hex.r, hex.s).subscribe({
      next: assignment => {
        if (assignment) {
          this.openQuestDetails(assignment.questId);
        } else {
          this.openQuestToHexModal(hex);
        }
      },
      error: err => {
        console.error('Error fetching assignment:', err);
      },
    });
  }

  openQuestDetails(questId: string): void {
    this._questService.getQuestById(questId).subscribe(quest => {
      this._questModalService.openQuestDetails(quest);
    });
  }

  openQuestToHexModal(hex: Hex): void {
    this.selectedHex = hex;
    this.dialogVisible = true;
    this.selectedQuest = null;
  }

  assignQuestToHex(): void {
    if (this.selectedHex && this.selectedQuest) {
      const hexToUpdate = this.selectedHex;
      const questToAssign = this.selectedQuest;
      const hexAssignment = {
        q: hexToUpdate.q,
        r: hexToUpdate.r,
        s: hexToUpdate.s,
        questId: questToAssign.id,
      };

      this._hexService
        .saveAssignment(hexAssignment)
        .pipe(switchMap(() => this._questService.updateQuest({ ...questToAssign })))
        .subscribe({
          next: () => {
            hexToUpdate.quest = questToAssign;
            this.dialogVisible = false;
            this.selectedHex = null;
            this.selectedQuest = null;
            this._questService.loadUnassignedPendingQuests();
          },
          error: err => {
            console.error('Failed to assign quest:', err);
          },
        });
    }
  }

  deleteQuestFromHex(hex: Hex, event: MouseEvent): void {
    event.stopPropagation();

    if (hex.quest) {
      const questToUpdate = hex.quest;

      this._hexService
        .deleteAssignment(hex.q, hex.r, hex.s)
        .pipe(switchMap(() => this._questService.updateQuest({ ...questToUpdate })))
        .subscribe({
          next: () => {
            hex.quest = undefined;
            this._questService.loadUnassignedPendingQuests();
          },
          error: err => {
            console.error('Failed to delete quest from hex:', err);
          },
        });
    }
  }

  getHexColor(hex: Hex): string {
    let color = '#eee';
    if (!hex.quest) return color;
    if (hex.quest.statusId === this._questService.statusDoneId) {
      color = 'var(--dark-theme-color)';
    } else {
      color = 'var(--theme-color)';
    }
    return color;
  }

  getHexBorderColor(hex: Hex): string {
    if (!hex.quest) return '';
    if (hex.quest.statusId === this._questService.statusDoneId) return '';

    const priorityQuest = this._questService?.priorities()?.find(x => x.id == hex?.quest?.priorityId);

    return priorityQuest?.borderColor ?? '';
  }

  getPriorityKey(priorityValue: string): string {
    if (priorityValue && typeof priorityValue === 'string') {
      return priorityValue.toLowerCase();
    }
    return 'primary';
  }

  getPriorityImagePath(quest: QuestUpdateDTO): string {
    const priority = this._questService.priorities()?.find(p => p.id === quest.priorityId);
    const priorityKey = this.getPriorityKey(priority?.icon ?? 'primary');
    return `/icons/${priorityKey}.png`;
  }

  getPriorityAltText(quest: QuestUpdateDTO): string {
    const priority = this._questService.priorities()?.find(p => p.id === quest.priorityId);
    const priorityKey = this.getPriorityKey(priority?.name ?? 'quete principale');
    return priorityKey;
  }

  selectQuest(quest: QuestUpdateDTO): void {
    this.selectedQuest = quest;
  }

  getQuestAdvancement(hex: Hex): number {
    if (!hex.quest) return 0;
    // Cast to QuestOutputDTO to access advancement property
    const questOutput = hex.quest as any;
    return questOutput.advancement || 0;
  }

  getProgressColor(advancement: number): string {
    // Green gradient based on progress
    const opacity = 0.6;
    if (advancement < 25) {
      return `rgba(255, 193, 7, ${opacity})`; // Yellow for low progress
    } else if (advancement < 50) {
      return `rgba(255, 152, 0, ${opacity})`; // Orange for medium-low progress
    } else if (advancement < 75) {
      return `rgba(76, 175, 80, ${opacity})`; // Green for medium-high progress
    } else {
      return `rgba(46, 125, 50, ${opacity})`; // Dark green for high progress
    }
  }

  getHexClipId(hex: Hex): string {
    return `hex-clip-${hex.q}-${hex.r}-${hex.s}`;
  }
}

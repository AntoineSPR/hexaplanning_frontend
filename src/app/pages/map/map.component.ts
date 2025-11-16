import { Component, effect, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { RadioButtonModule } from 'primeng/radiobutton';
import { Dialog } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { QuestUpdateDTO } from 'src/app/models/quest.model';
import { QuestService } from 'src/app/services/quest.service';
import { HexService } from 'src/app/services/hex.service';
import { QuestModalService } from 'src/app/services/quest-modal.service';
import { MenuComponent } from '../../components/menu/menu.component';
import { MapGridService } from 'src/app/services/map-grid.service';
import { QuestAssignmentService } from 'src/app/services/quest-assignment.service';
import { CameraStateService } from 'src/app/services/camera-state.service';
import { Hex } from 'src/app/models/hex.model';

const MAP_WIDTH = 290;
const MAP_HEIGHT = 490;
const HEX_SIZE = 40;
const MAX_EXPANSION = 3;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [Dialog, ButtonModule, FormsModule, RadioButtonModule, MenuComponent, ConfirmDialogModule],
  providers: [ConfirmationService],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit, OnDestroy {
  _questService = inject(QuestService);
  _hexService = inject(HexService);
  _questModalService = inject(QuestModalService);
  _mapGrid = inject(MapGridService);
  _questAssignment = inject(QuestAssignmentService);
  _cameraState = inject(CameraStateService);

  private readonly _confirmationService = inject(ConfirmationService);

  hexes: Hex[] = [];
  size = HEX_SIZE;
  maxExpansion = MAX_EXPANSION;
  mapWidth = MAP_WIDTH;
  mapHeight = MAP_HEIGHT;

  // Camera state for panning and zoom
  panX = 0;
  panY = 0;
  zoom = 1;
  isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private isMouseDown = false;
  private downClientX = 0;
  private downClientY = 0;
  private dragThreshold = 5; // pixels before we consider it a drag
  private suppressClicksUntil = 0; // timestamp to ignore clicks right after a drag

  // Touch support
  private touchStartDistance = 0;
  private touchStartZoom = 1;
  private isTouching = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private wasPinch = false;

  // Handlers to persist camera on refresh / tab hide (mobile-safe)
  private readonly _persistCamera = () => {
    this._cameraState.saveState(this.panX, this.panY, this.zoom);
  };
  private readonly _onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this._persistCamera();
    }
  };

  get unassignedPendingQuests(): QuestUpdateDTO[] {
    return this._questService.unassignedPendingQuests();
  }

  selectedQuest: QuestUpdateDTO | null = null;
  dialogVisible = false;
  selectedHex: Hex | null = null;
  isLoading = true;

  constructor() {
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
      if (deletedQuestId) {
        let changed = false;
        this.hexes.forEach(hex => {
          if (hex.quest?.id === deletedQuestId) {
            hex.quest = undefined;
            changed = true;
          }
        });
        if (changed) {
          this._mapGrid.removeOrphanedDynamicHexes(this.hexes);
        }
      }
    });
  }

  ngOnInit(): void {
    this._questService.getAllUnassignedPendingQuests().subscribe();

    this.generateHexes();

    // Restore camera state if it exists, otherwise center on center hex
    const savedState = this._cameraState.getState();
    if (savedState) {
      this.panX = savedState.panX;
      this.panY = savedState.panY;
      this.zoom = savedState.zoom;
    } else {
      this.centerCameraOnCenterHex();
    }

    // Register callback for bounds changes
    this._questAssignment.setOnBoundsChange(bounds => {
      this.mapWidth = bounds.width;
      this.mapHeight = bounds.height;
    });

    // Persist camera on refresh/navigation and when tab/app is backgrounded
    window.addEventListener('beforeunload', this._persistCamera);
    window.addEventListener('pagehide', this._persistCamera); // iOS Safari friendly
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // Always refresh assignments from backend to avoid stale local cache across browsers
    // Clear any quest references first, then hydrate from server
    this.hexes.forEach(h => (h.quest = undefined));
    this.isLoading = true;
    this._questAssignment.loadAssignmentsIntoHexes(this.hexes, this.size).subscribe({
      next: () => {
        // After assignments load, trim any orphaned dynamic hexes and update bounds
        this._mapGrid.removeOrphanedDynamicHexes(this.hexes);
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  ngOnDestroy(): void {
    // Save camera state and hexes when leaving the component
    this._cameraState.saveState(this.panX, this.panY, this.zoom);

    // Cleanup listeners
    window.removeEventListener('beforeunload', this._persistCamera);
    window.removeEventListener('pagehide', this._persistCamera);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  //#region Generate Map
  generateHexes(): void {
    this.hexes = this._mapGrid.generateHexes(this.maxExpansion, this.size, this.mapHeight);
  }

  hexToPixel(q: number, r: number): { cx: number; cy: number } {
    return this._mapGrid.hexToPixel(q, r, this.size);
  }

  getHexPoints(cx: number, cy: number, offset: number = 0): string {
    return this._mapGrid.getHexPoints(cx, cy, this.size, offset);
  }

  getProgressPath(cx: number, cy: number, advancement: number): string {
    return this._mapGrid.getProgressPath(cx, cy, this.size, advancement);
  }
  // #endregion

  //#region Quests
  handleHexClick(hex: Hex): void {
    // If a drag just occurred, ignore the click that follows mouseup
    if (Date.now() < this.suppressClicksUntil) {
      return;
    }
    this._questAssignment.getAssignmentForHex(hex.q, hex.r, hex.s).subscribe({
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

  handleHexKeydown(event: KeyboardEvent, hex: Hex): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.handleHexClick(hex);
    }
  }

  getHexAriaLabel(hex: Hex): string {
    if (hex.quest) {
      const statusText = hex.quest.statusId === this._questService.statusDoneId ? 'terminée' : 'en cours';
      return `Hexagone avec quête: ${hex.quest.title}, ${statusText}. Niveau ${hex.level}`;
    } else {
      return `Hexagone vide, niveau ${hex.level}. Cliquer pour assigner une quête`;
    }
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
      this._questAssignment.assignQuestToHex(this.selectedHex, this.selectedQuest, this.hexes, this.size).subscribe({
        next: () => {
          this.dialogVisible = false;
          this.selectedHex = null;
          this.selectedQuest = null;
        },
        error: err => {
          console.error('Failed to assign quest:', err);
        },
      });
    }
  }

  deleteQuestFromHex(hex: Hex, event: MouseEvent | TouchEvent): void {
    event.stopPropagation();
    event.preventDefault();

    if (hex.quest) {
      const questToUpdate = hex.quest;

      this._confirmationService.confirm({
        message: `Retirer la quête de la carte ?`,
        closable: true,
        closeOnEscape: true,
        accept: () => {
          this._questAssignment.deleteQuestFromHex(hex, this.hexes, this.size).subscribe({
            error: err => {
              console.error('Failed to delete quest from hex:', err);
            },
          });
        },
      });

      // Focus management for the confirmation dialog
      setTimeout(() => {
        const acceptButton = document.querySelector('.accept-confirmation-button') as HTMLElement;
        if (acceptButton) {
          acceptButton.focus();
        }
      }, 100);
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

  getPriorityIcon(quest: QuestUpdateDTO): string {
    const priority = this._questService.priorities()?.find(p => p.id === quest.priorityId);
    return priority?.icon ?? 'primary';
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

  getHexClipId(hex: Hex): string {
    return `hex-clip-${hex.q}-${hex.r}-${hex.s}`;
  }

  //#region Camera & Panning
  /**
   * Camera pan and zoom controls:
   * - Click and drag anywhere to pan the map
   * - Scroll wheel to zoom in/out (zoom towards cursor position)
   * - Click the reset button to return to default view
   * - Hex clicks still work normally; a small movement threshold prevents accidental drags
   */
  getCameraTransform(): string {
    return `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`;
  }

  onSvgMouseDown(event: MouseEvent): void {
    // Only react to left button
    if (event.button !== 0) return;
    this.isMouseDown = true;
    this.isPanning = false; // will become true after threshold is exceeded
    this.panStartX = event.clientX - this.panX;
    this.panStartY = event.clientY - this.panY;
    this.downClientX = event.clientX;
    this.downClientY = event.clientY;
    event.preventDefault();
  }

  onSvgMouseMove(event: MouseEvent): void {
    if (!this.isMouseDown) return;
    const dx = event.clientX - this.downClientX;
    const dy = event.clientY - this.downClientY;
    if (!this.isPanning) {
      const dist = Math.hypot(dx, dy);
      if (dist >= this.dragThreshold) {
        this.isPanning = true;
      }
    }
    if (this.isPanning) {
      this.panX = event.clientX - this.panStartX;
      this.panY = event.clientY - this.panStartY;
      event.preventDefault();
    }
  }

  onSvgMouseUp(event: MouseEvent): void {
    if (!this.isMouseDown) return;
    if (this.isPanning) {
      // briefly suppress clicks right after a drag ends
      this.suppressClicksUntil = Date.now() + 250;
    }
    this.isPanning = false;
    this.isMouseDown = false;
    event.preventDefault();
  }

  onSvgMouseLeave(event: MouseEvent): void {
    if (!this.isMouseDown) return;
    if (this.isPanning) {
      this.suppressClicksUntil = Date.now() + 250;
    }
    this.isPanning = false;
    this.isMouseDown = false;
  }

  onSvgWheel(event: WheelEvent): void {
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(3, this.zoom * zoomFactor));

    // Zoom towards mouse position
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Adjust pan to keep mouse position stable during zoom
    const zoomRatio = newZoom / this.zoom;
    this.panX = mouseX - (mouseX - this.panX) * zoomRatio;
    this.panY = mouseY - (mouseY - this.panY) * zoomRatio;
    this.zoom = newZoom;
  }

  resetCamera(): void {
    this.centerCameraOnCenterHex();
  }

  centerCameraOnCenterHex(): void {
    // Find the center hex (0, 0, 0)
    const centerHex = this.hexes.find(h => h.q === 0 && h.r === 0 && h.s === 0);
    if (centerHex) {
      // Center the camera on this hex
      // We want the hex to be in the center of the viewport
      // The viewport dimensions are mapWidth x mapHeight
      this.panX = this.mapWidth / 2 - centerHex.cx;
      this.panY = this.mapHeight / 2 - centerHex.cy;
    } else {
      // Fallback to default
      this.panX = 0;
      this.panY = 0;
    }
    this.zoom = 1;
  }

  //#region Touch Support
  onTouchStart(event: TouchEvent): void {
    const touches = event.touches;

    if (touches.length === 1) {
      // Single finger pan
      this.isTouching = true;
      this.isPanning = false;
      this.wasPinch = false;
      this.touchStartX = touches[0].clientX;
      this.touchStartY = touches[0].clientY;
      this.downClientX = touches[0].clientX;
      this.downClientY = touches[0].clientY;
      this.panStartX = touches[0].clientX - this.panX;
      this.panStartY = touches[0].clientY - this.panY;
    } else if (touches.length === 2) {
      // Two finger pinch-to-zoom
      this.isTouching = true;
      this.isPanning = true; // skip click detection for pinch
      this.wasPinch = true;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      this.touchStartDistance = Math.hypot(dx, dy);
      this.touchStartZoom = this.zoom;

      // Center between two fingers for pan origin
      const centerX = (touches[0].clientX + touches[1].clientX) / 2;
      const centerY = (touches[0].clientY + touches[1].clientY) / 2;
      this.panStartX = centerX - this.panX;
      this.panStartY = centerY - this.panY;
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.isTouching) return;
    const touches = event.touches;

    if (touches.length === 1) {
      // Single finger pan
      const dx = touches[0].clientX - this.downClientX;
      const dy = touches[0].clientY - this.downClientY;
      if (!this.isPanning) {
        const dist = Math.hypot(dx, dy);
        if (dist >= this.dragThreshold) {
          this.isPanning = true;
        }
      }
      if (this.isPanning) {
        // prevent default only when actually panning
        event.preventDefault();
        this.panX = touches[0].clientX - this.panStartX;
        this.panY = touches[0].clientY - this.panStartY;
      }
    } else if (touches.length === 2) {
      // During pinch, prevent default
      event.preventDefault();
      // Two finger pinch-to-zoom
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      const scale = distance / this.touchStartDistance;
      const newZoom = Math.max(0.5, Math.min(3, this.touchStartZoom * scale));

      // Center between fingers
      const centerX = (touches[0].clientX + touches[1].clientX) / 2;
      const centerY = (touches[0].clientY + touches[1].clientY) / 2;

      // Adjust pan to keep center stable during zoom
      const zoomRatio = newZoom / this.zoom;
      this.panX = centerX - (centerX - this.panX) * zoomRatio;
      this.panY = centerY - (centerY - this.panY) * zoomRatio;
      this.zoom = newZoom;
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (!this.isTouching) return;
    // Only prevent default if we were panning or pinching to avoid suppressing synthetic click
    if (this.isPanning || this.wasPinch) {
      event.preventDefault();
      this.suppressClicksUntil = Date.now() + 250;
    }
    this.isTouching = false;
    this.isPanning = false;
    this.wasPinch = false;
  }
  //#endregion
  //#endregion
}

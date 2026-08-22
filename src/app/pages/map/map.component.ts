import { Component, effect, inject, OnDestroy, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { RadioButtonModule } from 'primeng/radiobutton';
import { Dialog } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { QuestUpdateDTO } from 'src/app/models/quest.model';
import { QuestService } from 'src/app/services/quest.service';
import { QuestModalService } from 'src/app/services/quest-modal.service';
import { MenuComponent } from '../../components/menu/menu.component';
import { MapGridService } from 'src/app/services/map-grid.service';
import { QuestAssignmentService } from 'src/app/services/quest-assignment.service';
import { CameraStateService } from 'src/app/services/camera-state.service';
import { Hex } from 'src/app/models/hex.model';
import { SvgZoomService, SvgZoomHandle } from 'src/app/services/svg-zoom.service';
import { ConnectivityService } from 'src/app/services/connectivity.service';
import { HexDragController, HexDragHost } from './hex-drag.controller';

const MAP_WIDTH = 290;
const MAP_HEIGHT = 490;
const HEX_SIZE = 40;
// Matches the scaleMin/scaleMax passed to SvgZoomService.attach() below - shared so
// fitAllQuests() clamps to the same range the zoom gesture itself is limited to.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [Dialog, ButtonModule, FormsModule, RadioButtonModule, MenuComponent, ConfirmDialogModule],
  providers: [ConfirmationService],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit, HexDragHost {
  @ViewChild('svgRoot', { static: false }) svgRoot?: ElementRef<SVGSVGElement>;
  @ViewChild('cameraGroup', { static: false }) cameraGroup?: ElementRef<SVGGElement>;
  _questService = inject(QuestService);
  _questModalService = inject(QuestModalService);
  _mapGrid = inject(MapGridService);
  _questAssignment = inject(QuestAssignmentService);
  _cameraState = inject(CameraStateService);
  _el = inject(ElementRef<HTMLElement>);
  _svgZoom = inject(SvgZoomService);
  _connectivity = inject(ConnectivityService);

  // zoom handle
  zoomHandle?: SvgZoomHandle;

  private readonly _confirmationService = inject(ConfirmationService);

  // Drives the whole quest drag-and-drop gesture (long-press-to-arm, edge auto-pan, live grid
  // growth, drop) - this component implements HexDragHost so the controller can read/drive
  // camera and map state without duplicating it. See hex-drag.controller.ts.
  private readonly _drag = new HexDragController(this, this._mapGrid, this._questAssignment, this._connectivity);

  hexes: Hex[] = [];
  size = HEX_SIZE;

  // mapWidth/mapHeight drive the SVG viewBox size, which shrinks fitScale as the map grows
  // (drag-time growth, quests spreading out). Since zoom is a multiplier on top of fitScale, a
  // fixed zoom cap would mean "fully zoomed in" keeps rendering smaller the more the map grows -
  // these setters keep the zoom behavior's max in sync (see computeMaxZoom) so the maximum
  // zoomed-in scale stays constant regardless of how large the viewBox has gotten.
  private _mapWidth = MAP_WIDTH;
  get mapWidth(): number {
    return this._mapWidth;
  }
  set mapWidth(value: number) {
    this._mapWidth = value;
    this.updateZoomExtent();
  }

  private _mapHeight = MAP_HEIGHT;
  get mapHeight(): number {
    return this._mapHeight;
  }
  set mapHeight(value: number) {
    this._mapHeight = value;
    this.updateZoomExtent();
  }

  // Camera state for panning and zoom
  panX = 0;
  panY = 0;
  zoom = 1;
  isPanning = false;
  suppressClicksUntil = 0; // timestamp to ignore clicks right after a drag
  private hadCameraMove = false; // track if any pan/zoom occurred during a gesture

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
  isFadingOut = false;

  // Template-facing drag state delegates straight through to the controller.
  get draggingHex(): Hex | null {
    return this._drag.draggingHex;
  }
  get dragOverHex(): Hex | null {
    return this._drag.dragOverHex;
  }
  get dragPreviewX(): number {
    return this._drag.dragPreviewX;
  }
  get dragPreviewY(): number {
    return this._drag.dragPreviewY;
  }
  get dragOverlayScale(): number {
    return this._drag.dragOverlayScale;
  }
  get armedHex(): Hex | null {
    return this._drag.armedHex;
  }

  // Set when the initial assignment load had to fall back to the offline snapshot; tells the
  // reconnect effect below to quietly re-fetch the authoritative state once back online, so the
  // map self-heals instead of requiring a manual page reload.
  private needsRefreshOnReconnect = false;

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
          const { islandRestored } = this._mapGrid.removeOrphanedDynamicHexes(this.hexes, this.size);
          if (islandRestored) {
            this.resetCamera();
          }
        }
      }
    });

    effect(() => {
      if (this._connectivity.isOnline() && this.needsRefreshOnReconnect) {
        this.needsRefreshOnReconnect = false;
        // Silent background refresh: no wipe/spinner, since the offline snapshot is already
        // showing something reasonable - just reconcile it with the server now that we can.
        this._questAssignment.loadAssignmentsIntoHexes(this.hexes, this.size).subscribe({
          next: () => {
            const { islandRestored } = this._mapGrid.removeOrphanedDynamicHexes(this.hexes, this.size);
            if (islandRestored) {
              this.resetCamera();
            }
          },
          error: err => console.error('Failed to refresh assignments after reconnect:', err),
        });
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

    // Register callback for when the starting island gets restored (map back to zero quests)
    this._questAssignment.setOnIslandRestored(() => this.resetCamera());

    // Persist camera on refresh/navigation and when tab/app is backgrounded
    window.addEventListener('beforeunload', this._persistCamera);
    window.addEventListener('pagehide', this._persistCamera); // iOS Safari friendly
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // Always refresh assignments from backend to avoid stale local cache across browsers
    // Clear any quest references first, then hydrate from server
    this.hexes.forEach(h => (h.quest = undefined));
    this.isLoading = true;
    if (this._connectivity.isOffline()) {
      this.needsRefreshOnReconnect = true;
    }
    this._questAssignment.loadAssignmentsIntoHexes(this.hexes, this.size).subscribe({
      next: () => {
        // After assignments load, trim any orphaned dynamic hexes and update bounds
        const { islandRestored } = this._mapGrid.removeOrphanedDynamicHexes(this.hexes, this.size);
        if (islandRestored) {
          this.resetCamera();
        }
      },
      complete: () => {
        // Trigger fade-out animation first
        this.isFadingOut = true;
        // Then remove from DOM after animation completes
        setTimeout(() => {
          this.isLoading = false;
        }, 400);
      },
      error: err => {
        // Without this, a failed request (e.g. an expired session) left isLoading stuck true
        // forever, since `complete` never fires after `error`.
        console.error('Failed to load assignments:', err);
        this.isFadingOut = true;
        setTimeout(() => {
          this.isLoading = false;
        }, 400);
      },
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.svgRoot || !this.cameraGroup) return;
    const saved = this._cameraState.getState();
    this.zoomHandle = await this._svgZoom.attach(this.svgRoot.nativeElement, this.cameraGroup.nativeElement, {
      scaleMin: ZOOM_MIN,
      scaleMax: this.computeMaxZoom(),
      onStart: () => {
        this.hadCameraMove = false;
        this.togglePanning(true);
      },
      onEnd: () => {
        this.togglePanning(false);
        if (this.hadCameraMove) {
          this.suppressClicksUntil = Date.now() + 250;
        }
      },
      onTransform: t => {
        // Detect meaningful changes to mark that a camera move occurred
        const dx = Math.abs(t.x - this.panX);
        const dy = Math.abs(t.y - this.panY);
        const dk = Math.abs(t.k - this.zoom);
        if (dx > 0.5 || dy > 0.5 || dk > 0.001) {
          this.hadCameraMove = true;
        }
        this.panX = t.x;
        this.panY = t.y;
        this.zoom = t.k;
        this._cameraState.saveState(this.panX, this.panY, this.zoom);
      },
    });
    // Apply initial transform
    this.zoomHandle.setTransform(saved?.panX ?? this.panX, saved?.panY ?? this.panY, saved?.zoom ?? this.zoom);
  }

  ngOnDestroy(): void {
    // Save camera state and hexes when leaving the component
    this._cameraState.saveState(this.panX, this.panY, this.zoom);
    this.zoomHandle?.destroy();

    // Cleanup listeners
    window.removeEventListener('beforeunload', this._persistCamera);
    window.removeEventListener('pagehide', this._persistCamera);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  //#region Generate Map
  generateHexes(): void {
    this.hexes = this._mapGrid.generateHexes(this.size, this.mapHeight);
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

    if (this._connectivity.isOffline()) {
      // No network round-trip while offline: fall back to whatever is already loaded locally
      // so hexes stay browsable read-only without a connection.
      if (hex.quest) {
        this._questModalService.openQuestDetails(hex.quest);
      } else {
        this.openQuestToHexModal(hex);
      }
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
    if (this._connectivity.isOffline()) return;

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

    if (this._connectivity.isOffline()) return;

    if (hex.quest) {
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

  // The drag gesture itself (long-press-to-arm, edge auto-pan, live grid growth, drop) is all
  // handled by HexDragController - see hex-drag.controller.ts.
  onHexPointerDown(hex: Hex, event: PointerEvent): void {
    this._drag.onPointerDown(hex, event);
  }

  onHexPointerMove(event: PointerEvent): void {
    this._drag.onPointerMove(event);
  }

  onHexPointerUp(event: PointerEvent): void {
    this._drag.onPointerUp(event);
  }

  onHexPointerCancel(event: PointerEvent): void {
    this._drag.onPointerCancel(event);
  }

  isLandedHex(hex: Hex): boolean {
    return this._drag.isLandedHex(hex);
  }

  getDropHighlightClass(hex: Hex): string {
    return this._drag.getDropHighlightClass(hex);
  }

  isOutOfDragBounds(hex: Hex): boolean {
    return this._drag.isOutOfDragBounds(hex);
  }

  getHexColor(hex: Hex): string {
    let color = 'var(--base-hex-color)';
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

  resetCamera(): void {
    this.centerCameraOnCenterHex();
    if (this.zoomHandle) {
      this.zoomHandle.setTransform(this.panX, this.panY, this.zoom);
    }
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

  // Re-centers the camera on a hex, keeping the current zoom level (unlike
  // centerCameraOnCenterHex/resetCamera, which reset zoom to 1). Used after dropping a quest
  // onto a new hex (called by HexDragController via the HexDragHost interface), so the camera
  // follows it there instead of leaving the view where it was.
  centerCameraOnHex(hex: Hex): void {
    this.panX = this.mapWidth / 2 - hex.cx * this.zoom;
    this.panY = this.mapHeight / 2 - hex.cy * this.zoom;
    this.zoomHandle?.setTransform(this.panX, this.panY, this.zoom);
  }

  // Zooms/pans to frame every currently assigned quest at once - an escape hatch back to an
  // overview when quests end up spread across a large map. Falls back to the default centered
  // view when there's nothing assigned yet.
  fitAllQuests(): void {
    const assignedHexes = this.hexes.filter(h => h.quest);
    if (assignedHexes.length === 0) {
      this.resetCamera();
      return;
    }

    const pad = this.size + 10;
    const xs = assignedHexes.map(h => h.cx);
    const ys = assignedHexes.map(h => h.cy);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const boxWidth = Math.max(maxX - minX, 1);
    const boxHeight = Math.max(maxY - minY, 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newZoom = Math.min(Math.max(Math.min(this.mapWidth / boxWidth, this.mapHeight / boxHeight), ZOOM_MIN), this.computeMaxZoom());

    this.zoom = newZoom;
    this.panX = this.mapWidth / 2 - centerX * newZoom;
    this.panY = this.mapHeight / 2 - centerY * newZoom;
    this.zoomHandle?.setTransform(this.panX, this.panY, this.zoom);
  }

  // The maximum zoom-in level, scaled up as the map's viewBox grows so the zoomed-in render
  // scale stays constant instead of shrinking - see the mapWidth/mapHeight setters above.
  private computeMaxZoom(): number {
    return ZOOM_MAX * Math.max(this.mapWidth / MAP_WIDTH, this.mapHeight / MAP_HEIGHT);
  }

  private updateZoomExtent(): void {
    this.zoomHandle?.setScaleExtent(ZOOM_MIN, this.computeMaxZoom());
  }

  private togglePanning(active: boolean) {
    this.isPanning = active;
    this._el.nativeElement.classList.toggle('is-panning', active);
  }
  //#endregion
}

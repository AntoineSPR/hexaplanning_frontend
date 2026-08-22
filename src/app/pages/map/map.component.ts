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
export class MapComponent implements OnInit, OnDestroy, AfterViewInit {
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
  private zoomHandle?: SvgZoomHandle;

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
  private suppressClicksUntil = 0; // timestamp to ignore clicks right after a drag
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

  // Quest drag-and-drop state
  draggingHex: Hex | null = null;
  dragOverHex: Hex | null = null;
  // A floating replica of the dragged hex (see the mini <svg> in the template) that follows
  // the pointer at these fixed-position coordinates.
  dragPreviewX = 0;
  dragPreviewY = 0;
  // The <svg viewBox> makes on-map hexes render larger than their raw `size` units once the
  // browser scales the viewBox to fit the container (times the camera zoom on top of that).
  // The overlay lives outside the SVG as a plain fixed-position div, so it needs this same
  // scale applied explicitly or it renders at "true" size - visibly smaller than the real hex.
  dragOverlayScale = 1;
  private lastLandedHex: Hex | null = null;
  // Set when the initial assignment load had to fall back to the offline snapshot; tells the
  // reconnect effect below to quietly re-fetch the authoritative state once back online, so the
  // map self-heals instead of requiring a manual page reload.
  private needsRefreshOnReconnect = false;

  // Hand-rolled long-press-then-drag gesture, using native Pointer Events directly rather than
  // @angular/cdk's DragRef: CDK's non-touch drag detection is gated behind a lazily-attached
  // `mousemove` document listener that in practice doesn't reliably fire for this gesture across
  // browsers/input devices, so real mouse dragging silently never started. `pointermove` fires
  // consistently for every pointer type, and `setPointerCapture` guarantees this element keeps
  // receiving move/up events for the gesture regardless of where the pointer physically travels.
  private static readonly DRAG_START_DELAY_MS = 150;
  private static readonly DRAG_START_THRESHOLD_PX = 5;
  private pointerDrag: {
    hex: Hex;
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    // True once the hold delay has elapsed without the pointer having moved away - only then
    // does further movement start an actual quest drag (see armedHex below for the visual cue).
    armed: boolean;
    // True once the pointer moved away before being armed: the gesture is a camera pan instead,
    // driven manually below (see onHexPointerMove), exactly as it would be from an empty hex.
    panning: boolean;
    panStartX: number;
    panStartY: number;
  } | null = null;

  // The hex currently primed for pickup (held past the hold delay, not yet moved): drives the
  // "ready to drag" color cue in the template.
  armedHex: Hex | null = null;

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

    effect(() => {
      if (this._connectivity.isOnline() && this.needsRefreshOnReconnect) {
        this.needsRefreshOnReconnect = false;
        // Silent background refresh: no wipe/spinner, since the offline snapshot is already
        // showing something reasonable - just reconcile it with the server now that we can.
        this._questAssignment.loadAssignmentsIntoHexes(this.hexes, this.size).subscribe({
          next: () => this._mapGrid.removeOrphanedDynamicHexes(this.hexes),
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
        this._mapGrid.removeOrphanedDynamicHexes(this.hexes);
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
      scaleMin: 0.5,
      scaleMax: 3,
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
    this.hexes = this._mapGrid.generateHexes(this.maxExpansion, this.size, this.mapHeight);
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

  onHexPointerDown(hex: Hex, event: PointerEvent): void {
    if (!hex.quest || event.button !== 0 || this._connectivity.isOffline()) {
      return;
    }
    const drag = {
      hex,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Date.now(),
      armed: false,
      panning: false,
      panStartX: 0,
      panStartY: 0,
    };
    this.pointerDrag = drag;
    // Guarantees this element keeps receiving pointermove/pointerup for this gesture
    // even if the cursor moves off it mid-drag; doesn't prevent a plain click from firing.
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    // Arms the hex (visual cue) once held long enough without moving away. If the pointer
    // moves before this fires, onHexPointerMove below falls back to panning instead.
    setTimeout(() => {
      if (this.pointerDrag === drag && !drag.panning) {
        drag.armed = true;
        this.armedHex = drag.hex;
      }
    }, MapComponent.DRAG_START_DELAY_MS);
  }

  onHexPointerMove(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (this.draggingHex) {
      this.dragPreviewX = event.clientX;
      this.dragPreviewY = event.clientY;
      this.dragOverHex = this.findHexAtPoint(event.clientX, event.clientY);
      return;
    }

    if (drag.panning) {
      // Not held long enough to become a quest drag: pan the camera by the same amount the
      // pointer has moved since the gesture started, same as dragging from an empty hex.
      const fitScale = this.computeFitScale() || 1;
      const newPanX = drag.panStartX + (event.clientX - drag.startX) / fitScale;
      const newPanY = drag.panStartY + (event.clientY - drag.startY) / fitScale;
      this.zoomHandle?.setTransform(newPanX, newPanY, this.zoom);
      return;
    }

    const distance = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
    if (distance < MapComponent.DRAG_START_THRESHOLD_PX) {
      return;
    }
    if (!drag.armed) {
      // Moved before the hold delay elapsed: not a long-press-drag - fall back to panning the
      // map, exactly as starting a drag from an empty hex would.
      event.preventDefault();
      drag.panning = true;
      drag.panStartX = this.panX;
      drag.panStartY = this.panY;
      this.armedHex = null;
      return;
    }

    event.preventDefault();
    this.draggingHex = drag.hex;
    this.armedHex = null;
    this.dragOverHex = null;
    this.dragPreviewX = event.clientX;
    this.dragPreviewY = event.clientY;
    this.dragOverlayScale = this.computeMapScale();
  }

  private computeFitScale(): number {
    if (!this.svgRoot) return 1;
    const rect = this.svgRoot.nativeElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return 1;
    // preserveAspectRatio="xMidYMid meet": the viewBox is scaled uniformly by the smaller of
    // the two ratios so it fits entirely within the rendered element.
    return Math.min(rect.width / this.mapWidth, rect.height / this.mapHeight);
  }

  private computeMapScale(): number {
    return this.computeFitScale() * this.zoom;
  }

  onHexPointerUp(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    this.pointerDrag = null;
    this.armedHex = null;

    if (!this.draggingHex) {
      return; // was a plain tap, or resolved into a camera pan; let the native click fire if applicable
    }

    const hex = this.draggingHex;
    const target = this.dragOverHex;
    // A real drag just occurred: ignore the click that follows pointerup
    this.suppressClicksUntil = Date.now() + 250;

    if (target && target !== hex) {
      // Keep the origin hex dimmed and the preview visible until the move actually resolves,
      // instead of clearing draggingHex immediately - otherwise the origin hex snaps back to
      // full opacity (still showing its old quest) for the length of the request, then fades
      // out again once the response arrives, which reads as a flash.
      this._questAssignment.moveQuestToHex(hex, target, this.hexes, this.size).subscribe({
        next: () => {
          this.markLandedHex(target);
          this.draggingHex = null;
          this.dragOverHex = null;
        },
        error: err => {
          console.error('Failed to move quest:', err);
          this.draggingHex = null;
          this.dragOverHex = null;
        },
      });
    } else {
      this.draggingHex = null;
      this.dragOverHex = null;
    }
  }

  onHexPointerCancel(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    this.pointerDrag = null;
    this.armedHex = null;
    this.draggingHex = null;
    this.dragOverHex = null;
  }

  private findHexAtPoint(x: number, y: number): Hex | null {
    // Use the full element stack (not just the topmost hit) since a drop point over an
    // occupied hex often lands on that hex's own quest chip, which sits above the polygon.
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      const hexEl = el.closest('[data-hex-q]') as HTMLElement | null;
      if (hexEl) {
        const q = Number(hexEl.dataset['hexQ']);
        const r = Number(hexEl.dataset['hexR']);
        const s = Number(hexEl.dataset['hexS']);
        return this.hexes.find(h => h.q === q && h.r === r && h.s === s) ?? null;
      }
    }
    return null;
  }

  private markLandedHex(hex: Hex): void {
    this.lastLandedHex = hex;
    setTimeout(() => {
      if (this.lastLandedHex === hex) {
        this.lastLandedHex = null;
      }
    }, 500);
  }

  isLandedHex(hex: Hex): boolean {
    return this.lastLandedHex === hex;
  }

  getDropHighlightClass(hex: Hex): string {
    if (!this.draggingHex || this.dragOverHex !== hex || hex === this.draggingHex) {
      return '';
    }
    return hex.quest ? 'hex-drop-swap' : 'hex-drop-move';
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

  private togglePanning(active: boolean) {
    this.isPanning = active;
    this._el.nativeElement.classList.toggle('is-panning', active);
  }
  //#endregion
}

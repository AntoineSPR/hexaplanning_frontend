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
const MAP_RADIUS = 18;
const ZOOM_MIN = 1;
const MAX_ZOOM_HEXES_VISIBLE = 3;

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
  // The map's SVG fills the whole viewport behind the fixed bottom nav (it's position:fixed, so
  // it doesn't take up its own layout space) - camera centering needs this to avoid framing
  // content underneath it.
  @ViewChild(MenuComponent, { read: ElementRef, static: false }) menuEl?: ElementRef<HTMLElement>;
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

  // Drives the whole quest drag-and-drop gesture (long-press-to-arm, drop) - this component
  // implements HexDragHost so the controller can read/drive camera and hex state without
  // duplicating it. See hex-drag.controller.ts.
  private readonly _drag = new HexDragController(this, this._mapGrid, this._questAssignment, this._connectivity, MAP_RADIUS);

  hexes: Hex[] = [];
  size = HEX_SIZE;

  // The viewBox size - defaults to MAP_WIDTH/MAP_HEIGHT but gets replaced once the real
  // container is measurable (see matchMapDimensionsToContainer) to fit the whole pre-generated
  // grid and match the container's aspect ratio. Fixed after that single startup calculation:
  // since the grid never grows or shrinks, there's nothing to resync bounds for afterwards.
  mapWidth = MAP_WIDTH;
  mapHeight = MAP_HEIGHT;

  // The max zoom-in level - derived from mapWidth/mapHeight once they're known (see
  // matchMapDimensionsToContainer) so "fully zoomed in" always shows about
  // MAX_ZOOM_HEXES_VISIBLE hexes regardless of the map's actual size. This fallback (matching
  // the old flat ZOOM_MAX) is only used for the brief window before that runs.
  private _zoomMax = 3;

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
  // Measures the bottom nav's actual rendered height and exposes it as --menu-height, which
  // :host's padding-bottom (map.component.scss) reserves - makes the SVG's own rendered box
  // genuinely stop above the menu instead of extending underneath it, so every screen<->map
  // coordinate conversion (fit-scale, letterboxing, camera centering) is correct everywhere
  // automatically rather than needing menu-awareness patched in one by one.
  private readonly _updateMenuHeightVar = () => {
    // <app-menu> itself has no intrinsic size - the actual fixed-position, sized element is the
    // <nav class="menubar"> inside its template, so that's what needs measuring.
    const menuBar = this.menuEl?.nativeElement.querySelector('.menubar');
    const menuHeightPx = menuBar?.getBoundingClientRect().height ?? 0;
    this._el.nativeElement.style.setProperty('--menu-height', `${menuHeightPx}px`);
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
        this.hexes.forEach(hex => {
          if (hex.quest?.id === deletedQuestId) {
            hex.quest = undefined;
          }
        });
      }
    });

    effect(() => {
      if (this._connectivity.isOnline() && this.needsRefreshOnReconnect) {
        this.needsRefreshOnReconnect = false;
        // Silent background refresh: no wipe/spinner, since the offline snapshot is already
        // showing something reasonable - just reconcile it with the server now that we can.
        this._questAssignment.loadAssignmentsIntoHexes(this.hexes, this.size).subscribe({
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
    this._updateMenuHeightVar();
    window.addEventListener('resize', this._updateMenuHeightVar);
    this.matchMapDimensionsToContainer();
    const saved = this._cameraState.getState();
    this.zoomHandle = await this._svgZoom.attach(this.svgRoot.nativeElement, this.cameraGroup.nativeElement, {
      scaleMin: ZOOM_MIN,
      scaleMax: this._zoomMax,
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
    window.removeEventListener('resize', this._updateMenuHeightVar);
  }

  //#region Generate Map
  generateHexes(): void {
    this.hexes = this._mapGrid.generateHexes(this.size, this.mapWidth, this.mapHeight, MAP_RADIUS);
  }

  // Sizes the viewBox to fit the whole pre-generated grid and match the container's actual
  // aspect ratio, instead of the fixed MAP_WIDTH/MAP_HEIGHT (290x490, tall/portrait) placeholder
  // ngOnInit generated the grid with. With preserveAspectRatio="xMidYMid meet", a mismatched
  // viewBox aspect leaves whichever dimension is "looser" pillarboxed (rendered smaller than the
  // container, with unused slack on the sides) - this avoids that for the map's one-time,
  // fixed-forever viewBox. Only called once, from ngAfterViewInit - rewrites the hexes array in
  // place (via generateHexes' own array, not `this.hexes = ...`) rather than reassigning
  // `this.hexes` to a new array object: ngOnInit already handed the *original* array reference
  // to loadAssignmentsIntoHexes, whose async response resolves later and mutates whatever array
  // it was given - reassigning `this.hexes` here would leave that response writing into an
  // orphaned array the template no longer points to, silently discarding every loaded quest
  // assignment.
  private matchMapDimensionsToContainer(): void {
    const rect = this.svgRoot?.nativeElement.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;

    // this.hexes was generated (in ngOnInit) with a placeholder origin, but its *span* is
    // already the grid's true, final size - translating the origin later doesn't change how far
    // apart the hexes are from each other.
    const bounds = this._mapGrid.computeContentBounds(this.hexes, this.size);
    const naturalWidth = bounds.maxX - bounds.minX;
    const naturalHeight = bounds.maxY - bounds.minY;

    // Never shrink below the grid's natural size, but expand whichever dimension is needed to
    // match the container's aspect ratio, so neither ends up pillarboxed.
    const aspect = rect.width / rect.height;
    const width = Math.round(Math.max(naturalWidth, naturalHeight * aspect));
    const height = Math.round(Math.max(naturalHeight, naturalWidth / aspect));

    this.mapWidth = width;
    this.mapHeight = height;
    // See MAX_ZOOM_HEXES_VISIBLE above - derived from the smaller dimension so both axes are
    // guaranteed to show at least that many hexes once fully zoomed in.
    this._zoomMax = Math.min(width, height) / (this.size * 2 * MAX_ZOOM_HEXES_VISIBLE);
    const freshHexes = this._mapGrid.generateHexes(this.size, width, height, MAP_RADIUS);
    this.hexes.length = 0;
    this.hexes.push(...freshHexes);
    if (!this._cameraState.getState()) {
      this.centerCameraOnCenterHex();
    }
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
      this._questAssignment.assignQuestToHex(this.selectedHex, this.selectedQuest).subscribe({
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
          this._questAssignment.deleteQuestFromHex(hex).subscribe({
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

  // The drag gesture itself (long-press-to-arm, drop) is all handled by HexDragController - see
  // hex-drag.controller.ts.
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

  getHexColor(hex: Hex): string {
    // Empty hexes are transparent (the map's own black background shows through) rather than a
    // solid grey fill - getHexStrokeColor below gives them a thin colored perimeter instead.
    if (!hex.quest) return 'transparent';
    if (hex.quest.statusId === this._questService.statusDoneId) {
      return 'var(--dark-theme-color)';
    }
    return 'var(--theme-color)';
  }

  // Thin perimeter color for the base hex polygon: a subtle theme color on empty hexes,
  // plain black on occupied ones so it doesn't compete with the quest's own fill/priority border.
  getHexStrokeColor(hex: Hex): string {
    return hex.quest ? 'black' : 'var(--base-hex-color)';
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

    const newZoom = Math.min(Math.max(Math.min(this.mapWidth / boxWidth, this.mapHeight / boxHeight), ZOOM_MIN), this._zoomMax);

    this.zoom = newZoom;
    this.panX = this.mapWidth / 2 - centerX * newZoom;
    this.panY = this.mapHeight / 2 - centerY * newZoom;
    this.zoomHandle?.setTransform(this.panX, this.panY, this.zoom);
  }

  private togglePanning(active: boolean) {
    this.isPanning = active;
    this._el.nativeElement.classList.toggle('is-panning', active);
  }
  //#endregion
}

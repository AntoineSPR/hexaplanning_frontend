import { Component, effect, inject, NgZone, OnDestroy, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { GlowPreferenceService } from 'src/app/services/glow-preference.service';
import { ThemeIconComponent } from '../../components/theme-icon/theme-icon.component';
import { HexDragController, HexDragHost } from './hex-drag.controller';
import { QuestGroupService } from 'src/app/services/quest-group.service';
import { QuestGroupGeometryService } from 'src/app/services/quest-group-geometry.service';
import { QuestGroupModalService } from 'src/app/services/quest-group-modal.service';
import { ThemeService } from 'src/app/services/theme.service';

const MAP_WIDTH = 290;
const MAP_HEIGHT = 490;
const HEX_SIZE = 40;
const MAX_ZOOM_HEXES_VISIBLE = 3;
// Fixed size of the generated grid, in the same pixel-equivalent units as HEX_SIZE. mapWidth/mapHeight (the viewBox) still adapts to
// match the container's aspect ratio, but that only changes how much of this fixed grid is visible at once, never the grid itself.
const GRID_WIDTH = 1650;
const GRID_HEIGHT = 725;

interface GroupOutline {
  id: string;
  pathD: string;
  color: string;
  name: string;
  labelX: number;
  labelY: number;
  nameLines: { text: string; y: number }[];
  actionsY: number;
  titleBox: { x: number; y: number; width: number; height: number };
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [Dialog, FormsModule, RadioButtonModule, MenuComponent, ConfirmDialogModule, ThemeIconComponent],
  providers: [ConfirmationService],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit, HexDragHost {
  @ViewChild('svgRoot', { static: false }) svgRoot?: ElementRef<SVGSVGElement>;
  @ViewChild('cameraGroup', { static: false }) cameraGroup?: ElementRef<SVGGElement>;
  @ViewChild('cancelZone', { static: false }) cancelZone?: ElementRef<HTMLElement>;
  // Used to measure the fixed bottom nav's actual height (see _updateMenuHeightVar).
  @ViewChild(MenuComponent, { read: ElementRef, static: false }) menuEl?: ElementRef<HTMLElement>;
  _questService = inject(QuestService);
  _questModalService = inject(QuestModalService);
  _mapGrid = inject(MapGridService);
  _questAssignment = inject(QuestAssignmentService);
  _cameraState = inject(CameraStateService);
  _el = inject(ElementRef<HTMLElement>);
  _svgZoom = inject(SvgZoomService);
  _connectivity = inject(ConnectivityService);
  _ngZone = inject(NgZone);
  _glowPreference = inject(GlowPreferenceService);
  _questGroupService = inject(QuestGroupService);
  _questGroupGeometry = inject(QuestGroupGeometryService);
  private readonly _questGroupModalService = inject(QuestGroupModalService);
  _themeService = inject(ThemeService);

  zoomHandle?: SvgZoomHandle;

  private readonly _confirmationService = inject(ConfirmationService);

  // Drives the drag-and-drop gesture; this component implements HexDragHost so it can read/
  // drive camera and hex state. See hex-drag.controller.ts.
  private readonly _drag = new HexDragController(this, this._mapGrid, this._questAssignment, this._connectivity, this._questGroupGeometry);

  // Full grid data - every hex that exists, whether currently on-screen or not. Assignment
  // loading, the quest-sync/delete effects, fitAllQuests's off-screen bounding-box scan, and
  // HexDragController (via HexDragHost.hexes) all need to see the whole thing.
  hexes: Hex[] = [];
  // Subset of `hexes` actually rendered by the template - see recomputeVisibleHexes. Keeping this
  // separate from `hexes` is what lets the template's @for stay cheap regardless of total grid
  // size: a ~1000-hex grid (many with a <foreignObject> each) rendered unconditionally was the
  // main remaining cause of mobile jank once per-frame camera-gesture overhead was fixed.
  visibleHexes: Hex[] = [];
  size = HEX_SIZE;

  // viewBox size, fixed once matchMapDimensionsToContainer sizes it to match the container.
  mapWidth = MAP_WIDTH;
  mapHeight = MAP_HEIGHT;

  // Extent of the generated rectangular grid itself (see MapGridService.coordinatesInRectangle) -
  // fixed, never derived from the viewport (see GRID_WIDTH/GRID_HEIGHT above). Public (not
  // private) because HexDragController reads these live via HexDragHost.
  readonly gridWidth = GRID_WIDTH;
  readonly gridHeight = GRID_HEIGHT;

  // Max zoom-in level, derived from mapWidth/mapHeight in matchMapDimensionsToContainer so
  // "fully zoomed in" always shows about MAX_ZOOM_HEXES_VISIBLE hexes. This value is just the
  // fallback used before that runs.
  private _zoomMax = 3;
  // Min zoom-out level, derived in matchMapDimensionsToContainer so the whole fixed-size grid
  // always fits the viewport at maximum zoom-out, regardless of device/screen size. Fallback
  // value used before that runs.
  private _zoomMin = 1;

  // Camera state for panning and zoom
  panX = 0;
  panY = 0;
  zoom = 1;
  isPanning = false;
  suppressClicksUntil = 0; // timestamp to ignore clicks right after a drag
  private hadCameraMove = false; // track if any pan/zoom occurred during a gesture

  // Cursor-following hex highlight, mouse only (see onMapPointerMove)
  cursorLightVisible = false;
  cursorLightX = 0;
  cursorLightY = 0;
  // The 6 neighbor hexes, each with its own linear-gradient endpoints: x1/y1 near the edge
  // shared with the hovered hex (bright), x2/y2 at its own far tip (dim).
  cursorLightNeighbors: { cx: number; cy: number; x1: number; y1: number; x2: number; y2: number }[] = [];

  onMapPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || !this.svgRoot) return;
    const rect = this.svgRoot.nativeElement.getBoundingClientRect();
    const local = this._mapGrid.screenToHexLocal(event.clientX, event.clientY, rect, this.mapWidth, this.mapHeight, this.panX, this.panY, this.zoom);
    if (!local) return;
    const hovered = this._mapGrid.pixelToAxial(local.x, local.y, this.size);
    if (!this.isWithinGrid(hovered)) {
      this.cursorLightVisible = false;
      return;
    }

    const center = this._mapGrid.hexToPixel(hovered.q, hovered.r, this.size);
    this.cursorLightX = center.cx;
    this.cursorLightY = center.cy;
    this.cursorLightNeighbors = this._mapGrid
      .neighborsOf(hovered, this.size)
      .filter(n => this.isWithinGrid(n))
      .map(n => {
        const dx = n.cx - center.cx;
        const dy = n.cy - center.cy;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        return {
          cx: n.cx,
          cy: n.cy,
          x1: n.cx - ux * this.size,
          y1: n.cy - uy * this.size,
          x2: n.cx + ux * this.size,
          y2: n.cy + uy * this.size,
        };
      });
    this.cursorLightVisible = true;
  }

  private isWithinGrid(c: { q: number; r: number; s: number }): boolean {
    return this._mapGrid.isWithinRectangle(c, this.gridWidth, this.gridHeight, this.size);
  }

  onMapPointerLeave(): void {
    this.cursorLightVisible = false;
  }

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
  // :host's padding-bottom (map.component.scss) uses to keep the SVG's own box above the menu.
  private readonly _updateMenuHeightVar = () => {
    // <app-menu> itself has no intrinsic size - measure its inner <nav class="menubar"> instead.
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
  get overCancelZone(): boolean {
    return this._drag.overCancelZone;
  }
  get draggingGroupMembers(): Hex[] | null {
    return this._drag.draggingGroupMembers;
  }
  get groupDragPathD(): string | null {
    return this._drag.groupDragPathD;
  }
  get groupDragOffsetX(): number {
    return this._drag.groupDragOffsetX;
  }
  get groupDragOffsetY(): number {
    return this._drag.groupDragOffsetY;
  }
  isGroupDragMember(hex: Hex): boolean {
    return this._drag.isGroupDragMember(hex);
  }

  //#region Quest groups
  // One outline + label per quest group that currently has at least one member on the map -
  // recomputed whenever the group list or quest membership changes (see the constructor effect
  // below) or a drag/reconciliation could have moved a member (see HexDragHost.recomputeGroupOutlines).
  groupOutlines: GroupOutline[] = [];
  selectedGroupId: string | null = null;

  // Rendered separately from the @for below, positioned after the cursor-light block in the
  // template so its (already fully opaque) background reliably paints over the light's glow
  // rather than under it - SVG siblings paint in document order, so which one is "on top" is
  // purely about position in the markup, not something opacity alone can fix regardless of order.
  selectedGroupOutline(): GroupOutline | null {
    return this.groupOutlines.find(g => g.id === this.selectedGroupId) ?? null;
  }

  // Always derived from `this.hexes` (the full grid), never `visibleHexes` (the viewport-culled
  // subset) - a group outline must stay complete even while some of its members are off-screen.
  //
  // Membership is read fresh from `_questService.quests()` (each quest's own current
  // `questGroupId`) rather than from either the group entity's own cached `questIds` or each
  // hex's `quest.questGroupId`: the former only reflects members as of that group's last CRUD
  // response, so leaving a group (a per-quest PUT, not a group update) left it silently stale
  // here and the outline never shrank; the latter is only kept in sync by a separate effect (see
  // the constructor) that may not have run yet in the same tick. Reading the quests signal
  // directly is correct immediately after either kind of change.
  recomputeGroupOutlines(): void {
    const groupIdByQuestId = new Map(this._questService.quests().map(q => [q.id, q.questGroupId]));
    this.groupOutlines = this._questGroupService
      .questGroups()
      .map(group => {
        const members = this.hexes.filter(h => h.quest?.id && groupIdByQuestId.get(h.quest.id) === group.id);
        if (members.length === 0) return null;
        const pathD = this._questGroupGeometry.getGroupBoundaryPath(members, this.size);
        const { labelX, labelY } = this.computeGroupLabelPosition(members);
        const nameLines = this.layoutGroupNameLines(group.name, labelY);
        // Quick-actions box sits a fixed gap above the topmost rendered line (not just above
        // labelY), so it clears a two-line name exactly as it did a one-line one.
        const actionsY = nameLines[0].y - this.size * 0.9;
        const titleBox = this.computeGroupTitleBox(nameLines, labelX);
        return { id: group.id, pathD, color: group.color, name: group.name, labelX, labelY, nameLines, actionsY, titleBox };
      })
      .filter((g): g is GroupOutline => g !== null);
  }

  // Splits a group name onto two lines once it's long enough to risk overrunning its neighbors,
  // breaking at whichever space falls closest to the middle (a hard mid-string split if the name
  // has no space to break at), and returns each line's absolute y so they end up centered as a
  // block on `labelY` - capped at two lines regardless of length, matching what was asked for
  // rather than wrapping indefinitely.
  private layoutGroupNameLines(name: string, labelY: number): { text: string; y: number }[] {
    const MAX_SINGLE_LINE = 12;
    const LINE_HEIGHT = 11;

    let lines: string[];
    if (name.length <= MAX_SINGLE_LINE) {
      lines = [name];
    } else {
      const mid = Math.floor(name.length / 2);
      let splitIndex = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < name.length; i++) {
        if (name[i] === ' ') {
          const distance = Math.abs(i - mid);
          if (distance < bestDistance) {
            bestDistance = distance;
            splitIndex = i;
          }
        }
      }
      lines = splitIndex === -1 ? [name.slice(0, mid), name.slice(mid)] : [name.slice(0, splitIndex).trim(), name.slice(splitIndex + 1).trim()];
    }

    return lines.map((text, i) => ({ text, y: labelY + (i - (lines.length - 1) / 2) * LINE_HEIGHT }));
  }

  // A clickable/hoverable box around the (possibly 2-line) title, sized to the text rather than a
  // fixed size - width from a rough average glyph width for the label's 9px bold font (exact
  // measurement would need a post-render getBBox() pass; this is close enough for a click target,
  // not for pixel-perfect fit), height from the line count. Widens the effective click target for
  // selecting a group well beyond the thin outline stroke or the text glyphs themselves.
  private computeGroupTitleBox(nameLines: { text: string; y: number }[], labelX: number): { x: number; y: number; width: number; height: number } {
    const FONT_SIZE = 9;
    const CHAR_WIDTH = FONT_SIZE * 0.62;
    const PAD_X = 6;
    const PAD_Y = 4;

    const maxChars = Math.max(...nameLines.map(l => l.text.length));
    const width = maxChars * CHAR_WIDTH + PAD_X * 2;
    const top = nameLines[0].y - FONT_SIZE / 2 - PAD_Y;
    const bottom = nameLines[nameLines.length - 1].y + FONT_SIZE / 2 + PAD_Y;
    return { x: labelX - width / 2, y: top, width, height: bottom - top };
  }

  // Anchors the label at an empty hex just above the group, checked against the live grid rather
  // than assumed. Right after the group is created, every such spot is guaranteed empty (flood-
  // fill already swept up any occupied neighbor), but a later whole-group drag can validly land
  // the group flush against an unrelated quest (dragging a group never auto-merges it with
  // whatever it lands next to - see the constructor comment on reconcileGroupMembership, which
  // only runs for single-quest moves), so the "just above" spot can no longer be assumed empty by
  // construction alone. Every member's two upward neighbors (NE/NW - this grid has no straight-up
  // neighbor) are tried, nearest-and-most-central first, and only the first one actually unoccupied
  // is used; if the group is completely hemmed in from above, it falls back to a fixed offset
  // above the topmost row rather than searching indefinitely.
  private computeGroupLabelPosition(members: Hex[]): { labelX: number; labelY: number } {
    const isOccupied = (q: number, r: number, s: number): boolean => {
      const hex = this.hexes.find(h => h.q === q && h.r === r && h.s === s);
      return !!hex?.quest;
    };

    const centroidX = members.reduce((sum, m) => sum + m.cx, 0) / members.length;
    const halfWidth = (this.size * Math.sqrt(3)) / 2;
    const candidates = members
      .flatMap(m => [
        { q: m.q, r: m.r - 1, s: m.s + 1, cx: m.cx - halfWidth, cy: m.cy - this.size * 1.5 }, // NW
        { q: m.q + 1, r: m.r - 1, s: m.s, cx: m.cx + halfWidth, cy: m.cy - this.size * 1.5 }, // NE
      ])
      .sort((a, b) => a.cy - b.cy || Math.abs(a.cx - centroidX) - Math.abs(b.cx - centroidX));

    const best = candidates.find(c => !isOccupied(c.q, c.r, c.s));
    if (best) return { labelX: best.cx, labelY: best.cy };

    const minCy = Math.min(...members.map(m => m.cy));
    return { labelX: centroidX, labelY: minCy - this.size * 3 };
  }

  selectGroup(id: string, event: Event): void {
    event.stopPropagation();
    this.selectedGroupId = this.selectedGroupId === id ? null : id;
  }

  // Opens the shared create/edit group modal (see QuestGroupModalService); its own effect on the
  // group list/quest signals (below) picks up the rename/recolor once it's saved, so nothing more
  // is needed here.
  startEditGroup(group: { id: string; name: string; color: string }, event: Event): void {
    event.stopPropagation();
    this._questGroupModalService.openEdit(group);
  }

  deleteGroup(group: { id: string; name: string }, event: Event): void {
    event.stopPropagation();
    if (this._connectivity.isOffline()) return;

    this._confirmationService.confirm({
      message: `Supprimer le groupe "${group.name}" ?`,
      closable: true,
      closeOnEscape: true,
      accept: () => {
        this._questGroupService.deleteQuestGroup(group.id).subscribe({
          next: () => {
            this.selectedGroupId = null;
            this._questService.refreshAllQuestLists();
            this.recomputeGroupOutlines();
          },
          error: err => console.error('Failed to delete quest group:', err),
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
  //#endregion

  // Set when the initial assignment load had to fall back to the offline snapshot; tells the
  // reconnect effect below to quietly re-fetch the authoritative state once back online, so the
  // map self-heals instead of requiring a manual page reload.
  private needsRefreshOnReconnect = false;

  constructor() {
    effect(() => {
      // Re-fires whenever the group list or any quest's membership changes, so a group's outline
      // stays in sync without every mutation site needing to remember to call this directly.
      this._questGroupService.questGroups();
      this._questService.quests();
      this.recomputeGroupOutlines();
    });

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
          // A legacy assignment outside the pre-generated grid gets synthesized onto `hexes` via
          // MapGridService.addHex - re-derive visibleHexes in case that landed on-screen.
          complete: () => this.recomputeVisibleHexes(),
          error: err => console.error('Failed to refresh assignments after reconnect:', err),
        });
      }
    });
  }

  ngOnInit(): void {
    this._questService.getAllUnassignedPendingQuests().subscribe();
    this._questGroupService.getAllQuestGroups().subscribe();
    this._themeService.getAllThemes().subscribe();

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
        // A legacy assignment outside the pre-generated grid gets synthesized onto `hexes` via
        // MapGridService.addHex - re-derive visibleHexes in case that landed on-screen.
        this.recomputeVisibleHexes();
        this.recomputeGroupOutlines();
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
        this.recomputeVisibleHexes();
        this.recomputeGroupOutlines();
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
    this.recomputeVisibleHexes();
    const saved = this._cameraState.getState();
    // The zoom/pan gesture itself (and the d3-zoom listeners it registers) is run outside
    // Angular's zone: d3 already applies the transform straight to the DOM (see
    // svg-zoom.service.ts), so re-running change detection over the ~1000-hex grid on every
    // single pointermove tick of a drag/pinch was pure waste - and was the main cause of jank on
    // mobile. Only onStart/onEnd (once per gesture, not once per frame) re-enter the zone.
    this.zoomHandle = await this._ngZone.runOutsideAngular(() =>
      this._svgZoom.attach(this.svgRoot!.nativeElement, this.cameraGroup!.nativeElement, {
        scaleMin: this._zoomMin,
        scaleMax: this._zoomMax,
        onStart: () => {
          this._ngZone.run(() => {
            this.hadCameraMove = false;
            this.togglePanning(true);
          });
        },
        onEnd: () => {
          this._ngZone.run(() => {
            this.togglePanning(false);
            if (this.hadCameraMove) {
              this.suppressClicksUntil = Date.now() + 250;
            }
            // Persisted once per gesture (here) rather than on every transform tick, which used
            // to mean a synchronous localStorage write on every frame of a drag/pinch.
            this._cameraState.saveState(this.panX, this.panY, this.zoom);
            this.recomputeVisibleHexes();
          });
        },
        onTransform: t => {
          // Runs outside Angular's zone at gesture frame-rate - just track the values, no CD.
          const dx = Math.abs(t.x - this.panX);
          const dy = Math.abs(t.y - this.panY);
          const dk = Math.abs(t.k - this.zoom);
          if (dx > 0.5 || dy > 0.5 || dk > 0.001) {
            this.hadCameraMove = true;
          }
          this.panX = t.x;
          this.panY = t.y;
          this.zoom = t.k;
        },
      })
    );
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
    this.hexes = this._mapGrid.generateHexes(this.size, this.mapWidth, this.mapHeight, this.gridWidth, this.gridHeight);
  }

  // Resizes the viewBox to match the container's aspect ratio (avoiding pillarboxing under
  // preserveAspectRatio="xMidYMid meet") and re-centers the origin - the fixed-size grid itself
  // (GRID_WIDTH/GRID_HEIGHT) doesn't change, only how much of it this viewport shows at once.
  // Called once from ngAfterViewInit, once the container is measurable. Rewrites this.hexes in
  // place rather than reassigning it - ngOnInit already handed this array's reference to
  // loadAssignmentsIntoHexes, whose response resolves later and writes into whatever array it
  // was given.
  private matchMapDimensionsToContainer(): void {
    const rect = this.svgRoot?.nativeElement.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;

    // Never shrink below the baseline size; expand whichever dimension matches the container's
    // aspect ratio.
    const aspect = rect.width / rect.height;
    const width = Math.round(Math.max(MAP_WIDTH, MAP_HEIGHT * aspect));
    const height = Math.round(Math.max(MAP_HEIGHT, MAP_WIDTH / aspect));

    this.mapWidth = width;
    this.mapHeight = height;
    this._zoomMax = Math.min(width, height) / (this.size * 2 * MAX_ZOOM_HEXES_VISIBLE);
    // The zoom level at which the whole fixed-size grid exactly fits this viewport - lets the
    // user always zoom out far enough to see the entire map, on any device.
    this._zoomMin = Math.min(width / this.gridWidth, height / this.gridHeight);
    this._zoomMax = Math.max(this._zoomMax, this._zoomMin);
    const freshHexes = this._mapGrid.generateHexes(this.size, width, height, this.gridWidth, this.gridHeight);
    this.hexes.length = 0;
    this.hexes.push(...freshHexes);
    if (!this._cameraState.getState()) {
      this.centerCameraOnCenterHex();
    }
  }

  getHexPoints(cx: number, cy: number, offset: number = 0): string {
    return this._mapGrid.getHexPoints(cx, cy, this.size, offset);
  }

  getHexOnHoldMarker(cx: number, cy: number): { traces: string[]; pads: { x: number; y: number; r: number }[] } {
    return this._mapGrid.getHexOnHoldMarker(cx, cy, this.size);
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

    // A group is selected and this click landed outside it (its outline/label already handle
    // their own click via selectGroup, with stopPropagation) - deselect and swallow the click
    // instead of opening whatever's under it.
    if (this.selectedGroupId && hex.quest?.questGroupId !== this.selectedGroupId) {
      this.selectedGroupId = null;
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

  // Opens the quest-creation modal and assigns whatever gets created straight to selectedHex
  createAndAssignQuest(): void {
    if (this._connectivity.isOffline() || !this.selectedHex) return;

    const hex = this.selectedHex;
    this.dialogVisible = false;
    this.selectedHex = null;

    this._questModalService.openNewQuest(createdQuest => {
      this._questAssignment.assignQuestToHex(hex, createdQuest, this.hexes, this.size).subscribe({
        error: err => console.error('Failed to assign newly created quest:', err),
      });
    });
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

  // Fires for every pointerdown/up on the map (bubbled from the svg root), not just on hex drag
  // surfaces - lets HexDragController tell a second pinch finger apart from a real single-finger
  // gesture. See HexDragController.onGlobalPointerDown.
  onMapPointerDown(): void {
    this._drag.onGlobalPointerDown();
  }

  onMapPointerUp(): void {
    this._drag.onGlobalPointerUp();
  }

  // Drag gesture handling lives in HexDragController - see hex-drag.controller.ts.
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

  // Starts a group drag directly from its title - see hex-drag.controller.ts. Subsequent
  // pointermove/up/cancel for this gesture reuse the same onHexPointer* handlers above (generic,
  // hex-agnostic), the same way a single hex's own pointer capture routes them back here.
  onGroupTitlePointerDown(groupId: string, event: PointerEvent): void {
    this._drag.onGroupTitlePointerDown(groupId, event);
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
  // plain black on occupied ones so it doesn't compete with the quest's own fill.
  getHexStrokeColor(hex: Hex): string {
    return hex.quest ? 'black' : 'var(--base-hex-color)';
  }

  isOnHold(hex: Hex | null): boolean {
    return !!hex?.quest && hex.quest.statusId === this._questService.statusOnHoldId;
  }

  isDone(hex: Hex | null): boolean {
    return !!hex?.quest && hex.quest.statusId === this._questService.statusDoneId;
  }

  // The corner lines + dots originally built for on-hold quests, reused for done ones too.
  showsCornerMarker(hex: Hex | null): boolean {
    return this.isOnHold(hex) || this.isDone(hex);
  }

  // Connects the corner marker's own dots into a smaller inner hex, done quests only.
  getInnerRingPoints(pads: { x: number; y: number; r: number }[]): string {
    return pads.map(p => `${p.x},${p.y}`).join(' ');
  }

  // Every quest gets the inner-hex outline except done ones.
  showsInnerOutline(hex: Hex | null): boolean {
    return !!hex?.quest && hex.quest.statusId !== this._questService.statusDoneId;
  }

  // Color of the "inner hex" ring - the near-edge .hex-inner-outline for a normal quest, or the
  // near-center ring connecting the corner-marker's own dots for a done one (see
  // showsInnerOutline/getInnerRingPoints and their template usage). A primary theme member takes
  // its theme's color here; everything else keeps the flat default this ring has always had. This
  // is unrelated to the hex's own fill (getHexColor, still status-driven) and to the outer border
  // below (getHexBorderColor) - "inner hex" refers specifically to this ring.
  getInnerHexColor(hex: Hex | null): string {
    if (hex?.quest?.themeId && hex.quest.isPrimaryTheme) {
      const theme = this._themeService.themes()?.find(t => t.id === hex.quest!.themeId);
      if (theme) return theme.color;
    }
    return 'var(--dark-theme-color)';
  }

  // The per-quest colored border priority used to draw here is gone along with priority itself;
  // most quests already rendered with no border (only priorities with a BorderColor set did, and
  // the default new-quest priority had none), so this keeps that common baseline rather than
  // introducing a new universal border style.
  getHexBorderColor(hex: Hex): string {
    return '';
  }

  getHexBorderGlow(hex: Hex): string {
    return 'none';
  }

  getThemeColor(quest: QuestUpdateDTO): string {
    const theme = this._themeService.themes()?.find(t => t.id === quest.themeId);
    return theme?.color ?? 'var(--theme-color)';
  }

  getThemeAltText(quest: QuestUpdateDTO): string {
    const theme = this._themeService.themes()?.find(t => t.id === quest.themeId);
    return theme?.name ?? 'Icône de thème';
  }

  // Secondary-theme member: one new dot at the bottom corner (pads[2] - see
  // getHexOnHoldMarker/getInnerHexColor's own comment for the corner-angle math), independent of
  // status so it shows even for a plain pending/in-progress quest, and paints over the standard
  // dark dot at that same spot when the quest is also done/on-hold.
  hasSecondaryThemeDot(hex: Hex | null): boolean {
    return !!hex?.quest?.themeId && !hex.quest.isPrimaryTheme;
  }

  getSecondaryThemeDotColor(hex: Hex | null): string {
    const theme = this._themeService.themes()?.find(t => t.id === hex?.quest?.themeId);
    return theme?.color ?? 'var(--theme-color)';
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

  getProgressClipId(hex: Hex): string {
    return `progress-clip-${hex.q}-${hex.r}-${hex.s}`;
  }

  isInProgress(hex: Hex | null): boolean {
    return !!hex?.quest && hex.quest.statusId === '2281c955-b3e1-49dc-be62-6a7912bb46b3';
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

  // Recomputes `visibleHexes` from the current pan/zoom: the world-space rect the viewport
  // currently shows, padded by a full viewport's width/height on each side (a 3x3-tile buffer)
  // so a single drag/pinch gesture has room to move before the next recompute - which only
  // happens once per gesture (see the onEnd handler in ngAfterViewInit), not per frame.
  private recomputeVisibleHexes(): void {
    const marginX = this.mapWidth / this.zoom;
    const marginY = this.mapHeight / this.zoom;
    const worldMinX = -this.panX / this.zoom - marginX;
    const worldMaxX = (this.mapWidth - this.panX) / this.zoom + marginX;
    const worldMinY = -this.panY / this.zoom - marginY;
    const worldMaxY = (this.mapHeight - this.panY) / this.zoom + marginY;

    this.visibleHexes = this.hexes.filter(h => h.cx >= worldMinX && h.cx <= worldMaxX && h.cy >= worldMinY && h.cy <= worldMaxY);
  }

  // With no quests to frame, fitAllQuests falls back here - zooms in on the center hex instead
  // of zooming out on the whole grid.
  resetCamera(): void {
    this.centerCameraOnCenterHex(this._zoomMax);
    if (this.zoomHandle) {
      this.zoomHandle.setTransform(this.panX, this.panY, this.zoom);
    }
  }

  centerCameraOnCenterHex(zoom = 1): void {
    const centerHex = this.hexes.find(h => h.q === 0 && h.r === 0 && h.s === 0);
    this.zoom = zoom;
    if (centerHex) {
      this.panX = this.mapWidth / 2 - centerHex.cx * zoom;
      this.panY = this.mapHeight / 2 - centerHex.cy * zoom;
    } else {
      this.panX = 0;
      this.panY = 0;
    }
  }

  // Re-centers on a hex, keeping the current zoom (unlike centerCameraOnCenterHex/resetCamera).
  // Called by HexDragController after a successful drop.
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

    const newZoom = Math.min(Math.max(Math.min(this.mapWidth / boxWidth, this.mapHeight / boxHeight), this._zoomMin), this._zoomMax);

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

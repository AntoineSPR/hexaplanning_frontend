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
    // Threaded through computeGroupLabel below so each group's title search also avoids whatever
    // space an earlier group in this same pass already claimed for its own title - without this,
    // two groups' titles could still overlap each other even though each individually avoided the
    // hex grid.
    const claimedTitleBoxes: { x: number; y: number; width: number; height: number }[] = [];
    this.groupOutlines = this._questGroupService
      .questGroups()
      .map(group => {
        const members = this.hexes.filter(h => h.quest?.id && groupIdByQuestId.get(h.quest.id) === group.id);
        if (members.length === 0) return null;
        const pathD = this._questGroupGeometry.getGroupBoundaryPath(members, this.size);
        const { labelX, labelY, nameLines, titleBox } = this.computeGroupLabel(members, group.name, claimedTitleBoxes);
        // Quick-actions box sits a fixed gap above the topmost rendered line (not just above
        // labelY), so it clears a two-line name exactly as it did a one-line one.
        const actionsY = nameLines[0].y - this.size * 0.9;
        return { id: group.id, pathD, color: group.color, name: group.name, labelX, labelY, nameLines, actionsY, titleBox };
      })
      .filter((g): g is GroupOutline => g !== null);
  }

  // Splits a group name onto two lines once it's long enough to risk overrunning its neighbors,
  // breaking at whichever space falls closest to the middle (a hard mid-string split if the name
  // has no space to break at) - capped at two lines regardless of length, matching what was asked
  // for rather than wrapping indefinitely.
  private wrapGroupName(name: string): string[] {
    const MAX_SINGLE_LINE = 12;
    if (name.length <= MAX_SINGLE_LINE) return [name];

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
    return splitIndex === -1 ? [name.slice(0, mid), name.slice(mid)] : [name.slice(0, splitIndex).trim(), name.slice(splitIndex + 1).trim()];
  }

  // Size of the (possibly 2-line) title box, from a rough average glyph width for the label's 9px
  // bold font (exact measurement would need a post-render getBBox() pass; this is close enough
  // for both the click target and the overlap search below, not for pixel-perfect fit) and the
  // line count. Independent of where the box actually ends up - computeGroupLabel below positions
  // it once a clear spot is found.
  private measureTitleBox(lines: string[]): { width: number; height: number } {
    const FONT_SIZE = 9;
    const CHAR_WIDTH = FONT_SIZE * 0.62;
    const PAD_X = 6;
    const PAD_Y = 4;
    const LINE_HEIGHT = 11;

    const maxChars = Math.max(...lines.map(l => l.length));
    const width = maxChars * CHAR_WIDTH + PAD_X * 2;
    const height = (lines.length - 1) * LINE_HEIGHT + FONT_SIZE + PAD_Y * 2;
    return { width, height };
  }

  private rectsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  // Places a group's title (and sizes its click-target box - see measureTitleBox) somewhere that
  // doesn't visually collide with anything: a hex cell (the box is drawn with no fill of its own,
  // so a hex sitting behind it - occupied or not - would show right through), or another group's
  // already-placed title in this same recompute pass (see claimedTitleBoxes/recomputeGroupOutlines).
  //
  // Right after a group is created every hex just above it is guaranteed empty (flood-fill already
  // swept up any occupied neighbor), but a later whole-group drag can validly land the group flush
  // against an unrelated quest (dragging a group never auto-merges it with whatever it lands next
  // to - see the constructor comment on reconcileGroupMembership, which only runs for single-quest
  // moves), and a long enough name's box can span past whichever single hex it's centered on
  // regardless - so "just above" can no longer be assumed clear by construction alone, checked
  // fully instead. Every member's two upward neighbors (NE/NW - this grid has no straight-up
  // neighbor) are tried first, nearest-and-most-central first; if none is clear, the search
  // escalates straight up in increasing steps. This always terminates: `this.hexes` only covers
  // the map's fixed generated extent, so going up far enough eventually exits it into guaranteed
  // hex-free canvas - sitting outside the map's own boundaries isn't a special case, just where
  // this search naturally ends up once nothing closer works.
  private computeGroupLabel(
    members: Hex[],
    name: string,
    claimedTitleBoxes: { x: number; y: number; width: number; height: number }[]
  ): { labelX: number; labelY: number; nameLines: { text: string; y: number }[]; titleBox: { x: number; y: number; width: number; height: number } } {
    const LINE_HEIGHT = 11;
    const lines = this.wrapGroupName(name);
    const { width, height } = this.measureTitleBox(lines);

    const place = (labelX: number, labelY: number) => {
      const nameLines = lines.map((text, i) => ({ text, y: labelY + (i - (lines.length - 1) / 2) * LINE_HEIGHT }));
      const titleBox = { x: labelX - width / 2, y: labelY - height / 2, width, height };
      return { labelX, labelY, nameLines, titleBox };
    };

    const overlapsClaimed = (titleBox: { x: number; y: number; width: number; height: number }): boolean =>
      claimedTitleBoxes.some(box => this.rectsOverlap(titleBox, box));

    const halfWidth = (this.size * Math.sqrt(3)) / 2;
    const hexWidth = halfWidth * 2;
    // How many extra hexes to each side of a candidate's own anchor the title's actual width
    // reaches, so a long name is checked against every hex it would visually span, not just the
    // single hex its anchor happens to sit on.
    const spanRadius = Math.max(0, Math.round((width / hexWidth - 1) / 2));

    // Resolves a candidate pixel position to its nearest grid coordinate (MapGridService's own
    // inverse of hexToPixel) and checks that hex and the `spanRadius` ones beside it for occupancy
    // - grid coordinates rather than a rectangle-vs-rectangle test, because adjacent hexes' bounding
    // rectangles overlap each other near their points even though the actual hexagon shapes don't,
    // which would otherwise flag a genuinely clear spot as blocked just because it touches an
    // occupied neighbor's rectangle.
    //
    // If clear, only the Y half of the final placement snaps to that row's own exact center
    // (hexToPixel again) - the escalation search below steps in fixed pixel increments that don't
    // line up with the grid's actual row spacing, so without this the title's vertical gap above
    // whatever hex is below it could end up inconsistent/cramped. X is deliberately left as the
    // candidate's own (not also snapped to that same hex's center): snapping X too would pull the
    // title sideways to align with whichever hex the vertical search happened to land near, instead
    // of keeping it above the group itself - dx already defaults to 0 (directly above the group's
    // own centroid) and only shifts sideways via the ring search below when something is actually
    // in the way, so leaving X alone here keeps that "stay above the group unless blocked" behavior
    // intact.
    const tryCandidate = (cx: number, cy: number): ReturnType<typeof place> | null => {
      const { q, r } = this._mapGrid.pixelToAxial(cx, cy, this.size);
      for (let dq = -spanRadius; dq <= spanRadius; dq++) {
        const hex = this.hexes.find(h => h.q === q + dq && h.r === r && h.s === -(q + dq) - r);
        if (hex?.quest) return null;
      }
      const rowCy = this._mapGrid.hexToPixel(q, r, this.size).cy;
      const result = place(cx, rowCy);
      return overlapsClaimed(result.titleBox) ? null : result;
    };

    const centroidX = members.reduce((sum, m) => sum + m.cx, 0) / members.length;
    const candidates = members
      .flatMap(m => [
        { cx: m.cx - halfWidth, cy: m.cy - this.size * 1.5 }, // NW
        { cx: m.cx + halfWidth, cy: m.cy - this.size * 1.5 }, // NE
      ])
      .sort((a, b) => a.cy - b.cy || Math.abs(a.cx - centroidX) - Math.abs(b.cx - centroidX));

    for (const c of candidates) {
      const result = tryCandidate(c.cx, c.cy);
      if (result) {
        claimedTitleBoxes.push(result.titleBox);
        return result;
      }
    }

    // No spot immediately above the group works - widen the search outward in a 2D neighborhood
    // (both sideways and further up) rather than only ever climbing straight up above the group's
    // own centroid: a purely-vertical escalation can walk right past clear space just to the side
    // (e.g. blocked by an unrelated group's own title directly above, with open space beside it)
    // and end up needlessly far from the group. Candidates are generated in a widening diamond and
    // tried nearest-first (actual pixel distance), so whichever direction - up, or to either side -
    // actually has the closest clear spot wins.
    const minCy = Math.min(...members.map(m => m.cy));
    const baseCy = minCy - this.size * 3;
    const HORIZONTAL_STEP = width * 0.6;
    const VERTICAL_STEP = this.size * 1.2;
    const RING_COUNT = 20;

    const escalationCandidates: { cx: number; cy: number; dist: number }[] = [];
    for (let ring = 1; ring <= RING_COUNT; ring++) {
      for (let sx = -ring; sx <= ring; sx++) {
        const dx = sx * HORIZONTAL_STEP;
        const dy = ring * VERTICAL_STEP;
        escalationCandidates.push({ cx: centroidX + dx, cy: baseCy - dy, dist: Math.hypot(dx, dy) });
      }
    }
    escalationCandidates.sort((a, b) => a.dist - b.dist);

    for (const cand of escalationCandidates) {
      const result = tryCandidate(cand.cx, cand.cy);
      if (result) {
        claimedTitleBoxes.push(result.titleBox);
        return result;
      }
    }

    // Give up searching (guarantees termination) - by this point the candidate is far above and
    // beyond the group, comfortably past the fixed grid's own extent in any realistically-sized map.
    const result = place(centroidX, minCy - this.size * 40);
    claimedTitleBoxes.push(result.titleBox);
    return result;
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
    // recomputeGroupOutlines (see its own comment) deliberately reads group membership from
    // _questService.quests() rather than from each hex's own quest, so it's only ever as fresh as
    // this signal - and nothing else on this page ever populates it (only the dashboard page
    // calls getAllQuests()). Without this, a device that lands on /map without visiting the
    // dashboard first computes outlines from whatever's cached in this device's own localStorage
    // (possibly empty, or stale from before a quest was joined/moved into a group elsewhere) - the
    // quest's hex position/membership itself is still correct (loadAssignmentsIntoHexes below is
    // its own always-fresh fetch), so the group's "leave" button already works, but the outline
    // just never grows to visually include it until some other page refreshes this signal.
    this._questService.getAllQuests().subscribe();
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

  // A primary theme member's own color, or null if this hex doesn't have one - shared by
  // getInnerHexColor and getDoneMarkerColor below so both agree on when a theme override applies.
  private getPrimaryThemeColor(hex: Hex | null): string | null {
    if (hex?.quest?.themeId && hex.quest.isPrimaryTheme) {
      const theme = this._themeService.themes()?.find(t => t.id === hex.quest!.themeId);
      if (theme) return theme.color;
    }
    return null;
  }

  // Color of the "inner hex" ring - the near-edge .hex-inner-outline for a normal quest, or the
  // near-center ring connecting the corner-marker's own dots for a done one (see
  // showsInnerOutline/getInnerRingPoints and their template usage). A primary theme member takes
  // its theme's color here; everything else keeps the flat default this ring has always had. This
  // is unrelated to the hex's own fill (getHexColor, still status-driven) and to the outer border
  // below (getHexBorderColor) - "inner hex" refers specifically to this ring.
  getInnerHexColor(hex: Hex | null): string {
    return this.getPrimaryThemeColor(hex) ?? 'var(--dark-theme-color)';
  }

  // Ring color for a done (or in-progress-completed) marker specifically - a primary theme's
  // color wins exactly as it does with glow on. Only the flat, unthemed default changes: with
  // glow off, that ring sits on a dark-theme-color fill (getHexColor) with no blur left to lift it
  // off that matching color, so the default falls back to the glow's own tint instead (see the
  // no-glow .hex-done-marker rule in map.component.scss, which handles the corner dots the same
  // way - those never carry a theme color, glow on or off).
  getDoneMarkerColor(hex: Hex | null): string {
    return this.getPrimaryThemeColor(hex) ?? (this._glowPreference.enabled() ? 'var(--dark-theme-color)' : 'var(--theme-color)');
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

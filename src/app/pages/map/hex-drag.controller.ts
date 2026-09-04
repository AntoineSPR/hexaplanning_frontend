import { ElementRef } from '@angular/core';
import { Hex } from 'src/app/models/hex.model';
import { MapGridService } from 'src/app/services/map-grid.service';
import { QuestAssignmentService } from 'src/app/services/quest-assignment.service';
import { ConnectivityService } from 'src/app/services/connectivity.service';
import { QuestGroupGeometryService } from 'src/app/services/quest-group-geometry.service';
import { SvgZoomHandle } from 'src/app/services/svg-zoom.service';

// Hand-rolled long-press-then-drag gesture, using native Pointer Events directly rather than
// @angular/cdk's DragRef: CDK's non-touch drag detection is gated behind a lazily-attached
// `mousemove` document listener that in practice doesn't reliably fire for this gesture across
// browsers/input devices, so real mouse dragging silently never started. `pointermove` fires
// consistently for every pointer type, and `setPointerCapture` guarantees this element keeps
// receiving move/up events for the gesture regardless of where the pointer physically travels.
const DRAG_START_DELAY_MS = 150;
const DRAG_START_THRESHOLD_PX = 5;

// The subset of MapComponent this controller needs to read/drive - camera state and the hex
// array are owned by the component (other, non-drag code reads/writes them too), so the
// controller operates on them through this interface rather than duplicating them.
export interface HexDragHost {
  readonly hexes: Hex[];
  readonly size: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  // Extent of the generated rectangular grid itself (bigger than mapWidth/mapHeight - see
  // MapComponent.gridWidth/gridHeight) - what drag targets get clamped to below.
  readonly gridWidth: number;
  readonly gridHeight: number;
  panX: number;
  panY: number;
  readonly zoom: number;
  readonly svgRoot?: ElementRef<SVGSVGElement>;
  // Drop target that cancels the current drag instead of moving the quest - see
  // HexDragController.isPointOverCancelZone.
  readonly cancelZone?: ElementRef<HTMLElement>;
  readonly zoomHandle?: SvgZoomHandle;
  suppressClicksUntil: number;
  // Id of the currently selected quest group (see MapComponent.selectGroup) - a drag started from
  // one of its member hexes moves the whole group instead of just that hex.
  selectedGroupId: string | null;
  centerCameraOnHex(hex: Hex): void;
  // Recomputes group outline geometry after a move that could have changed it (a group drag, or a
  // single-hex drag that auto-attached/detached). Optional so tests/hosts that don't care about
  // groups don't need to implement it.
  recomputeGroupOutlines?(): void;
}

// Drives the whole quest drag-and-drop gesture: long-press-to-arm, the drag itself, and the
// drop. Extracted out of MapComponent, which owns camera/hexes state (see HexDragHost above)
// and delegates its template-facing drag methods straight through to this controller.
//
// The map is a fixed-size, fully pre-generated grid (see MapGridService.generateHexes), so
// dragging just clamps the target to the map's fixed rectangular bounds (host.gridWidth/
// gridHeight) and follows the cursor.
export class HexDragController {
  constructor(
    private readonly host: HexDragHost,
    private readonly mapGrid: MapGridService,
    private readonly questAssignment: QuestAssignmentService,
    private readonly connectivity: ConnectivityService,
    private readonly groupGeometry: QuestGroupGeometryService
  ) {}

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

  // Whole-group drag state: set once a drag that started on the selected group's own member hex
  // actually starts moving (see onPointerMove). Every member hex, translated rigidly by the same
  // delta - see updateGroupDragPreview.
  draggingGroupMembers: Hex[] | null = null;
  // Precomputed once at drag-start (from the group's original member positions) - traced with a
  // live [attr.transform] translate in the template rather than recomputed every tick.
  groupDragPathD: string | null = null;
  // Pixel offset (in the same local, pre-zoom coordinate space as hex cx/cy) corresponding to the
  // current valid group delta - see updateGroupDragPreview.
  groupDragOffsetX = 0;
  groupDragOffsetY = 0;

  private lastLandedHex: Hex | null = null;
  // The pointer's *true* screen position, updated only from real pointer events - never from
  // the (possibly clamped/pinned) drag preview position, which would create a feedback loop.
  private pointerClientX = 0;
  private pointerClientY = 0;
  // True once the drag target has hit the map's radius boundary - drives the "pin the preview
  // at the edge instead of following the cursor further" behavior below.
  private dragTargetClamped = false;

  private pointerDrag: {
    // Null for a gesture started on the group's title rather than one of its member hexes (see
    // onGroupTitlePointerDown) - there's no single hex being individually picked up in that case.
    hex: Hex | null;
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    // True once the hold delay has elapsed without the pointer having moved away - only then
    // does further movement start an actual quest drag (see armedHex below for the visual cue).
    armed: boolean;
    // True once the pointer moved away before being armed: the gesture is a camera pan instead,
    // driven manually below (see onPointerMove), exactly as it would be from an empty hex.
    panning: boolean;
    panStartX: number;
    panStartY: number;
    // Whether this gesture started on a member hex of the currently selected group, or on the
    // group's title - decided once up front in onPointerDown/onGroupTitlePointerDown; the long-
    // press timing/threshold/pan-fallback logic stays identical either way (skipped entirely for
    // a title-started drag, which has no competing pan gesture to disambiguate from), only what
    // happens once the drag actually starts differs.
    isGroupDrag: boolean;
    // Which group this gesture would drag, if it turns into a drag - null when !isGroupDrag.
    // Selecting it (host.selectedGroupId) is deferred to the moment the drag actually starts (see
    // onPointerMove), not done here in onPointerDown/onGroupTitlePointerDown: doing it immediately
    // on pointerdown would already be in effect by the time a plain click's own toggle handler
    // (selectGroup) runs right after, making every plain click on the title immediately select
    // and then instantly re-toggle itself back off.
    groupId: string | null;
    // Axial coordinate the pointer resolved to at the moment the drag actually started (see
    // onPointerMove) - the group-drag reference frame is "how far has the pointer moved since
    // then", not "which hex is under the cursor now minus some member's own coordinate", so it
    // works starting from the title (which isn't a hex, so has no coordinate of its own) exactly
    // the same way it works starting from a member hex. Null until the drag starts.
    startAxial: { q: number; r: number; s: number } | null;
  } | null = null;

  // The hex currently primed for pickup (held past the hold delay, not yet moved): drives the
  // "ready to drag" color cue in the template.
  armedHex: Hex | null = null;

  // Whether the pointer's true position is currently over the cancel zone - drives its hover
  // styling and, on release, aborts the drag instead of resolving dragOverHex.
  overCancelZone = false;

  // Aborts whatever single-pointer drag/pan state the first finger started as soon as a second
  // finger touches down (wired to the svg root's pointerdown, see map.component.html), so left
  // alone it doesn't fight d3-zoom's own pinch handling for that same finger.
  //
  // Deliberately keyed off PointerEvent.isPrimary rather than a manually incremented/decremented
  // pointer counter: a counter needs both its pointerdown AND its matching pointerup/pointercancel
  // to be delivered to stay balanced, and the matching pointerup/pointercancel isn't guaranteed to
  // bubble here - if the element holding pointer capture (see setPointerCapture in onPointerDown/
  // onGroupTitlePointerDown) gets destroyed and recreated by Angular mid-gesture (e.g. the hex grid
  // re-rendering while a finger is still down), the browser can fail to deliver it at all. A stuck
  // "still down" count would then permanently mistake every future single-finger gesture for a
  // second concurrent pointer, aborting it immediately - drag-and-drop would stay broken until a
  // full page reload. `isPrimary` carries no such state: it's computed fresh by the browser from
  // its own pointer bookkeeping on every single pointerdown, so a missed event elsewhere can never
  // desync it.
  onGlobalPointerDown(event: PointerEvent): void {
    if (!event.isPrimary && this.pointerDrag) {
      this.pointerDrag = null;
      this.armedHex = null;
      this.resetDragState();
      this.overCancelZone = false;
    }
  }

  onPointerDown(hex: Hex, event: PointerEvent): void {
    if (!hex.quest || event.button !== 0 || this.connectivity.isOffline()) {
      return;
    }
    const isGroupDrag = this.host.selectedGroupId != null && hex.quest?.questGroupId === this.host.selectedGroupId;
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
      isGroupDrag,
      groupId: isGroupDrag ? this.host.selectedGroupId : null,
      startAxial: null,
    };
    this.pointerDrag = drag;
    // Guarantees this element keeps receiving pointermove/pointerup for this gesture
    // even if the cursor moves off it mid-drag; doesn't prevent a plain click from firing.
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    // Arms the hex (visual cue) once held long enough without moving away. If the pointer
    // moves before this fires, onPointerMove below falls back to panning instead.
    setTimeout(() => {
      if (this.pointerDrag === drag && !drag.panning) {
        drag.armed = true;
        this.armedHex = drag.hex;
      }
    }, DRAG_START_DELAY_MS);
  }

  // Starts a group drag directly from its title (see the <g class="quest-group-title"> in the
  // template), rather than requiring "select the group, then drag one of its member hexes". Does
  // NOT select the group itself here (see the groupId field comment above) - only once this turns
  // into an actual drag (onPointerMove), so a plain click still goes through selectGroup's own
  // toggle untouched, exactly as it did before this existed.
  //
  // Same long-press arm delay as onPointerDown, deliberately - the title sits in what usually
  // reads as empty, pannable map space, so a user panning across it who happens to start their
  // gesture right on the title needs the exact same grace period a hex gives them before movement
  // commits to a drag instead of falling back to panning (see the !drag.armed branch below); it'd
  // be a jarring inconsistency for the title alone to react to camera-pan-speed movement as a
  // pickup. (Opting the title out of d3-zoom's own competing pan gesture, via the same
  // .hex-drag-surface class a hex carries - see the filter in svg-zoom.service.ts - is a separate
  // concern: that's what makes our own manual panning fallback here the only pan gesture in play,
  // not a decision to skip the fallback itself.)
  onGroupTitlePointerDown(groupId: string, event: PointerEvent): void {
    if (event.button !== 0 || this.connectivity.isOffline()) {
      return;
    }
    const drag = {
      hex: null,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Date.now(),
      armed: false,
      panning: false,
      panStartX: 0,
      panStartY: 0,
      isGroupDrag: true,
      groupId,
      startAxial: null,
    };
    this.pointerDrag = drag;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    setTimeout(() => {
      if (this.pointerDrag === drag && !drag.panning) {
        drag.armed = true;
      }
    }, DRAG_START_DELAY_MS);
  }

  onPointerMove(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (this.draggingHex || this.draggingGroupMembers) {
      this.pointerClientX = event.clientX;
      this.pointerClientY = event.clientY;
      // dragPreviewX/Y get set inside updateDragOverHex - clamped to the edge of the map's
      // radius instead of the raw pointer position once the drag goes past it.
      this.updateDragOverHex();
      return;
    }

    if (drag.panning) {
      // Not held long enough to become a quest drag: pan the camera by the same amount the
      // pointer has moved since the gesture started, same as dragging from an empty hex.
      const fitScale = this.computeFitScale() || 1;
      const newPanX = drag.panStartX + (event.clientX - drag.startX) / fitScale;
      const newPanY = drag.panStartY + (event.clientY - drag.startY) / fitScale;
      this.host.zoomHandle?.setTransform(newPanX, newPanY, this.host.zoom);
      return;
    }

    const distance = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
    if (distance < DRAG_START_THRESHOLD_PX) {
      return;
    }
    if (!drag.armed) {
      // Moved before the hold delay elapsed: not a long-press-drag - fall back to panning the
      // map, exactly as starting a drag from an empty hex would.
      event.preventDefault();
      drag.panning = true;
      drag.panStartX = this.host.panX;
      drag.panStartY = this.host.panY;
      this.armedHex = null;
      return;
    }

    event.preventDefault();
    this.draggingHex = drag.hex;
    this.armedHex = null;
    this.dragOverHex = null;
    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    this.dragPreviewX = event.clientX;
    this.dragPreviewY = event.clientY;
    this.dragOverlayScale = this.computeMapScale();

    if (drag.isGroupDrag) {
      // Selecting the group is deferred to right here - the moment a drag past the threshold
      // actually starts - rather than on pointerdown (see the groupId field comment), so a plain
      // click on the title still goes through selectGroup's own toggle untouched.
      this.host.selectedGroupId = drag.groupId;
      this.draggingGroupMembers = this.host.hexes.filter(h => h.quest?.questGroupId === this.host.selectedGroupId);
      this.groupDragOffsetX = 0;
      this.groupDragOffsetY = 0;
      this.groupDragPathD = this.groupGeometry.getGroupBoundaryPath(this.draggingGroupMembers, this.host.size);
      // Reference point for the delta math below (see updateGroupDragPreview): any member hex's
      // own coordinate works identically, since the whole group always moves by one rigid delta
      // vector applied to every member alike. Deliberately NOT derived from the pointer's own
      // screen position: that resolves to (or extremely close to) the dragged hex's own coordinate
      // for a hex-started drag, but the group's title renders above/outside its members' own cells
      // (see the template), so for a title-started drag it would resolve to a fictitious cell
      // beyond the map's edge - silently capping how far the group could be dragged toward that
      // edge, since the delta needed to reach a real position from a start point that never
      // corresponded to one wouldn't itself be a real, reachable target.
      drag.startAxial = drag.hex ?? this.draggingGroupMembers[0] ?? { q: 0, r: 0, s: 0 };
    } else {
      this.draggingGroupMembers = null;
      this.groupDragPathD = null;
    }
  }

  onPointerUp(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    this.pointerDrag = null;
    this.armedHex = null;

    if (!this.draggingHex && !this.draggingGroupMembers) {
      return; // was a plain tap, or resolved into a camera pan; let the native click fire if applicable
    }

    const hex = this.draggingHex;
    const target = this.dragOverHex;
    const groupMembers = this.draggingGroupMembers;
    const startAxial = drag.startAxial;
    // A real drag just occurred: ignore the click that follows pointerup
    this.host.suppressClicksUntil = Date.now() + 250;

    if (this.overCancelZone) {
      // Released over the cancel zone: abort unconditionally, regardless of what dragOverHex
      // may have resolved to before the pointer reached it.
      this.overCancelZone = false;
      this.resetDragState();
      return;
    }

    if (groupMembers) {
      if (!target || !startAxial || (target.q === startAxial.q && target.r === startAxial.r)) {
        this.resetDragState();
        return;
      }
      const delta = { q: target.q - startAxial.q, r: target.r - startAxial.r, s: target.s - startAxial.s };
      const moves = groupMembers
        .map(m => {
          const toHex = this.host.hexes.find(h => h.q === m.q + delta.q && h.r === m.r + delta.r && h.s === m.s + delta.s);
          return toHex ? { fromHex: m, toHex } : null;
        })
        .filter((mv): mv is { fromHex: Hex; toHex: Hex } => mv !== null);

      if (moves.length !== groupMembers.length) {
        // Shouldn't happen (every target was validated live during the drag - see
        // updateGroupDragPreview), but bail out safely rather than move only part of the group.
        this.resetDragState();
        return;
      }

      this.questAssignment.moveGroupToHexes(moves).subscribe({
        next: () => {
          this.markLandedHex(target);
          this.resetDragState();
          this.host.centerCameraOnHex(target);
          this.host.recomputeGroupOutlines?.();
        },
        error: err => {
          console.error('Failed to move quest group:', err);
          this.resetDragState();
        },
      });
      return;
    }

    if (!hex) {
      // No member hexes to fall back to (a title-started drag never resolved into a group drag -
      // e.g. released before crossing the movement threshold) and no single hex was being carried
      // either - nothing to commit.
      this.resetDragState();
      return;
    }

    if (target && target !== hex) {
      // Keep the origin hex dimmed and the preview visible until the move actually resolves,
      // instead of clearing draggingHex immediately - otherwise the origin hex snaps back to
      // full opacity (still showing its old quest) for the length of the request, then fades
      // out again once the response arrives, which reads as a flash.
      this.questAssignment.moveQuestToHex(hex, target, this.host.hexes, this.host.size).subscribe({
        next: () => {
          this.markLandedHex(target);
          this.resetDragState();
          this.host.centerCameraOnHex(target);
          this.host.recomputeGroupOutlines?.();
        },
        error: err => {
          console.error('Failed to move quest:', err);
          this.resetDragState();
        },
      });
    } else {
      this.resetDragState();
    }
  }

  onPointerCancel(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    this.pointerDrag = null;
    this.armedHex = null;
    this.resetDragState();
    this.overCancelZone = false;
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

  // Whether `hex` is one of the members currently being carried along by an in-progress group
  // drag - used by the template to dim every member the same way a single dragged hex dims.
  isGroupDragMember(hex: Hex): boolean {
    return !!this.draggingGroupMembers && this.draggingGroupMembers.includes(hex);
  }

  private resetDragState(): void {
    this.draggingHex = null;
    this.dragOverHex = null;
    this.draggingGroupMembers = null;
    this.groupDragPathD = null;
    this.groupDragOffsetX = 0;
    this.groupDragOffsetY = 0;
  }

  private computeFitScale(): number {
    if (!this.host.svgRoot) return 1;
    const rect = this.host.svgRoot.nativeElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return 1;
    // preserveAspectRatio="xMidYMid meet": the viewBox is scaled uniformly by the smaller of
    // the two ratios so it fits entirely within the rendered element.
    return Math.min(rect.width / this.host.mapWidth, rect.height / this.host.mapHeight);
  }

  private computeMapScale(): number {
    return this.computeFitScale() * this.host.zoom;
  }

  // Sets dragOverHex to whatever hex is under the true cursor position (this.pointerClientX/Y -
  // never the possibly-clamped dragPreviewX/Y, which would create a feedback loop with the
  // camera pan), clamped to the map's fixed radius around the origin.
  private updateDragOverHex(): void {
    const drag = this.pointerDrag;
    if (!drag) {
      this.dragOverHex = null;
      this.dragTargetClamped = false;
      return;
    }
    const clientX = this.pointerClientX;
    const clientY = this.pointerClientY;

    this.overCancelZone = this.isPointOverCancelZone(clientX, clientY);
    if (this.overCancelZone) {
      this.dragOverHex = null;
      this.dragTargetClamped = false;
      this.dragPreviewX = clientX;
      this.dragPreviewY = clientY;
      return;
    }

    const local = this.clientPointToHexLocal(clientX, clientY);
    if (!local) {
      // svgRoot not ready yet - fall back to DOM hit-testing rather than guessing blind.
      this.dragPreviewX = clientX;
      this.dragPreviewY = clientY;
      this.dragOverHex = this.findHexAtPoint(clientX, clientY);
      this.dragTargetClamped = false;
      return;
    }

    const rawTarget = this.mapGrid.pixelToAxial(local.x, local.y, this.host.size);

    // Rather than only flagging the drop as invalid once released, slide the target back to the
    // edge of the map so the cursor can't drag it into territory that doesn't exist.
    const target = this.mapGrid.clampToRectangle(rawTarget, this.host.gridWidth, this.host.gridHeight, this.host.size);
    this.dragTargetClamped = target.q !== rawTarget.q || target.r !== rawTarget.r || target.s !== rawTarget.s;

    if (this.dragTargetClamped) {
      // Clamped: pin the visual preview to the edge of the map instead of following the
      // pointer further out, so the held hex can't drift somewhere off the grid.
      const targetLocal = this.mapGrid.hexToPixel(target.q, target.r, this.host.size);
      const clampedScreen = this.hexLocalToClient(targetLocal.cx, targetLocal.cy);
      this.dragPreviewX = clampedScreen?.x ?? clientX;
      this.dragPreviewY = clampedScreen?.y ?? clientY;
    } else {
      this.dragPreviewX = clientX;
      this.dragPreviewY = clientY;
    }
    this.clampPreviewToMapViewport();

    if (this.draggingGroupMembers && drag.startAxial) {
      this.updateGroupDragPreview(drag.startAxial, target);
    } else if (!this.draggingGroupMembers) {
      this.dragOverHex = this.host.hexes.find(h => h.q === target.q && h.r === target.r && h.s === target.s) ?? null;
    }
  }

  // Validates the whole group's prospective rigid translation (startAxial -> target) each tick:
  // every member's prospective coordinate must stay within the grid's bounds and be either empty
  // or one of the group's own original coordinates (so the group can slide over cells it's itself
  // vacating). If any member fails, this tick's target is rejected outright - dragOverHex and the
  // group offset are left exactly as they were (pinned to the last valid delta), same spirit as
  // the single-hex edge-clamp above.
  //
  // `startAxial` is the pointer's own resolved position when the drag started (see
  // onPointerMove), not any one member's coordinate - the whole group moves by exactly however far
  // the pointer itself has moved since then, which is what lets a drag starting from the group's
  // title (nowhere near any member hex) still translate the group correctly rather than snapping
  // some member hex to wherever the cursor happens to be.
  private updateGroupDragPreview(startAxial: { q: number; r: number; s: number }, target: { q: number; r: number; s: number }): void {
    const members = this.draggingGroupMembers;
    if (!members) return;

    const delta = { q: target.q - startAxial.q, r: target.r - startAxial.r, s: target.s - startAxial.s };
    const memberKeys = new Set(members.map(m => `${m.q},${m.r},${m.s}`));

    const allValid = members.every(m => {
      const pq = m.q + delta.q;
      const pr = m.r + delta.r;
      const ps = m.s + delta.s;
      if (!this.mapGrid.isWithinRectangle({ q: pq, r: pr, s: ps }, this.host.gridWidth, this.host.gridHeight, this.host.size)) {
        return false;
      }
      if (memberKeys.has(`${pq},${pr},${ps}`)) return true; // one of the group's own cells, being vacated too
      const occupant = this.host.hexes.find(h => h.q === pq && h.r === pr && h.s === ps);
      return !occupant?.quest;
    });

    if (!allValid) return;

    this.dragOverHex = this.host.hexes.find(h => h.q === target.q && h.r === target.r && h.s === target.s) ?? null;
    const startPixel = this.mapGrid.hexToPixel(startAxial.q, startAxial.r, this.host.size);
    const targetPixel = this.mapGrid.hexToPixel(target.q, target.r, this.host.size);
    this.groupDragOffsetX = targetPixel.cx - startPixel.cx;
    this.groupDragOffsetY = targetPixel.cy - startPixel.cy;
  }

  // The floating drag preview (.quest-drag-overlay) is a position:fixed element tracking raw
  // screen coordinates, entirely separate from the SVG's own viewBox - clamping the logical
  // target doesn't stop it from visually rendering wherever the cursor physically is, including
  // over the bottom nav. svgRoot's rect already excludes the menu (see :host's padding-bottom in
  // map.component.scss), so clamping the preview to it keeps it out of that area too.
  private clampPreviewToMapViewport(): void {
    const rect = this.host.svgRoot?.nativeElement.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    this.dragPreviewX = Math.min(Math.max(this.dragPreviewX, rect.left), rect.right);
    this.dragPreviewY = Math.min(Math.max(this.dragPreviewY, rect.top), rect.bottom);
  }

  // The SVG's rendered fit-scale plus the letterbox offset xMidYMid adds when the element's
  // aspect ratio doesn't match the viewBox's - used by hexLocalToClient below to convert
  // hex-local coordinates back into a screen point.
  private computeLetterbox(): { fitScale: number; offsetX: number; offsetY: number } | null {
    if (!this.host.svgRoot) return null;
    const rect = this.host.svgRoot.nativeElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const fitScale = this.computeFitScale();
    if (!fitScale) return null;

    const renderedWidth = this.host.mapWidth * fitScale;
    const renderedHeight = this.host.mapHeight * fitScale;
    return {
      fitScale,
      offsetX: rect.left + (rect.width - renderedWidth) / 2,
      offsetY: rect.top + (rect.height - renderedHeight) / 2,
    };
  }

  // Converts a screen point into the hex-local coordinate space, the same space
  // hexToPixel/pixelToAxial use.
  private clientPointToHexLocal(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.host.svgRoot) return null;
    const rect = this.host.svgRoot.nativeElement.getBoundingClientRect();
    return this.mapGrid.screenToHexLocal(
      clientX,
      clientY,
      rect,
      this.host.mapWidth,
      this.host.mapHeight,
      this.host.panX,
      this.host.panY,
      this.host.zoom
    );
  }

  // Inverse of clientPointToHexLocal: converts hex-local coordinates back into a screen point,
  // used to pin the drag preview to a clamped target's actual on-screen position.
  private hexLocalToClient(localX: number, localY: number): { x: number; y: number } | null {
    const letterbox = this.computeLetterbox();
    if (!letterbox) return null;
    const { fitScale, offsetX, offsetY } = letterbox;

    // Re-apply translate(panX,panY) scale(zoom), then the fit-scale and letterbox offset.
    const viewBoxX = localX * this.host.zoom + this.host.panX;
    const viewBoxY = localY * this.host.zoom + this.host.panY;

    return {
      x: offsetX + viewBoxX * fitScale,
      y: offsetY + viewBoxY * fitScale,
    };
  }

  private isPointOverCancelZone(clientX: number, clientY: number): boolean {
    const rect = this.host.cancelZone?.nativeElement.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
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
        return this.host.hexes.find(h => h.q === q && h.r === r && h.s === s) ?? null;
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
}

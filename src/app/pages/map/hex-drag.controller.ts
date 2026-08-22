import { ElementRef } from '@angular/core';
import { Hex } from 'src/app/models/hex.model';
import { MapGridService } from 'src/app/services/map-grid.service';
import { QuestAssignmentService } from 'src/app/services/quest-assignment.service';
import { ConnectivityService } from 'src/app/services/connectivity.service';
import { SvgZoomHandle } from 'src/app/services/svg-zoom.service';

// Hand-rolled long-press-then-drag gesture, using native Pointer Events directly rather than
// @angular/cdk's DragRef: CDK's non-touch drag detection is gated behind a lazily-attached
// `mousemove` document listener that in practice doesn't reliably fire for this gesture across
// browsers/input devices, so real mouse dragging silently never started. `pointermove` fires
// consistently for every pointer type, and `setPointerCapture` guarantees this element keeps
// receiving move/up events for the gesture regardless of where the pointer physically travels.
const DRAG_START_DELAY_MS = 150;
const DRAG_START_THRESHOLD_PX = 5;

// Edge auto-pan while dragging: how close (in screen px) to the SVG's edge before panning kicks
// in, and the fastest the camera moves (in screen px/frame) right at the very edge.
const EDGE_PAN_ZONE_PX = 48;
const EDGE_PAN_MAX_SPEED_PX = 14;

// Radius (in hex rings) of the grey halo grown live around the drag target.
const DRAG_GROWTH_RADIUS = 1;

// How far apart (in hex-distance) any two assigned quests are allowed to get - keeps the whole
// quest set within a navigable area rather than letting drags spread them arbitrarily far apart.
const MAX_QUEST_SPREAD = 60;

// The subset of MapComponent this controller needs to read/drive - camera state, map bounds and
// the hex array are all owned by the component (other, non-drag code reads/writes them too), so
// the controller operates on them through this interface rather than duplicating them.
export interface HexDragHost {
  readonly hexes: Hex[];
  readonly size: number;
  mapWidth: number;
  mapHeight: number;
  panX: number;
  panY: number;
  readonly zoom: number;
  readonly svgRoot?: ElementRef<SVGSVGElement>;
  readonly zoomHandle?: SvgZoomHandle;
  suppressClicksUntil: number;
  centerCameraOnHex(hex: Hex): void;
}

// Drives the whole quest drag-and-drop gesture: long-press-to-arm, the drag itself (including
// edge auto-pan and live grid growth ahead of the cursor), and the drop. Extracted out of
// MapComponent since this is a large, mostly self-contained chunk of behavior - the component
// still owns camera/bounds/hexes state (see HexDragHost above) and template-facing methods
// delegate straight through to this controller.
export class HexDragController {
  constructor(
    private readonly host: HexDragHost,
    private readonly mapGrid: MapGridService,
    private readonly questAssignment: QuestAssignmentService,
    private readonly connectivity: ConnectivityService
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
  private lastLandedHex: Hex | null = null;
  private edgePanDirection: { dx: number; dy: number } | null = null;
  // "q,r,s" keys of hexes added by live grid growth during the current drag, so the halo of
  // grey hexes can move with the held hex (shrinking behind it) instead of leaving a trail.
  private speculativeGrowthCoords = new Set<string>();
  // The pointer's *true* screen position, updated only from real pointer events - never from
  // the (possibly clamped/pinned) drag preview position. The edge-pan loop re-derives the
  // target from this every frame; feeding the clamped preview back in as if it were the cursor
  // created a feedback loop (target kept drifting as pan changed) that showed up as jitter.
  private pointerClientX = 0;
  private pointerClientY = 0;
  private edgePanFrameId: number | null = null;
  // True once the drag target has hit the MAX_QUEST_SPREAD boundary - edge-pan stops advancing
  // the camera further in that case, so the user can't keep panning away from the held hex
  // without it actually going anywhere, losing track of where they'll end up dropping it.
  private dragTargetClamped = false;
  // True when dropping on the current target would push some other assigned quest further than
  // MAX_QUEST_SPREAD away - drives a "not allowed here" visual cue and blocks the drop itself.
  dragTargetTooFar = false;

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
    // driven manually below (see onPointerMove), exactly as it would be from an empty hex.
    panning: boolean;
    panStartX: number;
    panStartY: number;
  } | null = null;

  // The hex currently primed for pickup (held past the hold delay, not yet moved): drives the
  // "ready to drag" color cue in the template.
  armedHex: Hex | null = null;

  onPointerDown(hex: Hex, event: PointerEvent): void {
    if (!hex.quest || event.button !== 0 || this.connectivity.isOffline()) {
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
    this.speculativeGrowthCoords.clear();
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

  onPointerMove(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (this.draggingHex) {
      this.pointerClientX = event.clientX;
      this.pointerClientY = event.clientY;
      // dragPreviewX/Y get set inside updateDragOverHex - clamped to the edge of the halo
      // instead of the raw pointer position once the drag goes past MAX_QUEST_SPREAD.
      this.updateDragOverHex();
      this.updateEdgePan(event.clientX, event.clientY);
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
  }

  onPointerUp(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    this.pointerDrag = null;
    this.armedHex = null;
    this.stopEdgePan();

    if (!this.draggingHex) {
      return; // was a plain tap, or resolved into a camera pan; let the native click fire if applicable
    }

    const hex = this.draggingHex;
    const target = this.dragOverHex;
    const tooFar = this.dragTargetTooFar;
    // A real drag just occurred: ignore the click that follows pointerup
    this.host.suppressClicksUntil = Date.now() + 250;

    if (target && target !== hex && !tooFar) {
      // Keep the origin hex dimmed and the preview visible until the move actually resolves,
      // instead of clearing draggingHex immediately - otherwise the origin hex snaps back to
      // full opacity (still showing its old quest) for the length of the request, then fades
      // out again once the response arrives, which reads as a flash.
      this.questAssignment.moveQuestToHex(hex, target, this.host.hexes, this.host.size).subscribe({
        next: () => {
          this.markLandedHex(target);
          this.draggingHex = null;
          this.dragOverHex = null;
          this.host.centerCameraOnHex(target);
        },
        error: err => {
          console.error('Failed to move quest:', err);
          this.draggingHex = null;
          this.dragOverHex = null;
          this.pruneSpeculativeGrowth();
        },
      });
    } else {
      this.draggingHex = null;
      this.dragOverHex = null;
      this.pruneSpeculativeGrowth();
    }
  }

  onPointerCancel(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    this.pointerDrag = null;
    this.armedHex = null;
    this.stopEdgePan();
    const wasDragging = this.draggingHex;
    this.draggingHex = null;
    this.dragOverHex = null;
    if (wasDragging) {
      this.pruneSpeculativeGrowth();
    }
  }

  isLandedHex(hex: Hex): boolean {
    return this.lastLandedHex === hex;
  }

  getDropHighlightClass(hex: Hex): string {
    if (!this.draggingHex || this.dragOverHex !== hex || hex === this.draggingHex) {
      return '';
    }
    if (this.dragTargetTooFar) {
      return 'hex-drop-invalid';
    }
    return hex.quest ? 'hex-drop-swap' : 'hex-drop-move';
  }

  // Whether `hex` sits outside the area currently reachable by the drag in progress (far enough
  // from some other quest to violate MAX_QUEST_SPREAD) - a persistent "this is the edge"
  // indicator, separate from the one-off invalid-drop flash on the specific target hex.
  isOutOfDragBounds(hex: Hex): boolean {
    const drag = this.pointerDrag;
    if (!this.draggingHex || !drag) return false;

    // Only consider hexes near the current drag target (the visible halo) - otherwise a hex
    // belonging to a distant, unrelated island can independently be further than
    // MAX_QUEST_SPREAD from some third quest and light up red anywhere on the map, with no
    // relation to where this drag can actually reach.
    const reference = this.dragOverHex ?? drag.hex;
    if (this.hexDistance(reference, hex) > DRAG_GROWTH_RADIUS + 1) return false;

    const origin = drag.hex;
    const farthest = this.findFarthestOtherQuest(origin, hex);
    return farthest !== null && this.hexDistance(farthest, hex) > MAX_QUEST_SPREAD;
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
  // camera pan), growing a small halo of grey hexes around that point first if nothing exists
  // there yet. Runs on every update (not just when growth is needed) so the halo also shrinks
  // behind the held hex as it moves, rather than leaving a trail across the whole drag path.
  private updateDragOverHex(): void {
    const drag = this.pointerDrag;
    if (!drag) {
      this.dragOverHex = null;
      this.dragTargetClamped = false;
      this.dragTargetTooFar = false;
      return;
    }
    const clientX = this.pointerClientX;
    const clientY = this.pointerClientY;

    const local = this.clientPointToHexLocal(clientX, clientY);
    if (!local) {
      // svgRoot not ready yet - fall back to DOM hit-testing rather than growing blind.
      this.dragPreviewX = clientX;
      this.dragPreviewY = clientY;
      this.dragOverHex = this.findHexAtPoint(clientX, clientY);
      this.dragTargetClamped = false;
      this.dragTargetTooFar = false;
      return;
    }

    const rawTarget = this.mapGrid.pixelToAxial(local.x, local.y, this.host.size);
    const origin = drag.hex;
    let target = rawTarget;

    // Rather than only flagging the drop as invalid once released, slide the target back to the
    // edge of the allowed zone so the cursor can't drag it into "red territory" in the first
    // place - clamped toward whichever other quest is farthest away, the one actually defining
    // the limit.
    const farthest = this.findFarthestOtherQuest(origin, target);
    this.dragTargetClamped = !!farthest && this.hexDistance(farthest, target) > MAX_QUEST_SPREAD;
    if (this.dragTargetClamped && farthest) {
      target = this.mapGrid.clampToDistance(farthest, target, MAX_QUEST_SPREAD);
    }

    if (this.dragTargetClamped) {
      // Clamped: pin the visual preview to the edge of the halo instead of following the
      // pointer further out, so the held hex can't drift somewhere the camera hasn't reached.
      const targetLocal = this.mapGrid.hexToPixel(target.q, target.r, this.host.size);
      const clampedScreen = this.hexLocalToClient(targetLocal.cx, targetLocal.cy);
      this.dragPreviewX = clampedScreen?.x ?? clientX;
      this.dragPreviewY = clampedScreen?.y ?? clientY;
    } else {
      this.dragPreviewX = clientX;
      this.dragPreviewY = clientY;
    }

    const desiredCoords = new Set(this.mapGrid.coordinatesInRadius(target, DRAG_GROWTH_RADIUS).map(c => `${c.q},${c.r},${c.s}`));
    this.shrinkSpeculativeGrowth(desiredCoords);

    const added = this.mapGrid.ensureHexesInRadius(this.host.hexes, target, DRAG_GROWTH_RADIUS, this.host.size);
    for (const key of added) {
      this.speculativeGrowthCoords.add(key);
    }

    // Grow the viewBox only when the hex set actually needs more room than it currently has,
    // and never shrink mid-drag (shrinking is handled once the drag ends). Reserving the whole
    // possible drag radius up front instead caused an immediate, disorienting rescale/jump the
    // moment a drag started - any viewBox size change rescales the whole map, since fitScale is
    // purely a function of mapWidth/mapHeight vs the fixed container size. Growing lazily like
    // this means it only happens occasionally, as territory is actually reached, not constantly.
    if (added.length) {
      const needed = this.mapGrid.adjustMapBounds(this.host.hexes, this.host.size);
      if (needed.width > this.host.mapWidth || needed.height > this.host.mapHeight) {
        this.host.mapWidth = Math.max(this.host.mapWidth, needed.width);
        this.host.mapHeight = Math.max(this.host.mapHeight, needed.height);
        this.dragOverlayScale = this.computeMapScale();
      }
    }

    this.dragOverHex = this.host.hexes.find(h => h.q === target.q && h.r === target.r && h.s === target.s) ?? null;
    this.dragTargetTooFar = this.wouldExceedMaxSpread(origin, target);
  }

  private hexDistance(a: { q: number; r: number; s: number }, b: { q: number; r: number; s: number }): number {
    return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
  }

  // The assigned quest (other than `origin`, which is mid-move) furthest from `target` - the
  // one that actually determines whether MAX_QUEST_SPREAD would be violated.
  private findFarthestOtherQuest(origin: Hex, target: { q: number; r: number; s: number }): Hex | null {
    let farthest: Hex | null = null;
    let farthestDistance = -1;
    for (const h of this.host.hexes) {
      if (!h.quest || h === origin) continue;
      const distance = this.hexDistance(h, target);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = h;
      }
    }
    return farthest;
  }

  // Whether dropping `origin`'s quest at `target` would leave some other already-assigned quest
  // further than MAX_QUEST_SPREAD away. Existing pairs among the other quests aren't rechecked -
  // only their distance to the new target matters, since this move can't affect distances that
  // don't involve it. Normally redundant with the live clamp above (which already keeps `target`
  // within range), but stays as the authoritative check for drop-time enforcement.
  private wouldExceedMaxSpread(origin: Hex, target: { q: number; r: number; s: number }): boolean {
    const farthest = this.findFarthestOtherQuest(origin, target);
    return farthest !== null && this.hexDistance(farthest, target) > MAX_QUEST_SPREAD;
  }

  // The SVG's rendered fit-scale plus the letterbox offset xMidYMid adds when the element's
  // aspect ratio doesn't match the viewBox's - shared by clientPointToHexLocal/hexLocalToClient
  // below, which convert screen <-> hex-local coordinates in opposite directions.
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

  // Converts a screen point into the hex-local coordinate space (undoing the SVG's letterboxed
  // fit-scale, then the camera's own pan/zoom), the same space hexToPixel/pixelToAxial use.
  private clientPointToHexLocal(clientX: number, clientY: number): { x: number; y: number } | null {
    const letterbox = this.computeLetterbox();
    if (!letterbox) return null;
    const { fitScale, offsetX, offsetY } = letterbox;

    const viewBoxX = (clientX - offsetX) / fitScale;
    const viewBoxY = (clientY - offsetY) / fitScale;

    // Undo translate(panX,panY) scale(zoom) to get back to hex-local space.
    return {
      x: (viewBoxX - this.host.panX) / this.host.zoom,
      y: (viewBoxY - this.host.panY) / this.host.zoom,
    };
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

  // Removes any hex that was speculatively grown earlier in this drag but isn't part of
  // `keepCoords` (the halo around the current target) - lets the grey halo move with the held
  // hex instead of leaving every previously-visited spot filled in behind it.
  private shrinkSpeculativeGrowth(keepCoords: Set<string>): void {
    if (this.speculativeGrowthCoords.size === 0) return;

    // mapWidth/mapHeight are intentionally left alone here too - see updateDragOverHex.
    const hexes = this.host.hexes;
    for (let i = hexes.length - 1; i >= 0; i--) {
      const h = hexes[i];
      const key = `${h.q},${h.r},${h.s}`;
      if (this.speculativeGrowthCoords.has(key) && !keepCoords.has(key)) {
        hexes.splice(i, 1);
        this.speculativeGrowthCoords.delete(key);
      }
    }
  }

  // While the pointer sits within EDGE_PAN_ZONE_PX of the SVG's edge during an active drag,
  // continuously pans the camera toward that edge - the map moves under a stationary pointer,
  // so dragOverHex/grid growth get re-evaluated every frame rather than only on pointermove.
  private updateEdgePan(clientX: number, clientY: number): void {
    if (!this.host.svgRoot) {
      this.stopEdgePan();
      return;
    }
    const rect = this.host.svgRoot.nativeElement.getBoundingClientRect();
    const zone = EDGE_PAN_ZONE_PX;

    const distLeft = Math.max(clientX - rect.left, 0);
    const distRight = Math.max(rect.right - clientX, 0);
    const distTop = Math.max(clientY - rect.top, 0);
    const distBottom = Math.max(rect.bottom - clientY, 0);

    let dx = 0;
    let dy = 0;
    if (distLeft < zone) dx = -(zone - distLeft) / zone;
    else if (distRight < zone) dx = (zone - distRight) / zone;
    if (distTop < zone) dy = -(zone - distTop) / zone;
    else if (distBottom < zone) dy = (zone - distBottom) / zone;

    if (dx === 0 && dy === 0) {
      this.stopEdgePan();
      return;
    }

    this.edgePanDirection = { dx, dy };
    this.startEdgePanLoop();
  }

  private startEdgePanLoop(): void {
    if (this.edgePanFrameId !== null) return;
    const step = () => {
      if (!this.edgePanDirection || !this.draggingHex) {
        this.edgePanFrameId = null;
        return;
      }
      // Once the drag target has hit the MAX_QUEST_SPREAD boundary, panning further wouldn't
      // reach anything new anyway - stop advancing the camera so the held hex doesn't drift out
      // of view while the user has no way of telling where they'll actually end up dropping it.
      if (!this.dragTargetClamped) {
        const fitScale = this.computeFitScale() || 1;
        const speed = EDGE_PAN_MAX_SPEED_PX / fitScale;
        this.host.panX -= this.edgePanDirection.dx * speed;
        this.host.panY -= this.edgePanDirection.dy * speed;
        this.host.zoomHandle?.setTransform(this.host.panX, this.host.panY, this.host.zoom);
      }

      // Re-derive from the true (unchanged) cursor position, not dragPreviewX/Y - the pan just
      // changed, so the hex under that same screen point is different now too.
      this.updateDragOverHex();

      this.edgePanFrameId = requestAnimationFrame(step);
    };
    this.edgePanFrameId = requestAnimationFrame(step);
  }

  private stopEdgePan(): void {
    this.edgePanDirection = null;
    if (this.edgePanFrameId !== null) {
      cancelAnimationFrame(this.edgePanFrameId);
      this.edgePanFrameId = null;
    }
  }

  // Drops anything that was speculatively grown while dragging (edge-pan/grid growth) but
  // didn't end up used for an actual move, same pruning already applied elsewhere.
  private pruneSpeculativeGrowth(): void {
    this.mapGrid.removeOrphanedDynamicHexes(this.host.hexes, this.host.size);
    const bounds = this.mapGrid.adjustMapBounds(this.host.hexes, this.host.size);
    this.host.mapWidth = bounds.width;
    this.host.mapHeight = bounds.height;
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

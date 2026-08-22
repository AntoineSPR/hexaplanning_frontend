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

// The subset of MapComponent this controller needs to read/drive - camera state and the hex
// array are owned by the component (other, non-drag code reads/writes them too), so the
// controller operates on them through this interface rather than duplicating them.
export interface HexDragHost {
  readonly hexes: Hex[];
  readonly size: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  panX: number;
  panY: number;
  readonly zoom: number;
  readonly svgRoot?: ElementRef<SVGSVGElement>;
  readonly zoomHandle?: SvgZoomHandle;
  suppressClicksUntil: number;
  centerCameraOnHex(hex: Hex): void;
}

// Drives the whole quest drag-and-drop gesture: long-press-to-arm, the drag itself, and the
// drop. Extracted out of MapComponent, which owns camera/hexes state (see HexDragHost above)
// and delegates its template-facing drag methods straight through to this controller.
//
// The map is a fixed-size, fully pre-generated grid (see MapGridService.generateHexes), so
// dragging just clamps the target to the map's fixed radius (mapRadius) and follows the cursor -
// no grid growth or camera auto-panning to worry about.
export class HexDragController {
  constructor(
    private readonly host: HexDragHost,
    private readonly mapGrid: MapGridService,
    private readonly questAssignment: QuestAssignmentService,
    private readonly connectivity: ConnectivityService,
    private readonly mapRadius: number
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
  // The pointer's *true* screen position, updated only from real pointer events - never from
  // the (possibly clamped/pinned) drag preview position, which would create a feedback loop.
  private pointerClientX = 0;
  private pointerClientY = 0;
  // True once the drag target has hit the map's radius boundary - drives the "pin the preview
  // at the edge instead of following the cursor further" behavior below.
  private dragTargetClamped = false;

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
  }

  onPointerUp(event: PointerEvent): void {
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
    this.host.suppressClicksUntil = Date.now() + 250;

    if (target && target !== hex) {
      // Keep the origin hex dimmed and the preview visible until the move actually resolves,
      // instead of clearing draggingHex immediately - otherwise the origin hex snaps back to
      // full opacity (still showing its old quest) for the length of the request, then fades
      // out again once the response arrives, which reads as a flash.
      this.questAssignment.moveQuestToHex(hex, target).subscribe({
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
        },
      });
    } else {
      this.draggingHex = null;
      this.dragOverHex = null;
    }
  }

  onPointerCancel(event: PointerEvent): void {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    this.pointerDrag = null;
    this.armedHex = null;
    this.draggingHex = null;
    this.dragOverHex = null;
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
    const target = this.mapGrid.clampToDistance(rawTarget, { q: 0, r: 0, s: 0 }, this.mapRadius);
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

    this.dragOverHex = this.host.hexes.find(h => h.q === target.q && h.r === target.r && h.s === target.s) ?? null;
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
    return this.mapGrid.screenToHexLocal(clientX, clientY, rect, this.host.mapWidth, this.host.mapHeight, this.host.panX, this.host.panY, this.host.zoom);
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

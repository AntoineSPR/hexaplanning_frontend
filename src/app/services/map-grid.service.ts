import { Injectable } from '@angular/core';
import { Hex } from '../models/hex.model';

@Injectable({ providedIn: 'root' })
export class MapGridService {
  // Origin for coordinate calculations; overwritten with the real centered position by
  // generateHexes. Defaults match the initial MAP_WIDTH/MAP_HEIGHT.
  private originX = 145;
  private originY = 245;

  private readonly directions = [
    { q: 1, r: 0, s: -1 },
    { q: 1, r: -1, s: 0 },
    { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 },
    { q: -1, r: 1, s: 0 },
    { q: 0, r: 1, s: -1 },
  ];

  // The 6 hexes adjacent to `center`, with both their axial coordinates and pixel centers.
  neighborsOf(center: { q: number; r: number; s: number }, size: number): { q: number; r: number; s: number; cx: number; cy: number }[] {
    return this.directions.map(d => {
      const q = center.q + d.q;
      const r = center.r + d.r;
      const s = center.s + d.s;
      const { cx, cy } = this.hexToPixel(q, r, size);
      return { q, r, s, cx, cy };
    });
  }

  // Creates every hex tiling a `gridWidth` x `gridHeight` rectangle centered on the origin - the
  // whole grid, generated up front. `mapWidth`/`mapHeight` (the viewBox size, independent of the
  // grid's own extent) only affects where the origin sits.
  generateHexes(size: number, mapWidth: number, mapHeight: number, gridWidth: number, gridHeight: number): Hex[] {
    this.originX = mapWidth / 2;
    this.originY = mapHeight / 2;
    const hexes: Hex[] = [];

    for (const { q, r, s } of this.coordinatesInRectangle(gridWidth, gridHeight, size)) {
      const { cx, cy } = this.hexToPixel(q, r, size);
      const level = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      hexes.push({ q, r, s, cx, cy, level });
    }

    return hexes;
  }

  // Convert axial coords to pixel center
  hexToPixel(q: number, r: number, size: number): { cx: number; cy: number } {
    const x = size * Math.sqrt(3) * (q + r / 2);
    const y = ((size * 3) / 2) * r;
    return {
      cx: x + this.originX,
      cy: y + this.originY,
    };
  }

  // Points for a regular hex centered at (cx, cy)
  getHexPoints(cx: number, cy: number, size: number, offset: number = 0): string {
    const adjustedSize = size + offset;
    const points: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = cx + adjustedSize * Math.cos(angle);
      const y = cy + adjustedSize * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  }

  // On-hold marker
  getHexOnHoldMarker(cx: number, cy: number, size: number): { traces: string[]; pads: { x: number; y: number; r: number }[] } {
    const lineLength = size * 0.45;

    const traces: string[] = [];
    const pads: { x: number; y: number; r: number }[] = [];

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const corner = { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
      const end = { x: corner.x - lineLength * Math.cos(angle), y: corner.y - lineLength * Math.sin(angle) };

      traces.push(`M ${corner.x},${corner.y} L ${end.x},${end.y}`);
      pads.push({ x: end.x, y: end.y, r: size * 0.05 });
    }

    return { traces, pads };
  }

  // Path for a radial progress arc clipped by the hex
  getProgressPath(cx: number, cy: number, size: number, advancement: number): string {
    if (advancement <= 0) return '';
    if (advancement >= 100) return this.getHexPoints(cx, cy, size);

    const percentage = Math.min(advancement, 100) / 100;
    const startAngle = -Math.PI / 2; // top
    const endAngle = startAngle + 2 * Math.PI * percentage;

    const startX = cx + size * Math.cos(startAngle);
    const startY = cy + size * Math.sin(startAngle);
    const endX = cx + size * Math.cos(endAngle);
    const endY = cy + size * Math.sin(endAngle);

    const largeArcFlag = percentage > 0.5 ? 1 : 0;

    if (percentage === 1) {
      return `M ${cx},${cy} m -${size},0 a ${size},${size} 0 1,1 ${size * 2},0 a ${size},${size} 0 1,1 -${size * 2},0`;
    } else {
      return `M ${cx} ${cy} L ${startX} ${startY} A ${size} ${size} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
    }
  }

  // Adds a hex at the given coordinates - a fallback for a quest assignment outside the
  // pre-generated grid's radius, so it still renders instead of vanishing.
  addHex(hexes: Hex[], q: number, r: number, s: number, size: number): Hex {
    const { cx, cy } = this.hexToPixel(q, r, size);
    const level = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
    const newHex: Hex = { q, r, s, cx, cy, level };
    hexes.push(newHex);
    return newHex;
  }

  // Row geometry shared by rectangular generation and the rectangular bounds checks below: for
  // axial row `r`, the q range whose pixel `cx` (see hexToPixel) spans [-width/2, width/2]. Every
  // row gets however many columns it needs to reach full width, instead of a range that shrinks
  // with |r| (which is what made the old disk-shaped grid taper to a point at the top/bottom).
  private rowQRange(r: number, width: number, size: number): { qMin: number; qMax: number } {
    const colSpacing = size * Math.sqrt(3);
    return {
      qMin: Math.ceil(-width / 2 / colSpacing - r / 2),
      qMax: Math.floor(width / 2 / colSpacing - r / 2),
    };
  }

  private rowRange(height: number, size: number): { rMin: number; rMax: number } {
    const rowSpacing = (size * 3) / 2;
    return {
      rMin: Math.ceil(-height / 2 / rowSpacing),
      rMax: Math.floor(height / 2 / rowSpacing),
    };
  }

  // All axial coordinates tiling a `width` x `height` pixel rectangle centered on the origin.
  coordinatesInRectangle(width: number, height: number, size: number): { q: number; r: number; s: number }[] {
    const { rMin, rMax } = this.rowRange(height, size);
    const coords: { q: number; r: number; s: number }[] = [];
    for (let r = rMin; r <= rMax; r++) {
      const { qMin, qMax } = this.rowQRange(r, width, size);
      for (let q = qMin; q <= qMax; q++) {
        coords.push({ q, r, s: -q - r });
      }
    }
    return coords;
  }

  // Whether `coord` falls within the rectangular grid generated by coordinatesInRectangle with
  // the same width/height/size - used to gate the cursor-light hover effect.
  isWithinRectangle(coord: { q: number; r: number; s: number }, width: number, height: number, size: number): boolean {
    const { rMin, rMax } = this.rowRange(height, size);
    if (coord.r < rMin || coord.r > rMax) return false;
    const { qMin, qMax } = this.rowQRange(coord.r, width, size);
    return coord.q >= qMin && coord.q <= qMax;
  }

  // Clamps `target` to the nearest in-bounds coordinate of the same rectangular grid, so a
  // drag-preview target can't slide onto a coordinate with no backing hex.
  clampToRectangle(target: { q: number; r: number; s: number }, width: number, height: number, size: number): { q: number; r: number; s: number } {
    const { rMin, rMax } = this.rowRange(height, size);
    const r = Math.min(Math.max(target.r, rMin), rMax);
    const { qMin, qMax } = this.rowQRange(r, width, size);
    const q = Math.min(Math.max(target.q, qMin), qMax);
    return { q, r, s: -q - r };
  }

  // Rounds fractional cube coordinates to the nearest valid hex (q + r + s === 0), correcting
  // whichever axis has the largest rounding error.
  private cubeRound(qFrac: number, rFrac: number, sFrac: number): { q: number; r: number; s: number } {
    let q = Math.round(qFrac);
    let r = Math.round(rFrac);
    let s = Math.round(sFrac);

    const dq = Math.abs(q - qFrac);
    const dr = Math.abs(r - rFrac);
    const ds = Math.abs(s - sFrac);

    if (dq > dr && dq > ds) {
      q = -r - s;
    } else if (dr > ds) {
      r = -q - s;
    } else {
      s = -q - r;
    }

    return { q, r, s };
  }

  // Inverse of hexToPixel: given a point in the same hex-local coordinate space, find the
  // nearest axial hex coordinate (using cube rounding), whether or not a hex actually exists
  // there yet.
  pixelToAxial(localX: number, localY: number, size: number): { q: number; r: number; s: number } {
    const rFrac = (localY - this.originY) / ((size * 3) / 2);
    const qFrac = (localX - this.originX) / (size * Math.sqrt(3)) - rFrac / 2;
    const sFrac = -qFrac - rFrac;
    return this.cubeRound(qFrac, rFrac, sFrac);
  }

  // Converts a screen point into hex-local coordinate space, undoing the SVG's letterboxed
  // fit-scale (preserveAspectRatio="xMidYMid meet") and then the camera's own pan/zoom. Shared
  // by drag handling and the cursor-light overlay.
  screenToHexLocal(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
    mapWidth: number,
    mapHeight: number,
    panX: number,
    panY: number,
    zoom: number
  ): { x: number; y: number } | null {
    if (!rect.width || !rect.height) return null;
    const fitScale = Math.min(rect.width / mapWidth, rect.height / mapHeight);
    if (!fitScale) return null;

    const offsetX = rect.left + (rect.width - mapWidth * fitScale) / 2;
    const offsetY = rect.top + (rect.height - mapHeight * fitScale) / 2;
    const viewBoxX = (clientX - offsetX) / fitScale;
    const viewBoxY = (clientY - offsetY) / fitScale;

    return {
      x: (viewBoxX - panX) / zoom,
      y: (viewBoxY - panY) / zoom,
    };
  }
}

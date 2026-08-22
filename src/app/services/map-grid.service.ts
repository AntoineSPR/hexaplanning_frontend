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

  // Creates every hex within `radius` steps of the origin - the whole grid, generated up front.
  generateHexes(size: number, mapWidth: number, mapHeight: number, radius: number): Hex[] {
    this.originX = mapWidth / 2;
    this.originY = mapHeight / 2;
    const hexes: Hex[] = [];

    for (const { q, r, s } of this.coordinatesInRadius({ q: 0, r: 0, s: 0 }, radius)) {
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

  // All axial coordinates within `radius` steps of `center` (a filled hex "disk").
  coordinatesInRadius(center: { q: number; r: number; s: number }, radius: number): { q: number; r: number; s: number }[] {
    const coords: { q: number; r: number; s: number }[] = [];
    for (let dq = -radius; dq <= radius; dq++) {
      const rMin = Math.max(-radius, -dq - radius);
      const rMax = Math.min(radius, -dq + radius);
      for (let dr = rMin; dr <= rMax; dr++) {
        const ds = -dq - dr;
        coords.push({ q: center.q + dq, r: center.r + dr, s: center.s + ds });
      }
    }
    return coords;
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

  // Clamps `target` to lie within `maxDistance` hex-steps of `center`. Hex-distance disks are
  // equivalent to axis-aligned boxes in cube coordinates (distance = max(|dq|,|dr|,|ds|), since
  // q+r+s is always 0).
  clampToDistance(
    target: { q: number; r: number; s: number },
    center: { q: number; r: number; s: number },
    maxDistance: number
  ): { q: number; r: number; s: number } {
    const qMin = center.q - maxDistance;
    const qMax = center.q + maxDistance;
    const rMin = center.r - maxDistance;
    const rMax = center.r + maxDistance;
    const sMin = center.s - maxDistance;
    const sMax = center.s + maxDistance;

    // Project onto {q+r+s=0} intersected with the box, via iterative even redistribution: clamp
    // whichever axes are still "free" (not yet pinned to a bound), spread the resulting sum-to-
    // zero deficit across the free axes equally, and repeat. Converges within 3 passes.
    let q = target.q;
    let r = target.r;
    let s = target.s;
    const free = { q: true, r: true, s: true };

    for (let pass = 0; pass < 3; pass++) {
      let pinnedAny = false;
      if (free.q) {
        if (q < qMin) {
          q = qMin;
          free.q = false;
          pinnedAny = true;
        } else if (q > qMax) {
          q = qMax;
          free.q = false;
          pinnedAny = true;
        }
      }
      if (free.r) {
        if (r < rMin) {
          r = rMin;
          free.r = false;
          pinnedAny = true;
        } else if (r > rMax) {
          r = rMax;
          free.r = false;
          pinnedAny = true;
        }
      }
      if (free.s) {
        if (s < sMin) {
          s = sMin;
          free.s = false;
          pinnedAny = true;
        } else if (s > sMax) {
          s = sMax;
          free.s = false;
          pinnedAny = true;
        }
      }

      if (!pinnedAny) break;

      const freeCount = (free.q ? 1 : 0) + (free.r ? 1 : 0) + (free.s ? 1 : 0);
      if (freeCount === 0) break; // fully pinned; region is degenerate, accept the residual as-is

      const share = -(q + r + s) / freeCount;
      if (free.q) q += share;
      if (free.r) r += share;
      if (free.s) s += share;
    }

    return { q, r, s };
  }

  // Raw pixel bounding box of a hex set, padded by half a hex - used once at startup to size the
  // viewBox to fit the whole pre-generated grid (see MapComponent.matchMapDimensionsToContainer).
  computeContentBounds(hexes: Hex[], size: number): { minX: number; maxX: number; minY: number; maxY: number } {
    const pad = size + 10;
    const xs = hexes.map(h => h.cx);
    const ys = hexes.map(h => h.cy);
    return {
      minX: Math.min(...xs) - pad,
      maxX: Math.max(...xs) + pad,
      minY: Math.min(...ys) - pad,
      maxY: Math.max(...ys) + pad,
    };
  }
}

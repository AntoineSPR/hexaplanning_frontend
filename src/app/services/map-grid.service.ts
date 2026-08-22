import { Injectable } from '@angular/core';
import { Hex } from '../models/hex.model';

@Injectable({ providedIn: 'root' })
export class MapGridService {
  // Stable origin for coordinate calculations - overwritten with the actual centered position by
  // generateHexes; this default just matches the initial MAP_WIDTH/MAP_HEIGHT in case anything
  // reads it before generateHexes runs.
  private originX = 145;
  private originY = 245;

  // Create every hex within `radius` hex-steps of the origin, once - the map is a fixed-size
  // grid generated up front rather than grown live as quests get dragged around (see
  // hex-drag.controller.ts's clampToDistance call, which keeps drags within this same radius).
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

  // Add a new hex at the given coordinates - used as a fallback for a quest assignment whose
  // coordinates fall outside the pre-generated grid (e.g. legacy data from before the grid's
  // radius was fixed), so it still renders instead of silently vanishing.
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

  // Clamps `target` to lie within `maxDistance` hex-steps of `center` - the map's fixed
  // boundary, a single regular hexagon (unlike an earlier design where this had to intersect
  // several quest-centered disks at once, which needed a much more involved computation).
  // Hex-distance disks are equivalent to axis-aligned bounding boxes in cube coordinates
  // (distance = max(|dq|,|dr|,|ds|) for any two hexes, since q+r+s is always 0).
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

    // Project target onto {q+r+s=0} intersected with the box [qMin,qMax]x[rMin,rMax]x[sMin,sMax],
    // via iterative even redistribution (a standard technique for projecting onto a box cut by a
    // hyperplane): clamp whichever axes are still "free" (not yet pinned to a bound), then spread
    // whatever sum-to-zero deficit that leaves across the still-free axes equally, and repeat.
    // Each pass either finishes or permanently pins at least one more axis, so this always
    // converges within 3 passes for 3 axes.
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

import { Injectable } from '@angular/core';
import { Hex } from '../models/hex.model';

@Injectable({ providedIn: 'root' })
export class MapGridService {
  // Stable origin for coordinate calculations
  private originX = 45;
  private originY = 245; // Default centered position

  // Six directions for neighbor calculation (axial coordinates)
  private readonly directions = [
    { q: 1, r: 0, s: -1 },
    { q: 1, r: -1, s: 0 },
    { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 },
    { q: -1, r: 1, s: 0 },
    { q: 0, r: 1, s: -1 },
  ];

  // Coordinates of the starting island: 1 center (level 0) + 6 neighbors (level 1)
  private seedCoordinates(): { q: number; r: number; s: number }[] {
    const coords: { q: number; r: number; s: number }[] = [];
    const initialMaxLevel = 1;

    for (let level = 0; level <= initialMaxLevel; level++) {
      for (let q = -level; q <= level; q++) {
        for (let r = Math.max(-level, -level - q); r <= Math.min(level, level - q); r++) {
          const s = -q - r;
          if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === level) {
            coords.push({ q, r, s });
          }
        }
      }
    }

    return coords;
  }

  // Create the starting island's axial hexes
  generateHexes(size: number, mapHeight: number): Hex[] {
    // Set stable origin based on initial mapHeight
    this.originY = mapHeight / 2;
    const hexes: Hex[] = [];

    for (const { q, r, s } of this.seedCoordinates()) {
      const { cx, cy } = this.hexToPixel(q, r, size);
      const level = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      hexes.push({ q, r, s, cx, cy, level, isInitial: true }); // Mark as initial
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

  // Check if a hex exists at given coordinates
  hasHex(hexes: Hex[], q: number, r: number, s: number): boolean {
    return hexes.some(h => h.q === q && h.r === r && h.s === s);
  }

  // Add a new hex at the given coordinates
  addHex(hexes: Hex[], q: number, r: number, s: number, size: number): Hex {
    const { cx, cy } = this.hexToPixel(q, r, size);
    const level = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
    const newHex: Hex = { q, r, s, cx, cy, level, isInitial: false }; // Mark as dynamic
    hexes.push(newHex);
    return newHex;
  }

  // Ensure all 6 neighbors exist around a given hex
  ensureNeighborsOf(hexes: Hex[], hex: Hex, size: number): void {
    for (const dir of this.directions) {
      const nq = hex.q + dir.q;
      const nr = hex.r + dir.r;
      const ns = hex.s + dir.s;
      if (!this.hasHex(hexes, nq, nr, ns)) {
        this.addHex(hexes, nq, nr, ns, size);
      }
    }
  }

  // All axial coordinates within `radius` steps of `center` (a filled hex "disk"), regardless
  // of whether hexes actually exist there yet.
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

  // Ensure every hex within `radius` steps of `center` exists (adding any missing ones),
  // regardless of whether `center` itself is currently occupied/assigned. Used to grow the
  // grid live ahead of the cursor while dragging a quest toward territory that doesn't exist
  // yet, rather than only expanding around already-assigned hexes. Returns the "q,r,s" keys of
  // whatever was actually added, so callers can track/undo speculative growth.
  ensureHexesInRadius(hexes: Hex[], center: { q: number; r: number; s: number }, radius: number, size: number): string[] {
    const added: string[] = [];
    for (const { q, r, s } of this.coordinatesInRadius(center, radius)) {
      if (!this.hasHex(hexes, q, r, s)) {
        this.addHex(hexes, q, r, s, size);
        added.push(`${q},${r},${s}`);
      }
    }
    return added;
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

  // If `target` is further than `maxDistance` hex-steps from `origin`, projects it back onto
  // the boundary of that range instead - so a target that goes out of bounds "slides" along the
  // edge of the allowed area rather than becoming unreachable.
  clampToDistance(
    origin: { q: number; r: number; s: number },
    target: { q: number; r: number; s: number },
    maxDistance: number
  ): { q: number; r: number; s: number } {
    const dq = target.q - origin.q;
    const dr = target.r - origin.r;
    const ds = target.s - origin.s;
    const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
    if (distance <= maxDistance || distance === 0) {
      return target;
    }
    const scale = maxDistance / distance;
    return this.cubeRound(origin.q + dq * scale, origin.r + dr * scale, origin.s + ds * scale);
  }

  // Calculate bounding box and adjust map dimensions
  adjustMapBounds(hexes: Hex[], size: number): { width: number; height: number } {
    if (hexes.length === 0) {
      return { width: 290, height: 490 };
    }

    const pad = size + 10;
    const xs = hexes.map(h => h.cx);
    const ys = hexes.map(h => h.cy);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;

    const width = Math.max(290, Math.ceil(maxX - Math.min(0, minX)));
    const height = Math.max(490, Math.ceil(maxY - Math.min(0, minY)));

    return { width, height };
  }

  /**
   * Remove hexes that are empty and not neighbors of any assigned hex. The starting island
   * (the initial 7 hexes) is only preserved while the map has no quests on it at all, so
   * there's always something to click on a fresh map; once a first quest is placed anywhere,
   * it's pruned like any other empty hex. If pruning brings the map back to zero quests (e.g.
   * the only quest on the map gets removed), the starting island is restored so the map never
   * ends up with nothing left to click.
   */
  removeOrphanedDynamicHexes(hexes: Hex[], size: number): { removedCount: number; islandRestored: boolean } {
    const assignedHexes = hexes.filter(h => h.quest);

    if (assignedHexes.length === 0) {
      const seedCoords = this.seedCoordinates();
      // Whether the map is already exactly the starting island - if so, there's nothing to
      // restore (avoids signalling a restore, e.g. an unwanted camera reset, on every call
      // while the map is simply sitting empty rather than just having become empty).
      const alreadyJustSeedIsland =
        hexes.length === seedCoords.length &&
        hexes.every(h => seedCoords.some(c => c.q === h.q && c.r === h.r && c.s === h.s));

      // Reset to exactly the starting island: drop every other leftover hex (e.g. the ring
      // that was protecting whatever hex just lost its last quest) so it doesn't sit there as
      // a second, merged empty cluster next to the restored seed island.
      hexes.length = 0;
      for (const { q, r, s } of seedCoords) {
        this.addHex(hexes, q, r, s, size).isInitial = true;
      }
      return { removedCount: 0, islandRestored: !alreadyJustSeedIsland };
    }

    // Build set of all neighbors of assigned hexes
    const protectedCoords = new Set<string>();
    for (const hex of assignedHexes) {
      // The assigned hex itself
      protectedCoords.add(`${hex.q},${hex.r},${hex.s}`);
      // All neighbors
      for (const dir of this.directions) {
        const nq = hex.q + dir.q;
        const nr = hex.r + dir.r;
        const ns = hex.s + dir.s;
        protectedCoords.add(`${nq},${nr},${ns}`);
      }
    }

    // Count before cleanup
    const initialLength = hexes.length;

    // Remove hexes that are not protected
    const toKeep = hexes.filter(h => {
      // Keep if has quest
      if (h.quest) return true;
      // Keep if neighbor of assigned hex
      const coord = `${h.q},${h.r},${h.s}`;
      return protectedCoords.has(coord);
    });

    // Update array in place
    hexes.length = 0;
    hexes.push(...toKeep);

    return { removedCount: initialLength - hexes.length, islandRestored: false };
  }
}

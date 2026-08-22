import { Injectable } from '@angular/core';
import { Hex } from '../models/hex.model';

@Injectable({ providedIn: 'root' })
export class MapGridService {
  // Stable origin for coordinate calculations - overwritten with the actual centered position by
  // generateHexes; these defaults just match the initial MAP_WIDTH/MAP_HEIGHT (290/490) in case
  // anything reads them before generateHexes runs.
  private originX = 145;
  private originY = 245;

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
  generateHexes(size: number, mapWidth: number, mapHeight: number): Hex[] {
    // Center the origin hex in the initial viewBox on both axes - originX previously stayed at a
    // hardcoded 45 regardless of mapWidth, while originY was correctly centered here, leaving the
    // origin only 45 units from the left edge but 245 from the right (mapWidth=290). That meant
    // dragging left ran out of room - triggering grid-growth's viewBox resize/rescale - far
    // sooner than dragging right, right, up, or down, which showed up as auto-dezoom kicking in
    // inconsistently depending on drag direction.
    this.originX = mapWidth / 2;
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

  // Aggregate per-axis [min,max] bounds used by clampToDistanceOfAll: hex-distance disks are
  // equivalent to axis-aligned bounding boxes in cube coordinates (distance = max(|dq|,|dr|,|ds|)
  // for any two hexes, since q+r+s is always 0), so the intersection of several "distance <=
  // maxDistance" disks is just the intersection of their per-axis intervals.
  private computeSpreadBounds(
    centers: { q: number; r: number; s: number }[],
    maxDistance: number
  ): { qMin: number; qMax: number; rMin: number; rMax: number; sMin: number; sMax: number } | null {
    if (centers.length === 0) return null;

    let qMin = -Infinity,
      qMax = Infinity;
    let rMin = -Infinity,
      rMax = Infinity;
    let sMin = -Infinity,
      sMax = Infinity;
    for (const c of centers) {
      qMin = Math.max(qMin, c.q - maxDistance);
      qMax = Math.min(qMax, c.q + maxDistance);
      rMin = Math.max(rMin, c.r - maxDistance);
      rMax = Math.min(rMax, c.r + maxDistance);
      sMin = Math.max(sMin, c.s - maxDistance);
      sMax = Math.min(sMax, c.s + maxDistance);
    }
    return { qMin, qMax, rMin, rMax, sMin, sMax };
  }

  // Clamps `target` to lie within the intersection of several "distance <= maxDistance" disks,
  // each centered on a different point - computed directly here rather than by iteratively
  // clamping toward whichever constraint is currently worst, which isn't guaranteed to converge
  // to the same answer for two very close starting points and could make the boundary jump
  // around inconsistently as the cursor moves smoothly across it.
  clampToDistanceOfAll(
    target: { q: number; r: number; s: number },
    centers: { q: number; r: number; s: number }[],
    maxDistance: number
  ): { q: number; r: number; s: number } {
    const bounds = this.computeSpreadBounds(centers, maxDistance);
    if (!bounds) return target;
    const { qMin, qMax, rMin, rMax, sMin, sMax } = bounds;

    // Project target onto {q+r+s=0} intersected with the box [qMin,qMax]x[rMin,rMax]x[sMin,sMax],
    // via iterative even redistribution (a standard technique for projecting onto a box cut by a
    // hyperplane): clamp whichever axes are still "free" (not yet pinned to a bound), then spread
    // whatever sum-to-zero deficit that leaves across the still-free axes equally, and repeat.
    // Each pass either finishes or permanently pins at least one more axis, so this always
    // converges within 3 passes for 3 axes.
    //
    // An earlier version picked a single axis to re-derive from the other two, using clamp error
    // as a tie-break. That is discontinuous: as the cursor crosses the line where two axes' clamp
    // errors are equal, the chosen axis flips abruptly, producing a visible jump - reported as the
    // dragged hex "teleporting" past a fixed point along a straight drag path. Spreading the
    // deficit evenly instead of picking a single axis has no such tie to flip on.
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

  // How far (in hex-local units) the current hex set extends past the viewBox's fixed x=0/y=0
  // origin - i.e. how much of adjustMapBounds' computed width/height is "to the left/above"
  // that origin. The viewBox itself never moves, so whenever this changes, the camera's pan
  // needs to shift by the same amount to keep on-screen content in the same place - otherwise a
  // resize (e.g. the map growing during a drag) can silently push content outside the fixed
  // [0,width]x[0,height] rectangle, where it gets clipped instead of just rescaled.
  computeOverflow(hexes: Hex[], size: number): { left: number; top: number } {
    if (hexes.length === 0) {
      return { left: 0, top: 0 };
    }
    const pad = size + 10;
    const minX = Math.min(...hexes.map(h => h.cx)) - pad;
    const minY = Math.min(...hexes.map(h => h.cy)) - pad;
    return { left: Math.max(0, -minX), top: Math.max(0, -minY) };
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

import { Injectable } from '@angular/core';
import { Hex } from '../models/hex.model';

@Injectable({ providedIn: 'root' })
export class MapGridService {
  // Stable origin for coordinate calculations
  private originX = 45;
  private originY = 245; // Default centered position

  // Cache for hexes to persist across navigation
  private cachedHexes: Hex[] | null = null;
  private cachedMapWidth: number | null = null;
  private cachedMapHeight: number | null = null;

  // Six directions for neighbor calculation (axial coordinates)
  private readonly directions = [
    { q: 1, r: 0, s: -1 },
    { q: 1, r: -1, s: 0 },
    { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 },
    { q: -1, r: 1, s: 0 },
    { q: 0, r: 1, s: -1 },
  ];

  // Initialize the service with a stable origin
  setOrigin(originX: number, originY: number): void {
    this.originX = originX;
    this.originY = originY;
  }

  // Get cached hexes if available
  getCachedHexes(): Hex[] | null {
    return this.cachedHexes;
  }

  // Get cached map dimensions
  getCachedMapDimensions(): { width: number; height: number } | null {
    if (this.cachedMapWidth !== null && this.cachedMapHeight !== null) {
      return { width: this.cachedMapWidth, height: this.cachedMapHeight };
    }
    return null;
  }

  // Cache the hexes and map dimensions
  cacheHexes(hexes: Hex[], mapWidth: number, mapHeight: number): void {
    this.cachedHexes = hexes;
    this.cachedMapWidth = mapWidth;
    this.cachedMapHeight = mapHeight;
  }

  // Clear the cache
  clearCache(): void {
    this.cachedHexes = null;
    this.cachedMapWidth = null;
    this.cachedMapHeight = null;
  }

  // Create the axial hexes by outward rings from 0..maxExpansion
  generateHexes(maxExpansion: number, size: number, mapHeight: number): Hex[] {
    // Set stable origin based on initial mapHeight
    this.originY = mapHeight / 2;
    const hexes: Hex[] = [];

    // Generate 7 hexes: 1 center (level 0) + 6 neighbors (level 1)
    const initialMaxLevel = 1;

    for (let level = 0; level <= initialMaxLevel; level++) {
      for (let q = -level; q <= level; q++) {
        for (let r = Math.max(-level, -level - q); r <= Math.min(level, level - q); r++) {
          const s = -q - r;
          const maxAbs = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
          if (maxAbs === level) {
            const { cx, cy } = this.hexToPixel(q, r, size);
            hexes.push({ q, r, s, cx, cy, level, isInitial: true }); // Mark as initial
          }
        }
      }
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
   * Remove orphaned dynamic hexes that:
   * - Are empty (no quest)
   * - Were dynamically added (isInitial = false)
   * - Are not neighbors of any assigned hex
   * Note: Initial 7 hexes are always preserved
   */
  removeOrphanedDynamicHexes(hexes: Hex[]): number {
    // Find all hexes with quests
    const assignedHexes = hexes.filter(h => h.quest);

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

    // Remove dynamic hexes that are not protected
    const toKeep = hexes.filter(h => {
      // Keep if initial
      if (h.isInitial) return true;
      // Keep if has quest
      if (h.quest) return true;
      // Keep if neighbor of assigned hex
      const coord = `${h.q},${h.r},${h.s}`;
      return protectedCoords.has(coord);
    });

    // Update array in place
    hexes.length = 0;
    hexes.push(...toKeep);

    return initialLength - hexes.length; // Number removed
  }
}

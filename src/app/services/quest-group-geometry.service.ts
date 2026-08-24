import { inject, Injectable } from '@angular/core';
import { Hex } from '../models/hex.model';
import { MapGridService } from './map-grid.service';

export interface AxialCoord {
  q: number;
  r: number;
  s: number;
}

// A raw occupied-cell record shape (e.g. HexAssignment) - every entry passed to the
// floodFillOccupiedCluster assignment-array overload is, by construction, an occupied cell (there's
// no "empty assignment" row), unlike Hex[] where hex.quest may or may not be set.
export type OccupiedCoord = AxialCoord & { questId: string };

interface Point {
  x: number;
  y: number;
}

// Builds group geometry off the map's own hex grid: the flood-fill that seeds a new group from a
// clicked quest's contiguous cluster, and the SVG path tracing a group's outer boundary.
@Injectable({ providedIn: 'root' })
export class QuestGroupGeometryService {
  private readonly _mapGrid = inject(MapGridService);

  // Same 6 axial directions/ordering as MapGridService's own (private) direction list - needed
  // here too so getGroupBoundaryPath can map a direction index to the matching hex edge below.
  private readonly directions: AxialCoord[] = [
    { q: 1, r: 0, s: -1 },
    { q: 1, r: -1, s: 0 },
    { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 },
    { q: -1, r: 1, s: 0 },
    { q: 0, r: 1, s: -1 },
  ];

  // BFS from `seed` through only occupied cells, using MapGridService.neighborsOf for the 6
  // candidate directions each step. Returns the full transitive cluster (not just immediate
  // neighbors), or [] if `seed` itself isn't occupied in `hexes`. A hex whose quest already
  // belongs to a group is treated the same as an empty one (a wall the BFS stops at, never a
  // member) - self-contained here since Hex.quest carries its own questGroupId.
  floodFillOccupiedCluster(seed: AxialCoord, hexes: Hex[]): Hex[];
  // Same BFS operating on raw {q,r,s,questId}-shaped records (e.g. HexAssignment[]) instead of
  // Hex[] - for callers with no access to MapComponent.hexes, e.g. the quest-details modal. These
  // records carry no group info of their own, so the caller passes it in explicitly: any questId
  // in `groupedQuestIds` is treated as already-grouped and excluded the same way. Without this, a
  // new group's flood-fill could reach back into an existing neighboring group and silently steal
  // its members (see QuestGroupService.CreateQuestGroupAsync on the backend for the matching
  // server-side backstop).
  floodFillOccupiedCluster<T extends OccupiedCoord>(seed: AxialCoord, items: T[], groupedQuestIds?: ReadonlySet<string>): T[];
  floodFillOccupiedCluster(
    seed: AxialCoord,
    items: (Hex | OccupiedCoord)[],
    groupedQuestIds?: ReadonlySet<string>
  ): (Hex | OccupiedCoord)[] {
    if (items.length === 0) return [];
    const isHexes = this.isHexArray(items);

    // O(1) lookup by coordinate, built once up front. Empty hexes are excluded here even though
    // they're present in `items` - they're never cluster members, just BFS stop points. Same
    // treatment for anything already in a group.
    const byKey = new Map<string, Hex | OccupiedCoord>();
    for (const item of items) {
      if (isHexes) {
        const hex = item as Hex;
        if (!hex.quest || hex.quest.questGroupId) continue;
      } else if (groupedQuestIds?.has((item as OccupiedCoord).questId)) {
        continue;
      }
      byKey.set(this.key(item), item);
    }

    const seedKey = this.key(seed);
    const seedItem = byKey.get(seedKey);
    if (!seedItem) return [];

    const visited = new Set<string>([seedKey]);
    const cluster: (Hex | OccupiedCoord)[] = [seedItem];
    const queue: AxialCoord[] = [seed];

    while (queue.length) {
      const current = queue.shift()!;
      // `size` only affects the pixel cx/cy this also computes, which we don't use here - any
      // value works for the q/r/s direction math.
      for (const n of this._mapGrid.neighborsOf(current, 1)) {
        const nKey = this.key(n);
        if (visited.has(nKey)) continue;
        visited.add(nKey);
        const neighborItem = byKey.get(nKey);
        if (neighborItem) {
          cluster.push(neighborItem);
          queue.push(n);
        }
      }
    }

    return cluster;
  }

  // Traces the outer boundary of `members` as an SVG path `d` string - one `M...Z` subpath per
  // disjoint/enclosed-hole-free outer loop. For each member hex, for each of the 6 directions, the
  // edge facing a non-member (or nonexistent) neighbor is kept; the shared edge between two
  // members is dropped from both sides. Kept edges are then stitched into closed loops by matching
  // endpoints, and any loop spatially nested inside another (a fully-enclosed non-member hex,
  // i.e. a hole) is discarded.
  getGroupBoundaryPath(members: Hex[], size: number): string {
    if (members.length === 0) return '';
    const memberKeys = new Set(members.map(m => this.key(m)));

    const segments: [Point, Point][] = [];
    for (const hex of members) {
      for (let d = 0; d < 6; d++) {
        const dir = this.directions[d];
        const nKey = `${hex.q + dir.q},${hex.r + dir.r},${hex.s + dir.s}`;
        if (memberKeys.has(nKey)) continue; // interior edge, shared with another member - drop it

        // getHexPoints' vertex i sits at angle (60*i - 30)deg; direction index d's edge - the one
        // facing that neighbor - is the edge between vertex (6-d)%6 and the next one around. See
        // quest-group-geometry.service.spec.ts for the derivation this was checked against.
        const edgeIndex = (6 - d) % 6;
        const p1 = this.vertex(hex.cx, hex.cy, size, edgeIndex);
        const p2 = this.vertex(hex.cx, hex.cy, size, (edgeIndex + 1) % 6);
        segments.push([p1, p2]);
      }
    }

    const loops = this.stitchLoops(segments);
    const outerLoops = loops.filter(loop => !loops.some(other => other !== loop && this.isLoopInside(loop, other)));

    return outerLoops.map(loop => this.loopToPathD(loop)).join(' ');
  }

  private isHexArray(items: (Hex | OccupiedCoord)[]): items is Hex[] {
    const first = items[0] as Partial<Hex>;
    return typeof first.cx === 'number' && typeof first.cy === 'number';
  }

  private key(c: AxialCoord): string {
    return `${c.q},${c.r},${c.s}`;
  }

  private vertex(cx: number, cy: number, size: number, i: number): Point {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
  }

  // Quantizes a point to 3 decimal places for endpoint matching - avoids floating-point noise
  // (e.g. from trig) breaking a chain that's geometrically the same point.
  private quantize(p: Point): string {
    return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  }

  // Chains the kept boundary segments into closed loops by matching each segment's end point to
  // the next segment's start point. Each retained edge's endpoints are shared with exactly one
  // other retained edge (its neighbor along the same boundary), so this always resolves into
  // simple cycles - one per disjoint outer boundary or hole.
  private stitchLoops(segments: [Point, Point][]): Point[][] {
    const byStart = new Map<string, number[]>();
    segments.forEach((seg, i) => {
      const k = this.quantize(seg[0]);
      const arr = byStart.get(k) ?? [];
      arr.push(i);
      byStart.set(k, arr);
    });

    const used: boolean[] = new Array(segments.length).fill(false);
    const loops: Point[][] = [];

    for (let start = 0; start < segments.length; start++) {
      if (used[start]) continue;
      const loop: Point[] = [];
      const startKey = this.quantize(segments[start][0]);
      let idx: number | undefined = start;
      let safety = segments.length + 1;

      while (idx !== undefined && safety-- > 0) {
        used[idx] = true;
        const seg = segments[idx];
        loop.push(seg[0]);
        const endKey = this.quantize(seg[1]);
        if (endKey === startKey) break; // closed the loop

        const candidates = (byStart.get(endKey) ?? []).filter(i => !used[i]);
        idx = candidates[0];
      }

      if (loop.length >= 3) loops.push(loop);
    }

    return loops;
  }

  private isLoopInside(inner: Point[], outer: Point[]): boolean {
    return this.pointInPolygon(inner[0], outer);
  }

  // Standard ray-casting point-in-polygon test - sufficient for the simple "is this loop a hole
  // inside that one" check this is used for (nesting more than one level deep won't come up here).
  private pointInPolygon(p: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private loopToPathD(loop: Point[]): string {
    const [first, ...rest] = loop;
    return [`M ${first.x},${first.y}`, ...rest.map(p => `L ${p.x},${p.y}`), 'Z'].join(' ');
  }
}

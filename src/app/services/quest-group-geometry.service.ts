import { inject, Injectable } from '@angular/core';
import { Hex } from '../models/hex.model';
import { QuestGroupOutputDTO } from '../models/quest-group.model';
import { QuestUpdateDTO } from '../models/quest.model';
import { MapGridService } from './map-grid.service';

export interface AxialCoord {
  q: number;
  r: number;
  s: number;
}

// One rendered group outline: its boundary path, its title's placement, and what the title's own
// quick-actions box needs to sit correctly above it.
export interface GroupOutline {
  id: string;
  pathD: string;
  color: string;
  name: string;
  labelX: number;
  labelY: number;
  nameLines: { text: string; y: number }[];
  actionsY: number;
  titleBox: { x: number; y: number; width: number; height: number };
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

  // One outline + label per group that has at least one currently-visible member (a member hidden
  // by a map filter - see isMemberVisible - contributes to neither the boundary nor the label
  // placement, so a partially-filtered group's outline shrinks to just what's actually shown, and
  // a group left with nothing visible gets no outline at all). Membership is read fresh from each
  // quest's own `questGroupId` (`quests`) rather than from either the group entity's own cached
  // `questIds` or each hex's `quest.questGroupId` directly, since both of those can lag behind a
  // just-applied membership change by a tick.
  computeGroupOutlines(groups: QuestGroupOutputDTO[], quests: QuestUpdateDTO[], hexes: Hex[], size: number, isMemberVisible: (hex: Hex) => boolean): GroupOutline[] {
    const groupIdByQuestId = new Map(quests.map(q => [q.id, q.questGroupId]));
    // Threaded through computeGroupLabel below so each group's title search also avoids whatever
    // space an earlier group in this same pass already claimed for its own title - without this,
    // two groups' titles could still overlap each other even though each individually avoided the
    // hex grid.
    const claimedTitleBoxes: { x: number; y: number; width: number; height: number }[] = [];
    return groups
      .map(group => {
        const members = hexes.filter(h => h.quest?.id && groupIdByQuestId.get(h.quest.id) === group.id);
        const visibleMembers = members.filter(isMemberVisible);
        if (visibleMembers.length === 0) return null;
        const pathD = this.getGroupBoundaryPath(visibleMembers, size);
        const { labelX, labelY, nameLines, titleBox } = this.computeGroupLabel(visibleMembers, group.name, claimedTitleBoxes, hexes, size);
        // Quick-actions box sits a fixed gap above the topmost rendered line (not just above
        // labelY), so it clears a two-line name exactly as it did a one-line one.
        const actionsY = nameLines[0].y - size * 0.9;
        return { id: group.id, pathD, color: group.color, name: group.name, labelX, labelY, nameLines, actionsY, titleBox };
      })
      .filter((g): g is GroupOutline => g !== null);
  }

  // Splits a group name onto two lines once it's long enough to risk overrunning its neighbors,
  // breaking at whichever space falls closest to the middle (a hard mid-string split if the name
  // has no space to break at) - capped at two lines regardless of length.
  private wrapGroupName(name: string): string[] {
    const MAX_SINGLE_LINE = 12;
    if (name.length <= MAX_SINGLE_LINE) return [name];

    const mid = Math.floor(name.length / 2);
    let splitIndex = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < name.length; i++) {
      if (name[i] === ' ') {
        const distance = Math.abs(i - mid);
        if (distance < bestDistance) {
          bestDistance = distance;
          splitIndex = i;
        }
      }
    }
    return splitIndex === -1 ? [name.slice(0, mid), name.slice(mid)] : [name.slice(0, splitIndex).trim(), name.slice(splitIndex + 1).trim()];
  }

  // Size of the (possibly 2-line) title box, from a rough average glyph width for the label's 9px
  // bold font (exact measurement would need a post-render getBBox() pass; this is close enough
  // for both the click target and the overlap search below, not for pixel-perfect fit) and the
  // line count. Independent of where the box actually ends up - computeGroupLabel below positions
  // it once a clear spot is found.
  private measureTitleBox(lines: string[]): { width: number; height: number } {
    const FONT_SIZE = 9;
    const CHAR_WIDTH = FONT_SIZE * 0.62;
    const PAD_X = 6;
    const PAD_Y = 4;
    const LINE_HEIGHT = 11;

    const maxChars = Math.max(...lines.map(l => l.length));
    const width = maxChars * CHAR_WIDTH + PAD_X * 2;
    const height = (lines.length - 1) * LINE_HEIGHT + FONT_SIZE + PAD_Y * 2;
    return { width, height };
  }

  private rectsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  // Places a group's title (and sizes its click-target box - see measureTitleBox) somewhere that
  // doesn't visually collide with anything: a hex cell (the box is drawn with no fill of its own,
  // so a hex sitting behind it - occupied or not - would show right through), or another group's
  // already-placed title in this same recompute pass (see claimedTitleBoxes/computeGroupOutlines).
  //
  // Right after a group is created every hex just above it is guaranteed empty (flood-fill already
  // swept up any occupied neighbor), but a later whole-group drag can validly land the group flush
  // against an unrelated quest (dragging a group never auto-merges it with whatever it lands next
  // to), and a long enough name's box can span past whichever single hex it's centered on
  // regardless - so "just above" can no longer be assumed clear by construction alone, checked
  // fully instead. Every member's two upward neighbors (NE/NW - this grid has no straight-up
  // neighbor) are tried first, nearest-and-most-central first; if none is clear, the search
  // escalates straight up in increasing steps. This always terminates: `hexes` only covers the
  // map's fixed generated extent, so going up far enough eventually exits it into guaranteed
  // hex-free canvas - sitting outside the map's own boundaries isn't a special case, just where
  // this search naturally ends up once nothing closer works.
  private computeGroupLabel(
    members: Hex[],
    name: string,
    claimedTitleBoxes: { x: number; y: number; width: number; height: number }[],
    hexes: Hex[],
    size: number
  ): { labelX: number; labelY: number; nameLines: { text: string; y: number }[]; titleBox: { x: number; y: number; width: number; height: number } } {
    const LINE_HEIGHT = 11;
    const lines = this.wrapGroupName(name);
    const { width, height } = this.measureTitleBox(lines);

    const place = (labelX: number, labelY: number) => {
      const nameLines = lines.map((text, i) => ({ text, y: labelY + (i - (lines.length - 1) / 2) * LINE_HEIGHT }));
      const titleBox = { x: labelX - width / 2, y: labelY - height / 2, width, height };
      return { labelX, labelY, nameLines, titleBox };
    };

    const overlapsClaimed = (titleBox: { x: number; y: number; width: number; height: number }): boolean =>
      claimedTitleBoxes.some(box => this.rectsOverlap(titleBox, box));

    const halfWidth = (size * Math.sqrt(3)) / 2;
    const hexWidth = halfWidth * 2;
    // How many extra hexes to each side of a candidate's own anchor the title's actual width
    // reaches, so a long name is checked against every hex it would visually span, not just the
    // single hex its anchor happens to sit on.
    const spanRadius = Math.max(0, Math.round((width / hexWidth - 1) / 2));

    // Resolves a candidate pixel position to its nearest grid coordinate (MapGridService's own
    // inverse of hexToPixel) and checks that hex and the `spanRadius` ones beside it for occupancy
    // - grid coordinates rather than a rectangle-vs-rectangle test, because adjacent hexes' bounding
    // rectangles overlap each other near their points even though the actual hexagon shapes don't,
    // which would otherwise flag a genuinely clear spot as blocked just because it touches an
    // occupied neighbor's rectangle.
    //
    // If clear, only the Y half of the final placement snaps to that row's own exact center
    // (hexToPixel again) - the escalation search below steps in fixed pixel increments that don't
    // line up with the grid's actual row spacing, so without this the title's vertical gap above
    // whatever hex is below it could end up inconsistent/cramped. X is deliberately left as the
    // candidate's own (not also snapped to that same hex's center): snapping X too would pull the
    // title sideways to align with whichever hex the vertical search happened to land near, instead
    // of keeping it above the group itself - dx already defaults to 0 (directly above the group's
    // own centroid) and only shifts sideways via the ring search below when something is actually
    // in the way, so leaving X alone here keeps that "stay above the group unless blocked" behavior
    // intact.
    const tryCandidate = (cx: number, cy: number): ReturnType<typeof place> | null => {
      const { q, r } = this._mapGrid.pixelToAxial(cx, cy, size);
      for (let dq = -spanRadius; dq <= spanRadius; dq++) {
        const hex = hexes.find(h => h.q === q + dq && h.r === r && h.s === -(q + dq) - r);
        if (hex?.quest) return null;
      }
      const rowCy = this._mapGrid.hexToPixel(q, r, size).cy;
      const result = place(cx, rowCy);
      return overlapsClaimed(result.titleBox) ? null : result;
    };

    const centroidX = members.reduce((sum, m) => sum + m.cx, 0) / members.length;
    const candidates = members
      .flatMap(m => [
        { cx: m.cx - halfWidth, cy: m.cy - size * 1.5 }, // NW
        { cx: m.cx + halfWidth, cy: m.cy - size * 1.5 }, // NE
      ])
      .sort((a, b) => a.cy - b.cy || Math.abs(a.cx - centroidX) - Math.abs(b.cx - centroidX));

    for (const c of candidates) {
      const result = tryCandidate(c.cx, c.cy);
      if (result) {
        claimedTitleBoxes.push(result.titleBox);
        return result;
      }
    }

    // No spot immediately above the group works - widen the search outward in a 2D neighborhood
    // (both sideways and further up) rather than only ever climbing straight up above the group's
    // own centroid: a purely-vertical escalation can walk right past clear space just to the side
    // (e.g. blocked by an unrelated group's own title directly above, with open space beside it)
    // and end up needlessly far from the group. Candidates are generated in a widening diamond and
    // tried nearest-first (actual pixel distance), so whichever direction - up, or to either side -
    // actually has the closest clear spot wins.
    const minCy = Math.min(...members.map(m => m.cy));
    const baseCy = minCy - size * 3;
    const HORIZONTAL_STEP = width * 0.6;
    const VERTICAL_STEP = size * 1.2;
    const RING_COUNT = 20;

    const escalationCandidates: { cx: number; cy: number; dist: number }[] = [];
    for (let ring = 1; ring <= RING_COUNT; ring++) {
      for (let sx = -ring; sx <= ring; sx++) {
        const dx = sx * HORIZONTAL_STEP;
        const dy = ring * VERTICAL_STEP;
        escalationCandidates.push({ cx: centroidX + dx, cy: baseCy - dy, dist: Math.hypot(dx, dy) });
      }
    }
    escalationCandidates.sort((a, b) => a.dist - b.dist);

    for (const cand of escalationCandidates) {
      const result = tryCandidate(cand.cx, cand.cy);
      if (result) {
        claimedTitleBoxes.push(result.titleBox);
        return result;
      }
    }

    // Give up searching (guarantees termination) - by this point the candidate is far above and
    // beyond the group, comfortably past the fixed grid's own extent in any realistically-sized map.
    const result = place(centroidX, minCy - size * 40);
    claimedTitleBoxes.push(result.titleBox);
    return result;
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

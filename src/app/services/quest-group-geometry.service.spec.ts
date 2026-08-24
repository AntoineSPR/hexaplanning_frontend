import { TestBed } from '@angular/core/testing';
import { QuestGroupGeometryService } from './quest-group-geometry.service';
import { MapGridService } from './map-grid.service';
import { Hex } from '../models/hex.model';
import { QuestUpdateDTO } from '../models/quest.model';

const SIZE = 40;

function makeQuest(id: string, questGroupId?: string): QuestUpdateDTO {
  return {
    id,
    title: `Quest ${id}`,
    estimatedTime: 0,
    statusId: 'status',
    priorityId: 'priority',
    questGroupId,
  };
}

describe('QuestGroupGeometryService', () => {
  let service: QuestGroupGeometryService;
  let mapGrid: MapGridService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuestGroupGeometryService);
    mapGrid = TestBed.inject(MapGridService);
  });

  function makeHex(q: number, r: number, occupied = true, questGroupId?: string): Hex {
    const s = -q - r;
    const { cx, cy } = mapGrid.hexToPixel(q, r, SIZE);
    return {
      q,
      r,
      s,
      cx,
      cy,
      level: Math.max(Math.abs(q), Math.abs(r), Math.abs(s)),
      quest: occupied ? makeQuest(`${q}-${r}`, questGroupId) : undefined,
    };
  }

  // Extracts every point referenced by a `M...L...Z` path `d` string, rounded to avoid FP noise.
  function pointsInPath(d: string): { x: number; y: number }[] {
    const matches = d.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g) ?? [];
    return matches.map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
    });
  }

  function subpathCount(d: string): number {
    return d
      .split('Z')
      .map(s => s.trim())
      .filter(Boolean).length;
  }

  describe('floodFillOccupiedCluster', () => {
    it('returns just the seed when it has no occupied neighbors (Hex[] overload)', () => {
      const hexes = [makeHex(0, 0), makeHex(1, 0, false)];
      const cluster = service.floodFillOccupiedCluster(hexes[0], hexes);
      expect(cluster).toEqual([hexes[0]]);
    });

    it('flood-fills the full transitive cluster of occupied hexes, not just immediate neighbors', () => {
      // A line of 3 occupied hexes at r=0 (q=0,1,2), plus a disconnected occupied hex at q=5.
      const hexes = [makeHex(0, 0), makeHex(1, 0), makeHex(2, 0), makeHex(5, 0)];
      const cluster = service.floodFillOccupiedCluster(hexes[0], hexes);
      expect(cluster.length).toBe(3);
      expect(cluster.map(h => h.q).sort()).toEqual([0, 1, 2]);
    });

    it('does not flood across an empty hex', () => {
      const hexes = [makeHex(0, 0), makeHex(1, 0, false), makeHex(2, 0)];
      const cluster = service.floodFillOccupiedCluster(hexes[0], hexes);
      expect(cluster).toEqual([hexes[0]]);
    });

    it('returns [] when the seed itself is not occupied', () => {
      const hexes = [makeHex(0, 0, false)];
      const cluster = service.floodFillOccupiedCluster(hexes[0], hexes);
      expect(cluster).toEqual([]);
    });

    it('works on raw {q,r,s,questId}-shaped assignment records (non-Hex overload)', () => {
      const items = [
        { q: 0, r: 0, s: 0, questId: 'a' },
        { q: 1, r: 0, s: -1, questId: 'b' },
        { q: 5, r: 0, s: -5, questId: 'c' },
      ];
      const cluster = service.floodFillOccupiedCluster({ q: 0, r: 0, s: 0 }, items);
      expect(cluster.length).toBe(2);
      expect(cluster.map(i => i.questId).sort()).toEqual(['a', 'b']);
    });

    it('does not cross into a hex whose quest already belongs to a different group (Hex[] overload)', () => {
      const hexes = [makeHex(0, 0), makeHex(1, 0, true, 'existing-group'), makeHex(2, 0)];
      const cluster = service.floodFillOccupiedCluster(hexes[0], hexes);
      // hex (1,0) is already grouped, so it's treated as a wall - hex (2,0) beyond it is never
      // reached even though it isn't grouped itself.
      expect(cluster).toEqual([hexes[0]]);
    });

    it('does not cross into an already-grouped quest on the assignment overload when excluded', () => {
      const items = [
        { q: 0, r: 0, s: 0, questId: 'a' },
        { q: 1, r: 0, s: -1, questId: 'b' },
        { q: 2, r: 0, s: -2, questId: 'c' },
      ];
      const cluster = service.floodFillOccupiedCluster({ q: 0, r: 0, s: 0 }, items, new Set(['b']));
      expect(cluster.map(i => i.questId)).toEqual(['a']);
    });
  });

  describe('getGroupBoundaryPath', () => {
    it('traces a regular hexagon (6 points) for a single hex', () => {
      const hex = makeHex(0, 0);
      const d = service.getGroupBoundaryPath([hex], SIZE);
      expect(subpathCount(d)).toBe(1);
      const pts = pointsInPath(d);
      expect(pts.length).toBe(6);
      pts.forEach(p => {
        const dist = Math.hypot(p.x - hex.cx, p.y - hex.cy);
        expect(dist).toBeCloseTo(SIZE, 2);
      });
    });

    it('traces a 10-point stadium outline for two adjacent hexes (shared edge dropped from both)', () => {
      const a = makeHex(0, 0);
      const b = makeHex(1, 0);
      const d = service.getGroupBoundaryPath([a, b], SIZE);
      expect(subpathCount(d)).toBe(1);
      const pts = pointsInPath(d);
      expect(pts.length).toBe(10);
    });

    it('discards the inner hole for a ring of 6 hexes around one empty center hex', () => {
      const center = { q: 0, r: 0, s: 0 };
      const ring = mapGrid.neighborsOf(center, SIZE).map(n => makeHex(n.q, n.r));
      const d = service.getGroupBoundaryPath(ring, SIZE);
      // Only the outer boundary should survive - the loop around the empty center hex (a hole)
      // must be discarded, leaving a single subpath.
      expect(subpathCount(d)).toBe(1);
    });

    it('returns an empty string for an empty member list', () => {
      expect(service.getGroupBoundaryPath([], SIZE)).toBe('');
    });
  });
});

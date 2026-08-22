import { inject, Injectable } from '@angular/core';
import { HexService } from './hex.service';
import { QuestService } from './quest.service';
import { MapGridService } from './map-grid.service';
import { Hex } from '../models/hex.model';
import { Observable, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { QuestUpdateDTO } from '../models/quest.model';
import { HexAssignment } from '../models/hexAssignment.model';
import { ConnectivityService } from './connectivity.service';

interface ResolvedAssignment {
  q: number;
  r: number;
  s: number;
  quest: QuestUpdateDTO;
  hexAssignmentId: string | undefined;
}

@Injectable({ providedIn: 'root' })
export class QuestAssignmentService {
  private readonly _hexService = inject(HexService);
  private readonly _questService = inject(QuestService);
  private readonly _mapGrid = inject(MapGridService);
  private readonly _connectivity = inject(ConnectivityService);

  // Callback to notify map component of bounds changes
  private onBoundsChange?: (bounds: { width: number; height: number }) => void;

  // Snapshot of the last successfully resolved assignments, so a load triggered while offline
  // (e.g. navigating back to the map, or a full page reload) can still show the map read-only
  // instead of coming up empty just because the backend can't be reached. Persisted to
  // localStorage (not just kept in memory) since a reload wipes the service instance too.
  private _lastResolvedAssignments: ResolvedAssignment[] | null = null;
  private readonly _STORAGE_KEY = 'hexaplanning.hexAssignments.v1';

  private _saveResolvedAssignments(resolved: ResolvedAssignment[]): void {
    this._lastResolvedAssignments = resolved;
    try {
      localStorage.setItem(this._STORAGE_KEY, JSON.stringify(resolved));
    } catch {}
  }

  private _getResolvedAssignments(): ResolvedAssignment[] | null {
    if (this._lastResolvedAssignments) return this._lastResolvedAssignments;
    try {
      const raw = localStorage.getItem(this._STORAGE_KEY);
      if (!raw) return null;
      this._lastResolvedAssignments = JSON.parse(raw) as ResolvedAssignment[];
      return this._lastResolvedAssignments;
    } catch {
      return null;
    }
  }

  setOnBoundsChange(callback: (bounds: { width: number; height: number }) => void): void {
    this.onBoundsChange = callback;
  }

  loadAssignmentsIntoHexes(hexes: Hex[], size: number): Observable<void> {
    const cached = this._connectivity.isOffline() ? this._getResolvedAssignments() : null;
    if (cached) {
      for (const a of cached) {
        let hex = hexes.find(h => h.q === a.q && h.r === a.r && h.s === a.s);
        if (!hex) {
          hex = this._mapGrid.addHex(hexes, a.q, a.r, a.s, size);
        }
        hex.quest = a.quest;
        hex.hexAssignmentId = a.hexAssignmentId;
        this._mapGrid.ensureNeighborsOf(hexes, hex, size);
      }
      if (cached.length) {
        const bounds = this._mapGrid.adjustMapBounds(hexes, size);
        if (this.onBoundsChange) {
          this.onBoundsChange(bounds);
        }
      }
      return of(void 0);
    }

    return this._hexService.getAllAssignments().pipe(
      switchMap(assignments => {
        const tasks: Observable<QuestUpdateDTO>[] = [];
        const resolved: ResolvedAssignment[] = [];
        for (const a of assignments) {
          // Ensure a hex exists at the assignment coordinates; create if missing
          let hex = hexes.find(h => h.q === a.q && h.r === a.r && h.s === a.s);
          if (!hex) {
            hex = this._mapGrid.addHex(hexes, a.q, a.r, a.s, size);
          }

          tasks.push(
            this._questService.getQuestById(a.questId).pipe(
              tap(q => {
                hex!.quest = q;
                hex!.hexAssignmentId = a.id;
                resolved.push({ q: a.q, r: a.r, s: a.s, quest: q, hexAssignmentId: a.id });
                // Expand around assigned hexes on load to ensure edges are filled
                this._mapGrid.ensureNeighborsOf(hexes, hex!, size);
              })
            )
          );
        }

        if (tasks.length) {
          return forkJoin(tasks).pipe(
            map(() => {
              this._saveResolvedAssignments(resolved);
              // After loading all assignments, adjust bounds
              const bounds = this._mapGrid.adjustMapBounds(hexes, size);
              if (this.onBoundsChange) {
                this.onBoundsChange(bounds);
              }
              return void 0;
            })
          );
        }
        this._saveResolvedAssignments([]);
        return of(void 0);
      })
    );
  }

  getAssignmentForHex(q: number, r: number, s: number) {
    return this._hexService.getAssignmentByCoordinates(q, r, s);
  }

  assignQuestToHex(selectedHex: Hex, selectedQuest: QuestUpdateDTO, hexes: Hex[], size: number): Observable<void> {
    const hexAssignment = {
      q: selectedHex.q,
      r: selectedHex.r,
      s: selectedHex.s,
      questId: selectedQuest.id,
    } as any;

    return this._hexService.saveAssignment(hexAssignment).pipe(
      tap(created => {
        selectedHex.quest = selectedQuest;
        selectedHex.hexAssignmentId = created.id;
        this._questService.getAllUnassignedPendingQuests().subscribe();

        // Expand the map by adding neighbors around the assigned hex
        this._mapGrid.ensureNeighborsOf(hexes, selectedHex, size);

        // Recalculate and notify map bounds
        const bounds = this._mapGrid.adjustMapBounds(hexes, size);
        if (this.onBoundsChange) {
          this.onBoundsChange(bounds);
        }
      }),
      map(() => void 0)
    );
  }

  deleteQuestFromHex(hex: Hex, hexes: Hex[], size: number): Observable<void> {
    if (!hex.quest) {
      return new Observable<void>(subscriber => {
        subscriber.next();
        subscriber.complete();
      });
    }
    const questToUpdate = { ...hex.quest } as QuestUpdateDTO;
    return this._hexService.deleteAssignment(hex.q, hex.r, hex.s).pipe(
      switchMap(() => this._questService.updateQuest(questToUpdate)),
      tap(() => {
        hex.quest = undefined;
        hex.hexAssignmentId = undefined;
        this._questService.getAllUnassignedPendingQuests().subscribe();

        // Clean up orphaned dynamic hexes
        const removed = this._mapGrid.removeOrphanedDynamicHexes(hexes);
        console.log(`Removed ${removed} orphaned dynamic hexes`);

        // Recalculate and notify map bounds
        const bounds = this._mapGrid.adjustMapBounds(hexes, size);
        if (this.onBoundsChange) {
          this.onBoundsChange(bounds);
        }
      }),
      map(() => void 0)
    );
  }

  // Move a quest already on the map to another hex. If the target hex is occupied,
  // the two quests swap positions instead. Uses PUT /hexAssignment (update in place)
  // rather than delete+recreate, so the quest never transiently disappears from the map.
  // Note: the backend has no active DB constraint on (q, r, s) uniqueness, so occupancy
  // is only checked client-side against the currently loaded hexes.
  moveQuestToHex(fromHex: Hex, toHex: Hex, hexes: Hex[], size: number): Observable<void> {
    if (!fromHex.quest || !fromHex.hexAssignmentId || fromHex === toHex) {
      return new Observable<void>(subscriber => {
        subscriber.next();
        subscriber.complete();
      });
    }

    if (!toHex.quest) {
      // Empty target: move the existing assignment to the new coordinates
      const updated: HexAssignment = {
        id: fromHex.hexAssignmentId,
        questId: fromHex.quest.id,
        q: toHex.q,
        r: toHex.r,
        s: toHex.s,
      };

      return this._hexService.updateAssignment(fromHex.hexAssignmentId, updated).pipe(
        tap(() => {
          toHex.quest = fromHex.quest;
          toHex.hexAssignmentId = fromHex.hexAssignmentId;
          fromHex.quest = undefined;
          fromHex.hexAssignmentId = undefined;

          this._mapGrid.ensureNeighborsOf(hexes, toHex, size);
          this._mapGrid.removeOrphanedDynamicHexes(hexes);

          const bounds = this._mapGrid.adjustMapBounds(hexes, size);
          if (this.onBoundsChange) {
            this.onBoundsChange(bounds);
          }
        }),
        map(() => void 0)
      );
    }

    // Occupied target: swap the two assignments' coordinates
    if (!toHex.hexAssignmentId) {
      return new Observable<void>(subscriber => {
        subscriber.next();
        subscriber.complete();
      });
    }

    const fromUpdated: HexAssignment = {
      id: fromHex.hexAssignmentId,
      questId: fromHex.quest.id,
      q: toHex.q,
      r: toHex.r,
      s: toHex.s,
    };
    const toUpdated: HexAssignment = {
      id: toHex.hexAssignmentId,
      questId: toHex.quest.id,
      q: fromHex.q,
      r: fromHex.r,
      s: fromHex.s,
    };

    return forkJoin([
      this._hexService.updateAssignment(fromHex.hexAssignmentId, fromUpdated),
      this._hexService.updateAssignment(toHex.hexAssignmentId, toUpdated),
    ]).pipe(
      tap(() => {
        const fromQuest = fromHex.quest;
        const fromAssignmentId = fromHex.hexAssignmentId;
        fromHex.quest = toHex.quest;
        fromHex.hexAssignmentId = toHex.hexAssignmentId;
        toHex.quest = fromQuest;
        toHex.hexAssignmentId = fromAssignmentId;
      }),
      map(() => void 0)
    );
  }
}

import { inject, Injectable } from '@angular/core';
import { HexService } from './hex.service';
import { QuestService } from './quest.service';
import { MapGridService } from './map-grid.service';
import { Hex } from '../models/hex.model';
import { Observable, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { QuestUpdateDTO } from '../models/quest.model';

@Injectable({ providedIn: 'root' })
export class QuestAssignmentService {
  private readonly _hexService = inject(HexService);
  private readonly _questService = inject(QuestService);
  private readonly _mapGrid = inject(MapGridService);

  // Callback to notify map component of bounds changes
  private onBoundsChange?: (bounds: { width: number; height: number }) => void;

  setOnBoundsChange(callback: (bounds: { width: number; height: number }) => void): void {
    this.onBoundsChange = callback;
  }

  loadAssignmentsIntoHexes(hexes: Hex[], size: number): Observable<void> {
    return this._hexService.getAllAssignments().pipe(
      switchMap(assignments => {
        const tasks: Observable<QuestUpdateDTO>[] = [];
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
                // Expand around assigned hexes on load to ensure edges are filled
                this._mapGrid.ensureNeighborsOf(hexes, hex!, size);
              })
            )
          );
        }

        if (tasks.length) {
          return forkJoin(tasks).pipe(
            map(() => {
              // After loading all assignments, adjust bounds
              const bounds = this._mapGrid.adjustMapBounds(hexes, size);
              if (this.onBoundsChange) {
                this.onBoundsChange(bounds);
              }
              return void 0;
            })
          );
        }
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
      tap(() => {
        selectedHex.quest = selectedQuest;
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
}

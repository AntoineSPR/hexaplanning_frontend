import { inject, Injectable } from '@angular/core';
import { HexService } from './hex.service';
import { QuestService } from './quest.service';
import { Hex } from '../models/hex.model';
import { Observable, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { QuestUpdateDTO } from '../models/quest.model';

@Injectable({ providedIn: 'root' })
export class QuestAssignmentService {
  private readonly _hexService = inject(HexService);
  private readonly _questService = inject(QuestService);

  loadAssignmentsIntoHexes(hexes: Hex[]): Observable<void> {
    return this._hexService.getAllAssignments().pipe(
      switchMap(assignments => {
        const tasks: Observable<QuestUpdateDTO>[] = [];
        for (const a of assignments) {
          const hex = hexes.find(h => h.q === a.q && h.r === a.r && h.s === a.s);
          if (hex) {
            tasks.push(this._questService.getQuestById(a.questId).pipe(tap(q => (hex.quest = q))));
          }
        }
        return tasks.length ? forkJoin(tasks).pipe(map(() => void 0)) : of(void 0);
      })
    );
  }

  getAssignmentForHex(q: number, r: number, s: number) {
    return this._hexService.getAssignmentByCoordinates(q, r, s);
  }

  assignQuestToHex(selectedHex: Hex, selectedQuest: QuestUpdateDTO): Observable<void> {
    const hexAssignment = {
      q: selectedHex.q,
      r: selectedHex.r,
      s: selectedHex.s,
      questId: selectedQuest.id,
    } as any;

    return this._hexService.saveAssignment(hexAssignment).pipe(
      tap(() => {
        selectedHex.quest = selectedQuest;
        this._questService.loadUnassignedPendingQuests();
      }),
      map(() => void 0)
    );
  }

  deleteQuestFromHex(hex: Hex): Observable<void> {
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
        this._questService.loadUnassignedPendingQuests();
      }),
      map(() => void 0)
    );
  }
}

import { inject, Injectable } from '@angular/core';
import { HexService } from './hex.service';
import { QuestService } from './quest.service';
import { MapGridService } from './map-grid.service';
import { Hex } from '../models/hex.model';
import { catchError, Observable, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { QuestUpdateDTO } from '../models/quest.model';
import { HexAssignment } from '../models/hexAssignment.model';
import { ConnectivityService } from './connectivity.service';

export interface HexMove {
  fromHex: Hex;
  toHex: Hex;
}

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
              })
            )
          );
        }

        if (tasks.length) {
          return forkJoin(tasks).pipe(
            map(() => {
              this._saveResolvedAssignments(resolved);
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

  // `allHexes`/`size` are only needed for reconcileGroupMembership below (placing an unassigned
  // quest next to an existing group's cluster should auto-attach it, same as a drag would).
  assignQuestToHex(selectedHex: Hex, selectedQuest: QuestUpdateDTO, allHexes: Hex[], size: number): Observable<void> {
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
      }),
      switchMap(() => this.reconcileGroupMembership(selectedHex, allHexes, size))
    );
  }

  deleteQuestFromHex(hex: Hex): Observable<void> {
    if (!hex.quest) {
      return new Observable<void>(subscriber => {
        subscriber.next();
        subscriber.complete();
      });
    }
    const quest = hex.quest;
    // Deleting the HexAssignment row is enough to unassign the quest - the relationship is owned
    // entirely by that table (FK on HexAssignment.QuestId), so there's nothing to save on the
    // Quest entity itself. Don't PUT the quest back unchanged: the update endpoint sets the
    // quest's HexAssignment navigation from the request body, so a stale quest object here could
    // resurrect the assignment just deleted.
    return this._hexService.deleteAssignment(hex.q, hex.r, hex.s).pipe(
      tap(() => {
        hex.quest = undefined;
        hex.hexAssignmentId = undefined;
        this._questService.getAllUnassignedPendingQuests().subscribe();
      }),
      switchMap(() => {
        if (!quest.questGroupId) return of(void 0);
        // An off-map quest can't belong to a spatial group - clear membership. Don't carry
        // hexAssignmentId in the body for the same reason as the comment above: the assignment
        // was just deleted, so a stale id here could resurrect it.
        const updatedQuest: QuestUpdateDTO = { ...quest, hexAssignmentId: undefined, questGroupId: undefined };
        return this._questService.updateQuest(updatedQuest).pipe(map(() => void 0));
      })
    );
  }

  // Unassigns every finished quest currently on the map, wherever it's actually placed - callable
  // from anywhere (e.g. the settings page) without the map's own hex grid being loaded, unlike
  // deleteQuestFromHex above which needs a live Hex from that grid. Cross-references the raw
  // assignments (which only carry a questId, not status) against the completed-quests list to
  // find which ones qualify, then builds a minimal Hex-shaped object per match (cx/cy/level are
  // unused by deleteQuestFromHex, which only reads q/r/s/quest) so the actual unassign - including
  // its group-membership cleanup - is the exact same, already-tested logic as removing one quest
  // from the map by hand. Each unassignment is independent, so one failing doesn't stop the rest.
  clearCompletedQuestsFromMap(): Observable<{ succeeded: number; failed: number }> {
    return forkJoin({
      assignments: this._hexService.getAllAssignments(),
      completedQuests: this._questService.getAllCompletedQuests(),
    }).pipe(
      switchMap(({ assignments, completedQuests }) => {
        const completedById = new Map(completedQuests.map(q => [q.id, q]));
        const targetHexes: Hex[] = assignments
          .map((a): Hex | null => {
            const quest = completedById.get(a.questId);
            if (!quest) return null;
            return { q: a.q, r: a.r, s: a.s, cx: 0, cy: 0, level: 0, quest, hexAssignmentId: a.id };
          })
          .filter((h): h is Hex => h !== null);

        if (targetHexes.length === 0) {
          return of({ succeeded: 0, failed: 0 });
        }

        return forkJoin(
          targetHexes.map(hex =>
            this.deleteQuestFromHex(hex).pipe(
              map(() => true),
              catchError(err => {
                console.error('Failed to remove completed quest from hex:', err);
                return of(false);
              })
            )
          )
        ).pipe(map(results => ({ succeeded: results.filter(Boolean).length, failed: results.filter(ok => !ok).length })));
      })
    );
  }

  // Move a quest already on the map to another hex. If the target hex is occupied,
  // the two quests swap positions instead. Uses PUT /hexAssignment (update in place)
  // rather than delete+recreate, so the quest never transiently disappears from the map.
  // Note: the backend has no active DB constraint on (q, r, s) uniqueness, so occupancy
  // is only checked client-side against the currently loaded hexes.
  // `allHexes`/`size` are only needed for reconcileGroupMembership below - single-quest moves
  // (unlike moveGroupToHexes) can auto-attach to or detach from a group as a side effect.
  moveQuestToHex(fromHex: Hex, toHex: Hex, allHexes: Hex[], size: number): Observable<void> {
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
        }),
        switchMap(() => this.reconcileGroupMembership(toHex, allHexes, size))
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
      switchMap(() => forkJoin([this.reconcileGroupMembership(fromHex, allHexes, size), this.reconcileGroupMembership(toHex, allHexes, size)])),
      map(() => void 0)
    );
  }

  // Rigidly translates a whole quest group: one plain "move to empty" PUT per member, via
  // forkJoin - never a swap payload, since group-drop validation (see HexDragController) already
  // excludes any target occupied by a non-member. No auto-attach/detach reconciliation here
  // (unlike moveQuestToHex): a deliberate whole-group drag shouldn't second-guess membership.
  moveGroupToHexes(moves: HexMove[]): Observable<void> {
    const validMoves = moves.filter(m => m.fromHex.quest && m.fromHex.hexAssignmentId && m.fromHex !== m.toHex);
    if (validMoves.length === 0) {
      return new Observable<void>(subscriber => {
        subscriber.next();
        subscriber.complete();
      });
    }

    const requests = validMoves.map(({ fromHex, toHex }) => {
      const updated: HexAssignment = {
        id: fromHex.hexAssignmentId,
        questId: fromHex.quest!.id,
        q: toHex.q,
        r: toHex.r,
        s: toHex.s,
      };
      return this._hexService.updateAssignment(fromHex.hexAssignmentId!, updated);
    });

    return forkJoin(requests).pipe(
      tap(() => {
        // A rigid slide can have a target coordinate equal to another member's *original*
        // coordinate (e.g. a line of hexes sliding one step along its own length) - snapshot
        // every source quest/assignment id before mutating anything, then clear every origin hex,
        // then write every target, so an overlapping from/to pair never clobbers data still needed
        // by another pair in the same batch.
        const snapshot = validMoves.map(({ toHex, fromHex }) => ({
          toHex,
          quest: fromHex.quest!,
          hexAssignmentId: fromHex.hexAssignmentId!,
        }));
        for (const { fromHex } of validMoves) {
          fromHex.quest = undefined;
          fromHex.hexAssignmentId = undefined;
        }
        for (const { toHex, quest, hexAssignmentId } of snapshot) {
          toHex.quest = quest;
          toHex.hexAssignmentId = hexAssignmentId;
        }
      }),
      map(() => void 0)
    );
  }

  // Compute the moved hex's occupied neighbors' distinct group ids and auto-attach/detach/move
  // the moved quest accordingly:
  // - the sole member of its own group -> no change (see below)
  // - still adjacent to its own group -> no change
  // - adjacent to exactly one distinct OTHER group (whether it was grouped or not) -> attach to
  //   that group - this is what lets a drag move a quest straight from one group to another, not
  //   just detach it and leave it stranded
  // - was grouped, no longer adjacent to that group, and no single other group to replace it
  //   with -> detach
  // - otherwise (ungrouped with 0 or 2+ distinct neighboring groups) -> no change, left for the
  //   quest-details panel's own "Rejoindre <group>" buttons to resolve the ambiguity manually
  private reconcileGroupMembership(movedHex: Hex, allHexes: Hex[], size: number): Observable<void> {
    const quest = movedHex.quest;
    if (!quest) return of(void 0);

    // A solo-member group has no other member to be "adjacent to" by definition, so the
    // neighbor-based logic below would always either strand it (detach, and the backend deletes
    // the now-empty group) or silently reassign it into whatever group it happens to land beside
    // - neither of which reads as "just moving the quest". Dragging a lone member around the map
    // is effectively dragging its (single-member) group: membership stays exactly as it was,
    // wherever it lands - joining a different group from here is still available explicitly via
    // the group-actions modal's own "Rejoindre" button.
    if (quest.questGroupId) {
      const memberCount = this._questService.quests().filter(q => q.questGroupId === quest.questGroupId).length;
      if (memberCount <= 1) return of(void 0);
    }

    const neighborGroupIds = new Set<string>();
    for (const n of this._mapGrid.neighborsOf(movedHex, size)) {
      const neighborHex = allHexes.find(h => h.q === n.q && h.r === n.r && h.s === n.s);
      if (neighborHex?.quest?.questGroupId) {
        neighborGroupIds.add(neighborHex.quest.questGroupId);
      }
    }

    const currentGroupId = quest.questGroupId;
    if (currentGroupId && neighborGroupIds.has(currentGroupId)) {
      return of(void 0); // still adjacent to its own group - no change
    }

    let nextGroupId: string | undefined;
    if (neighborGroupIds.size === 1) {
      // Exactly one distinct neighboring group - and, per the check above, never its own group -
      // so this covers both a plain attach (was ungrouped) and a move into a different group.
      nextGroupId = [...neighborGroupIds][0];
    } else if (currentGroupId) {
      nextGroupId = undefined; // detach - no longer adjacent to its own group, nothing unambiguous to join instead
    } else {
      return of(void 0); // was ungrouped, still 0 or 2+ distinct neighboring groups - no change
    }

    const updatedQuest: QuestUpdateDTO = { ...quest, questGroupId: nextGroupId };
    return this._questService.updateQuest(updatedQuest).pipe(
      tap(() => {
        movedHex.quest = { ...quest, questGroupId: nextGroupId };
      }),
      map(() => void 0)
    );
  }
}

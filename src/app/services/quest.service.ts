import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, of, catchError, throwError } from 'rxjs';
import { QuestUpdateDTO, QuestCreateDTO } from '../models/quest.model';
import { environment } from '../../environments/environment.development';
import { HexService } from './hex.service';
import { Status } from '../models/status';
import { Priority } from '../models/priority';

@Injectable({ providedIn: 'root' })
export class QuestService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = `${environment.apiUrl}/quest`;
  private readonly _apiUrlBase = environment.apiUrl;

  private readonly _hexService = inject(HexService);

  private _quests = signal<QuestUpdateDTO[]>([]);
  public quests = this._quests.asReadonly();
  private _pendingQuests = signal<QuestUpdateDTO[]>([]);
  public pendingQuests = this._pendingQuests.asReadonly();
  private _completedQuests = signal<QuestUpdateDTO[]>([]);
  public completedQuests = this._completedQuests.asReadonly();
  private _unassignedPendingQuests = signal<QuestUpdateDTO[]>([]);
  public unassignedPendingQuests = this._unassignedPendingQuests.asReadonly();

  public _deletedQuestId = signal<string | null>(null);
  public deletedQuestId = this._deletedQuestId.asReadonly();

  //status
  statuses = signal<Status[] | null>(null);
  priorities = signal<Priority[] | null>(null);
  statusDoneId = '6662dfc1-9c40-4d78-806f-34cd22e07023';
  statusPendingId = '17c07323-d5b4-4568-b773-de3487ff30b1';

  refreshAllQuestLists(): void {
    this.getAllQuests().subscribe();
    this.getAllPendingQuests().subscribe();
    this.getAllCompletedQuests().subscribe();
    this.getAllUnassignedPendingQuests().subscribe();
  }

  getAllQuests(): Observable<QuestUpdateDTO[]> {
    return this._http.get<QuestUpdateDTO[]>(this._apiUrl).pipe(tap(quests => this._quests.set(quests)));
  }

  getAllPendingQuests(): Observable<QuestUpdateDTO[]> {
    return this._http.get<QuestUpdateDTO[]>(`${this._apiUrl}/pending`).pipe(
      tap(quests => {
        const sortedQuests = this.sortQuestsByPriority(quests);
        this._pendingQuests.set(sortedQuests);
      })
    );
  }

  getAllCompletedQuests(): Observable<QuestUpdateDTO[]> {
    return this._http.get<QuestUpdateDTO[]>(`${this._apiUrl}/completed`).pipe(tap(quests => this._completedQuests.set(quests)));
  }

  getAllUnassignedPendingQuests(): Observable<QuestUpdateDTO[]> {
    return this._http.get<QuestUpdateDTO[]>(`${this._apiUrl}/unassigned_pending`).pipe(
      tap(quests => {
        const sortedQuests = this.sortQuestsByPriority(quests);
        this._unassignedPendingQuests.set(sortedQuests);
      })
    );
  }

  getQuestById(id: string): Observable<QuestUpdateDTO> {
    return this._http.get<QuestUpdateDTO>(`${this._apiUrl}/${id}`);
  }

  createQuest(quest: QuestCreateDTO): Observable<QuestUpdateDTO> {
    return this._http.post<QuestUpdateDTO>(this._apiUrl, quest).pipe(
      tap(newQuest => {
        this.refreshAllQuestLists();
      })
    );
  }

  updateQuest(quest: QuestUpdateDTO): Observable<QuestUpdateDTO> {
    return this._http.put<QuestUpdateDTO>(`${this._apiUrl}/${quest.id}`, quest).pipe(
      tap(updatedQuest => {
        this.refreshAllQuestLists();
      })
    );
  }

  deleteQuest(id: string): Observable<void> {
    return this._http.delete<void>(`${this._apiUrl}/${id}`).pipe(
      tap(() => {
        this.refreshAllQuestLists();
        // Try to delete assignment if it exists; ignore 404
        this._hexService
          .getAssignmentByQuestId(id)
          .pipe(catchError(err => (err?.status === 404 ? of(null) : throwError(() => err))))
          .subscribe(assignment => {
            if (assignment) {
              this._hexService.deleteAssignment(assignment.q, assignment.r, assignment.s).subscribe();
            }
          });
        this._deletedQuestId.set(id);
      })
    );
  }

  // load statuses and priorities
  public loadStatuses() {
    return this._http.get<Status[]>(`${this._apiUrlBase}/status`).pipe(tap(statuses => this.statuses.set(statuses)));
  }

  public loadPriorities() {
    return this._http.get<Priority[]>(`${this._apiUrlBase}/priority`).pipe(tap(priorities => this.priorities.set(priorities)));
  }

  private sortQuestsByPriority(quests: QuestUpdateDTO[]): QuestUpdateDTO[] {
    return quests.sort((a, b) => {
      // Get priority information
      const priorityA = this.priorities()?.find(p => p.id === a.priorityId);
      const priorityB = this.priorities()?.find(p => p.id === b.priorityId);

      // Define priority order (primary = 1, secondary = 2, tertiary = 3)
      const getPriorityOrder = (priority: Priority | undefined): number => {
        if (!priority || !priority.icon) return 999;
        switch (priority.icon.toLowerCase()) {
          case 'primary':
            return 1;
          case 'secondary':
            return 2;
          case 'tertiary':
            return 3;
          default:
            return 999;
        }
      };

      const orderA = getPriorityOrder(priorityA);
      const orderB = getPriorityOrder(priorityB);

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return 0;
    });
  }
}

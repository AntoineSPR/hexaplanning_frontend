import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, of, catchError, throwError } from 'rxjs';
import { QuestUpdateDTO, QuestCreateDTO } from '../models/quest.model';
import { environment } from '../../environments/environment.development';
import { HexService } from './hex.service';
import { Status } from '../models/status';
import { ConnectivityService } from './connectivity.service';

@Injectable({ providedIn: 'root' })
export class QuestService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = `${environment.apiUrl}/quest`;
  private readonly _apiUrlBase = environment.apiUrl;

  private readonly _hexService = inject(HexService);
  private readonly _connectivity = inject(ConnectivityService);

  // Persisted to localStorage (not just kept in memory) so a page reload while offline still
  // has something to show read-only, instead of coming up empty because the fetch can't reach
  // the backend - same approach as QuestAssignmentService's offline snapshot for the map.
  private _loadCached<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private _saveCached<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  private _quests = signal<QuestUpdateDTO[]>(this._loadCached('hexaplanning.quests.v1', []));
  public quests = this._quests.asReadonly();
  private _pendingQuests = signal<QuestUpdateDTO[]>(this._loadCached('hexaplanning.pendingQuests.v1', []));
  public pendingQuests = this._pendingQuests.asReadonly();
  private _completedQuests = signal<QuestUpdateDTO[]>(this._loadCached('hexaplanning.completedQuests.v1', []));
  public completedQuests = this._completedQuests.asReadonly();
  private _unassignedPendingQuests = signal<QuestUpdateDTO[]>(this._loadCached('hexaplanning.unassignedPendingQuests.v1', []));
  public unassignedPendingQuests = this._unassignedPendingQuests.asReadonly();

  public _deletedQuestId = signal<string | null>(null);
  public deletedQuestId = this._deletedQuestId.asReadonly();

  //status
  statuses = signal<Status[] | null>(this._loadCached('hexaplanning.statuses.v1', null));
  statusDoneId = '6662dfc1-9c40-4d78-806f-34cd22e07023';
  statusPendingId = '17c07323-d5b4-4568-b773-de3487ff30b1';
  statusOnHoldId = 'b34563d0-1ae5-42f9-950a-beffa4e27dce';

  refreshAllQuestLists(): void {
    this.getAllQuests().subscribe();
    this.getAllPendingQuests().subscribe();
    this.getAllCompletedQuests().subscribe();
    this.getAllUnassignedPendingQuests().subscribe();
  }

  getAllQuests(): Observable<QuestUpdateDTO[]> {
    if (this._connectivity.isOffline()) return of(this._quests());
    return this._http.get<QuestUpdateDTO[]>(this._apiUrl).pipe(
      tap(quests => {
        this._quests.set(quests);
        this._saveCached('hexaplanning.quests.v1', quests);
      })
    );
  }

  getAllPendingQuests(): Observable<QuestUpdateDTO[]> {
    if (this._connectivity.isOffline()) return of(this._pendingQuests());
    return this._http.get<QuestUpdateDTO[]>(`${this._apiUrl}/pending`).pipe(
      tap(quests => {
        const sortedQuests = this.sortQuestsByTheme(quests);
        this._pendingQuests.set(sortedQuests);
        this._saveCached('hexaplanning.pendingQuests.v1', sortedQuests);
      })
    );
  }

  getAllCompletedQuests(): Observable<QuestUpdateDTO[]> {
    if (this._connectivity.isOffline()) return of(this._completedQuests());
    return this._http.get<QuestUpdateDTO[]>(`${this._apiUrl}/completed`).pipe(
      tap(quests => {
        this._completedQuests.set(quests);
        this._saveCached('hexaplanning.completedQuests.v1', quests);
      })
    );
  }

  getAllUnassignedPendingQuests(): Observable<QuestUpdateDTO[]> {
    if (this._connectivity.isOffline()) return of(this._unassignedPendingQuests());
    return this._http.get<QuestUpdateDTO[]>(`${this._apiUrl}/unassigned_pending`).pipe(
      tap(quests => {
        const sortedQuests = this.sortQuestsByTheme(quests);
        this._unassignedPendingQuests.set(sortedQuests);
        this._saveCached('hexaplanning.unassignedPendingQuests.v1', sortedQuests);
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

  // load statuses
  public loadStatuses() {
    if (this._connectivity.isOffline()) return of(this.statuses());
    return this._http.get<Status[]>(`${this._apiUrlBase}/status`).pipe(
      tap(statuses => {
        this.statuses.set(statuses);
        this._saveCached('hexaplanning.statuses.v1', statuses);
      })
    );
  }

  // Primary-theme quests first, then secondary-theme, then unthemed - themes have no inherent
  // cross-theme order (unlike the old fixed primary/secondary/tertiary priorities), so only a
  // quest's own role within whichever theme it belongs to (or lack thereof) drives the sort.
  private sortQuestsByTheme(quests: QuestUpdateDTO[]): QuestUpdateDTO[] {
    const getOrder = (q: QuestUpdateDTO): number => {
      if (!q.themeId) return 3;
      return q.isPrimaryTheme ? 1 : 2;
    };

    return quests.sort((a, b) => getOrder(a) - getOrder(b));
  }
}

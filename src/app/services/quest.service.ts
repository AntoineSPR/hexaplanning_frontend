import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Quest, QuestCreateDTO } from '../models/quest.model';
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

  private _quests = signal<Quest[]>([]);
  public quests = this._quests.asReadonly();
  private _pendingQuests = signal<Quest[]>([]);
  public pendingQuests = this._pendingQuests.asReadonly();
  private _completedQuests = signal<Quest[]>([]);
  public completedQuests = this._completedQuests.asReadonly();
  private _unassignedPendingQuests = signal<Quest[]>([]);
  public unassignedPendingQuests = this._unassignedPendingQuests.asReadonly();

  public _deletedQuestId = signal<number | null>(null);
  public deletedQuestId = this._deletedQuestId.asReadonly();

  //status
  statuses = signal<Status[] | null>(null);
  priorities = signal<Priority[] | null>(null);

  loadQuests(): void {
    this.getAllQuests().subscribe();
  }

  loadPendingQuests(): void {
    this.getAllPendingQuests().subscribe();
  }

  loadCompletedQuests(): void {
    this.getAllCompletedQuests().subscribe();
  }

  loadUnassignedPendingQuests(): void {
    this.getAllUnassignedPendingQuests().subscribe();
  }

  getAllQuests(): Observable<Quest[]> {
    return this._http.get<Quest[]>(this._apiUrl).pipe(tap(quests => this._quests.set(quests)));
  }

  getAllPendingQuests(): Observable<Quest[]> {
    return this._http.get<Quest[]>(`${this._apiUrl}/pending`).pipe(tap(quests => this._pendingQuests.set(quests)));
  }

  getAllCompletedQuests(): Observable<Quest[]> {
    return this._http.get<Quest[]>(`${this._apiUrl}/completed`).pipe(tap(quests => this._completedQuests.set(quests)));
  }

  getAllUnassignedPendingQuests(): Observable<Quest[]> {
    return this._http.get<Quest[]>(`${this._apiUrl}/unassigned_pending`).pipe(tap(quests => this._unassignedPendingQuests.set(quests)));
  }

  getQuestById(id: number): Observable<Quest> {
    return this._http.get<Quest>(`${this._apiUrl}/${id}`);
  }

  createQuest(quest: QuestCreateDTO): Observable<Quest> {
    return this._http.post<Quest>(this._apiUrl, quest).pipe(
      tap(newQuest => {
        this._quests.update(quests => [...quests, newQuest]);
        this._pendingQuests.update(quests => [...quests, newQuest]);
        this._unassignedPendingQuests.update(quests => [...quests, newQuest]);
      })
    );
  }

  updateQuest(quest: Quest): Observable<Quest> {
    return this._http.put<Quest>(`${this._apiUrl}/${quest.id}`, quest).pipe(
      tap(updatedQuest => {
        // Update main quests list
        this._quests.update(quests => quests.map(q => (q.id === updatedQuest.id ? updatedQuest : q)));

        if (updatedQuest.isDone) {
          // Remove from pending if completed
          this._pendingQuests.update(quests => quests.filter(q => q.id !== updatedQuest.id));
          // Add to completed if not already there
          this._completedQuests.update(quests => {
            const exists = quests.some(q => q.id === updatedQuest.id);
            return exists ? quests.map(q => (q.id === updatedQuest.id ? updatedQuest : q)) : [...quests, updatedQuest];
          });
        } else {
          // Remove from completed if pending
          this._completedQuests.update(quests => quests.filter(q => q.id !== updatedQuest.id));
          // Add to pending if not already there
          this._pendingQuests.update(quests => {
            const exists = quests.some(q => q.id === updatedQuest.id);
            return exists ? quests.map(q => (q.id === updatedQuest.id ? updatedQuest : q)) : [...quests, updatedQuest];
          });

          if (!updatedQuest.isAssigned) {
            // Add to unassigned if not already there
            this._unassignedPendingQuests.update(quests => {
              const exists = quests.some(q => q.id === updatedQuest.id);
              return exists ? quests.map(q => (q.id === updatedQuest.id ? updatedQuest : q)) : [...quests, updatedQuest];
            });
          } else {
            // Remove from unassigned if now assigned
            this._unassignedPendingQuests.update(quests => quests.filter(q => q.id !== updatedQuest.id));
          }
        }
      })
    );
  }

  deleteQuest(id: number): Observable<void> {
    return this._http.delete<void>(`${this._apiUrl}/${id}`).pipe(
      tap(() => {
        this._quests.update(quests => quests.filter(q => q.id !== id));
        this._completedQuests.update(quests => quests.filter(q => q.id !== id));
        this._pendingQuests.update(quests => quests.filter(q => q.id !== id));
        this._unassignedPendingQuests.update(quests => quests.filter(q => q.id !== id));

        this._hexService.getAssignmentByQuestId(id).subscribe(assignment => {
          this._hexService.deleteAssignment(assignment.q, assignment.r, assignment.s).subscribe();
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
}

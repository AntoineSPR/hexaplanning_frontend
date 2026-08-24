import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { QuestGroupCreateDTO, QuestGroupOutputDTO, QuestGroupUpdateDTO } from '../models/quest-group.model';
import { environment } from '../../environments/environment.development';
import { ConnectivityService } from './connectivity.service';

@Injectable({ providedIn: 'root' })
export class QuestGroupService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = `${environment.apiUrl}/questgroup`;

  private readonly _connectivity = inject(ConnectivityService);

  // Persisted to localStorage (not just kept in memory) so a page reload while offline still
  // has something to show read-only, instead of coming up empty because the fetch can't reach
  // the backend - same approach as QuestService's own cache.
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

  private _questGroups = signal<QuestGroupOutputDTO[]>(this._loadCached('hexaplanning.questGroups.v1', []));
  public questGroups = this._questGroups.asReadonly();

  getAllQuestGroups(): Observable<QuestGroupOutputDTO[]> {
    if (this._connectivity.isOffline()) return of(this._questGroups());
    return this._http.get<QuestGroupOutputDTO[]>(this._apiUrl).pipe(
      tap(groups => {
        this._questGroups.set(groups);
        this._saveCached('hexaplanning.questGroups.v1', groups);
      })
    );
  }

  getQuestGroupById(id: string): Observable<QuestGroupOutputDTO> {
    return this._http.get<QuestGroupOutputDTO>(`${this._apiUrl}/${id}`);
  }

  createQuestGroup(dto: QuestGroupCreateDTO): Observable<QuestGroupOutputDTO> {
    return this._http.post<QuestGroupOutputDTO>(this._apiUrl, dto).pipe(
      tap(created => {
        const updated = [...this._questGroups(), created];
        this._questGroups.set(updated);
        this._saveCached('hexaplanning.questGroups.v1', updated);
      })
    );
  }

  updateQuestGroup(dto: QuestGroupUpdateDTO): Observable<QuestGroupOutputDTO> {
    return this._http.put<QuestGroupOutputDTO>(`${this._apiUrl}/${dto.id}`, dto).pipe(
      tap(updated => {
        const groups = this._questGroups().map(g => (g.id === updated.id ? updated : g));
        this._questGroups.set(groups);
        this._saveCached('hexaplanning.questGroups.v1', groups);
      })
    );
  }

  deleteQuestGroup(id: string): Observable<void> {
    return this._http.delete<void>(`${this._apiUrl}/${id}`).pipe(
      tap(() => {
        const groups = this._questGroups().filter(g => g.id !== id);
        this._questGroups.set(groups);
        this._saveCached('hexaplanning.questGroups.v1', groups);
      })
    );
  }
}

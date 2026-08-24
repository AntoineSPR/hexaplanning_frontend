import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { ThemeCreateDTO, ThemeOutputDTO, ThemeUpdateDTO } from '../models/theme.model';
import { environment } from '../../environments/environment.development';
import { ConnectivityService } from './connectivity.service';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = `${environment.apiUrl}/theme`;

  private readonly _connectivity = inject(ConnectivityService);

  // Persisted to localStorage (not just kept in memory) so a page reload while offline still
  // has something to show read-only, instead of coming up empty because the fetch can't reach
  // the backend - same approach as QuestGroupService's own cache.
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

  private _themes = signal<ThemeOutputDTO[]>(this._loadCached('hexaplanning.themes.v1', []));
  public themes = this._themes.asReadonly();

  getAllThemes(): Observable<ThemeOutputDTO[]> {
    if (this._connectivity.isOffline()) return of(this._themes());
    return this._http.get<ThemeOutputDTO[]>(this._apiUrl).pipe(
      tap(themes => {
        this._themes.set(themes);
        this._saveCached('hexaplanning.themes.v1', themes);
      })
    );
  }

  getThemeById(id: string): Observable<ThemeOutputDTO> {
    return this._http.get<ThemeOutputDTO>(`${this._apiUrl}/${id}`);
  }

  createTheme(dto: ThemeCreateDTO): Observable<ThemeOutputDTO> {
    return this._http.post<ThemeOutputDTO>(this._apiUrl, dto).pipe(
      tap(created => {
        const updated = [...this._themes(), created];
        this._themes.set(updated);
        this._saveCached('hexaplanning.themes.v1', updated);
      })
    );
  }

  updateTheme(dto: ThemeUpdateDTO): Observable<ThemeOutputDTO> {
    return this._http.put<ThemeOutputDTO>(`${this._apiUrl}/${dto.id}`, dto).pipe(
      tap(updated => {
        const themes = this._themes().map(t => (t.id === updated.id ? updated : t));
        this._themes.set(themes);
        this._saveCached('hexaplanning.themes.v1', themes);
      })
    );
  }

  deleteTheme(id: string): Observable<void> {
    return this._http.delete<void>(`${this._apiUrl}/${id}`).pipe(
      tap(() => {
        const themes = this._themes().filter(t => t.id !== id);
        this._themes.set(themes);
        this._saveCached('hexaplanning.themes.v1', themes);
      })
    );
  }
}

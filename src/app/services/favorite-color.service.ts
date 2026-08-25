import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { FavoriteColorCreateDTO, FavoriteColorOutputDTO } from '../models/favorite-color.model';
import { environment } from '../../environments/environment.development';
import { ConnectivityService } from './connectivity.service';

@Injectable({ providedIn: 'root' })
export class FavoriteColorService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = `${environment.apiUrl}/favoritecolor`;

  private readonly _connectivity = inject(ConnectivityService);

  // Persisted to localStorage (not just kept in memory) so a page reload while offline still
  // has something to show read-only, instead of coming up empty because the fetch can't reach
  // the backend - same approach as ThemeService's own cache.
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

  private _favorites = signal<FavoriteColorOutputDTO[]>(this._loadCached('hexaplanning.favoriteColors.v1', []));
  public favorites = this._favorites.asReadonly();

  getAllFavoriteColors(): Observable<FavoriteColorOutputDTO[]> {
    if (this._connectivity.isOffline()) return of(this._favorites());
    return this._http.get<FavoriteColorOutputDTO[]>(this._apiUrl).pipe(
      tap(favorites => {
        this._favorites.set(favorites);
        this._saveCached('hexaplanning.favoriteColors.v1', favorites);
      })
    );
  }

  createFavoriteColor(dto: FavoriteColorCreateDTO): Observable<FavoriteColorOutputDTO> {
    return this._http.post<FavoriteColorOutputDTO>(this._apiUrl, dto).pipe(
      tap(created => {
        const updated = [...this._favorites(), created];
        this._favorites.set(updated);
        this._saveCached('hexaplanning.favoriteColors.v1', updated);
      })
    );
  }

  deleteFavoriteColor(id: string): Observable<void> {
    return this._http.delete<void>(`${this._apiUrl}/${id}`).pipe(
      tap(() => {
        const favorites = this._favorites().filter(f => f.id !== id);
        this._favorites.set(favorites);
        this._saveCached('hexaplanning.favoriteColors.v1', favorites);
      })
    );
  }
}

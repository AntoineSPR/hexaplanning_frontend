import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of, throwError } from 'rxjs';
import { environment } from 'src/environments/environment.development';
import { HexAssignment } from '../models/hexAssignment.model';

@Injectable({ providedIn: 'root' })
export class HexService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = `${environment.apiUrl}/hexAssignment`;

  getAllAssignments(): Observable<HexAssignment[]> {
    return this._http.get<HexAssignment[]>(this._apiUrl);
  }

  getAssignmentById(id: string): Observable<HexAssignment> {
    return this._http.get<HexAssignment>(`${this._apiUrl}/${id}`);
  }

  getAssignmentByQuestId(questId: number): Observable<HexAssignment> {
    return this._http.get<HexAssignment>(`${this._apiUrl}/quest/${questId}`);
  }

  getAssignmentByCoordinates(q: number, r: number, s: number): Observable<HexAssignment | null> {
    return this._http.get<HexAssignment | null>(`${this._apiUrl}/coordinates/${q}/${r}/${s}`).pipe(
      catchError(error => {
        if (error.status === 404) {
          return of(null);
        }
        return throwError(() => error);
      })
    );
  }

  saveAssignment(assignment: HexAssignment): Observable<HexAssignment> {
    return this._http.post<HexAssignment>(this._apiUrl, assignment);
  }

  updateAssignment(id: string, assignment: HexAssignment): Observable<HexAssignment> {
    return this._http.put<HexAssignment>(`${this._apiUrl}/${id}`, assignment);
  }

  deleteAssignment(q: number, r: number, s: number): Observable<object> {
    return this._http.delete(`${this._apiUrl}/coordinates/${q}/${r}/${s}`);
  }
}

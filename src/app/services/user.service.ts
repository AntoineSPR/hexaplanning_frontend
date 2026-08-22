import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from 'src/environments/environment.development';
import { UserCreateDTO } from '../models/userCreateDTO.model';
import { Observable, finalize, shareReplay, tap, throwError } from 'rxjs';
import { UserLoginDTO } from '../models/userLoginDTO.model';
import { LoginResponseDTO } from '../models/loginResponseDTO.model';
import { UserResponseDTO } from '../models/userResponseDTO.model';
import { ChangePasswordDTO } from '../models/changePasswordDTO.model';
import { ForgotPasswordDTO } from '../models/forgotPasswordDTO.model';
import { ResetPasswordDTO } from '../models/resetPasswordDTO.model';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = `${environment.apiUrl}/user`;
  user = signal<UserResponseDTO | null>(null);
  token = signal<string | null>(null);
  private _refreshInFlight$: Observable<LoginResponseDTO> | null = null;

  createUser(user: UserCreateDTO): Observable<UserCreateDTO> {
    return this._http.post<UserCreateDTO>(this._apiUrl + '/register', user);
  }

  loginUser(user: UserLoginDTO): Observable<LoginResponseDTO> {
    return this._http.post<LoginResponseDTO>(this._apiUrl + '/login', user).pipe(tap(response => this._applyAuthResponse(response)));
  }

  // Renews the access token using the stored refresh token. Concurrent callers (e.g. several
  // requests that all 401 around the same moment) share this single in-flight call instead of
  // each firing their own refresh request against the backend.
  refreshAccessToken(): Observable<LoginResponseDTO> {
    if (this._refreshInFlight$) {
      return this._refreshInFlight$;
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    this._refreshInFlight$ = this._http.post<LoginResponseDTO>(this._apiUrl + '/refresh', { refreshToken }).pipe(
      tap(response => this._applyAuthResponse(response)),
      shareReplay(1),
      finalize(() => (this._refreshInFlight$ = null))
    );
    return this._refreshInFlight$;
  }

  private _applyAuthResponse(response: LoginResponseDTO): void {
    this.user.set(response.user);
    this.token.set(response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    localStorage.setItem('token', response.token);
    localStorage.setItem('refreshToken', response.refreshToken);
  }

  changePassword(passwordData: ChangePasswordDTO): Observable<any> {
    return this._http.put(`${this._apiUrl}/change-password`, passwordData);
  }

  forgotPassword(forgotPasswordData: ForgotPasswordDTO): Observable<any> {
    return this._http.post(`${this._apiUrl}/forgot-password/${forgotPasswordData.email}`, {});
  }

  resetPassword(resetPasswordData: ResetPasswordDTO): Observable<any> {
    return this._http.post(`${this._apiUrl}/reset-password`, resetPasswordData);
  }

  logoutUser(): void {
    const refreshToken = localStorage.getItem('refreshToken');

    this.user.set(null);
    this.token.set(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');

    // Best-effort server-side revocation so the old refresh token can't be reused; a network
    // failure here shouldn't block the local logout that already happened above.
    if (refreshToken) {
      this._http.post(`${this._apiUrl}/logout`, { refreshToken }).subscribe({ error: () => {} });
    }
  }
}

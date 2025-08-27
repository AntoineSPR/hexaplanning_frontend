import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from 'src/environments/environment.development';
import { UserCreateDTO } from '../models/userCreateDTO.model';
import { Observable, tap } from 'rxjs';
import { UserLoginDTO } from '../models/userLoginDTO.model';
import { LoginResponseDTO } from '../models/loginResponseDTO.model';
import { UserResponseDTO } from '../models/userResponseDTO.model';
import { ChangePasswordDTO } from '../models/changePasswordDTO.model';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = `${environment.apiUrl}/user`;
  user = signal<UserResponseDTO | null>(null);
  token = signal<string | null>(null);

  createUser(user: UserCreateDTO): Observable<UserCreateDTO> {
    return this._http.post<UserCreateDTO>(this._apiUrl + '/register', user);
  }

  loginUser(user: UserLoginDTO): Observable<LoginResponseDTO> {
    return this._http.post<LoginResponseDTO>(this._apiUrl + '/login', user).pipe(
      tap(response => {
        this.user.set(response.user);
        this.token.set(response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('token', response.token);
      })
    );
  }

  changePassword(passwordData: ChangePasswordDTO): Observable<any> {
    return this._http.put(`${this._apiUrl}/change-password`, passwordData);
  }

  logoutUser(): void {
    this.user.set(null);
    this.token.set(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  }
}

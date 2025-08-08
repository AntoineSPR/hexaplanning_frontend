import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from 'src/environments/environment.development';
import { UserCreateDTO } from '../models/userCreateDTO.model';
import { Observable } from 'rxjs';
import { UserLoginDTO } from '../models/userLoginDTO.model';
import { UserResponseDTO } from '../models/userResponseDTO.model';
import { LoginResponseDTO } from '../models/loginResponseDTO.model';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly _http = inject(HttpClient);
  private readonly _apiUrl = `${environment.apiUrl}/user`;

  createUser(user: UserCreateDTO): Observable<UserCreateDTO> {
    return this._http.post<UserCreateDTO>(this._apiUrl + '/register', user);
  }

  loginUser(user: UserLoginDTO): Observable<LoginResponseDTO> {
    return this._http.post<LoginResponseDTO>(this._apiUrl + '/login', user);
  }
}

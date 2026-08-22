import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { UserService } from '../services/user.service';

const AUTH_ENDPOINTS = ['/user/login', '/user/register', '/user/refresh'];

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const userService = inject(UserService);
  const router = inject(Router);

  const token = localStorage.getItem('token');
  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  const isAuthEndpoint = AUTH_ENDPOINTS.some(path => req.url.includes(path));

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (error.status !== 401 || isAuthEndpoint || !refreshToken) {
        return throwError(() => error);
      }

      // Expired access token: silently renew it and retry the original request once.
      return userService.refreshAccessToken().pipe(
        switchMap(response => next(req.clone({ setHeaders: { Authorization: `Bearer ${response.token}` } }))),
        catchError(() => {
          // Refresh itself failed (refresh token expired/revoked/reused) - the session is truly
          // over, so log out and send the user back to the login page.
          userService.logoutUser();
          router.navigate(['/login']);
          return throwError(() => error);
        })
      );
    })
  );
};

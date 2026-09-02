import { HttpErrorResponse, HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, switchMap, tap, throwError } from 'rxjs';
import { UserService } from '../services/user.service';
import { ConnectivityService } from '../services/connectivity.service';

const AUTH_ENDPOINTS = ['/user/login', '/user/register', '/user/refresh'];

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const userService = inject(UserService);
  const router = inject(Router);
  const connectivity = inject(ConnectivityService);
  const messageService = inject(MessageService);

  const token = localStorage.getItem('token');
  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  const isAuthEndpoint = AUTH_ENDPOINTS.some(path => req.url.includes(path));

  return next(authReq).pipe(
    tap(event => {
      if (event.type === HttpEventType.Response) {
        connectivity.reportNetworkSuccess();
      }
    }),
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        // No HTTP response reached the app at all - a true network-level failure, as opposed
        // to a real error status the server returned.
        connectivity.reportNetworkFailure();
      }

      const refreshToken = localStorage.getItem('refreshToken');
      if (error.status !== 401 || isAuthEndpoint || !refreshToken) {
        return throwError(() => error);
      }

      // Expired access token: silently renew it and retry the original request once.
      return userService.refreshAccessToken().pipe(
        switchMap(response => next(req.clone({ setHeaders: { Authorization: `Bearer ${response.token}` } }))),
        catchError(() => {
          // Refresh itself failed (refresh token expired/revoked/reused) - the session is truly
          // over, so log out, tell the user why, and send them back to the login page.
          messageService.add({
            severity: 'warn',
            summary: 'Session expirée',
            detail: 'Veuillez vous reconnecter.',
          });
          userService.logoutUser();
          router.navigate(['/login']);
          return throwError(() => error);
        })
      );
    })
  );
};

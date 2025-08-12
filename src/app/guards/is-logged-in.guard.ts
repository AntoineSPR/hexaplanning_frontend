import { CanActivateFn } from '@angular/router';

export const isLoggedInGuard: CanActivateFn = (route, state) => {
  return localStorage.getItem('user') !== null && localStorage.getItem('token') !== null;
};

export const isLoggedOutGuard: CanActivateFn = (route, state) => {
  return localStorage.getItem('user') === null || localStorage.getItem('token') === null;
};

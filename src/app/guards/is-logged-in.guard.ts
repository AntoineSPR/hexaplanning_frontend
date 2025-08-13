import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const isLoggedInGuard: CanActivateFn = (route, state) => {
  const _router = inject(Router);

  if (localStorage.getItem('user') !== null && localStorage.getItem('token') !== null) {
    return true;
  }
  _router.navigate(['/login']);
  return false;
};

export const isLoggedOutGuard: CanActivateFn = (route, state) => {
  const _router = inject(Router);

  if (localStorage.getItem('user') === null || localStorage.getItem('token') === null) {
    return true;
  }
  _router.navigate(['/']);
  return false;
};

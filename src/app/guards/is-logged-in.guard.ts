import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { UserService } from '../services/user.service';

export const isLoggedInGuard: CanActivateFn = (route, state) => {
  const _userService = inject(UserService);

  return _userService.user() !== null && _userService.token() !== null;
};

export const isLoggedOutGuard: CanActivateFn = (route, state) => {
  const _userService = inject(UserService);

  return _userService.user() === null || _userService.token() === null;
};

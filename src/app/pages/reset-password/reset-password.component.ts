import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { UserService } from '../../services/user.service';
import { ResetPasswordDTO } from '../../models/resetPasswordDTO.model';

const MIN_PASSWORD_LENGTH = 6;

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, ButtonModule, CardModule, PasswordModule, ToastModule],
  providers: [MessageService],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly _formBuilder = inject(FormBuilder);
  private readonly _userService = inject(UserService);
  private readonly _router = inject(Router);
  private readonly _route = inject(ActivatedRoute);
  private readonly _messageService = inject(MessageService);

  resetPasswordForm: FormGroup;
  isLoading = false;
  token: string | null = null;
  email: string | null = null;

  constructor() {
    this.resetPasswordForm = this._formBuilder.group(
      {
        newPassword: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validators: this.passwordMatchValidator,
      }
    );
  }

  ngOnInit(): void {
    this.token = this._route.snapshot.queryParamMap.get('token');
    this.email = this._route.snapshot.queryParamMap.get('email');

    if (!this.token) {
      this._messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Token de réinitialisation manquant ou invalide.',
      });
      this._router.navigate(['/login']);
    }
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');

    if (newPassword && confirmPassword && newPassword.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }

    if (confirmPassword?.hasError('passwordMismatch')) {
      delete confirmPassword.errors?.['passwordMismatch'];
      const errorsCount = Object.keys(confirmPassword.errors || {}).length;
      if (errorsCount === 0) {
        confirmPassword.setErrors(null);
      }
    }

    return null;
  }

  onSubmit(): void {
    if (this.resetPasswordForm.valid && this.token && this.email) {
      this.isLoading = true;

      const resetPasswordData: ResetPasswordDTO = {
        token: this.token,
        email: this.email,
        newPassword: this.resetPasswordForm.value.newPassword,
        confirmPassword: this.resetPasswordForm.value.confirmPassword,
      };

      this._userService.resetPassword(resetPasswordData).subscribe({
        next: () => {
          this._messageService.add({
            severity: 'success',
            summary: 'Mot de passe réinitialisé avec succès!',
            detail: 'Vous allez être redirigé.e vers la page de connexion',
          });
          this.isLoading = false;
          // Redirect to login after a delay
          setTimeout(() => {
            this._router.navigate(['/login']);
          }, 2000);
        },
        error: (error: any) => {
          this._messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Le token pourrait être expiré.',
          });
          this.isLoading = false;
          console.error('Reset password error:', error);
        },
      });
    } else {
      this._markFormGroupTouched();
    }
  }

  private _markFormGroupTouched(): void {
    Object.keys(this.resetPasswordForm.controls).forEach(key => {
      const control = this.resetPasswordForm.get(key);
      control?.markAsTouched();
    });
  }

  // Getter methods for error handling
  get newPasswordError(): string | null {
    const field = this.resetPasswordForm.get('newPassword');
    if (field?.touched && field?.errors) {
      if (field.errors['required']) return 'Ce champ est requis';
      if (field.errors['minlength']) {
        const requiredLength = field.errors['minlength'].requiredLength;
        return `Ce champ doit contenir au moins ${requiredLength} caractères`;
      }
    }
    return null;
  }

  get confirmPasswordError(): string | null {
    const field = this.resetPasswordForm.get('confirmPassword');
    if (field?.touched && field?.errors) {
      if (field.errors['required']) return 'Ce champ est requis';
      if (field.errors['passwordMismatch']) return 'Les mots de passe ne correspondent pas';
    }
    return null;
  }

  get hasNewPasswordError(): boolean {
    const field = this.resetPasswordForm.get('newPassword');
    return !!(field?.touched && field?.errors);
  }

  get hasConfirmPasswordError(): boolean {
    const field = this.resetPasswordForm.get('confirmPassword');
    return !!(field?.touched && field?.errors);
  }
}

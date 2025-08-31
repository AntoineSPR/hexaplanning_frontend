import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { UserService } from '../../services/user.service';
import { ForgotPasswordDTO } from '../../models/forgotPasswordDTO.model';

const MIN_PASSWORD_LENGTH = 6;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, ButtonModule, CardModule, InputTextModule, PasswordModule, ToastModule, DialogModule],
  providers: [MessageService],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly _formBuilder = inject(FormBuilder);
  private readonly _userService = inject(UserService);
  private readonly _router = inject(Router);
  private readonly _messageService = inject(MessageService);

  loginForm: FormGroup;
  forgotPasswordForm: FormGroup;
  isLoading = false;
  isForgotPasswordLoading = false;
  forgotPasswordModalVisible = false;

  constructor() {
    this.loginForm = this._formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
    });

    this.forgotPasswordForm = this._formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.isLoading = true;

      const loginData = {
        email: this.loginForm.value.email,
        password: this.loginForm.value.password,
      };

      this._userService.loginUser(loginData).subscribe({
        next: () => {
          this._messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: 'Connexion réussie!',
          });
          this.isLoading = false;
          this._router.navigate(['/']);
        },
        error: (error: any) => {
          this._messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Email ou mot de passe incorrect. Veuillez réessayer.',
          });
          this.isLoading = false;
          console.error('Login error:', error);
        },
      });
    } else {
      this._markFormGroupTouched();
    }
  }

  private _markFormGroupTouched(): void {
    Object.keys(this.loginForm.controls).forEach(key => {
      const control = this.loginForm.get(key);
      control?.markAsTouched();
    });
  }

  get emailError(): string | null {
    const field = this.loginForm.get('email');

    if (field?.touched && field?.errors) {
      if (field.errors['required']) {
        return 'Ce champ est requis';
      }
      if (field.errors['email']) {
        return 'Veuillez entrer une adresse email valide';
      }
    }

    return null;
  }

  get passwordError(): string | null {
    const field = this.loginForm.get('password');

    if (field?.touched && field?.errors) {
      if (field.errors['required']) {
        return 'Ce champ est requis';
      }
      if (field.errors['minlength']) {
        const requiredLength = field.errors['minlength'].requiredLength;
        return `Ce champ doit contenir au moins ${requiredLength} caractères`;
      }
    }

    return null;
  }

  get hasEmailError(): boolean {
    const field = this.loginForm.get('email');
    return !!(field?.touched && field?.errors);
  }

  get hasPasswordError(): boolean {
    const field = this.loginForm.get('password');
    return !!(field?.touched && field?.errors);
  }

  // Forgot Password Modal Methods
  openForgotPasswordModal(): void {
    this.forgotPasswordModalVisible = true;
    this.forgotPasswordForm.reset();
    // Pre-fill email if available from login form
    if (this.loginForm.get('email')?.value) {
      this.forgotPasswordForm.patchValue({
        email: this.loginForm.get('email')?.value,
      });
    }
  }

  closeForgotPasswordModal(): void {
    this.forgotPasswordModalVisible = false;
    this.forgotPasswordForm.reset();
    this.isForgotPasswordLoading = false;
  }

  onSubmitForgotPassword(): void {
    if (this.forgotPasswordForm.valid) {
      this.isForgotPasswordLoading = true;

      const forgotPasswordData: ForgotPasswordDTO = {
        email: this.forgotPasswordForm.value.email,
      };

      this._userService.forgotPassword(forgotPasswordData).subscribe({
        next: () => {
          this._messageService.add({
            severity: 'success',
            summary: 'Email envoyé',
            detail: 'Un email de réinitialisation a été envoyé à votre adresse email.',
          });
          this.closeForgotPasswordModal();
        },
        error: (error: any) => {
          this._messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Une erreur est survenue. Vérifiez votre adresse email.',
          });
          this.isForgotPasswordLoading = false;
          console.error('Forgot password error:', error);
        },
      });
    } else {
      this._markForgotPasswordFormTouched();
    }
  }

  private _markForgotPasswordFormTouched(): void {
    Object.keys(this.forgotPasswordForm.controls).forEach(key => {
      const control = this.forgotPasswordForm.get(key);
      control?.markAsTouched();
    });
  }

  // Forgot Password Form Getters
  get forgotPasswordEmailError(): string | null {
    const field = this.forgotPasswordForm.get('email');

    if (field?.touched && field?.errors) {
      if (field.errors['required']) {
        return 'Ce champ est requis';
      }
      if (field.errors['email']) {
        return 'Veuillez entrer une adresse email valide';
      }
    }

    return null;
  }

  get hasForgotPasswordEmailError(): boolean {
    const field = this.forgotPasswordForm.get('email');
    return !!(field?.touched && field?.errors);
  }
}

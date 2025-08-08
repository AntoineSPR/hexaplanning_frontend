import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { UserService } from '../../services/user.service';
import { UserCreateDTO } from '../../models/userCreateDTO.model';

const MIN_NAME_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 6;
const NO_ERRORS = 0;

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, ButtonModule, CardModule, InputTextModule, PasswordModule, ToastModule],
  providers: [MessageService],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly _formBuilder = inject(FormBuilder);
  private readonly _userService = inject(UserService);
  private readonly _router = inject(Router);
  private readonly _messageService = inject(MessageService);

  registerForm: FormGroup;
  isLoading = false;

  constructor() {
    this.registerForm = this._formBuilder.group(
      {
        firstName: ['', [Validators.required, Validators.minLength(MIN_NAME_LENGTH)]],
        lastName: ['', [Validators.required, Validators.minLength(MIN_NAME_LENGTH)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(form: FormGroup): ValidationErrors | null {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');

    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }

    if (confirmPassword?.hasError('passwordMismatch')) {
      delete confirmPassword.errors?.['passwordMismatch'];
      const errorsCount = Object.keys(confirmPassword.errors || {}).length;
      if (errorsCount === NO_ERRORS) {
        confirmPassword.setErrors(null);
      }
    }

    return null;
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      this.isLoading = true;

      const userData: UserCreateDTO = {
        firstName: this.registerForm.value.firstName,
        lastName: this.registerForm.value.lastName,
        email: this.registerForm.value.email,
        password: this.registerForm.value.password,
      };

      this._userService.createUser(userData).subscribe({
        next: () => {
          this._messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: 'Votre compte a été créé avec succès!',
          });
          this.isLoading = false;
          // Navigate to login or dashboard after successful registration
          // this._router.navigate(['/login']);
        },
        error: error => {
          this._messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Une erreur est survenue lors de la création du compte. Veuillez réessayer.',
          });
          this.isLoading = false;
          console.error('Registration error:', error);
        },
      });
    } else {
      this._markFormGroupTouched();
    }
  }

  private _markFormGroupTouched(): void {
    Object.keys(this.registerForm.controls).forEach(key => {
      const control = this.registerForm.get(key);
      control?.markAsTouched();
    });
  }

  get firstNameError(): string | null {
    const field = this.registerForm.get('firstName');

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

  get lastNameError(): string | null {
    const field = this.registerForm.get('lastName');

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

  get emailError(): string | null {
    const field = this.registerForm.get('email');

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
    const field = this.registerForm.get('password');

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

  get confirmPasswordError(): string | null {
    const field = this.registerForm.get('confirmPassword');

    if (field?.touched && field?.errors) {
      if (field.errors['required']) {
        return 'Ce champ est requis';
      }
      if (field.errors['passwordMismatch']) {
        return 'Les mots de passe ne correspondent pas';
      }
    }

    return null;
  }

  get hasFirstNameError(): boolean {
    const field = this.registerForm.get('firstName');
    return !!(field?.touched && field?.errors);
  }

  get hasLastNameError(): boolean {
    const field = this.registerForm.get('lastName');
    return !!(field?.touched && field?.errors);
  }

  get hasEmailError(): boolean {
    const field = this.registerForm.get('email');
    return !!(field?.touched && field?.errors);
  }

  get hasPasswordError(): boolean {
    const field = this.registerForm.get('password');
    return !!(field?.touched && field?.errors);
  }

  get hasConfirmPasswordError(): boolean {
    const field = this.registerForm.get('confirmPassword');
    return !!(field?.touched && field?.errors);
  }

  getFieldError(fieldName: string): string | null {
    const field = this.registerForm.get(fieldName);

    if (field?.touched && field?.errors) {
      if (field.errors['required']) {
        return 'Ce champ est requis';
      }
      if (field.errors['email']) {
        return 'Veuillez entrer une adresse email valide';
      }
      if (field.errors['minlength']) {
        const requiredLength = field.errors['minlength'].requiredLength;
        return `Ce champ doit contenir au moins ${requiredLength} caractères`;
      }
      if (field.errors['passwordMismatch']) {
        return 'Les mots de passe ne correspondent pas';
      }
    }

    return null;
  }

  hasFieldError(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!(field?.touched && field?.errors);
  }
}

import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { MenuComponent } from 'src/app/components/menu/menu.component';
import { UserService } from 'src/app/services/user.service';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { ChangePasswordDTO } from 'src/app/models/changePasswordDTO.model';

const MIN_PASSWORD_LENGTH = 6;

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MenuComponent, ButtonModule, DialogModule, CardModule, InputTextModule, PasswordModule, ToastModule],
  providers: [MessageService],
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.scss'],
})
export class SettingsPageComponent {
  private readonly _userService = inject(UserService);
  private readonly _router = inject(Router);
  private readonly _formBuilder = inject(FormBuilder);
  private readonly _messageService = inject(MessageService);

  user = this._userService.user;

  passwordModalVisible = false;
  passwordForm: FormGroup;
  isLoading = false;

  constructor() {
    this.passwordForm = this._formBuilder.group(
      {
        currentPassword: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
        newPassword: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(form: FormGroup): any {
    const newPassword = form.get('newPassword');
    const confirmPassword = form.get('confirmPassword');

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

  openPasswordModal(): void {
    this.passwordModalVisible = true;
    this.passwordForm.reset();
  }

  closePasswordModal(): void {
    this.passwordModalVisible = false;
    this.passwordForm.reset();
    this.isLoading = false;
  }

  onSubmitPasswordChange(): void {
    if (this.passwordForm.valid) {
      this.isLoading = true;

      const passwordData: ChangePasswordDTO = {
        currentPassword: this.passwordForm.value.currentPassword,
        newPassword: this.passwordForm.value.newPassword,
        confirmPassword: this.passwordForm.value.confirmPassword,
      };

      this._userService.changePassword(passwordData).subscribe({
        next: () => {
          this._messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: 'Mot de passe modifié avec succès!',
          });
          this.closePasswordModal();
        },
        error: (error: any) => {
          this._messageService.add({
            severity: 'error',
            summary: 'Erreur lors de la modification du mot de passe.',
            detail: 'Vérifiez votre mot de passe actuel.',
          });
          this.isLoading = false;
          console.error('Password change error:', error);
        },
      });
    } else {
      this._markFormGroupTouched();
    }
  }

  private _markFormGroupTouched(): void {
    Object.keys(this.passwordForm.controls).forEach(key => {
      const control = this.passwordForm.get(key);
      control?.markAsTouched();
    });
  }

  // Getter methods for error handling
  get currentPasswordError(): string | null {
    const field = this.passwordForm.get('currentPassword');
    if (field?.touched && field?.errors) {
      if (field.errors['required']) return 'Ce champ est requis';
      if (field.errors['minlength']) {
        const requiredLength = field.errors['minlength'].requiredLength;
        return `Ce champ doit contenir au moins ${requiredLength} caractères`;
      }
    }
    return null;
  }

  get newPasswordError(): string | null {
    const field = this.passwordForm.get('newPassword');
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
    const field = this.passwordForm.get('confirmPassword');
    if (field?.touched && field?.errors) {
      if (field.errors['required']) return 'Ce champ est requis';
      if (field.errors['passwordMismatch']) return 'Les mots de passe ne correspondent pas';
    }
    return null;
  }

  get hasCurrentPasswordError(): boolean {
    const field = this.passwordForm.get('currentPassword');
    return !!(field?.touched && field?.errors);
  }

  get hasNewPasswordError(): boolean {
    const field = this.passwordForm.get('newPassword');
    return !!(field?.touched && field?.errors);
  }

  get hasConfirmPasswordError(): boolean {
    const field = this.passwordForm.get('confirmPassword');
    return !!(field?.touched && field?.errors);
  }

  logout(): void {
    this._userService.logoutUser();
    this._router.navigate(['/login']);
  }
}

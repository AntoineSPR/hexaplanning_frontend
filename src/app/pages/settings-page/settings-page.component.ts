import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MessageService } from 'primeng/api';
import { MenuComponent } from 'src/app/components/menu/menu.component';
import { UserService } from 'src/app/services/user.service';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { ChangePasswordDTO } from 'src/app/models/changePasswordDTO.model';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { apiPasswordValidator, passwordMatchValidator, getPasswordErrorMessage } from 'src/app/validators/password.validators';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MenuComponent,
    ButtonModule,
    DialogModule,
    CardModule,
    InputTextModule,
    PasswordModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.scss'],
})
export class SettingsPageComponent {
  private readonly _userService = inject(UserService);
  private readonly _router = inject(Router);
  private readonly _formBuilder = inject(FormBuilder);
  private readonly _messageService = inject(MessageService);
  private readonly _confirmationService = inject(ConfirmationService);

  user = this._userService.user;

  passwordModalVisible = false;
  passwordForm: FormGroup;
  isLoading = false;

  constructor() {
    this.passwordForm = this._formBuilder.group(
      {
        currentPassword: ['', [Validators.required, apiPasswordValidator()]],
        newPassword: ['', [Validators.required, apiPasswordValidator()]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: passwordMatchValidator('newPassword', 'confirmPassword') }
    );
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
      return getPasswordErrorMessage(field.errors);
    }
    return null;
  }

  get newPasswordError(): string | null {
    const field = this.passwordForm.get('newPassword');
    if (field?.touched && field?.errors) {
      return getPasswordErrorMessage(field.errors);
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
    this._confirmationService.confirm({
      message: 'Êtes-vous sûr.e de vouloir vous déconnecter ?',
      closable: true,
      closeOnEscape: true,
      accept: () => {
        this._userService.logoutUser();
        this._router.navigate(['/login']);
      },
    });

    // Focus management for the confirmation dialog
    setTimeout(() => {
      const acceptButton = document.querySelector('.accept-confirmation-button') as HTMLElement;
      if (acceptButton) {
        acceptButton.focus();
      }
    }, 100);
  }
}

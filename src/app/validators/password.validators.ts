import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 8,
  MIN_UNIQUE_CHARS: 1,
  REQUIRE_DIGIT: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_UPPERCASE: true,
  REQUIRE_NON_ALPHANUMERIC: true,
} as const;

/**
 * Validator that ensures password meets API requirements
 */
export function apiPasswordValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;

    if (!value) {
      return null; // Let required validator handle empty values
    }

    const errors: ValidationErrors = {};

    // Check minimum length
    if (value.length < PASSWORD_REQUIREMENTS.MIN_LENGTH) {
      errors['minLength'] = {
        requiredLength: PASSWORD_REQUIREMENTS.MIN_LENGTH,
        actualLength: value.length,
      };
    }

    // Check unique characters
    const uniqueChars = new Set(value).size;
    if (uniqueChars < PASSWORD_REQUIREMENTS.MIN_UNIQUE_CHARS) {
      errors['minUniqueChars'] = {
        requiredUniqueChars: PASSWORD_REQUIREMENTS.MIN_UNIQUE_CHARS,
        actualUniqueChars: uniqueChars,
      };
    }

    // Check for digit
    if (PASSWORD_REQUIREMENTS.REQUIRE_DIGIT && !/\d/.test(value)) {
      errors['requireDigit'] = true;
    }

    // Check for lowercase
    if (PASSWORD_REQUIREMENTS.REQUIRE_LOWERCASE && !/[a-z]/.test(value)) {
      errors['requireLowercase'] = true;
    }

    // Check for uppercase
    if (PASSWORD_REQUIREMENTS.REQUIRE_UPPERCASE && !/[A-Z]/.test(value)) {
      errors['requireUppercase'] = true;
    }

    // Check for non-alphanumeric (special characters)
    if (PASSWORD_REQUIREMENTS.REQUIRE_NON_ALPHANUMERIC && !/[^a-zA-Z0-9]/.test(value)) {
      errors['requireNonAlphanumeric'] = true;
    }

    return Object.keys(errors).length > 0 ? errors : null;
  };
}

/**
 * Get user-friendly error message for password validation errors
 * Returns the first error found for simplicity
 */
export function getPasswordErrorMessage(errors: ValidationErrors): string {
  if (errors['required']) {
    return 'Ce champ est requis';
  }

  if (errors['minLength']) {
    const requiredLength = errors['minLength'].requiredLength;
    return `Le mot de passe doit contenir au moins ${requiredLength} caractères`;
  }

  if (errors['requireDigit']) {
    return 'Le mot de passe doit contenir au moins un chiffre';
  }

  if (errors['requireLowercase']) {
    return 'Le mot de passe doit contenir au moins une lettre minuscule';
  }

  if (errors['requireUppercase']) {
    return 'Le mot de passe doit contenir au moins une lettre majuscule';
  }

  if (errors['requireNonAlphanumeric']) {
    return 'Le mot de passe doit contenir au moins un caractère spécial';
  }

  if (errors['minUniqueChars']) {
    const requiredUniqueChars = errors['minUniqueChars'].requiredUniqueChars;
    return `Le mot de passe doit contenir au moins ${requiredUniqueChars} caractère${requiredUniqueChars > 1 ? 's' : ''} unique${
      requiredUniqueChars > 1 ? 's' : ''
    }`;
  }

  return 'Le mot de passe ne respecte pas les critères requis';
}

/**
 * Get all password requirements as a formatted list for user guidance
 */
export function getPasswordRequirements(): string[] {
  return [
    `Au moins ${PASSWORD_REQUIREMENTS.MIN_LENGTH} caractères`,
    'Au moins une lettre minuscule',
    'Au moins une lettre majuscule',
    'Au moins un chiffre',
    'Au moins un caractère spécial (!@#$%^&*)',
  ];
}

/**
 * Validator for password confirmation fields
 */
export function passwordMatchValidator(passwordFieldName: string = 'password', confirmPasswordFieldName: string = 'confirmPassword'): ValidatorFn {
  return (form: AbstractControl): ValidationErrors | null => {
    const password = form.get(passwordFieldName);
    const confirmPassword = form.get(confirmPasswordFieldName);

    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ ...confirmPassword.errors, passwordMismatch: true });
      return { passwordMismatch: true };
    }

    if (confirmPassword?.hasError('passwordMismatch')) {
      const errors = { ...confirmPassword.errors };
      delete errors['passwordMismatch'];
      const errorsCount = Object.keys(errors).length;
      confirmPassword.setErrors(errorsCount === 0 ? null : errors);
    }

    return null;
  };
}

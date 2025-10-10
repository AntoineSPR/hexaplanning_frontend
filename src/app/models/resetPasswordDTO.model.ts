export interface ResetPasswordDTO {
  token: string;
  email: string;
  newPassword: string;
  confirmPassword: string;
}

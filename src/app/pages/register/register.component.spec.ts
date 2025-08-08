import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { RegisterComponent } from './register.component';
import { UserService } from '../../services/user.service';
import { UserCreateDTO } from '../../models/userCreateDTO.model';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let userService: any;
  let messageService: any;
  let router: any;

  beforeEach(async () => {
    const userServiceSpy = {
      createUser: jest.fn()
    };

    const messageServiceSpy = {
      add: jest.fn()
    };

    const routerSpy = {
      navigate: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [RegisterComponent, ReactiveFormsModule],
      providers: [
        { provide: UserService, useValue: userServiceSpy },
        { provide: MessageService, useValue: messageServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    userService = TestBed.inject(UserService);
    messageService = TestBed.inject(MessageService);
    router = TestBed.inject(Router);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it.skip('should initialize form with empty values', () => {
    expect(component.registerForm.get('firstName')?.value).toBe('');
    expect(component.registerForm.get('lastName')?.value).toBe('');
    expect(component.registerForm.get('email')?.value).toBe('');
    expect(component.registerForm.get('password')?.value).toBe('');
    expect(component.registerForm.get('confirmPassword')?.value).toBe('');
  });

  it.skip('should validate required fields', () => {
    const form = component.registerForm;
    
    form.get('firstName')?.markAsTouched();
    form.get('lastName')?.markAsTouched();
    form.get('email')?.markAsTouched();
    form.get('password')?.markAsTouched();
    form.get('confirmPassword')?.markAsTouched();

    expect(component.hasFirstNameError).toBeTruthy();
    expect(component.hasLastNameError).toBeTruthy();
    expect(component.hasEmailError).toBeTruthy();
    expect(component.hasPasswordError).toBeTruthy();
    expect(component.hasConfirmPasswordError).toBeTruthy();
  });

  it.skip('should validate email format', () => {
    const emailControl = component.registerForm.get('email');
    emailControl?.setValue('invalid-email');
    emailControl?.markAsTouched();

    expect(component.hasEmailError).toBeTruthy();
    expect(component.emailError).toBe('Veuillez entrer une adresse email valide');
  });

  it.skip('should validate password match', () => {
    const form = component.registerForm;
    form.get('password')?.setValue('password123');
    form.get('confirmPassword')?.setValue('different123');
    form.get('confirmPassword')?.markAsTouched();

    component.passwordMatchValidator(form);

    expect(component.hasConfirmPasswordError).toBeTruthy();
    expect(component.confirmPasswordError).toBe('Les mots de passe ne correspondent pas');
  });

  it.skip('should call userService.createUser on valid form submission', () => {
    const userData: UserCreateDTO = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'password123'
    };

    userService.createUser.mockReturnValue(of(userData));

    component.registerForm.patchValue({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: userData.password,
      confirmPassword: userData.password
    });

    component.onSubmit();

    expect(userService.createUser).toHaveBeenCalledWith(userData);
  });

  it.skip('should show success message on successful registration', () => {
    const userData: UserCreateDTO = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'password123'
    };

    userService.createUser.mockReturnValue(of(userData));

    component.registerForm.patchValue({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: userData.password,
      confirmPassword: userData.password
    });

    component.onSubmit();

    expect(messageService.add).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Succès',
      detail: 'Votre compte a été créé avec succès!'
    });
  });

  it.skip('should show error message on registration failure', () => {
    const userData: UserCreateDTO = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'password123'
    };

    userService.createUser.mockReturnValue(throwError(() => new Error('Registration failed')));

    component.registerForm.patchValue({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: userData.password,
      confirmPassword: userData.password
    });

    component.onSubmit();

    expect(messageService.add).toHaveBeenCalledWith({
      severity: 'error',
      summary: 'Erreur',
      detail: 'Une erreur est survenue lors de la création du compte. Veuillez réessayer.'
    });
  });

  it.skip('should not submit invalid form', () => {
    component.registerForm.patchValue({
      firstName: '',
      lastName: '',
      email: 'invalid-email',
      password: '',
      confirmPassword: ''
    });

    component.onSubmit();

    expect(userService.createUser).not.toHaveBeenCalled();
  });
});

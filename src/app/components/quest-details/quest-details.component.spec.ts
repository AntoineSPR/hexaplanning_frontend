import { ComponentFixture, TestBed } from '@angular/core/testing';
import { expect } from '@jest/globals';
import { QuestDetailsComponent } from './quest-details.component';
import { ReactiveFormsModule } from '@angular/forms';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { DatePipe } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';

registerLocaleData(localeFr);

describe('QuestDetailsComponent', () => {
  let component: QuestDetailsComponent;
  let fixture: ComponentFixture<QuestDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuestDetailsComponent, ReactiveFormsModule], providers: [provideHttpClient(), DatePipe, { provide: LOCALE_ID, useValue: 'fr-FR' }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuestDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuestCardComponent } from './quest-card.component';
import { QuestPriority, Quest } from '../../models/quest.model';
import { expect, jest } from '@jest/globals';
import { ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';

describe.skip('QuestCardComponent', () => {
  let component: QuestCardComponent;
  let fixture: ComponentFixture<QuestCardComponent>;

  const mockQuest: Quest = {
    id: 1,
    title: 'Test Quest',
    estimatedTime: 60,
    priority: QuestPriority.PRIMARY,
    isDone: false,
    isAssigned: false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, QuestCardComponent] // Ajout du composant et du module form
    }).compileComponents();

    fixture = TestBed.createComponent(QuestCardComponent);
    component = fixture.componentInstance;
    component.quest = mockQuest;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // it('should emit statusChange event when toggleStatus() is called', () => {
  //   jest.spyOn(component.statusChange, 'emit');
  //   component.toggleStatus();
  //   expect(component.statusChange.emit).toHaveBeenCalledWith(mockQuest.id);
  // });

  // it('should emit priorityChange event when updatePriority() is called', () => {
  //   jest.spyOn(component.priorityChange, 'emit');
  //   component.priorityControl.setValue(QuestPriority.SECONDARY);
  //   component.updatePriority();
  //   expect(component.priorityChange.emit).toHaveBeenCalledWith({
  //     id: mockQuest.id,
  //     priority: QuestPriority.SECONDARY,
  //   });
  // });

  it('should display the quest title in the template', () => {
    fixture.detectChanges();
    const titleElement = fixture.debugElement.query(By.css('.quest-title')).nativeElement;
    expect(titleElement.textContent).toContain(mockQuest.title);
  });

  // it('should trigger toggleStatus() when clicking the checkbox', () => {
  //   jest.spyOn(component, 'toggleStatus');
  //   const checkbox = fixture.debugElement.query(By.css('.quest-checkbox')).nativeElement;
  //   checkbox.click();
  //   fixture.detectChanges();
  //   expect(component.toggleStatus).toHaveBeenCalled();
  // });

  // it('should trigger updatePriority() when changing the priority select', () => {
  //   // Espionner la méthode updatePriority
  //   jest.spyOn(component, 'updatePriority');

  //   // Définir une nouvelle valeur pour le select
  //   const select = fixture.debugElement.query(By.css('.quest-priority-select')).nativeElement;
  //   select.value = QuestPriority.SECONDARY; // Choisir une nouvelle priorité
  //   select.dispatchEvent(new Event('change')); // Déclencher l'événement de changement

  //   fixture.detectChanges(); // Rafraîchir les changements dans le DOM

  //   // Vérifier que la méthode updatePriority a bien été appelée
  //   expect(component.updatePriority).toHaveBeenCalled();
  // });

});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuestContainerComponent } from './quest-container.component';

describe('QuestContainerComponent', () => {
  let component: QuestContainerComponent;
  let fixture: ComponentFixture<QuestContainerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuestContainerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuestContainerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

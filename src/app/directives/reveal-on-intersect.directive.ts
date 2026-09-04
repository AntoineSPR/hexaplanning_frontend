import { Directive, ElementRef, EventEmitter, inject, OnDestroy, OnInit, Output } from '@angular/core';

// Fires once when its host element enters the viewport - meant to sit as an invisible sentinel
// right after a truncated/sliced list, so a scroll consumer can grow how much of that list is
// actually rendered instead of mounting everything at once (see QuestSortedListComponent).
// rootMargin starts the callback a bit before the sentinel is physically on screen (the same
// "load a little ahead of the edge" feel infinite-scroll feeds like YouTube's use), so the next
// batch is already rendered by the time the user actually scrolls that far.
@Directive({
  selector: '[appRevealOnIntersect]',
  standalone: true,
})
export class RevealOnIntersectDirective implements OnInit, OnDestroy {
  @Output() appRevealOnIntersect = new EventEmitter<void>();

  private readonly _elementRef = inject(ElementRef<HTMLElement>);
  private _observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    this._observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          this.appRevealOnIntersect.emit();
        }
      },
      { rootMargin: '400px' }
    );
    this._observer.observe(this._elementRef.nativeElement);
  }

  ngOnDestroy(): void {
    this._observer?.disconnect();
  }
}

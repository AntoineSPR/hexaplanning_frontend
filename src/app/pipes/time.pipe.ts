/* eslint-disable newline-per-chained-call */
import { Pipe, PipeTransform } from '@angular/core';

const MAX_LENGTH = 2;

@Pipe({ name: 'time', standalone: true })
export class TimePipe implements PipeTransform {
  transform(date: Date): string {
    if (!date) return '00:00';

    const hours = date.getHours().toString().padStart(MAX_LENGTH, '0');
    const minutes = date.getMinutes().toString().padStart(MAX_LENGTH, '0');
    return `${hours}:${minutes}`;
  }
}

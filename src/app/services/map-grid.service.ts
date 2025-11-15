import { Injectable } from '@angular/core';
import { Hex } from '../models/hex.model';

@Injectable({ providedIn: 'root' })
export class MapGridService {
  // Create the axial hexes by outward rings from 0..maxExpansion
  generateHexes(maxExpansion: number, size: number, mapHeight: number): Hex[] {
    const hexes: Hex[] = [];

    for (let level = 0; level <= maxExpansion; level++) {
      for (let q = 0; q <= level; q++) {
        for (let r = Math.max(-level, -q); r <= Math.min(level, level - q); r++) {
          const s = -q - r;
          const maxAbs = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
          if (maxAbs === level) {
            const { cx, cy } = this.hexToPixel(q, r, size, mapHeight);
            hexes.push({ q, r, s, cx, cy, level });
          }
        }
      }
    }

    return hexes;
  }

  // Convert axial coords to pixel center
  hexToPixel(q: number, r: number, size: number, mapHeight: number): { cx: number; cy: number } {
    const x = size * Math.sqrt(3) * (q + r / 2);
    const y = ((size * 3) / 2) * r;
    return {
      cx: x + 45, // left padding
      cy: y + mapHeight / 2, // vertical centering
    };
  }

  // Points for a regular hex centered at (cx, cy)
  getHexPoints(cx: number, cy: number, size: number, offset: number = 0): string {
    const adjustedSize = size + offset;
    const points: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = cx + adjustedSize * Math.cos(angle);
      const y = cy + adjustedSize * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  }

  // Path for a radial progress arc clipped by the hex
  getProgressPath(cx: number, cy: number, size: number, advancement: number): string {
    if (advancement <= 0) return '';
    if (advancement >= 100) return this.getHexPoints(cx, cy, size);

    const percentage = Math.min(advancement, 100) / 100;
    const startAngle = -Math.PI / 2; // top
    const endAngle = startAngle + 2 * Math.PI * percentage;

    const startX = cx + size * Math.cos(startAngle);
    const startY = cy + size * Math.sin(startAngle);
    const endX = cx + size * Math.cos(endAngle);
    const endY = cy + size * Math.sin(endAngle);

    const largeArcFlag = percentage > 0.5 ? 1 : 0;

    if (percentage === 1) {
      return `M ${cx},${cy} m -${size},0 a ${size},${size} 0 1,1 ${size * 2},0 a ${size},${size} 0 1,1 -${size * 2},0`;
    } else {
      return `M ${cx} ${cy} L ${startX} ${startY} A ${size} ${size} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
    }
  }
}

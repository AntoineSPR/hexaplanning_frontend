import { Injectable } from '@angular/core';

export interface SvgZoomOptions {
  scaleMin?: number;
  scaleMax?: number;
  // Called when interaction starts/ends
  onStart?: () => void;
  onEnd?: () => void;
  // Called for every transform update
  onTransform?: (t: { x: number; y: number; k: number }) => void;
}

export interface SvgZoomHandle {
  reset(): void;
  setTransform(x: number, y: number, k: number): void;
  destroy(): void;
}

@Injectable({ providedIn: 'root' })
export class SvgZoomService {
  /**
   * Attaches d3-zoom to the given SVG and camera group elements.
   * Returns a handle to control and teardown the behavior.
   */
  async attach(svgEl: SVGSVGElement, cameraGroupEl: SVGGElement, opts: SvgZoomOptions = {}): Promise<SvgZoomHandle> {
    const [{ zoom, zoomIdentity }, selection] = await Promise.all([import('d3-zoom'), import('d3-selection')]);

    const svgSel: any = selection.select(svgEl as unknown as Element);
    const camSel: any = selection.select(cameraGroupEl as unknown as Element);

    const behavior: any = zoom()
      .scaleExtent([opts.scaleMin ?? 0.5, opts.scaleMax ?? 3])
      // Disable double-click zoom; keep other gestures
      .filter((ev: any) => ev.type !== 'dblclick')
      .on('start', () => opts.onStart && opts.onStart())
      .on('zoom', (ev: any) => {
        const t = ev.transform;
        camSel.attr('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
        opts.onTransform && opts.onTransform({ x: t.x, y: t.y, k: t.k });
      })
      .on('end', () => opts.onEnd && opts.onEnd());

    svgSel.call(behavior);

    const handle: SvgZoomHandle = {
      reset() {
        const t = zoomIdentity.translate(0, 0).scale(1);
        svgSel.call(behavior.transform, t);
      },
      setTransform(x: number, y: number, k: number) {
        const t = zoomIdentity.translate(x, y).scale(k);
        svgSel.call(behavior.transform, t);
      },
      destroy() {
        // d3-zoom provides on handlers; to teardown, remove listeners by setting null handlers
        behavior.on('start', null).on('zoom', null).on('end', null);
      },
    };

    return handle;
  }
}

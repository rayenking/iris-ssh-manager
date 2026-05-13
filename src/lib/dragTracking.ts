export type DragKind = 'tab' | 'connection';

let activeDragKind: DragKind | null = null;
let activeDragPayload: string | null = null;

export function beginDrag(kind: DragKind, payload: string): void {
  activeDragKind = kind;
  activeDragPayload = payload;
}

export function endDrag(): void {
  activeDragKind = null;
  activeDragPayload = null;
}

export function getActiveDragKind(): DragKind | null {
  return activeDragKind;
}

export function getActiveDragPayload(): string | null {
  return activeDragPayload;
}

export function isDragActive(kind: DragKind): boolean {
  return activeDragKind === kind;
}

export function isAnyDragActive(...kinds: DragKind[]): boolean {
  return activeDragKind !== null && kinds.includes(activeDragKind);
}

if (typeof window !== 'undefined') {
  const reset = () => endDrag();
  window.addEventListener('dragend', reset);
  window.addEventListener('drop', reset);
}

export as namespace React;
export type SetStateAction<T> = T | ((previous: T) => T);
export type Dispatch<T> = (value: T) => void;
export interface MutableRefObject<T> { current: T; }
export interface PointerEvent<T> { currentTarget: T; clientX: number; clientY: number; pointerId: number; }
export type SVGProps<T> = Record<string, unknown> & { ref?: unknown };
export type ReactNode = unknown;
export type ComponentType<P = Record<string, unknown>> = (props: P) => any;
export function useState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
export function useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
export function useMemo<T>(factory: () => T, dependencies: readonly unknown[]): T;
export function useCallback<T extends (...args: any[]) => any>(callback: T, dependencies: readonly unknown[]): T;
export function useRef<T>(initial: T): MutableRefObject<T>;
declare global {
  namespace JSX {
    type Element = any;
    interface IntrinsicElements { [element: string]: any; }
  }
}

type SetState<T> = (partial: Partial<T> | T | ((state: T) => Partial<T> | T)) => void;
type GetState<T> = () => T;
export function persist<T>(initializer: (set: SetState<T>, get: GetState<T>) => T, options: Record<string, unknown>): unknown;
export function createJSONStorage(factory: () => { getItem(name: string): string | null; setItem(name: string, value: string): void; removeItem(name: string): void }): unknown;

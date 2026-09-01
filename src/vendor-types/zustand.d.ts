export interface BoundStore<T> { (): T; getState(): T; }
export function create<T>(): (initializer: unknown) => BoundStore<T>;

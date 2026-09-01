export function describe(name: string, callback: () => void): void;
export function it(name: string, callback: () => void | Promise<void>): void;
export function expect(value: unknown): {
  toBe(value: unknown): void; toEqual(value: unknown): void; toContain(value: unknown): void;
  toBeGreaterThan(value: number): void; toHaveLength(value: number): void; toHaveProperty(value: string): void; toHaveBeenCalledTimes(value: number): void;
  not: { toHaveProperty(value: string): void };
  toMatchObject(value: unknown): void;
  resolves: { toMatchObject(value: unknown): Promise<void> };
};
export const vi: { fn<T extends (...args: never[]) => unknown>(implementation?: T): T & { toHaveBeenCalledTimes?: never } };

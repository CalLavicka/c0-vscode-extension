import * as path from "path";

export type Left<T> = { tag: "left", error: T};
export type Right<T> = { tag: "right", result: T};
export type Either<T, R> = Left<T> | Right<R>;

export function Left<T>(value: T): Left<T> {
  return { tag: "left", error: value };
}

export function Right<T>(value: T): Right<T> {
  return { tag: "right", result: value };
}

export type Nothing = { hasValue: false };
export type Just<T> = { hasValue: true, value: T };
export type Maybe<T> = Nothing | Just<T>;

export const Nothing: Nothing = { hasValue: false };
export const Just: <T>(value: T) => Just<T> = value => ({ hasValue: true, value: value });

export const enum Ordering {
  Less = -1,
  Equal = 0,
  Greater = 1
}

/** Returns an OS-specific path to the C0 library header location */
export function getLibpath(): string {
  return path.join(__dirname, 'c0lib');
}

export type Left<T> = { tag: "left", error: T};
export type Right<T> = { tag: "right", result: T};
export type Either<T, R> = Left<T> | Right<R>;

export type Nothing = { hasValue: false };
export type Just<T> = { hasValue: true, value: T };
export type Maybe<T> = Nothing | Just<T>;

export const Nothing: Nothing = { hasValue: false };
export const Just: <T>(value: T) => Just<T> = value => ({ hasValue: true, value: value });
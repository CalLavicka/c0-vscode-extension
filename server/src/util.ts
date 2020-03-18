import * as path from "path";
import { URI } from "vscode-uri";

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

/**
 * Represents a set of files.
 * When conducting operations, each
 * file is normalized using vscode-uri 
 */
export class FileSet {
  private files: Set<string> = new Set<string>();

  constructor(source: undefined | FileSet | Iterable<string>) {
    if (source === undefined) return;

    if (source instanceof FileSet) {
      source.forEach(a => this.add(a));
    }
    else {
      for (const file of source) {
        this.add(file);
      }
    }
  }

  public add(fileName: string): void {
    const uri = URI.parse(fileName).toString();
    this.files.add(uri);
  }

  public has(fileName: string): boolean {
    const uri = URI.parse(fileName).toString();
    return this.files.has(fileName);
  }

  public forEach(f: (a: string) => void) {
    this.files.forEach((a, _, __) => f(a));
  }
}

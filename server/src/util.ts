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

/**
 * Simple dynamic programming algorithm taken from 15-210 lecture notes
 * to calculate the minimum edit distance between strings 'S' and 'T',
 * where an 'edit' is an insertion or deletion of one character
 */
export function editDistance(S: string, T: string): number {
  const n = S.length + 1; // Memotable rows
  const m = T.length + 1; // Memotable cols

  const memo: (number | undefined)[] = Array(n * m);

  function loop(i: number, j: number): number {
    const index = i * m + j;
    const lookup = memo[index];

    if (lookup === undefined) {
      const result = loop2(i, j);
      memo[index] = result;
      return result;
    }
    else {
      return lookup;
    }
  }

  function loop2(i: number, j: number): number {
    if (i === 0) return j;
    if (j === 0) return i;

    if (S[i - 1] == T[j - 1]) {
      return loop(i - 1, j - 1);
    }
    else {
      return 1 + Math.min(loop(i, j - 1), loop(i - 1, j));
    }
  }

  return loop(S.length, T.length);
}

/**
 * Finds strings from 'possibleValues' which are 'close' to 'target'
 * 
 * @param target 
 * The string to find matches for
 * @param possibleValues 
 * List of potential candidates to check against. Duplicates will
 * not be considered
 * @param numMatches 
 * Maximum number of potential matches to return.
 * The returned array will not be longer than this.
 */
export function bestMatches(target: string, possibleValues: string[], numMatches: number = 3): string[] {
  return [...new Set(possibleValues)]
    .map(str => ({ str, score: editDistance(target, str) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, numMatches)
    .map(v => v.str);
}

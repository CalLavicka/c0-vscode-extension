import * as vscode from "vscode-languageserver";
import { fromVscodePosition, toVscodePosition } from "./ast";
import * as nearley from "nearley";
import * as exp from "./expression-rules";
import * as parsed from "./parse/parsedsyntax";

export const enum CompletionContextKind {
  StructAccess,
  FunctionCall
}

export type CompletionResult =
  | StructAccess
  | FunctionCall
  | null;

export interface StructAccess {
  tag: CompletionContextKind.StructAccess;
  expr: parsed.Expression;
}

export interface FunctionCall {
  tag: CompletionContextKind.FunctionCall;
  name: string;
  argumentNumber: number;
}

function scanExpression(source: string, index: number) {
  let parenStack = 0;

  let pos;
  for (pos = index; pos >= 0; pos--) {
    const c = source[pos];

    if (c === ")") parenStack++;
    if (c === "(") {
      if (parenStack === 0) break; else parenStack--;
    }
    if (c === "=") break;
    if (c === ";") break;

    if (source.startsWith("return", pos - 6)) break;
  }
  return pos < 0 ? "" : source.slice(pos + 1, index).trim();
}

function scanFunctionName(source: string, index: number) {
  let pos;
  for (pos = index; pos >= 0; pos--) {
    if (!/[A-Za-z0-9_]/.test(source[pos])) break;
  }

  return pos < 0 ? "" : source.slice(pos + 1, index + 1).trim();
}

export function getCompletionContext(source: string, index: number): CompletionResult {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(exp.default));
  // Ignore errors 
  (<any>parser).reportError = () => "";
  
  // Meaningful character to use are either:
  // - left paren (function call or casted expression)
  // - comma (function argument, we can skip to the left paren and then use that)
  // - struct dereference (-> or .)

  let pos = index;
  // Skip whitespace
  while (source[pos] === " ") pos--;

  // Struct access must be at the cursor (barring whitespace)
  if (source.startsWith("->", pos - 1)) {
    // Scan backwards for as much expression as we can get, either
    // to a left paren (function call), left bracket (array index),
    // comma (function argument), or equals sign (assignment)
    const expressionText = scanExpression(source, pos - 1);

    try {
      parser.feed(expressionText);
      const results = parser.finish();
      console.assert(results && results.length === 1);

      return {
        tag: CompletionContextKind.StructAccess,
        expr: results[0]
      };
    }
    catch (e) {
      // nothing
    }
  }

  // If we are in a function call we need to know what argument we are in
  let parenStack = 0;
  let argumentNumber = 0;

  // We possibly look for 2 character substrings,
  // so we need to stop at index 1 
  for (pos = index; pos >= 1; pos--) {
    if (source[pos] === ";") return null;
    if (source[pos] === "," && parenStack === 0) argumentNumber++;
    if (source[pos] === ")") parenStack++;
    if (source[pos] === "(") {
      if (parenStack === 0) {
        // Possible function call 
        const functionName = scanFunctionName(source, pos - 1);
        return functionName === "" ? null : { 
          tag: CompletionContextKind.FunctionCall,
          name: functionName,
          argumentNumber: argumentNumber
        };
      }
      else parenStack--;
    }
  }

  return null;
}

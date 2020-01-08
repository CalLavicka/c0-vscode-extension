import * as vscode from "vscode-languageserver";
import { fromVscodePosition, toVscodePosition } from "./ast";
import * as nearley from "nearley";
import * as exp from "./expression-rules";
import * as parsed from "./parse/parsedsyntax";

const enum CompletionContextKind {
  StructAccess,
  FunctionCall
}

interface StructAccess {
  tag: CompletionContextKind.StructAccess;
  expr: parsed.Expression;
}

function scan(source: string, index: number) {
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

export function getCompletionContext(source: string, index: number): StructAccess | null {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(exp.default));
  // Ignore errors 
  (<any>parser).reportError = () => "";
  

  // Meaningful character to use are either:
  // - left paren (function call or casted expression)
  // - comma (function argument, we can skip to the left paren and then use that)
  // - struct dereference (-> or .)

  // We possibly look for 2 character substrings,
  // so we need to stop at index 1 
  for (let pos = index; pos >= 1; pos--) {
    if (source[pos] === ";") return null;
    if (source.startsWith("->", pos - 1)) {
      // Scan backwards for as much expression as we can get, either
      // to a left paren (function call), left bracket (array index),
      // comma (function argument), or equals sign (assignment)
      const expressionText = scan(source, pos - 1);

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
  }

  return null;
}

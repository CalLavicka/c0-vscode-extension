/**
 * Code to check the program for any syntax, parse errors.
 * Full disclaimer: most of this was not written by us. 
 */
import {
  Diagnostic,
  DiagnosticSeverity,
  TextDocument,
  Position
} from "vscode-languageserver";

import * as nearley from "nearley";
import { TypeLexer } from "./lex";
import { checkProgram } from "./typecheck/programs";
import { restrictDeclaration } from "./parse/restrictsyntax";
import { TypingError } from "./error";
import * as ast from "./ast";
import * as parsed from "./parse/parsedsyntax";
import grammar from './program-rules';

import "./util";
import { Nothing, Either, Right, Left } from "./util";
import { GlobalEnv, initEmpty } from "./typecheck/globalenv";

import * as fs from "fs";
import * as path from "path";
import { mkParser, parseDocument, typingErrorsToDiagnostics } from "./parse";

/** 
 * Map from TextDocument URI's to their last 
 * good ASTs. 
 */
export const openFiles: Map<string, GlobalEnv> = new Map();

// Max length a line can be before we produce a diagnostic
const MAX_LINE_LENGTH = 80;

export async function validateTextDocument(dependencies: string[], textDocument: TextDocument): Promise<Diagnostic[]> {
  // The validator creates diagnostics for all uppercase words length 2 and more
  let text = textDocument.getText();
  const lines = text.split("\n");

  let diagnostics: Diagnostic[] = [];

  const libsLoaded: string[] = [];
  let typeIds: Set<string> = new Set();
  const decls: ast.Declaration[] = [];

  const genv = initEmpty();

  for (const dep of dependencies) {
    const parser = mkParser(typeIds, dep);

    const parseResult = parseDocument(`file://${dep}`, parser, genv);
    switch (parseResult.tag) {
      case "left":
        // Give up if there's an error in another file
        return [{
          severity: DiagnosticSeverity.Error,
          message: `Failed to parse '${dep}'. Code completion and other features will not be available`,
          source: "c0-language",
          range: {
            start: Position.create(0, 0),
            end: Position.create(0, 0),
          }
        }];  

      case "right":
        decls.push(...parseResult.result);
        //genv.decls.push(...parseResult.result);
        typeIds = parser.lexer.getTypeIds();
    }
  }

  const parser = mkParser(typeIds, path.basename(textDocument.uri));

  const parseResult = parseDocument(textDocument, parser, genv);
  switch (parseResult.tag) {
    case "left":
      return parseResult.error;
    case "right":
      decls.push(...parseResult.result);
      //openFiles.set(textDocument.uri, parseResult.result);
  }

  // At this point we have gathered all the declarations, so we
  // can run the typechecker

  //genv.decls.push(...decls);

  const typecheckResult = checkProgram(genv, decls, parser);
  switch (typecheckResult.tag) {
    case "left":
      return typingErrorsToDiagnostics(typecheckResult.error);
    case "right":
      openFiles.set(textDocument.uri, typecheckResult.result);
      return [];
  }

  // Warn about lines longer than 80 characters
  // for (let i = 0; i < lines.length; i++) {
  //   if (lines[i].length > MAX_LINE_LENGTH) {
  //     const diagnostic: Diagnostic = {
  //       severity: DiagnosticSeverity.Warning,
  //       range: {
  //         start: Position.create(i, 0),
  //         end: Position.create(i, Number.MAX_VALUE)
  //       },
  //       message: `There are ${lines[i].length} characters in this line.\nPlease lower it to < 80.`,
  //       source: "c0-language"
  //     };
  //     diagnostics.push(diagnostic);
  //   }
  // }
}

/**
 * Code to check the program for any syntax, parse errors.
 * Full disclaimer: most of this was not written by us. 
 */
import {
  Diagnostic,
  DiagnosticSeverity,
  TextDocument,
  Position,
  ErrorMessageTracker
} from "vscode-languageserver";

import { checkProgram } from "./typecheck/programs";
import * as ast from "./ast";
import { GlobalEnv, initEmpty } from "./typecheck/globalenv";
import * as path from "path";
import { mkParser, parseDocument, typingErrorsToDiagnostics } from "./parse";
import { Either } from "./util";
import { TypingError } from "./error";

/** 
 * Map from TextDocument URI's to their last 
 * good ASTs. 
 */
export const openFiles: Map<string, GlobalEnv> = new Map();

// Max length a line can be before we produce a diagnostic
const MAX_LINE_LENGTH = 80;

/**
 * Parses a VSCode document, reporting any syntax or 
 * type errors. It returns the global environment representing
 * this file, so it includes any libraries or dependencies
 * 
 * @param dependencies 
 * List of files which need to be parsed before this one,
 * in URI format (i.e. including leading file://)
 * 
 * @param textDocument 
 * VSCode document to parse. Errors will be reported only for this document
 */
export async function validateTextDocument(dependencies: string[], textDocument: TextDocument): Promise<Diagnostic[]> {
  // The validator creates diagnostics for all uppercase words length 2 and more
  let typeIds: Set<string> = new Set();
  const decls: ast.Declaration[] = [];

  const genv = initEmpty();

  for (const dep of dependencies) {
    // Always add a file to the loaded set
    // before loading it, otherwise 
    // someone could introduce cycles 
    genv.filesLoaded.add(dep);

    const parser = mkParser(typeIds, dep);
    const parseResult = parseDocument(dep, parser, genv);

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
        typeIds = parser.lexer.getTypeIds();
    }
  }

  genv.filesLoaded.add(textDocument.uri);
  const parser = mkParser(typeIds, textDocument.uri);

  const parseResult = parseDocument(textDocument, parser, genv);
  switch (parseResult.tag) {
    case "left":
      return parseResult.error;
    case "right":
      // If we are in a h0 or h1 file, then
      // mark everything as a library function or struct
      switch (path.extname(textDocument.uri).toLowerCase()) {
        case ".h0":
        case ".h1":
          for (const decl of parseResult.result) {
            switch (decl.tag) {
              case "FunctionDeclaration":
                genv.libfuncs.add(decl.id.name);
                break;
              case "StructDeclaration":
                genv.libstructs.add(decl.id.name);
                break;
            }
          }
      }
      decls.push(...parseResult.result);
  }

  // At this point we have gathered all the declarations, 
  // as well as loaded all libraries, so we
  // can run the typechecker

  const typecheckResult = checkProgram(genv, decls, parser);

  // If there are errors in a dependency,
  // then give up
  for (const error of typecheckResult.errors) {
    if (error.loc?.source && error.loc.source !== textDocument.uri) {
      return [{
        severity: DiagnosticSeverity.Error,
        message: `Failed to typecheck '${error.loc?.source}'. Code completion and other features will not be available`,
        source: "c0-language",
        range: {
          start: Position.create(0, 0),
          end: Position.create(0, 0),
        }
      }];    
    }
  }

  openFiles.set(textDocument.uri, typecheckResult.genv);
  return typingErrorsToDiagnostics(typecheckResult.errors);

  // TODO: this would have to be moved somewhere else...perhaps in parseDocument
  // while pre-processing the source 
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

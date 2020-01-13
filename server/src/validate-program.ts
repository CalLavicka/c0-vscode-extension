/**
 * Code to check the program for any syntax, parse errors.
 * It will also add any successfully obtained ASTs to 
 * openFiles
 */
import {
  Diagnostic,
  DiagnosticSeverity,
  TextDocument,
  Position,
} from "vscode-languageserver";

import { checkProgram } from "./typecheck/programs";
import * as ast from "./ast";
import { GlobalEnv, initEmpty, cloneGenv } from "./typecheck/globalenv";
import * as path from "path";
import { mkParser, parseDocument, typingErrorsToDiagnostics, ParseResult } from "./parse";

/** 
 * Map from TextDocument URI's to their last 
 * good ASTs. They may have failed typechecking
 */
export const openFiles: Map<string, GlobalEnv> = new Map();

/**
 * A cached file, with the environment at the time.
 * Also store all dependants so we can invalidate them
 */
type FileCache = {
  genv: GlobalEnv,
  decls: ast.Declaration[],
  typeIds: Set<string>,
  dependants: Set<string>,
  fullCache: true
};

type DependencyList = {
  dependants: Set<string>,
  fullCache: false
};

/**
 * Cached files for internal usage
 */
const cachedFiles = new Map<string, FileCache | DependencyList>();

/**
 * Invalidates a file in the cache
 * @param file the URI of the file to invalidate
 */
export function invalidate(file: string) {
  const cache = cachedFiles.get(file);
  if (cache) {
    cachedFiles.delete(file);
    cache.dependants.forEach(invalidate);
  }
}

/**
 * Invalidates all files in the cache.
 */
export function invalidateAll() {
  cachedFiles.clear();
}

// Max length a line can be before we produce a diagnostic
const MAX_LINE_LENGTH = 80;

/**
 * Parses a VSCode document, reporting any syntax or 
 * type errors. It updates the global environment representing
 * this file in `openFiles`, so it includes any libraries or dependencies
 * 
 * @param dependencies 
 * List of files which need to be parsed before this one,
 * in URI format (i.e. including leading `file:///`)
 * 
 * @param textDocument 
 * VSCode document to parse, or the URI for the doucment. Errors will be reported only for this document
 */
export async function parseTextDocument(dependencies: string[], textDocument: string | TextDocument): Promise<Diagnostic[]> {
  // The validator creates diagnostics for all uppercase words length 2 and more
  let typeIds: Set<string> = new Set();
  const decls: ast.Declaration[] = [];
  let genv: GlobalEnv = initEmpty();
  const uri = typeof textDocument === 'string' ? textDocument : textDocument.uri;

  // Find deepest cached dependency
  let i: number;
  for (i = dependencies.length - 1; i >= 0; i--) {
    const cache = cachedFiles.get(dependencies[i]);
    if (cache?.fullCache) {
      genv = cloneGenv(cache.genv);
      decls.push(...cache.decls);
      typeIds = new Set(cache.typeIds);
      break;
    }
  }
  for (i = i + 1; i < dependencies.length; i++) {
    const dep = dependencies[i];

    if (genv.filesLoaded.has(dep)) {
      continue;
    }

    // Always add a file to the loaded set
    // before loading it, otherwise 
    // someone could introduce cycles 
    genv.filesLoaded.add(dep);

    const parser = mkParser(typeIds, dep);
    let parseResult: ParseResult;
    try {
      parseResult = parseDocument(dep, parser, genv);
    }
    catch (e) {
      if (e?.code === "ENOENT") {
        return [{
          severity: DiagnosticSeverity.Error,
          message: `File '${decodeURIComponent(dep)}' not found. ` +
                   `Code completion and other features will not be available`,
          range: {
            start: Position.create(0, 0),
            end: Position.create(0, 0)
          }
        }];
      }
      else throw e;
    }

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

    // Existing dependants (from earlier files which #use this one)
    const dependants = cachedFiles.get(dep)?.dependants;

    cachedFiles.set(dep, { genv: cloneGenv(genv), decls: [...decls], typeIds: new Set(typeIds),
      dependants: new Set(dependants), fullCache: true});

    // Add as dependant to all files this one uses
    genv.filesLoaded.forEach((file) => {
      if (file !== dep) {
        // Add this file as a dependant of that one
        const cache = cachedFiles.get(file);
        if (cache) {
          cache.dependants.add(dep);
        } else {
          cachedFiles.set(file, { dependants: new Set([dep]), fullCache: false});
        }
      }
    });
  }

  const parser = mkParser(typeIds, uri);
  if (!genv.filesLoaded.has(uri)) {
    genv.filesLoaded.add(uri);

    const parseResult = parseDocument(textDocument, parser, genv);
    switch (parseResult.tag) {
      case "left":
        return parseResult.error;
      case "right":
        // If we are in a h0 or h1 file, then
        // mark everything as a library function or struct
        // This should be in parseDocument, but since
        // people should only encounter h0 files in the context
        // of a library, this should be fine (e.g. command+click on a lib function)
        switch (path.extname(uri).toLowerCase()) {
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
  }

  // At this point we have gathered all the declarations, 
  // as well as loaded all libraries, so we
  // can run the typechecker

  const typecheckResult = checkProgram(genv, decls, parser);

  // If there are errors in a dependency,
  // then give up
  for (const error of typecheckResult.errors) {
    if (error.loc?.source && error.loc.source !== uri) {
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

  openFiles.set(uri, typecheckResult.genv);
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

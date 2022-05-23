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
import { FileSet } from "./util";
import { C0ObjectSourceFile, C0SourceFile, C0TextDocumentFile } from "./c0file";

/** 
 * Map from TextDocument URI's to their last 
 * good ASTs. They may have failed typechecking
 */
export const openFiles: Map<string, GlobalEnv> = new Map();

/**
 * A cached file, with the environment at the time.
 */
type CachedEnv = {
  genv: GlobalEnv,
  decls: ast.Declaration[],
  typeIds: Set<string>
};

/**
 * Each cache is defined by its various environments, based on earlier listings.
 * Also store all dependants so we can invalidate them
 */
type FileCache = {
  cache?: Map<string, CachedEnv> | undefined
  dependants: FileSet
};

/**
 * Cached files for internal usage.
 */
const cachedFiles = new Map<string, FileCache>();

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
 * VSCode document to parse. Errors will be reported only for this document
 */
export async function parseTextDocument(dependencies: C0SourceFile[], textDocument: TextDocument): Promise<Diagnostic[]> {
  const decls: ast.Declaration[] = [];
  let typeIds: Set<string> = new Set();
  let genv: GlobalEnv = initEmpty();

  // Find deepest cached dependency, and start parsing from there
  let i: number;
  for (i = dependencies.length - 1; i >= 0; i--) {
    const depKey = dependencies.slice(0, i).join('\n');
    const cache = cachedFiles.get(dependencies[i].key())?.cache?.get(depKey);
    if (cache) {
      genv = cloneGenv(cache.genv);
      decls.push(...cache.decls);
      typeIds = new Set(cache.typeIds);
      break;
    }
  }

  // Re-parse any dependency files which have been invalidated.
  for (i = i + 1; i < dependencies.length; i++) {
    const dep = dependencies[i];
    const depKey = dependencies.slice(0, i).join('\n');

    if (genv.filesLoaded.has(dep.key())) {
      continue;
    }

    // Always add a file to the loaded set
    // before loading it, otherwise 
    // someone could introduce cycles 
    genv.filesLoaded.add(dep.key());

    const parser = mkParser(typeIds, dep.key());
    let parseResult: ParseResult;
    try {
      parseResult = parseDocument(dep, parser, genv);
    }
    catch (e: any) {
      if (e?.code === "ENOENT") {
        // Should be impossible since we verify in getDependencies()
        // that all files mentioned in `dependencies` exist.
        return [{
          severity: DiagnosticSeverity.Error,
          message: `File '${decodeURIComponent(dep.originalFileName())}' not found. ` +
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
          message: `Syntax errors found in '${dep.originalFileName()}'.\nCode completion and other features will not be available`,
          source: "c0-language",
          range: {
            start: Position.create(0, 0),
            end: Position.create(0, 0),
          }
        }];

      case "right":
        if (dep instanceof C0ObjectSourceFile) {
          markNonInterfaceFunctions(dep, parseResult.result);
        }
        decls.push(...parseResult.result);
        typeIds = parser.lexer.getTypeIds();
    }

    // Existing dependants (from earlier files which #use this one)
    const cachedFile = cachedFiles.get(dep.key());
    const existingCache = cachedFile?.cache;
    if (existingCache) {
      existingCache.set(depKey, {
        genv: cloneGenv(genv),
        decls: [...decls],
        typeIds: new Set(typeIds)
      });
    } else {
      const dependants = cachedFile?.dependants;
      cachedFiles.set(dep.key(), {
        cache: new Map([[depKey, {
          genv: cloneGenv(genv),
          decls: [...decls],
          typeIds: new Set(typeIds)
        }]]),
        dependants: new FileSet(dependants)
      });
    }

    // Add as dependant to all files this one uses
    for (const file of genv.filesLoaded) {
      if (file === dep.key()) continue;

      // Add this file as a dependant of that one,
      // creating a new cache if none exists
      const cache = cachedFiles.get(file);
      if (cache) {
        cache.dependants.add(dep.key());
      } else {
        cachedFiles.set(file, { dependants: new FileSet([dep.key()]) });
      }
    }
  }

  // Now we have parsed all dependencies, we are ready to parse the open file.
  // Note that o0 and o1 files should never appear here
  console.assert(![".o0", ".o1"].includes(path.extname(textDocument.uri)));

  const parser = mkParser(typeIds, textDocument.uri);
  if (!genv.filesLoaded.has(textDocument.uri)) {
    genv.filesLoaded.add(textDocument.uri);

    const parseResult = parseDocument(new C0TextDocumentFile(textDocument), parser, genv);
    switch (parseResult.tag) {
      case "left":
        return parseResult.error;
      case "right":
        // If we are in a h0 or h1 file, then
        // mark everything as a library function or struct
        // This should be in parseDocument, but since
        // people should only encounter h0 files in the context
        // of a library, this should be fine (e.g. command+click on a lib function)
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
  }

  // At this point we have parsed all the declarations, 
  // as well as loaded all libraries, so we
  // can run the typechecker

  const typecheckResult = checkProgram(genv, decls);

  // If there are errors in a dependency,
  // then give up. However, 
  for (const error of typecheckResult.errors) {
    if (error.loc?.source !== textDocument.uri && error.severity === DiagnosticSeverity.Error) {
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

  // Save the typechecking result for use in IDE features.
  // Even if there is a type error, we may have partial
  // information available.
  openFiles.set(textDocument.uri, typecheckResult.genv);

  // Return any errors we encountered
  return typingErrorsToDiagnostics(typecheckResult.errors);
}

/**
 * Looks for an interface section in an object file,
 * and marks any non-interface functions as being private
 */
function markNonInterfaceFunctions(file: C0ObjectSourceFile, decls: ast.Declaration[]) {
  const lines = file.contents().split("\n");

  // Check if there is an interface section. 
  // An interface section begins with any line that has the word "Interface" in it
  // and ends with the next line that has the word "End" in it, or perhaps the end of the file.
  let interfaceStart = lines.findIndex(line => line.includes("Interface"));
  let interfaceEnd = lines.findIndex((line, index) => index > interfaceStart && line.includes("End"));
  if (interfaceStart === -1) return;
  if (interfaceEnd === -1) {
    interfaceEnd = lines.length - 1;
  }
  
  // The source code positions we have are 1-indexed so we need
  // to add 1 to the start and end positions
  interfaceStart += 1;
  interfaceEnd += 1;

  // The interface section could be anywhere in the file,
  // so we need to gather up the interface functions first.
  const interfaceFuncs: Set<string> = new Set();
  for (const decl of decls) {
    const lineStart = decl.loc?.start.line;
    const lineEnd = decl.loc?.end.line;
    if (!(lineStart && lineEnd)) continue;
    if (decl.tag !== "FunctionDeclaration") continue;

    if (interfaceStart < lineStart && lineEnd < interfaceEnd) {
      // This function is inside the interface section, so mark it as such
      interfaceFuncs.add(decl.id.name);
    }
  }

  // Now for every function which is not an interface function,
  // mark it as being private to file.originalFileName().
  
  for (const decl of decls) {
    if (decl.tag !== "FunctionDeclaration") continue;
    if (interfaceFuncs.has(decl.id.name)) continue;

    decl.isLocalTo = file.originalFileName();
  }
}
import { TypingError } from "./error";
import { Diagnostic, DiagnosticSeverity, Position, TextDocument } from "vscode-languageserver";
import { Either, Right, Left } from "./util";
import { TypeLexer } from "./lex";
import { restrictDeclaration } from "./parse/restrictsyntax";
import * as nearley from "nearley";
import grammar from "./program-rules";
import * as ast from "./ast";
import * as parsed from "./parse/parsedsyntax";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import * as process from "process";
import { GlobalEnv } from "./typecheck/globalenv";
import { Lang } from "./lang";
import * as lang from "./lang";
import { URI } from "vscode-uri";
import { C0DiskSourceFile, C0SourceFile, C0TextDocumentFile } from "./c0file";

/** 
 * Splits exclusively on semicolons,
 * treating contracts as comments to avoid
 * funky problems involving function pointer
 * typedefs.
 * 
 * This function is necessary since we have to pause the parser after
 * every declaration, so that if we find a typedef, we can add it to the lexer
 */
function* semicolonSplit(s: string) {
  const enum SplitState {
    Regular,
    LineComment,
    BlockComment,
    String,
    Char
  }

  // The main issue this tries to resolve is that 
  // we have to stop parsing when we encounter a typedef
  // in order to update the lexer 

  let state: SplitState = SplitState.Regular;

  let start = 0;
  let end = 0;
  while (end < s.length) {
    switch (state) {
      case SplitState.Regular:
        if (s[end] === ';') {
          yield { last: false, segment: s.slice(start, end), semicolon: true };
          // Hop over the semicolon, the code below
          // will feed it to the parser wherever necessary 
          end++;
          start = end;
        }
        if (s[end] === '{') {
          yield { last: false, segment: s.slice(start, end), semicolon: false };
          // Don't jump over this character, it needs to be fed
          // to the parser on the next iteration 
          start = end;
          end++;
        }
        else if (s[end] === '"') {
          state = SplitState.String;
          end++;
        }
        else if (s[end] === '\'') {
          state = SplitState.Char;
          end++;
        }
        else if (s.startsWith("//", end)) {
          state = SplitState.LineComment;
          end += 2;
        }
        else if (s.startsWith("/*", end)) {
          state = SplitState.BlockComment;
          end += 2;
        }
        else end++;
        break;
      case SplitState.LineComment:
        if (s[end] === '\n') {
          state = SplitState.Regular;
          end++;
        }
        else {
          end++;
        }
        break;
      case SplitState.BlockComment:
        if (s.startsWith("*/", end)) {
          state = SplitState.Regular;
          end += 2;
        }
        else end++;
        break;

      case SplitState.String:
        // Skip control sequences so we don't
        // get fooled by something like "the string is \"asd\" asd"
        if (s[end] === "\\") end += 2;
        else if (s[end] === "\"") {
          state = SplitState.Regular;
          end++;
        }
        else end++;
        break;
      case SplitState.Char:
        if (s[end] === "\\") end += 2;
        else if (s[end] === "\'") {
          state = SplitState.Regular;
          end++;
        }
        else end++;
        break;
    }
  }

  yield { last: true, segment: s.slice(start, end), semicolon: true };
}

// Overwrite nearley's error reporting because it is broken
function myReportError(parser: nearley.Parser, token: any): string {
  const lines: string[] = [];
  const tokenDisplay =
    (token.type ? token.type + " token: " : "") +
    JSON.stringify(token.value !== undefined ? token.value : token);
  lines.push(parser.lexer.formatError(token, "Syntax error"));
  lines.push("Unexpected " + tokenDisplay + ".");
  return lines.join("\n");
}

/**
 * Overrides the error reporting function
 * to prevent issues with nontermination w/ Nearley
 */
export interface C0Parser extends nearley.Parser {
  reportError: (token: any) => string;
  lexer: TypeLexer;
}

/** 
 * Converts typing errors to a list of VSCode diagnostics,
 * keeping source information
 */
export function typingErrorsToDiagnostics(errors: Iterable<TypingError>): Diagnostic[] {
  const diagnostics = [];

  for (const error of errors) {
    const loc = error?.loc || Position.create(0, 0);

    if (error.loc) {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: ast.toVscodePosition(error.loc.start),
          end: ast.toVscodePosition(error.loc.end)
        },
        message: error.message,
        source: "c0-language"
      };
      diagnostics.push(diagnostic);
    }
  }

  return diagnostics;
}

export type ParseResult = Either<Diagnostic[], ast.Declaration[]>;

/**
 * The global library cache, storing all declarations for any given
 * library. Libraries are searched for in the extension installation
 * library, with headers in the `c0lib` folder 
 */
const libcache: Map<string, ast.Declaration[]> = new Map();

/**
 * Parses the given document, including all libraries and
 * all files used with #use "foo.c0". It will update genv with 
 * any new libraries and loaded files. It will either return
 * an AST or a list of errors. 
 * 
 * @author 
 * This was originally written by Rob Simmons but has now been
 * heavily extended to support multiple files, #use directives, libraries, etc.
 * 
 * @param text 
 * Either a file URI (for a file which is not the one being currently edited)
 * or a vscode TextDocument object.
 * 
 * @param parser The parser to use and update 
 * 
 * @returns
 * Either a list of errors encountered when parsing/typechecking,
 * or a list of declarations encountered. Note that we do not typecheck
 * the returned declarations .
 */
export function parseDocument(text: C0SourceFile, oldParser: C0Parser, genv: GlobalEnv): ParseResult {
  const diagnostics: Diagnostic[] = [];

  let parseSuccessful = true;
  let decls: parsed.Declaration[] = [];

  let restrictedDecls = new Array<ast.Declaration>();

  const fileName = text.key();
  const language: Lang = lang.parse(path.extname(fileName)) || "C1";

  // Use a new parser so our old one doesn't get confused 
  const parser = mkParser(oldParser.lexer.getTypeIds(), fileName, language);

  const fileText = text.contents();

  // Before we go through the file, look at each line for a #use 
  // This could actually be done in lex.ts, in Tok.next()
  // FIXME: Technically, in C0 #use declarations can only be
  // at the very top of a file (before any code). 
  // However we don't enforce this.
  const lines = fileText.split("\n");
  for (let i = 0; i < lines.length; i++) { // Need index for error messages
    const line = lines[i];
    // ^\s* - match any whitespace at the beginning of a line
    // #use - literal match "#use"
    // \s+ at least one space (newlines are not possible since we split on \n)
    // <(\w+)> - match more than one word character inside <>
    // \s*$ - match space characters until the end 
    const matchLib = /^\s*#use\s+<(\w+)>\s*$/;
    const matchFile = /^\s*#use\s+"([^"]+)"\s*$/;

    let match = line.match(matchLib);

    if (match !== null) {
      // #use <libfoo>
      const libname = match[1];
      if (genv.libsLoaded.has(libname)) continue;
      // Mark this library as loaded 
      genv.libsLoaded.add(libname);

      let libdecls = libcache.get(libname);

      if (libdecls === undefined) {
        // process.argv[0] is the path to nodejs 
        // process.argv[1] is the path to server.js (the main script for the server)
        const libURI = url.pathToFileURL(`${path.dirname(process.argv[1])}/c0lib/${libname}.h0`).toString();

        // We need to do the round trip conversion
        // to accout for Windows specific business 
        if (!fs.existsSync(url.fileURLToPath(libURI))) {
          addError(i, 0, `library '${libname}' not found`, DiagnosticSeverity.Error);
          continue;
        }

        const parseResult = parseDocument(new C0DiskSourceFile(libURI), parser, genv);
        if (parseResult.tag === "left") {
          // Indicates the library header got corrupted,
          // or some other major bug with our server has occured 
          throw new Error(
            `Very unexpected error when reading library ${libname}, please ask the course staff for help!`);
        }

        libdecls = parseResult.result;
        // Annotate each decl with its source URI, 
        // for use in go to decl
        libdecls.forEach(d => { if (d.loc) d.loc.source = libURI; });
        // Add libraries to the cache 
        libcache.set(libname, libdecls);
      }
      else {
        // Still need to add type ids from libdecls
        for (const decl of libdecls) {
          switch (decl.tag) {
            case "TypeDefinition":
            case "FunctionTypeDefinition":
              parser.lexer.addIdentifier(decl.definition.id.name);
              break;
          }
        }
      }
      // We assume nothing funky happens in the library headers
      // so we will not run the typechecker on them

      genv.decls.push(...libdecls);
      // Mark these as library functions/structs so the 
      // typechecker knows not to look for a body 
      libdecls.forEach(d => {
        switch (d.tag) {
          case "FunctionDeclaration":
            genv.libfuncs.add(d.id.name);
            break;
          case "StructDeclaration":
            genv.libstructs.add(d.id.name);
            break;
        }
      });
    }
    // tslint:disable-next-line: no-conditional-assignment
    else if ((match = line.match(matchFile)) !== null) {
      const usedName = match[1];
      const usedPath = path.resolve(url.fileURLToPath(path.dirname(fileName)), usedName);
      // Convert /C:/ to C%3A/ to be compatible with how VSCode sends URIs
      const usedURI = URI.file(usedPath).toString();

      // #use "foo.c0" declarations are deprecated, so we need to add a warning
      addError(i, 0, `'#use "${usedName}"' syntax is deprecated and will be removed in the future`, DiagnosticSeverity.Warning);

      if (genv.filesLoaded.has(usedURI)) continue;
      // Add the file to the loaded set before we parse it to prevent
      // circularity 
      genv.filesLoaded.add(usedURI);

      if (!fs.existsSync(usedPath)) {
        addError(i, 0, `couldn't find ${usedName}`, DiagnosticSeverity.Error);
        continue;
      }

      const parseResult = parseDocument(new C0DiskSourceFile(usedURI), parser, genv);
      if (parseResult.tag === "left") {
        addError(i, 0,
          `failed to typecheck ${usedName}. Code completion and other features will not be available`,
          DiagnosticSeverity.Error);
        continue;
      }

      const usedDecls = parseResult.result;
      usedDecls.forEach(d => { if (d.loc) d.loc.source = usedURI; });
      restrictedDecls.push(...usedDecls);
    }
  }

  // Now that we've handled all #use declarations we can parse the file
  const segments = semicolonSplit(fileText);

  // Function to add a diagnostic for a parse error,
  // as well as set "parsed" to false
  function addError(line: number | null, columnOrOffset: number, message: string, severity: DiagnosticSeverity) {
    const pos: Position =
      !(text instanceof C0TextDocumentFile)
        // Only text document files have line/column information
        ? Position.create(0, 0)
        : (line === null
          ? text.positionAt(columnOrOffset)
          : Position.create(line, columnOrOffset));

    const diagnostic: Diagnostic = {
      severity,
      message,
      source: "c0-language",
      range: {
        start: pos,
        end: pos
      }
    };

    diagnostics.push(diagnostic);
    parseSuccessful = false;
  }

  // Position information 
  let size = 0;
  let curOffset = 0;

  // Iterate through semicolon segments
  for (const segment of segments) {
    let parseState = parser.save();
    curOffset += segment.segment.length + (segment.semicolon ? 1 : 0);

    try {
      parser.feed(segment.segment);
      const parsedSegment = parser.finish();

      if (parsedSegment.length > 1) {
        // Technically we have an ambiguous parse here
        // but sometimes the parser produces two identical parses
        // so we just take the first one
        console.error("Ambiguous parse, please report this issue to the course staff if possible");
      }

      if (parsedSegment.length === 0) {
        if (segment.last) {
          addError(
            null,
            curOffset,
            "Incomplete parse at the end of the file",
            DiagnosticSeverity.Warning
          );
        }
        else if (segment.semicolon) {
          parser.feed(";");
        }
      }
      else {
        // Ideally parsed.length === 1 but sometimes
        // the parser generates two identical parses
        const parsedGlobalDecls = parsedSegment[0];
        for (let i = size; i < parsedGlobalDecls.length - 1; i++) {
          switch (parsedGlobalDecls[i].tag) {
            case "TypeDefinition":
            case "FunctionTypeDefinition":
              addError(null, curOffset, `typedef is missing its trailing semicolon`, DiagnosticSeverity.Error);
              break;
          }
        }
        if (segment.last) {
          if (parsedGlobalDecls.length > size) {
            const possibleTypeDef: ast.Declaration =
              parsedGlobalDecls[parsedGlobalDecls.length - 1];
            if (
              possibleTypeDef.tag === "TypeDefinition" ||
              possibleTypeDef.tag === "FunctionTypeDefinition"
            ) {
              addError(
                null,
                curOffset,
                `typedef without a final semicolon at the end of the file`,
                DiagnosticSeverity.Error
              );
            }
          }
          decls = decls.concat(parsedGlobalDecls);
        }
        else {
          if (parsedGlobalDecls.length === 0) {
            if (segment.semicolon) {
              addError(
                null,
                curOffset,
                `semicolon at beginning of file`,
                DiagnosticSeverity.Error
              );
            }
          }
          else {
            const possibleTypedef: ast.Declaration =
              parsedGlobalDecls[parsedGlobalDecls.length - 1];
            if (parsedGlobalDecls.length === size && segment.semicolon) {
              addError(
                null,
                curOffset,
                `too many semicolons after a ${possibleTypedef.tag}`,
                DiagnosticSeverity.Error
              );
            }
            size = parsedGlobalDecls.length;

            switch (possibleTypedef.tag) {
              case "TypeDefinition":
              case "FunctionTypeDefinition": {
                parser.lexer.addIdentifier(possibleTypedef.definition.id.name);
                break;
              }
              default:
                if (segment.semicolon) {
                  addError(
                    null,
                    curOffset,
                    `unnecessary semicolon at the top level after ${possibleTypedef.tag}`,
                    DiagnosticSeverity.Error
                  );
                }
            }
          }
          if (segment.semicolon) {
            parser.feed(" ");
          }
        }
      }
    } catch (err: any) {
      // Restore old state before the bad line
      parser.restore(parseState);
      for (const ch of segment.segment) {
        switch (ch) {
          case "\n":
          case "{":
          case "}":
            parseState = parser.save();
            try {
              parser.feed(ch);
            } catch (err) {
              parser.restore(parseState);
              parser.feed(" ");
            }

            break;
          default:
            parser.feed(" ");
        }
      }
      if (segment.semicolon) {
        parser.feed(" ");
      }
      addError(
        err.token.line - 1,
        err.token.col - 1,
        err.message,
        DiagnosticSeverity.Error
      );
    }
  }

  // Add source file info for the decls
  for (const decl of decls) {
    if (decl.loc && !decl.loc.source) {
      decl.loc.source = text.originalFileName();
    }
  }

  // By this point we have an AST - we didn't encounter
  // any syntax errors 

  // Here we check for forbidden language features
  if (parseSuccessful) {
    const errors = new Set<TypingError>();

    for (const decl of decls) {
      try {
        console.assert(decl.tag !== undefined);

        // restrictDeclaration() checks for language features allowed
        // (e.g. void*, function pointers, break, continue)
        restrictedDecls.push(...restrictDeclaration(language, decl));
      }
      catch (err) {
        errors.add(err as TypingError);
      }
    }

    if (errors.size === 0) {
      // Don't run the typechecker. It needs all decls at once
      // Before returning from a successful parser, add 
      // typeids encountered to old parser
      parser.lexer.getTypeIds().forEach(id => oldParser.lexer.addIdentifier(id));
      return Right(restrictedDecls);
    }

    // Show all of the errors gathered 
    diagnostics.push(...typingErrorsToDiagnostics(errors));
  }

  return Left(diagnostics);
}

/**
 * Creates a C0 parser, which 
 * uses the given type-ids to parse.
 * 
 * If filename is not provided, then 
 * no filename is attached to any parsed decls.
 * 
 * If language is not provided, then it will
 * either be inferred from filename, or 
 * will default to C1 
 */
export function mkParser(typeIds: Set<string>, filename?: string, language?: Lang): C0Parser {
  if (!language) {
    const inferredLang = filename && lang.parse(path.extname(filename).substring(1));
    language = inferredLang || "C1";
  }

  const parser = <C0Parser>(new nearley.Parser(nearley.Grammar.fromCompiled(grammar)));
  // Overwrite the reportError function cause otherwise it loops :(
  parser.reportError = function (token: any) {
    return myReportError(this, token);
  };

  // C0/C1 use the same lexer, so no point changing it here
  // We could maybe add a property to the lexer
  // with the currently open path 
  parser.lexer = new TypeLexer(language, typeIds, filename);

  return parser;
}

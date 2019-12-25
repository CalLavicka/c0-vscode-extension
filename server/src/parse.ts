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

/** 
 * Splits exclusively on semicolons,
 * treating contracts as comments to avoid
 * funky problems involving function pointer
 * typedefs  
 */
function* semicolonSplit(s: string) {
  const enum SplitState {
    Regular,
    LineComment,
    BlockComment,
    String
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
        else if (s[end] === '"') {
          state = SplitState.String;
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
    }
  }

  yield { last: true, segment: s.slice(start, end), semicolon: true };
}

// Overwrite nearley's error reporting because it is broken
function myReportError(parser: nearley.Parser, token: any) {
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
    if (error.loc !== null && error.loc !== undefined) {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: Position.create(
            error.loc.start.line - 1,
            error.loc.start.column - 1
          ),
          end: Position.create(
            error.loc.end.line - 1,
            error.loc.end.column - 1
          )
        },
        message: error.message,
        source: "c0-language"
      };
      diagnostics.push(diagnostic);
    }
  }

  return diagnostics;
}
 
type ParseResult = Either<Diagnostic[], ast.Declaration[]>;

/**
 * The global library cache, storing all declarations for any given
 * library. Libraries are searched for in the extension installation
 * library, with headers in the `c0lib` folder 
 */
const libcache: Map<string, ast.Declaration[]> = new Map();

/**
 * Parses the given document
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
export function parseDocument(text: string | TextDocument, oldParser: C0Parser, genv: GlobalEnv): ParseResult {
  const diagnostics: Diagnostic[] = [];

  let parseSuccessful = true;
  let decls: parsed.Declaration[] = [];

  let restrictedDecls = new Array<ast.Declaration>();
  
  const fileName = typeof text === "string" ? text : text.uri;
  const language: Lang = lang.parse(path.extname(fileName)) || "C1";

  // Use a new parser so our old one doesn't get confused 
  const parser = mkParser(oldParser.lexer.getTypeIds(), fileName, language);

  const fileText = typeof text === "string" 
    ? fs.readFileSync((<any>url).fileURLToPath(text), { encoding: "utf-8" }) 
    : text.getText();

  // Before we go through the file, look at each line for a #use 
  // This could actually be done in lex.ts, in Tok.next()
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
      
      let libdecls = libcache.get(libname);

      if (libdecls === undefined) {
        // process.argv[0] is the path to nodejs 
        // process.argv[1] is the path to server.js (the main script for the server)
        const libpath = `file://${path.dirname(process.argv[1])}/c0lib/${libname}.h0`;
        if (!fs.existsSync((<any>url).fileURLToPath(libpath))) {
          addError(i, 0, `library '${libname}' not found`, DiagnosticSeverity.Error);
          parseSuccessful = false;
          continue;
        }

        const parseResult = parseDocument(libpath, parser, genv);
        if (parseResult.tag === "left") {
          // Indicates the library header got corrupted,
          // or some other major bug with our server has occured 
          throw new Error(
            `Very unexpected error when reading library ${libname}, please ask the course staff for help!`);
        }

        libdecls = parseResult.result;
        // Annotate each decl with its source URI, 
        // for use in go to decl
        libdecls.forEach(d => { if (d.loc) d.loc.source = libpath; });
        // Add libraries to the cache 
        libcache.set(libname, libdecls);
      }
      
      // Mark this library as loaded 
      genv.libsLoaded.add(libname);
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
    else {
      match = line.match(matchFile);
      if (match !== null) {
        // #use "foo.c0"
        // Shouldn't be that hard to implement, using
        // something similiar to the above. You'd just have to
        // keep track of the loaded files on genv as well as loaded libs
        const usedFilename = match[1];
        addError(i, 0, `#use "${usedFilename}" not supported in VSCode yet`, DiagnosticSeverity.Error);
        parseSuccessful = false;
      }
    }
  }

  const segments = semicolonSplit(fileText);

  // Function to add a diagnostic for a parse error,
  // as well as set "parsed" to false
  function addError(line: number | null, columnOrOffset: number, message: string, severity: DiagnosticSeverity) {
    const pos: Position =
      typeof text === "string" 
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
      const parsed = parser.finish();

      if (parsed.length > 1) {
        // Shouldn't happen
        console.error("Parse ambiguous:", parsed);
      } 
      else if (parsed.length === 0) {
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
        // parsed.length === 1
        const parsedGlobalDecls = parsed[0];
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
    } catch (err) {
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
  decls.forEach(d => { if (d.loc && !d.loc.source) d.loc.source = fileName; });

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
        restrictedDecls = restrictedDecls.concat(restrictDeclaration(language, decl));
      } 
      catch (err) {
        errors.add(err);
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

export function mkParser(typeIds: Set<string>, filename?: string, language?: Lang): C0Parser {
  if (!language && filename) {
    const inferredLang = lang.parse(path.extname(filename));
    language = inferredLang || "C1";
  }

  const parser = <C0Parser>(new nearley.Parser(nearley.Grammar.fromCompiled(grammar)));
  // Overwrite the reportError function cause otherwise it loops :(
  parser.reportError = function(token: any) {
    return myReportError(this, token);
  };

  // C0/C1 use the same lexer, so no point changing it here
  // We could maybe add a property to the lexer
  // with the currently open path 
  parser.lexer = new TypeLexer(<Lang>language, typeIds, filename);

  return parser;
}

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

// function* semicolonSplit(s: string) {
//   let ndx = s.indexOf(";");
//   while (ndx > 0) {
//       yield { last: false, segment: s.slice(0, ndx), semicolon: true };
//       s = s.slice(ndx + 1);
//       ndx = s.indexOf(";");
//   }
//   yield { last: true, segment: s, semicolon: false };
// }

enum SplitState {
  Regular,
  LineComment, // For our purposes we treat contracts as comments 
  BlockComment,
  String
}

function* betterSplit(s: string) {
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
          // Hop over the semicolon, the parser doesn't like it
          end += 1;
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

// function* semicolonSplit(s: string) {
//   // Semicolon, //, or /*
//   const normRegex = /(;|\/\/|\/\*)/g;
//   // Semicolon, newline, or */
//   const cmtRegex = /(;|\n|\*\/)/g;
//   let ndx = s.search(normRegex);
//   let inComment = false;

//   while (ndx >= 0) {
//     const semi = s.charAt(ndx) === ";";
//     if (inComment && s.charAt(ndx) === "\n") {
//       ndx++;
//     } else if (inComment && s.charAt(ndx) === "*") {
//       ndx += 2;
//     }
//     yield { last: false, segment: s.slice(0, ndx), semicolon: semi };
//     s = s.slice(ndx + (semi ? 1 : 0));
//     if (!semi) {
//       inComment = !inComment;
//     }
//     if (inComment) {
//       ndx = s.search(cmtRegex);
//     } else {
//       ndx = s.search(normRegex);
//     }
//   }
//   yield { last: true, segment: s, semicolon: true };
// }

// Overwrite nearley's error reporting because it is broken
function myReportError(parser: nearley.Parser, token: any) {
  var lines: string[] = [];
  var tokenDisplay =
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
 * Parses the given document
 * 
 * @param text 
 * Either a file URI (for a file which is not the one being currently edited)
 * or a vscode TextDocument object.
 * 
 * @param parser The parser to use and update 
 * @param lexer The lexer to use. It will be updated with any typedefs encountered
 * 
 * @returns
 * Either a list of errors encountered when parsing/typechecking,
 * or a list of declarations encountered. Note that we do not typecheck
 * the returned declarations .
 */
export function parseDocument(text: string | TextDocument, oldParser: C0Parser, genv: GlobalEnv): ParseResult {
  const diagnostics: Diagnostic[] = [];

  let parsed = true;
  let decls: parsed.Declaration[] = [];

  let restrictedDecls = new Array<ast.Declaration>();

  // Use a new parser so our old one doesn't get confused 
  const parser = mkParser(oldParser.lexer.getTypeIds(), typeof text === "string" ? text : text.uri);

  const fileName = typeof text === "string" ? text : text.uri;
  const fileText = typeof text === "string" ? fs.readFileSync((<any>url).fileURLToPath(text), { encoding: "utf-8" }) : text.getText();

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
      // TODO: caching 
      const libpath = `file://${path.dirname(process.argv[1])}/c0lib/${libname}.h0`;
      if (!fs.existsSync((<any>url).fileURLToPath(libpath))) {
        addError(i, 0, `library '${libname}' not found`, DiagnosticSeverity.Error);
        parsed = false;
      }

      const parseResult = parseDocument(libpath, parser, genv);
      if (parseResult.tag === "left") {
        // Indicates the library header got corrupted
        throw new Error(
          `Very unexpected error when reading library ${libname}, please report!`);
      }

      const decls: ast.Declaration[] = parseResult.result;
      // Annotate each decl with its source URI 
      decls.forEach(d => { if (d.loc) d.loc.source = libpath; });
      
      genv.libsLoaded.add(libname);
      genv.decls.push(...decls);
      // Mark these as library functions so the 
      // typechecker knows not to look for a body 
      decls.forEach(d => { if (d.tag === "FunctionDeclaration") genv.libfuncs.add(d.id.name); });

      //cachedLibs.set(decl.name, decls);
    }
    else {
      match = line.match(matchFile);
      if (match !== null) {
        // #use "foo.c0"
        const usedFilename = match[1];
        addError(i, 0, `#use "${usedFilename}" not supported in VSCode yet`, DiagnosticSeverity.Error);
        parsed = false;
      }
    }
  }

  const segments = betterSplit(fileText);

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
    parsed = false;
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

  // Add source file info for 
  decls.forEach(d => { if (d.loc && !d.loc.source) d.loc.source = fileName; });

  // By this point we have an AST - we didn't encounter
  // any syntax errors 

  // Here we check for forbidden language features
  if (parsed) {
    let errors = new Set<TypingError>();

    for (const decl of decls) {
      try {
        // TODO: If the current document is not a C1
        // document, then we need to update the language
        // level here accordingly.
        // Should be able to do so using the URI 
        console.assert(decl.tag !== undefined);

        // restrictDeclaration() checks for language features allowed
        // (e.g. void*, function pointers, break, continue)
        restrictedDecls = restrictedDecls.concat(restrictDeclaration("C1", decl));
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

export function mkParser(typeIds: Set<string>, filename?: string): C0Parser {
  const parser = <C0Parser>(new nearley.Parser(nearley.Grammar.fromCompiled(grammar)));
  // Overwrite the reportError function cause otherwise it loops :(
  parser.reportError = function(token: any) {
    return myReportError(this, token);
  };

  // C0/C1 use the same lexer, so no point changing it here
  // We could maybe add a property to the lexer
  // with the currently open path 
  parser.lexer = new TypeLexer("C1", typeIds, filename);

  return parser;
}

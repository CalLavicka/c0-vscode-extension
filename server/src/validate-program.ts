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
import { GlobalEnv } from "./typecheck/globalenv";

import * as fs from "fs";
import * as path from "path";

/** 
 * Map from TextDocument URI's to their last 
 * good ASTs. 
 */
export const openFiles: Map<string, GlobalEnv> = new Map();

// Max length a line can be before we produce a diagnostic
const MAX_LINE_LENGTH = 80;

function* semicolonSplit(s: string) {
  const normRegex = /(;|\/\/|\/\*)/g;
  const cmtRegex = /(;|\n|\*\/)/g;
  let ndx = s.search(normRegex);
  let inComment = false;

  while (ndx >= 0) {
    const semi = s.charAt(ndx) === ";";
    if (inComment && s.charAt(ndx) === "\n") {
      ndx++;
    } else if (inComment && s.charAt(ndx) === "*") {
      ndx += 2;
    }
    yield { last: false, segment: s.slice(0, ndx), semicolon: semi };
    s = s.slice(ndx + (semi ? 1 : 0));
    if (!semi) {
      inComment = !inComment;
    }
    if (inComment) {
      ndx = s.search(cmtRegex);
    } else {
      ndx = s.search(normRegex);
    }
  }
  yield { last: true, segment: s, semicolon: true };
}

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
}  

function typingErrorsToDiagnostics(errors: Iterable<TypingError>): Diagnostic[] {
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
 * Either a file path (for a file which is not the one being currently edited)
 * or a vscode TextDocument object.
 * 
 * @param parser The parser to use
 * @param lexer The lexer to use. It will be updated with any typedefs encountered
 * 
 * @returns
 * Either a list of errors encountered when parsing/typechecking,
 * or a list of declarations encountered. Note that we do not typecheck
 * the returned declarations .
 */
function parseDocument(text: string | TextDocument, parser: C0Parser): ParseResult {
  const diagnostics: Diagnostic[] = [];

  const lexer = <TypeLexer>parser.lexer;

  // Send through the parser semicolon-by-semicolon
  const segments = semicolonSplit(typeof text === "string" ? text : text.getText());
  let parsed = true;
  let decls: parsed.Declaration[] = [];
  let size = 0;
  let curOffset = 0;

  let restrictedDecls = new Array<ast.Declaration>();

  // Function to add a diagnostic for a parse error,
  // as well as set "parsed" to false
  function addError(
    line: number | null,
    columnOrOffset: number,
    message: string,
    severity: DiagnosticSeverity
  ) {
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
          if (
            parsedGlobalDecls[i].tag === "TypeDefinition" ||
            parsedGlobalDecls[i].tag === "FunctionTypeDefinition"
          ) {
            addError(
              null,
              curOffset,
              `typedef is missing its trailing semicolon`,
              DiagnosticSeverity.Error
            );
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
          } else {
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
                lexer.addIdentifier(possibleTypedef.definition.id.name);
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
      return Right(restrictedDecls);

      // const typecheckResult = checkProgram([], restrictedDecls);

      // switch (typecheckResult.tag) {
      //   case "left":
      //     errors = typecheckResult.error; break;
      //   case "right":
      //     //if (typeof text !== "string") openFiles.set(text.uri, typecheckResult.result);
      //     return Right(typecheckResult.result);
      // }
    }

    // Show all of the errors gathered
    diagnostics.push(...typingErrorsToDiagnostics(errors));
  }

  return Left(diagnostics);
}

function mkParser(typeIds: Set<string>, filename?: string): C0Parser {
  const parser = <C0Parser>(new nearley.Parser(nearley.Grammar.fromCompiled(grammar)));
  // Overwrite the reportError function cause otherwise it loops :(
  parser.reportError = function(token: any) {
    return myReportError(this, token);
  };

  // C0/C1 use the same lexer, so no point changing it here
  // We could maybe add a property to the lexer
  // with the currently open path 
  const lexer: TypeLexer = (parser.lexer = new TypeLexer("C1", typeIds, filename));

  return parser;
}

export async function validateTextDocument(dependencies: string[], textDocument: TextDocument): Promise<Diagnostic[]> {
  // The validator creates diagnostics for all uppercase words length 2 and more
  let text = textDocument.getText();
  const lines = text.split("\n");

  let diagnostics: Diagnostic[] = [];

  let typeIds: Set<string> = new Set();

  const decls = [];

  for (const dep of dependencies) {
    const parser = mkParser(typeIds, dep);

    const parseResult = parseDocument(fs.readFileSync(dep, { encoding: "utf-8" }), parser);
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
        typeIds = (<TypeLexer>parser.lexer).getTypeIds();
    }
  }

  const parser = mkParser(typeIds, path.basename(textDocument.uri));

  const parseResult = parseDocument(textDocument, parser);
  switch (parseResult.tag) {
    case "left":
      return parseResult.error;
    case "right":
      decls.push(...parseResult.result);
      //openFiles.set(textDocument.uri, parseResult.result);
  }

  // At this point we have gathered all the declarations, so we
  // can run the typechecker

  const typecheckResult = checkProgram([], decls);
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

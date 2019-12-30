import {
  createConnection,
  TextDocuments,
  TextDocument,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  Hover,
  MarkupContent,
  LocationLink,
  CompletionParams,
  Range,
  Position,
} from 'vscode-languageserver';

import { basicLexing } from './lex';
import { WordListClass } from './word-list';
import { openFiles, validateTextDocument } from "./validate-program";

import * as ast from "./ast";
import { isInside, findStatement, findGenv, comparePositions, Ordering } from "./ast-search";
import { typeToString, expressionToString } from './print';

import * as path from "path";
import * as fs from "fs";
import { EnvEntry } from './typecheck/types';
import { getFunctionDeclaration, actualType, getTypedefDefinition, getStructDefinition } from './typecheck/globalenv';
import { Maybe, Just, Nothing } from './util';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents: TextDocuments = new TextDocuments();

let hasWorkspaceFolderCapability: boolean = false;
const WordList: WordListClass = new WordListClass(basicLexing.identifier.keywords.keyword);

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we will fall back using global settings
  hasWorkspaceFolderCapability = Boolean(capabilities.workspace!.workspaceFolders);

  return {
    capabilities: {
      textDocumentSync: documents.syncKind,
      completionProvider: {
        resolveProvider: false
      },
      hoverProvider: true,
      definitionProvider: true
    }
  };
});

connection.onInitialized(() => {
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(event => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});

// Only keep settings for open documents
documents.onDidClose(e => {
  openFiles.delete(e.document.uri);
});

function getDependencies(name: string, configPaths: URL[]): Maybe<string[]> {
  for (const configPath of configPaths) {

    if (fs.existsSync(configPath)) {
      const files = fs
        .readFileSync(configPath, { encoding: "utf-8" })
        .split("\n")
        .map(s => s.trim());

      // Filenames should be relative to the config file's location
      const base = path.dirname(configPath.toString());
      // path will add platform-specific separators, which is not what we want
      const fname = path.relative(base, name).replace(path.sep, "/");

      const dependencies = [];

      for (const file of files) {
        if (file === fname) {
          return Just(dependencies);
        }

        // Note that URIs always use /
        // (even on Windows)
        dependencies.push(`${base}/${file}`);
      }
    }
  }
  return Nothing;
}

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async change => {
  // Look for a config file
  // TODO: cache the config file

  const dir = path.dirname(change.document.uri);

  // maybe just use a VSCode config file...
  const folders = await connection.workspace.getWorkspaceFolders();

  let dependencies: string[] = [];
  const diagnostics: Diagnostic[] = [];

  const maybeDependencies = getDependencies(change.document.uri, [
    `${dir}/project.txt`,
    `${dir}/../project.txt`, // Look one folder above 
    folders && folders.length ? `${folders[0].uri}/project.txt` : ""
  ].map(p => new URL(p)));

  if (!maybeDependencies.hasValue) {
    diagnostics.push(Diagnostic.create(
      Range.create(Position.create(0, 0), Position.create(0, 0)),
      `No valid project.txt found for the current document. Completions and other features may not work as expected`,
      DiagnosticSeverity.Warning,
      undefined,
      change.document.uri));

    dependencies = [];
  }
  else {
    dependencies = maybeDependencies.value;
  }

  const parseErrors = await validateTextDocument(dependencies, change.document);

  connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [...diagnostics, ...parseErrors] });
  WordList.handleContextChange(change);
});

connection.onDidChangeWatchedFiles(change => {
  // Monitored files have change in VS Code
  connection.console.log('We received an file change event');
});

/**
 * Turns a string with C0 code and wraps it
 * with Markdown code fences
 */
function mkCodeString(s: string): string {
  return `\`\`\`c0\n${s}\n\`\`\``;
}

/** 
 * Turns a string with C0 code into a MarkupContent object,
 * which can be sent as part of various LSP responses
 */
function mkMarkdownCode(s: string): MarkupContent {
  return {
    kind: "markdown",
    value: mkCodeString(s)
  };
}

// This handler provides the initial list of the completion items.
connection.onCompletion((completionInfo: CompletionParams): CompletionItem[] => {
  // TODO: use completionInfo to figure out if we should add keywords or not

  // The pass parameter contains the position of the text document in
  // which code complete got requested. 
  const keywords: CompletionItem[] =
    basicLexing.identifier.keywords.keyword.map(word => ({
      label: word,
      kind: CompletionItemKind.Keyword,
    }));

  const pos = ast.fromVscodePosition(completionInfo.position);

  const decls = openFiles.get(completionInfo.textDocument.uri);
  if (decls === undefined) return keywords;

  // Add all gdecl names
  const functionDecls: Map<string, CompletionItem> = new Map();
  const typedefs: CompletionItem[] = [];
  const locals: CompletionItem[] = [];
  const fieldNames: CompletionItem[] = [];

  // TODO: only show decls up to this point 
  for (const decl of decls.decls) {
    // Stop once we get to a decl after the curser position 
    // in the current file
    if (decl.loc && decl.loc.source === completionInfo.textDocument.uri 
        && comparePositions(pos, decl.loc?.start) === Ordering.Less) 
      break;

    switch (decl.tag) {
      case "TypeDefinition":
        typedefs.push({
          label: decl.definition.id.name,
          kind: CompletionItemKind.Interface,
          documentation: mkMarkdownCode(`typedef ${typeToString(decl.definition.kind)} ${decl.definition.id.name}`),
          detail: decl.loc?.source || undefined 
        });
        break;

      case "FunctionTypeDefinition":
        typedefs.push({
          label: decl.definition.id.name,
          kind: CompletionItemKind.Interface,
          documentation: mkMarkdownCode(`typedef ${typeToString({ tag: "FunctionType", definition: decl.definition })}`),
          detail: decl.loc?.source || undefined 
        });
        break;

      case "StructDeclaration":
        if (decl.definitions === null) break;
        for (const field of decl.definitions) {
          fieldNames.push({
            label: field.id.name,
            kind: CompletionItemKind.Field,
            documentation: mkMarkdownCode(`${typeToString(field.kind)} ${decl.id.name}::${field.id.name}`),
            detail: decl.loc?.source || undefined 
          });
        }
        break;

      case "FunctionDeclaration": {
        // Prefer to use contracts from a function definition
        if (decl.body || !functionDecls.has(decl.id.name)) {
          const requires = decl.preconditions.map(precond => 
              `//@requires ${expressionToString(precond)}`);
          const ensures = decl.postconditions.map(postcond =>
              `//@ensures ${expressionToString(postcond)}`);

          functionDecls.set(decl.id.name, {
            label: decl.id.name,
            kind: CompletionItemKind.Function,
            documentation: mkMarkdownCode(
              `${[typeToString({ tag: "FunctionType", definition: decl }), ...requires, ...ensures].join("\n")}`),
            detail: decl.loc?.source || undefined
          });
        }
        if (decl.body) {
          // Look in the function body for local variables 
          if (!isInside(pos, decl.body.loc)) break;

          const searchResult = findStatement(decl.body, null, { pos, genv: decls });
          if (searchResult === null || searchResult.environment === null) break;

          for (const [name, type] of searchResult.environment) {
            locals.push({
              label: name,
              kind: CompletionItemKind.Variable,
              documentation: mkMarkdownCode(`${typeToString(type)} ${name}`),
              detail: decl.loc?.source || undefined
            });
          }
          break;
        }
      }
    }
  }

  // Don't include keywords since that corrupts the list 
  // FIXME: we can just use "sortText" to move them
  // to the end of the completion list. But we then
  // have to implement sortText for everything it seems 

  const completions = [...locals, ...functionDecls.values(), ...typedefs, ...fieldNames];

  return completions;
});

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => item);

connection.onHover((data: TextDocumentPositionParams): Hover | null => {
  const genv = openFiles.get(data.textDocument.uri);
  // Indicates no successful parse so far 
  if (genv === undefined) { return null; }

  // Note that VSCode 0-indexes positions,
  // so to be compatible with nearley we must
  // add 1 
  const hoverPos: ast.Position = ast.fromVscodePosition(data.position);

  // Search for which function we are in now
  // PERF: Cache the last function we found ourselves in
  // since it is likely we will return to it immediately after
  // That being said, this code is fairly efficient in my opinion
  const searchResult = findGenv({ pos: hoverPos, genv: genv }, data.textDocument.uri);

  // This indicates that the user hovered over something that
  // wasn't an indentifier 
  if (searchResult === null || searchResult.data === null) return null;

  switch (searchResult.data.tag) {
    case "FoundIdent": {
      const { name, type } = searchResult.data;
      return {
        contents: mkMarkdownCode(`${
          type.tag !== 'FunctionType' ? `${name}:` : ''} ${typeToString(type)}`)
      };
    }
    case "FoundType": {
      const { type } = searchResult.data;
      const realType = actualType(genv, type);

      return {
        contents: mkMarkdownCode(typeToString(realType))
      };
    }
  }
});

connection.onDefinition((data: TextDocumentPositionParams): LocationLink[] | null => {
  function toLocationLink(loc: ast.SourceLocation): LocationLink[] | null {
    return [{
      targetUri: loc.source || data.textDocument.uri,
      targetSelectionRange: {
        start: ast.toVscodePosition(loc.start),
        end: ast.toVscodePosition(loc.end)
      },
      targetRange: {
        start: ast.toVscodePosition(loc.start),
        end: ast.toVscodePosition(loc.end)
      }
    }];
  }

  const genv = openFiles.get(data.textDocument.uri);
  // Indicates no successful parse so far 
  if (genv === undefined) { return null; }

  const pos: ast.Position = ast.fromVscodePosition(data.position);

  const searchResult = findGenv({ pos, genv }, data.textDocument.uri);

  // This indicates that the user hovered over something that
  // wasn't an indentifier 
  if (searchResult === null || searchResult.data === null) return null;

  switch (searchResult.data.tag) {
    case "FoundType": {
      const { type } = searchResult.data;

      switch (type.tag) {
        case "Identifier":
          // Find a typedef with this tag 
          const typedef = getTypedefDefinition(genv, type.name);
          if (typedef !== null && typedef.loc) {
            return toLocationLink(typedef.loc);
          }
          break;

        case "StructType":
          const struct = getStructDefinition(genv, type.id.name);
          if (struct !== null && struct.loc) {
            return toLocationLink(struct.loc);
          }
          break;
      }
      break;
    }
    case "FoundIdent": {
      const { name, type } = searchResult.data;

      if (type.tag === "FunctionType") {
        // Look up function
        // TODO: suggest both the function declaration and the function definition 
        const func = getFunctionDeclaration(genv, name);
        if (func && func.loc) {
          return toLocationLink(func.loc);
        }
      }
      const definition: EnvEntry | undefined = searchResult.environment?.get(name);

      if (definition === undefined || definition.position === undefined) return null;

      return toLocationLink(definition.position);
    }
  }

  return null;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

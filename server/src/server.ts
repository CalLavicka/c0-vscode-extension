/**
 * The main entry point to the language server and all its capabilities
 */

import {
  createConnection,
  TextDocuments,
  Diagnostic,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  Hover,
  MarkupContent,
  LocationLink,
  CompletionParams,
  FileChangeType,
  TextDocumentChangeEvent,
  ParameterInformation,
  MarkupKind,
} from 'vscode-languageserver';

import { basicLexing } from './lex';
import { openFiles, parseTextDocument, invalidate, invalidateAll } from "./validate-program";

import * as ast from "./ast";
import * as lang from "./lang";
import { C0DiskSourceFile, C0ObjectSourceFile, C0SourceFile } from "./c0file";
import { readTarFile } from './util';
import { isInside, findDecl, findGenv, comparePositions } from "./ast-search";
import { typeToString, expressionToString } from './print';

import * as path from "path";
import * as fs from "fs";
import { EnvEntry } from './typecheck/types';
import { getFunctionDeclaration, actualType, getTypedefDefinition, getStructDefinition } from './typecheck/globalenv';
import { Maybe, Just, Nothing } from './util';
import { Ordering } from './util';
import { getCompletionContext, CompletionContextKind } from './c0Completions';
import { synthExpression } from './typecheck/expressions';
import * as glob from "glob";
import { URL } from "url";
import * as url from "url";

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents: TextDocuments = new TextDocuments();

/** 
 * Whether or not the language client
 * can send us configuration information (e.g. VSCode's JSON settings)
 */
let hasConfigurationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
  hasConfigurationCapability = !!params.capabilities.workspace?.configuration;

  return {
    capabilities: {
      textDocumentSync: documents.syncKind,
      completionProvider: {
        triggerCharacters: [".", ">", "@"], // ">" is for ->, @ is for contracts
        resolveProvider: false
      },
      hoverProvider: true,
      definitionProvider: true,
      signatureHelpProvider: { triggerCharacters: ["(", ","] }
    }
  };
});

// TODO: we will use this once we support the ability
// to turn off notifications for files with no README.txt
// connection.onInitialized(() => {
//   if (hasConfigurationCapability) {
//     connection.client.register(DidChangeConfigurationNotification.type, undefined);
//   }
// });

/**
 * Returns the text of the given file, possibly using a file
 * open in the editor. You should use this instead of
 * fs.readFile because it will properly take into account
 * unsaven contents in the editor.
 * 
 * @param uri URI with file:// protocol
 */
export function openFile(uri: string): string {
  // Check if the document is open, and use that instead
  const document = documents.all().find(document => document.uri === uri)

  if (document) {
    return document.getText();
  }

  // Otherwise open the document, potentially
  // throwing if it doesn't exist
  return fs.readFileSync(new URL(uri), "utf-8");
}

type Dependencies = {
  /** Path to README.txt */
  uri: string,
  /** List of files which should be loaded before this one, these are in URI format */
  dependencies: string[]
};

function getDependencies(name: string, configPaths: URL[]): Maybe<Dependencies> {
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      const fileLines = fs.readFileSync(configPath, { encoding: "utf-8" }).split("\n");
      // Filenames should be relative to the config file's location
      // This is a string in URI format
      const base: string = path.dirname(configPath.toString());
      // path will add platform-specific separators, which is not what we want
      const fname: string = path.posix.relative(base, name);

      // Try parsing it as a README.txt file
      for (const line of fileLines) {
        // The OS-specific path to the directory of the file
        const cwd = path.dirname(url.fileURLToPath(configPath));
        const dependencies: string[] = [];

        if (!/^\s*%\s*cc0/.test(line)) continue;
        const args = line.split(" ").map(s => s.trim()).filter(s => s !== "");

        for (let i = 0; i < args.length; i++) {
          const arg = args[i];
          switch (arg) {
            case "%":
            case "cc0":
            // Skip argument of -o
            case "-o": i++; continue;
            default:
              // Skip any other option (we will assume they are nullary even though this is really not true).
              // The issue is some options can either have a space or not, for example
              // 'cc0 -W all' and 'cc0 -Wall' are both valid. 
              // We try to mitigate this by checking that files are C0 files 
              // but that's not a perfect solution.
              if (arg[0] === '-') continue;

              // Expand any possible globs, but only if a glob is in there 
              if (glob.hasMagic(arg)) {
                // Sort to make sure we get the same order as POSIX. 
                // The library doesn't seem to sort them properly so we do it ourselves
                const files = glob.sync(arg, { cwd, nosort: true }).sort(); 
                for (const globbedFile of files) {
                  if (!lang.isC0File(globbedFile)) continue;
                  if (globbedFile === fname) {
                    // The currently opened file might be inside of a glob
                    return Just({ uri: configPath.toString(), dependencies });
                  }
                  
                  dependencies.push(`${base}/${globbedFile}`);
                }
              }
              else {
                // It's just a regular filename.
                if (arg === fname) {
                  // Stop once we find the currently open file,
                  // as we do not need any files after that
                  return Just({ uri: configPath.toString(), dependencies });
                }
                
                // Make sure the file is a c0/h0/o0/c1/h1/o1 file
                if (lang.isC0File(arg)) dependencies.push(`${base}/${arg}`);
              }
          }
        }
      }
    }
  }
  return Nothing;
}

/**
 * The cached project.txt for each file, or null if invalid
 */
const cachedProjects = new Map<string, Dependencies>();

connection.onDidChangeWatchedFiles(async params => {
  for (const change of params.changes) {
    // This file may be required by a README.txt, 
    // and may have caused compilation to fail somewhere else
    // TODO: Technically, we should only invalidate the cache
    // for files which depend on this. 
    if (change.type === FileChangeType.Created || change.type === FileChangeType.Deleted) {
      invalidateAll();
      // Use pArallelIsm to reload diagnostics
      // for all documents 
      await Promise.all(documents.all().map(document => validateTextDocument({ document })));
    }

    invalidate(change.uri);

    if (change.uri.endsWith("/README.txt")) {
      if (change.type === FileChangeType.Created) {
        // Invalidate all README caches, since this may be a new project file
        invalidateAll();
      } else {
        // Invalidate all references to this project.txt
        cachedProjects.forEach((value, key) => {
          if (value.uri === change.uri) {
            cachedProjects.delete(key);
          }
        });
      }

      // Ordering of files may have changed, screwing dependencies.
      invalidateAll();

      // Reload diagnostics for all documents 
      await Promise.all(documents.all().map(document => validateTextDocument({ document })));
    }
  }
});

documents.onDidOpen(validateTextDocument);
documents.onDidChangeContent(async (change) => {
  invalidate(change.document.uri);
  await validateTextDocument(change);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
async function validateTextDocument(change: TextDocumentChangeEvent) {
  let dependencies: string[] = [];
  const diagnostics: Diagnostic[] = [];

  const project = cachedProjects.get(change.document.uri);
  if (project) {
    dependencies = project.dependencies;
  } else {
    // Look for a config file
    const dir = path.dirname(change.document.uri);

    // maybe just use a VSCode config file...
    const folders = await connection.workspace.getWorkspaceFolders();

    const maybeDependencies = getDependencies(change.document.uri, [
      `${dir}/README.txt`,
      `${dir}/../README.txt`, // Look one folder above
      `${dir}/project.txt`,
      `${dir}/../project.txt`,
      folders?.length ? `${folders[0].uri}/project.txt` : ""
    ].filter(s => s !== "").map(p => new URL(p)));

    if (!maybeDependencies.hasValue && !(change.document.uri.endsWith("h0")
      || change.document.uri.endsWith("h1"))) {
      // TODO: whether this is displayed or not should be controlled via a diagnostic
      connection.window.showInformationMessage(`No README.txt found for ${path.basename(change.document.uri)}.\nRed squiggles and code completion might be incorrect`);
      dependencies = [];
    } else if (maybeDependencies.hasValue) {
      dependencies = maybeDependencies.value.dependencies;
      cachedProjects.set(change.document.uri, maybeDependencies.value);
    }
  }

  // use the tar library to find a list of files in all the .o0 or .o1 files
  // in each dependency. then unpack the files in memory
  const processedDependencies: C0SourceFile[] = [];

  for (const dependency of dependencies) {
    if (lang.isC0ObjectFile(dependency)) {
      const unpackedFiles = await readTarFile(new URL(dependency).pathname);

      // Each object file turns into multiple
      for (const [fileName, contents] of unpackedFiles) {
        // The virtual name would be like some/path/compressedLib.o0/source.c0
        const virtualFileName = `${dependency}/${fileName}`;
        processedDependencies.push(new C0ObjectSourceFile(virtualFileName, contents, dependency));
      }
    } else {
      processedDependencies.push(new C0DiskSourceFile(dependency));
    }
  }

  const parseErrors = await parseTextDocument(processedDependencies, change.document);

  connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [...diagnostics, ...parseErrors] });
}

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
    kind: MarkupKind.Markdown,
    value: mkCodeString(s)
  };
}

// This handler provides the initial list of the completion items.
connection.onCompletion(async (completionInfo: CompletionParams): Promise<CompletionItem[]> => {
  // TODO: use completionInfo to figure out if we should add keywords or not

  // The pass parameter contains the position of the text document in
  // which code complete got requested.
  const keywords: CompletionItem[] =
    basicLexing.identifier.keywords.keyword.map(word => ({
      label: word,
      kind: CompletionItemKind.Keyword,
    }));

  const pos = ast.fromVscodePosition(completionInfo.position);

  const genv = openFiles.get(completionInfo.textDocument.uri);
  if (genv === undefined) return keywords;

  // Add all gdecl names
  const functionDecls: Map<string, CompletionItem> = new Map();
  const typedefs: CompletionItem[] = [];
  const locals: CompletionItem[] = [];
  const structNames: CompletionItem[] = [];

  const folders = await connection.workspace.getWorkspaceFolders();

  /**
   * Converts a URI-format file path to a more readable one, local to the directory.
   * @param uri The URI to convert, with the leading file://
   */
  function uriToWorkspace(uri: string | undefined): string | undefined {
    if (!uri) {
      return undefined;
    }

    // If relative to a workspace, print relative path; otherwise, default to base file name
    if (folders) {
      for (const folder of folders) {
        if (uri.indexOf(folder.uri) === 0) {
          return path.relative(folder.uri, uri);
        }
      }
    }

    return path.parse(uri).base;
  }

  const doc = documents.get(completionInfo.textDocument.uri);
  const context = doc && getCompletionContext(
    doc.getText(),
    doc.offsetAt(completionInfo.position));

  if (context?.tag === CompletionContextKind.ContractDecl) {
    return ["assert", "loop_invariant", "requires", "ensures"]
      .map(label => ({ label, kind: CompletionItemKind.Keyword }));
  }

  // TODO: only show decls up to this point
  for (const decl of genv.decls) {
    const inCurrentFile = decl.loc && decl.loc.source === completionInfo.textDocument.uri;
    // Stop once we get to a decl after the curser position
    // in the current file
    if (inCurrentFile && comparePositions(pos, decl.loc!.start) === Ordering.Less)
      break;

    switch (decl.tag) {
      case "TypeDefinition":
        typedefs.push({
          label: decl.definition.id.name,
          kind: CompletionItemKind.Interface,
          documentation: {
            kind: MarkupKind.Markdown,
            value:
              mkCodeString(`typedef ${typeToString(decl.definition.kind)} ${decl.definition.id.name}`)
              + "\n" + decl.doc,
          },
          detail: uriToWorkspace(decl.loc?.source || undefined)
        });
        break;

      case "FunctionTypeDefinition":
        typedefs.push({
          label: decl.definition.id.name,
          kind: CompletionItemKind.Interface,
          documentation: mkMarkdownCode(`typedef ${typeToString({ tag: "FunctionType", definition: decl.definition })}`),
          detail: uriToWorkspace(decl.loc?.source || undefined)
        });
        break;

      case "StructDeclaration":
        structNames.push({
          label: `struct ${decl.id.name}`,
          kind: CompletionItemKind.Struct,
          documentation: {
            kind: MarkupKind.Markdown,
            value: mkCodeString(`struct ${decl.id.name}`) + "\n" + decl.doc
          },
          detail: uriToWorkspace(decl.loc?.source || undefined)
        });
        break;

      case "FunctionDeclaration": {
        // Prefer to use contracts from a function definition
        // if it is in the current file, or otherwise prefer to use it
        // from the prototype
        if (!functionDecls.has(decl.id.name) || (inCurrentFile && decl.body)
          || (!inCurrentFile && !decl.body)) {
          // We will only show functions if they are either in the current file
          // or if they are a prototype from another file
          if (!inCurrentFile && decl.body) break;

          const requires = decl.preconditions.map(precond =>
            `//@requires ${expressionToString(precond)};`);
          const ensures = decl.postconditions.map(postcond =>
            `//@ensures ${expressionToString(postcond)};`);

          const proto = `${[typeToString({ tag: "FunctionType", definition: decl }), ...requires, ...ensures].join("\n")}`;

          functionDecls.set(decl.id.name, {
            label: decl.id.name,
            kind: CompletionItemKind.Function,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `${"```c0\n" + proto + "\n```"}\n${decl.doc}`
            },
            detail: uriToWorkspace(decl.loc?.source || undefined)
          });
        }

        // // Look in the function body for local variables
        if (inCurrentFile && isInside(pos, decl.loc)) {
          const searchResult = findDecl(decl, { pos, genv });
          // We cannot provide accurate completions unless we know 
          // what variables are in scope
          if (searchResult === null || searchResult.environment === null) break;

          switch (context?.tag) {
            case CompletionContextKind.StructAccess:
              try {
                // Type safety? :D 
                const type = actualType(
                  genv,
                  <ast.Type>synthExpression(
                    genv,
                    searchResult.environment,
                    null,
                    <ast.Expression>context.expr
                  )
                );

                let actual;
                if (context.derefenced && type.tag === "PointerType") {
                  actual = actualType(genv, type.argument);
                }
                else {
                  actual = actualType(genv, type);
                }
                const structname = (<ast.StructType>actual).id?.name || "";

                const struct = getStructDefinition(genv, structname);
                if (struct && struct.definitions) {
                  return struct.definitions.map(field => ({
                    label: field.id.name,
                    kind: CompletionItemKind.Field,
                    documentation: mkMarkdownCode(`struct ${struct.id.name} {\n  ...\n  ${typeToString(field.kind)} ${field.id.name};\n};`),
                    detail: uriToWorkspace(field.loc?.source || undefined)
                  }));
                }
              }
              catch (e) { /* pass */ }
              break;
            case CompletionContextKind.FunctionCall: {
              // TODO: Promote functions with a return-type
              // of our current function argument
              // and local variables with either the correct type
              // or are pointers to structs 
              // (otherwise we have to do a search and deal with cycles)
              break;
            }
          }

          for (const [name, type] of searchResult.environment) {
            locals.push({
              label: name,
              kind: CompletionItemKind.Variable,
              documentation: mkMarkdownCode(`${typeToString(type)} ${name}`),
              detail: uriToWorkspace(decl.loc?.source || undefined)
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

  const builtins: CompletionItem[] = [
    {
      label: "assert",
      kind: CompletionItemKind.Function,
      documentation: mkMarkdownCode(`void assert(bool condition)`),
      detail: "<C0 built-in assert>"
    },
    {
      label: "error",
      kind: CompletionItemKind.Function,
      documentation: mkMarkdownCode(`void error(string message)`),
      detail: "<C0 built-in error>"
    },
    {
      label: "alloc",
      kind: CompletionItemKind.Function,
      detail: "<C0 built-in alloc>",
      documentation: mkMarkdownCode(`t* alloc(t)`)
    },
    {
      label: "alloc_array",
      kind: CompletionItemKind.Function,
      detail: "<C0 built-in alloc_array>",
      documentation: mkMarkdownCode(`t[] alloc_array(t, int count)`)
    }
  ];

  if (genv.libsLoaded.has("conio")) {
    builtins.push(
      {
        label: "printf",
        kind: CompletionItemKind.Function,
        detail: "<conio>",
        documentation: {
          kind: MarkupKind.Markdown,
          value: mkCodeString("void printf(string msg, ...args)") + "\n"
            + "Prints the message and argument"
        }
      }
    );
  }

  if (genv.libsLoaded.has("string")) {
    builtins.push(
      {
        label: "format",
        kind: CompletionItemKind.Function,
        detail: "<string>",
        documentation: {
          kind: MarkupKind.Markdown,
          value: mkCodeString("string format(string msg, ...args)") + "\n"
            + "Returns the message and arguments formatted as a string."
        }
      }
    );
  }

  const completions = [
    ...locals,
    ...functionDecls.values(),
    ...typedefs,
    ...structNames,
    ...builtins];

  // This assumes that .h0 always refers to a library in the "include path"
  for (const completion of completions) {
    if (completion.detail?.endsWith("h0")) {
      completion.detail = `#use <${path.basename(completion.detail, ".h0")}>`;
    }
  }

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

  const searchResult = findGenv({ pos: hoverPos, genv: genv }, data.textDocument.uri);

  if (searchResult === null || searchResult.data === null) return null;

  switch (searchResult.data.tag) {
    case "FoundIdent": {
      const { name, type } = searchResult.data;
      if (type.tag === "FunctionType") {
        // Also display contracts in hover result for a function 
        const decl = getFunctionDeclaration(genv, name, data.textDocument.uri);
        if (decl === null) return null;
        const requires = decl.preconditions.map(precond =>
          `//@requires ${expressionToString(precond)};`);
        const ensures = decl.postconditions.map(postcond =>
          `//@ensures ${expressionToString(postcond)};`);

        const proto = `${[typeToString({ tag: "FunctionType", definition: decl }), ...requires, ...ensures].join("\n")}`;

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `${"```c0\n" + proto + "\n```"}\n${decl.doc}`
          }
        };
      }
      else {
        return {
          contents: mkMarkdownCode(`${typeToString(type)} ${name}`)
        };
      }
    }
    case "FoundType": {
      const { type } = searchResult.data;
      const realType = actualType(genv, type);

      // Display as typedef if custom type
      if (type.tag === "Identifier") {
        const decl = getTypedefDefinition(genv, type.name);

        return {
          contents: decl?.doc || mkMarkdownCode(`typedef ${typeToString(realType)} ${type.name}`)
        };
      }

      return {
        contents: mkMarkdownCode(typeToString(realType))
      };
    }
    case "FoundField": {
      const { field, expression } = searchResult.data;

      return {
        contents: mkMarkdownCode(`${typeToString(field.kind)} ${expression}`)
      };
    }
    default: return null;
  }
});

connection.onDefinition((data: TextDocumentPositionParams): LocationLink[] | null => {
  function toLocationLink(loc: ast.SourceLocation, origin?: ast.SourceLocation | undefined): LocationLink[] | null {
    if (loc.source && lang.isC0ObjectFile(loc.source)) {
      // Currently we can't go-to-definition for something defined in a C0 object file
      // because the file only exists in memory
      // TODO: go to definition for functions defined in object files
      // should show the interface
      return null;
    }

    let targetUri: string;
    // Don't create another view file, 1 is enough 
    if (loc.source?.endsWith(".h0") && !loc.source.endsWith("-view.h0")) {
      // Make a copy of any header files so 
      // users can't mess it up
      targetUri = loc.source.replace(".h0", "-view.h0");
      fs.copyFileSync(new URL(loc.source), new URL(targetUri));
    }
    else {
      // FIXME: this doesn't seem right...if loc.source is null
      // then why default to the current file?
      targetUri = loc.source || data.textDocument.uri;
    }
    return [{
      targetUri,
      targetSelectionRange: {
        start: ast.toVscodePosition(loc.start),
        end: ast.toVscodePosition(loc.end)
      },
      targetRange: {
        start: ast.toVscodePosition(loc.start),
        end: ast.toVscodePosition(loc.end)
      },
      originSelectionRange: origin === undefined ? undefined : {
        start: ast.toVscodePosition(origin.start),
        end: ast.toVscodePosition(origin.end)
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
            return toLocationLink(struct.loc, type.loc);
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
        const func = getFunctionDeclaration(genv, name, data.textDocument.uri);
        if (func && func.loc) {
          return toLocationLink(func.loc);
        }
      }
      const definition: EnvEntry | undefined = searchResult.environment?.get(name);

      if (definition === undefined || definition.position === undefined) return null;

      return toLocationLink(definition.position);
    }
    case "FoundField": {
      const { field, struct } = searchResult.data;

      if (field.id.loc === undefined) return null;
      // Source is only present on upper-most declarations
      field.id.loc.source = struct.loc?.source;
      return toLocationLink(field.id.loc);
    }
    case "FoundLink": {
      return toLocationLink({
        source: searchResult.data.path,
        start: { line: 1, column: 1 }, end: { line: 1, column: 1 }
      });
    }
  }

  return null;
});

connection.onSignatureHelp((data) => {
  const genv = openFiles.get(data.textDocument.uri);
  if (genv === undefined) { return null; }

  const doc = documents.get(data.textDocument.uri);
  if (!doc) return null;

  // Subtract one from the offset because 
  // data.position is the character right after
  // the opening paren or comma, which we want to ignore 
  const context = getCompletionContext(
    doc.getText(),
    doc.offsetAt(data.position) - 1);

  if (context && context.tag === CompletionContextKind.FunctionCall) {
    // TODO: add signature help for built-in assert() and error() 

    let functionDecl: null | {
      readonly returns: ast.Type,
      readonly id: { name: string },
      readonly params: Array<{ kind: ast.ValueType, id: { name: string } }>,
      readonly doc: string
    } = getFunctionDeclaration(genv, context.name, data.textDocument.uri);

    if (!functionDecl) {
      // See if it's a built in "function" 
      switch (context.name) {
        case "assert":
          functionDecl = {
            returns: { tag: "VoidType" },
            id: { name: "assert" },
            params: [{ id: { name: "condition" }, kind: { tag: "BoolType" } }],
            doc: "Aborts execution if the condition given is false"
          };
          break;
        case "error":
          functionDecl = {
            returns: { tag: "VoidType" },
            id: { name: "error" },
            params: [{ id: { name: "message" }, kind: { tag: "StringType" } }],
            doc: "Prints the given message and aborts execution"
          };
          break;

        case "format":
          functionDecl = {
            returns: { tag: "StringType" },
            id: { name: "format" },
            params: [{ id: { name: "msg" }, kind: { tag: "StringType" } }],
            doc:
              "Returns `msg` but replacing each _format specifier_ with an argument.\n" +
              "The number and type of format specifiers must match the arguments provided.\n" +
              "Available format specifiers:\n" +
              "```\n" +
              "  %s -> string\n" +
              "  %d -> int\n" +
              "  %c -> char\n" +
              "  %% -> literal percent sign\n" +
              "```"
          };
          break;

        case "printf":
          functionDecl = {
            returns: { tag: "VoidType" },
            id: { name: "printf" },
            params: [{ id: { name: "msg" }, kind: { tag: "StringType" } }],
            doc:
              "Prints `msg`, replacing each _format specifier_ with an argument.\n" +
              "The number and type of format specifiers must match the arguments provided.\n" +
              "Available format specifiers:\n" +
              "```\n" +
              "  %s -> string\n" +
              "  %d -> int\n" +
              "  %c -> char\n" +
              "  %% -> literal percent sign\n" +
              "```"
          };
          break;

        default: return null;
      }
    }
    let signature = `${typeToString(functionDecl.returns)} ${functionDecl.id.name}(`;
    let signatureLength = signature.length;

    const paramInfo: ParameterInformation[] = [];

    for (let i = 0; i < functionDecl.params.length; i++) {
      const param = functionDecl.params[i];

      const paramText = `${typeToString(param.kind)} ${param.id.name}`;
      paramInfo.push(ParameterInformation.create([signatureLength, signatureLength + paramText.length]));

      signature += paramText;
      signatureLength += paramText.length;

      if (i !== functionDecl.params.length - 1) {
        signature += ", ";
        signatureLength += 2;
      }
    }

    signature += ")";

    const sig = {
      label: signature,
      parameters: paramInfo,
      documentation: {
        kind: MarkupKind.Markdown,
        value: functionDecl.doc
      }
    };

    return {
      signatures: [sig], // Functions only have one signature ever in C0
      activeSignature: 0,
      activeParameter: context.argumentNumber
    };
  }
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

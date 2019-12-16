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
    CompletionParams
} from 'vscode-languageserver';

import { basicLexing } from './lex';
import { WordListClass } from './word-list';
import { openFiles, validateTextDocument } from "./validate-program";
import { AnnoStatement } from './parse/parsedsyntax';

import { Position, fromVscodePosition, toVscodePosition } from "./ast";
import { isInside, findStatement} from "./ast-search";
import { typeToString, expressionToString } from './print';

import * as path from "path";
import * as fs from "fs";
import { EnvEntry } from './typecheck/types';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;
const WordList: WordListClass = new WordListClass(basicLexing.identifier.keywords.keyword);

connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we will fall back using global settings
    hasConfigurationCapability = Boolean(capabilities!.workspace!.configuration);
    hasWorkspaceFolderCapability = Boolean(capabilities.workspace!.workspaceFolders);
    hasDiagnosticRelatedInformationCapability = Boolean(capabilities.textDocument!.publishDiagnostics!.relatedInformation);

    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            // Tell the client that the server supports code completion
            completionProvider: {
                resolveProvider: false
            },
            hoverProvider: true,
            definitionProvider: true 
        }
    };
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

// The example settings
interface ExampleSettings {
    maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

// Only keep settings for open documents
documents.onDidClose(e => {
    openFiles.delete(e.document.uri);
    documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    // Look for a config file
    // TODO: cache the config file

    const fname = path.basename(change.document.uri);
    const dir = path.dirname(change.document.uri).substr(7);
    // This should probably be relative to the workspace
    // or maybe just use a VSCode config file...
    const configPath = `${dir}/project.txt`;

    let dependencies = [];    

    if (fs.existsSync(configPath)) {
        // Technically this is risky since someone
        // could come and delete the file between 
        // when we checked if it existed and
        // when we read the file
        const files = fs.readFileSync(configPath, { encoding: 'utf8'})
            .split("\n").map(s => s.trim());

        let found = false;
        // Test if our current file is in there
        for (const file of files) {
            if (file === fname) {
                found = true;
                break;
            }

            dependencies.push(file);
        }

        if (!found) dependencies = [];
    }

    validateTextDocument(dependencies.map(d => `${dir}/${d}`), change.document)
        .then(diagnostics => connection.sendDiagnostics({ uri: change.document.uri, diagnostics }));

    WordList.handleContextChange(change);
});

connection.onDidChangeWatchedFiles(_change => {
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
    let keywords: CompletionItem[] = 
        basicLexing.identifier.keywords.keyword.map(word => ({ 
            label: word, kind: 
            CompletionItemKind.Keyword,
        }));

    const pos = fromVscodePosition(completionInfo.position);

    const decls = openFiles.get(completionInfo.textDocument.uri);
    if (decls === undefined) return keywords;
    
    // Add all gdecl names
    const functionDecls: Map<string, CompletionItem> = new Map();
    const typedefs: CompletionItem[] = [];
    const locals: CompletionItem[] = [];

    for (const decl of decls.decls) {
        switch (decl.tag) {
            case "TypeDefinition":
                typedefs.push({
                    label: decl.definition.id.name,
                    kind: CompletionItemKind.Interface,
                    documentation: mkMarkdownCode(`typedef ${typeToString(decl.definition.kind)} ${decl.definition.id.name}`),
                    detail: (decl.loc?.source) || undefined
                });
                break;

            case "FunctionDeclaration": {
                // We can't use these because contracts can be on both
                // the prototype and on the definition, and both count

                // const requires = decl.preconditions.map(precond => 
                //     ` - ${mkCodeString("//@requires " + expressionToString(precond))}\n`);
                // const ensures = decl.postconditions.map(postcond =>
                //     ` - ${mkCodeString("//@ensures " + expressionToString(postcond))}\n`);

                // const existingItem = functionDecls.get(decl.id.name);
                // if (existingItem) {
                //     // Append new contracts
                //     //existingItem.
                // }    
                functionDecls.set(decl.id.name, {
                    label: decl.id.name,
                    kind: CompletionItemKind.Function,
                    documentation: {
                        kind: "markdown",
                        value: mkCodeString(typeToString({ tag: "FunctionType", definition: decl }))
                    },
                    detail: decl.loc?.source || undefined
                });
                if (decl.body) {
                    // Look in the function body for local variables 
                    if (!isInside(pos, decl.body.loc)) break;
            
                    const searchResult = findStatement(decl.body, null, { pos: pos, genv: decls });                    
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

    const completions = [...locals, ...(functionDecls.values()), ...typedefs];

    return completions;
});

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => item);

connection.onHover((data: TextDocumentPositionParams): Hover | null => {
    const decls = openFiles.get(data.textDocument.uri);
    // Indicates no successful parse so far 
    if (decls === undefined) { return null; }

    // Note that VSCode 0-indexes positions,
    // so to be compatible with nearley we must
    // add 1 
    const hoverPos: Position = fromVscodePosition(data.position);

    // Search for which function we are in now
    // PERF: Cache the last function we found ourselves in
    // since it is likely we will return to it immediately after
    // That being said, this code is fairly efficient in my opinion
    for (const decl of decls.decls) {
        if (decl.tag !== "FunctionDeclaration") continue;
        // FIXME: look inside contracts too 
        if (decl.body === null) continue;

        if (!isInside(hoverPos, decl.body.loc)) continue;

        const searchResult = findStatement(decl.body, null, { pos: hoverPos, genv: decls });
        
        // This indicates that the user hovered over something that
        // wasn't an indentifier 
        if (searchResult === null || searchResult.data === null) return null;

        const { name, type } = searchResult.data;

        return {
            contents: mkMarkdownCode(`${name}: ${typeToString(type)}`)
        };
    }

    return null;
});

connection.onDefinition((data: TextDocumentPositionParams): LocationLink[] | null => {
    const genv = openFiles.get(data.textDocument.uri);
    // Indicates no successful parse so far 
    if (genv === undefined) { return null; }

    const pos: Position = fromVscodePosition(data.position);

    // This needs to be extracted to a function lol
    for (const decl of genv.decls) {
        if (decl.tag !== "FunctionDeclaration") continue;
        // FIXME: look inside contracts too 
        if (decl.body === null) continue;

        if (!isInside(pos, decl.body.loc)) continue;

        const searchResult = findStatement(decl.body, null, { pos, genv });
        
        // This indicates that the user hovered over something that
        // wasn't an indentifier 
        if (searchResult === null || searchResult.data === null) return null;

        const { name } = searchResult.data;
        const definition: EnvEntry | undefined = searchResult.environment?.get(name);
        
        if (definition === undefined || definition.position === undefined) return null;

        const item: LocationLink[] = [{
            targetSelectionRange: {
                start: toVscodePosition(definition.position.start),
                end: toVscodePosition(definition.position.end)
            },
            targetUri: data.textDocument.uri,
            targetRange: {
                start: toVscodePosition(definition.loc?.start || definition.position.end),
                end: toVscodePosition(definition.position.end)
            }
        }];

        return item;
    }

    return null;
    
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
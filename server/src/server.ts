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
    Hover
} from 'vscode-languageserver';

import { basicLexing } from './lex';
import { WordListClass } from './word-list';
import { openFiles, validateTextDocument } from "./validate-program";
import { AnnoStatement } from './parse/parsedsyntax';

import { Position, isInside, findStatement } from "./ast";
import { typeToString } from './print';

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
                resolveProvider: true
            },
            hoverProvider: true
        }
    };
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
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
    validateTextDocument(change.document)
        .then(diagnostics => connection.sendDiagnostics({ uri: change.document.uri, diagnostics }));

    WordList.handleContextChange(change);
});

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VS Code
    connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. 
        return basicLexing.identifier.keywords.keyword
            .map(word => ({ label: word, kind: CompletionItemKind.Text }));
        // return WordList.getList();
    });

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => item);

// connection.onHover((data: TextDocumentPositionParams): Hover | null => {
//     const decls = openFiles.get(data.textDocument.uri);
//     // Indicates no successful parse so far 
//     if (decls === undefined) { return null; }

//     // Note that VSCode 0-indexes positions,
//     // so to be compatible with nearley we must
//     // add 1 
//     const hoverPos: Position = {
//         column: data.position.character + 1,
//         line: data.position.line + 1
//     };

//     // Search for which function we are in now
//     // PERF: Cache the last function we found ourselves in
//     // since it is likely we will return to it immediately after
//     // That being said, this code is fairly efficient in my opinion
//     for (const decl of decls.decls) {
//         if (decl.tag !== "FunctionDeclaration") continue;
//         if (decl.body === null) continue;

//         if (!isInside(hoverPos, decl.body.loc)) continue;

//         const searchResult = findStatement(decl.body, null, { pos: hoverPos, genv: decls });
        
//         // This indicates that the user hovered over something that
//         // wasn't an indentifier 
//         if (searchResult === null) return null;

//         const { name, type } = searchResult;

//         return {
//             contents: {
//                 kind: "markdown",
//                 // FIXME: can we put C0 as the language? 
//                 // using c++ for now so string gets highlighted
//                 value: `\`\`\`cpp\n${name}: ${typeToString(type)}\n\`\`\``
//             }
//         };
//     }

//     return null;
// });

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
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
    Position
} from 'vscode-languageserver';
import { listeners } from 'cluster';

import * as nearley from 'nearley';
import grammar from './program-rules';
import * as parsed from "./parse/parsedsyntax";
import { TypeLexer } from './lex';
import * as ast from "./ast";
import { Lang } from './lang';
import { checkProgram } from './typecheck/programs';
import { restrictDeclaration } from './parse/restrictsyntax';
import { TypingError } from './error';

// Overwrite nearley's error reporting because it is broken
function myReportError(parser: nearley.Parser, token: any) {
    var lines: string[] = [];
    var tokenDisplay = (token.type ? token.type + " token: " : "") + JSON.stringify(token.value !== undefined ? token.value : token);
    lines.push(parser.lexer.formatError(token, "Syntax error"));
    lines.push('Unexpected ' + tokenDisplay + '.');
    return lines.join("\n");
}

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we will fall back using global settings
    hasConfigurationCapability =
    !!capabilities.workspace && !!capabilities.workspace.configuration;
    hasWorkspaceFolderCapability =
    !!capabilities.workspace && !!capabilities.workspace.workspaceFolders;
    hasDiagnosticRelatedInformationCapability =
    !!capabilities.textDocument &&
    !!capabilities.textDocument.publishDiagnostics &&
    !!capabilities.textDocument.publishDiagnostics.relatedInformation;

    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            // Tell the client that the server supports code completion
            completionProvider: {
                resolveProvider: true
            }
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

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(
            (change.settings.languageServerExample || defaultSettings)
            );
        }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'c0LanguageServer'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
});

function* semicolonSplit(s: string) {
    const normRegex = /(;|\/\/|\/\*)/g;
    const cmtRegex = /(;|\n|\*\/)/g;
    let ndx = s.search(normRegex);
    let inComment = false;
    while (ndx >= 0) {
        const semi = s.charAt(ndx) === ';';
        if (inComment && s.charAt(ndx) === '\n') {
            ndx++;
        } else if (inComment && s.charAt(ndx) === '*') {
            ndx += 2;
        }
        yield { last: false, segment: s.slice(0, ndx), semicolon: semi};
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

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    // In this simple example we get the settings for every validate run.
    let settings = await getDocumentSettings(textDocument.uri);

    // The validator creates diagnostics for all uppercase words length 2 and more
    let text = textDocument.getText();
    const lines = text.split("\n");

    let problems = 0;
    let diagnostics: Diagnostic[] = [];

    const parser: any = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
    const lexer: TypeLexer = (parser.lexer = new TypeLexer("C1", new Set()));
    // Overwrite the reportError function cause otherwise it loops :(
    parser.reportError = function(token: any) {
        return myReportError(this, token);
    };

    // Send through the parser semicolon-by-semicolon
    const segments = semicolonSplit(text);
    let parsed: boolean = true;
    let decls: parsed.Declaration[] = [];
    let size = 0;
    let curOffset = 0;

    // Function to add a diagnostic for a parse error
    function addError(line: number | null, columnOrOffset: number,
        message: string, severity: DiagnosticSeverity) {
        
        let pos: Position;
        if (line !== null) {
            pos = Position.create(line, columnOrOffset);
        } else {
            pos = textDocument.positionAt(columnOrOffset);
        }
        const diagnostic: Diagnostic = {
            severity: severity,
            range: {
                start: pos,
                end: pos
            },
            message: message,
            source: 'c0-language'
        };
        diagnostics.push(diagnostic);
        parsed = false;
    }

    // Iterate through semicolon segments
    for (let segment of segments) {
        let parseState = parser.save();
        curOffset += segment.segment.length;
        try {
            parser.feed(segment.segment);
            const parsed = parser.finish();
            if (parsed.length > 1) {
                console.log("Parse ambiguous:");
                console.log(JSON.stringify(parsed[0]));
                console.log(JSON.stringify(parsed[1]));
                console.log(JSON.stringify(parsed[2]));
                console.log(JSON.stringify(parsed[3]));
                console.log(JSON.stringify(parsed[4]));
                console.log(JSON.stringify(parsed[5]));
                console.log(JSON.stringify(parsed[parsed.length - 1]));
            } else if (parsed.length === 0) {
                if (segment.last) {
                    addError(null, curOffset, "Incomplete parse at the end of the file", DiagnosticSeverity.Warning);
                } else if (segment.semicolon) {
                    parser.feed(";");
                }
            } else {
                // parsed.length === 1
                const parsedGlobalDecls = parsed[0];
                for (let i = size; i < parsedGlobalDecls.length - 1; i++) {
                    if (parsedGlobalDecls[i].tag === "TypeDefinition" ||
                        parsedGlobalDecls[i].tag === "FunctionTypeDefinition") {
                        addError(null, curOffset, `typedef is missing its trailing semicolon`, DiagnosticSeverity.Error);
                    }
                }
                if (segment.last) {
                    if (parsedGlobalDecls.length > size) {
                        const possibleTypeDef: ast.Declaration = parsedGlobalDecls[parsedGlobalDecls.length - 1];
                        if (
                            possibleTypeDef.tag === "TypeDefinition" ||
                            possibleTypeDef.tag === "FunctionTypeDefinition"
                        ) {
                            addError(null, curOffset, 
                                `typedef without a final semicolon at the end of the file`, 
                                DiagnosticSeverity.Error);
                        }
                    }
                    decls = decls.concat(parsedGlobalDecls);
                } else {
                    if (parsedGlobalDecls.length === 0) { throw new Error(`semicolon at beginning of file`); }
    
                    const possibleTypedef: ast.Declaration = parsedGlobalDecls[parsedGlobalDecls.length - 1];
                    if (parsedGlobalDecls.length === size) {
                        addError(null, curOffset, `too many semicolons after a ${possibleTypedef.tag}`, 
                            DiagnosticSeverity.Error);
                    }
                    size = parsedGlobalDecls.length;
    
                    switch (possibleTypedef.tag) {
                        case "TypeDefinition":
                        case "FunctionTypeDefinition": {
                            lexer.addIdentifier(possibleTypedef.definition.id.name);
                            break;
                        }
                        default:
                            addError(null, curOffset, 
                                `unnecessary semicolon at the top level after ${possibleTypedef.tag}`,
                                DiagnosticSeverity.Error);
                    }
                    parser.feed(" ");
                }
            }
        } catch(err) {
            // Restore old state before the bad line
            parser.restore(parseState);
            for (let i = 0; i < segment.segment.length; i++) {
                const ch = segment.segment.charAt(i);
                switch(ch) {
                case '\n':
                case '{':
                case '}':
                    parseState = parser.save();
                    try {
                        parser.feed(ch);
                    }catch(err) {
                        parser.restore(parseState);
                        parser.feed(" ");
                    }
                default:
                    parser.feed(" ");
                }
            }
            if (segment.semicolon) {
                parser.feed(" ");
            }
            addError(err.token.line - 1, err.token.col - 1, err.message, DiagnosticSeverity.Error);
        }
    }

    if (parsed) {
        let errors = new Set<TypingError>();
        let restrict = new Array<ast.Declaration>();
        decls.forEach(decl => {
            try {
                restrict.push(restrictDeclaration("C1", decl));
            } catch(err) {
                errors.add(err);
            }
        });
        if (errors.size === 0) {
            errors = checkProgram([], restrict);
        }

        // Show all of the errors gathered
        errors.forEach(error => {
            if (error.loc !== null && error.loc !== undefined) {
                const diagnostic: Diagnostic = {
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: Position.create(error.loc.start.line - 1, error.loc.start.column - 1),
                        end: Position.create(error.loc.end.line - 1, error.loc.end.column - 1)
                    },
                    message: error.message,
                    source: 'c0-language'
                };
                diagnostics.push(diagnostic);
            }
        });
    }
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 80) {
            // More than 80 characters, so underline
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: Position.create(i, 0),
                    end: Position.create(i, Number.MAX_VALUE)
                },
                message: `There are ${lines[i].length} characters in this line.\nPlease lower it to < 80.`,
                source: 'c0-language'
            };
            diagnostics.push(diagnostic);
        }
    }

    // Send the computed diagnostics to VS Code.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VS Code
    connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        // The pass parameter contains the position of the text document in
        // which code complete got requested. For the example we ignore this
        // info and always provide the same completion items.
        return [
            {
                label: 'TypeScript',
                kind: CompletionItemKind.Text,
                data: 1
            },
            {
                label: 'JavaScript',
                kind: CompletionItemKind.Text,
                data: 2
            }
        ];
    }
    );

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            item.detail = 'TypeScript details';
            item.documentation = 'TypeScript documentation';
        } else if (item.data === 2) {
            item.detail = 'JavaScript details';
            item.documentation = 'JavaScript documentation';
        }
        return item;
    }
    );


connection.onDidOpenTextDocument((params) => {
    // A text document got opened in VS Code.
    // params.uri uniquely identifies the document. For documents store on disk this is a file URI.
    // params.text the initial full content of the document.
    connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
    // The content of a text document did change in VS Code.
    // params.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
    connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
    // A text document got closed in VS Code.
    // params.uri uniquely identifies the document.
    connection.console.log(`${params.textDocument.uri} closed.`);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

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
    Position,
    TextDocumentChangeEvent
} from 'vscode-languageserver';
// import * as Trie from 'triejs';


class WordListClass {
    set : Set<CompletionItem>;
    
    constructor(word: string[]) {
        this.set = new Set();
        for (let w of word) {
            this.set.add({label: w, kind: CompletionItemKind.Text});
        }
    }
    /**
     * Add word to the autocomplete list
     *
     * @param {string} word
     * @param {any} trie
     * @param {vscode.TextDocument} document
     */
    addWord(word: string, document: TextDocument) {
        // Active word is used to hide the given word from the autocomplete.
        const item : CompletionItem = {label: word, kind: CompletionItemKind.Text};
        this.set.add(item);
    }
    /**
     * Remove word from the search index.
     *
     * @param {string} word
     * @param {any} trie
     */
    removeWord(word: string, document: TextDocument) {
        this.set.delete({label: word, kind: CompletionItemKind.Text});
    }

    getList() : CompletionItem[] {
        return Array.from(this.set.values());
    }
}


export function handleContextChange(e: TextDocumentChangeEvent) {
    let text = e.document.getText();
    let words = text.split(/[\s;>]+/);
    console.log(words[0]);
    for (let word of words) {
        WordList.addWord(word, e.document);
    }
    
}

const keyWords: string[] = [
    "int",
    "bool",
    "string",
    "char",
    "void",
    "struct",
    "typedef",
    "if",
    "else",
    "while",
    "for",
    "continue",
    "break",
    "return",
    "assert",
    "error",
    "true",
    "false",
    "NULL",
    "alloc",
    "alloc_array",
    "requires",
    "ensures",
    "loop_invariant"
]

export const WordList = new WordListClass(keyWords);
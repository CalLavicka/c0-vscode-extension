
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
    set : Set<string>;
    
    constructor(word: string[]) {
        this.set = new Set();
        for (let w of word) {
          this.set.add(w);
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
        this.set.add(word);
    }
    /**
     * Remove word from the search index.
     *
     * @param {string} word
     * @param {any} trie
     */
    removeWord(word: string, document: TextDocument) {
      this.set.delete(word);
    }

    getList() : CompletionItem[] {
      let res : CompletionItem[] = [];
      for (let w of this.set.values()) {
        res.push({label: w, kind: CompletionItemKind.Text});
      }

      return res;
    }
}


export function handleContextChange(e: TextDocumentChangeEvent) {
    let text = e.document.getText();
    let words = text.split(/[^a-zA-Z\d\_]+/);
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
];

export const WordList = new WordListClass(keyWords);
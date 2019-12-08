
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

// A data structure to keep track of the words used in this file
// We currently use a set, can be changed to a trie for more efficient lookup
class WordListClass {
    set : Set<string>;
    
    /**
     * Initialize the list to only contain the keywords
     *
     * @param {string} word
     */
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
     */
    addWord(word: string) {
        // Active word is used to hide the given word from the autocomplete.
        const item : CompletionItem = {label: word, kind: CompletionItemKind.Text};
        this.set.add(word);
    }

    /**
     * Remove word from the search index.
     *
     * @param {string} word
     */
    removeWord(word: string) {
      this.set.delete(word);
    }

    /**
     * Clear the wordlist
     *
     */
    clear(){
      this.set.clear();
    }

    /**
     * Return the WordList as a list
     *
     */
    getList() : CompletionItem[] {
      let res : CompletionItem[] = [];
      for (let w of this.set.values()) {
        res.push({label: w, kind: CompletionItemKind.Text});
      }

      return res;
    }
}

/**
 * When the contents of a document are changed, regenerate the WordList
 *
 * @param {TextDocumentChangeEvent} e
 */
export function handleContextChange(e: TextDocumentChangeEvent) {
    WordList.clear();
    for (let w of keyWords) {
      WordList.addWord(w);
    }
    let text = e.document.getText();
    let words = text.split(/[^a-zA-Z\d\_]+/);
    for (let word of words) {
        WordList.addWord(word);
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
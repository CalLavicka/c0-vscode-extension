import {
    TextDocument,
    CompletionItem,
    CompletionItemKind,
    TextDocumentChangeEvent
} from 'vscode-languageserver';
// import * as Trie from 'triejs';

// A data structure to keep track of the words used in this file
// We currently use a set, can be changed to a trie for more efficient lookup
class WordListClass {

    // The keywords 
    keywords : Set<string>;

    // A mapping from files to the words in that file
    dictionary: Map<TextDocument, Set<string>>;

    /**
     * Initialize the list to only contain the keywords
     *
     * @param {string[]} word
     * 
     */

    constructor(word: string[]) {
        this.keywords = new Set();
        for (let w of word) {
          this.keywords.add(w);
        }
        this.dictionary = new Map();
    }

    /**
     * Add word to the autocomplete list for that particular document
     *
     * @param {string} word
     * @param {TextDocument} d
     * 
     */
    addWord(word: string, d: TextDocument) {

        if (!this.dictionary.has(d)) {
          this.dictionary.set(d,new Set());
        }
        if (this.dictionary.has(d)) {
          this.dictionary.get(d)!.add(word);
        }
    }

    /**
     * Clear the set associated with a particular document 
     * @param {TextDocument} d
     * 
     */
    clear(d: TextDocument){
      if (this.dictionary.has(d)) {
        this.dictionary.get(d)!.clear();      
      }
      
    }

    /**
     * Return the WordList as a list
     *
     */
    getList() : CompletionItem[] {
      let set = new Set<string>();
      let res : CompletionItem[] = [];
      for (let docWords of this.dictionary.values()) {
        for (let word of docWords.values()){
          set.add(word);
        }
      }
      for (let word of this.keywords.values()){
        set.add(word);
      }

      for (let word of set.values()){
        res.push({label: word, kind: CompletionItemKind.Text});
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
    WordList.clear(e.document);
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
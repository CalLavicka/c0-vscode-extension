import {
    TextDocument,
    CompletionItem,
    CompletionItemKind,
    TextDocumentChangeEvent
} from 'vscode-languageserver';
import { basicLexing } from './lex'

// A data structure to keep track of the words used in this file
// We currently use a set, can be changed to a trie for more efficient lookup
export class WordListClass {

    // A mapping from files to the words in that file
    dictionary: Map<TextDocument, Set<string>>;

    /**
     * Initialize the list to only contain the keywords
     *
     * @param {string[]} word
     * 
     */

    constructor() {
        // this.keywords = new Set();
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
        this.dictionary.get(d)!.add(word);
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
        for (let docWords of this.dictionary.values()) {
            for (let word of docWords.values()){
                set.add(word);
            }
        }

        // Get the keywords
        basicLexing.identifier.keywords.keyword.forEach(set.add);
        
        let res : CompletionItem[] = [];
        for (let word of set.values()){
            res.push({label: word, kind: CompletionItemKind.Text});
        }
        
        return res;
    }
        
    /**
    * When the contents of a document are changed, regenerate the WordList
    *
    * @param {TextDocumentChangeEvent} e
    */
    handleContextChange(e: TextDocumentChangeEvent) {
        if (this.dictionary.has(e.document)) {
            this.dictionary.get(e.document)!.clear();      
        }

        let text = e.document.getText();
        let words = text.split(/[^a-zA-Z\d\_]+/);
        words.forEach(w => this.addWord(w, e.document));
    }
}




// export const WordList = new WordListClass(keywords);
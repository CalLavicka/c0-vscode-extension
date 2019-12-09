import {
    TextDocument,
    CompletionItem,
    CompletionItemKind,
    TextDocumentChangeEvent
} from 'vscode-languageserver';

// A data structure to keep track of the words used in this file
// We currently use a set, can be changed to a trie for more efficient lookup
export class WordListClass {
    // The keywords 
    private keywords : Set<string>;

    // A mapping from files to the words in that file
    private dictionary: Map<TextDocument, Set<string>>;

    /**
     * Initialize the list to only contain the keywords
     *
     * @param {string[]} keywords
     * 
     */

    constructor(keywords: string[]) {
        this.keywords = new Set();
        for (let w of keywords) {
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
        this.dictionary.forEach((docWords) => docWords.forEach((v)=>{set.add(v);}));

        // Get the keywords
        this.keywords.forEach((v)=>{set.add(v);});
        
        let res : CompletionItem[] = [];
        set.forEach((word) => res.push({label: word, kind: CompletionItemKind.Text}));
        
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

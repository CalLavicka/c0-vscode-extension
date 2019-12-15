import { states, Token, Lexer, LexerState } from "moo";
import { Lang } from "./lang";

/**
 * Ambitious Goal: "invalid syntax" errors from the lexer are unclear. Can we take errors out of the lexer to
 * the point we can clearly enumerate all files that will _not_ be accepted by the lexer? This would also
 * facilitate.
 *
 * Desired spec:
 * All UTF-8 strings should lex, unless they:
 *  1. Contain non-printable characters.
 *  2. Contain the character ` outside of a string/char/comment.
 *  3. Contain characters outside of the UTF-8 range.
 */
export const basicLexing = {
    identifier: {
        match: /[A-Za-z_][A-Za-z0-9_]*/,
        keywords: {
            keyword: [
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
                "alloc_array"
            ]
        }
    },
    numeric_literal: { match: /(?:0[0-9a-zA-Z_]+)|(?:[1-9][A-Za-z0-9_]*)|0/ },
    char_delimiter: { match: /'/, push: "charComponents" },
    string_delimiter: { match: /\"/, push: "stringComponents" },
    logical_and: "&&",
    decrement: "--",
    increment: "++",
    symbol: /[!$%&\(\)*+,\-.\/:;<=>?\[\\\]^{\|}~]/,
    unexpected_unicode_character: { match: /[\x00-\u{10FFFF}]/, lineBreaks: true }, // ugh linebreaks
    invalid_character: { match: /./, lineBreaks: true }, // ugh linebreaks
    type_identifier: "<placeholder>",
    space: "<placeholder>"
};

export function createLexer(): Lexer {
    return states(
        {
            main: Object.assign(
                {
                    newline: { match: /\r?\n/, lineBreaks: true },
                    whitespace: { match: /[ \t\v\f\r]+/ },
                    comment_start: { match: "/*", push: "multiLineComment" },
                    comment_line_start: { match: "//", push: "lineComment" },
                    pragma: /#.*/
                },
                basicLexing
            ),
            stringComponents: {
                string_delimiter: { match: /"/, pop: 1 },
                characters: { match: /[^\\\n\r"]+/, lineBreaks: false },
                special_character: { match: /\\[^\n\r]/, lineBreaks: false },
                invalid_string_character: { match: /[\x00-xFF]/, lineBreaks: true }
            },
            charComponents: {
                char_delimiter: { match: /'/, pop: 1 },
                special_character: { match: /\\./, lineBreaks: true },
                character: { match: /./, lineBreaks: false },
                invalid_string_character: { match: /[\x00-xFF]/, lineBreaks: true, pop: 1 }
            },
            multiLineComment: {
                comment_start: { match: "/*", push: "multiLineComment" },
                comment_end: { match: "*/", pop: 1 },
                comment: { match: /\*|\/|[^*\/\n]+/, lineBreaks: false },
                newline: { match: /\r?\n/, lineBreaks: true }
            },
            lineComment: {
                comment: { match: /[^\n]/, lineBreaks: false },
                comment_line_end: { match: /\r?\n/, lineBreaks: true, pop: 1 }
            }
        },
        "main"
    );
}

export function createAnnoLexer(): Lexer {
    return states(
        {
            main: Object.assign(
                {
                    newline: { match: /\r?\n/, lineBreaks: true },
                    whitespace: { match: /[ \t\v\f\r]+/ },
                    anno_start: { match: "/*@", next: "multiLineAnno" },
                    comment_start: { match: "/*", push: "multiLineComment" },
                    anno_line_start: { match: "//@", next: "lineAnno" },
                    comment_line_start: { match: "//", push: "lineComment" },
                    pragma: /#.*/
                },
                basicLexing
            ),
            multiLineAnno: Object.assign(
                {
                    newline: { match: /\r?\n/, lineBreaks: true },
                    whitespace: { match: /[ \t\v\f\r]+/ },
                    anno_end: { match: "@*/", next: "main" },
                    comment_start: { match: "/*", push: "multiLineComment" },
                    comment_line_start: { match: "//", push: "lineComment" },
                    annospace: { match: "@" }
                },
                basicLexing
            ),
            lineAnno: Object.assign(
                {
                    anno_end: { match: /\r?\n/, next: "main", lineBreaks: true },
                    whitespace: { match: /[ \t\v\f]+/ },
                    comment_start: { match: "/*", push: "multiLineComment" },
                    comment_line_start: { match: "//", next: "lineComment" },
                    annospace: { match: "@" }
                },
                basicLexing
            ),
            stringComponents: {
                string_delimiter: { match: /"/, pop: 1 },
                characters: { match: /[^\\\n\r"]+/, lineBreaks: false },
                special_character: { match: /\\[^\n\r]/, lineBreaks: false },
                invalid_string_character: { match: /[\x00-xFF]/, lineBreaks: true }
            },
            charComponents: {
                char_delimiter: { match: /'/, pop: 1 },
                special_character: { match: /\\./, lineBreaks: true },
                character: { match: /./, lineBreaks: false },
                invalid_string_character: { match: /[\x00-xFF]/, lineBreaks: true, pop: 1 }
            },
            multiLineComment: {
                comment_start: { match: "/*", push: "multiLineComment" },
                comment_end: { match: "*/", pop: 1 },
                comment: { match: /\*|\/|[^*\/\n]+/, lineBreaks: false },
                newline: { match: /\r?\n/, lineBreaks: true }
            },
            lineComment: {
                comment: { match: /[^\n]/, lineBreaks: false },
                comment_line_end: { match: /\r?\n/, lineBreaks: true, pop: 1 }
            }
        },
        "main"
    );
}

export class TypeLexer {
    private typeIds: Set<string>;
    private coreLexer: Lexer;
    private parsePragma: (pragma: string) => Set<string>;

    public fileName: string;

    constructor(lang: Lang, typeIds: Set<string>, fileName: string = "", parsePragma?: (pragma: string) => Set<string>) {
        this.typeIds = typeIds;
        this.fileName = fileName;

        switch (lang) {
            case "L1":
            case "L2":
            case "L3":
            case "L4": {
                this.coreLexer = createLexer();
                break;
            }
            case "C0":
            case "C1": {
                this.coreLexer = createAnnoLexer();
                break;
            }
            default: {
                this.coreLexer = createAnnoLexer();
                break;
            }
        }
        this.parsePragma = parsePragma || (() => new Set());
    }
    addIdentifier(typeIdentifier: string) {
        this.typeIds = this.typeIds.add(typeIdentifier);
    }
    next(): Token | undefined {
        let tok = this.coreLexer.next();
        if (!tok) {
            return undefined;
        }
        switch (tok["type"]) {
            case "pragma":
                this.parsePragma(tok.text).forEach(this.typeIds.add);
                break;

            case "identifier":
                if (this.typeIds.has(tok.value)) 
                    tok = { ...tok, type: "type_identifier" };
                break;
        }

        tok.fileName = this.fileName;

        return tok;
    }
    save(): LexerState {
        return this.coreLexer.save();
    }
    reset(chunk?: string, state?: LexerState): void {
        this.coreLexer.reset(chunk, state);
    }
    formatError(token: Token, message?: string): string {
        return this.coreLexer.formatError(token, message);
    }
    has(tokenType: string): boolean {
        return this.coreLexer.has(tokenType);
    }
}

export const lexer = new TypeLexer("C1", new Set());
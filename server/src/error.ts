import { SourceLocation } from "./ast";

export class IncompleteParseError extends Error {
    public readonly name: "IncompleteParseError" = "IncompleteParseError";
    constructor(msg: string) {
        super(msg);
    }
}

export class ParsingError extends Error {
    public readonly name: "ParsingError" = "ParsingError";
    loc: null | SourceLocation;
    constructor(syn: SourceLocation | { loc?: SourceLocation }, msg: string) {
        super(msg);
        const loc = "start" in syn ? syn : syn.loc ? syn.loc : null;
        this.loc = loc;
    }
}

export class TypingError extends Error {
    public readonly name: "TypingError";
    loc: null | SourceLocation;
    constructor(syn: { loc?: SourceLocation }, msg: string, ...hints: string[]) {
        const loc = syn.loc ? syn.loc : null;
        const hintstr = hints.length === 0 ? "" : "\n\nHint: " + hints.join("\n      ");
        super(`${msg}${hintstr}`);
        this.name = "TypingError";
        this.loc = loc;
    }
}

export class ImpossibleError extends Error {
    public readonly name: "ImpossibleError" = "ImpossibleError";
    constructor(msg: string) {
        super(`${msg}\nShould be impossible! (Please report.)`);
    }
}

export class NonterminationError extends Error {
    public readonly name: "NonterminationError" = "NonterminationError";
    constructor() {
        super();
    }
}

export class AbortError extends Error {
    public readonly name: "AbortError" = "AbortError";
    constructor(source: null | "assert" | "requires" | "ensures" | "loop_invariant", msg: string) {
        super(msg + (source === null ? "" : ` (@${source})`));
    }
}

export class ArithmeticError extends Error {
    public readonly name: "ArithmeticError" = "ArithmeticError";
    constructor(msg: "division by zero" | "out-of-bounds division" | "shift out of range") {
        super(msg);
    }
}

export class FailureError extends Error {
    public readonly name: "FailureError" = "FailureError";
    constructor(msg: string) {
        super(msg);
    }
}

export class MemoryError extends Error {
    public readonly name: "MemoryError" = "MemoryError";
    constructor(msg: string) {
        super(msg);
    }
}
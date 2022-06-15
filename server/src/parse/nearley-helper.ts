/**
 * This is where the bodies (of ugly non-type-safe code) are buried.
 *
 * Consumes (and sort-of documents) the messy output produced by the parser, and turns it into parsedsyntax.ts
 * types. This file will produce garbage output if there's a mismatch between the documented types and the
 * types that the parser produces, since Typescript refuses to document that.
 *
 * Convention: as much as possible, this file should ***only throw errors to document invariants of the parser***
 * Non-implementation (user-facing) errors should be thrown in restrictsyntax.ts.
 *
 * The structure of this file should match ast.ts as much as practical.
 */

import { Token } from "moo";
import * as syn from "./parsedsyntax";
import { Position, SourceLocation } from "../ast";
import { ImpossibleError, ParsingError } from "../error";

// This is incorrect, but Typescript doesn't check anyway
// If whitespace gets captured or analyzed in the future this needs revisiting
export type WS = { contents: (Token | WS)[] };

function tokloc(tok: Token): SourceLocation {
    return {
        start: { line: tok.line, column: tok.col },
        end: tok.lineBreaks
            ? { line: tok.line + 1, column: 1 }
            : { line: tok.line, column: tok.col + tok.text.length }
    };
}

export function Identifier([tok]: [Token]): syn.Identifier {
    return {
        tag: "Identifier",
        name: tok.text,
        loc: tokloc(tok)
    };
}

export function IntType([tok]: [Token]): syn.IntType {
    return {
        tag: "IntType",
        loc: tokloc(tok)
    };
}

export function BoolType([tok]: [Token]): syn.BoolType {
    return {
        tag: "BoolType",
        loc: tokloc(tok)
    };
}

export function StringType([tok]: [Token]): syn.StringType {
    return {
        tag: "StringType",
        loc: tokloc(tok)
    };
}

export function CharType([tok]: [Token]): syn.CharType {
    return {
        tag: "CharType",
        loc: tokloc(tok)
    };
}

export function VoidType([tok]: [Token]): syn.VoidType {
    return {
        tag: "VoidType",
        loc: tokloc(tok)
    };
}

export function PointerType([tp, s, tok]: [syn.Type, WS, Token]): syn.PointerType {
    return {
        tag: "PointerType",
        argument: tp,
        loc: { start: tp.loc.start, end: tokloc(tok).end }
    };
}

export function ArrayType([tp, s1, l, s2, r]: [syn.Type, WS, Token, WS, Token]): syn.ArrayType {
    return {
        tag: "ArrayType",
        argument: tp,
        loc: { start: tp.loc.start, end: tokloc(r).end }
    };
}

export function StructType([str, s, id]: [Token, WS, syn.Identifier]): syn.StructType {
    return {
        tag: "StructType",
        id: id,
        loc: { start: tokloc(str).start, end: id.loc.end }
    };
}

export function IntLiteral([tok]: Token[]): syn.IntLiteral {
    return {
        tag: "IntLiteral",
        raw: tok.text,
        loc: tokloc(tok)
    };
}

export function StringLiteral([literals]: [Array<[[Token, [Token][], Token]]>]): syn.StringLiteral {
    console.assert(literals.length > 0);

    // First opening quote position
    const [start,,] = literals[0][0];
    // Last closing quote position
    const [,, end] = literals[literals.length - 1][0];

    // Concatenate all the tokens into a single string
    const toks = literals.map(([[, toks, _]]) => toks).flat();

    return {
        tag: "StringLiteral",
        raw: toks.map(x => x[0].value),
        loc: { start: tokloc(start).start, end: tokloc(end).end }
    };
}

export function CharLiteral([[start, [tok], end]]: [[Token, [Token], Token]]): syn.CharLiteral {
    return {
        tag: "CharLiteral",
        raw: tok.value,
        loc: { start: tokloc(start).start, end: tokloc(end).end }
    };
}

export function BoolLiteral([tok]: [Token]): syn.BoolLiteral {
    return {
        tag: "BoolLiteral",
        value: tok.value === "true",
        loc: tokloc(tok)
    };
}

export function NullLiteral([tok]: [Token]): syn.NullLiteral {
    return {
        tag: "NullLiteral",
        loc: tokloc(tok)
    };
}

export function ArrayMemberExpression([object, s1, l, s2, index, s3, r]: [
    syn.Expression,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token
]): syn.ArrayMemberExpression {
    return {
        tag: "ArrayMemberExpression",
        object: object,
        index: index,
        loc: { start: object.loc.start, end: tokloc(r).end }
    };
}

export function StructMemberExpression([object, s1, deref, s2, field]: [
    syn.Expression,
    WS,
    [Token, Token] | Token,
    WS,
    syn.Identifier
]): syn.StructMemberExpression {
    return {
        tag: "StructMemberExpression",
        deref: deref instanceof Array, // ["-", ">"] vs. "."
        object: object,
        field: field,
        loc: { start: object.loc.start, end: field.loc.end }
    };
}

/**
 * Helper type and helper function for function arguments
 */
export type Arguments = [WS, null | [syn.Expression, [WS, Token, WS, syn.Expression][], WS]];

export function Arguments([s1, args]: Arguments): syn.Expression[] {
    if (args === null) return [];
    return [args[0]].concat(args[1].map(x => x[3]));
}

export function CallExpression([f, ws, l, args, r]: [
    syn.Identifier,
    WS,
    Token,
    Arguments,
    Token
]): syn.CallExpression {
    return {
        tag: "CallExpression",
        callee: f,
        arguments: Arguments(args),
        loc: { start: f.loc.start, end: tokloc(r).end }
    };
}

export function IndirectCallExpression([l1, s1, s, s2, f, s3, r1, s4, l2, args, r2]: [
    Token,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token,
    WS,
    Token,
    Arguments,
    Token
]): syn.IndirectCallExpression {
    return {
        tag: "IndirectCallExpression",
        callee: f,
        arguments: Arguments(args),
        loc: { start: tokloc(l1).start, end: tokloc(r2).end }
    };
}

export function UnaryExpression([operator, s, argument]: [
    [Token] | [Token, WS, syn.Type, WS, Token],
    Token,
    syn.Expression
]): syn.UnaryExpression | syn.CastExpression {
    if (operator.length === 1) {
        const oper = operator[0];
        switch (oper.value) {
            case "&":
            case "!":
            case "~":
            case "-":
            case "*":
                return {
                    tag: "UnaryExpression",
                    operator: oper.value,
                    argument: argument,
                    loc: { start: tokloc(oper).start, end: argument.loc.end }
                };

            default:
                throw new ImpossibleError(`Unknown unary expression ${oper.value}`);
        }
    } else {
        return {
            tag: "CastExpression",
            kind: operator[2],
            argument: argument,
            loc: { start: tokloc(operator[0]).start, end: argument.loc.end }
        };
    }
}

export function BinaryExpression([left, s1, opertoks, s2, right]: [
    syn.Expression,
    WS,
    Token[],
    WS,
    syn.Expression
]): syn.BinaryExpression | syn.LogicalExpression | syn.AssignmentExpression {
    const operator = opertoks.map((tok: Token) => tok.text).join("");
    switch (operator) {
        case "*":
        case "/":
        case "%":
        case "+":
        case "-":
        case "<<":
        case ">>":
        case "<":
        case "<=":
        case ">=":
        case ">":
        case "==":
        case "!=":
        case "&":
        case "^":
        case "|":
            return {
                tag: "BinaryExpression",
                operator: operator,
                left: left,
                right: right,
                loc: { start: left.loc.start, end: right.loc.end }
            };
        case "&&":
        case "||":
            return {
                tag: "LogicalExpression",
                operator: operator,
                left: left,
                right: right,
                loc: { start: left.loc.start, end: right.loc.end }
            };
        case "=":
        case "+=":
        case "-=":
        case "*=":
        case "/=":
        case "%=":
        case "&=":
        case "^=":
        case "|=":
        case "<<=":
        case ">>=":
            return {
                tag: "AssignmentExpression",
                operator: operator,
                left: left,
                right: right,
                loc: { start: left.loc.start, end: right.loc.end }
            };

        default:
            throw new ImpossibleError(`Unknown assignment expression ${operator}`);
    }
}

export function ConditionalExpression([test, s1, op1, s2, consequent, s3, op2, s4, alternate]: [
    syn.Expression,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token,
    WS,
    syn.Expression
]): syn.ConditionalExpression {
    return {
        tag: "ConditionalExpression",
        test: test,
        consequent: consequent,
        alternate: alternate,
        loc: { start: test.loc.start, end: alternate.loc.end }
    };
}

export function AllocExpression([alloc, s1, l, s2, typ, s3, r]: [
    Token,
    WS,
    Token,
    WS,
    syn.Type,
    WS,
    Token
]): syn.AllocExpression {
    return {
        tag: "AllocExpression",
        kind: typ,
        loc: { start: tokloc(alloc).start, end: tokloc(r).end }
    };
}

export function AllocArrayExpression([alloc, s1, l, s2, typ, s3, c, s4, size, sp, r]: [
    Token,
    WS,
    Token,
    WS,
    syn.Type,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token
]): syn.AllocArrayExpression {
    return {
        tag: "AllocArrayExpression",
        kind: typ,
        size: size,
        loc: { start: tokloc(alloc).start, end: tokloc(r).end }
    };
}

export function ResultExpression([b, res]: [Token, Token]): syn.ResultExpression {
    return {
        tag: "ResultExpression",
        loc: { start: tokloc(b).start, end: tokloc(res).end }
    };
}

export function LengthExpression([b, length, s1, l, s2, argument, s3, r]: [
    Token,
    Token,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token
]): syn.LengthExpression {
    return {
        tag: "LengthExpression",
        argument: argument,
        loc: { start: tokloc(b).start, end: tokloc(r).end }
    };
}

export function HasTagExpression([b, hastag, s1, l, s2, typ, s3, c, s4, argument, s5, r]: [
    Token,
    Token,
    WS,
    Token,
    WS,
    syn.Type,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token
]): syn.HasTagExpression {
    return {
        tag: "HasTagExpression",
        kind: typ,
        argument: argument,
        loc: { start: tokloc(b).start, end: tokloc(r).end }
    };
}

/**
 * The next section are all the C0 statements that get initally parsed as expressions
 */

export function UpdateExpression([argument, s1, op]: [syn.Expression, WS, [Token]]): syn.UpdateExpression {
    return {
        tag: "UpdateExpression",
        argument: argument,
        operator: op[0].value === "++" ? "++" : "--",
        loc: { start: argument.loc.start, end: tokloc(op[0]).end }
    };
}

export function AssertExpression([assert, s1, l, s2, test, s3, r]: [
    Token,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token
]): syn.AssertExpression {
    return {
        tag: "AssertExpression",
        test: test,
        loc: { start: tokloc(assert).start, end: tokloc(r).end }
    };
}

export function ErrorExpression([error, s1, l, s2, argument, s3, r]: [
    Token,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token
]): syn.ErrorExpression {
    return {
        tag: "ErrorExpression",
        argument: argument,
        loc: { start: tokloc(error).start, end: tokloc(r).end }
    };
}

export type SimpleParsed =
    | syn.Expression
    | [syn.Type, WS, syn.Identifier, null | [WS, Token, WS, syn.Expression]];
export function SimpleStatement([stm, s, semi]: [SimpleParsed, WS, Token]):
    | syn.VariableDeclaration
    | syn.ExpressionStatement {
    if (stm instanceof Array) {
        const init = stm[3];
        return {
            tag: "VariableDeclaration",
            kind: stm[0],
            id: stm[2],
            init: init === null ? null : init[3],
            loc: { start: stm[0].loc.start, end: tokloc(semi).end }
        };
    } else {
        return {
            tag: "ExpressionStatement",
            expression: stm,
            loc: { start: stm.loc.start, end: tokloc(semi).end }
        };
    }
}

// Helper types for dangling-if-handling
export type AnnosAndStm = [syn.AnnoStatement[], syn.Statement];
export type Wrapper =
    | { tag: "while"; start: Position; test: syn.Expression }
    | {
          tag: "for";
          start: Position;
          init: null | syn.ExpressionStatement | syn.VariableDeclaration;
          test: syn.Expression;
          update: null | syn.Expression;
      }
    | { tag: "ifelse"; start: Position; test: syn.Expression; consequent: AnnosAndStm };

export function IfElse([tIF, s1, l, s2, test, s3, r, s4, stm, s5, tELSE, s6]: [
    Token,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token,
    WS,
    AnnosAndStm,
    WS,
    Token,
    WS
]): Wrapper {
    return {
        tag: "ifelse",
        test: test,
        consequent: stm,
        start: tokloc(tIF).start
    };
}

export function For([tFOR, s1, l, init, s2, semi1, s3, test, s4, semi2, update, s5, r, s6]: [
    Token,
    WS,
    Token,
    null | [WS, SimpleParsed],
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token,
    null | [WS, syn.Expression],
    WS,
    Token,
    WS
]): Wrapper {
    return {
        tag: "for",
        init: init === null ? null : SimpleStatement([init[1], s2, semi1]),
        test: test,
        update: update === null ? null : update[1],
        start: tokloc(tFOR).start
    };
}

export function While([tWHILE, s1, l, s2, test, s3, r, s4]: [
    Token,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token,
    WS
]): Wrapper {
    return { tag: "while", test: test, start: tokloc(tWHILE).start };
}

export function TopSimple([stms, annos, s1, stm, s2]: [
    [WS, AnnosAndStm][],
    syn.AnnoStatement[],
    WS,
    SimpleParsed,
    WS
]): syn.Statement[] {
    const stmsyn = stms
        .map(x => x[1][0].map<syn.Statement>(x => x).concat([x[1][1]]))
        .concat([annos])
        .reduce((collect, stms) => collect.concat(stms), []);

    if (stm instanceof Array) {
        const init = stm[3];
        return stmsyn.concat([
            {
                tag: "VariableDeclaration",
                kind: stm[0],
                id: stm[2],
                init: init === null ? null : init[3],
                loc: { start: stm[0].loc.start, end: stm[2].loc.end }
            }
        ]);
    } else {
        return stmsyn.concat({ tag: "ExpressionStatement", expression: stm, loc: stm.loc });
    }
}

export function TopStatement([stms, annos, s2]: [
    [WS, AnnosAndStm][],
    syn.AnnoStatement[],
    WS
]): syn.Statement[] {
    return stms
        .map(x => x[1][0].map<syn.Statement>(x => x).concat([x[1][1]]))
        .concat([annos])
        .reduce((collect, stms) => collect.concat(stms), []);
}

export function Statement([wrappers, annos, stm]: [
    [syn.AnnoStatement[], Wrapper][],
    syn.AnnoStatement[],
    [syn.Statement]
]): AnnosAndStm {
    return wrappers.reduceRight<AnnosAndStm>(
        (stm, [newannos, wrap]) => {
            switch (wrap.tag) {
                case "ifelse":
                    return [
                        newannos,
                        {
                            tag: "IfStatement",
                            test: wrap.test,
                            consequent: wrap.consequent,
                            alternate: stm,
                            loc: { start: wrap.start, end: stm[1].loc.end }
                        }
                    ];
                case "while":
                    return [
                        newannos,
                        {
                            tag: "WhileStatement",
                            test: wrap.test,
                            body: stm,
                            loc: { start: wrap.start, end: stm[1].loc.end }
                        }
                    ];
                case "for":
                    return [
                        newannos,
                        {
                            tag: "ForStatement",
                            init: wrap.init,
                            test: wrap.test,
                            update: wrap.update,
                            body: stm,
                            loc: { start: wrap.start, end: stm[1].loc.end }
                        }
                    ];
                default:
                    throw new ImpossibleError("Invalid tag ${wrap.tag}");
            }
        },
        [annos, stm[0]]
    );
}

export function IfStatement([tIF, s1, l, s2, test, s3, r, s4, consequent]: [
    Token,
    WS,
    Token,
    WS,
    syn.Expression,
    WS,
    Token,
    WS,
    AnnosAndStm
]): syn.IfStatement {
    return {
        tag: "IfStatement",
        test: test,
        consequent: consequent,
        loc: { start: tokloc(tIF).start, end: consequent[1].loc.end }
    };
}

export function ReturnStatement([r, argument, s1, semi]: [
    Token,
    null | [WS, syn.Expression],
    WS,
    Token
]): syn.ReturnStatement {
    return {
        tag: "ReturnStatement",
        argument: argument === null ? null : argument[1],
        loc: { start: tokloc(r).start, end: tokloc(semi).end }
    };
}

export function BlockStatement([l, stms, annos, s, r]: [
    Token,
    [WS, [syn.AnnoStatement[], syn.Statement]][],
    syn.AnnoStatement[],
    WS,
    Token
]): syn.BlockStatement {
    const stms1: syn.Statement[][] = stms.map(x => x[1][0].map<syn.Statement>(x => x).concat([x[1][1]]));
    const stmsAll: syn.Statement[] = stms1
        .concat([annos])
        .reduce((collect, stms) => collect.concat(stms), []);

    return {
        tag: "BlockStatement",
        body: stmsAll,
        loc: { start: tokloc(l).start, end: tokloc(r).end }
    };
}

export function BreakStatement([stm, s1, semi]: [Token, WS, Token]): syn.BreakStatement {
    return {
        tag: "BreakStatement",
        loc: { start: tokloc(stm).start, end: tokloc(semi).end }
    };
}

export function ContinueStatement([stm, s1, semi]: [Token, WS, Token]): syn.ContinueStatement {
    return { tag: "ContinueStatement", loc: { start: tokloc(stm).start, end: tokloc(semi).end } };
}

export function Anno([anno, s1, test, s2, semi, s3]: [
    [Token],
    WS,
    syn.Expression,
    WS,
    Token,
    WS
]): syn.AnnoStatement {
    const annotxt = anno[0].text;
    switch (annotxt) {
        case "assert":
        case "loop_invariant":
        case "requires":
        case "ensures":
            return {
                tag: "AnnoStatement",
                anno: annotxt,
                test: test,
                loc: { start: tokloc(anno[0]).start, end: tokloc(semi).end }
            };
        default:
            throw new ImpossibleError(`Unknown annotation @${annotxt}`);
    }
}

export function AnnoSet(
    annos:
        | [Token, WS, syn.AnnoStatement[], Token, undefined, undefined]
        | [Token, WS, syn.AnnoStatement[], Token, any, Token]
): syn.AnnoStatement[] {
    const start: Token = annos[0];
    const absend = annos[5];
    const end: Token = absend ? absend : annos[3];

    if (start.type === "anno_line_start") {
        // Line annotations may have multiple contracts.
        // e.g. //@requires x > 0; ensures \result >= 0; 
        // We need to make sure that the last contract ends on the same line.
        // We can't just use "end" here because that could be whitespace or a comment,
        // so instead we grab the location of the last contract, which should properly ignore comments
        const contracts = annos[2];
        const lastContract = contracts[contracts.length - 1];
        const lastContractEnd = lastContract.loc.end;
        
        if (start.line !== lastContractEnd.line) {
            throw new ParsingError(
                { start: tokloc(start).start, end: tokloc(end).start },
                "Single-line annotations cannot be extended to multiple lines with /* multiline comments */ like this"
            );
        }
    }
    return annos[2];
}

export function FunctionDeclarationArgs([s1, params]: [
    WS,
    null | [syn.Type, WS, syn.Identifier, WS, [Token, WS, syn.Type, WS, syn.Identifier, WS][]]
]): syn.VariableDeclarationOnly[] {
    if (params === null) return [];
    const first: syn.VariableDeclarationOnly = {
        tag: "VariableDeclaration",
        kind: params[0],
        id: params[2],
        loc: { start: params[0].loc.start, end: params[2].loc.end }
    };
    return [first].concat(
        params[4].map(
            (x): syn.VariableDeclarationOnly => ({
                tag: "VariableDeclaration",
                kind: x[2],
                id: x[4],
                loc: { start: x[2].loc.start, end: x[4].loc.end }
            })
        )
    );
}

export function StructDeclaration([struct, s1, s, s2, semi]: [
    Token,
    WS,
    syn.Identifier,
    WS,
    Token
]): syn.StructDeclaration {
    return {
        tag: "StructDeclaration",
        id: s,
        definitions: null,
        loc: { start: tokloc(struct).start, end: tokloc(semi).end }
    };
}

export function StructDefinition([struct, s1, s, s2, l, s3, defs, r, s5, semi]: [
    Token,
    WS,
    syn.Identifier,
    WS,
    Token,
    WS,
    [syn.Type, WS, syn.Identifier, WS, Token, WS][],
    Token,
    WS,
    Token
]): syn.StructDeclaration {
    return {
        tag: "StructDeclaration",
        id: s,
        definitions: defs.map(
            (value): syn.VariableDeclarationOnly => ({
                tag: "VariableDeclaration",
                id: value[2],
                kind: value[0],
                loc: { start: value[0].loc.start, end: value[2].loc.end }
            })
        ),
        loc: { start: tokloc(struct).start, end: tokloc(semi).end }
    };
}

export function TypeDefinition([typedef, s1, tp, s2, id]: [
    Token,
    WS,
    syn.Type,
    WS,
    syn.Identifier
]): syn.TypeDefinition {
    return {
        tag: "TypeDefinition",
        definition: {
            tag: "VariableDeclaration",
            id: id,
            kind: tp,
            loc: { start: tp.loc.start, end: id.loc.end }
        },
        loc: { start: tokloc(typedef).start, end: id.loc.end }
    };
}

export function FunctionTypeDefinition([typedef, s1, ty, s2, f, s3, l, args, r, annos]: [
    Token,
    WS,
    syn.Type,
    WS,
    syn.Identifier,
    WS,
    Token,
    syn.VariableDeclarationOnly[],
    Token,
    syn.AnnoStatement[]
]): syn.FunctionTypeDefinition {
    const end = annos.length === 0 ? tokloc(r).end : annos[annos.length - 1].loc.end;
    return {
        tag: "FunctionTypeDefinition",
        definition: {
            tag: "FunctionDeclaration",
            returns: ty,
            id: f,
            params: args,
            annos: annos,
            body: null,
            loc: { start: ty.loc.start, end: end }
        },
        loc: { start: tokloc(typedef).start, end: end }
    };
}

export function FunctionDeclaration([ty, s1, f, s2, l, args, r, annos, s3, def]: [
    syn.Type,
    WS,
    syn.Identifier,
    WS,
    Token,
    syn.VariableDeclarationOnly[],
    Token,
    syn.AnnoStatement[],
    WS,
    null | syn.BlockStatement
]): syn.FunctionDeclaration {
    const end =
        def !== null ? def.loc.end : annos.length === 0 ? tokloc(r).end : annos[annos.length - 1].loc.end;
    return {
        tag: "FunctionDeclaration",
        returns: ty,
        id: f,
        params: args,
        annos: annos,
        body: def,
        loc: { start: ty.loc.start, end: end }
    };
}

export function PragmaDeclaration([pragmaTok]: [Token]): syn.Declaration {
    // I'm not brave enough to directly modify the parsing code for pragmas
    // or the associated lexer 
    // so we shall instead resort to old-fashioned regex

    // Technically we should look at the spec
    // to make sure no invalid characters appear
    // between < > or " " but for now we just munch
    // all chars until the closing > or "
    const matchLib =  /#use\s+<(\w+)>\s*$/;
    const matchFile = /#use\s+"([^"]+)"\s*$/;

    const text = pragmaTok.value;

    let match = text.match(matchLib);

    if (match !== null) {
        // #use <libfoo>

        // Here we need to solve the problem of 

        return {
            tag: "PragmaUseLib",
            name: match[1], // Could give a location for this too 
            loc: tokloc(pragmaTok) 
        };
    }

    match = text.match(matchFile);

    if (match !== null) {
        // #use "foo.c0"
        return {
            tag: "PragmaUseFile",
            path: match[1],
            loc: tokloc(pragmaTok)
        };
    }

    // Some other pragma 
    return {
        tag: "PragmaUnknown",
        text: text,
        loc: tokloc(pragmaTok)
    };
}

export function LineComment([start, text, end]: [Token, Token[], Token]) {
    return {
        tag: "CapturedComment",
        loc: {
            start: tokloc(start).start,
            end: tokloc(end).end
        },
        type: syn.CommentType.Line,
        text: text.map(x => x.value).join("")
    }
}

export function MultiComment([start, text, end]: [Token, Token[][], Token]): syn.CapturedComment {
    return {
        tag: "CapturedComment",
        loc: {
            start: tokloc(start).start,
            end: tokloc(end).end
        },
        type: syn.CommentType.Block,
        text: text.map(x => x[0].value).join("")
    }
}
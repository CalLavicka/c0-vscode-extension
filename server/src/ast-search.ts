/** 
 * Contains methods which search for an AST
 * node given a position, and returns
 * information about that position
 */
import {
    AnyType,
    Expression,
    Position,
    SourceLocation,
    Statement,
    Type,
    Declaration
} from "./ast";
import { GlobalEnv, getFunctionDeclaration, getStructDefinition } from "./typecheck/globalenv";
import { expressionToString } from "./print";
import { Env } from "./typecheck/types";
import { ImpossibleError } from "./error";

export enum Ordering {
    Less = -1,
    Equal = 0,
    Greater = 1
}

export function comparePositions(a: Position, b: Position): Ordering {
    if (a.line < b.line) return Ordering.Less;
    if (a.line > b.line) return Ordering.Greater;

    if (a.column < b.column) return Ordering.Less;
    if (a.column > b.column) return Ordering.Greater;

    return Ordering.Equal;
}

export function isInside(a: Position, b?: SourceLocation): boolean {
    if (b === null || b === undefined) return false;
    const start = comparePositions(a, b.start);
    const end = comparePositions(a, b.end);

    return start >= Ordering.Equal && end <= Ordering.Equal;
}

export type SearchInfo = {
    pos: Position,
    genv: GlobalEnv
};

export interface AstSearchResult {
    environment: Env | null;
    data: FoundIdent | FoundType | null;
}

export interface FoundIdent {
    tag: "FoundIdent";
    name: string;
    type: AnyType;
}

export interface FoundType {
    tag: "FoundType";
    type: Type;
}

function findType(e: Type, currentEnv: Env | null, info: SearchInfo): AstSearchResult {
    const { pos } = info;
 
    switch (e.tag) {
        case "ArrayType":
        case "PointerType":
            if (isInside(pos, e.argument.loc)) return findType(e.argument, currentEnv, info);
            break;

        case "Identifier":
            return {
                environment: currentEnv,
                data: {
                    tag: "FoundType",
                    type: e
                }
            };
    }

    return {
        environment: currentEnv,
        data: null
    };
}

function findExpression(e: Expression, currentEnv: Env | null, info: SearchInfo): AstSearchResult {
    const { pos } = info;

    switch (e.tag) {
        case "CallExpression":
            if (isInside(pos, e.callee.loc)) {
                const functionInfo = getFunctionDeclaration(info.genv, e.callee.name);
                if (functionInfo === null) break;
                const type: AnyType = { tag: "FunctionType", definition: functionInfo };

                return {
                    environment: currentEnv,
                    data: {
                        tag: "FoundIdent",
                        name: e.callee.name,
                        type
                    }
                };
            }

            for (const arg of e.arguments) {
                if (isInside(pos, arg.loc)) return findExpression(arg, currentEnv, info);
            }
            break;

        case "Identifier": {
            if (currentEnv === null) break;

            const type = currentEnv.get(e.name);
            if (type === undefined) break; // Impossible

            return {
                environment: currentEnv,
                data: {
                    tag: "FoundIdent",
                    name: e.name,
                    type
                }
            };
        }
        case "StructMemberExpression":
            // Here we would like hovering over "foo" in "foo->bar" 
            // to return the type of foo,
            // and hovering over "bar" to report "foo->bar: int" or whatever
            if (isInside(pos, e.object.loc)) return findExpression(e.object, currentEnv, info);
            else {
                if (e.struct === undefined) break;
                const struct = getStructDefinition(info.genv, e.struct);

                if (struct === null || struct.definitions === null) break;

                const field = struct.definitions.find(def => def.id.name === e.field.name);
                // Should be impossible - field should always be found unless there
                // is a bug in the typechecker 
                if (field === undefined) throw new ImpossibleError("Field not found (typechecker bug, please report!)");
                return {
                    environment: currentEnv,
                    data: {
                        tag: "FoundIdent",
                        name: expressionToString(e),
                        type: field.kind
                    }
                };
            }

        case "UnaryExpression":
            if (isInside(pos, e.argument.loc)) return findExpression(e.argument, currentEnv, info);
            break;

        case "LogicalExpression":
        case "BinaryExpression":
            if (isInside(pos, e.left.loc)) return findExpression(e.left, currentEnv, info);
            if (isInside(pos, e.right.loc)) return findExpression(e.right, currentEnv, info);
            break;

        case "ArrayMemberExpression":
            if (isInside(pos, e.object.loc)) return findExpression(e.object, currentEnv, info);
            if (isInside(pos, e.index.loc)) return findExpression(e.index, currentEnv, info);
            break;

        case "AllocArrayExpression":
            if (isInside(pos, e.argument.loc)) return findExpression(e.argument, currentEnv, info);

        // tslint:disable-next-line: no-switch-case-fall-through
        case "AllocExpression":
            // FIXME: more precise type location
            // For example, alloc(typedefName*) will always
            // just return the pointer type, and not go straight 
            // to the identifier as desired
            return findType(e.kind, currentEnv, info);

        // We could also provide the type of a literal on hover
        // ...although that doesnt seem super useful
        case "IntLiteral":
        case "BoolLiteral":
        case "StringLiteral":
        case "CharLiteral":
        case "NullLiteral":
            break;

        // TODO: write the other cases
    }

    // If control reaches here it means the position was 
    // over a whitespace character or something
    return { environment: currentEnv, data: null };
}

export function findStatement(s: Statement, currentEnv: Env | null, info: SearchInfo): AstSearchResult {
    const { pos } = info;

    console.assert(isInside(pos, s.loc));

    switch (s.tag) {
        case "BlockStatement":
            currentEnv = s.environment || currentEnv;
            for (const child of s.body)
                if (isInside(pos, child.loc))
                    return findStatement(child, currentEnv, info);

            break;

        case "IfStatement":
            if (isInside(pos, s.test.loc))
                return findExpression(s.test, currentEnv, info);
            if (isInside(pos, s.consequent.loc))
                return findStatement(s.consequent, currentEnv, info);
            if (s.alternate && isInside(pos, s.alternate.loc))
                return findStatement(s.alternate, currentEnv, info);

            break;

        case "ReturnStatement":
            if (s.argument && isInside(pos, s.argument.loc))
                return findExpression(s.argument, currentEnv, info);
            break;

        case "ExpressionStatement":
            return findExpression(s.expression, currentEnv, info);

        case "VariableDeclaration":
            if (isInside(pos, s.kind.loc)) return findType(s.kind, currentEnv, info);

            if (s.init && isInside(pos, s.init.loc))
                return findExpression(s.init, currentEnv, info);
            break;

        case "AssignmentStatement":
            if (isInside(pos, s.left.loc)) return findExpression(s.left, currentEnv, info);
            if (isInside(pos, s.right.loc)) return findExpression(s.right, currentEnv, info);
            break;

        case "ForStatement":
            // Technically if we are in the update or guard portion
            // we should add i to environment and look there, but 
            // that also sounds like a later problem 
            if (s.init && isInside(pos, s.init.loc)) return findStatement(s.init, currentEnv, info);
            if (s.update && isInside(pos, s.update.loc)) return findStatement(s.update, currentEnv, info);

        // Fall through for common loop cases 
        // tslint:disable-next-line: no-switch-case-fall-through
        case "WhileStatement":
            if (isInside(pos, s.test.loc)) return findExpression(s.test, currentEnv, info);
            if (isInside(pos, s.body.loc)) return findStatement(s.body, currentEnv, info);
            for (const loopInvariant of s.invariants) 
                if (isInside(pos, loopInvariant.loc)) 
                    return findExpression(loopInvariant, currentEnv, info);
            break;

        case "UpdateStatement":
        case "ErrorStatement":
            if (isInside(pos, s.argument.loc)) return findExpression(s.argument, currentEnv, info);
            break;

        case "AssertStatement":
            if (isInside(pos, s.test.loc)) return findExpression(s.test, currentEnv, info);
            break;

        case "BreakStatement":
        case "ContinueStatement":
            break;
    }

    // Not found 
    return { environment: currentEnv, data: null };
}

function findDecl(decl: Declaration, info: SearchInfo) {
    const { pos } = info;
    switch (decl.tag) {
        case "FunctionDeclaration":
            if (isInside(pos, decl.returns.loc)) return findType(decl.returns, null, info);
            // Check args 
            for (const arg of decl.params) {
                if (isInside(pos, arg.kind.loc)) return findType(arg.kind, null, info);
            }
            for (const contract of [...decl.preconditions, ...decl.postconditions]) {
                // TODO: Create an environment from function arguments 
                // as they are valid inside function contracts
                if (isInside(pos, contract.loc)) return findExpression(contract, null, info);
            }

            if (decl.body && isInside(pos, decl.body.loc)) return findStatement(decl.body, null, info);
            break;

        case "TypeDefinition":
            if (isInside(pos, decl.definition.kind.loc)) return findType(decl.definition.kind, null, info);
            break;

        case "StructDeclaration":
            if (decl.definitions === null) break;
            for (const field of decl.definitions) {
                if (isInside(pos, field.kind.loc)) return findType(field.kind, null, info);
            }
            break;
    }

    return { environment: null, data: null };
}

export function findGenv(info: SearchInfo, uri: string): AstSearchResult {
    const { pos, genv } = info;

    for (const decl of genv.decls) {
        if (decl.loc?.source !== uri) continue;
        if (isInside(pos, decl.loc)) return findDecl(decl, info);
    }

    return { environment: null, data: null };
}

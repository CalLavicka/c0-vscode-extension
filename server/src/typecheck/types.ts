import { ActualType, actualType, GlobalEnv } from "./globalenv";
import * as ast from "../ast";
import { ImpossibleError, TypingError } from "../error";

export type Env = Map<string, ast.Type>;

/**
 * Valid types for synthesis
 */
export type Synthed =
    | ast.Type
    | { tag: "AmbiguousNullPointer" }
    | { tag: "NamedFunctionType"; definition: ast.FunctionDeclaration }
    | { tag: "AnonymousFunctionTypePointer"; definition: ast.FunctionDeclaration };

/**
 * Valid non-Identifier types for synthesis.
 */
export type ActualSynthed =
    | ActualType
    | ast.VoidType
    | { tag: "AmbiguousNullPointer" }
    | { tag: "NamedFunctionType"; definition: ast.FunctionDeclaration }
    | { tag: "AnonymousFunctionTypePointer"; definition: ast.FunctionDeclaration };

/**
 * Resove Identifiers in a synthesized type.
 */
export function actualSynthed(genv: GlobalEnv, t1: Synthed): ActualSynthed {
    switch (t1.tag) {
        case "AmbiguousNullPointer":
        case "NamedFunctionType":
        case "AnonymousFunctionTypePointer":
            return t1;
        default:
            return actualType(genv, t1);
    }
}

/**
 * Check whether two types are equal.
 */
export function equalTypes(genv: GlobalEnv, t1: ast.Type, t2: ast.Type): boolean {
    const actual1 = actualType(genv, t1);
    const actual2 = actualType(genv, t2);
    switch (actual1.tag) {
        case "IntType":
        case "BoolType":
        case "StringType":
        case "CharType":
        case "VoidType":
            return actual1.tag === actual2.tag;
        case "ArrayType":
        case "PointerType":
            return actual1.tag === actual2.tag && equalTypes(genv, actual1.argument, actual2.argument);
        case "StructType":
            return actual1.tag === actual2.tag && actual1.id.name === actual2.id.name;
        case "NamedFunctionType":
            return actual1.tag === actual2.tag && actual1.definition.id.name === actual2.definition.id.name;
        default:
            throw new ImpossibleError("Impossible");
    }
}

export function equalFunctionTypes(
    genv: GlobalEnv,
    decl1: ast.FunctionDeclaration,
    decl2: ast.FunctionDeclaration
): boolean {
    if (!equalTypes(genv, decl1.returns, decl2.returns)) { return false; }
    if (decl1.params.length !== decl2.params.length) { return false; }
    for (let i = 0; i < decl1.params.length; i++) {
        if (!equalTypes(genv, decl1.params[i].kind, decl2.params[i].kind)) { return false; }
    }
    return true;
}

/**
 * Least upper bound is used by e ? e1 : e2, to determine the type of e1 and e2 from the type of e.
 * While it's somewhat overpowered, this can be reused, because e1 == e2 is only a valid
 */
function leastUpperBoundType(genv: GlobalEnv, t1: ast.Type, t2: ast.Type): ast.Type | null {
    const actual1 = actualType(genv, t1);
    const actual2 = actualType(genv, t2);
    switch (actual1.tag) {
        case "IntType":
        case "BoolType":
        case "StringType":
        case "CharType":
        case "VoidType":
            return actual1.tag === actual2.tag ? t1 : null;
        case "ArrayType":
        case "PointerType": {
            if (actual1.tag !== actual2.tag) { return null; }
            const sublub = leastUpperBoundType(genv, actual1.argument, actual2.argument);
            if (sublub === null) { return null; }
            return actual1.tag === "ArrayType"
                ? { tag: actual1.tag, argument: sublub }
                : { tag: actual1.tag, argument: sublub };
        }
        case "StructType":
            return actual1.tag === actual2.tag && actual1.id.name === actual2.id.name ? t1 : null;
        case "NamedFunctionType":
            return actual1.tag === actual2.tag && actual1.definition.id.name === actual2.definition.id.name
                ? t1
                : null;
        default:
            throw new ImpossibleError("Impossible");
    }
}

/**
 * Almost entirely here to deal with the mess that is functions, and only (seemingly) because of conditionals.
 * (Perhaps this function can be reused for equality comparisions?)
 */
export function leastUpperBoundSynthedType(genv: GlobalEnv, t1: Synthed, t2: Synthed): Synthed | null {
    if (t1.tag === "AmbiguousNullPointer" || t2.tag === "AmbiguousNullPointer") {
        if (t1.tag === t2.tag) { return t1; }
        if (t1.tag === "AnonymousFunctionTypePointer") { return t1; }
        if (t2.tag === "AnonymousFunctionTypePointer") { return t2; }
        if (t1.tag === "NamedFunctionType") { return null; }
        if (t2.tag === "NamedFunctionType") { return null; }
        if (t1.tag !== "AmbiguousNullPointer" && actualType(genv, t1).tag === "PointerType") { return t1; }
        if (t2.tag !== "AmbiguousNullPointer" && actualType(genv, t2).tag === "PointerType") { return t2; }
        return null;
    }

    if (t1.tag === "AnonymousFunctionTypePointer") {
        if (t2.tag === "AnonymousFunctionTypePointer") {
            return equalFunctionTypes(genv, t1.definition, t2.definition) ? t1 : null;
        } else if (t2.tag === "NamedFunctionType") {
            return null;
        } else {
            const actual2 = actualType(genv, t2);
            if (actual2.tag !== "PointerType") { return null; }
            const actual2arg = actualType(genv, actual2.argument);
            if (actual2arg.tag !== "NamedFunctionType") { return null; }
            return equalFunctionTypes(genv, t1.definition, actual2arg.definition) ? t1 : null;
        }
    } else if (t2.tag === "AnonymousFunctionTypePointer") {
        if (t1.tag === "NamedFunctionType") {
            return null;
        } else {
            const actual1 = actualType(genv, t1);
            if (actual1.tag !== "PointerType") { return null; }
            const actual1arg = actualType(genv, actual1.argument);
            if (actual1arg.tag !== "NamedFunctionType") { return null; }
            return equalFunctionTypes(genv, actual1arg.definition, t2.definition) ? t2 : null;
        }
    } else if (t1.tag === "NamedFunctionType" || t2.tag === "NamedFunctionType") {
        return t1.tag === "NamedFunctionType" &&
            t2.tag === "NamedFunctionType" &&
            t1.definition.id.name === t2.definition.id.name
            ? t1
            : null;
    } else {
        return leastUpperBoundType(genv, t1, t2);
    }
}

/**
 * Checks that a value of the abstract type is usable in a hole requiring the concrete type:
 * in other words, checks that abstract <: concrete, where "<:" is the usual subtyping relationship.
 */
export function isSubtype(genv: GlobalEnv, abstract: Synthed, concrete: ast.Type): boolean {
    const actualConcrete = actualType(genv, concrete);
    const actualAbstract = actualSynthed(genv, abstract);
    switch (actualAbstract.tag) {
        case "IntType":
        case "BoolType":
        case "StringType":
        case "CharType":
        case "VoidType":
            return actualAbstract.tag === actualConcrete.tag;
        case "PointerType":
            return (
                actualConcrete.tag === "PointerType" &&
                isSubtype(genv, actualAbstract.argument, actualConcrete.argument)
            );
        case "ArrayType":
            return (
                actualConcrete.tag === "ArrayType" &&
                isSubtype(genv, actualAbstract.argument, actualConcrete.argument)
            );
        case "StructType":
            return actualConcrete.tag === "StructType" && actualAbstract.id.name === actualConcrete.id.name;
        case "NamedFunctionType":
            return (
                actualConcrete.tag === "NamedFunctionType" &&
                actualAbstract.definition.id.name === actualConcrete.definition.id.name
            );
        case "AmbiguousNullPointer":
            return actualConcrete.tag === "PointerType";
        case "NamedFunctionType":
            return (
                actualConcrete.tag === "NamedFunctionType" &&
                actualAbstract.definition.id.name === actualConcrete.definition.id.name
            );
        case "AnonymousFunctionTypePointer":
            if (actualConcrete.tag !== "PointerType") { return false; }
            const concreteFunctionType = actualType(genv, actualConcrete.argument);
            return (
                concreteFunctionType.tag === "NamedFunctionType" &&
                equalFunctionTypes(genv, actualAbstract.definition, concreteFunctionType.definition)
            );
        default:
            throw new ImpossibleError("Impossible");
    }
}

/**
 * Ensures that a type is not void or (recursively) void[]
 */
export function typeIsNotVoid(genv: GlobalEnv, tp: ast.Type): boolean {
    const actual = actualType(genv, tp);
    switch (actual.tag) {
        case "VoidType":
            return false;
        case "PointerType": {
            if (actual.argument.tag === "VoidType") { return true; }
            return typeIsNotVoid(genv, actual.argument);
        }
        case "ArrayType":
            return typeIsNotVoid(genv, actual.argument);
        case "IntType":
        case "BoolType":
        case "StringType":
        case "CharType":
        case "StructType": // Always okay, even if not defined
        case "NamedFunctionType": // This case is actually impossible
            return true;
        default:
            throw new ImpossibleError("Impossible");
    }
}

/**
 * Asserts type mentioned in variable declaration or function argument has small type
 * TODO: use in other places as a "NOT SMALL" check?
 * TODO: Make sure this does the right things
 */
export function checkTypeInDeclaration(genv: GlobalEnv, tp: ast.Type, isFunctionArg?: boolean): void {
    const actual = actualType(genv, tp);
    switch (actual.tag) {
        case "StructType": {
            throw new TypingError(
                tp,
                `type struct ${actual.id.name} not small`,
                isFunctionArg
                    ? "cannot pass structs to or from functions; use pointers"
                    : "cannot store structs as locals; use pointers"
            );
        }
        case "NamedFunctionType": {
            throw new TypingError(
                tp,
                `Function type ${actual.definition.id.name} is not small`,
                isFunctionArg
                    ? "cannot pass functions directly to or from functions; use pointers"
                    : "cannot store functions as locals; store a function pointer"
            );
        }
        default:
            if (!typeIsNotVoid(genv, tp)) {
                throw new TypingError(tp, "type uses 'void' incorrectly");
            }
    }
}

/**
 * Checks that a function return type is valid (void or small)
 */
export function checkFunctionReturnType(genv: GlobalEnv, t: ast.Type) {
    switch (t.tag) {
        case "VoidType":
            return;
        default:
            return checkTypeInDeclaration(genv, t, true);
    }
}

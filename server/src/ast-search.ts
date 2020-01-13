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
    Declaration,
    StructDeclaration,
    VariableDeclarationOnly,
    Identifier
} from "./ast";
import { GlobalEnv, getFunctionDeclaration, getStructDefinition } from "./typecheck/globalenv";
import { expressionToString } from "./print";
import { Env, EnvEntry } from "./typecheck/types";
import { getEnvironmentFromParams } from "./typecheck/programs";
import { Ordering } from "./util";

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
    data: FoundIdent | FoundType | FoundField | null;
}

export interface FoundIdent {
    tag: "FoundIdent";
    name: string;
    type: AnyType;
    id: Identifier;
}

export interface FoundType {
    tag: "FoundType";
    type: Type;
}

export interface FoundField {
    tag: "FoundField";
    struct: StructDeclaration;
    field: VariableDeclarationOnly;
    expression: string;
    id: Identifier;
}

function findType(e: Type, currentEnv: Env | null, info: SearchInfo): AstSearchResult {
    const { pos } = info;
 
    switch (e.tag) {
        case "ArrayType":
        case "PointerType":
            if (isInside(pos, e.argument.loc)) return findType(e.argument, currentEnv, info);
            break;

        case "StructType":
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
                        type,
                        id: e.callee
                    }
                };
            }

            for (const arg of e.arguments) {
                if (isInside(pos, arg.loc)) return findExpression(arg, currentEnv, info);
            }
            break;

        case "IndirectCallExpression":
            if (isInside(pos, e.callee.loc)) return findExpression(e.callee, currentEnv, info);
            for (const arg of e.arguments) {
                if (isInside(pos, arg.loc)) return findExpression(arg, currentEnv, info);
            }
            break;

        case "Identifier": {
            if (currentEnv === null) break;

            let type: AnyType | undefined = currentEnv.get(e.name);
            if (type === undefined) {
                const func = getFunctionDeclaration(info.genv, e.name);
                if (func === null) break;
                type = { tag: "FunctionType", definition: func };
            }

            return {
                environment: currentEnv,
                data: {
                    tag: "FoundIdent",
                    name: e.name,
                    type,
                    id: e
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
                // This is now possible - it means that the 
                // user is typing in a field name right now 
                if (field === undefined) break;
                return {
                    environment: currentEnv,
                    data: {
                        tag: "FoundField",
                        expression: expressionToString(e),
                        struct,
                        field,
                        id: e.field
                    }
                };
            }

        case "LogicalExpression":
        case "BinaryExpression":
            if (isInside(pos, e.left.loc)) return findExpression(e.left, currentEnv, info);
            if (isInside(pos, e.right.loc)) return findExpression(e.right, currentEnv, info);
            break;

        case "ArrayMemberExpression":
            if (isInside(pos, e.object.loc)) return findExpression(e.object, currentEnv, info);
            if (isInside(pos, e.index.loc)) return findExpression(e.index, currentEnv, info);
            break;

        case "AllocExpression":
            // FIXME: more precise type location
            // For example, alloc(typedefName*) will always
            // just return the pointer type, and not go straight 
            // to the identifier as desired
            if (isInside(pos, e.kind.loc)) return findType(e.kind, currentEnv, info);
            break;

        case "HasTagExpression":
        case "CastExpression":
            if (isInside(pos, e.kind.loc)) return findType(e.kind, currentEnv, info);
        // tslint:disable-next-line: no-switch-case-fall-through 
        case "UnaryExpression":
        case "AllocArrayExpression":
        case "LengthExpression":
            if (isInside(pos, e.argument.loc)) return findExpression(e.argument, currentEnv, info);
            break;

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
            if (isInside(pos, s.id.loc)) return findExpression(s.id, currentEnv, info);
            if (s.init && isInside(pos, s.init.loc))
                return findExpression(s.init, currentEnv, info);
            break;

        case "AssignmentStatement":
            if (isInside(pos, s.left.loc)) return findExpression(s.left, currentEnv, info);
            if (isInside(pos, s.right.loc)) return findExpression(s.right, currentEnv, info);
            break;

        case "ForStatement":
            // Add any variable declared in the init to the environment
            if (s.init?.tag === 'VariableDeclaration') {
                // Duplicate environment
                if (currentEnv) {
                    currentEnv = new Map(currentEnv);
                } else {
                    currentEnv = new Map();
                }
                currentEnv?.set(s.init.id.name, { ...s.init.kind, position: s.init.id.loc });
            }
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

function findDecl(decl: Declaration, info: SearchInfo): AstSearchResult {
    const { pos } = info;
    switch (decl.tag) {
        case "FunctionDeclaration": {
            if (isInside(pos, decl.returns.loc)) return findType(decl.returns, null, info);
            if (isInside(pos, decl.id.loc)) {
                const type: AnyType = { tag: "FunctionType", definition: decl };
                return {
                    environment: null,
                    data: {
                        tag: "FoundIdent",
                        name: decl.id.name,
                        type,
                        id: decl.id
                    }
                };
            }

            // Environment of just the arguments, for use in contracts
            let env: Env | null;
            try {
                env = getEnvironmentFromParams(info.genv, decl.params);
            } catch (err) {
                env = null;
            }

            // Check args 
            for (const arg of decl.params) {
                if (isInside(pos, arg.kind.loc)) return findType(arg.kind, env, info);
                if (isInside(pos, arg.id.loc)) return findExpression(arg.id, env, info);
            }

            for (const contract of [...decl.preconditions, ...decl.postconditions]) {
                if (isInside(pos, contract.loc)) return findExpression(contract, env, info);
            }

            if (decl.body && isInside(pos, decl.body.loc)) return findStatement(decl.body, null, info);
            break;
        }

        case "TypeDefinition":
            if (isInside(pos, decl.definition.kind.loc)) return findType(decl.definition.kind, null, info);
            if (isInside(pos, decl.definition.id.loc)) return {
                environment: null,
                data: {
                    tag: "FoundType",
                    type: decl.definition.id
                }
            };
            break;

        case "FunctionTypeDefinition": {
            if (isInside(pos, decl.definition.returns.loc)) return findType(decl.definition.returns, null, info);
            if (isInside(pos, decl.definition.id.loc)) {
                return {
                    environment: null,
                    data: {
                        tag: "FoundType",
                        type: decl.definition.id
                    }
                };
            }

            // Environment of just the arguments, for use in contracts
            let env: Env | null;
            try {
                env = getEnvironmentFromParams(info.genv, decl.definition.params);
            } catch (err) {
                env = null;
            }

            // Check args 
            for (const arg of decl.definition.params) {
                if (isInside(pos, arg.kind.loc)) return findType(arg.kind, env, info);
                if (isInside(pos, arg.id.loc)) return findExpression(arg.id, env, info);
            }

            for (const contract of [...decl.definition.preconditions, ...decl.definition.postconditions]) {
                if (isInside(pos, contract.loc)) return findExpression(contract, env, info);
            }

            if (decl.definition.body && isInside(pos, decl.definition.body.loc))
                return findStatement(decl.definition.body, null, info);
            break;
        }

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

export class RenameHeaderError extends Error {
    public readonly name: "RenameHeaderError";
    constructor(header: string | null | undefined) {
        super(`Can't rename ${header}`);
        this.name = "RenameHeaderError";
    }
}

export interface FindFunction {
    tag: 'FindFunction';
    name: string;
}

export interface FindType {
    tag: 'FindType';
    name: string;
}

export interface FindStruct {
    tag: 'FindStruct';
    name: string;
}

export interface FindField {
    tag: 'FindField';
    struct: string;
    field: string;
}

export interface FindVar {
    tag: 'FindVar';
    entry: EnvEntry;
}

export type FindUsesParam = FindFunction | FindType | FindStruct | FindField | FindVar;

function findUsesType(type: Type, toFind: FindUsesParam): Array<SourceLocation> {
    switch (type.tag) {
        case "ArrayType":
        case "PointerType":
            return findUsesType(type.argument, toFind);

        case "StructType":
            if (toFind.tag === 'FindStruct' && type.id.name === toFind.name) {
                if (type.id.loc) return [type.id.loc];
            }
            break;
        case "Identifier":
            if (toFind.tag === 'FindType' && type.name === toFind.name) {
                if (type.loc) return [type.loc];
            }
            break;
    }
    return [];
}

function findUsesExp(exp: Expression, currentEnv: Env | null, toFind: FindUsesParam): Array<SourceLocation> {
    const uses: Array<SourceLocation> = [];
    switch (exp.tag) {
        case "CallExpression":
            if (toFind.tag === 'FindFunction' && exp.callee.name === toFind.name) {
                if (exp.callee.loc) uses.push(exp.callee.loc);
            }

            exp.arguments.forEach((arg) => {
                uses.push(...findUsesExp(arg, currentEnv, toFind));
            });
            break;

        case "IndirectCallExpression":
            uses.push(...findUsesExp(exp.callee, currentEnv, toFind));
            exp.arguments.forEach((arg) => {
                uses.push(...findUsesExp(arg, currentEnv, toFind));
            });
            break;

        case "Identifier": {
            if (currentEnv === null) break;

            const entry: EnvEntry | undefined = currentEnv.get(exp.name);
            if (entry === undefined) {
                // Function pointer
                if (toFind.tag === 'FindFunction' && exp.name === toFind.name) {
                    if (exp.loc) uses.push(exp.loc);
                }
            } else {
                // Local variable
                if (toFind.tag === 'FindVar' && entry.position === toFind.entry.position) {
                    if (exp.loc) uses.push(exp.loc);
                }
            }
            break;
        }
        case "StructMemberExpression":
            uses.push(...findUsesExp(exp.object, currentEnv, toFind));
            if (toFind.tag === 'FindField' && exp.struct === toFind.struct) {
                if (exp.field.name === toFind.field && exp.field.loc) {
                    uses.push(exp.field.loc);
                }
            }
            break;

        case "LogicalExpression":
        case "BinaryExpression":
            uses.push(...findUsesExp(exp.left, currentEnv, toFind));
            uses.push(...findUsesExp(exp.right, currentEnv, toFind));
            break;

        case "ArrayMemberExpression":
            uses.push(...findUsesExp(exp.object, currentEnv, toFind));
            uses.push(...findUsesExp(exp.index, currentEnv, toFind));
            break;

        case "AllocExpression":
            uses.push(...findUsesType(exp.kind, toFind));
            break;

        case "HasTagExpression":
        case "CastExpression":
        case "AllocArrayExpression":
            uses.push(...findUsesType(exp.kind, toFind));
        // tslint:disable-next-line: no-switch-case-fall-through 
        case "UnaryExpression":
        case "LengthExpression":
            uses.push(...findUsesExp(exp.argument, currentEnv, toFind));
            break;

        case "IntLiteral":
        case "BoolLiteral":
        case "StringLiteral":
        case "CharLiteral":
        case "NullLiteral":
            break;
    }
    return uses;
}

function findUsesStatement(stmt: Statement, currentEnv: Env | null, toFind: FindUsesParam): Array<SourceLocation> {
    const uses: Array<SourceLocation> = [];
    switch (stmt.tag) {
        case "BlockStatement":
            currentEnv = stmt.environment ?? currentEnv;
            for (const child of stmt.body) {
                uses.push(...findUsesStatement(child, currentEnv, toFind));
            }
            break;

        case "IfStatement":
            uses.push(...findUsesExp(stmt.test, currentEnv, toFind));
            uses.push(...findUsesStatement(stmt.consequent, currentEnv, toFind));
            if (stmt.alternate)
                uses.push(...findUsesStatement(stmt.alternate, currentEnv, toFind));
            break;

        case "ReturnStatement":
            if (stmt.argument)
                uses.push(...findUsesExp(stmt.argument, currentEnv, toFind));
            break;

        case "ExpressionStatement":
            return findUsesExp(stmt.expression, currentEnv, toFind);

        case "VariableDeclaration":
            uses.push(...findUsesType(stmt.kind, toFind));
            uses.push(...findUsesExp(stmt.id, currentEnv, toFind));
            if (stmt.init)
                uses.push(...findUsesExp(stmt.init, currentEnv, toFind));
            break;

        case "AssignmentStatement":
            uses.push(...findUsesExp(stmt.left, currentEnv, toFind));
            uses.push(...findUsesExp(stmt.right, currentEnv, toFind));
            break;

        case "ForStatement":
            // Add any variable declared in the init to the environment
            if (stmt.init?.tag === 'VariableDeclaration') {
                // Duplicate environment
                if (currentEnv) {
                    currentEnv = new Map(currentEnv);
                } else {
                    currentEnv = new Map();
                }
                currentEnv?.set(stmt.init.id.name, { ...stmt.init.kind, position: stmt.init.id.loc });
            }

            if (stmt.init) {
                uses.push(...findUsesStatement(stmt.init, currentEnv, toFind));
            }
            if (stmt.update) {
                uses.push(...findUsesStatement(stmt.update, currentEnv, toFind));
            }

        // Fall through for common loop cases 
        // tslint:disable-next-line: no-switch-case-fall-through
        case "WhileStatement":
            uses.push(...findUsesExp(stmt.test, currentEnv, toFind));
            uses.push(...findUsesStatement(stmt.body, currentEnv, toFind));
            stmt.invariants.forEach((inv) => {
                uses.push(...findUsesExp(inv, currentEnv, toFind));
            });
            break;

        case "UpdateStatement":
        case "ErrorStatement":
            return findUsesExp(stmt.argument, currentEnv, toFind);

        case "AssertStatement":
            return findUsesExp(stmt.test, currentEnv, toFind);

        case "BreakStatement":
        case "ContinueStatement":
            break;
    }
    return uses;
}

function findUsesDecl(genv: GlobalEnv, decl: Declaration, toFind: FindUsesParam): Array<SourceLocation> {
    const uses: Array<SourceLocation> = [];
    switch (decl.tag) {
        case 'FunctionDeclaration': {
            if (toFind.tag === 'FindFunction' && decl.id.name === toFind.name) {
                if (decl.id.loc) uses.push(decl.id.loc);
            }
            uses.push(...findUsesType(decl.returns, toFind));
            decl.params.forEach((param) => {
                uses.push(...findUsesType(param.kind, toFind));
                
                // Check for parameter rename
                if (toFind.tag === 'FindVar' && param.id.loc && param.id.loc === toFind.entry.position) {
                    uses.push(param.id.loc);
                }
            });

            // Environment of just the arguments, for use in contracts
            let env: Env | null;
            try {
                env = getEnvironmentFromParams(genv, decl.params);
            } catch (err) {
                env = null;
            }

            decl.postconditions.forEach((exp) => {
                uses.push(...findUsesExp(exp, env, toFind));
            });
            decl.preconditions.forEach((exp) => {
                uses.push(...findUsesExp(exp, env, toFind));
            });
            if (decl.body) {
                uses.push(...findUsesStatement(decl.body, null, toFind));
            }
            break;
        }

        case "TypeDefinition":
            uses.push(...findUsesType(decl.definition.kind, toFind));
            if (toFind.tag === 'FindType' && decl.definition.id.name === toFind.name) {
                if (decl.definition.id.loc) uses.push(decl.definition.id.loc);
            }
            break;

        case "FunctionTypeDefinition": {
            if (toFind.tag === 'FindType' && decl.definition.id.name === toFind.name) {
                if (decl.definition.id.loc) uses.push(decl.definition.id.loc);
            }
            uses.push(...findUsesType(decl.definition.returns, toFind));
            decl.definition.params.forEach((param) => {
                uses.push(...findUsesType(param.kind, toFind));
                
                // Check for parameter rename
                if (toFind.tag === 'FindVar' && param.id.loc && param.id.loc === toFind.entry.position) {
                    uses.push(param.id.loc);
                }
            });

            // Environment of just the arguments, for use in contracts
            let env: Env | null;
            try {
                env = getEnvironmentFromParams(genv, decl.definition.params);
            } catch (err) {
                env = null;
            }

            decl.definition.postconditions.forEach((exp) => {
                uses.push(...findUsesExp(exp, env, toFind));
            });
            decl.definition.preconditions.forEach((exp) => {
                uses.push(...findUsesExp(exp, env, toFind));
            });
            break;
        }

        case "StructDeclaration":
            if (toFind.tag === 'FindStruct' && decl.id.name === toFind.name) {
                if (decl.id.loc) uses.push(decl.id.loc);
            }
            if (decl.definitions === null) break;
            for (const field of decl.definitions) {
                uses.push(...findUsesType(field.kind, toFind));
                if (toFind.tag === 'FindField' && decl.id.name === toFind.struct && field.id.name === toFind.field) {
                    if (field.id.loc) uses.push(field.id.loc);
                }
            }
            break;
    }
    return uses;
}

/**
 * Finds all uses of either a function name or a type name across a given environment
 * @param genv The global environment to search
 * @param uri The URI of the file to find identifiers in
 * @param identifier The identifier to search for. Either a type or a function name
 */
export function findUses(genv: GlobalEnv, uri: string, toFind: FindUsesParam): Array<SourceLocation> {
    const uses: Array<SourceLocation> = [];
    for (const decl of genv.decls) {
        if (decl.loc?.source?.endsWith('.h0') || decl.loc?.source?.endsWith('.h1')) {
            // Make sure not renaming header function
            switch (decl.tag) {
                case 'FunctionDeclaration':
                    if (toFind.tag === 'FindFunction' && decl.id.name === toFind.name) {
                        throw new RenameHeaderError(decl.loc?.source);
                    }
                    break;
                case 'FunctionTypeDefinition':
                case 'TypeDefinition':
                    if (toFind.tag === 'FindType' && decl.definition.id.name === toFind.name) {
                        throw new RenameHeaderError(decl.loc?.source);
                    }
                    break;
                case 'StructDeclaration':
                    if (toFind.tag === 'FindStruct' && decl.id.name === toFind.name) {
                        throw new RenameHeaderError(decl.loc?.source);
                    }
                    break;
            }
            continue;
        }
        if (decl.loc?.source !== uri) continue;
        uses.push(...findUsesDecl(genv, decl, toFind));
    }
    return uses;
}

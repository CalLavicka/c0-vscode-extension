import * as ast from "../ast";
import {
    GlobalEnv,
    getTypeDef,
    getFunctionDeclaration,
    addDecl,
    initMain,
    isLibraryFunction,
    isLibraryStruct,
    getStructDefinition,
    actualType
} from "./globalenv";
import { Env, equalFunctionTypes, checkTypeInDeclaration, checkFunctionReturnType } from "./types";
import { checkExpression } from "./expressions";
import { checkStatement } from "./statements";
import { expressionFreeVars, checkStatementFlow, checkExpressionUsesGetFreeFunctions } from "./flow";
import { TypingError, ImpossibleError } from "../error";
import { Either, Right, Left } from "../util";

function getDefinedFromParams(params: ast.VariableDeclarationOnly[]): Set<string> {
    const defined = new Set<string>();
    for (let param of params) { defined.add(param.id.name); }
    return defined;
}

function getEnvironmentFromParams(genv: GlobalEnv, params: ast.VariableDeclarationOnly[]): Env {
    const env = new Map<string, ast.Type>();
    for (let param of params) {
        checkTypeInDeclaration(genv, param.kind, true);
        if (env.has(param.id.name)) {
            // TODO: Previous location
            throw new TypingError(param, `local ${param.id.name} declared a second time`);
        } else {
            env.set(param.id.name, param.kind);
        }
    }
    return env;
}

function checkDeclaration(library: boolean, genv: GlobalEnv, decl: ast.Declaration, errors: Set<TypingError>): Set<string> {
    switch (decl.tag) {
        case "Pragma": {
            return new Set();
        }
        case "StructDeclaration": {
            if (decl.definitions === null) { return new Set(); }
            if (!library && isLibraryStruct(genv, decl.id.name)) {
                // TODO: Previous location
                errors.add(new TypingError(
                    decl,
                    `struct ${decl.id.name} is declared in a library and cannot be defined here`
                ));
            }
            const previousStruct = getStructDefinition(genv, decl.id.name);
            if (previousStruct !== null && previousStruct.definitions !== null) {
                // TODO: Previous location
                errors.add(new TypingError(
                    decl,
                    `struct ${decl.id.name} is defined twice`,
                    "structs can only be defined once"
                ));
            }

            let fields = new Set<string>();
            for (let definition of decl.definitions) {
                if (fields.has(definition.id.name)) {
                    // TODO: Previous location
                    errors.add(new TypingError(
                        decl,
                        `field '${definition.id.name}' used more than once in definition of struct '${
                            decl.id.name
                        }'`
                    ));
                }
                const kind = actualType(genv, definition.kind);
                if (kind.tag === "NamedFunctionType") {
                    errors.add(new TypingError(
                        definition,
                        "cannot put a function directly in a struct",
                        "use a function pointer"
                    ));
                }
                if (kind.tag === "StructType") {
                    const structdef = getStructDefinition(genv, kind.id.name);
                    if (structdef === null || structdef.definitions === null) {
                        errors.add(new TypingError(
                            definition,
                            "struct fields must be defined",
                            `define 'struct ${kind.id.name}' or make the field a pointer to a 'struct ${
                                kind.id.name
                            }'`
                        ));
                    }
                }
                fields.add(definition.id.name);
            }
            return new Set();
        }
        case "TypeDefinition": {
            const previousTypeDef = getTypeDef(genv, decl.definition.id.name);
            const previousFunction = getFunctionDeclaration(genv, decl.definition.id.name);
            if (previousTypeDef !== null) {
                // TODO: Previous location
                errors.add(new TypingError(
                    decl,
                    `type name '${decl.definition.id.name}' already defined as a type`
                ));
            }
            if (previousFunction !== null) {
                // TODO: Previous location
                errors.add(new TypingError(
                    decl,
                    `type name '${decl.definition.id.name}' already used as a function name`
                ));
            }
            return new Set();
        }
        case "FunctionTypeDefinition": {
            // Check for previous typedefs
            const previousTypeDef = getTypeDef(genv, decl.definition.id.name);
            const previousFunction = getFunctionDeclaration(genv, decl.definition.id.name);
            if (previousTypeDef !== null) {
                // TODO: Previous location
                errors.add(new TypingError(
                    decl,
                    `function type name '${decl.definition.id.name}' already defined as a type`
                ));
            }
            if (previousFunction !== null) {
                // TODO: Previous location
                errors.add(new TypingError(
                    decl,
                    `function type name '${decl.definition.id.name}' already used as a function name`
                ));
            }

            // Check declaration
            try {
                checkFunctionReturnType(genv, decl.definition.returns);
            } catch(err) {
                errors.add(err);
            }
            try {
                const env = getEnvironmentFromParams(genv, decl.definition.params);
                const defined = getDefinedFromParams(decl.definition.params);
                const functionsUsed = new Set<string>();
                for (let anno of decl.definition.preconditions) {
                    checkExpression(genv, env, { tag: "@requires" }, anno, { tag: "BoolType" });
                    checkExpressionUsesGetFreeFunctions(defined, defined, anno).forEach(x =>
                        functionsUsed.add(x)
                    );
                }
                for (let anno of decl.definition.postconditions) {
                    checkExpression(genv, env, { tag: "@ensures", returns: decl.definition.returns }, anno, {
                        tag: "BoolType"
                    });
                    checkExpressionUsesGetFreeFunctions(defined, defined, anno).forEach(x =>
                        functionsUsed.add(x)
                    );
                }
                return functionsUsed;
            } catch(err) {
                errors.add(err);
                return new Set();
            }
        }
        case "FunctionDeclaration": {
            // No need to check for previous typedefs (this would cause a parse error)
            try {
                checkFunctionReturnType(genv, decl.returns);
            } catch(err) {
                errors.add(err);
            }

            let functionsUsed = new Set<string>();
            try {
                const env = getEnvironmentFromParams(genv, decl.params);
                const defined = getDefinedFromParams(decl.params);
                for (let anno of decl.preconditions) {
                    try {
                        checkExpression(genv, env, { tag: "@requires" }, anno, { tag: "BoolType" });
                        checkExpressionUsesGetFreeFunctions(defined, defined, anno).forEach(x =>
                            functionsUsed.add(x)
                        );
                    } catch(err) {
                        errors.add(err);
                    }
                }
                for (let anno of decl.postconditions) {
                    try {
                        checkExpression(genv, env, { tag: "@ensures", returns: decl.returns }, anno, {
                            tag: "BoolType"
                        });
                        checkExpressionUsesGetFreeFunctions(defined, defined, anno).forEach(x =>
                            functionsUsed.add(x)
                        );
                    } catch(err) {
                        errors.add(err);
                    }
                }

                // Check previous functions match
                try {
                    const previousFunction = getFunctionDeclaration(genv, decl.id.name);
                    if (previousFunction !== null) {
                        if (previousFunction.body !== null && decl.body !== null) {
                            // TODO: Previous location
                            errors.add(new TypingError(decl.id, `function ${decl.id.name} defined more than once`));
                        }
                        if (!equalFunctionTypes(genv, previousFunction, decl)) {
                            const oldone = previousFunction.body === null ? "declaration" : "definition";
                            const newone = decl.body === null ? "declaration" : "definition";
                            // TODO: Previous location
                            errors.add(new TypingError(
                                decl.id,
                                `function ${newone} for '${decl.id.name}' does not match previous function ${oldone}`
                            ));
                        }
                    }
                } catch(err) {
                    errors.add(err);
                }
                
                // Check body, if necessary
                if (decl.body === null) { return functionsUsed; }

                if (library) {
                    errors.add(
                        new TypingError(decl.body, `functions cannot be defined in a library header file`)
                    );
                }
                if (isLibraryFunction(genv, decl.id.name)) {
                    // TODO: Previous location
                    errors.add(new TypingError(
                        decl.id,
                        `function ${decl.id.name} is declared in a library header and cannot be defined`
                    ));
                }

                // TODO: It's a hack that we _permanently_ add the recursive type declaration
                // even if it's a harmless hack.
                addDecl(false, genv, {
                    tag: "FunctionDeclaration",
                    id: decl.id,
                    returns: decl.returns,
                    params: decl.params,
                    preconditions: [],
                    postconditions: [],
                    body: null
                });

                try {
                    checkStatement(genv, env, decl.body, decl.returns, false, errors);
                    let constants: Set<string> = new Set();
                    decl.postconditions.forEach(anno => {
                        expressionFreeVars(anno).forEach(x => {
                            if (defined.has(x)) { constants.add(x); }
                        });
                    });

                    const functionAnalysis = checkStatementFlow(defined, constants, defined, decl.body);
                    if (decl.returns.tag !== "VoidType" && !functionAnalysis.returns) {
                        errors.add(new TypingError(
                            decl.id,
                            `function ${decl.id.name} has non-void return type but does not return along every path`
                        ));
                    }
                    functionAnalysis.functions.forEach(f => functionsUsed.add(f));
                } catch(err) {
                    errors.add(err);
                }
            } catch(err) {
                errors.add(err);
            }

            return functionsUsed;
        }
        /* instanbul ignore next */
        default: {
            throw new ImpossibleError("Impossible");
        }
    }
}

export function checkProgramFragment(libs: ast.Declaration[], decls: ast.Declaration[]) {
    const genv = initMain();
    const functionsUsed = new Set<string>();
    const errors = new Set<TypingError>();
    libs.forEach(decl => {
        checkDeclaration(true, genv, decl, errors).forEach(f => functionsUsed.add(f));
        addDecl(true, genv, decl);
    });
    decls.forEach(decl => {
        checkDeclaration(false, genv, decl, errors).forEach(f => functionsUsed.add(f));
        addDecl(false, genv, decl);
    });

    functionsUsed.forEach(
        (name): void => {
            const def = getFunctionDeclaration(genv, name);
            if (def === null) { throw new ImpossibleError(`No definition for ${name}`); }
            if (def.body === null && !isLibraryFunction(genv, def.id.name)) {
                // TODO: Where was the function used?
                throw new TypingError(def, `function ${name} is never defined`);
            }
        }
    );

    return genv;
}

export type TypecheckResult = Either<Set<TypingError>, GlobalEnv>;

export function checkProgram(libs: ast.Declaration[], decls: ast.Declaration[]): TypecheckResult {
    const genv = initMain();
    const functionsUsed = new Set<string>();
    const errors = new Set<TypingError>();
    libs.forEach(decl => {
        checkDeclaration(true, genv, decl, errors).forEach(f => functionsUsed.add(f));
        addDecl(true, genv, decl);
    });
    decls.forEach(decl => {
        checkDeclaration(false, genv, decl, errors).forEach(f => functionsUsed.add(f));
        addDecl(false, genv, decl);
    });

    //functionsUsed.add("main");
    functionsUsed.forEach(
        (name): void => {
            const def = getFunctionDeclaration(genv, name);
            if (def === null) { console.error(`No definition for ${name}`); }
            else if (def.body === null && !isLibraryFunction(genv, def.id.name)) {
                // TODO: Where was the function used?
                errors.add(new TypingError(def.id, `function ${name} is never defined`));
            }
        }
    );

    if (errors.size === 0) {
        return Right(genv);
    }
    else {
        return Left(errors);
    }
}

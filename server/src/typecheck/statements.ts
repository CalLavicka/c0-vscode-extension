import * as ast from "../ast";
import { GlobalEnv, concreteType } from "./globalenv";
import { Env, checkTypeInDeclaration, actualSynthed, EnvEntry } from "./types";
import { checkExpression, synthExpression, synthLValue } from "./expressions";
import { ImpossibleError, TypingError } from "../error";
import { typeToString } from "../print";

/** 
 * Checks a group of statements, modifying env
 * along the way
 */
function checkStatements(
    genv: GlobalEnv,
    env: Env,
    stms: ast.Statement[],
    returning: ast.Type | null,
    inLoop: boolean,
    errors: Set<TypingError>
) {
    stms.forEach(stm => checkStatement(genv, env, stm, returning, inLoop, errors));
}

function copyEnv(env: Env) {
    const envCopy = new Map<string, EnvEntry>();
    env.forEach((v, k) => envCopy.set(k, v));
    return envCopy;
}

export function checkStatement(
    genv: GlobalEnv,
    env: Env,
    stm: ast.Statement,
    returning: ast.Type | null,
    inLoop: boolean,
    errors: Set<TypingError>
): void {
    switch (stm.tag) {
        case "AssignmentStatement": {
            try {
                if (stm.operator === "=") {
                    // Any concrete type
                    const left = synthLValue(genv, env, null, stm.left);
                    checkExpression(genv, env, null, stm.right, left);
                    stm.size = concreteType(genv, left); // INSERTING TYPE INFORMATION HERE
                } else {
                    // Only int types
                    checkExpression(genv, env, null, stm.left, { tag: "IntType" });
                    checkExpression(genv, env, null, stm.right, { tag: "IntType" });
                    stm.size = { tag: "IntType" };
                }
            } catch (err) {
                errors.add(err as TypingError);
            }
            return;
        }
        case "UpdateStatement": {
            try {
                checkExpression(genv, env, null, stm.argument, { tag: "IntType" });
            } catch (err) {
                errors.add(err as TypingError);
            }
            return;
        }
        case "ExpressionStatement": {
            try {
                const expType = actualSynthed(genv, synthExpression(genv, env, null, stm.expression));
                if (expType.tag === "StructType") {
                    errors.add(new TypingError(
                        stm,
                        `expression used as statements cannot have type 'struct ${expType.id.name}'`
                    ));
                }
                if (expType.tag === "NamedFunctionType") {
                    errors.add(new TypingError(
                        stm,
                        `expression used as statements cannot have function type '${expType.definition.id.name}'`
                    ));
                }
            } catch (err) {
                errors.add(err as TypingError);
            }
            return;
        }
        case "VariableDeclaration": {
            try {
                checkTypeInDeclaration(genv, stm.kind);
                if (env.has(stm.id.name)) {
                    // TODO: Previous definition
                    errors.add(new TypingError(stm, `variable '${stm.id.name}' declared a second time`));
                } else if (stm.init !== null) {
                    try {
                        checkExpression(genv, env, null, stm.init, stm.kind);
                    } catch (err) {
                        errors.add(err as TypingError);
                    }
                }
                env.set(stm.id.name, { ...stm.kind, position: stm.id.loc });
            } catch (err) {
                errors.add(err as TypingError);
            }
            return;
        }
        case "IfStatement": {
            checkExpression(genv, env, null, stm.test, { tag: "BoolType" });
            checkStatement(genv, copyEnv(env), stm.consequent, returning, inLoop, errors);
            if (stm.alternate) { checkStatement(genv, copyEnv(env), stm.alternate, returning, inLoop, errors); }
            return;
        }
        case "WhileStatement": {
            checkExpression(genv, env, null, stm.test, { tag: "BoolType" });
            stm.invariants.forEach(anno =>
                checkExpression(genv, env, { tag: "@loop_invariant" }, anno, { tag: "BoolType" })
            );
            checkStatement(genv, copyEnv(env), stm.body, returning, true, errors);
            return;
        }

        // TODO: for loops can introduce a new variable, so they should
        // technically also store their environments with them. 
        case "ForStatement": {
            const env0 = copyEnv(env);
            if (stm.init) { checkStatement(genv, env0, stm.init, null, false, errors); }
            try {
                checkExpression(genv, env0, null, stm.test, { tag: "BoolType" });
            } catch (err) {
                errors.add(err as TypingError);
            }
            if (stm.update) { checkStatement(genv, env0, stm.update, null, false, errors); }
            stm.invariants.forEach(anno => {
                try {
                    checkExpression(genv, env0, { tag: "@loop_invariant" }, anno, { tag: "BoolType" });
                } catch (err) {
                    errors.add(err as TypingError);
                }
            });
            checkStatement(genv, env0, stm.body, returning, true, errors);
            return;
        }
        case "ReturnStatement": {
            if (returning === null) { errors.add(new TypingError(stm, `return statements not allowed`)); }
            else if (returning.tag === "VoidType") {
                if (stm.argument !== null) {
                    errors.add(new TypingError(
                        stm,
                        "function returning void must invoke 'return', not 'return e'"
                    ));
                }
                return;
            } else {
                if (stm.argument === null) {
                    errors.add(new TypingError(stm, `this function must return a ${typeToString(returning)}`));
                } else {
                    try {
                        checkExpression(genv, env, null, stm.argument, returning);
                    } catch (err) {
                        errors.add(err as TypingError);
                    }
                }
                return;
            }
            return;
        }
        case "BlockStatement": {
            const newEnvironment: Env = copyEnv(env);
            checkStatements(genv, newEnvironment, stm.body, returning, inLoop, errors);
            stm.environment = newEnvironment;
            return;
        }
        case "AssertStatement": {
            try {
                checkExpression(genv, env, stm.contract ? { tag: "@assert" } : null, stm.test, {
                    tag: "BoolType"
                });
            } catch (err) {
                errors.add(err as TypingError);
            }
            return;
        }
        case "ErrorStatement": {
            try {
                checkExpression(genv, env, null, stm.argument, { tag: "StringType" });
            } catch (err) {
                errors.add(err as TypingError);
            }
            return;
        }
        case "BreakStatement": {
            if (!inLoop) {
                errors.add(new TypingError(
                    stm,
                    "break statement not allowed",
                    "break statements must be inside the body of a for-loop or while-loop"
                ));
            }
            return;
        }
        case "ContinueStatement": {
            if (!inLoop) {
                errors.add(new TypingError(
                    stm,
                    "continue statement not allowed",
                    "continue statements must be inside the body of a for-loop or while-loop"
                ));
            }
            return;
        }
        default: {
            throw new ImpossibleError("Impossible");
        }
    }
}

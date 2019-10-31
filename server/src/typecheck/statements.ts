import * as ast from "../ast";
import { GlobalEnv, concreteType } from "./globalenv";
import { Env, checkTypeInDeclaration, actualSynthed } from "./types";
import { checkExpression, synthExpression, synthLValue } from "./expressions";
import { ImpossibleError, TypingError } from "../error";
import { typeToString } from "../print";

function checkStatements(
    genv: GlobalEnv,
    env: Env,
    stms: ast.Statement[],
    returning: ast.Type | null,
    inLoop: boolean
) {
    stms.forEach(stm => checkStatement(genv, env, stm, returning, inLoop));
}

function copyEnv(env: Env) {
    const envCopy = new Map<string, ast.Type>();
    env.forEach((v, k) => envCopy.set(k, v));
    return envCopy;
}

export function checkStatement(
    genv: GlobalEnv,
    env: Env,
    stm: ast.Statement,
    returning: ast.Type | null,
    inLoop: boolean
): void {
    switch (stm.tag) {
        case "AssignmentStatement": {
            const left = synthLValue(genv, env, null, stm.left);
            checkExpression(genv, env, null, stm.right, left);
            stm.size = concreteType(genv, left); // INSERTING TYPE INFORMATION HERE
            return;
        }
        case "UpdateStatement": {
            checkExpression(genv, env, null, stm.argument, { tag: "IntType" });
            return;
        }
        case "ExpressionStatement": {
            const expType = actualSynthed(genv, synthExpression(genv, env, null, stm.expression));
            if (expType.tag === "StructType") {
                throw new TypingError(
                    stm,
                    `expression used as statements cannot have type 'struct ${expType.id.name}'`
                );
            }
            if (expType.tag === "NamedFunctionType") {
                throw new TypingError(
                    stm,
                    `expression used as statements cannot have function type '${expType.definition.id.name}'`
                );
            }
            return;
        }
        case "VariableDeclaration": {
            checkTypeInDeclaration(genv, stm.kind);
            if (env.has(stm.id.name)) {
                // TODO: Previous definition
                throw new TypingError(stm, `variable '${stm.id.name}' declared a second time`);
            } else if (stm.init !== null) {
                checkExpression(genv, env, null, stm.init, stm.kind);
            }
            env.set(stm.id.name, stm.kind);
            return;
        }
        case "IfStatement": {
            checkExpression(genv, env, null, stm.test, { tag: "BoolType" });
            checkStatement(genv, copyEnv(env), stm.consequent, returning, inLoop);
            if (stm.alternate) { checkStatement(genv, copyEnv(env), stm.alternate, returning, inLoop); }
            return;
        }
        case "WhileStatement": {
            checkExpression(genv, env, null, stm.test, { tag: "BoolType" });
            stm.invariants.forEach(anno =>
                checkExpression(genv, env, { tag: "@loop_invariant" }, anno, { tag: "BoolType" })
            );
            checkStatement(genv, copyEnv(env), stm.body, returning, true);
            return;
        }
        case "ForStatement": {
            const env0 = copyEnv(env);
            if (stm.init) { checkStatement(genv, env0, stm.init, null, false); }
            checkExpression(genv, env0, null, stm.test, { tag: "BoolType" });
            if (stm.update) { checkStatement(genv, env0, stm.update, null, false); }
            stm.invariants.forEach(anno =>
                checkExpression(genv, env0, { tag: "@loop_invariant" }, anno, { tag: "BoolType" })
            );
            checkStatement(genv, env0, stm.body, returning, true);
            return;
        }
        case "ReturnStatement": {
            if (returning === null) { throw new TypingError(stm, `return statements not allowed`); }
            if (returning.tag === "VoidType") {
                if (stm.argument !== null) {
                    throw new TypingError(
                        stm,
                        "function returning void must invoke 'return', not 'return e'"
                    );
                }
                return;
            } else {
                if (stm.argument === null) {
                    throw new TypingError(stm, `this function must return a ${typeToString(returning)}`);
                }
                checkExpression(genv, env, null, stm.argument, returning);
                return;
            }
        }
        case "BlockStatement": {
            checkStatements(genv, copyEnv(env), stm.body, returning, inLoop);
            return;
        }
        case "AssertStatement": {
            checkExpression(genv, env, stm.contract ? { tag: "@assert" } : null, stm.test, {
                tag: "BoolType"
            });
            return;
        }
        case "ErrorStatement": {
            checkExpression(genv, env, null, stm.argument, { tag: "StringType" });
            return;
        }
        case "BreakStatement": {
            if (!inLoop) {
                throw new TypingError(
                    stm,
                    "break statement not allowed",
                    "break statements must be inside the body of a for-loop or while-loop"
                );
            }
            return;
        }
        case "ContinueStatement": {
            if (!inLoop) {
                throw new TypingError(
                    stm,
                    "continue statement not allowed",
                    "continue statements must be inside the body of a for-loop or while-loop"
                );
            }
            return;
        }
        default: {
            throw new ImpossibleError("Impossible");
        }
    }
}

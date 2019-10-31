import * as ast from "../ast";
import { ImpossibleError, TypingError } from "../error";

/**
 * Returns the free locals and free functions of an expression. (The type system ensures these are
 * disjoint within any top-level declaration.)
 */
export function expressionFreeVars(exp: ast.Expression): Set<string> {
    const freeVars = new Set<string>();
    switch (exp.tag) {
        case "Identifier":
            freeVars.add(exp.name);
        case "IntLiteral":
        case "StringLiteral":
        case "CharLiteral":
        case "BoolLiteral":
        case "NullLiteral":
        case "AllocExpression":
        case "ResultExpression":
            return freeVars;
        case "ArrayMemberExpression":
            expressionFreeVars(exp.index).forEach(x => freeVars.add(x));
        case "StructMemberExpression":
            expressionFreeVars(exp.object).forEach(x => freeVars.add(x));
            return freeVars;
        case "CallExpression":
        case "IndirectCallExpression":
            expressionFreeVars(exp.callee).forEach(x => freeVars.add(x));
            exp.arguments.forEach(arg => expressionFreeVars(arg).forEach(x => freeVars.add(x)));
            return freeVars;
        case "UnaryExpression":
        case "CastExpression":
        case "LengthExpression":
        case "HasTagExpression":
            expressionFreeVars(exp.argument).forEach(x => freeVars.add(x));
            return freeVars;
        case "BinaryExpression":
        case "LogicalExpression":
            expressionFreeVars(exp.left).forEach(x => freeVars.add(x));
            expressionFreeVars(exp.right).forEach(x => freeVars.add(x));
            return freeVars;
        case "ConditionalExpression":
            expressionFreeVars(exp.test).forEach(x => freeVars.add(x));
            expressionFreeVars(exp.consequent).forEach(x => freeVars.add(x));
            expressionFreeVars(exp.alternate).forEach(x => freeVars.add(x));
            return freeVars;
        case "AllocArrayExpression":
            expressionFreeVars(exp.argument).forEach(x => freeVars.add(x));
            return freeVars;
        default:
            return freeVars;
    }
}

/**
 * Ensures that the free locals of an expression have been defined along every control path
 * Raises an error if there are potentially un-initialized stack locals
 *  - Precondition: the expression must have passed typechecking
 *  - Precondition: all the current stack locals must be in [locals]
 *  - Precondition: [defined] is the subset of [locals] defined on every
 *  - Returns the free functions (the free locals that are not stack-allocated locals)
 */
export function checkExpressionUsesGetFreeFunctions(
    locals: Set<string>,
    defined: Set<string>,
    exp: ast.Expression
): Set<string> {
    const freeFunctions = new Set<string>();
    expressionFreeVars(exp).forEach(x => {
        if (locals.has(x)) {
            if (!defined.has(x)) {
                throw new TypingError(exp, `local '${x}' used without necessarily being defined`);
            }
        } else {
            freeFunctions.add(x);
        }
    });
    return freeFunctions;
}

/**
 *
 * @param locals All locals valid at this point in the program
 * @param constants Locals that are free in the postcondition and so must not be modified
 * @param defined Locals that have been previously defined on all control paths to this point
 * @param stm The statement being analyized
 * @returns
 *   - locals: locals valid after running this statement (changes when the statement is a declaration)
 *   - defined: definitely-defined locals after running this statement
 *   - functions: free functions in this statement
 *   - returns: does
 */
function add(s: Set<string>, x: string): Set<string> {
    const sCopy = new Set<string>();
    s.forEach(x => sCopy.add(x));
    sCopy.add(x);
    return sCopy;
}
export function checkStatementFlow(
    locals: Set<string>,
    constants: Set<string>,
    defined: Set<string>,
    stm: ast.Statement
): { locals: Set<string>; defined: Set<string>; functions: Set<string>; returns: boolean } {
    switch (stm.tag) {
        case "AssignmentStatement": {
            let functions = checkExpressionUsesGetFreeFunctions(locals, defined, stm.right);
            if (stm.operator === "=" && stm.left.tag === "Identifier") {
                if (constants.has(stm.left.name)) {
                    throw new TypingError(
                        stm,
                        `assigning to ${stm.left.name} is not permitted when ${
                            stm.left.name
                        } is used in postcondition`
                    );
                }
                defined = add(defined, stm.left.name);
            } else {
                checkExpressionUsesGetFreeFunctions(locals, defined, stm.left).forEach(f => functions.add(f));
            }
            return { locals: locals, defined: defined, functions: functions, returns: false };
        }
        case "UpdateStatement": {
            return {
                locals: locals,
                defined: defined,
                functions: checkExpressionUsesGetFreeFunctions(locals, defined, stm.argument),
                returns: false
            };
        }
        case "ExpressionStatement": {
            return {
                locals: locals,
                defined: defined,
                functions: checkExpressionUsesGetFreeFunctions(locals, defined, stm.expression),
                returns: false
            };
        }
        case "VariableDeclaration": {
            if (stm.init === null) {
                return {
                    locals: add(locals, stm.id.name),
                    defined: defined,
                    functions: new Set<string>(),
                    returns: false
                };
            }
            return {
                locals: add(locals, stm.id.name),
                defined: add(defined, stm.id.name),
                functions: checkExpressionUsesGetFreeFunctions(locals, defined, stm.init),
                returns: false
            };
        }
        case "IfStatement": {
            const test = checkExpressionUsesGetFreeFunctions(locals, defined, stm.test);
            const consequent = checkStatementFlow(locals, constants, defined, stm.consequent);
            consequent.functions.forEach(x => test.add(x));
            if (stm.alternate) {
                const alternate = checkStatementFlow(locals, constants, defined, stm.alternate);
                const intersection = new Set<string>();
                consequent.defined.forEach(x => (alternate.defined.has(x) ? intersection.add(x) : null));
                alternate.functions.forEach(x => test.add(x));
                return {
                    locals: locals,
                    defined: intersection,
                    functions: test,
                    returns: consequent.returns && alternate.returns
                };
            } else {
                return {
                    locals: locals,
                    defined: defined,
                    functions: test,
                    returns: false
                };
            }
        }
        case "WhileStatement": {
            const freeFunctions = checkExpressionUsesGetFreeFunctions(locals, defined, stm.test);
            stm.invariants.forEach(exp =>
                checkExpressionUsesGetFreeFunctions(locals, defined, exp).forEach(x => freeFunctions.add(x))
            );
            const body = checkStatementFlow(locals, constants, defined, stm.body);
            body.functions.forEach(x => freeFunctions.add(x));
            return {
                locals: locals,
                defined: defined,
                functions: freeFunctions,
                returns: false
            };
        }
        case "ForStatement": {
            const init = checkStatementFlow(
                locals,
                constants,
                defined,
                stm.init || { tag: "BlockStatement", body: [] }
            );
            const freeFunctions = init.functions;
            checkExpressionUsesGetFreeFunctions(init.locals, init.defined, stm.test).forEach(f =>
                freeFunctions.add(f)
            );
            stm.invariants.forEach(exp =>
                checkExpressionUsesGetFreeFunctions(init.locals, init.defined, exp).forEach(f =>
                    freeFunctions.add(f)
                )
            );
            const body = checkStatementFlow(init.locals, constants, init.defined, stm.body);
            const update = checkStatementFlow(
                init.locals,
                constants,
                body.defined,
                stm.update || { tag: "BlockStatement", body: [] }
            );
            body.functions.forEach(f => freeFunctions.add(f));
            update.functions.forEach(f => freeFunctions.add(f));
            return {
                locals: locals,
                defined: init.defined,
                functions: freeFunctions,
                returns: false
            };
        }
        case "ReturnStatement": {
            return {
                locals: locals,
                defined: locals,
                functions:
                    stm.argument === null
                        ? new Set()
                        : checkExpressionUsesGetFreeFunctions(locals, defined, stm.argument),
                returns: true
            };
        }
        case "BlockStatement": {
            const freeFunctions = new Set<string>();
            const body = stm.body.reduce(
                ({ locals, defined, returns }, stm) => {
                    const result = checkStatementFlow(locals, constants, defined, stm);
                    result.functions.forEach(f => freeFunctions.add(f));
                    return {
                        locals: result.locals,
                        defined: result.defined,
                        returns: returns || result.returns
                    };
                },
                { locals: locals, defined: defined, returns: false }
            );
            const intersection = new Set<string>();
            body.defined.forEach(x => (locals.has(x) ? intersection.add(x) : null));
            return {
                locals: locals,
                defined: intersection,
                functions: freeFunctions,
                returns: body.returns
            };
        }
        case "AssertStatement": {
            return {
                locals: locals,
                defined: defined,
                functions: checkExpressionUsesGetFreeFunctions(locals, defined, stm.test),
                returns: false
            };
        }
        case "ErrorStatement": {
            return {
                locals: locals,
                defined: defined,
                functions: checkExpressionUsesGetFreeFunctions(locals, defined, stm.argument),
                returns: true
            };
        }
        case "BreakStatement":
        case "ContinueStatement": {
            return { locals: locals, defined: locals, functions: new Set(), returns: false };
        }
        default:
            throw new ImpossibleError("Impossible");
    }
}

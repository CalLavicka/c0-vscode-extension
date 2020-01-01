import * as ast from "./ast";
import { BoolLiteral } from "./parse/nearley-helper";

export function typeToString(syn: ast.AnyType): string {
    switch (syn.tag) {
        case "Identifier":
            return syn.name;
        case "IntType":
            return "int";
        case "BoolType":
            return "bool";
        case "StringType":
            return "string";
        case "CharType":
            return "char";
        case "VoidType":
            return "void";
        case "PointerType":
            return `${typeToString(syn.argument)}*`;
        case "ArrayType":
            return `${typeToString(syn.argument)}[]`;
        case "StructType":
            return `struct ${syn.id.name}`;
        case "AmbiguousNullPointer":
            return "null pointer";
        case "NamedFunctionType":
            return `(${syn.definition.id.name}(${syn.definition.params
                .map(x => typeToString(x.kind))
                .join(",")}) => ${typeToString(syn.definition.returns)})`;
        case "AnonymousFunctionTypePointer":
            return `((${syn.definition.params.map(x => typeToString(x.kind)).join(",")}) => ${typeToString(
                syn.definition.returns
            )})*`;

        case "FunctionType":
            return `${typeToString(syn.definition.returns)} ${syn.definition.id.name}(${
                syn.definition.params.map(arg => `${typeToString(arg.kind)} ${arg.id.name}`).join(", ")
            })`;
        default:
            throw new Error("Impossible case - please report!");
    }
}

function parens(s: string): string {
    return `(${s})`;
}

// To avoid confusion, we will assume 
// 1. logical operators && and || have equal precedence
// 2. bitwise (binary) operators have the equal precedence 
// so we add extra parens in these cases even if unnecessary

function createOpmap() {
    const opmap = new Map();
    opmap.set("*", 1);
    opmap.set("/", 1);
    opmap.set("%", 1);
    opmap.set("+", 2);
    opmap.set("-", 2);
    opmap.set("<<", 3);
    opmap.set(">>", 3);
    opmap.set("<", 4);
    opmap.set(">", 4);
    opmap.set("<=", 4);
    opmap.set(">=", 4);
    opmap.set("==", 5);
    opmap.set("!=", 5);
    opmap.set("&", 6);
    opmap.set("^", 7);
    opmap.set("|", 8);
    opmap.set("&&", 9);
    opmap.set("||", 9);

    return opmap;

}

const opmap = createOpmap();

function cmpPrecedence(o1: string, o2: string) {
    if (opmap.get(o1) > opmap.get(o2)) return -1;
    else if (opmap.get(o1) === opmap.get(o2)) return 0;
    else return 1;
}

export function expressionToString(e: ast.Expression): string {
    switch (e.tag) {
        case "AllocArrayExpression":
            return `alloc_array(${typeToString(e.kind)}, ${expressionToString(e.argument)})`;
        case "AllocExpression":
            return `alloc(${typeToString(e.kind)})`;

        case "ArrayMemberExpression":
            return `${expressionToString(e.object)}[${expressionToString(e.index)}]`;

        // Wrap subexpression in parens if it has lower or equal precedence as current operator
        case "LogicalExpression":
        case "BinaryExpression": {
            let res1: string;
            switch (e.left.tag) {
                case "ConditionalExpression":
                    res1 = `${parens(expressionToString(e.left))} ${e.operator} `;
                    break;
                case "LogicalExpression":
                case "BinaryExpression":
                    const cmp = cmpPrecedence(e.left.operator, e.operator);
                    if (cmp === -1) {
                        res1 = `${parens(expressionToString(e.left))} ${e.operator} `;
                    } else if (cmp === 0) {
                        const left: string = e.left.operator;

                        // special cases where having parens is more readable even if unnecessary 
                        if ((left === "&&" && e.operator === "||") || 
                            (left === "||" && e.operator === "&&") ||
                            ((left === "==" || left === "!=") &&
                             (e.operator === "==" || e.operator === "!="))) {
                                res1 = `${parens(expressionToString(e.left))} ${e.operator} `; 
                            } else {
                                res1 = `${expressionToString(e.left)} ${e.operator} `; 
                            }
                    } else { // cmp === 1
                        res1 = `${expressionToString(e.left)} ${e.operator} `; 
                    }
                    break;
                default:
                    res1 = `${expressionToString(e.left)} ${e.operator} `; 
                    break;
            }
            switch (e.right.tag) {
                case "ConditionalExpression":
                    res1 += `${parens(expressionToString(e.right))}`;
                    break;
                case "LogicalExpression":
                case "BinaryExpression":
                    const cmp = cmpPrecedence(e.right.operator, e.operator);
                    if (cmp === -1) {
                        res1 += `${parens(expressionToString(e.right))}`;
                    } else if (cmp === 0) {

                        // associative operators don't need parens
                        if (e.right.operator === e.operator &&
                            (e.right.operator === "+" || e.right.operator === "*" || e.right.operator === "|" ||
                             e.right.operator === "&" || e.right.operator === "^"))
                        {
                            res1 += `${expressionToString(e.right)}`;
                        } else {
                            res1 += `${parens(expressionToString(e.right))}`;
                        }
                    } else { // cmp === 1
                        res1 += `${expressionToString(e.right)}`;
                    }
                    break;
                default:
                    res1 += `${expressionToString(e.right)}`;
            }
            return res1;
        }

            /*
            if (e.left.tag === "ConditionalExpression") {
                res1 = `${parens(expressionToString(e.left))} ${e.operator} `;

            } else if (e.left.tag === "LogicalExpression" || e.left.tag === "BinaryExpression") {
                const cmp = cmpPrecedence(e.left.operator, e.operator);
                if (cmp === -1) { 
                    res1 = `${parens(expressionToString(e.left))} ${e.operator} `;

                // specifically add parens for || and && which can be confusing, and for other edge cases
                } else if (cmp === 0) { 
                    const left: string = e.left.operator;
                    if ((left === "&&" && e.operator === "||") ||
                        (left === "||" && e.operator === "&&") ||
                        ((left === "==" || left === "!=") && 
                        (e.operator === "==" || e.operator === "!=")))
                    {
                        res1 = `${parens(expressionToString(e.left))} ${e.operator} `; 
                    } else {
                        res1 = `${expressionToString(e.left)} ${e.operator} `; 
                    }

                } else { // cmp === 1
                    res1 = `${expressionToString(e.left)} ${e.operator} `;
                }

            } else {
                res1 = `${expressionToString(e.left)} ${e.operator} `;
            }
            
            if (e.right.tag === "ConditionalExpression") {
                res1 += `${parens(expressionToString(e.right))}`;

            } else if (e.right.tag === "LogicalExpression" || e.right.tag === "BinaryExpression") {
                const cmp = cmpPrecedence(e.right.operator, e.operator);
                if (cmp === -1) {
                    res1 += `${parens(expressionToString(e.right))}`;

                } else if (cmp === 0) {
                    if (e.right.operator === e.operator &&
                        (e.right.operator === "+" || e.right.operator === "*" || e.right.operator === "|" ||
                         e.right.operator === "&" || e.right.operator === "^"))
                    {
                        res1 += `${expressionToString(e.right)}`;
                    } else {
                        res1 += `${parens(expressionToString(e.right))}`;
                    }

                } else {
                    res1 += `${expressionToString(e.right)}`;
                }

            } else {
                res1 += `${expressionToString(e.right)}`;
            }

            return res1;
*/
        case "Identifier":
            return e.name;    

        case "StructMemberExpression":
            return `${expressionToString(e.object)}${e.deref ? "->" : "."}${e.field.name}`;

        case "CallExpression":
            return `${e.callee.name}(${(e.arguments.map(x => expressionToString(x))).join(', ')})`;
        
        case "IndirectCallExpression":
            return `(*${expressionToString(e.callee)})(${(e.arguments.map(x => expressionToString(x))).join(', ')})`; 

        case "CastExpression":
            switch (e.argument.tag) {
                case "LogicalExpression":
                case "BinaryExpression":
                case "ConditionalExpression":
                    return `(${typeToString(e.kind)})${parens(expressionToString(e.argument))}`;
                default:
                    return `(${typeToString(e.kind)})${expressionToString(e.argument)}`;
            }
        
        case "UnaryExpression":
            switch (e.argument.tag) {
                case "LogicalExpression":
                case "BinaryExpression":
                case "ConditionalExpression":
                    return `${e.operator}${parens(expressionToString(e.argument))}`;
                default:
                    return `${e.operator}${expressionToString(e.argument)}`;
            }

        case "ConditionalExpression": {
            let res2: string;
            if (e.test.tag === "ConditionalExpression") res2 = `${parens(expressionToString(e.test))} ? `;
            else res2 = `${expressionToString(e.test)} ? `;

            if (e.consequent.tag === "ConditionalExpression") res2 += `${parens(expressionToString(e.consequent))} : `
            else res2 += `${expressionToString(e.consequent)} : `;

            if (e.alternate.tag === "ConditionalExpression") res2 += `${parens(expressionToString(e.alternate))}`;
            else res2 += `${expressionToString(e.alternate)}`;
            
            return res2; 
        }

        case "ResultExpression":
            return '\\result';

        case "LengthExpression":
            return `\\length(${expressionToString(e.argument)})`;

        case "HasTagExpression":
            return `\\hastag(${typeToString(e.kind)}, ${expressionToString(e.argument)})`;

        case "IntLiteral":
        case "StringLiteral":
        case "CharLiteral":
            return e.raw;

        case "BoolLiteral":
            return e.value.toString();

        case "NullLiteral":
            return 'NULL';
        default:
            throw new Error(`Expression-to-string not yet implemented for: ${JSON.stringify(e)}`);
    }
}

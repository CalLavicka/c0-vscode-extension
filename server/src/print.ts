import * as ast from "./ast";
import { ConnectionStrategy } from "vscode-languageserver";

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

export function parens(s: string): string {
    return `(${s})`;
}

export function expressionToString(e: ast.Expression): string {
    switch (e.tag) {
        case "AllocArrayExpression": // 1
            return `alloc_array(${typeToString(e.kind)}, ${expressionToString(e.argument)})`;
        case "AllocExpression": // 1
            return `alloc(${typeToString(e.kind)})`;

        case "ArrayMemberExpression": // 1
            return `${expressionToString(e.object)}[${expressionToString(e.index)}]`;
    
        // 3-12 
        case "LogicalExpression":
        case "BinaryExpression":
            // Place parenthesis for safety
            return `${expressionToString(e.left)} ${e.operator} ${expressionToString(e.right)}`;  

        case "Identifier": // n/a
            return e.name;    

        case "StructMemberExpression": // 1
            return `${expressionToString(e.object)}${e.deref ? "->" : "."}${e.field.name}`;

        case "CallExpression": // 1
            return `${e.callee.name}(${(e.arguments.map(x => expressionToString(x))).join(', ')})`;
        
        case "IndirectCallExpression": // 2
            return `(*${expressionToString(e.callee)})(${(e.arguments.map(x => expressionToString(x))).join(', ')})`; 

        case "CastExpression": // 2
            switch (e.argument.tag) {
                case "LogicalExpression":
                case "BinaryExpression":
                case "ConditionalExpression":
                    return `(${typeToString(e.kind)})${parens(expressionToString(e.argument))}`;
                default:
                    return `(${typeToString(e.kind)})${expressionToString(e.argument)}`;
            }
        
        case "UnaryExpression": // 2
            switch (e.argument.tag) {
                case "LogicalExpression":
                case "BinaryExpression":
                case "ConditionalExpression":
                    return `${e.operator}${parens(expressionToString(e.argument))}`;
                default:
                    return `${e.operator}${expressionToString(e.argument)}`;
            }

        case "ConditionalExpression": // 13
            let res: string;
            if (e.test.tag === "ConditionalExpression") res = `${parens(expressionToString(e.test))} ? `;
            else res = `${expressionToString(e.test)} ? `;

            if (e.consequent.tag === "ConditionalExpression") res += `${parens(expressionToString(e.consequent))} : `
            else res += `${expressionToString(e.consequent)} : `;

            if (e.alternate.tag === "ConditionalExpression") res += `${parens(expressionToString(e.alternate))}`;
            else res += `${expressionToString(e.alternate)}`;
            
            return res; // should not need parens when binary cases is added

        case "ResultExpression": // n/a
            return '\\result';

        case "LengthExpression": // n/a
            return `\\length(${expressionToString(e.argument)})`;

        case "HasTagExpression": // n/a
            return `\\hastag(${typeToString(e.kind)}, ${expressionToString(e.argument)})`;

        case "IntLiteral": // n/a
        case "StringLiteral":
        case "CharLiteral":
            return e.raw;

        case "BoolLiteral":  // n/a
            return e.value.toString();

        case "NullLiteral":  // n/a
            return 'NULL';
        default:
            throw new Error(`Expression-to-string not yet implemented for: ${JSON.stringify(e)}`);
    }
}

import * as ast from "./ast";

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

export function expressionToString(e: ast.Expression): string {
    switch (e.tag) {
        case "AllocArrayExpression":
            return `alloc_array(${typeToString(e.kind)}, ${expressionToString(e.argument)})`;
        case "AllocExpression":
            return `alloc(${typeToString(e.kind)})`;

        case "ArrayMemberExpression":
            return `${expressionToString(e.object)}[${expressionToString(e.index)}]`;
    
        case "LogicalExpression":
        case "BinaryExpression":
            // Place parenthesis for safety
            return `(${expressionToString(e.left)} ${e.operator} ${expressionToString(e.right)})`;  

        case "Identifier":
            return e.name;    

        case "StructMemberExpression":
            return `${expressionToString(e.object)}${e.deref ? "->" : "."}${e.field.name}`;

        case "CallExpression":
            return `${e.callee.name}(${(e.arguments.map(x => expressionToString(x))).join(', ')})`;
        
        case "IndirectCallExpression":
            return `(*${expressionToString(e.callee)})(${(e.arguments.map(x => expressionToString(x))).join(', ')})`; 

        case "CastExpression":
            return `((${typeToString(e.kind)})${expressionToString(e.argument)})`;
        
        case "UnaryExpression":
            return `(${e.operator}${expressionToString(e.argument)})`;

        case "ConditionalExpression":
            return `(${expressionToString(e.test)} ? ${expressionToString(e.consequent)} : ${expressionToString(e.alternate)})`;

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

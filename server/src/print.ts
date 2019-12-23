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
    
        case "BinaryExpression":
            // Place parenthesis for safety
            return `(${expressionToString(e.left)} ${e.operator} ${expressionToString(e.right)})`;

        case "Identifier":
            return e.name;    

        // TODO: fill in the other cases for this method 
        case "StructMemberExpression":
            return `${expressionToString(e.object)}${e.deref ? "->" : "."}${e.field.name}`;
        default:
            throw new Error(`Expression-to-string not yet implemented for: ${JSON.stringify(e)}`);
    }
}

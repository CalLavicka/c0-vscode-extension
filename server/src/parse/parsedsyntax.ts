/**
 * Internal representation: the parsed syntax for C0/C1
 *
 * This file describes exactly the syntax that gets parsed by the parser.
 * It is therefore very sensitive to changes in the parser; it should not
 * be relied upon for anything else, and may change between minor and
 * patch versions.
 *
 * The only producer of these types is parse-util.ts. The only consumer of
 * these types is restrictsyntax.ts. The structure of this file should match
 * ast.ts as much as practical.
 */

 /*
  * (This file is being used in generating code completions now (c0Completions.ts))
  */

import * as ast from "../ast";

export interface Syn {
    readonly tag: string;
    readonly loc: ast.SourceLocation;
}

export type Identifier = ast.Identifier & Syn;

export type Type =
    | IntType
    | BoolType
    | StringType
    | CharType
    | VoidType
    | PointerType
    | ArrayType
    | StructType
    | Identifier;

export type IntType = ast.IntType & Syn;
export type BoolType = ast.BoolType & Syn;
export type StringType = ast.StringType & Syn;
export type CharType = ast.CharType & Syn;
export type VoidType = ast.VoidType & Syn;

export interface PointerType extends Syn {
    readonly tag: "PointerType";
    readonly argument: Type;
}

export interface ArrayType extends Syn {
    readonly tag: "ArrayType";
    readonly argument: Type;
}

export interface StructType extends Syn {
    readonly tag: "StructType";
    readonly id: Identifier;
}

export type Expression =
    | Identifier
    | IntLiteral
    | StringLiteral
    | CharLiteral
    | BoolLiteral
    | NullLiteral
    | ArrayMemberExpression
    | StructMemberExpression
    | CallExpression
    | IndirectCallExpression
    | CastExpression
    | UnaryExpression
    | BinaryExpression
    | LogicalExpression
    | ConditionalExpression
    | AllocExpression
    | AllocArrayExpression
    | ResultExpression
    | LengthExpression
    | HasTagExpression
    | AssignmentExpression
    | UpdateExpression
    | AssertExpression
    | ErrorExpression;

export interface IntLiteral extends Syn {
    readonly tag: "IntLiteral";
    readonly raw: string;
}

export interface StringLiteral extends Syn {
    readonly tag: "StringLiteral";
    readonly raw: string[];
}

export interface CharLiteral extends Syn {
    readonly tag: "CharLiteral";
    readonly raw: string;
}

export type BoolLiteral = ast.BoolLiteral & Syn;
export type NullLiteral = ast.NullLiteral & Syn;

export interface ArrayMemberExpression extends Syn {
    readonly tag: "ArrayMemberExpression";
    readonly object: Expression;
    readonly index: Expression;
}

export interface StructMemberExpression extends Syn {
    readonly tag: "StructMemberExpression";
    readonly deref: boolean;
    readonly object: Expression;
    readonly field: Identifier;
}

export interface CallExpression extends Syn {
    readonly tag: "CallExpression";
    readonly callee: Identifier;
    readonly arguments: Expression[];
}

export interface IndirectCallExpression extends Syn {
    readonly tag: "IndirectCallExpression";
    readonly callee: Expression;
    readonly arguments: Expression[];
}

export interface CastExpression extends Syn {
    readonly tag: "CastExpression";
    readonly kind: Type;
    readonly argument: Expression;
}

export interface UnaryExpression extends Syn {
    readonly tag: "UnaryExpression";
    readonly operator: "&" | "!" | "~" | "-" | "*";
    readonly argument: Expression;
}

/**
 * Eager binary operations `e+e` and friends
 */
export interface BinaryExpression extends Syn {
    readonly tag: "BinaryExpression";
    readonly operator:
        | "*"
        | "/"
        | "%"
        | "+"
        | "-"
        | "<<"
        | ">>"
        | "<"
        | "<="
        | ">="
        | ">"
        | "=="
        | "!="
        | "&"
        | "^"
        | "|";
    readonly left: Expression;
    readonly right: Expression;
}

export interface LogicalExpression extends Syn {
    readonly tag: "LogicalExpression";
    readonly operator: "||" | "&&";
    readonly left: Expression;
    readonly right: Expression;
}

export interface ConditionalExpression extends Syn {
    readonly tag: "ConditionalExpression";
    readonly test: Expression;
    readonly consequent: Expression;
    readonly alternate: Expression;
}

export interface AllocExpression extends Syn {
    readonly tag: "AllocExpression";
    readonly kind: Type;
}

export interface AllocArrayExpression extends Syn {
    readonly tag: "AllocArrayExpression";
    readonly kind: Type;
    readonly size: Expression;
}

export interface ResultExpression extends Syn {
    readonly tag: "ResultExpression";
}

export interface LengthExpression extends Syn {
    readonly tag: "LengthExpression";
    readonly argument: Expression;
}

export interface HasTagExpression extends Syn {
    readonly tag: "HasTagExpression";
    readonly kind: Type;
    readonly argument: Expression;
}

export interface AssignmentExpression extends Syn {
    readonly tag: "AssignmentExpression";
    readonly operator: "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";
    readonly left: Expression;
    readonly right: Expression;
}

export interface UpdateExpression extends Syn {
    readonly tag: "UpdateExpression";
    readonly operator: "++" | "--";
    readonly argument: Expression;
}

export interface AssertExpression extends Syn {
    readonly tag: "AssertExpression";
    readonly test: Expression;
}

export interface ErrorExpression extends Syn {
    readonly tag: "ErrorExpression";
    readonly argument: Expression;
}

export type BreakStatement = ast.BreakStatement & Syn;
export type ContinueStatement = ast.ContinueStatement & Syn;

export type Statement =
    | AnnoStatement
    | ExpressionStatement
    | VariableDeclaration
    | IfStatement
    | WhileStatement
    | ForStatement
    | ReturnStatement
    | BlockStatement
    | BreakStatement
    | ContinueStatement;

export interface AnnoStatement extends Syn {
    readonly tag: "AnnoStatement";
    readonly anno: "requires" | "ensures" | "loop_invariant" | "assert";
    readonly test: Expression;
}

export interface ExpressionStatement extends Syn {
    readonly tag: "ExpressionStatement";
    readonly expression: Expression;
}

export interface VariableDeclaration extends Syn {
    readonly tag: "VariableDeclaration";
    readonly kind: Type;
    readonly id: Identifier;
    readonly init: Expression | null;
}

export interface IfStatement extends Syn {
    readonly tag: "IfStatement";
    readonly test: Expression;
    readonly consequent: [AnnoStatement[], Statement];
    readonly alternate?: [AnnoStatement[], Statement];
}

export interface WhileStatement extends Syn {
    readonly tag: "WhileStatement";
    readonly test: Expression;
    readonly body: [AnnoStatement[], Statement];
}

export interface ForStatement extends Syn {
    readonly tag: "ForStatement";
    readonly init: VariableDeclaration | ExpressionStatement | null;
    readonly test: Expression;
    readonly update: Expression | null;
    readonly body: [AnnoStatement[], Statement];
}

export interface ReturnStatement extends Syn {
    readonly tag: "ReturnStatement";
    readonly argument: Expression | null;
}

export interface BlockStatement extends Syn {
    readonly tag: "BlockStatement";
    readonly body: Statement[];
}

export type Declaration = 
    | FunctionDeclaration 
    | StructDeclaration 
    | TypeDefinition 
    | FunctionTypeDefinition
    | PragmaUseLib 
    | PragmaUseFile
    | PragmaUnknown
    | CapturedComment;

export interface VariableDeclarationOnly extends Syn {
    readonly tag: "VariableDeclaration";
    readonly kind: Type;
    readonly id: Identifier;
}

export interface StructDeclaration extends Syn {
    readonly tag: "StructDeclaration";
    readonly id: Identifier;
    readonly definitions: null | VariableDeclarationOnly[];
}

export interface FunctionDeclaration extends Syn {
    readonly tag: "FunctionDeclaration";
    readonly returns: Type;
    readonly id: Identifier;
    readonly params: VariableDeclarationOnly[];
    readonly annos: AnnoStatement[];
    readonly body: null | BlockStatement;
}

export interface TypeDefinition extends Syn {
    readonly tag: "TypeDefinition";
    readonly definition: VariableDeclarationOnly;
}

export interface FunctionTypeDefinition extends Syn {
    readonly tag: "FunctionTypeDefinition";
    readonly definition: FunctionDeclaration & { body: null };
}

export interface PragmaUseLib extends Syn {
    readonly tag: "PragmaUseLib";
    readonly name: string;
}

export interface PragmaUseFile extends Syn {
    readonly tag: "PragmaUseFile";
    readonly path: string;
}

export interface PragmaUnknown extends Syn {
    readonly tag: "PragmaUnknown";
    readonly text: string;
}

export const enum CommentType { Line, Block }

export interface CapturedComment extends Syn {
    readonly tag: "CapturedComment";
    readonly type: CommentType;
    readonly text: string;
}

# Parses a superset of C1 top-level declarations
#
# Shamelessly stolen from https://github.com/calculemuscode/jaco/
@preprocessor typescript

@lexer lexer
@include "./expression.ne"
@include "./statement.ne"

Program     -> _GlobalDecl:* __ {% x => x[0] %}

_GlobalDecl -> __ GlobalDecl {% x => x[1] %}
GlobalDecl  -> %pragma {% util.PragmaDeclaration %}
             | MultiComment {% id %}
             | "struct" _ StructName _ ";" {% util.StructDeclaration %}
             | "struct" _ StructName _ "{" _ (Tp _ FieldName _ ";" _):* "}" _ ";"
                                           {% util.StructDefinition %}
             | Tp _ Identifier _ "(" FunDeclArgs ")" _Annos _ FunDeclEnd
                                           {% util.FunctionDeclaration %}
             | "typedef" _ Tp _ Identifier # Omits trailing semicolon
                                           {% util.TypeDefinition %}
             | "typedef" _ Tp _ Identifier _ "(" FunDeclArgs ")" _Annos # Also omits trailing semicolon
                                           {% util.FunctionTypeDefinition %}

FunDeclArgs -> _ (Tp _ Identifier _ ("," _ Tp _ Identifier _):*):? {% util.FunctionDeclarationArgs %}
FunDeclEnd -> ";"                          {% x => null %}
FunDeclEnd -> BlockStatement               {% id %}
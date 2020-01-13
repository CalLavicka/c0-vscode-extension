# Parses a not-especially-principled superset of C1 expressions and types, assuming a lexer
# that can disambiguate regular identifiers (%identifier) from typedef'ed identifiers
# (%type_identifier).
#
# Nearley doesn't support operator precedence, so this uses the (I think pretty standard)
# trick of having a deep fall-through set of cases, one for each level of operator precedence.
#
# e++ and e-- are parsed as expressions, even though they are statements in C0; this causes
# *e++ to with the correct precedence as *(e++)
#
# e1 = e2 is also parsed as an expression, mostly to give better error messages for 
# "if (e1 = e2)" bugs
#
# Shamelessly stolen from https://github.com/calculemuscode/jaco/
@preprocessor typescript
@{%
const lexer = require('./lex').lexer;
const util = require('./parse/nearley-helper');
%}

@lexer lexer

Expression     -> Exp0 {% id %}

Identifier     -> %identifier {% util.Identifier %}
TypeIdentifier -> %type_identifier {% util.Identifier %}
StructName     -> %identifier {% util.Identifier %} | %type_identifier {% util.Identifier %}
FieldName      -> %identifier {% util.Identifier %} | %type_identifier {% util.Identifier %}

Unop           -> "!" | "~" | "-" | "*" | "&" | "(" _ Tp _ ")"
BinopB         -> "*" | "/" | "%"
BinopA         -> "+" | "-"
Binop9         -> "<" "<" | ">" ">"
Binop8         -> "<" | "<" "=" | ">" "=" | ">"
Binop7         -> "=" "=" | "!" "="
Binop6         -> "&"
Binop5         -> "^"
Binop4         -> "|"
Binop3         -> "&&"
Binop2         -> "|" "|"
Binop1         -> "?"
Binop0         -> "=" | "+" "=" | "-" "=" | "*" "=" | "/" "=" | "%" "="
                | "&" "=" | "^" "=" | "|" "=" | "<" "<" "=" | ">" ">" "="

ExpD           -> "(" _ Expression _ ")"                              {% x => x[2] %}
                | %numeric_literal                                    {% util.IntLiteral %}
                | StringLiteral                                       {% util.StringLiteral %}
                | CharLiteral                                         {% util.CharLiteral %}
                | "true"                                              {% util.BoolLiteral %}
                | "false"                                             {% util.BoolLiteral %}
                | "NULL"                                              {% util.NullLiteral %}
                | Identifier                                          {% id %}
                | Identifier _ "(" Funargs ")"                        {% util.CallExpression %}
                | ExpD _ "." _ FieldName                              {% util.StructMemberExpression %}
                | ExpD _ ("-" ">") _ FieldName                        {% util.StructMemberExpression %}
                | ExpD _ "[" _ Expression _ "]"                       {% util.ArrayMemberExpression %}
                | ExpD _ ("++" | "--")                                {% util.UpdateExpression %}
                | "alloc" _ "(" _ Tp _ ")"                            {% util.AllocExpression %}
                | "alloc_array" _ "(" _ Tp _ "," _ Expression _ ")"   {% util.AllocArrayExpression %}
                | "assert" _ "(" _ Expression _ ")"                   {% util.AssertExpression %}
                | "error" _ "(" _ Expression _ ")"                    {% util.ErrorExpression %}
                | "\\" "result"                                       {% util.ResultExpression %}
                | "\\" "length" _ "(" _ Expression _ ")"              {% util.LengthExpression %}
                | "\\" "hastag" _ "(" _ Tp _ "," _ Expression _ ")"   {% util.HasTagExpression %}
                | "(" _ "*" _ Expression _ ")" _ "(" Funargs ")"      {% util.IndirectCallExpression %}
ExpC           -> ExpD {% id %} | Unop _ ExpC                         {% util.UnaryExpression %}
ExpB           -> ExpC {% id %} | ExpB _ BinopB _ ExpC                {% util.BinaryExpression %}
ExpA           -> ExpB {% id %} | ExpA _ BinopA _ ExpB                {% util.BinaryExpression %}
Exp9           -> ExpA {% id %} | Exp9 _ Binop9 _ ExpA                {% util.BinaryExpression %}
Exp8           -> Exp9 {% id %} | Exp8 _ Binop8 _ Exp9                {% util.BinaryExpression %}
Exp7           -> Exp8 {% id %} | Exp7 _ Binop7 _ Exp8                {% util.BinaryExpression %}
Exp6           -> Exp7 {% id %} | Exp6 _ Binop6 _ Exp7                {% util.BinaryExpression %}
Exp5           -> Exp6 {% id %} | Exp5 _ Binop5 _ Exp6                {% util.BinaryExpression %}
Exp4           -> Exp5 {% id %} | Exp4 _ Binop4 _ Exp5                {% util.BinaryExpression %}
Exp3           -> Exp4 {% id %} | Exp3 _ Binop3 _ Exp4                {% util.BinaryExpression %}
Exp2           -> Exp3 {% id %} | Exp2 _ Binop2 _ Exp3                {% util.BinaryExpression %}
Exp1           -> Exp2 {% id %} | Exp2 _ Binop1 _ Expression _ ":" _ Exp1 {% util.ConditionalExpression %}
Exp0           -> Exp1 {% id %} | Exp1 _ Binop0 _ Exp0                {% util.BinaryExpression %}

Funargs        -> _ (Expression (_ "," _ Expression):* _):?

Tp             -> "int"                                               {% util.IntType %}
                | "bool"                                              {% util.BoolType %}  
                | "string"                                            {% util.StringType %}  
                | "char"                                              {% util.CharType %}  
                | "void"                                              {% util.VoidType %}
                | Tp _ "*"                                            {% util.PointerType %}
                | Tp _ "[" _ "]"                                      {% util.ArrayType %}
                | "struct" _ StructName                               {% util.StructType %}
                | TypeIdentifier                                      {% id %}

StringLiteral  -> %string_delimiter (%special_character | %characters):* %string_delimiter
CharLiteral    -> %char_delimiter (%special_character | %character) %char_delimiter

# Regular whitespace, skips comments
_              -> (%whitespace | %newline | %annospace | LineComment | MultiComment):*
# Whitespace which doesn't skip comments, allows capturing 
__             -> (%whitespace | %newline | %annospace):* 
LineComment    -> %comment_line_start %comment:* %comment_line_end {% util.LineComment %}
MultiComment   -> %comment_start (%comment | %newline | MultiComment):* %comment_end {% util.MultiComment %}
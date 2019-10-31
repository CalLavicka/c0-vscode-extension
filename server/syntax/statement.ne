# Parses a not-especially-principled superset of C1 statements
#
# Shamelessly stolen from https://github.com/calculemuscode/jaco/
@preprocessor typescript
@lexer lexer
@include "./expression.ne"

Top -> (_ Statement):* _Annos _ Simple _ {% util.TopSimple %} 
     | (_ Statement):+ _Annos _          {% util.TopStatement %}
#    | (_ AnnoSet):+ _                   {% util.TopAnnos <- todo write this %}

Simple         -> Tp _ Identifier (_ "=" _ Expression):?
                | Expression                                {% id %}

BlockStatement -> "{" (_ Statement):* _Annos _ "}"          {% util.BlockStatement %}

# A single annotation is a keyword, an expression, and a semicolon
Anno_          -> ("loop_invariant" | "assert" | "requires" | "ensures") _ Expression _ ";" _
                                                            {% util.Anno %}

# Annotations are grouped and surrounded either by /*@ ... @*/ or //@ ... \n delimiters
# Annotations can include normal comments of their own; 
# it makes the lexer's life easier if we deal with //@ ... // ... \n here as a special case
AnnoSet        -> %anno_start _ Anno_:* %anno_end           {% util.AnnoSet %}
                | %anno_line_start _ Anno_:* %anno_end      {% util.AnnoSet %}
                | %anno_line_start _ Anno_:* %comment_line_start %comment:* %comment_line_end
                                                            {% util.AnnoSet %}

# It's helpful to have a shorthand for "Annotations that capture the space before them"
# as well as "Annotations that capture the space after them"
Annos_         -> (AnnoSet _):*                             {% x => x[0].reduce((xs: { concat: (arg0: any) => void; }, y: any[]) => xs.concat(y[0]), []) %}
_Annos         -> (_ AnnoSet):*                             {% x => x[0].reduce((xs: { concat: (arg0: any) => void; }, y: any[]) => xs.concat(y[1]), []) %}
        
# Statements turn out to be tricky when we're not using a shift-reduce parser!
# Shift-reduce parsers have a built-in way of handling the parsing C's grammer, a grammar that
# is ambiguous when we write it down in a "normal" way:
#
#   if (a) if (b) {} else if (c) {}
#          ****** --      ****** -- <- it's like this (but why?)
#   ****** --------- **** ---------
#              
#                         ****** -- <- and not like this (how do we make sure)
#          ****** -- **** ---------
#   ****** ------------------------
#
# The way shift-reduce parsers handle this is to prefer shifting the "else" token onto a stack
# rather than reducing the "if (b) {}" on the top of the stack to a standalone statement
# when the grammar given says either is allowed.
#
# English specifications usually tell humans to associate the "else" with the "if" that is
# closest to it, but that's not an intuition that carries over to EBNF grammars. We can get closer to
# a working definition if we say that when we write "if (e) S1 else S2", the S1 parse can only contain
# an else-less if when the else-is if lives inside of curly braces.

Statement         -> (Annos_ StatementPrefix):* Annos_ (StatementEnd | DanglingIf)  {% util.Statement %}
StatementNoDangle -> (Annos_ StatementPrefix):* Annos_ (StatementEnd)               {% util.Statement %}

StatementPrefix -> "if" _ "(" _ Expression _ ")" _ StatementNoDangle _ "else" _     {% util.IfElse %}
                 | "while" _ "(" _ Expression _ ")" _                               {% util.While %}
                 | "for" _ "(" (_ Simple):? _ ";" _ Expression _ ";" (_ Expression):? _ ")" _ {% util.For %}

DanglingIf     -> "if" _ "(" _ Expression _ ")" _ Statement      {% util.IfStatement %}
StatementEnd   -> Simple _ ";"                                   {% util.SimpleStatement %}
                | "return" (_ Expression):? _ ";"                {% util.ReturnStatement %}
                | BlockStatement                                 {% id %}
                | "break" _ ";"                                  {% util.BreakStatement %}
                | "continue" _ ";"                               {% util.ContinueStatement %}
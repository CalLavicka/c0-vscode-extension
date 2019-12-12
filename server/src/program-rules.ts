// Generated automatically by nearley, version 2.19.0
// http://github.com/Hardmath123/nearley
// Bypasses TS6133. Allow declared but unused functions.
// @ts-ignore
function id(d: any[]): any { return d[0]; }
declare var identifier: any;
declare var type_identifier: any;
declare var numeric_literal: any;
declare var string_delimiter: any;
declare var special_character: any;
declare var characters: any;
declare var char_delimiter: any;
declare var character: any;
declare var whitespace: any;
declare var newline: any;
declare var annospace: any;
declare var comment_line_start: any;
declare var comment: any;
declare var comment_line_end: any;
declare var comment_start: any;
declare var comment_end: any;
declare var anno_start: any;
declare var anno_end: any;
declare var anno_line_start: any;
declare var comment_line_start: any;
declare var comment: any;
declare var comment_line_end: any;
declare var pragma: any;

const lexer = require('./lex').lexer;
const util = require('./parse/nearley-helper');

interface NearleyToken {  value: any;
  [key: string]: any;
};

interface NearleyLexer {
  reset: (chunk: string, info: any) => void;
  next: () => NearleyToken | undefined;
  save: () => any;
  formatError: (token: NearleyToken) => string;
  has: (tokenType: string) => boolean;
};

interface NearleyRule {
  name: string;
  symbols: NearleySymbol[];
  postprocess?: (d: any[], loc?: number, reject?: {}) => any;
};

type NearleySymbol = string | { literal: any } | { test: (token: any) => boolean };

interface Grammar {
  Lexer: NearleyLexer | undefined;
  ParserRules: NearleyRule[];
  ParserStart: string;
};

const grammar: Grammar = {
  Lexer: lexer,
  ParserRules: [
    {"name": "Expression", "symbols": ["Exp0"], "postprocess": id},
    {"name": "Identifier", "symbols": [(lexer.has("identifier") ? {type: "identifier"} : identifier)], "postprocess": util.Identifier},
    {"name": "TypeIdentifier", "symbols": [(lexer.has("type_identifier") ? {type: "type_identifier"} : type_identifier)], "postprocess": util.Identifier},
    {"name": "StructName", "symbols": [(lexer.has("identifier") ? {type: "identifier"} : identifier)], "postprocess": util.Identifier},
    {"name": "StructName", "symbols": [(lexer.has("type_identifier") ? {type: "type_identifier"} : type_identifier)], "postprocess": util.Identifier},
    {"name": "FieldName", "symbols": [(lexer.has("identifier") ? {type: "identifier"} : identifier)], "postprocess": util.Identifier},
    {"name": "FieldName", "symbols": [(lexer.has("type_identifier") ? {type: "type_identifier"} : type_identifier)], "postprocess": util.Identifier},
    {"name": "Unop", "symbols": [{"literal":"!"}]},
    {"name": "Unop", "symbols": [{"literal":"~"}]},
    {"name": "Unop", "symbols": [{"literal":"-"}]},
    {"name": "Unop", "symbols": [{"literal":"*"}]},
    {"name": "Unop", "symbols": [{"literal":"&"}]},
    {"name": "Unop", "symbols": [{"literal":"("}, "_", "Tp", "_", {"literal":")"}]},
    {"name": "BinopB", "symbols": [{"literal":"*"}]},
    {"name": "BinopB", "symbols": [{"literal":"/"}]},
    {"name": "BinopB", "symbols": [{"literal":"%"}]},
    {"name": "BinopA", "symbols": [{"literal":"+"}]},
    {"name": "BinopA", "symbols": [{"literal":"-"}]},
    {"name": "Binop9", "symbols": [{"literal":"<"}, {"literal":"<"}]},
    {"name": "Binop9", "symbols": [{"literal":">"}, {"literal":">"}]},
    {"name": "Binop8", "symbols": [{"literal":"<"}]},
    {"name": "Binop8", "symbols": [{"literal":"<"}, {"literal":"="}]},
    {"name": "Binop8", "symbols": [{"literal":">"}, {"literal":"="}]},
    {"name": "Binop8", "symbols": [{"literal":">"}]},
    {"name": "Binop7", "symbols": [{"literal":"="}, {"literal":"="}]},
    {"name": "Binop7", "symbols": [{"literal":"!"}, {"literal":"="}]},
    {"name": "Binop6", "symbols": [{"literal":"&"}]},
    {"name": "Binop5", "symbols": [{"literal":"^"}]},
    {"name": "Binop4", "symbols": [{"literal":"|"}]},
    {"name": "Binop3", "symbols": [{"literal":"&&"}]},
    {"name": "Binop2", "symbols": [{"literal":"|"}, {"literal":"|"}]},
    {"name": "Binop1", "symbols": [{"literal":"?"}]},
    {"name": "Binop0", "symbols": [{"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":"+"}, {"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":"-"}, {"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":"*"}, {"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":"/"}, {"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":"%"}, {"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":"&"}, {"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":"^"}, {"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":"|"}, {"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":"<"}, {"literal":"<"}, {"literal":"="}]},
    {"name": "Binop0", "symbols": [{"literal":">"}, {"literal":">"}, {"literal":"="}]},
    {"name": "ExpD", "symbols": [{"literal":"("}, "_", "Expression", "_", {"literal":")"}], "postprocess": x => x[2]},
    {"name": "ExpD", "symbols": [(lexer.has("numeric_literal") ? {type: "numeric_literal"} : numeric_literal)], "postprocess": util.IntLiteral},
    {"name": "ExpD", "symbols": ["StringLiteral"], "postprocess": util.StringLiteral},
    {"name": "ExpD", "symbols": ["CharLiteral"], "postprocess": util.CharLiteral},
    {"name": "ExpD", "symbols": [{"literal":"true"}], "postprocess": util.BoolLiteral},
    {"name": "ExpD", "symbols": [{"literal":"false"}], "postprocess": util.BoolLiteral},
    {"name": "ExpD", "symbols": [{"literal":"NULL"}], "postprocess": util.NullLiteral},
    {"name": "ExpD", "symbols": ["Identifier"], "postprocess": id},
    {"name": "ExpD", "symbols": ["Identifier", "_", {"literal":"("}, "Funargs", {"literal":")"}], "postprocess": util.CallExpression},
    {"name": "ExpD", "symbols": ["ExpD", "_", {"literal":"."}, "_", "FieldName"], "postprocess": util.StructMemberExpression},
    {"name": "ExpD$subexpression$1", "symbols": [{"literal":"-"}, {"literal":">"}]},
    {"name": "ExpD", "symbols": ["ExpD", "_", "ExpD$subexpression$1", "_", "FieldName"], "postprocess": util.StructMemberExpression},
    {"name": "ExpD", "symbols": ["ExpD", "_", {"literal":"["}, "_", "Expression", "_", {"literal":"]"}], "postprocess": util.ArrayMemberExpression},
    {"name": "ExpD$subexpression$2", "symbols": [{"literal":"++"}]},
    {"name": "ExpD$subexpression$2", "symbols": [{"literal":"--"}]},
    {"name": "ExpD", "symbols": ["ExpD", "_", "ExpD$subexpression$2"], "postprocess": util.UpdateExpression},
    {"name": "ExpD", "symbols": [{"literal":"alloc"}, "_", {"literal":"("}, "_", "Tp", "_", {"literal":")"}], "postprocess": util.AllocExpression},
    {"name": "ExpD", "symbols": [{"literal":"alloc_array"}, "_", {"literal":"("}, "_", "Tp", "_", {"literal":","}, "_", "Expression", "_", {"literal":")"}], "postprocess": util.AllocArrayExpression},
    {"name": "ExpD", "symbols": [{"literal":"assert"}, "_", {"literal":"("}, "_", "Expression", "_", {"literal":")"}], "postprocess": util.AssertExpression},
    {"name": "ExpD", "symbols": [{"literal":"error"}, "_", {"literal":"("}, "_", "Expression", "_", {"literal":")"}], "postprocess": util.ErrorExpression},
    {"name": "ExpD", "symbols": [{"literal":"\\"}, {"literal":"result"}], "postprocess": util.ResultExpression},
    {"name": "ExpD", "symbols": [{"literal":"\\"}, {"literal":"length"}, "_", {"literal":"("}, "_", "Expression", "_", {"literal":")"}], "postprocess": util.LengthExpression},
    {"name": "ExpD", "symbols": [{"literal":"\\"}, {"literal":"hastag"}, "_", {"literal":"("}, "_", "Tp", "_", {"literal":","}, "_", "Expression", "_", {"literal":")"}], "postprocess": util.HasTagExpression},
    {"name": "ExpD", "symbols": [{"literal":"("}, "_", {"literal":"*"}, "_", "Expression", "_", {"literal":")"}, "_", {"literal":"("}, "Funargs", {"literal":")"}], "postprocess": util.IndirectCallExpression},
    {"name": "ExpC", "symbols": ["ExpD"], "postprocess": id},
    {"name": "ExpC", "symbols": ["Unop", "_", "ExpC"], "postprocess": util.UnaryExpression},
    {"name": "ExpB", "symbols": ["ExpC"], "postprocess": id},
    {"name": "ExpB", "symbols": ["ExpB", "_", "BinopB", "_", "ExpC"], "postprocess": util.BinaryExpression},
    {"name": "ExpA", "symbols": ["ExpB"], "postprocess": id},
    {"name": "ExpA", "symbols": ["ExpA", "_", "BinopA", "_", "ExpB"], "postprocess": util.BinaryExpression},
    {"name": "Exp9", "symbols": ["ExpA"], "postprocess": id},
    {"name": "Exp9", "symbols": ["Exp9", "_", "Binop9", "_", "ExpA"], "postprocess": util.BinaryExpression},
    {"name": "Exp8", "symbols": ["Exp9"], "postprocess": id},
    {"name": "Exp8", "symbols": ["Exp8", "_", "Binop8", "_", "Exp9"], "postprocess": util.BinaryExpression},
    {"name": "Exp7", "symbols": ["Exp8"], "postprocess": id},
    {"name": "Exp7", "symbols": ["Exp7", "_", "Binop7", "_", "Exp8"], "postprocess": util.BinaryExpression},
    {"name": "Exp6", "symbols": ["Exp7"], "postprocess": id},
    {"name": "Exp6", "symbols": ["Exp6", "_", "Binop6", "_", "Exp7"], "postprocess": util.BinaryExpression},
    {"name": "Exp5", "symbols": ["Exp6"], "postprocess": id},
    {"name": "Exp5", "symbols": ["Exp5", "_", "Binop5", "_", "Exp6"], "postprocess": util.BinaryExpression},
    {"name": "Exp4", "symbols": ["Exp5"], "postprocess": id},
    {"name": "Exp4", "symbols": ["Exp4", "_", "Binop4", "_", "Exp5"], "postprocess": util.BinaryExpression},
    {"name": "Exp3", "symbols": ["Exp4"], "postprocess": id},
    {"name": "Exp3", "symbols": ["Exp3", "_", "Binop3", "_", "Exp4"], "postprocess": util.BinaryExpression},
    {"name": "Exp2", "symbols": ["Exp3"], "postprocess": id},
    {"name": "Exp2", "symbols": ["Exp2", "_", "Binop2", "_", "Exp3"], "postprocess": util.BinaryExpression},
    {"name": "Exp1", "symbols": ["Exp2"], "postprocess": id},
    {"name": "Exp1", "symbols": ["Exp2", "_", "Binop1", "_", "Expression", "_", {"literal":":"}, "_", "Exp1"], "postprocess": util.ConditionalExpression},
    {"name": "Exp0", "symbols": ["Exp1"], "postprocess": id},
    {"name": "Exp0", "symbols": ["Exp1", "_", "Binop0", "_", "Exp0"], "postprocess": util.BinaryExpression},
    {"name": "Funargs$ebnf$1$subexpression$1$ebnf$1", "symbols": []},
    {"name": "Funargs$ebnf$1$subexpression$1$ebnf$1$subexpression$1", "symbols": ["_", {"literal":","}, "_", "Expression"]},
    {"name": "Funargs$ebnf$1$subexpression$1$ebnf$1", "symbols": ["Funargs$ebnf$1$subexpression$1$ebnf$1", "Funargs$ebnf$1$subexpression$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "Funargs$ebnf$1$subexpression$1", "symbols": ["Expression", "Funargs$ebnf$1$subexpression$1$ebnf$1", "_"]},
    {"name": "Funargs$ebnf$1", "symbols": ["Funargs$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "Funargs$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "Funargs", "symbols": ["_", "Funargs$ebnf$1"]},
    {"name": "Tp", "symbols": [{"literal":"int"}], "postprocess": util.IntType},
    {"name": "Tp", "symbols": [{"literal":"bool"}], "postprocess": util.BoolType},
    {"name": "Tp", "symbols": [{"literal":"string"}], "postprocess": util.StringType},
    {"name": "Tp", "symbols": [{"literal":"char"}], "postprocess": util.CharType},
    {"name": "Tp", "symbols": [{"literal":"void"}], "postprocess": util.VoidType},
    {"name": "Tp", "symbols": ["Tp", "_", {"literal":"*"}], "postprocess": util.PointerType},
    {"name": "Tp", "symbols": ["Tp", "_", {"literal":"["}, "_", {"literal":"]"}], "postprocess": util.ArrayType},
    {"name": "Tp", "symbols": [{"literal":"struct"}, "_", "StructName"], "postprocess": util.StructType},
    {"name": "Tp", "symbols": ["TypeIdentifier"], "postprocess": id},
    {"name": "StringLiteral$ebnf$1", "symbols": []},
    {"name": "StringLiteral$ebnf$1$subexpression$1", "symbols": [(lexer.has("special_character") ? {type: "special_character"} : special_character)]},
    {"name": "StringLiteral$ebnf$1$subexpression$1", "symbols": [(lexer.has("characters") ? {type: "characters"} : characters)]},
    {"name": "StringLiteral$ebnf$1", "symbols": ["StringLiteral$ebnf$1", "StringLiteral$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "StringLiteral", "symbols": [(lexer.has("string_delimiter") ? {type: "string_delimiter"} : string_delimiter), "StringLiteral$ebnf$1", (lexer.has("string_delimiter") ? {type: "string_delimiter"} : string_delimiter)]},
    {"name": "CharLiteral$subexpression$1", "symbols": [(lexer.has("special_character") ? {type: "special_character"} : special_character)]},
    {"name": "CharLiteral$subexpression$1", "symbols": [(lexer.has("character") ? {type: "character"} : character)]},
    {"name": "CharLiteral", "symbols": [(lexer.has("char_delimiter") ? {type: "char_delimiter"} : char_delimiter), "CharLiteral$subexpression$1", (lexer.has("char_delimiter") ? {type: "char_delimiter"} : char_delimiter)]},
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1$subexpression$1", "symbols": [(lexer.has("whitespace") ? {type: "whitespace"} : whitespace)]},
    {"name": "_$ebnf$1$subexpression$1", "symbols": [(lexer.has("newline") ? {type: "newline"} : newline)]},
    {"name": "_$ebnf$1$subexpression$1", "symbols": [(lexer.has("annospace") ? {type: "annospace"} : annospace)]},
    {"name": "_$ebnf$1$subexpression$1", "symbols": ["LineComment"]},
    {"name": "_$ebnf$1$subexpression$1", "symbols": ["MultiComment"]},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", "_$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "_", "symbols": ["_$ebnf$1"]},
    {"name": "LineComment$ebnf$1", "symbols": []},
    {"name": "LineComment$ebnf$1", "symbols": ["LineComment$ebnf$1", (lexer.has("comment") ? {type: "comment"} : comment)], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "LineComment", "symbols": [(lexer.has("comment_line_start") ? {type: "comment_line_start"} : comment_line_start), "LineComment$ebnf$1", (lexer.has("comment_line_end") ? {type: "comment_line_end"} : comment_line_end)]},
    {"name": "MultiComment$ebnf$1", "symbols": []},
    {"name": "MultiComment$ebnf$1$subexpression$1", "symbols": [(lexer.has("comment") ? {type: "comment"} : comment)]},
    {"name": "MultiComment$ebnf$1$subexpression$1", "symbols": [(lexer.has("newline") ? {type: "newline"} : newline)]},
    {"name": "MultiComment$ebnf$1$subexpression$1", "symbols": ["MultiComment"]},
    {"name": "MultiComment$ebnf$1", "symbols": ["MultiComment$ebnf$1", "MultiComment$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "MultiComment", "symbols": [(lexer.has("comment_start") ? {type: "comment_start"} : comment_start), "MultiComment$ebnf$1", (lexer.has("comment_end") ? {type: "comment_end"} : comment_end)]},
    {"name": "Top$ebnf$1", "symbols": []},
    {"name": "Top$ebnf$1$subexpression$1", "symbols": ["_", "Statement"]},
    {"name": "Top$ebnf$1", "symbols": ["Top$ebnf$1", "Top$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "Top", "symbols": ["Top$ebnf$1", "_Annos", "_", "Simple", "_"], "postprocess": util.TopSimple},
    {"name": "Top$ebnf$2$subexpression$1", "symbols": ["_", "Statement"]},
    {"name": "Top$ebnf$2", "symbols": ["Top$ebnf$2$subexpression$1"]},
    {"name": "Top$ebnf$2$subexpression$2", "symbols": ["_", "Statement"]},
    {"name": "Top$ebnf$2", "symbols": ["Top$ebnf$2", "Top$ebnf$2$subexpression$2"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "Top", "symbols": ["Top$ebnf$2", "_Annos", "_"], "postprocess": util.TopStatement},
    {"name": "Simple$ebnf$1$subexpression$1", "symbols": ["_", {"literal":"="}, "_", "Expression"]},
    {"name": "Simple$ebnf$1", "symbols": ["Simple$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "Simple$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "Simple", "symbols": ["Tp", "_", "Identifier", "Simple$ebnf$1"]},
    {"name": "Simple", "symbols": ["Expression"], "postprocess": id},
    {"name": "BlockStatement$ebnf$1", "symbols": []},
    {"name": "BlockStatement$ebnf$1$subexpression$1", "symbols": ["_", "Statement"]},
    {"name": "BlockStatement$ebnf$1", "symbols": ["BlockStatement$ebnf$1", "BlockStatement$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "BlockStatement", "symbols": [{"literal":"{"}, "BlockStatement$ebnf$1", "_Annos", "_", {"literal":"}"}], "postprocess": util.BlockStatement},
    {"name": "Anno_$subexpression$1", "symbols": [{"literal":"loop_invariant"}]},
    {"name": "Anno_$subexpression$1", "symbols": [{"literal":"assert"}]},
    {"name": "Anno_$subexpression$1", "symbols": [{"literal":"requires"}]},
    {"name": "Anno_$subexpression$1", "symbols": [{"literal":"ensures"}]},
    {"name": "Anno_", "symbols": ["Anno_$subexpression$1", "_", "Expression", "_", {"literal":";"}, "_"], "postprocess": util.Anno},
    {"name": "AnnoSet$ebnf$1", "symbols": []},
    {"name": "AnnoSet$ebnf$1", "symbols": ["AnnoSet$ebnf$1", "Anno_"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "AnnoSet", "symbols": [(lexer.has("anno_start") ? {type: "anno_start"} : anno_start), "_", "AnnoSet$ebnf$1", (lexer.has("anno_end") ? {type: "anno_end"} : anno_end)], "postprocess": util.AnnoSet},
    {"name": "AnnoSet$ebnf$2", "symbols": []},
    {"name": "AnnoSet$ebnf$2", "symbols": ["AnnoSet$ebnf$2", "Anno_"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "AnnoSet", "symbols": [(lexer.has("anno_line_start") ? {type: "anno_line_start"} : anno_line_start), "_", "AnnoSet$ebnf$2", (lexer.has("anno_end") ? {type: "anno_end"} : anno_end)], "postprocess": util.AnnoSet},
    {"name": "AnnoSet$ebnf$3", "symbols": []},
    {"name": "AnnoSet$ebnf$3", "symbols": ["AnnoSet$ebnf$3", "Anno_"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "AnnoSet$ebnf$4", "symbols": []},
    {"name": "AnnoSet$ebnf$4", "symbols": ["AnnoSet$ebnf$4", (lexer.has("comment") ? {type: "comment"} : comment)], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "AnnoSet", "symbols": [(lexer.has("anno_line_start") ? {type: "anno_line_start"} : anno_line_start), "_", "AnnoSet$ebnf$3", (lexer.has("comment_line_start") ? {type: "comment_line_start"} : comment_line_start), "AnnoSet$ebnf$4", (lexer.has("comment_line_end") ? {type: "comment_line_end"} : comment_line_end)], "postprocess": util.AnnoSet},
    {"name": "Annos_$ebnf$1", "symbols": []},
    {"name": "Annos_$ebnf$1$subexpression$1", "symbols": ["AnnoSet", "_"]},
    {"name": "Annos_$ebnf$1", "symbols": ["Annos_$ebnf$1", "Annos_$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "Annos_", "symbols": ["Annos_$ebnf$1"], "postprocess": x => x[0].reduce((xs: { concat: (arg0: any) => void; }, y: any[]) => xs.concat(y[0]), [])},
    {"name": "_Annos$ebnf$1", "symbols": []},
    {"name": "_Annos$ebnf$1$subexpression$1", "symbols": ["_", "AnnoSet"]},
    {"name": "_Annos$ebnf$1", "symbols": ["_Annos$ebnf$1", "_Annos$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "_Annos", "symbols": ["_Annos$ebnf$1"], "postprocess": x => x[0].reduce((xs: { concat: (arg0: any) => void; }, y: any[]) => xs.concat(y[1]), [])},
    {"name": "Statement$ebnf$1", "symbols": []},
    {"name": "Statement$ebnf$1$subexpression$1", "symbols": ["Annos_", "StatementPrefix"]},
    {"name": "Statement$ebnf$1", "symbols": ["Statement$ebnf$1", "Statement$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "Statement$subexpression$1", "symbols": ["StatementEnd"]},
    {"name": "Statement$subexpression$1", "symbols": ["DanglingIf"]},
    {"name": "Statement", "symbols": ["Statement$ebnf$1", "Annos_", "Statement$subexpression$1"], "postprocess": util.Statement},
    {"name": "StatementNoDangle$ebnf$1", "symbols": []},
    {"name": "StatementNoDangle$ebnf$1$subexpression$1", "symbols": ["Annos_", "StatementPrefix"]},
    {"name": "StatementNoDangle$ebnf$1", "symbols": ["StatementNoDangle$ebnf$1", "StatementNoDangle$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "StatementNoDangle$subexpression$1", "symbols": ["StatementEnd"]},
    {"name": "StatementNoDangle", "symbols": ["StatementNoDangle$ebnf$1", "Annos_", "StatementNoDangle$subexpression$1"], "postprocess": util.Statement},
    {"name": "StatementPrefix", "symbols": [{"literal":"if"}, "_", {"literal":"("}, "_", "Expression", "_", {"literal":")"}, "_", "StatementNoDangle", "_", {"literal":"else"}, "_"], "postprocess": util.IfElse},
    {"name": "StatementPrefix", "symbols": [{"literal":"while"}, "_", {"literal":"("}, "_", "Expression", "_", {"literal":")"}, "_"], "postprocess": util.While},
    {"name": "StatementPrefix$ebnf$1$subexpression$1", "symbols": ["_", "Simple"]},
    {"name": "StatementPrefix$ebnf$1", "symbols": ["StatementPrefix$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "StatementPrefix$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "StatementPrefix$ebnf$2$subexpression$1", "symbols": ["_", "Expression"]},
    {"name": "StatementPrefix$ebnf$2", "symbols": ["StatementPrefix$ebnf$2$subexpression$1"], "postprocess": id},
    {"name": "StatementPrefix$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "StatementPrefix", "symbols": [{"literal":"for"}, "_", {"literal":"("}, "StatementPrefix$ebnf$1", "_", {"literal":";"}, "_", "Expression", "_", {"literal":";"}, "StatementPrefix$ebnf$2", "_", {"literal":")"}, "_"], "postprocess": util.For},
    {"name": "DanglingIf", "symbols": [{"literal":"if"}, "_", {"literal":"("}, "_", "Expression", "_", {"literal":")"}, "_", "Statement"], "postprocess": util.IfStatement},
    {"name": "StatementEnd", "symbols": ["Simple", "_", {"literal":";"}], "postprocess": util.SimpleStatement},
    {"name": "StatementEnd$ebnf$1$subexpression$1", "symbols": ["_", "Expression"]},
    {"name": "StatementEnd$ebnf$1", "symbols": ["StatementEnd$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "StatementEnd$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "StatementEnd", "symbols": [{"literal":"return"}, "StatementEnd$ebnf$1", "_", {"literal":";"}], "postprocess": util.ReturnStatement},
    {"name": "StatementEnd", "symbols": ["BlockStatement"], "postprocess": id},
    {"name": "StatementEnd", "symbols": [{"literal":"break"}, "_", {"literal":";"}], "postprocess": util.BreakStatement},
    {"name": "StatementEnd", "symbols": [{"literal":"continue"}, "_", {"literal":";"}], "postprocess": util.ContinueStatement},
    {"name": "Program$ebnf$1", "symbols": []},
    {"name": "Program$ebnf$1", "symbols": ["Program$ebnf$1", "_GlobalDecl"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "Program", "symbols": ["Program$ebnf$1", "_"], "postprocess": x => x[0]},
    {"name": "_GlobalDecl", "symbols": ["_", "GlobalDecl"], "postprocess": x => x[1]},
    {"name": "GlobalDecl", "symbols": [(lexer.has("pragma") ? {type: "pragma"} : pragma)], "postprocess": util.PragmaDeclaration},
    {"name": "GlobalDecl", "symbols": [{"literal":"struct"}, "_", "StructName", "_", {"literal":";"}], "postprocess": util.StructDeclaration},
    {"name": "GlobalDecl$ebnf$1", "symbols": []},
    {"name": "GlobalDecl$ebnf$1$subexpression$1", "symbols": ["Tp", "_", "FieldName", "_", {"literal":";"}, "_"]},
    {"name": "GlobalDecl$ebnf$1", "symbols": ["GlobalDecl$ebnf$1", "GlobalDecl$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "GlobalDecl", "symbols": [{"literal":"struct"}, "_", "StructName", "_", {"literal":"{"}, "_", "GlobalDecl$ebnf$1", {"literal":"}"}, "_", {"literal":";"}], "postprocess": util.StructDefinition},
    {"name": "GlobalDecl", "symbols": ["Tp", "_", "Identifier", "_", {"literal":"("}, "FunDeclArgs", {"literal":")"}, "_Annos", "_", "FunDeclEnd"], "postprocess": util.FunctionDeclaration},
    {"name": "GlobalDecl", "symbols": [{"literal":"typedef"}, "_", "Tp", "_", "Identifier"], "postprocess": util.TypeDefinition},
    {"name": "GlobalDecl", "symbols": [{"literal":"typedef"}, "_", "Tp", "_", "Identifier", "_", {"literal":"("}, "FunDeclArgs", {"literal":")"}, "_Annos"], "postprocess": util.FunctionTypeDefinition},
    {"name": "FunDeclArgs$ebnf$1$subexpression$1$ebnf$1", "symbols": []},
    {"name": "FunDeclArgs$ebnf$1$subexpression$1$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_", "Tp", "_", "Identifier", "_"]},
    {"name": "FunDeclArgs$ebnf$1$subexpression$1$ebnf$1", "symbols": ["FunDeclArgs$ebnf$1$subexpression$1$ebnf$1", "FunDeclArgs$ebnf$1$subexpression$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "FunDeclArgs$ebnf$1$subexpression$1", "symbols": ["Tp", "_", "Identifier", "_", "FunDeclArgs$ebnf$1$subexpression$1$ebnf$1"]},
    {"name": "FunDeclArgs$ebnf$1", "symbols": ["FunDeclArgs$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "FunDeclArgs$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "FunDeclArgs", "symbols": ["_", "FunDeclArgs$ebnf$1"], "postprocess": util.FunctionDeclarationArgs},
    {"name": "FunDeclEnd", "symbols": [{"literal":";"}], "postprocess": x => null},
    {"name": "FunDeclEnd", "symbols": ["BlockStatement"], "postprocess": id}
  ],
  ParserStart: "Program",
};

export default grammar;

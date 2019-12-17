/** 
 * Contains methods which search for an AST 
 * node given a position, and returns
 * the environment at that position
 */
import { 
  Position, 
  SourceLocation,
  Type,
  AnyType,
  Expression,
  Statement
} from "./ast";
import { GlobalEnv, getFunctionDeclaration, getStructDefinition } from "./typecheck/globalenv";
import { expressionToString } from "./print";
import { Env } from "./typecheck/types";

export enum Ordering {
  Less = -1,
  Equal = 0,
  Greater = 1
}

export function comparePositions(a: Position, b: Position): Ordering {
  if (a.line < b.line) return Ordering.Less;
  if (a.line > b.line) return Ordering.Greater;

  if (a.column < b.column) return Ordering.Less;
  if (a.column > b.column) return Ordering.Greater;

  return Ordering.Equal;
}

export function isInside(a: Position, b?: SourceLocation): boolean {
  if (b === null || b === undefined) return false;

  const start = comparePositions(a, b.start);
  const end = comparePositions(a, b.end);

  return start >= Ordering.Equal && end <= Ordering.Equal;
}

export type SearchInfo = {
  pos: Position,
  genv: GlobalEnv
};

export interface AstSearchResult {
  environment: Env | null;
  data: AstFoundIdent | null;
}

export interface AstFoundIdent { 
  tag: "FoundIdent";
  name: string;
  type: AnyType;
}

function findExpression(e: Expression, currentEnv: Map<string, Type> | null, info: SearchInfo): AstSearchResult {
  const { pos } = info;

  switch (e.tag) {
      case "BinaryExpression":
          if (isInside(pos, e.left.loc)) return findExpression(e.left, currentEnv, info);
          if (isInside(pos, e.right.loc)) return findExpression(e.right, currentEnv, info);
          break;

      case "CallExpression":
          if (isInside(pos, e.callee.loc)) {
              const functionInfo = getFunctionDeclaration(info.genv, e.callee.name);
              if (functionInfo === null) break;
              const type: AnyType = { tag: "FunctionType", definition: functionInfo };

              return {
                  environment: currentEnv,
                  data: {
                      tag: "FoundIdent",
                      name: e.callee.name,
                      type: type
                  }
              };
          }

          for (const arg of e.arguments) {
              if (isInside(pos, arg.loc)) return findExpression(arg, currentEnv, info);
          }
          break;

      case "Identifier":
          if (currentEnv === null) break;

          const type = currentEnv.get(e.name);
          if (type === undefined) break; // Impossible

          return { 
              environment: currentEnv, 
              data: {
                  tag: "FoundIdent",
                  name: e.name, 
                  type 
              }
          };

      case "StructMemberExpression":
          // Here we would like hovering over "foo" in "foo->bar" 
          // to return the type of foo,
          // and hovering over "bar" to report "foo->bar: int" or whatever
          if (isInside(pos, e.object.loc)) return findExpression(e.object, currentEnv, info);
          else {
              if (e.struct === undefined) break;
              const struct = getStructDefinition(info.genv, e.struct);
              
              if (struct === null || struct.definitions === null) break;

              const field = struct.definitions.find(def => def.id.name === e.field.name);
              // Should be impossible - field should always be found unless there
              // is a bug in the typechecker 
              if (field === undefined) throw new Error("Field not found (typechecker bug, please report!)"); 
              return {
                  environment: currentEnv,
                  data: {
                      tag: "FoundIdent",
                      name: expressionToString(e),
                      type: field.kind
                  }
              };
          }

      // TODO: write the other cases
  }


  return { environment: currentEnv, data: null };
}

export function findStatement(s: Statement, currentEnv: Env | null, info: SearchInfo): AstSearchResult {
  const { pos } = info;

  console.assert(isInside(pos, s.loc));

  switch (s.tag) {
      case "BlockStatement":
          currentEnv = s.environment || currentEnv;
          for (const child of s.body) 
              if (isInside(pos, child.loc)) 
                  return findStatement(child, currentEnv, info);

          break;

      case "IfStatement":
          if (isInside(pos, s.test.loc)) 
              return findExpression(s.test, currentEnv, info);
          if (isInside(pos, s.consequent.loc)) 
              return findStatement(s.consequent, currentEnv, info);
          if (s.alternate && isInside(pos, s.alternate.loc)) 
              return findStatement(s.alternate, currentEnv, info);

          break;

      case "ReturnStatement":
          if (s.argument && isInside(pos, s.argument.loc)) 
              return findExpression(s.argument, currentEnv, info);
          break;

      case "ExpressionStatement":
          return findExpression(s.expression, currentEnv, info);

      case "VariableDeclaration":
          if (s.init && isInside(pos, s.init.loc))
              return findExpression(s.init, currentEnv, info);
          break;

      case "AssignmentStatement":
          if (isInside(pos, s.left.loc)) return findExpression(s.left, currentEnv, info);
          if (isInside(pos, s.right.loc)) return findExpression(s.right, currentEnv, info);
          break;

      case "ForStatement":
          // Technically if we are in the update or guard portion
          // we should add i to environment and look there, but 
          // that also sounds like a later problem 
          if (isInside(pos, s.body.loc)) return findStatement(s.body, currentEnv, info);
          break;    
      // TODO: write the other cases
  }

  return { environment: currentEnv, data: null };
}

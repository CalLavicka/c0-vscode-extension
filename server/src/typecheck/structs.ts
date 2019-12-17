import { ConcreteType, Declaration } from "../ast";
import { GlobalEnv, initEmpty, concreteType, addDecl } from "./globalenv";

export type StructMap = Map<string, Map<string, ConcreteType>>;

export function computeStructMap(libs: Declaration[], decls: Declaration[]): StructMap {
    const genv: GlobalEnv = initEmpty();
    const map: StructMap = new Map();
    libs.forEach(decl => {
        addDecl(true, genv, decl);
        if (decl.tag === "StructDeclaration" && decl.definitions !== null) {
            const structMap = new Map<string, ConcreteType>();
            map.set(decl.id.name, structMap);
            decl.definitions.forEach(definition => {
                structMap.set(definition.id.name, concreteType(genv, definition.kind));
            });
        }
    });
    decls.forEach(decl => {
        addDecl(false, genv, decl);
        if (decl.tag === "StructDeclaration" && decl.definitions !== null) {
            const structMap = new Map<string, ConcreteType>();
            map.set(decl.id.name, structMap);
            decl.definitions.forEach(definition => {
                structMap.set(definition.id.name, concreteType(genv, definition.kind));
            });
        }
    });
    return map;
}

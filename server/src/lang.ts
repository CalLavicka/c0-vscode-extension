import * as path from "path";

/**
 * Enumerates valid C0 standards
 */
export type Lang = "L1" | "L2" | "L3" | "L4" | "C0" | "C1";

/**
 * Checks if a filename is a file accepted by the CC0 compiler.
 * This includes:
 *  - 15411 file types
 *  - source files
 *  - header files
 *  - compressed library files (o0 and o1)
 */
export function isC0File(s: string): boolean {
    return parse(path.extname(s)) !== null || isC0ObjectFile(s);
}

/**
 * Checks if a filename is a C0 object file (see newcc0 from Iliano)
 */
export function isC0ObjectFile(s: string): boolean {
    return [".o0", ".o1"].includes(path.extname(s));
}

/**
 * Accept strings like ".L1", "l1", "L1", and ".l1" and turn them into "L1"
 */
export function parse(s: string): Lang | null {
    if (s[0] === ".") {
        s = s.substring(1);
    }
    switch (s.toLowerCase()) {
        case "l1":
            return "L1";
        case "l2":
            return "L2";
        case "l3":
            return "L3";
        case "l4":
            return "L4";
        
        case "c0":
        case "h0":
            return "C0";
        
        case "c1":
        case "h1":
            return "C1";
        
        default:
            return null;
    }
}
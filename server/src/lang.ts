/**
 * Enumerates valid C0 standards
 */
export type Lang = "L1" | "L2" | "L3" | "L4" | "C0" | "C1";

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
            return "C0";
        case "c1":
            return "C1";
        default:
            return null;
    }
}
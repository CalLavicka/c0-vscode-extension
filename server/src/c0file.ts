import { Position, TextDocument } from "vscode-languageserver";
import { openFile } from "./server";

export abstract class C0SourceFile {
  /**
   * The file URI
   */
  abstract key(): string;

  /**
   * The contents of the file
   */
  abstract contents(): string;

  /**
   * The physical file this C0SourceFile came from.
   * For example, if we are passed a .o0 archive (consisting of several C0 files)
   * then the physical file would be the name of the .o0 file and not the .c0 files
   */
  abstract originalFileName(): string;
}

/**
 * A source file which comes from a .o0 or .o1 file.
 * These source files are stored in memory. 
 * The actual contents are only in compressed form in the .o0/.o1 file
 */
export class C0ObjectSourceFile extends C0SourceFile {
  constructor(private readonly fileName: string, private readonly fileText: string, private readonly objectFileName: string) {
    super();
  }

  key(): string {
    return this.fileName;
  }

  contents(): string {
    return this.fileText;
  }

  originalFileName(): string {
    return this.objectFileName;
  }
}

/**
 * A source file which is currently open in the editor, 
 * and therefore backed by a TextDocument object.
 * Usually this corresponds to the file currently being edited.
 * This means that there is additional functionality available
 */
export class C0TextDocumentFile extends C0SourceFile {
  constructor(private readonly document: TextDocument) {
    super();
  }

  key(): string {
    return this.document.uri;
  }

  contents(): string {
    return this.document.getText();
  }

  originalFileName(): string {
    return this.key();
  }

  positionAt(offset: number): Position {
    return this.document.positionAt(offset);
  }
}

export class C0DiskSourceFile extends C0SourceFile {
  private readonly fileText: string;

  constructor(private readonly fileName: string) {
    super();
    this.fileText = openFile(fileName);
  }

  key(): string {
    return this.fileName;
  }

  contents(): string {
    return this.fileText;
  }

  originalFileName(): string {
    return this.fileName;
  }
}

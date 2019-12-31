# C0 extension for VSCode

This provides IDE features for C0, such as code completion, parse errors/typechecking errors, go-to-definition, etc. A local installation of C0 is not necessary 

## Installation

Simply click "install" on the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=15122staff.c0-lsp&ssr=false#overview)

For more information on getting started with this extension at CMU for 15-122, see [this presentation](https://docs.google.com/presentation/d/1Y3T15cJWumS-a0lOQwwyOhLMF6Yz7YBsbGfrZ0EmaZM/edit?usp=sharing)

## Usage

The extension will activate when opening a C0/C1 file. To select the C0 theme, press CMD+SHIFT+P or CTRL+SHIFT+P, type "color theme", and select C0-light or C0-dark

To activate code completion, press CTRL-SPACE. To go to the definition of something, CMD+click or CTRL+click on it. 

### Multi-file projects

The extension needs to know in what order to load files. To do so, you should provide a `project.txt` file in the main directory of your project. It should be a list of the files in the order you would compile them

Example: 
```
lib/hdict.c1
lib/peg-util.c1
lib/stacks.c1
peg-moves.c1
peg1.c1
peg2.c1
peg-main.c1
```

The extension will look for `project.txt` first in the same directory as the current source file, one directory above that, and then in the workspace root. 

## Features

* View parse and typechecking errors as you type 
* View a function/variable/struct field's type by hovering over it
* CTRL-SPACE will suggest variables which are in scope and function names, struct field names
* Command/Ctrl click to go to a definition for almost anything
* Full support for C0 standard library
* Full support for all C0/C1 features 
* Highlighting for C0-specific features
* New C0-specific themes 

## Contributing

See CONTRIBUTING.md in the repository's root directory

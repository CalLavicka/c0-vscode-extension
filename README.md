# C0 extension for VSCode

This provides IDE features for C0, such as code completion, parse errors/typechecking errors, go-to-definition, etc. A local installation of C0 is not necessary 

## Installation

Simply click "install" on the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=15122staff.c0-lsp&ssr=false#overview)

For more information on getting started with this extension at CMU for 15-122, see [this presentation](https://docs.google.com/presentation/d/1Y3T15cJWumS-a0lOQwwyOhLMF6Yz7YBsbGfrZ0EmaZM/edit?usp=sharing)

## Issues

If you run into any problems with the extension, have a feature request, or have any other feedback, please let us know on our [issues page](https://github.com/CalLavicka/c0-vscode-extension/issues)

## Usage

The extension will activate when opening a C0/C1 file. To select the C0 theme, press CMD+SHIFT+P or CTRL+SHIFT+P, type "color theme", and select C0-light or C0-dark

To activate code completion, press CTRL-SPACE. To go to the definition of something, CMD+click or CTRL+click on it. 

### Multi-file projects

If the file `README.txt` exits for your project, then the extension will use lines starting with ` % cc0 ` to figure out in what order the files should be compiled. You don't need to do anything further.

Otherwise you should provide a `project.txt` file in the main directory of your project. It should be a list of the files in the order you would compile them, separated by spaces. If there are multiple ways to compile your project, then you should list each way on a different line. 
Example: 
```
b.c0 a.c0 
b.c0 b-test.c0 
``` 
The extension will look for `project.txt`/`README.txt` first in the same directory as the current source file, one directory above that, and then in the workspace root. 

## Features

* View parse and typechecking errors as you type 
* View a function/variable/struct field's type by hovering over it
* CTRL-SPACE will suggest variables which are in scope, function names, and struct field names
* Command/Ctrl-click to go to a definition
* Signature and parameter hints
* Full support for C0 standard library
* Full support for all C0/C1 features 
* Highlighting for C0-specific features along with 122-specific files such as clac and c0 bytecode
* New C0-specific themes 


## Contributing

See [CONTRIBUTING.md](https://github.com/CalLavicka/c0-vscode-extension/blob/master/CONTRIBUTING.md) in the repository's root directory

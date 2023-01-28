# C0 extension for VSCode

![Published version number](https://vsmarketplacebadges.dev/version/15122staff.c0-lsp.svg) ![Number of unique installs](https://vsmarketplacebadges.dev/installs/15122staff.c0-lsp.svg)


This provides IDE features for C0, such as code completion, parse errors/typechecking errors, go-to-definition, etc. A local installation of C0 is not necessary 

## Installation

Simply click "install" on the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=15122staff.c0-lsp&ssr=false#overview)

For more information on getting started with this extension at CMU for 15-122, see [this presentation](https://docs.google.com/presentation/d/1Y3T15cJWumS-a0lOQwwyOhLMF6Yz7YBsbGfrZ0EmaZM/edit?usp=sharing)

## Screenshots

View documentation hints, function signature help. It will automatically appear when calling a function,
as well as when you hover over a function name or view it in the code completion window.

![Documentation hints](readme-images/doc.png)

Errors are automatically displayed

![Errors](readme-images/error.png)

Code completions are invoked using CTRL-SPACE (not command)

![Function completions](readme-images/completion.png) 
![Struct field completions](readme-images/struct.png) 
![Documentation in completion](readme-images/completion-doc.png) 

Go-to definition/declaration (CMD/CTRL + click) 

![Go-to definition](readme-images/goto.png) 

## Issues

If you run into any problems with the extension, have a feature request, or have any other feedback, please let us know on our [issues page](https://github.com/CalLavicka/c0-vscode-extension/issues)

## Usage

The extension will activate when opening a C0/C1 file. To select the C0 theme, press CMD+SHIFT+P or CTRL+SHIFT+P, type "color theme", and select C0-light or C0-dark

To activate code completion, press CTRL-SPACE. To go to the definition of something, CMD+click or CTRL+click on it. 

### Multi-file projects

If the file `README.txt` exists for your project, then the extension will use lines starting with ` % cc0 ` to figure out in what order the files should be compiled. You don't need to do anything further.

The extension will look for `README.txt` first in the same directory as the current source file, one directory above that, and then in the workspace root. 

## Features

* View parse and typechecking errors as you type 
* View a function/variable/struct field's type by hovering over it
* CTRL-SPACE will suggest variables which are in scope, function names, and struct field names
* Command/Ctrl-click to go to a definition
* Signature and parameter hints
* Full support for C0 standard library
* Full support for all C0/C1 features, including the new O0/O1 files
* Highlighting for C0-specific features along with 122-specific files such as clac and C0/C1 bytecode
* New C0-specific themes 


## Contributing

See [CONTRIBUTING.md](https://github.com/CalLavicka/c0-vscode-extension/blob/master/CONTRIBUTING.md) in the repository's root directory

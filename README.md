# C0 extension for VSCode

This extension is supposed to ease the act of writing C0 code for 122 students.

## Installing

* First, clone the repository. Make sure you have `npm` installed.
* `npm install` on the root directory to install dependecies
* `npm run compile` to compile the typescript/the parser
* `code -n .` to open it up in VSCode!
* Hit `F5` to start debugging the extension in a new window. Be sure that the
debug configuration is set to "Launch Client". After that's launched you can switch
the debug config to "Attach to Server" and start debugging that. 

## Features

* View parse and typechecking errors as you type 
* View a function/variable/struct field's type by hovering over it
* CTRL-SPACE will suggest variables which are in scope and function names, struct names
* Commmand click to go to a definition for almost anything
* Full support for C0 standard library
* Full support for all C0/C1 features, including `#use "foo.c0"` and C1 features
* New C0-specific themes 

## Structure

* Root directory: Contains package.json for extension, as well as syntax highlighting
* `client`: Contains client-code, which for now just starts up the language server
    * `src`: Contains the source files for the client code. Probably doesn't have to be touched.
* `server`: Contains server functions.
    * `src`: Contains the typescript source directory for the client code
        * `server.ts`: The main typescript file which sends diagnostic, autocompletion, etc. info to the client.
        * `validate-document.ts`: Parses one file, including dependencies
        * `ast-search.ts`: Responsible for getting information from the AST given a document position 
        * `parse`: Contains parsing code adapted from JaC0
        * `typecheck`: Contains typechecking code adapted from JaC0
    * `syntax`: Contains the nearley files which compile to typescript
* `language-configuration.json`: Some configurations for C0, such as brackets and comments.
* `syntaxes/C0.tmLanguage.json`: The syntax highlighting for VSCode.


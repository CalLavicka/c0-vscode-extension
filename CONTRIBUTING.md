# Contributing to the VSCode extension

Thanks for contributing! Here are some tips on getting started with development

## General information
* Check our [issues page](https://github.com/CalLavicka/c0-vscode-extension/issues) page, or if you want to work on something else feel free to create a new issue for it (to keep track of who is working on what) 
* Please work in a new branch until your feature is ready

## Development

* First, clone the repository. Make sure you have `npm` installed.
* `npm install` on the root directory to install dependecies
* `npm run compile` to generate the parser and to compile the typescript
* `code -n .` to open it up in VSCode! (If you don't have the command on your path just open the workspace)
* Hit `F5` to start debugging the extension in a new window. Be sure that the
debug configuration is set to "Launch Client". After that's launched you can switch
the debug config to "Attach to Server" and start debugging that. 

### Notes on parsing
The parser is one of the more complex portions of this project. Here are some notes on how it works:

The parsing pipeline goes line this: lex.ts produces tokens -> various \*.ne files parse them and send them to nearley-helper.ts for postprocessing, this produces the types from parse/parsedsyntax.ts.

That whole thing is called by parse.ts. However we can't do it all at once - we have to stop every time we see a typedef to update the lexer with new typenames (so it can distinguish between a* b as a multiplication or a variable decl). So parse.ts splits on each semicolon.

Finally, after the parsing is done, restrictsyntax.ts converts them into ast.ts types, which essentially "cleans it up" a bit, and does a little bit of validation (e.g. \length only appears in contracts).



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

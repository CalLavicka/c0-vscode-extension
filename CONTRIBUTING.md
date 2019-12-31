# Contributing to the VSCode extension

Thanks for contribuing! Here are some tips on getting started with development

## General information
* Please let us know what you are working on so we don't duplicate effort, by using GitHub issues
* Please work in a new branch until your feature is ready

## Development

* First, clone the repository. Make sure you have `npm` installed.
* `npm install` on the root directory to install dependecies
* `npm run compile` to generate the parser and to compile the typescript
* `code -n .` to open it up in VSCode! (If you don't have the command on your path just open the workspace)
* Hit `F5` to start debugging the extension in a new window. Be sure that the
debug configuration is set to "Launch Client". After that's launched you can switch
the debug config to "Attach to Server" and start debugging that. 


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

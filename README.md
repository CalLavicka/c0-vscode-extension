# C0 extension for VSCode

This extension is supposed to ease the act of writing C0 code for 122 students.

## Installing

* First, clone the repository. Make sure you have `npm` installed.
* `npm install` on the root directory to install dependecies
* `npm run compile` to compile the typescript
* `code .` to open it up in VSCode!
* Hit `F5` to start debugging the extension in a new window.

## Structure

* Root directory: Contains package.json for extension, as well as syntax highlighting
* `client`: Contains client-code, which for now just starts up the language server
* `server`: Contains server functions. Right now all it does is check if lines are more than 80 characters, as an example.

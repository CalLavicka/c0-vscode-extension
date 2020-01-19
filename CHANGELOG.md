# Change Log

## [1.3.5]
- Reverted incorrectly published code 

## [1.3.4]
- Library headers are now copied when read, so any changes will not persist 
- Fixed a bug regarding go-to definition of struct fields in different files
- Fixed a bug regarding multiple compilation paths through a single file
- Fixed a bug with c0-light theme menu colors

## [1.3.3]
- Declarations from a library header now have their location reported as being from the library (e.g. `#use <string>` instead of `string.h0`) 

## [1.3.2]
- Added semicolons to the end of contracts in hover and completion windows
- Fixed a typo in the README
- Fixed a bug where a diagnostic warning that no project file was found would appear for header files.

## [1.3.1]
- Fixed a bug involving character literals '"' and '\\'
- Fixed a bug involving files not found while expanding a glob in README.txt 
- Fixed an issue involving highlighting multiline contract blocks 
- Added squiggles for all exceptions raised during typechecking and parsing - including `ImpossibleErrors` as these help in tracking down bugs 

## [1.3.0]
- The extension will now attempt to get dependencies off `README.txt` instead of `project.txt` when available
- Code completion will only suggest functions from other files if they have a separate prototype declared, to prevent implementation details from leaking 

## [1.2.2]

- In the code completion info panel, file paths will now be displayed relative to the workspace root, instead of the full URI being shown 
- Multiple "build targets" are now supported. This is a breaking change to the project.txt file format. Now, each build target should be on a separate line, with files separated by spaces in the order they should be compiled 

## [1.2.1]

- Added signature and parameter hints, these show details about the current parameter when calling a function
- In some cases where the struct type can be determined, the completion list will now only suggest fields of that struct when invoking completions after `->` or `.`

## [1.1.7]

- Initial release
- Code completion of local variables, function names, typedefs, struct names, struct field names
- Syntax highlighting for all C1 constructs
- Full C0/C1 feature support
- Go-to-definition for everything
- Type information on hover for everything, as well as contracts on functions
- Hover over a type identifier to expand it
- Syntax highlighting for C0VM bytecode and Clac definition files


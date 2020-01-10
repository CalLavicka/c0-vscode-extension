# Change Log

## [1.2.2]

- In the code completion info panel, file paths will now be displayed relative to the workspace root, instead of the full URI being shown 

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


# Changelog

<!--- 
## [2.1.0]
*New major feature*: Indentor. "Format document" will now properly indent the document 
-->

## [2.3.2] - June 15, 2022
- Fixed the "No README.md" warning being shown at every keystroke for files with no dependencies
- Fixed the server crashing when typing in //@

## [2.3.1] - June 15, 2022
- Fixed an issue where line comments after a line-contract were considered to be the "end location" of the line contract, and therefore incorrectly raised an error:
```c
//@assert is_heap_safe(H);    // basic invariants hold
// but ordering invariant may be violated
```

## [2.3.0] - May 23, 2022
- Using a function not part of the interface of a `.o0` file will now result in a warning in the editor.
  If an `.o0` file has no interface section, then all functions are assumed to be part of the interface
- If a command line in `README.txt` references a file that does not exist, that file will be ignored. 
  This is to reduce unexpected behavior when editing a "test file". For example, consider a file
  `images-test.c0` which tests functionality from `blur.c0` and `reflect.c0`. If `reflect.c0` does not exist,
  then we could still process `images-test.c0` using just `blur.c0`. 
- Fixed Windows-specific problems with `.o0` files
- Fixed hover info for the expression components of `\hastag` and casts. 

## [2.2.7] - May 9, 2022
- In a `README.txt`, globbed files are now processed in alphabetical order. This matches what shells do
- Allow ambiguous parses since the parser sometimes falsely claims a file has two parses, when they are really identical.

## [2.2.6] - May 9, 2022
- Added support for the new `.o0/.o1` C0 library file formats, which are
  compressed bundles of source code, for the purpose of aiding encapsulation of implementation details.
- Fixed `alloc_array(t, e)` not reporting the position of `t` properly
- If there is no `README.txt` available for the file, a message is shown, instead of a diagnostic.
  Hopefully, this is much less annoying since it can be dismissed and is not persistent.

## [2.2.5] - February 10, 2022
- Added support for string literal concenation:
```cpp
println(
  "Hello world\n"
  "Some more text"
);
```

## [2.2.4] - January 30, 2021
- Added `.bc1` bytecode file extension
- Added 'did-you-mean' support for when a function name is misspelled

## [2.2.3] - January 5, 2021
- Fixed format string parsing incorrectly rejecting format specifiers which 
  didn't start after a space

## [2.2.2] - November 7, 2020
- Fixed the typechecker rejecting casts of the form `*(t*)e` in lvalues, since those are now
  legal in C1

## [2.2.1] - October 15, 2020
- Fixed a problem which happened when a function declared (and not defined) in file A
  was used in file B. This would cause the usage to be a problem since the function 
  was never defined. However, it would also try to generate a diagnostic for the 
  declaration in file A, which is impossible because our older version of the LSP
  protocol does not support it. Therefore this would create strange squiggles which
  didn't match up with the source

## [2.2.0] - September 7, 2020
- Added typechecking, completions, and signature info for `printf` and `format`

## [2.1.0] - March 18, 2020
- Added go-to-definition for `#use`'d libraries/files  ([issue #20](https://github.com/CalLavicka/c0-vscode-extension/issues/20))
- Added completion for struct names (`struct foo`) and documentation 
- Fixed parsing failures when the path to the open file contains parens or other funny characters ([issue #40](https://github.com/CalLavicka/c0-vscode-extension/issues/40))
- Fixed local variable completions not working properly when they were declared in the topmost scope of a function
- Fixed documentation hints not appearing for typedefs 

## [2.0.2] - March 9, 2020
- Fixed bug involving editing a file when not in a workspace
- Fixed object of hastag not getting typechecked

## [2.0.1] - February 7, 2020
- Added images to README
- Fixed bug involving struct accesses immediately after an assignment

## [2.0.0] - February 6, 2020
- *New major feature*: Documentation hints. Documentation will now be displayed for structs, 
functions, and typedefs in the code completion/hover information window.
- Added `assert()`, `error()`, `alloc`, `alloc_array` to code completion items 
- Added autocompletion for contract types
- Added autocompletion for variables in contracts 
- Increased the situations in which struct field name autocompletion would work 
- Fixed syntax highlighting issue involving "disabled" contracts (e.g. `// @`)
- Fixed syntax highlighting issue involving spaces between brackets when declaring a variable with an array type (e.g. `int[  ] A;`)
- Fixed bug where the extension would not detect newly created C0 files
- Corrected a small typo in `parse.h0` 


## [1.3.5] - January 16, 2020
- Reverted incorrectly published code 

## [1.3.4] - January 16, 2020
- Library headers are now copied when read, so any changes will not persist 
- Fixed a bug regarding go-to definition of struct fields in different files
- Fixed a bug regarding multiple compilation paths through a single file
- Fixed a bug with c0-light theme menu colors

## [1.3.3] - January 12, 2020
- Declarations from a library header now have their location reported as being from the library (e.g. `#use <string>` instead of `string.h0`) 

## [1.3.2] - January 12, 2020
- Added semicolons to the end of contracts in hover and completion windows
- Fixed a typo in the README
- Fixed a bug where a diagnostic warning that no project file was found would appear for header files.

## [1.3.1] - January 11, 2020
- Fixed a bug involving character literals `'"'` and `'\\'`
- Fixed a bug involving files not found while expanding a glob in README.txt 
- Fixed an issue involving highlighting multiline contract blocks 
- Added squiggles for all exceptions raised during typechecking and parsing - including `ImpossibleErrors` as these help in tracking down bugs 

## [1.3.0] - January 11, 2020
- The extension will now attempt to get dependencies off `README.txt` instead of `project.txt` when available
- Code completion will only suggest functions from other files if they have a separate prototype declared, to prevent implementation details from leaking 

## [1.2.2] - January 10, 2020

- In the code completion info panel, file paths will now be displayed relative to the workspace root, instead of the full URI being shown 
- Multiple "build targets" are now supported. This is a breaking change to the project.txt file format. Now, each build target should be on a separate line, with files separated by spaces in the order they should be compiled 

## [1.2.1] - January 8, 2020

- Added signature and parameter hints, these show details about the current parameter when calling a function
- In some cases where the struct type can be determined, the completion list will now only suggest fields of that struct when invoking completions after `->` or `.`

## [1.1.7] - January 5, 2020

- Initial release
- Code completion of local variables, function names, typedefs, struct names, struct field names
- Syntax highlighting for all C1 constructs
- Full C0/C1 feature support
- Go-to-definition for everything
- Type information on hover for everything, as well as contracts on functions
- Hover over a type identifier to expand it
- Syntax highlighting for C0VM bytecode and Clac definition files


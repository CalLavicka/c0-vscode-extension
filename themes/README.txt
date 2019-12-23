------------------------------------------------
Short README guide to creating themes!
By: Angela Zhang :)
------------------------------------------------
If you're interested in creating your own color theme, here's a quick
how-to on, well, how to make one!

1. Make a copy of one of the existing themes and 
   rename into "name_of_theme.color-theme.json"
   
2. Go into the package.json file in the root folder and
   locate contributes.theme. Add in your theme:
    { 
        "label": "name_of_theme",
        "uiTheme": "vs", 
        "path": "./themes/name_of_theme.color-theme.json"
    }
    Your "uiTheme" field should be one of the following:
    - "vs" for light theme
    - "vs-dark" for dark theme
    - "hc-black" for high contract dark theme

3. Now, back in the "name_of_theme.color-theme.json", you're free to change any 
   of the colors as you wish! 
    a. You can change how the window looks in "colors" - for details on what
       each field does, check here: 
       https://code.visualstudio.com/api/references/theme-color
    b. You can change specific tokens to be different colors in "tokenColors" - 
       I've labelled what most of the groups correspond to (i.e. "operators" or
       "variable types")

4. If you're trying to highlight a token group that's not included in the theme 
   already, find an example of the token in a .c0 file, use Cmd+Shift+P (or 
   Ctrl+Shift+P) and type in "Developer: Inspect TM Scopes" and move the cursor
   over the token. You'll see its "labels" at the bottom of the hovered window 
   (i.e. keyword.control) and you can use this to make a "color rule" for it:
        {
            "name": "Control keywords",
            "scope": "keyword.control",
            "settings": {
                "foreground": "#9b21c0",
                "fontStyle": "bold"
            }
        }

Hope this helps! Enjoy~
Honk!
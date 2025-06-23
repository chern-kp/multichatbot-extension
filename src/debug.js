const DEVMODE = false; // False for production, true for development

if (!DEVMODE) {
    console.log = function() {};
    console.error = function() {};
    console.warn = function() {};
    console.info = function() {};
    console.debug = function() {};
}

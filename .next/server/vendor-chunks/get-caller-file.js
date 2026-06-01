"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/get-caller-file";
exports.ids = ["vendor-chunks/get-caller-file"];
exports.modules = {

/***/ "(rsc)/./node_modules/get-caller-file/index.js":
/*!***********************************************!*\
  !*** ./node_modules/get-caller-file/index.js ***!
  \***********************************************/
/***/ ((module) => {

eval("\n// Call this function in a another function to find out the file from\n// which that function was called from. (Inspects the v8 stack trace)\n//\n// Inspired by http://stackoverflow.com/questions/13227489\nmodule.exports = function getCallerFile(position) {\n    if (position === void 0) { position = 2; }\n    if (position >= Error.stackTraceLimit) {\n        throw new TypeError('getCallerFile(position) requires position be less then Error.stackTraceLimit but position was: `' + position + '` and Error.stackTraceLimit was: `' + Error.stackTraceLimit + '`');\n    }\n    var oldPrepareStackTrace = Error.prepareStackTrace;\n    Error.prepareStackTrace = function (_, stack) { return stack; };\n    var stack = new Error().stack;\n    Error.prepareStackTrace = oldPrepareStackTrace;\n    if (stack !== null && typeof stack === 'object') {\n        // stack[0] holds this file\n        // stack[1] holds where this function was called\n        // stack[2] holds the file we're interested in\n        return stack[position] ? stack[position].getFileName() : undefined;\n    }\n};\n//# sourceMappingURL=index.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvZ2V0LWNhbGxlci1maWxlL2luZGV4LmpzIiwibWFwcGluZ3MiOiJBQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLCtCQUErQjtBQUMvQjtBQUNBO0FBQ0E7QUFDQTtBQUNBLG9EQUFvRDtBQUNwRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL3BpbmctcGFuZy1hcHAvLi9ub2RlX21vZHVsZXMvZ2V0LWNhbGxlci1maWxlL2luZGV4LmpzPzJkZTYiXSwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCI7XG4vLyBDYWxsIHRoaXMgZnVuY3Rpb24gaW4gYSBhbm90aGVyIGZ1bmN0aW9uIHRvIGZpbmQgb3V0IHRoZSBmaWxlIGZyb21cbi8vIHdoaWNoIHRoYXQgZnVuY3Rpb24gd2FzIGNhbGxlZCBmcm9tLiAoSW5zcGVjdHMgdGhlIHY4IHN0YWNrIHRyYWNlKVxuLy9cbi8vIEluc3BpcmVkIGJ5IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMTMyMjc0ODlcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZ2V0Q2FsbGVyRmlsZShwb3NpdGlvbikge1xuICAgIGlmIChwb3NpdGlvbiA9PT0gdm9pZCAwKSB7IHBvc2l0aW9uID0gMjsgfVxuICAgIGlmIChwb3NpdGlvbiA+PSBFcnJvci5zdGFja1RyYWNlTGltaXQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZ2V0Q2FsbGVyRmlsZShwb3NpdGlvbikgcmVxdWlyZXMgcG9zaXRpb24gYmUgbGVzcyB0aGVuIEVycm9yLnN0YWNrVHJhY2VMaW1pdCBidXQgcG9zaXRpb24gd2FzOiBgJyArIHBvc2l0aW9uICsgJ2AgYW5kIEVycm9yLnN0YWNrVHJhY2VMaW1pdCB3YXM6IGAnICsgRXJyb3Iuc3RhY2tUcmFjZUxpbWl0ICsgJ2AnKTtcbiAgICB9XG4gICAgdmFyIG9sZFByZXBhcmVTdGFja1RyYWNlID0gRXJyb3IucHJlcGFyZVN0YWNrVHJhY2U7XG4gICAgRXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSBmdW5jdGlvbiAoXywgc3RhY2spIHsgcmV0dXJuIHN0YWNrOyB9O1xuICAgIHZhciBzdGFjayA9IG5ldyBFcnJvcigpLnN0YWNrO1xuICAgIEVycm9yLnByZXBhcmVTdGFja1RyYWNlID0gb2xkUHJlcGFyZVN0YWNrVHJhY2U7XG4gICAgaWYgKHN0YWNrICE9PSBudWxsICYmIHR5cGVvZiBzdGFjayA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgLy8gc3RhY2tbMF0gaG9sZHMgdGhpcyBmaWxlXG4gICAgICAgIC8vIHN0YWNrWzFdIGhvbGRzIHdoZXJlIHRoaXMgZnVuY3Rpb24gd2FzIGNhbGxlZFxuICAgICAgICAvLyBzdGFja1syXSBob2xkcyB0aGUgZmlsZSB3ZSdyZSBpbnRlcmVzdGVkIGluXG4gICAgICAgIHJldHVybiBzdGFja1twb3NpdGlvbl0gPyBzdGFja1twb3NpdGlvbl0uZ2V0RmlsZU5hbWUoKSA6IHVuZGVmaW5lZDtcbiAgICB9XG59O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aW5kZXguanMubWFwIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/get-caller-file/index.js\n");

/***/ })

};
;
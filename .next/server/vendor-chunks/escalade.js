/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/escalade";
exports.ids = ["vendor-chunks/escalade"];
exports.modules = {

/***/ "(rsc)/./node_modules/escalade/sync/index.js":
/*!*********************************************!*\
  !*** ./node_modules/escalade/sync/index.js ***!
  \*********************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("const { dirname, resolve } = __webpack_require__(/*! path */ \"path\");\nconst { readdirSync, statSync } = __webpack_require__(/*! fs */ \"fs\");\n\nmodule.exports = function (start, callback) {\n\tlet dir = resolve('.', start);\n\tlet tmp, stats = statSync(dir);\n\n\tif (!stats.isDirectory()) {\n\t\tdir = dirname(dir);\n\t}\n\n\twhile (true) {\n\t\ttmp = callback(dir, readdirSync(dir));\n\t\tif (tmp) return resolve(dir, tmp);\n\t\tdir = dirname(tmp = dir);\n\t\tif (tmp === dir) break;\n\t}\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvZXNjYWxhZGUvc3luYy9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBQSxRQUFRLG1CQUFtQixFQUFFLG1CQUFPLENBQUMsa0JBQU07QUFDM0MsUUFBUSx3QkFBd0IsRUFBRSxtQkFBTyxDQUFDLGNBQUk7O0FBRTlDO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9waW5nLXBhbmctYXBwLy4vbm9kZV9tb2R1bGVzL2VzY2FsYWRlL3N5bmMvaW5kZXguanM/ZWY3MSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCB7IGRpcm5hbWUsIHJlc29sdmUgfSA9IHJlcXVpcmUoJ3BhdGgnKTtcbmNvbnN0IHsgcmVhZGRpclN5bmMsIHN0YXRTeW5jIH0gPSByZXF1aXJlKCdmcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChzdGFydCwgY2FsbGJhY2spIHtcblx0bGV0IGRpciA9IHJlc29sdmUoJy4nLCBzdGFydCk7XG5cdGxldCB0bXAsIHN0YXRzID0gc3RhdFN5bmMoZGlyKTtcblxuXHRpZiAoIXN0YXRzLmlzRGlyZWN0b3J5KCkpIHtcblx0XHRkaXIgPSBkaXJuYW1lKGRpcik7XG5cdH1cblxuXHR3aGlsZSAodHJ1ZSkge1xuXHRcdHRtcCA9IGNhbGxiYWNrKGRpciwgcmVhZGRpclN5bmMoZGlyKSk7XG5cdFx0aWYgKHRtcCkgcmV0dXJuIHJlc29sdmUoZGlyLCB0bXApO1xuXHRcdGRpciA9IGRpcm5hbWUodG1wID0gZGlyKTtcblx0XHRpZiAodG1wID09PSBkaXIpIGJyZWFrO1xuXHR9XG59XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/escalade/sync/index.js\n");

/***/ })

};
;
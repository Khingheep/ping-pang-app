/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/pend";
exports.ids = ["vendor-chunks/pend"];
exports.modules = {

/***/ "(rsc)/./node_modules/pend/index.js":
/*!************************************!*\
  !*** ./node_modules/pend/index.js ***!
  \************************************/
/***/ ((module) => {

eval("module.exports = Pend;\n\nfunction Pend() {\n  this.pending = 0;\n  this.max = Infinity;\n  this.listeners = [];\n  this.waiting = [];\n  this.error = null;\n}\n\nPend.prototype.go = function(fn) {\n  if (this.pending < this.max) {\n    pendGo(this, fn);\n  } else {\n    this.waiting.push(fn);\n  }\n};\n\nPend.prototype.wait = function(cb) {\n  if (this.pending === 0) {\n    cb(this.error);\n  } else {\n    this.listeners.push(cb);\n  }\n};\n\nPend.prototype.hold = function() {\n  return pendHold(this);\n};\n\nfunction pendHold(self) {\n  self.pending += 1;\n  var called = false;\n  return onCb;\n  function onCb(err) {\n    if (called) throw new Error(\"callback called twice\");\n    called = true;\n    self.error = self.error || err;\n    self.pending -= 1;\n    if (self.waiting.length > 0 && self.pending < self.max) {\n      pendGo(self, self.waiting.shift());\n    } else if (self.pending === 0) {\n      var listeners = self.listeners;\n      self.listeners = [];\n      listeners.forEach(cbListener);\n    }\n  }\n  function cbListener(listener) {\n    listener(self.error);\n  }\n}\n\nfunction pendGo(self, fn) {\n  fn(pendHold(self));\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvcGVuZC9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxJQUFJO0FBQ0o7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLElBQUk7QUFDSjtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL3BpbmctcGFuZy1hcHAvLi9ub2RlX21vZHVsZXMvcGVuZC9pbmRleC5qcz81ZTg1Il0sInNvdXJjZXNDb250ZW50IjpbIm1vZHVsZS5leHBvcnRzID0gUGVuZDtcblxuZnVuY3Rpb24gUGVuZCgpIHtcbiAgdGhpcy5wZW5kaW5nID0gMDtcbiAgdGhpcy5tYXggPSBJbmZpbml0eTtcbiAgdGhpcy5saXN0ZW5lcnMgPSBbXTtcbiAgdGhpcy53YWl0aW5nID0gW107XG4gIHRoaXMuZXJyb3IgPSBudWxsO1xufVxuXG5QZW5kLnByb3RvdHlwZS5nbyA9IGZ1bmN0aW9uKGZuKSB7XG4gIGlmICh0aGlzLnBlbmRpbmcgPCB0aGlzLm1heCkge1xuICAgIHBlbmRHbyh0aGlzLCBmbik7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy53YWl0aW5nLnB1c2goZm4pO1xuICB9XG59O1xuXG5QZW5kLnByb3RvdHlwZS53YWl0ID0gZnVuY3Rpb24oY2IpIHtcbiAgaWYgKHRoaXMucGVuZGluZyA9PT0gMCkge1xuICAgIGNiKHRoaXMuZXJyb3IpO1xuICB9IGVsc2Uge1xuICAgIHRoaXMubGlzdGVuZXJzLnB1c2goY2IpO1xuICB9XG59O1xuXG5QZW5kLnByb3RvdHlwZS5ob2xkID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBwZW5kSG9sZCh0aGlzKTtcbn07XG5cbmZ1bmN0aW9uIHBlbmRIb2xkKHNlbGYpIHtcbiAgc2VsZi5wZW5kaW5nICs9IDE7XG4gIHZhciBjYWxsZWQgPSBmYWxzZTtcbiAgcmV0dXJuIG9uQ2I7XG4gIGZ1bmN0aW9uIG9uQ2IoZXJyKSB7XG4gICAgaWYgKGNhbGxlZCkgdGhyb3cgbmV3IEVycm9yKFwiY2FsbGJhY2sgY2FsbGVkIHR3aWNlXCIpO1xuICAgIGNhbGxlZCA9IHRydWU7XG4gICAgc2VsZi5lcnJvciA9IHNlbGYuZXJyb3IgfHwgZXJyO1xuICAgIHNlbGYucGVuZGluZyAtPSAxO1xuICAgIGlmIChzZWxmLndhaXRpbmcubGVuZ3RoID4gMCAmJiBzZWxmLnBlbmRpbmcgPCBzZWxmLm1heCkge1xuICAgICAgcGVuZEdvKHNlbGYsIHNlbGYud2FpdGluZy5zaGlmdCgpKTtcbiAgICB9IGVsc2UgaWYgKHNlbGYucGVuZGluZyA9PT0gMCkge1xuICAgICAgdmFyIGxpc3RlbmVycyA9IHNlbGYubGlzdGVuZXJzO1xuICAgICAgc2VsZi5saXN0ZW5lcnMgPSBbXTtcbiAgICAgIGxpc3RlbmVycy5mb3JFYWNoKGNiTGlzdGVuZXIpO1xuICAgIH1cbiAgfVxuICBmdW5jdGlvbiBjYkxpc3RlbmVyKGxpc3RlbmVyKSB7XG4gICAgbGlzdGVuZXIoc2VsZi5lcnJvcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gcGVuZEdvKHNlbGYsIGZuKSB7XG4gIGZuKHBlbmRIb2xkKHNlbGYpKTtcbn1cbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/pend/index.js\n");

/***/ })

};
;
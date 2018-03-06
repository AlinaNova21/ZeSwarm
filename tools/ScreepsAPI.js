var ScreepsAPI = (function (exports, WebSocket, fetch) {
  'use strict'

  WebSocket = WebSocket && WebSocket.hasOwnProperty('default') ? WebSocket['default'] : WebSocket
  fetch = fetch && fetch.hasOwnProperty('default') ? fetch['default'] : fetch

/*! https://mths.be/punycode v1.4.1 by @mathias */

/** Highest positive signed 32-bit float value */
  var maxInt = 2147483647 // aka. 0x7FFFFFFF or 2^31-1

/** Bootstring parameters */
  var base = 36
  var tMin = 1
  var tMax = 26
  var skew = 38
  var damp = 700
  var initialBias = 72
  var initialN = 128 // 0x80
  var delimiter = '-' // '\x2D'

  var regexNonASCII = /[^\x20-\x7E]/ // unprintable ASCII chars + non-ASCII chars
  var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g // RFC 3490 separators

/** Error messages */
  var errors = {
    'overflow': 'Overflow: input needs wider integers to process',
    'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
    'invalid-input': 'Invalid input'
  }

/** Convenience shortcuts */
  var baseMinusTMin = base - tMin
  var floor = Math.floor
  var stringFromCharCode = String.fromCharCode

/* -------------------------------------------------------------------------- */

/**
 * A generic error utility function.
 * @private
 * @param {String} type The error type.
 * @returns {Error} Throws a `RangeError` with the applicable error message.
 */
  function error (type) {
    throw new RangeError(errors[type])
  }

/**
 * A generic `Array#map` utility function.
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} callback The function that gets called for every array
 * item.
 * @returns {Array} A new array of values returned by the callback function.
 */
  function map (array, fn) {
    var length = array.length
    var result = []
    while (length--) {
      result[length] = fn(array[length])
    }
    return result
  }

/**
 * A simple `Array#map`-like wrapper to work with domain name strings or email
 * addresses.
 * @private
 * @param {String} domain The domain name or email address.
 * @param {Function} callback The function that gets called for every
 * character.
 * @returns {Array} A new string of characters returned by the callback
 * function.
 */
  function mapDomain (string, fn) {
    var parts = string.split('@')
    var result = ''
    if (parts.length > 1) {
    // In email addresses, only the domain name should be punycoded. Leave
    // the local part (i.e. everything up to `@`) intact.
      result = parts[0] + '@'
      string = parts[1]
    }
  // Avoid `split(regex)` for IE8 compatibility. See #17.
    string = string.replace(regexSeparators, '\x2E')
    var labels = string.split('.')
    var encoded = map(labels, fn).join('.')
    return result + encoded
  }

/**
 * Creates an array containing the numeric code points of each Unicode
 * character in the string. While JavaScript uses UCS-2 internally,
 * this function will convert a pair of surrogate halves (each of which
 * UCS-2 exposes as separate characters) into a single code point,
 * matching UTF-16.
 * @see `punycode.ucs2.encode`
 * @see <https://mathiasbynens.be/notes/javascript-encoding>
 * @memberOf punycode.ucs2
 * @name decode
 * @param {String} string The Unicode input string (UCS-2).
 * @returns {Array} The new array of code points.
 */
  function ucs2decode (string) {
    var output = [],
      counter = 0,
      length = string.length,
      value,
      extra
    while (counter < length) {
      value = string.charCodeAt(counter++)
      if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
      // high surrogate, and there is a next character
        extra = string.charCodeAt(counter++)
        if ((extra & 0xFC00) == 0xDC00) {
        // low surrogate
          output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000)
        } else {
        // unmatched surrogate; only append this code unit, in case the next
        // code unit is the high surrogate of a surrogate pair
          output.push(value)
          counter--
        }
      } else {
        output.push(value)
      }
    }
    return output
  }

/**
 * Creates a string based on an array of numeric code points.
 * @see `punycode.ucs2.decode`
 * @memberOf punycode.ucs2
 * @name encode
 * @param {Array} codePoints The array of numeric code points.
 * @returns {String} The new Unicode string (UCS-2).
 */
  function ucs2encode (array) {
    return map(array, function (value) {
      var output = ''
      if (value > 0xFFFF) {
        value -= 0x10000
        output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800)
        value = 0xDC00 | value & 0x3FF
      }
      output += stringFromCharCode(value)
      return output
    }).join('')
  }

/**
 * Converts a basic code point into a digit/integer.
 * @see `digitToBasic()`
 * @private
 * @param {Number} codePoint The basic numeric code point value.
 * @returns {Number} The numeric value of a basic code point (for use in
 * representing integers) in the range `0` to `base - 1`, or `base` if
 * the code point does not represent a value.
 */
  function basicToDigit (codePoint) {
    if (codePoint - 48 < 10) {
      return codePoint - 22
    }
    if (codePoint - 65 < 26) {
      return codePoint - 65
    }
    if (codePoint - 97 < 26) {
      return codePoint - 97
    }
    return base
  }

/**
 * Converts a digit/integer into a basic code point.
 * @see `basicToDigit()`
 * @private
 * @param {Number} digit The numeric value of a basic code point.
 * @returns {Number} The basic code point whose value (when used for
 * representing integers) is `digit`, which needs to be in the range
 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
 * used; else, the lowercase form is used. The behavior is undefined
 * if `flag` is non-zero and `digit` has no uppercase form.
 */
  function digitToBasic (digit, flag) {
  //  0..25 map to ASCII a..z or A..Z
  // 26..35 map to ASCII 0..9
    return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5)
  }

/**
 * Bias adaptation function as per section 3.4 of RFC 3492.
 * https://tools.ietf.org/html/rfc3492#section-3.4
 * @private
 */
  function adapt (delta, numPoints, firstTime) {
    var k = 0
    delta = firstTime ? floor(delta / damp) : delta >> 1
    delta += floor(delta / numPoints)
    for (; /* no initialization */delta > baseMinusTMin * tMax >> 1; k += base) {
      delta = floor(delta / baseMinusTMin)
    }
    return floor(k + (baseMinusTMin + 1) * delta / (delta + skew))
  }

/**
 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
 * symbols.
 * @memberOf punycode
 * @param {String} input The Punycode string of ASCII-only symbols.
 * @returns {String} The resulting string of Unicode symbols.
 */

/**
 * Converts a string of Unicode symbols (e.g. a domain name label) to a
 * Punycode string of ASCII-only symbols.
 * @memberOf punycode
 * @param {String} input The string of Unicode symbols.
 * @returns {String} The resulting Punycode string of ASCII-only symbols.
 */
  function encode (input) {
    var n,
      delta,
      handledCPCount,
      basicLength,
      bias,
      j,
      m,
      q,
      k,
      t,
      currentValue,
      output = [],

  /** `inputLength` will hold the number of code points in `input`. */
      inputLength,

  /** Cached calculation results */
      handledCPCountPlusOne,
      baseMinusT,
      qMinusT

  // Convert the input in UCS-2 to Unicode
    input = ucs2decode(input)

  // Cache the length
    inputLength = input.length

  // Initialize the state
    n = initialN
    delta = 0
    bias = initialBias

  // Handle the basic code points
    for (j = 0; j < inputLength; ++j) {
      currentValue = input[j]
      if (currentValue < 0x80) {
        output.push(stringFromCharCode(currentValue))
      }
    }

    handledCPCount = basicLength = output.length

  // `handledCPCount` is the number of code points that have been handled;
  // `basicLength` is the number of basic code points.

  // Finish the basic string - if it is not empty - with a delimiter
    if (basicLength) {
      output.push(delimiter)
    }

  // Main encoding loop:
    while (handledCPCount < inputLength) {
    // All non-basic code points < n have been handled already. Find the next
    // larger one:
      for (m = maxInt, j = 0; j < inputLength; ++j) {
        currentValue = input[j]
        if (currentValue >= n && currentValue < m) {
          m = currentValue
        }
      }

    // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
    // but guard against overflow
      handledCPCountPlusOne = handledCPCount + 1
      if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
        error('overflow')
      }

      delta += (m - n) * handledCPCountPlusOne
      n = m

      for (j = 0; j < inputLength; ++j) {
        currentValue = input[j]

        if (currentValue < n && ++delta > maxInt) {
          error('overflow')
        }

        if (currentValue == n) {
        // Represent delta as a generalized variable-length integer
          for (q = delta, k = base; ; /* no condition */k += base) {
            t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias
            if (q < t) {
              break
            }
            qMinusT = q - t
            baseMinusT = base - t
            output.push(stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0)))
            q = floor(qMinusT / baseMinusT)
          }

          output.push(stringFromCharCode(digitToBasic(q, 0)))
          bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength)
          delta = 0
          ++handledCPCount
        }
      }

      ++delta
      ++n
    }
    return output.join('')
  }

/**
 * Converts a Punycode string representing a domain name or an email address
 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
 * it doesn't matter if you call it on a string that has already been
 * converted to Unicode.
 * @memberOf punycode
 * @param {String} input The Punycoded domain name or email address to
 * convert to Unicode.
 * @returns {String} The Unicode representation of the given Punycode
 * string.
 */

/**
 * Converts a Unicode string representing a domain name or an email address to
 * Punycode. Only the non-ASCII parts of the domain name will be converted,
 * i.e. it doesn't matter if you call it with a domain that's already in
 * ASCII.
 * @memberOf punycode
 * @param {String} input The domain name or email address to convert, as a
 * Unicode string.
 * @returns {String} The Punycode representation of the given domain name or
 * email address.
 */
  function toASCII (input) {
    return mapDomain(input, function (string) {
      return regexNonASCII.test(string) ? 'xn--' + encode(string) : string
    })
  }

/**
 * An object of methods to convert from JavaScript's internal character
 * representation (UCS-2) to Unicode code points, and back.
 * @see <https://mathiasbynens.be/notes/javascript-encoding>
 * @memberOf punycode
 * @type Object
 */

// shim for using process in browser
// based off https://github.com/defunctzombie/node-process/blob/master/browser.js

  function defaultSetTimout () {
    throw new Error('setTimeout has not been defined')
  }
  function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined')
  }
  var cachedSetTimeout = defaultSetTimout
  var cachedClearTimeout = defaultClearTimeout
  if (typeof global.setTimeout === 'function') {
    cachedSetTimeout = setTimeout
  }
  if (typeof global.clearTimeout === 'function') {
    cachedClearTimeout = clearTimeout
  }

  function runTimeout (fun) {
    if (cachedSetTimeout === setTimeout) {
        // normal enviroments in sane situations
      return setTimeout(fun, 0)
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
      cachedSetTimeout = setTimeout
      return setTimeout(fun, 0)
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
      return cachedSetTimeout(fun, 0)
    } catch (e) {
      try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
        return cachedSetTimeout.call(null, fun, 0)
      } catch (e) {
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
        return cachedSetTimeout.call(this, fun, 0)
      }
    }
  }
  function runClearTimeout (marker) {
    if (cachedClearTimeout === clearTimeout) {
        // normal enviroments in sane situations
      return clearTimeout(marker)
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
      cachedClearTimeout = clearTimeout
      return clearTimeout(marker)
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
      return cachedClearTimeout(marker)
    } catch (e) {
      try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
        return cachedClearTimeout.call(null, marker)
      } catch (e) {
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
        return cachedClearTimeout.call(this, marker)
      }
    }
  }
  var queue = []
  var draining = false
  var currentQueue
  var queueIndex = -1

  function cleanUpNextTick () {
    if (!draining || !currentQueue) {
      return
    }
    draining = false
    if (currentQueue.length) {
      queue = currentQueue.concat(queue)
    } else {
      queueIndex = -1
    }
    if (queue.length) {
      drainQueue()
    }
  }

  function drainQueue () {
    if (draining) {
      return
    }
    var timeout = runTimeout(cleanUpNextTick)
    draining = true

    var len = queue.length
    while (len) {
      currentQueue = queue
      queue = []
      while (++queueIndex < len) {
        if (currentQueue) {
          currentQueue[queueIndex].run()
        }
      }
      queueIndex = -1
      len = queue.length
    }
    currentQueue = null
    draining = false
    runClearTimeout(timeout)
  }
  function nextTick (fun) {
    var args = new Array(arguments.length - 1)
    if (arguments.length > 1) {
      for (var i = 1; i < arguments.length; i++) {
        args[i - 1] = arguments[i]
      }
    }
    queue.push(new Item(fun, args))
    if (queue.length === 1 && !draining) {
      runTimeout(drainQueue)
    }
  }
// v8 likes predictible objects
  function Item (fun, array) {
    this.fun = fun
    this.array = array
  }
  Item.prototype.run = function () {
    this.fun.apply(null, this.array)
  }
  var title = 'browser'
  var platform = 'browser'
  var browser = true
  var env = {}
  var argv = []
  var version$1 = '' // empty string to avoid regexp issues
  var versions = {}
  var release = {}
  var config = {}

  function noop () {}

  var on = noop
  var addListener = noop
  var once = noop
  var off = noop
  var removeListener = noop
  var removeAllListeners = noop
  var emit = noop

  function binding (name) {
    throw new Error('process.binding is not supported')
  }

  function cwd () {
    return '/'
  }
  function chdir (dir) {
    throw new Error('process.chdir is not supported')
  }
  function umask () {
    return 0
  }

// from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
  var performance = global.performance || {}
  var performanceNow = performance.now || performance.mozNow || performance.msNow || performance.oNow || performance.webkitNow || function () {
    return new Date().getTime()
  }

// generate timestamp or delta
// see http://nodejs.org/api/process.html#process_process_hrtime
  function hrtime (previousTimestamp) {
    var clocktime = performanceNow.call(performance) * 1e-3
    var seconds = Math.floor(clocktime)
    var nanoseconds = Math.floor(clocktime % 1 * 1e9)
    if (previousTimestamp) {
      seconds = seconds - previousTimestamp[0]
      nanoseconds = nanoseconds - previousTimestamp[1]
      if (nanoseconds < 0) {
        seconds--
        nanoseconds += 1e9
      }
    }
    return [seconds, nanoseconds]
  }

  var startTime = new Date()
  function uptime () {
    var currentTime = new Date()
    var dif = currentTime - startTime
    return dif / 1000
  }

  var process$1 = {
    nextTick: nextTick,
    title: title,
    browser: browser,
    env: env,
    argv: argv,
    version: version$1,
    versions: versions,
    on: on,
    addListener: addListener,
    once: once,
    off: off,
    removeListener: removeListener,
    removeAllListeners: removeAllListeners,
    emit: emit,
    binding: binding,
    cwd: cwd,
    chdir: chdir,
    umask: umask,
    hrtime: hrtime,
    platform: platform,
    release: release,
    config: config,
    uptime: uptime
  }

  var inherits
  if (typeof Object.create === 'function') {
    inherits = function inherits (ctor, superCtor) {
    // implementation from standard node.js 'util' module
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  } else {
    inherits = function inherits (ctor, superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function TempCtor () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
  var inherits$1 = inherits

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
  var formatRegExp = /%[sdj%]/g
  function format$1 (f) {
    if (!isString(f)) {
      var objects = []
      for (var i = 0; i < arguments.length; i++) {
        objects.push(inspect(arguments[i]))
      }
      return objects.join(' ')
    }

    var i = 1
    var args = arguments
    var len = args.length
    var str = String(f).replace(formatRegExp, function (x) {
      if (x === '%%') return '%'
      if (i >= len) return x
      switch (x) {
        case '%s':
          return String(args[i++])
        case '%d':
          return Number(args[i++])
        case '%j':
          try {
            return JSON.stringify(args[i++])
          } catch (_) {
            return '[Circular]'
          }
        default:
          return x
      }
    })
    for (var x = args[i]; i < len; x = args[++i]) {
      if (isNull(x) || !isObject(x)) {
        str += ' ' + x
      } else {
        str += ' ' + inspect(x)
      }
    }
    return str
  }

// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
  function deprecate (fn, msg) {
  // Allow for deprecating things in the process of starting up.
    if (isUndefined(global.process)) {
      return function () {
        return deprecate(fn, msg).apply(this, arguments)
      }
    }

    if (process$1.noDeprecation === true) {
      return fn
    }

    var warned = false
    function deprecated () {
      if (!warned) {
        if (process$1.throwDeprecation) {
          throw new Error(msg)
        } else if (process$1.traceDeprecation) {
          console.trace(msg)
        } else {
          console.error(msg)
        }
        warned = true
      }
      return fn.apply(this, arguments)
    }

    return deprecated
  }

  var debugs = {}
  var debugEnviron
  function debuglog (set) {
    if (isUndefined(debugEnviron)) debugEnviron = process$1.env.NODE_DEBUG || ''
    set = set.toUpperCase()
    if (!debugs[set]) {
      if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
        var pid = 0
        debugs[set] = function () {
          var msg = format$1.apply(null, arguments)
          console.error('%s %d: %s', set, pid, msg)
        }
      } else {
        debugs[set] = function () {}
      }
    }
    return debugs[set]
  }

/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors */
  function inspect (obj, opts) {
  // default options
    var ctx = {
      seen: [],
      stylize: stylizeNoColor
    }
  // legacy...
    if (arguments.length >= 3) ctx.depth = arguments[2]
    if (arguments.length >= 4) ctx.colors = arguments[3]
    if (isBoolean(opts)) {
    // legacy...
      ctx.showHidden = opts
    } else if (opts) {
    // got an "options" object
      _extend(ctx, opts)
    }
  // set default options
    if (isUndefined(ctx.showHidden)) ctx.showHidden = false
    if (isUndefined(ctx.depth)) ctx.depth = 2
    if (isUndefined(ctx.colors)) ctx.colors = false
    if (isUndefined(ctx.customInspect)) ctx.customInspect = true
    if (ctx.colors) ctx.stylize = stylizeWithColor
    return formatValue(ctx, obj, ctx.depth)
  }

// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
  inspect.colors = {
    'bold': [1, 22],
    'italic': [3, 23],
    'underline': [4, 24],
    'inverse': [7, 27],
    'white': [37, 39],
    'grey': [90, 39],
    'black': [30, 39],
    'blue': [34, 39],
    'cyan': [36, 39],
    'green': [32, 39],
    'magenta': [35, 39],
    'red': [31, 39],
    'yellow': [33, 39]
  }

// Don't use 'blue' not visible on cmd.exe
  inspect.styles = {
    'special': 'cyan',
    'number': 'yellow',
    'boolean': 'yellow',
    'undefined': 'grey',
    'null': 'bold',
    'string': 'green',
    'date': 'magenta',
  // "name": intentionally not styling
    'regexp': 'red'
  }

  function stylizeWithColor (str, styleType) {
    var style = inspect.styles[styleType]

    if (style) {
      return '\u001b[' + inspect.colors[style][0] + 'm' + str + '\u001b[' + inspect.colors[style][1] + 'm'
    } else {
      return str
    }
  }

  function stylizeNoColor (str, styleType) {
    return str
  }

  function arrayToHash (array) {
    var hash = {}

    array.forEach(function (val, idx) {
      hash[val] = true
    })

    return hash
  }

  function formatValue (ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
    if (ctx.customInspect && value && isFunction(value.inspect) &&
  // Filter out the util module, it's inspect function is special
  value.inspect !== inspect &&
  // Also filter out any prototype objects using the circular check.
  !(value.constructor && value.constructor.prototype === value)) {
      var ret = value.inspect(recurseTimes, ctx)
      if (!isString(ret)) {
        ret = formatValue(ctx, ret, recurseTimes)
      }
      return ret
    }

  // Primitive types cannot have properties
    var primitive = formatPrimitive(ctx, value)
    if (primitive) {
      return primitive
    }

  // Look up the keys of the object.
    var keys = Object.keys(value)
    var visibleKeys = arrayToHash(keys)

    if (ctx.showHidden) {
      keys = Object.getOwnPropertyNames(value)
    }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
    if (isError(value) && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
      return formatError(value)
    }

  // Some type of object without properties can be shortcutted.
    if (keys.length === 0) {
      if (isFunction(value)) {
        var name = value.name ? ': ' + value.name : ''
        return ctx.stylize('[Function' + name + ']', 'special')
      }
      if (isRegExp(value)) {
        return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp')
      }
      if (isDate(value)) {
        return ctx.stylize(Date.prototype.toString.call(value), 'date')
      }
      if (isError(value)) {
        return formatError(value)
      }
    }

    var base = '',
      array = false,
      braces = ['{', '}']

  // Make Array say that they are Array
    if (isArray(value)) {
      array = true
      braces = ['[', ']']
    }

  // Make functions say that they are functions
    if (isFunction(value)) {
      var n = value.name ? ': ' + value.name : ''
      base = ' [Function' + n + ']'
    }

  // Make RegExps say that they are RegExps
    if (isRegExp(value)) {
      base = ' ' + RegExp.prototype.toString.call(value)
    }

  // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + Date.prototype.toUTCString.call(value)
    }

  // Make error with message first say the error
    if (isError(value)) {
      base = ' ' + formatError(value)
    }

    if (keys.length === 0 && (!array || value.length == 0)) {
      return braces[0] + base + braces[1]
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp')
      } else {
        return ctx.stylize('[Object]', 'special')
      }
    }

    ctx.seen.push(value)

    var output
    if (array) {
      output = formatArray(ctx, value, recurseTimes, visibleKeys, keys)
    } else {
      output = keys.map(function (key) {
        return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array)
      })
    }

    ctx.seen.pop()

    return reduceToSingleString(output, base, braces)
  }

  function formatPrimitive (ctx, value) {
    if (isUndefined(value)) return ctx.stylize('undefined', 'undefined')
    if (isString(value)) {
      var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '').replace(/'/g, "\\'").replace(/\\"/g, '"') + '\''
      return ctx.stylize(simple, 'string')
    }
    if (isNumber(value)) return ctx.stylize('' + value, 'number')
    if (isBoolean(value)) return ctx.stylize('' + value, 'boolean')
  // For some reason typeof null is "object", so special case here.
    if (isNull(value)) return ctx.stylize('null', 'null')
  }

  function formatError (value) {
    return '[' + Error.prototype.toString.call(value) + ']'
  }

  function formatArray (ctx, value, recurseTimes, visibleKeys, keys) {
    var output = []
    for (var i = 0, l = value.length; i < l; ++i) {
      if (hasOwnProperty(value, String(i))) {
        output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, String(i), true))
      } else {
        output.push('')
      }
    }
    keys.forEach(function (key) {
      if (!key.match(/^\d+$/)) {
        output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, key, true))
      }
    })
    return output
  }

  function formatProperty (ctx, value, recurseTimes, visibleKeys, key, array) {
    var name, str, desc
    desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] }
    if (desc.get) {
      if (desc.set) {
        str = ctx.stylize('[Getter/Setter]', 'special')
      } else {
        str = ctx.stylize('[Getter]', 'special')
      }
    } else {
      if (desc.set) {
        str = ctx.stylize('[Setter]', 'special')
      }
    }
    if (!hasOwnProperty(visibleKeys, key)) {
      name = '[' + key + ']'
    }
    if (!str) {
      if (ctx.seen.indexOf(desc.value) < 0) {
        if (isNull(recurseTimes)) {
          str = formatValue(ctx, desc.value, null)
        } else {
          str = formatValue(ctx, desc.value, recurseTimes - 1)
        }
        if (str.indexOf('\n') > -1) {
          if (array) {
            str = str.split('\n').map(function (line) {
              return '  ' + line
            }).join('\n').substr(2)
          } else {
            str = '\n' + str.split('\n').map(function (line) {
              return '   ' + line
            }).join('\n')
          }
        }
      } else {
        str = ctx.stylize('[Circular]', 'special')
      }
    }
    if (isUndefined(name)) {
      if (array && key.match(/^\d+$/)) {
        return str
      }
      name = JSON.stringify('' + key)
      if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
        name = name.substr(1, name.length - 2)
        name = ctx.stylize(name, 'name')
      } else {
        name = name.replace(/'/g, "\\'").replace(/\\"/g, '"').replace(/(^"|"$)/g, "'")
        name = ctx.stylize(name, 'string')
      }
    }

    return name + ': ' + str
  }

  function reduceToSingleString (output, base, braces) {
    var numLinesEst = 0
    var length = output.reduce(function (prev, cur) {
      numLinesEst++
      if (cur.indexOf('\n') >= 0) numLinesEst++
      return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1
    }, 0)

    if (length > 60) {
      return braces[0] + (base === '' ? '' : base + '\n ') + ' ' + output.join(',\n  ') + ' ' + braces[1]
    }

    return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1]
  }

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
  function isArray (ar) {
    return Array.isArray(ar)
  }

  function isBoolean (arg) {
    return typeof arg === 'boolean'
  }

  function isNull (arg) {
    return arg === null
  }

  function isNullOrUndefined (arg) {
    return arg == null
  }

  function isNumber (arg) {
    return typeof arg === 'number'
  }

  function isString (arg) {
    return typeof arg === 'string'
  }

  function isUndefined (arg) {
    return arg === void 0
  }

  function isRegExp (re) {
    return isObject(re) && objectToString(re) === '[object RegExp]'
  }

  function isObject (arg) {
    return typeof arg === 'object' && arg !== null
  }

  function isDate (d) {
    return isObject(d) && objectToString(d) === '[object Date]'
  }

  function isError (e) {
    return isObject(e) && (objectToString(e) === '[object Error]' || e instanceof Error)
  }

  function isFunction (arg) {
    return typeof arg === 'function'
  }

  function objectToString (o) {
    return Object.prototype.toString.call(o)
  }

// log is just a thin wrapper to console.log that prepends a timestamp

/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
  function _extend (origin, add) {
  // Don't do anything if add isn't an object
    if (!add || !isObject(add)) return origin

    var keys = Object.keys(add)
    var i = keys.length
    while (i--) {
      origin[keys[i]] = add[keys[i]]
    }
    return origin
  }

  function hasOwnProperty (obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop)
  }

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
  function hasOwnProperty$1 (obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop)
  }
  var isArray$1 = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]'
  }
  function stringifyPrimitive (v) {
    switch (typeof v) {
      case 'string':
        return v

      case 'boolean':
        return v ? 'true' : 'false'

      case 'number':
        return isFinite(v) ? v : ''

      default:
        return ''
    }
  }

  function stringify (obj, sep, eq, name) {
    sep = sep || '&'
    eq = eq || '='
    if (obj === null) {
      obj = undefined
    }

    if (typeof obj === 'object') {
      return map$1(objectKeys(obj), function (k) {
        var ks = encodeURIComponent(stringifyPrimitive(k)) + eq
        if (isArray$1(obj[k])) {
          return map$1(obj[k], function (v) {
            return ks + encodeURIComponent(stringifyPrimitive(v))
          }).join(sep)
        } else {
          return ks + encodeURIComponent(stringifyPrimitive(obj[k]))
        }
      }).join(sep)
    }

    if (!name) return ''
    return encodeURIComponent(stringifyPrimitive(name)) + eq + encodeURIComponent(stringifyPrimitive(obj))
  }

  function map$1 (xs, f) {
    if (xs.map) return xs.map(f)
    var res = []
    for (var i = 0; i < xs.length; i++) {
      res.push(f(xs[i], i))
    }
    return res
  }

  var objectKeys = Object.keys || function (obj) {
    var res = []
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key)
    }
    return res
  }

  function parse$1 (qs, sep, eq, options) {
    sep = sep || '&'
    eq = eq || '='
    var obj = {}

    if (typeof qs !== 'string' || qs.length === 0) {
      return obj
    }

    var regexp = /\+/g
    qs = qs.split(sep)

    var maxKeys = 1000
    if (options && typeof options.maxKeys === 'number') {
      maxKeys = options.maxKeys
    }

    var len = qs.length
  // maxKeys <= 0 means that we should not limit keys count
    if (maxKeys > 0 && len > maxKeys) {
      len = maxKeys
    }

    for (var i = 0; i < len; ++i) {
      var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr,
        vstr,
        k,
        v

      if (idx >= 0) {
        kstr = x.substr(0, idx)
        vstr = x.substr(idx + 1)
      } else {
        kstr = x
        vstr = ''
      }

      k = decodeURIComponent(kstr)
      v = decodeURIComponent(vstr)

      if (!hasOwnProperty$1(obj, k)) {
        obj[k] = v
      } else if (isArray$1(obj[k])) {
        obj[k].push(v)
      } else {
        obj[k] = [obj[k], v]
      }
    }

    return obj
  }
  var querystring = {
    encode: stringify,
    stringify: stringify,
    decode: parse$1,
    parse: parse$1
  }

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

  var URL = {
    parse: urlParse,
    resolve: urlResolve,
    resolveObject: urlResolveObject,
    format: urlFormat,
    Url: Url
  }
  function Url () {
    this.protocol = null
    this.slashes = null
    this.auth = null
    this.host = null
    this.port = null
    this.hostname = null
    this.hash = null
    this.search = null
    this.query = null
    this.pathname = null
    this.path = null
    this.href = null
  }

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
  var protocolPattern = /^([a-z0-9.+-]+:)/i
  var portPattern = /:[0-9]*$/
  var simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/
  var delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t']
  var unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims)
  var autoEscape = ['\''].concat(unwise)
  var nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape)
  var hostEndingChars = ['/', '?', '#']
  var hostnameMaxLen = 255
  var hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/
  var hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/
  var unsafeProtocol = {
    'javascript': true,
    'javascript:': true
  }
  var hostlessProtocol = {
    'javascript': true,
    'javascript:': true
  }
  var slashedProtocol = {
    'http': true,
    'https': true,
    'ftp': true,
    'gopher': true,
    'file': true,
    'http:': true,
    'https:': true,
    'ftp:': true,
    'gopher:': true,
    'file:': true
  }

  function urlParse (url, parseQueryString, slashesDenoteHost) {
    if (url && isObject(url) && url instanceof Url) return url

    var u = new Url()
    u.parse(url, parseQueryString, slashesDenoteHost)
    return u
  }
  Url.prototype.parse = function (url, parseQueryString, slashesDenoteHost) {
    return parse(this, url, parseQueryString, slashesDenoteHost)
  }

  function parse (self, url, parseQueryString, slashesDenoteHost) {
    if (!isString(url)) {
      throw new TypeError('Parameter \'url\' must be a string, not ' + typeof url)
    }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
    var queryIndex = url.indexOf('?'),
      splitter = queryIndex !== -1 && queryIndex < url.indexOf('#') ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g
    uSplit[0] = uSplit[0].replace(slashRegex, '/')
    url = uSplit.join(splitter)

    var rest = url

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
    rest = rest.trim()

    if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
      var simplePath = simplePathPattern.exec(rest)
      if (simplePath) {
        self.path = rest
        self.href = rest
        self.pathname = simplePath[1]
        if (simplePath[2]) {
          self.search = simplePath[2]
          if (parseQueryString) {
            self.query = parse$1(self.search.substr(1))
          } else {
            self.query = self.search.substr(1)
          }
        } else if (parseQueryString) {
          self.search = ''
          self.query = {}
        }
        return self
      }
    }

    var proto = protocolPattern.exec(rest)
    if (proto) {
      proto = proto[0]
      var lowerProto = proto.toLowerCase()
      self.protocol = lowerProto
      rest = rest.substr(proto.length)
    }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
    if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
      var slashes = rest.substr(0, 2) === '//'
      if (slashes && !(proto && hostlessProtocol[proto])) {
        rest = rest.substr(2)
        self.slashes = true
      }
    }
    var i, hec, l, p
    if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
      var hostEnd = -1
      for (i = 0; i < hostEndingChars.length; i++) {
        hec = rest.indexOf(hostEndingChars[i])
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) hostEnd = hec
      }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
      var auth, atSign
      if (hostEnd === -1) {
      // atSign can be anywhere.
        atSign = rest.lastIndexOf('@')
      } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
        atSign = rest.lastIndexOf('@', hostEnd)
      }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
      if (atSign !== -1) {
        auth = rest.slice(0, atSign)
        rest = rest.slice(atSign + 1)
        self.auth = decodeURIComponent(auth)
      }

    // the host is the remaining to the left of the first non-host char
      hostEnd = -1
      for (i = 0; i < nonHostChars.length; i++) {
        hec = rest.indexOf(nonHostChars[i])
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) hostEnd = hec
      }
    // if we still have not hit it, then the entire thing is a host.
      if (hostEnd === -1) hostEnd = rest.length

      self.host = rest.slice(0, hostEnd)
      rest = rest.slice(hostEnd)

    // pull out port.
      parseHost(self)

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
      self.hostname = self.hostname || ''

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
      var ipv6Hostname = self.hostname[0] === '[' && self.hostname[self.hostname.length - 1] === ']'

    // validate a little.
      if (!ipv6Hostname) {
        var hostparts = self.hostname.split(/\./)
        for (i = 0, l = hostparts.length; i < l; i++) {
          var part = hostparts[i]
          if (!part) continue
          if (!part.match(hostnamePartPattern)) {
            var newpart = ''
            for (var j = 0, k = part.length; j < k; j++) {
              if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
                newpart += 'x'
              } else {
                newpart += part[j]
              }
            }
          // we test again with ASCII char only
            if (!newpart.match(hostnamePartPattern)) {
              var validParts = hostparts.slice(0, i)
              var notHost = hostparts.slice(i + 1)
              var bit = part.match(hostnamePartStart)
              if (bit) {
                validParts.push(bit[1])
                notHost.unshift(bit[2])
              }
              if (notHost.length) {
                rest = '/' + notHost.join('.') + rest
              }
              self.hostname = validParts.join('.')
              break
            }
          }
        }
      }

      if (self.hostname.length > hostnameMaxLen) {
        self.hostname = ''
      } else {
      // hostnames are always lower case.
        self.hostname = self.hostname.toLowerCase()
      }

      if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
        self.hostname = toASCII(self.hostname)
      }

      p = self.port ? ':' + self.port : ''
      var h = self.hostname || ''
      self.host = h + p
      self.href += self.host

    // strip [ and ] from the hostname
    // the host field still retains them, though
      if (ipv6Hostname) {
        self.hostname = self.hostname.substr(1, self.hostname.length - 2)
        if (rest[0] !== '/') {
          rest = '/' + rest
        }
      }
    }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
    if (!unsafeProtocol[lowerProto]) {
    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
      for (i = 0, l = autoEscape.length; i < l; i++) {
        var ae = autoEscape[i]
        if (rest.indexOf(ae) === -1) continue
        var esc = encodeURIComponent(ae)
        if (esc === ae) {
          esc = escape(ae)
        }
        rest = rest.split(ae).join(esc)
      }
    }

  // chop off from the tail first.
    var hash = rest.indexOf('#')
    if (hash !== -1) {
    // got a fragment string.
      self.hash = rest.substr(hash)
      rest = rest.slice(0, hash)
    }
    var qm = rest.indexOf('?')
    if (qm !== -1) {
      self.search = rest.substr(qm)
      self.query = rest.substr(qm + 1)
      if (parseQueryString) {
        self.query = parse$1(self.query)
      }
      rest = rest.slice(0, qm)
    } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
      self.search = ''
      self.query = {}
    }
    if (rest) self.pathname = rest
    if (slashedProtocol[lowerProto] && self.hostname && !self.pathname) {
      self.pathname = '/'
    }

  // to support http.request
    if (self.pathname || self.search) {
      p = self.pathname || ''
      var s = self.search || ''
      self.path = p + s
    }

  // finally, reconstruct the href based on what has been validated.
    self.href = format(self)
    return self
  }

// format a parsed object into a url string
  function urlFormat (obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
    if (isString(obj)) obj = parse({}, obj)
    return format(obj)
  }

  function format (self) {
    var auth = self.auth || ''
    if (auth) {
      auth = encodeURIComponent(auth)
      auth = auth.replace(/%3A/i, ':')
      auth += '@'
    }

    var protocol = self.protocol || '',
      pathname = self.pathname || '',
      hash = self.hash || '',
      host = false,
      query = ''

    if (self.host) {
      host = auth + self.host
    } else if (self.hostname) {
      host = auth + (self.hostname.indexOf(':') === -1 ? self.hostname : '[' + this.hostname + ']')
      if (self.port) {
        host += ':' + self.port
      }
    }

    if (self.query && isObject(self.query) && Object.keys(self.query).length) {
      query = stringify(self.query)
    }

    var search = self.search || query && '?' + query || ''

    if (protocol && protocol.substr(-1) !== ':') protocol += ':'

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
    if (self.slashes || (!protocol || slashedProtocol[protocol]) && host !== false) {
      host = '//' + (host || '')
      if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname
    } else if (!host) {
      host = ''
    }

    if (hash && hash.charAt(0) !== '#') hash = '#' + hash
    if (search && search.charAt(0) !== '?') search = '?' + search

    pathname = pathname.replace(/[?#]/g, function (match) {
      return encodeURIComponent(match)
    })
    search = search.replace('#', '%23')

    return protocol + host + pathname + search + hash
  }

  Url.prototype.format = function () {
    return format(this)
  }

  function urlResolve (source, relative) {
    return urlParse(source, false, true).resolve(relative)
  }

  Url.prototype.resolve = function (relative) {
    return this.resolveObject(urlParse(relative, false, true)).format()
  }

  function urlResolveObject (source, relative) {
    if (!source) return relative
    return urlParse(source, false, true).resolveObject(relative)
  }

  Url.prototype.resolveObject = function (relative) {
    if (isString(relative)) {
      var rel = new Url()
      rel.parse(relative, false, true)
      relative = rel
    }

    var result = new Url()
    var tkeys = Object.keys(this)
    for (var tk = 0; tk < tkeys.length; tk++) {
      var tkey = tkeys[tk]
      result[tkey] = this[tkey]
    }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
    result.hash = relative.hash

  // if the relative url is empty, then there's nothing left to do here.
    if (relative.href === '') {
      result.href = result.format()
      return result
    }

  // hrefs like //foo/bar always cut to the protocol.
    if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
      var rkeys = Object.keys(relative)
      for (var rk = 0; rk < rkeys.length; rk++) {
        var rkey = rkeys[rk]
        if (rkey !== 'protocol') result[rkey] = relative[rkey]
      }

    // urlParse appends trailing / to urls like http://www.example.com
      if (slashedProtocol[result.protocol] && result.hostname && !result.pathname) {
        result.path = result.pathname = '/'
      }

      result.href = result.format()
      return result
    }
    var relPath
    if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
      if (!slashedProtocol[relative.protocol]) {
        var keys = Object.keys(relative)
        for (var v = 0; v < keys.length; v++) {
          var k = keys[v]
          result[k] = relative[k]
        }
        result.href = result.format()
        return result
      }

      result.protocol = relative.protocol
      if (!relative.host && !hostlessProtocol[relative.protocol]) {
        relPath = (relative.pathname || '').split('/')
        while (relPath.length && !(relative.host = relPath.shift()));
        if (!relative.host) relative.host = ''
        if (!relative.hostname) relative.hostname = ''
        if (relPath[0] !== '') relPath.unshift('')
        if (relPath.length < 2) relPath.unshift('')
        result.pathname = relPath.join('/')
      } else {
        result.pathname = relative.pathname
      }
      result.search = relative.search
      result.query = relative.query
      result.host = relative.host || ''
      result.auth = relative.auth
      result.hostname = relative.hostname || relative.host
      result.port = relative.port
    // to support http.request
      if (result.pathname || result.search) {
        var p = result.pathname || ''
        var s = result.search || ''
        result.path = p + s
      }
      result.slashes = result.slashes || relative.slashes
      result.href = result.format()
      return result
    }

    var isSourceAbs = result.pathname && result.pathname.charAt(0) === '/',
      isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === '/',
      mustEndAbs = isRelAbs || isSourceAbs || result.host && relative.pathname,
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol]
    relPath = relative.pathname && relative.pathname.split('/') || []
  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
    if (psychotic) {
      result.hostname = ''
      result.port = null
      if (result.host) {
        if (srcPath[0] === '') srcPath[0] = result.host; else srcPath.unshift(result.host)
      }
      result.host = ''
      if (relative.protocol) {
        relative.hostname = null
        relative.port = null
        if (relative.host) {
          if (relPath[0] === '') relPath[0] = relative.host; else relPath.unshift(relative.host)
        }
        relative.host = null
      }
      mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '')
    }
    var authInHost
    if (isRelAbs) {
    // it's absolute.
      result.host = relative.host || relative.host === '' ? relative.host : result.host
      result.hostname = relative.hostname || relative.hostname === '' ? relative.hostname : result.hostname
      result.search = relative.search
      result.query = relative.query
      srcPath = relPath
    // fall through to the dot-handling below.
    } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
      if (!srcPath) srcPath = []
      srcPath.pop()
      srcPath = srcPath.concat(relPath)
      result.search = relative.search
      result.query = relative.query
    } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
      if (psychotic) {
        result.hostname = result.host = srcPath.shift()
      // occationaly the auth can get stuck only in host
      // this especially happens in cases like
      // url.resolveObject('mailto:local1@domain1', 'local2@domain2')
        authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false
        if (authInHost) {
          result.auth = authInHost.shift()
          result.host = result.hostname = authInHost.shift()
        }
      }
      result.search = relative.search
      result.query = relative.query
    // to support http.request
      if (!isNull(result.pathname) || !isNull(result.search)) {
        result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '')
      }
      result.href = result.format()
      return result
    }

    if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
      result.pathname = null
    // to support http.request
      if (result.search) {
        result.path = '/' + result.search
      } else {
        result.path = null
      }
      result.href = result.format()
      return result
    }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
    var last = srcPath.slice(-1)[0]
    var hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === '.' || last === '..') || last === ''

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
    var up = 0
    for (var i = srcPath.length; i >= 0; i--) {
      last = srcPath[i]
      if (last === '.') {
        srcPath.splice(i, 1)
      } else if (last === '..') {
        srcPath.splice(i, 1)
        up++
      } else if (up) {
        srcPath.splice(i, 1)
        up--
      }
    }

  // if the path is allowed to go above the root, restore leading ..s
    if (!mustEndAbs && !removeAllDots) {
      for (; up--; up) {
        srcPath.unshift('..')
      }
    }

    if (mustEndAbs && srcPath[0] !== '' && (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
      srcPath.unshift('')
    }

    if (hasTrailingSlash && srcPath.join('/').substr(-1) !== '/') {
      srcPath.push('')
    }

    var isAbsolute = srcPath[0] === '' || srcPath[0] && srcPath[0].charAt(0) === '/'

  // put the host back
    if (psychotic) {
      result.hostname = result.host = isAbsolute ? '' : srcPath.length ? srcPath.shift() : ''
    // occationaly the auth can get stuck only in host
    // this especially happens in cases like
    // url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false
      if (authInHost) {
        result.auth = authInHost.shift()
        result.host = result.hostname = authInHost.shift()
      }
    }

    mustEndAbs = mustEndAbs || result.host && srcPath.length

    if (mustEndAbs && !isAbsolute) {
      srcPath.unshift('')
    }

    if (!srcPath.length) {
      result.pathname = null
      result.path = null
    } else {
      result.pathname = srcPath.join('/')
    }

  // to support request.http
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '')
    }
    result.auth = relative.auth || result.auth
    result.slashes = result.slashes || relative.slashes
    result.href = result.format()
    return result
  }

  Url.prototype.parseHost = function () {
    return parseHost(this)
  }

  function parseHost (self) {
    var host = self.host
    var port = portPattern.exec(host)
    if (port) {
      port = port[0]
      if (port !== ':') {
        self.port = port.substr(1)
      }
      host = host.substr(0, host.length - port.length)
    }
    if (host) self.hostname = host
  }

  var domain

// This constructor is used to store event handlers. Instantiating this is
// faster than explicitly calling `Object.create(null)` to get a "clean" empty
// object (tested with v8 v4.9).
  function EventHandlers () {}
  EventHandlers.prototype = Object.create(null)

  function EventEmitter () {
    EventEmitter.init.call(this)
  }
// nodejs oddity
// require('events') === require('events').EventEmitter
  EventEmitter.EventEmitter = EventEmitter

  EventEmitter.usingDomains = false

  EventEmitter.prototype.domain = undefined
  EventEmitter.prototype._events = undefined
  EventEmitter.prototype._maxListeners = undefined

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
  EventEmitter.defaultMaxListeners = 10

  EventEmitter.init = function () {
    this.domain = null
    if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
      if (domain.active && !(this instanceof domain.Domain)) {
        this.domain = domain.active
      }
    }

    if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
      this._events = new EventHandlers()
      this._eventsCount = 0
    }

    this._maxListeners = this._maxListeners || undefined
  }

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
  EventEmitter.prototype.setMaxListeners = function setMaxListeners (n) {
    if (typeof n !== 'number' || n < 0 || isNaN(n)) throw new TypeError('"n" argument must be a positive number')
    this._maxListeners = n
    return this
  }

  function $getMaxListeners (that) {
    if (that._maxListeners === undefined) return EventEmitter.defaultMaxListeners
    return that._maxListeners
  }

  EventEmitter.prototype.getMaxListeners = function getMaxListeners () {
    return $getMaxListeners(this)
  }

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
  function emitNone (handler, isFn, self) {
    if (isFn) handler.call(self); else {
      var len = handler.length
      var listeners = arrayClone(handler, len)
      for (var i = 0; i < len; ++i) listeners[i].call(self)
    }
  }
  function emitOne (handler, isFn, self, arg1) {
    if (isFn) handler.call(self, arg1); else {
      var len = handler.length
      var listeners = arrayClone(handler, len)
      for (var i = 0; i < len; ++i) listeners[i].call(self, arg1)
    }
  }
  function emitTwo (handler, isFn, self, arg1, arg2) {
    if (isFn) handler.call(self, arg1, arg2); else {
      var len = handler.length
      var listeners = arrayClone(handler, len)
      for (var i = 0; i < len; ++i) listeners[i].call(self, arg1, arg2)
    }
  }
  function emitThree (handler, isFn, self, arg1, arg2, arg3) {
    if (isFn) handler.call(self, arg1, arg2, arg3); else {
      var len = handler.length
      var listeners = arrayClone(handler, len)
      for (var i = 0; i < len; ++i) listeners[i].call(self, arg1, arg2, arg3)
    }
  }

  function emitMany (handler, isFn, self, args) {
    if (isFn) handler.apply(self, args); else {
      var len = handler.length
      var listeners = arrayClone(handler, len)
      for (var i = 0; i < len; ++i) listeners[i].apply(self, args)
    }
  }

  EventEmitter.prototype.emit = function emit (type) {
    var er, handler, len, args, i, events, domain
    var needDomainExit = false
    var doError = type === 'error'

    events = this._events
    if (events) doError = doError && events.error == null; else if (!doError) return false

    domain = this.domain

  // If there is no 'error' event listener then throw.
    if (doError) {
      er = arguments[1]
      if (domain) {
        if (!er) er = new Error('Uncaught, unspecified "error" event')
        er.domainEmitter = this
        er.domain = domain
        er.domainThrown = false
        domain.emit('error', er)
      } else if (er instanceof Error) {
        throw er // Unhandled 'error' event
      } else {
      // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')')
        err.context = er
        throw err
      }
      return false
    }

    handler = events[type]

    if (!handler) return false

    var isFn = typeof handler === 'function'
    len = arguments.length
    switch (len) {
    // fast cases
      case 1:
        emitNone(handler, isFn, this)
        break
      case 2:
        emitOne(handler, isFn, this, arguments[1])
        break
      case 3:
        emitTwo(handler, isFn, this, arguments[1], arguments[2])
        break
      case 4:
        emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3])
        break
    // slower
      default:
        args = new Array(len - 1)
        for (i = 1; i < len; i++) args[i - 1] = arguments[i]
        emitMany(handler, isFn, this, args)
    }

    if (needDomainExit) domain.exit()

    return true
  }

  function _addListener (target, type, listener, prepend) {
    var m
    var events
    var existing

    if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function')

    events = target._events
    if (!events) {
      events = target._events = new EventHandlers()
      target._eventsCount = 0
    } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
      if (events.newListener) {
        target.emit('newListener', type, listener.listener ? listener.listener : listener)

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
        events = target._events
      }
      existing = events[type]
    }

    if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
      existing = events[type] = listener
      ++target._eventsCount
    } else {
      if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
        existing = events[type] = prepend ? [listener, existing] : [existing, listener]
      } else {
      // If we've already got an array, just append.
        if (prepend) {
          existing.unshift(listener)
        } else {
          existing.push(listener)
        }
      }

    // Check for listener leak
      if (!existing.warned) {
        m = $getMaxListeners(target)
        if (m && m > 0 && existing.length > m) {
          existing.warned = true
          var w = new Error('Possible EventEmitter memory leak detected. ' + existing.length + ' ' + type + ' listeners added. ' + 'Use emitter.setMaxListeners() to increase limit')
          w.name = 'MaxListenersExceededWarning'
          w.emitter = target
          w.type = type
          w.count = existing.length
          emitWarning(w)
        }
      }
    }

    return target
  }
  function emitWarning (e) {
    typeof console.warn === 'function' ? console.warn(e) : console.log(e)
  }
  EventEmitter.prototype.addListener = function addListener (type, listener) {
    return _addListener(this, type, listener, false)
  }

  EventEmitter.prototype.on = EventEmitter.prototype.addListener

  EventEmitter.prototype.prependListener = function prependListener (type, listener) {
    return _addListener(this, type, listener, true)
  }

  function _onceWrap (target, type, listener) {
    var fired = false
    function g () {
      target.removeListener(type, g)
      if (!fired) {
        fired = true
        listener.apply(target, arguments)
      }
    }
    g.listener = listener
    return g
  }

  EventEmitter.prototype.once = function once (type, listener) {
    if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function')
    this.on(type, _onceWrap(this, type, listener))
    return this
  }

  EventEmitter.prototype.prependOnceListener = function prependOnceListener (type, listener) {
    if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function')
    this.prependListener(type, _onceWrap(this, type, listener))
    return this
  }

// emits a 'removeListener' event iff the listener was removed
  EventEmitter.prototype.removeListener = function removeListener (type, listener) {
    var list, events, position, i, originalListener

    if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function')

    events = this._events
    if (!events) return this

    list = events[type]
    if (!list) return this

    if (list === listener || list.listener && list.listener === listener) {
      if (--this._eventsCount === 0) this._events = new EventHandlers(); else {
        delete events[type]
        if (events.removeListener) this.emit('removeListener', type, list.listener || listener)
      }
    } else if (typeof list !== 'function') {
      position = -1

      for (i = list.length; i-- > 0;) {
        if (list[i] === listener || list[i].listener && list[i].listener === listener) {
          originalListener = list[i].listener
          position = i
          break
        }
      }

      if (position < 0) return this

      if (list.length === 1) {
        list[0] = undefined
        if (--this._eventsCount === 0) {
          this._events = new EventHandlers()
          return this
        } else {
          delete events[type]
        }
      } else {
        spliceOne(list, position)
      }

      if (events.removeListener) this.emit('removeListener', type, originalListener || listener)
    }

    return this
  }

  EventEmitter.prototype.removeAllListeners = function removeAllListeners (type) {
    var listeners, events

    events = this._events
    if (!events) return this

  // not listening for removeListener, no need to emit
    if (!events.removeListener) {
      if (arguments.length === 0) {
        this._events = new EventHandlers()
        this._eventsCount = 0
      } else if (events[type]) {
        if (--this._eventsCount === 0) this._events = new EventHandlers(); else delete events[type]
      }
      return this
    }

  // emit removeListener for all listeners on all events
    if (arguments.length === 0) {
      var keys = Object.keys(events)
      for (var i = 0, key; i < keys.length; ++i) {
        key = keys[i]
        if (key === 'removeListener') continue
        this.removeAllListeners(key)
      }
      this.removeAllListeners('removeListener')
      this._events = new EventHandlers()
      this._eventsCount = 0
      return this
    }

    listeners = events[type]

    if (typeof listeners === 'function') {
      this.removeListener(type, listeners)
    } else if (listeners) {
    // LIFO order
      do {
        this.removeListener(type, listeners[listeners.length - 1])
      } while (listeners[0])
    }

    return this
  }

  EventEmitter.prototype.listeners = function listeners (type) {
    var evlistener
    var ret
    var events = this._events

    if (!events) ret = []; else {
      evlistener = events[type]
      if (!evlistener) ret = []; else if (typeof evlistener === 'function') ret = [evlistener.listener || evlistener]; else ret = unwrapListeners(evlistener)
    }

    return ret
  }

  EventEmitter.listenerCount = function (emitter, type) {
    if (typeof emitter.listenerCount === 'function') {
      return emitter.listenerCount(type)
    } else {
      return listenerCount.call(emitter, type)
    }
  }

  EventEmitter.prototype.listenerCount = listenerCount
  function listenerCount (type) {
    var events = this._events

    if (events) {
      var evlistener = events[type]

      if (typeof evlistener === 'function') {
        return 1
      } else if (evlistener) {
        return evlistener.length
      }
    }

    return 0
  }

  EventEmitter.prototype.eventNames = function eventNames () {
    return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : []
  }

// About 1.5x faster than the two-arg version of Array#splice().
  function spliceOne (list, index) {
    for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1) list[i] = list[k]
    list.pop()
  }

  function arrayClone (arr, i) {
    var copy = new Array(i)
    while (i--) copy[i] = arr[i]
    return copy
  }

  function unwrapListeners (arr) {
    var ret = new Array(arr.length)
    for (var i = 0; i < ret.length; ++i) {
      ret[i] = arr[i].listener || arr[i]
    }
    return ret
  }

  var asyncToGenerator = function (fn) {
    return function () {
      var gen = fn.apply(this, arguments)
      return new Promise(function (resolve, reject) {
        function step (key, arg) {
          try {
            var info = gen[key](arg)
            var value = info.value
          } catch (error) {
            reject(error)
            return
          }

          if (info.done) {
            resolve(value)
          } else {
            return Promise.resolve(value).then(function (value) {
              step('next', value)
            }, function (err) {
              step('throw', err)
            })
          }
        }

        return step('next')
      })
    }
  }

  var slicedToArray = (function () {
    function sliceIterator (arr, i) {
      var _arr = []
      var _n = true
      var _d = false
      var _e

      try {
        for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
          _arr.push(_s.value)

          if (i && _arr.length === i) break
        }
      } catch (err) {
        _d = true
        _e = err
      } finally {
        try {
          if (!_n && _i['return']) _i['return']()
        } finally {
          if (_d) throw _e
        }
      }

      return _arr
    }

    return function (arr, i) {
      if (Array.isArray(arr)) {
        return arr
      } else if (Symbol.iterator in Object(arr)) {
        return sliceIterator(arr, i)
      } else {
        throw new TypeError('Invalid attempt to destructure non-iterable instance')
      }
    }
  }())

  var toArray = function (arr) {
    return Array.isArray(arr) ? arr : Array.from(arr)
  }

  const DEFAULTS$1 = {
    reconnect: true,
    resubscribe: true,
    keepAlive: true,
    maxRetries: 10,
    maxRetryDelay: 60 * 1000 // in milli-seconds
  }

  class Socket extends EventEmitter {
    constructor (ScreepsAPI) {
      super()
      this.api = ScreepsAPI
      this.opts = Object.assign({}, DEFAULTS$1)
      this.on('error', () => {}) // catch to prevent unhandled-exception errors
      this.reset()
      this.on('auth', ev => {
        if (ev.data.status === 'ok') {
          while (this.__queue.length) {
            this.emit(this.__queue.shift())
          }
          clearInterval(this.keepAliveInter)
          if (this.opts.keepAlive) {
            this.keepAliveInter = setInterval(() => this.ws && this.ws.ping(1), 10000)
          }
        }
      })
    }
    reset () {
      this.authed = false
      this.connected = false
      this.reconnecting = false
      clearInterval(this.keepAliveInter)
      this.keepAliveInter = 0
      this.__queue = [] // pending messages  (to send once authenticated)
      this.__subQueue = [] // pending subscriptions (to request once authenticated)
      this.__subs = {} // number of callbacks for each subscription
    }
    connect (opts = {}) {
      var _this = this

      return asyncToGenerator(function * () {
        Object.assign(_this.opts, opts)
        if (!_this.api.token) {
          throw new Error('No token! Call api.auth() before connecting the socket!')
        }
        return new Promise(function (resolve, reject) {
          let baseURL = _this.api.opts.url.replace('http', 'ws')
          let wsurl = URL.resolve(baseURL, 'socket/websocket')
          _this.ws = new WebSocket(wsurl)
          _this.ws.on('open', function () {
            _this.connected = true
            _this.reconnecting = false
            if (_this.opts.resubscribe) {
              _this.__subQueue.push(...Object.keys(_this.__subs))
            }
            _this.emit('connected')
            resolve(_this.auth(_this.api.token))
          })
          _this.ws.on('close', function () {
            clearInterval(_this.keepAliveInter)
            _this.authed = false
            _this.connected = false
            _this.emit('disconnected')
            if (_this.opts.reconnect) {
              _this.reconnect().catch(function () { /* error emitted in reconnect() */ })
            }
          })
          _this.ws.on('error', function (err) {
            _this.ws.terminate()
            _this.emit('error', err)
            if (!_this.connected) {
              reject(err)
            }
          })
          _this.ws.on('unexpected-response', function (req, res) {
            let err = new Error(`WS Unexpected Response: ${res.statusCode} ${res.statusMessage}`)
            _this.emit('error', err)
            reject(err)
          })
          _this.ws.on('message', function (data) {
            return _this.handleMessage(data)
          })
        })
      })()
    }
    reconnect () {
      var _this2 = this

      return asyncToGenerator(function * () {
        Object.keys(_this2.__subs).forEach(function (sub) {
          return _this2.subscribe(sub)
        })
        _this2.reconnecting = true
        let retries = 0
        let retry
        do {
          let time = Math.pow(2, retries) * 100
          if (time > _this2.opts.maxRetryDelay) time = _this2.opts.maxRetryDelay
          yield _this2.sleep(time)
          if (!_this2.reconnecting) return // reset() called in-between
          try {
            yield _this2.connect()
            retry = false
          } catch (err) {
            retry = true
          }
          retries++
        } while (retry && retries < _this2.opts.maxRetries)
        if (retry) {
          let err = new Error(`Reconnection failed after ${_this2.opts.maxRetries} retries`)
          _this2.reconnecting = false
          _this2.emit('error', err)
          throw err
        }
      })()
    }
    disconnect () {
      clearInterval(this.keepAliveInter)
      this.ws.removeAllListeners() // remove listeners first or we may trigger reconnection & Co.
      this.ws.terminate()
      this.reset()
      this.emit('disconnected')
    }
    sleep (time) {
      return new Promise((resolve, reject) => {
        setTimeout(resolve, time)
      })
    }
    handleMessage (msg) {
      msg = msg.data || msg // Handle ws/browser difference
      if (msg.slice(0, 3) === 'gz:') {
        msg = this.api.inflate(msg)
      }
      if (msg[0] === '[') {
        msg = JSON.parse(msg)

        var _msg$0$match = msg[0].match(/^(.+):(.+?)(?:\/(.+))?$/),
          _msg$0$match2 = slicedToArray(_msg$0$match, 4)

        let type = _msg$0$match2[1],
          id = _msg$0$match2[2],
          channel = _msg$0$match2[3]

        channel = channel || type
        let event = { channel, id, type, data: msg[1] }
        this.emit(msg[0], event)
        this.emit(event.channel, event)
        this.emit('message', event)
      } else {
        var _msg$split = msg.split(' '),
          _msg$split2 = toArray(_msg$split)

        let channel = _msg$split2[0],
          data = _msg$split2.slice(1)

        let event = { type: 'server', channel, data }
        if (channel === 'auth') {
          event.data = { status: data[0], token: data[1] }
        }
        if (['protocol', 'time', 'package'].includes(channel)) {
          event.data = { [channel]: data[0] }
        }
        this.emit(channel, event)
        this.emit('message', event)
      }
    }
    gzip (bool) {
      var _this3 = this

      return asyncToGenerator(function * () {
        _this3.send(`gzip ${bool ? 'on' : 'off'}`)
      })()
    }
    send (data) {
      var _this4 = this

      return asyncToGenerator(function * () {
        if (!_this4.connected) {
          _this4.__queue.push(data)
        } else {
          _this4.ws.send(data)
        }
      })()
    }
    auth (token) {
      return new Promise((resolve, reject) => {
        this.send(`auth ${token}`)
        this.once('auth', ev => {
          let data = ev.data

          if (data.status === 'ok') {
            this.authed = true
            this.emit('token', data.token)
            this.emit('authed')
            while (this.__subQueue.length) {
              this.send(this.__subQueue.shift())
            }
            resolve()
          } else {
            reject(new Error('socket auth failed'))
          }
        })
      })
    }
    subscribe (path, cb) {
      var _this5 = this

      return asyncToGenerator(function * () {
        if (!path) return
        if (!_this5.api.user) {
          yield _this5.api.me()
        }
        if (!path.match(/^([a-z]+):(.+?)$/)) {
          path = `user:${_this5.api.user._id}/${path}`
        }
        if (_this5.authed) {
          _this5.send(`subscribe ${path}`)
        } else {
          _this5.__subQueue.push(`subscribe ${path}`)
        }
        _this5.emit('subscribe', path)
        _this5.__subs[path] = _this5.__subs[path] || 0
        _this5.__subs[path]++
        if (cb) _this5.on(path, cb)
      })()
    }
    unsubscribe (path) {
      var _this6 = this

      return asyncToGenerator(function * () {
        if (!path) return
        if (!_this6.api.user) {
          yield _this6.api.me()
        }
        if (!path.match(/^([a-z]+):(.+?)$/)) {
          path = `user:${_this6.api.user._id}/${path}`
        }
        _this6.send(`unsubscribe ${path}`)
        _this6.emit('unsubscribe', path)
        if (_this6.__subs[path]) _this6.__subs[path]--
      })()
    }
}

  var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {}

  function createCommonjsModule (fn, module) {
    return module = { exports: {} }, fn(module, module.exports), module.exports
  }

  var es5 = createCommonjsModule(function (module) {
    var isES5 = (function () {
      'use strict'

      return this === undefined
    }())

    if (isES5) {
      module.exports = {
        freeze: Object.freeze,
        defineProperty: Object.defineProperty,
        getDescriptor: Object.getOwnPropertyDescriptor,
        keys: Object.keys,
        names: Object.getOwnPropertyNames,
        getPrototypeOf: Object.getPrototypeOf,
        isArray: Array.isArray,
        isES5: isES5,
        propertyIsWritable: function propertyIsWritable (obj, prop) {
          var descriptor = Object.getOwnPropertyDescriptor(obj, prop)
          return !!(!descriptor || descriptor.writable || descriptor.set)
        }
      }
    } else {
      var has = {}.hasOwnProperty
      var str = {}.toString
      var proto = {}.constructor.prototype

      var ObjectKeys = function ObjectKeys (o) {
        var ret = []
        for (var key in o) {
          if (has.call(o, key)) {
            ret.push(key)
          }
        }
        return ret
      }

      var ObjectGetDescriptor = function ObjectGetDescriptor (o, key) {
        return { value: o[key] }
      }

      var ObjectDefineProperty = function ObjectDefineProperty (o, key, desc) {
        o[key] = desc.value
        return o
      }

      var ObjectFreeze = function ObjectFreeze (obj) {
        return obj
      }

      var ObjectGetPrototypeOf = function ObjectGetPrototypeOf (obj) {
        try {
          return Object(obj).constructor.prototype
        } catch (e) {
          return proto
        }
      }

      var ArrayIsArray = function ArrayIsArray (obj) {
        try {
          return str.call(obj) === '[object Array]'
        } catch (e) {
          return false
        }
      }

      module.exports = {
        isArray: ArrayIsArray,
        keys: ObjectKeys,
        names: ObjectKeys,
        defineProperty: ObjectDefineProperty,
        getDescriptor: ObjectGetDescriptor,
        freeze: ObjectFreeze,
        getPrototypeOf: ObjectGetPrototypeOf,
        isES5: isES5,
        propertyIsWritable: function propertyIsWritable () {
          return true
        }
      }
    }
  })

  var canEvaluate = typeof navigator === 'undefined'

  var errorObj = { e: {} }
  var tryCatchTarget
  var globalObject = typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof commonjsGlobal !== 'undefined' ? commonjsGlobal : commonjsGlobal !== undefined ? commonjsGlobal : null

  function tryCatcher () {
    try {
      var target = tryCatchTarget
      tryCatchTarget = null
      return target.apply(this, arguments)
    } catch (e) {
      errorObj.e = e
      return errorObj
    }
  }
  function tryCatch (fn) {
    tryCatchTarget = fn
    return tryCatcher
  }

  var inherits$3 = function inherits (Child, Parent) {
    var hasProp = {}.hasOwnProperty

    function T () {
      this.constructor = Child
      this.constructor$ = Parent
      for (var propertyName in Parent.prototype) {
        if (hasProp.call(Parent.prototype, propertyName) && propertyName.charAt(propertyName.length - 1) !== '$') {
          this[propertyName + '$'] = Parent.prototype[propertyName]
        }
      }
    }
    T.prototype = Parent.prototype
    Child.prototype = new T()
    return Child.prototype
  }

  function isPrimitive$1 (val) {
    return val == null || val === true || val === false || typeof val === 'string' || typeof val === 'number'
  }

  function isObject$1 (value) {
    return typeof value === 'function' || typeof value === 'object' && value !== null
  }

  function maybeWrapAsError (maybeError) {
    if (!isPrimitive$1(maybeError)) return maybeError

    return new Error(safeToString(maybeError))
  }

  function withAppended (target, appendee) {
    var len = target.length
    var ret = new Array(len + 1)
    var i
    for (i = 0; i < len; ++i) {
      ret[i] = target[i]
    }
    ret[i] = appendee
    return ret
  }

  function getDataPropertyOrDefault (obj, key, defaultValue) {
    if (es5.isES5) {
      var desc = Object.getOwnPropertyDescriptor(obj, key)

      if (desc != null) {
        return desc.get == null && desc.set == null ? desc.value : defaultValue
      }
    } else {
      return {}.hasOwnProperty.call(obj, key) ? obj[key] : undefined
    }
  }

  function notEnumerableProp (obj, name, value) {
    if (isPrimitive$1(obj)) return obj
    var descriptor = {
      value: value,
      configurable: true,
      enumerable: false,
      writable: true
    }
    es5.defineProperty(obj, name, descriptor)
    return obj
  }

  function thrower (r) {
    throw r
  }

  var inheritedDataKeys = (function () {
    var excludedPrototypes = [Array.prototype, Object.prototype, Function.prototype]

    var isExcludedProto = function isExcludedProto (val) {
      for (var i = 0; i < excludedPrototypes.length; ++i) {
        if (excludedPrototypes[i] === val) {
          return true
        }
      }
      return false
    }

    if (es5.isES5) {
      var getKeys = Object.getOwnPropertyNames
      return function (obj) {
        var ret = []
        var visitedKeys = Object.create(null)
        while (obj != null && !isExcludedProto(obj)) {
          var keys
          try {
            keys = getKeys(obj)
          } catch (e) {
            return ret
          }
          for (var i = 0; i < keys.length; ++i) {
            var key = keys[i]
            if (visitedKeys[key]) continue
            visitedKeys[key] = true
            var desc = Object.getOwnPropertyDescriptor(obj, key)
            if (desc != null && desc.get == null && desc.set == null) {
              ret.push(key)
            }
          }
          obj = es5.getPrototypeOf(obj)
        }
        return ret
      }
    } else {
      var hasProp = {}.hasOwnProperty
      return function (obj) {
        if (isExcludedProto(obj)) return []
        var ret = []

            /* jshint forin:false */
        enumeration: for (var key in obj) {
          if (hasProp.call(obj, key)) {
            ret.push(key)
          } else {
            for (var i = 0; i < excludedPrototypes.length; ++i) {
              if (hasProp.call(excludedPrototypes[i], key)) {
                continue enumeration
              }
            }
            ret.push(key)
          }
        }
        return ret
      }
    }
  }())

  var thisAssignmentPattern = /this\s*\.\s*\S+\s*=/
  function isClass (fn) {
    try {
      if (typeof fn === 'function') {
        var keys = es5.names(fn.prototype)

        var hasMethods = es5.isES5 && keys.length > 1
        var hasMethodsOtherThanConstructor = keys.length > 0 && !(keys.length === 1 && keys[0] === 'constructor')
        var hasThisAssignmentAndStaticMethods = thisAssignmentPattern.test(fn + '') && es5.names(fn).length > 0

        if (hasMethods || hasMethodsOtherThanConstructor || hasThisAssignmentAndStaticMethods) {
          return true
        }
      }
      return false
    } catch (e) {
      return false
    }
  }

  function toFastProperties (obj) {
    /* jshint -W027,-W055,-W031 */
    function FakeConstructor () {}
    FakeConstructor.prototype = obj
    var l = 8
    while (l--) new FakeConstructor()
    return obj
    eval(obj)
  }

  var rident = /^[a-z$_][a-z$_0-9]*$/i
  function isIdentifier (str) {
    return rident.test(str)
  }

  function filledRange (count, prefix, suffix) {
    var ret = new Array(count)
    for (var i = 0; i < count; ++i) {
      ret[i] = prefix + i + suffix
    }
    return ret
  }

  function safeToString (obj) {
    try {
      return obj + ''
    } catch (e) {
      return '[no string representation]'
    }
  }

  function isError$1 (obj) {
    return obj instanceof Error || obj !== null && typeof obj === 'object' && typeof obj.message === 'string' && typeof obj.name === 'string'
  }

  function markAsOriginatingFromRejection (e) {
    try {
      notEnumerableProp(e, 'isOperational', true)
    } catch (ignore) {}
  }

  function originatesFromRejection (e) {
    if (e == null) return false
    return e instanceof Error['__BluebirdErrorTypes__'].OperationalError || e['isOperational'] === true
  }

  function canAttachTrace (obj) {
    return isError$1(obj) && es5.propertyIsWritable(obj, 'stack')
  }

  var ensureErrorObject = (function () {
    if (!('stack' in new Error())) {
      return function (value) {
        if (canAttachTrace(value)) return value
        try {
          throw new Error(safeToString(value))
        } catch (err) {
          return err
        }
      }
    } else {
      return function (value) {
        if (canAttachTrace(value)) return value
        return new Error(safeToString(value))
      }
    }
  }())

  function classString (obj) {
    return {}.toString.call(obj)
  }

  function copyDescriptors (from, to, filter) {
    var keys = es5.names(from)
    for (var i = 0; i < keys.length; ++i) {
      var key = keys[i]
      if (filter(key)) {
        try {
          es5.defineProperty(to, key, es5.getDescriptor(from, key))
        } catch (ignore) {}
      }
    }
  }

  var asArray = function asArray (v) {
    if (es5.isArray(v)) {
      return v
    }
    return null
  }

  if (typeof Symbol !== 'undefined' && Symbol.iterator) {
    var ArrayFrom = typeof Array.from === 'function' ? function (v) {
      return Array.from(v)
    } : function (v) {
      var ret = []
      var it = v[Symbol.iterator]()
      var itResult
      while (!(itResult = it.next()).done) {
        ret.push(itResult.value)
      }
      return ret
    }

    asArray = function asArray (v) {
      if (es5.isArray(v)) {
        return v
      } else if (v != null && typeof v[Symbol.iterator] === 'function') {
        return ArrayFrom(v)
      }
      return null
    }
  }

  var isNode = typeof process !== 'undefined' && classString(process).toLowerCase() === '[object process]'

  var hasEnvVariables = typeof process !== 'undefined' && typeof process.env !== 'undefined'

  function env$1 (key) {
    return hasEnvVariables ? process.env[key] : undefined
  }

  function getNativePromise () {
    if (typeof Promise === 'function') {
      try {
        var promise = new Promise(function () {})
        if ({}.toString.call(promise) === '[object Promise]') {
          return Promise
        }
      } catch (e) {}
    }
  }

  function domainBind (self, cb) {
    return self.bind(cb)
  }

  var ret = {
    isClass: isClass,
    isIdentifier: isIdentifier,
    inheritedDataKeys: inheritedDataKeys,
    getDataPropertyOrDefault: getDataPropertyOrDefault,
    thrower: thrower,
    isArray: es5.isArray,
    asArray: asArray,
    notEnumerableProp: notEnumerableProp,
    isPrimitive: isPrimitive$1,
    isObject: isObject$1,
    isError: isError$1,
    canEvaluate: canEvaluate,
    errorObj: errorObj,
    tryCatch: tryCatch,
    inherits: inherits$3,
    withAppended: withAppended,
    maybeWrapAsError: maybeWrapAsError,
    toFastProperties: toFastProperties,
    filledRange: filledRange,
    toString: safeToString,
    canAttachTrace: canAttachTrace,
    ensureErrorObject: ensureErrorObject,
    originatesFromRejection: originatesFromRejection,
    markAsOriginatingFromRejection: markAsOriginatingFromRejection,
    classString: classString,
    copyDescriptors: copyDescriptors,
    hasDevTools: typeof chrome !== 'undefined' && chrome && typeof chrome.loadTimes === 'function',
    isNode: isNode,
    hasEnvVariables: hasEnvVariables,
    env: env$1,
    global: globalObject,
    getNativePromise: getNativePromise,
    domainBind: domainBind
  }
  ret.isRecentNode = ret.isNode && (function () {
    var version = process.versions.node.split('.').map(Number)
    return version[0] === 0 && version[1] > 10 || version[0] > 0
  }())

  if (ret.isNode) ret.toFastProperties(process)

  try {
    throw new Error()
  } catch (e) {
    ret.lastLineError = e
  }
  var util$1 = ret

  var schedule
  var noAsyncScheduler = function noAsyncScheduler () {
    throw new Error('No async scheduler available\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
  }
  var NativePromise = util$1.getNativePromise()
  if (util$1.isNode && typeof MutationObserver === 'undefined') {
    var GlobalSetImmediate = commonjsGlobal.setImmediate
    var ProcessNextTick = process.nextTick
    schedule = util$1.isRecentNode ? function (fn) {
      GlobalSetImmediate.call(commonjsGlobal, fn)
    } : function (fn) {
      ProcessNextTick.call(process, fn)
    }
  } else if (typeof NativePromise === 'function' && typeof NativePromise.resolve === 'function') {
    var nativePromise = NativePromise.resolve()
    schedule = function schedule (fn) {
      nativePromise.then(fn)
    }
  } else if (typeof MutationObserver !== 'undefined' && !(typeof window !== 'undefined' && window.navigator && (window.navigator.standalone || window.cordova))) {
    schedule = (function () {
      var div = document.createElement('div')
      var opts = { attributes: true }
      var toggleScheduled = false
      var div2 = document.createElement('div')
      var o2 = new MutationObserver(function () {
        div.classList.toggle('foo')
        toggleScheduled = false
      })
      o2.observe(div2, opts)

      var scheduleToggle = function scheduleToggle () {
        if (toggleScheduled) return
        toggleScheduled = true
        div2.classList.toggle('foo')
      }

      return function schedule (fn) {
        var o = new MutationObserver(function () {
          o.disconnect()
          fn()
        })
        o.observe(div, opts)
        scheduleToggle()
      }
    }())
  } else if (typeof setImmediate !== 'undefined') {
    schedule = function schedule (fn) {
      setImmediate(fn)
    }
  } else if (typeof setTimeout !== 'undefined') {
    schedule = function schedule (fn) {
      setTimeout(fn, 0)
    }
  } else {
    schedule = noAsyncScheduler
  }
  var schedule_1 = schedule

  function arrayMove (src, srcIndex, dst, dstIndex, len) {
    for (var j = 0; j < len; ++j) {
      dst[j + dstIndex] = src[j + srcIndex]
      src[j + srcIndex] = void 0
    }
  }

  function Queue (capacity) {
    this._capacity = capacity
    this._length = 0
    this._front = 0
  }

  Queue.prototype._willBeOverCapacity = function (size) {
    return this._capacity < size
  }

  Queue.prototype._pushOne = function (arg) {
    var length = this.length()
    this._checkCapacity(length + 1)
    var i = this._front + length & this._capacity - 1
    this[i] = arg
    this._length = length + 1
  }

  Queue.prototype.push = function (fn, receiver, arg) {
    var length = this.length() + 3
    if (this._willBeOverCapacity(length)) {
      this._pushOne(fn)
      this._pushOne(receiver)
      this._pushOne(arg)
      return
    }
    var j = this._front + length - 3
    this._checkCapacity(length)
    var wrapMask = this._capacity - 1
    this[j + 0 & wrapMask] = fn
    this[j + 1 & wrapMask] = receiver
    this[j + 2 & wrapMask] = arg
    this._length = length
  }

  Queue.prototype.shift = function () {
    var front = this._front,
      ret = this[front]

    this[front] = undefined
    this._front = front + 1 & this._capacity - 1
    this._length--
    return ret
  }

  Queue.prototype.length = function () {
    return this._length
  }

  Queue.prototype._checkCapacity = function (size) {
    if (this._capacity < size) {
      this._resizeTo(this._capacity << 1)
    }
  }

  Queue.prototype._resizeTo = function (capacity) {
    var oldCapacity = this._capacity
    this._capacity = capacity
    var front = this._front
    var length = this._length
    var moveItemsCount = front + length & oldCapacity - 1
    arrayMove(this, 0, this, oldCapacity, moveItemsCount)
  }

  var queue$1 = Queue

  var firstLineError
  try {
    throw new Error()
  } catch (e) {
    firstLineError = e
  }

  function Async () {
    this._customScheduler = false
    this._isTickUsed = false
    this._lateQueue = new queue$1(16)
    this._normalQueue = new queue$1(16)
    this._haveDrainedQueues = false
    this._trampolineEnabled = true
    var self = this
    this.drainQueues = function () {
      self._drainQueues()
    }
    this._schedule = schedule_1
  }

  Async.prototype.setScheduler = function (fn) {
    var prev = this._schedule
    this._schedule = fn
    this._customScheduler = true
    return prev
  }

  Async.prototype.hasCustomScheduler = function () {
    return this._customScheduler
  }

  Async.prototype.enableTrampoline = function () {
    this._trampolineEnabled = true
  }

  Async.prototype.disableTrampolineIfNecessary = function () {
    if (util$1.hasDevTools) {
      this._trampolineEnabled = false
    }
  }

  Async.prototype.haveItemsQueued = function () {
    return this._isTickUsed || this._haveDrainedQueues
  }

  Async.prototype.fatalError = function (e, isNode) {
    if (isNode) {
      process.stderr.write('Fatal ' + (e instanceof Error ? e.stack : e) + '\n')
      process.exit(2)
    } else {
      this.throwLater(e)
    }
  }

  Async.prototype.throwLater = function (fn, arg) {
    if (arguments.length === 1) {
      arg = fn
      fn = function fn () {
        throw arg
      }
    }
    if (typeof setTimeout !== 'undefined') {
      setTimeout(function () {
        fn(arg)
      }, 0)
    } else {
      try {
        this._schedule(function () {
          fn(arg)
        })
      } catch (e) {
        throw new Error('No async scheduler available\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }
    }
  }

  function AsyncInvokeLater (fn, receiver, arg) {
    this._lateQueue.push(fn, receiver, arg)
    this._queueTick()
  }

  function AsyncInvoke (fn, receiver, arg) {
    this._normalQueue.push(fn, receiver, arg)
    this._queueTick()
  }

  function AsyncSettlePromises (promise) {
    this._normalQueue._pushOne(promise)
    this._queueTick()
  }

  if (!util$1.hasDevTools) {
    Async.prototype.invokeLater = AsyncInvokeLater
    Async.prototype.invoke = AsyncInvoke
    Async.prototype.settlePromises = AsyncSettlePromises
  } else {
    Async.prototype.invokeLater = function (fn, receiver, arg) {
      if (this._trampolineEnabled) {
        AsyncInvokeLater.call(this, fn, receiver, arg)
      } else {
        this._schedule(function () {
          setTimeout(function () {
            fn.call(receiver, arg)
          }, 100)
        })
      }
    }

    Async.prototype.invoke = function (fn, receiver, arg) {
      if (this._trampolineEnabled) {
        AsyncInvoke.call(this, fn, receiver, arg)
      } else {
        this._schedule(function () {
          fn.call(receiver, arg)
        })
      }
    }

    Async.prototype.settlePromises = function (promise) {
      if (this._trampolineEnabled) {
        AsyncSettlePromises.call(this, promise)
      } else {
        this._schedule(function () {
          promise._settlePromises()
        })
      }
    }
  }

  Async.prototype._drainQueue = function (queue) {
    while (queue.length() > 0) {
      var fn = queue.shift()
      if (typeof fn !== 'function') {
        fn._settlePromises()
        continue
      }
      var receiver = queue.shift()
      var arg = queue.shift()
      fn.call(receiver, arg)
    }
  }

  Async.prototype._drainQueues = function () {
    this._drainQueue(this._normalQueue)
    this._reset()
    this._haveDrainedQueues = true
    this._drainQueue(this._lateQueue)
  }

  Async.prototype._queueTick = function () {
    if (!this._isTickUsed) {
      this._isTickUsed = true
      this._schedule(this.drainQueues)
    }
  }

  Async.prototype._reset = function () {
    this._isTickUsed = false
  }

  var async = Async
  var firstLineError_1 = firstLineError

  async.firstLineError = firstLineError_1

  var Objectfreeze = es5.freeze

  var inherits$4 = util$1.inherits
  var notEnumerableProp$1 = util$1.notEnumerableProp

  function subError (nameProperty, defaultMessage) {
    function SubError (message) {
      if (!(this instanceof SubError)) return new SubError(message)
      notEnumerableProp$1(this, 'message', typeof message === 'string' ? message : defaultMessage)
      notEnumerableProp$1(this, 'name', nameProperty)
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor)
      } else {
        Error.call(this)
      }
    }
    inherits$4(SubError, Error)
    return SubError
  }

  var _TypeError
  var _RangeError
  var Warning = subError('Warning', 'warning')
  var CancellationError = subError('CancellationError', 'cancellation error')
  var TimeoutError = subError('TimeoutError', 'timeout error')
  var AggregateError = subError('AggregateError', 'aggregate error')
  try {
    _TypeError = TypeError
    _RangeError = RangeError
  } catch (e) {
    _TypeError = subError('TypeError', 'type error')
    _RangeError = subError('RangeError', 'range error')
  }

  var methods = ('join pop push shift unshift slice filter forEach some ' + 'every map indexOf lastIndexOf reduce reduceRight sort reverse').split(' ')

  for (var i = 0; i < methods.length; ++i) {
    if (typeof Array.prototype[methods[i]] === 'function') {
      AggregateError.prototype[methods[i]] = Array.prototype[methods[i]]
    }
  }

  es5.defineProperty(AggregateError.prototype, 'length', {
    value: 0,
    configurable: false,
    writable: true,
    enumerable: true
  })
  AggregateError.prototype['isOperational'] = true
  var level = 0
  AggregateError.prototype.toString = function () {
    var indent = Array(level * 4 + 1).join(' ')
    var ret = '\n' + indent + 'AggregateError of:' + '\n'
    level++
    indent = Array(level * 4 + 1).join(' ')
    for (var i = 0; i < this.length; ++i) {
      var str = this[i] === this ? '[Circular AggregateError]' : this[i] + ''
      var lines = str.split('\n')
      for (var j = 0; j < lines.length; ++j) {
        lines[j] = indent + lines[j]
      }
      str = lines.join('\n')
      ret += str + '\n'
    }
    level--
    return ret
  }

  function OperationalError (message) {
    if (!(this instanceof OperationalError)) return new OperationalError(message)
    notEnumerableProp$1(this, 'name', 'OperationalError')
    notEnumerableProp$1(this, 'message', message)
    this.cause = message
    this['isOperational'] = true

    if (message instanceof Error) {
      notEnumerableProp$1(this, 'message', message.message)
      notEnumerableProp$1(this, 'stack', message.stack)
    } else if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
  inherits$4(OperationalError, Error)

  var errorTypes = Error['__BluebirdErrorTypes__']
  if (!errorTypes) {
    errorTypes = Objectfreeze({
      CancellationError: CancellationError,
      TimeoutError: TimeoutError,
      OperationalError: OperationalError,
      RejectionError: OperationalError,
      AggregateError: AggregateError
    })
    es5.defineProperty(Error, '__BluebirdErrorTypes__', {
      value: errorTypes,
      writable: false,
      enumerable: false,
      configurable: false
    })
  }

  var errors$1 = {
    Error: Error,
    TypeError: _TypeError,
    RangeError: _RangeError,
    CancellationError: errorTypes.CancellationError,
    OperationalError: errorTypes.OperationalError,
    TimeoutError: errorTypes.TimeoutError,
    AggregateError: errorTypes.AggregateError,
    Warning: Warning
  }

  var thenables = function thenables (Promise, INTERNAL) {
    var util = util$1
    var errorObj = util.errorObj
    var isObject = util.isObject

    function tryConvertToPromise (obj, context) {
      if (isObject(obj)) {
        if (obj instanceof Promise) return obj
        var then = getThen(obj)
        if (then === errorObj) {
          if (context) context._pushContext()
          var ret = Promise.reject(then.e)
          if (context) context._popContext()
          return ret
        } else if (typeof then === 'function') {
          if (isAnyBluebirdPromise(obj)) {
            var ret = new Promise(INTERNAL)
            obj._then(ret._fulfill, ret._reject, undefined, ret, null)
            return ret
          }
          return doThenable(obj, then, context)
        }
      }
      return obj
    }

    function doGetThen (obj) {
      return obj.then
    }

    function getThen (obj) {
      try {
        return doGetThen(obj)
      } catch (e) {
        errorObj.e = e
        return errorObj
      }
    }

    var hasProp = {}.hasOwnProperty
    function isAnyBluebirdPromise (obj) {
      try {
        return hasProp.call(obj, '_promise0')
      } catch (e) {
        return false
      }
    }

    function doThenable (x, then, context) {
      var promise = new Promise(INTERNAL)
      var ret = promise
      if (context) context._pushContext()
      promise._captureStackTrace()
      if (context) context._popContext()
      var synchronous = true
      var result = util.tryCatch(then).call(x, resolve, reject)
      synchronous = false

      if (promise && result === errorObj) {
        promise._rejectCallback(result.e, true, true)
        promise = null
      }

      function resolve (value) {
        if (!promise) return
        promise._resolveCallback(value)
        promise = null
      }

      function reject (reason) {
        if (!promise) return
        promise._rejectCallback(reason, synchronous, true)
        promise = null
      }
      return ret
    }

    return tryConvertToPromise
  }

  var promise_array = function promise_array (Promise, INTERNAL, tryConvertToPromise, apiRejection, Proxyable) {
    var util = util$1
    var isArray = util.isArray

    function toResolutionValue (val) {
      switch (val) {
        case -2:
          return []
        case -3:
          return {}
        case -6:
          return new Map()
      }
    }

    function PromiseArray (values) {
      var promise = this._promise = new Promise(INTERNAL)
      if (values instanceof Promise) {
        promise._propagateFrom(values, 3)
      }
      promise._setOnCancel(this)
      this._values = values
      this._length = 0
      this._totalResolved = 0
      this._init(undefined, -2)
    }
    util.inherits(PromiseArray, Proxyable)

    PromiseArray.prototype.length = function () {
      return this._length
    }

    PromiseArray.prototype.promise = function () {
      return this._promise
    }

    PromiseArray.prototype._init = function init (_, resolveValueIfEmpty) {
      var values = tryConvertToPromise(this._values, this._promise)
      if (values instanceof Promise) {
        values = values._target()
        var bitField = values._bitField

        this._values = values

        if ((bitField & 50397184) === 0) {
          this._promise._setAsyncGuaranteed()
          return values._then(init, this._reject, undefined, this, resolveValueIfEmpty)
        } else if ((bitField & 33554432) !== 0) {
          values = values._value()
        } else if ((bitField & 16777216) !== 0) {
          return this._reject(values._reason())
        } else {
          return this._cancel()
        }
      }
      values = util.asArray(values)
      if (values === null) {
        var err = apiRejection('expecting an array or an iterable object but got ' + util.classString(values)).reason()
        this._promise._rejectCallback(err, false)
        return
      }

      if (values.length === 0) {
        if (resolveValueIfEmpty === -5) {
          this._resolveEmptyArray()
        } else {
          this._resolve(toResolutionValue(resolveValueIfEmpty))
        }
        return
      }
      this._iterate(values)
    }

    PromiseArray.prototype._iterate = function (values) {
      var len = this.getActualLength(values.length)
      this._length = len
      this._values = this.shouldCopyValues() ? new Array(len) : this._values
      var result = this._promise
      var isResolved = false
      var bitField = null
      for (var i = 0; i < len; ++i) {
        var maybePromise = tryConvertToPromise(values[i], result)

        if (maybePromise instanceof Promise) {
          maybePromise = maybePromise._target()
          bitField = maybePromise._bitField
        } else {
          bitField = null
        }

        if (isResolved) {
          if (bitField !== null) {
            maybePromise.suppressUnhandledRejections()
          }
        } else if (bitField !== null) {
          if ((bitField & 50397184) === 0) {
            maybePromise._proxy(this, i)
            this._values[i] = maybePromise
          } else if ((bitField & 33554432) !== 0) {
            isResolved = this._promiseFulfilled(maybePromise._value(), i)
          } else if ((bitField & 16777216) !== 0) {
            isResolved = this._promiseRejected(maybePromise._reason(), i)
          } else {
            isResolved = this._promiseCancelled(i)
          }
        } else {
          isResolved = this._promiseFulfilled(maybePromise, i)
        }
      }
      if (!isResolved) result._setAsyncGuaranteed()
    }

    PromiseArray.prototype._isResolved = function () {
      return this._values === null
    }

    PromiseArray.prototype._resolve = function (value) {
      this._values = null
      this._promise._fulfill(value)
    }

    PromiseArray.prototype._cancel = function () {
      if (this._isResolved() || !this._promise._isCancellable()) return
      this._values = null
      this._promise._cancel()
    }

    PromiseArray.prototype._reject = function (reason) {
      this._values = null
      this._promise._rejectCallback(reason, false)
    }

    PromiseArray.prototype._promiseFulfilled = function (value, index) {
      this._values[index] = value
      var totalResolved = ++this._totalResolved
      if (totalResolved >= this._length) {
        this._resolve(this._values)
        return true
      }
      return false
    }

    PromiseArray.prototype._promiseCancelled = function () {
      this._cancel()
      return true
    }

    PromiseArray.prototype._promiseRejected = function (reason) {
      this._totalResolved++
      this._reject(reason)
      return true
    }

    PromiseArray.prototype._resultCancelled = function () {
      if (this._isResolved()) return
      var values = this._values
      this._cancel()
      if (values instanceof Promise) {
        values.cancel()
      } else {
        for (var i = 0; i < values.length; ++i) {
          if (values[i] instanceof Promise) {
            values[i].cancel()
          }
        }
      }
    }

    PromiseArray.prototype.shouldCopyValues = function () {
      return true
    }

    PromiseArray.prototype.getActualLength = function (len) {
      return len
    }

    return PromiseArray
  }

  var context = function context (Promise) {
    var longStackTraces = false
    var contextStack = []

    Promise.prototype._promiseCreated = function () {}
    Promise.prototype._pushContext = function () {}
    Promise.prototype._popContext = function () {
      return null
    }
    Promise._peekContext = Promise.prototype._peekContext = function () {}

    function Context () {
      this._trace = new Context.CapturedTrace(peekContext())
    }
    Context.prototype._pushContext = function () {
      if (this._trace !== undefined) {
        this._trace._promiseCreated = null
        contextStack.push(this._trace)
      }
    }

    Context.prototype._popContext = function () {
      if (this._trace !== undefined) {
        var trace = contextStack.pop()
        var ret = trace._promiseCreated
        trace._promiseCreated = null
        return ret
      }
      return null
    }

    function createContext () {
      if (longStackTraces) return new Context()
    }

    function peekContext () {
      var lastIndex = contextStack.length - 1
      if (lastIndex >= 0) {
        return contextStack[lastIndex]
      }
      return undefined
    }
    Context.CapturedTrace = null
    Context.create = createContext
    Context.deactivateLongStackTraces = function () {}
    Context.activateLongStackTraces = function () {
      var Promise_pushContext = Promise.prototype._pushContext
      var Promise_popContext = Promise.prototype._popContext
      var Promise_PeekContext = Promise._peekContext
      var Promise_peekContext = Promise.prototype._peekContext
      var Promise_promiseCreated = Promise.prototype._promiseCreated
      Context.deactivateLongStackTraces = function () {
        Promise.prototype._pushContext = Promise_pushContext
        Promise.prototype._popContext = Promise_popContext
        Promise._peekContext = Promise_PeekContext
        Promise.prototype._peekContext = Promise_peekContext
        Promise.prototype._promiseCreated = Promise_promiseCreated
        longStackTraces = false
      }
      longStackTraces = true
      Promise.prototype._pushContext = Context.prototype._pushContext
      Promise.prototype._popContext = Context.prototype._popContext
      Promise._peekContext = Promise.prototype._peekContext = peekContext
      Promise.prototype._promiseCreated = function () {
        var ctx = this._peekContext()
        if (ctx && ctx._promiseCreated == null) ctx._promiseCreated = this
      }
    }
    return Context
  }

  var debuggability = function debuggability (Promise, Context) {
    var getDomain = Promise._getDomain
    var async = Promise._async
    var Warning = errors$1.Warning
    var util = util$1
    var canAttachTrace = util.canAttachTrace
    var unhandledRejectionHandled
    var possiblyUnhandledRejection
    var bluebirdFramePattern = /[\\\/]bluebird[\\\/]js[\\\/](release|debug|instrumented)/
    var nodeFramePattern = /\((?:timers\.js):\d+:\d+\)/
    var parseLinePattern = /[\/<\(](.+?):(\d+):(\d+)\)?\s*$/
    var stackFramePattern = null
    var formatStack = null
    var indentStackFrames = false
    var printWarning
    var debugging = !!(util.env('BLUEBIRD_DEBUG') != 0 && (false || util.env('BLUEBIRD_DEBUG') || util.env('NODE_ENV') === 'development'))

    var warnings = !!(util.env('BLUEBIRD_WARNINGS') != 0 && (debugging || util.env('BLUEBIRD_WARNINGS')))

    var longStackTraces = !!(util.env('BLUEBIRD_LONG_STACK_TRACES') != 0 && (debugging || util.env('BLUEBIRD_LONG_STACK_TRACES')))

    var wForgottenReturn = util.env('BLUEBIRD_W_FORGOTTEN_RETURN') != 0 && (warnings || !!util.env('BLUEBIRD_W_FORGOTTEN_RETURN'))

    Promise.prototype.suppressUnhandledRejections = function () {
      var target = this._target()
      target._bitField = target._bitField & ~1048576 | 524288
    }

    Promise.prototype._ensurePossibleRejectionHandled = function () {
      if ((this._bitField & 524288) !== 0) return
      this._setRejectionIsUnhandled()
      var self = this
      setTimeout(function () {
        self._notifyUnhandledRejection()
      }, 1)
    }

    Promise.prototype._notifyUnhandledRejectionIsHandled = function () {
      fireRejectionEvent('rejectionHandled', unhandledRejectionHandled, undefined, this)
    }

    Promise.prototype._setReturnedNonUndefined = function () {
      this._bitField = this._bitField | 268435456
    }

    Promise.prototype._returnedNonUndefined = function () {
      return (this._bitField & 268435456) !== 0
    }

    Promise.prototype._notifyUnhandledRejection = function () {
      if (this._isRejectionUnhandled()) {
        var reason = this._settledValue()
        this._setUnhandledRejectionIsNotified()
        fireRejectionEvent('unhandledRejection', possiblyUnhandledRejection, reason, this)
      }
    }

    Promise.prototype._setUnhandledRejectionIsNotified = function () {
      this._bitField = this._bitField | 262144
    }

    Promise.prototype._unsetUnhandledRejectionIsNotified = function () {
      this._bitField = this._bitField & ~262144
    }

    Promise.prototype._isUnhandledRejectionNotified = function () {
      return (this._bitField & 262144) > 0
    }

    Promise.prototype._setRejectionIsUnhandled = function () {
      this._bitField = this._bitField | 1048576
    }

    Promise.prototype._unsetRejectionIsUnhandled = function () {
      this._bitField = this._bitField & ~1048576
      if (this._isUnhandledRejectionNotified()) {
        this._unsetUnhandledRejectionIsNotified()
        this._notifyUnhandledRejectionIsHandled()
      }
    }

    Promise.prototype._isRejectionUnhandled = function () {
      return (this._bitField & 1048576) > 0
    }

    Promise.prototype._warn = function (message, shouldUseOwnTrace, promise) {
      return warn(message, shouldUseOwnTrace, promise || this)
    }

    Promise.onPossiblyUnhandledRejection = function (fn) {
      var domain = getDomain()
      possiblyUnhandledRejection = typeof fn === 'function' ? domain === null ? fn : util.domainBind(domain, fn) : undefined
    }

    Promise.onUnhandledRejectionHandled = function (fn) {
      var domain = getDomain()
      unhandledRejectionHandled = typeof fn === 'function' ? domain === null ? fn : util.domainBind(domain, fn) : undefined
    }

    var disableLongStackTraces = function disableLongStackTraces () {}
    Promise.longStackTraces = function () {
      if (async.haveItemsQueued() && !config.longStackTraces) {
        throw new Error('cannot enable long stack traces after promises have been created\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }
      if (!config.longStackTraces && longStackTracesIsSupported()) {
        var Promise_captureStackTrace = Promise.prototype._captureStackTrace
        var Promise_attachExtraTrace = Promise.prototype._attachExtraTrace
        config.longStackTraces = true
        disableLongStackTraces = function disableLongStackTraces () {
          if (async.haveItemsQueued() && !config.longStackTraces) {
            throw new Error('cannot enable long stack traces after promises have been created\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
          }
          Promise.prototype._captureStackTrace = Promise_captureStackTrace
          Promise.prototype._attachExtraTrace = Promise_attachExtraTrace
          Context.deactivateLongStackTraces()
          async.enableTrampoline()
          config.longStackTraces = false
        }
        Promise.prototype._captureStackTrace = longStackTracesCaptureStackTrace
        Promise.prototype._attachExtraTrace = longStackTracesAttachExtraTrace
        Context.activateLongStackTraces()
        async.disableTrampolineIfNecessary()
      }
    }

    Promise.hasLongStackTraces = function () {
      return config.longStackTraces && longStackTracesIsSupported()
    }

    var fireDomEvent = (function () {
      try {
        if (typeof CustomEvent === 'function') {
          var event = new CustomEvent('CustomEvent')
          util.global.dispatchEvent(event)
          return function (name, event) {
            var domEvent = new CustomEvent(name.toLowerCase(), {
              detail: event,
              cancelable: true
            })
            return !util.global.dispatchEvent(domEvent)
          }
        } else if (typeof Event === 'function') {
          var event = new Event('CustomEvent')
          util.global.dispatchEvent(event)
          return function (name, event) {
            var domEvent = new Event(name.toLowerCase(), {
              cancelable: true
            })
            domEvent.detail = event
            return !util.global.dispatchEvent(domEvent)
          }
        } else {
          var event = document.createEvent('CustomEvent')
          event.initCustomEvent('testingtheevent', false, true, {})
          util.global.dispatchEvent(event)
          return function (name, event) {
            var domEvent = document.createEvent('CustomEvent')
            domEvent.initCustomEvent(name.toLowerCase(), false, true, event)
            return !util.global.dispatchEvent(domEvent)
          }
        }
      } catch (e) {}
      return function () {
        return false
      }
    }())

    var fireGlobalEvent = (function () {
      if (util.isNode) {
        return function () {
          return process.emit.apply(process, arguments)
        }
      } else {
        if (!util.global) {
          return function () {
            return false
          }
        }
        return function (name) {
          var methodName = 'on' + name.toLowerCase()
          var method = util.global[methodName]
          if (!method) return false
          method.apply(util.global, [].slice.call(arguments, 1))
          return true
        }
      }
    }())

    function generatePromiseLifecycleEventObject (name, promise) {
      return { promise: promise }
    }

    var eventToObjectGenerator = {
      promiseCreated: generatePromiseLifecycleEventObject,
      promiseFulfilled: generatePromiseLifecycleEventObject,
      promiseRejected: generatePromiseLifecycleEventObject,
      promiseResolved: generatePromiseLifecycleEventObject,
      promiseCancelled: generatePromiseLifecycleEventObject,
      promiseChained: function promiseChained (name, promise, child) {
        return { promise: promise, child: child }
      },
      warning: function warning (name, _warning) {
        return { warning: _warning }
      },
      unhandledRejection: function unhandledRejection (name, reason, promise) {
        return { reason: reason, promise: promise }
      },
      rejectionHandled: generatePromiseLifecycleEventObject
    }

    var activeFireEvent = function activeFireEvent (name) {
      var globalEventFired = false
      try {
        globalEventFired = fireGlobalEvent.apply(null, arguments)
      } catch (e) {
        async.throwLater(e)
        globalEventFired = true
      }

      var domEventFired = false
      try {
        domEventFired = fireDomEvent(name, eventToObjectGenerator[name].apply(null, arguments))
      } catch (e) {
        async.throwLater(e)
        domEventFired = true
      }

      return domEventFired || globalEventFired
    }

    Promise.config = function (opts) {
      opts = Object(opts)
      if ('longStackTraces' in opts) {
        if (opts.longStackTraces) {
          Promise.longStackTraces()
        } else if (!opts.longStackTraces && Promise.hasLongStackTraces()) {
          disableLongStackTraces()
        }
      }
      if ('warnings' in opts) {
        var warningsOption = opts.warnings
        config.warnings = !!warningsOption
        wForgottenReturn = config.warnings

        if (util.isObject(warningsOption)) {
          if ('wForgottenReturn' in warningsOption) {
            wForgottenReturn = !!warningsOption.wForgottenReturn
          }
        }
      }
      if ('cancellation' in opts && opts.cancellation && !config.cancellation) {
        if (async.haveItemsQueued()) {
          throw new Error('cannot enable cancellation after promises are in use')
        }
        Promise.prototype._clearCancellationData = cancellationClearCancellationData
        Promise.prototype._propagateFrom = cancellationPropagateFrom
        Promise.prototype._onCancel = cancellationOnCancel
        Promise.prototype._setOnCancel = cancellationSetOnCancel
        Promise.prototype._attachCancellationCallback = cancellationAttachCancellationCallback
        Promise.prototype._execute = cancellationExecute
        _propagateFromFunction = cancellationPropagateFrom
        config.cancellation = true
      }
      if ('monitoring' in opts) {
        if (opts.monitoring && !config.monitoring) {
          config.monitoring = true
          Promise.prototype._fireEvent = activeFireEvent
        } else if (!opts.monitoring && config.monitoring) {
          config.monitoring = false
          Promise.prototype._fireEvent = defaultFireEvent
        }
      }
      return Promise
    }

    function defaultFireEvent () {
      return false
    }

    Promise.prototype._fireEvent = defaultFireEvent
    Promise.prototype._execute = function (executor, resolve, reject) {
      try {
        executor(resolve, reject)
      } catch (e) {
        return e
      }
    }
    Promise.prototype._onCancel = function () {}
    Promise.prototype._setOnCancel = function (handler) {

    }
    Promise.prototype._attachCancellationCallback = function (onCancel) {

    }
    Promise.prototype._captureStackTrace = function () {}
    Promise.prototype._attachExtraTrace = function () {}
    Promise.prototype._clearCancellationData = function () {}
    Promise.prototype._propagateFrom = function (parent, flags) {

    }

    function cancellationExecute (executor, resolve, reject) {
      var promise = this
      try {
        executor(resolve, reject, function (onCancel) {
          if (typeof onCancel !== 'function') {
            throw new TypeError('onCancel must be a function, got: ' + util.toString(onCancel))
          }
          promise._attachCancellationCallback(onCancel)
        })
      } catch (e) {
        return e
      }
    }

    function cancellationAttachCancellationCallback (onCancel) {
      if (!this._isCancellable()) return this

      var previousOnCancel = this._onCancel()
      if (previousOnCancel !== undefined) {
        if (util.isArray(previousOnCancel)) {
          previousOnCancel.push(onCancel)
        } else {
          this._setOnCancel([previousOnCancel, onCancel])
        }
      } else {
        this._setOnCancel(onCancel)
      }
    }

    function cancellationOnCancel () {
      return this._onCancelField
    }

    function cancellationSetOnCancel (onCancel) {
      this._onCancelField = onCancel
    }

    function cancellationClearCancellationData () {
      this._cancellationParent = undefined
      this._onCancelField = undefined
    }

    function cancellationPropagateFrom (parent, flags) {
      if ((flags & 1) !== 0) {
        this._cancellationParent = parent
        var branchesRemainingToCancel = parent._branchesRemainingToCancel
        if (branchesRemainingToCancel === undefined) {
          branchesRemainingToCancel = 0
        }
        parent._branchesRemainingToCancel = branchesRemainingToCancel + 1
      }
      if ((flags & 2) !== 0 && parent._isBound()) {
        this._setBoundTo(parent._boundTo)
      }
    }

    function bindingPropagateFrom (parent, flags) {
      if ((flags & 2) !== 0 && parent._isBound()) {
        this._setBoundTo(parent._boundTo)
      }
    }
    var _propagateFromFunction = bindingPropagateFrom

    function _boundValueFunction () {
      var ret = this._boundTo
      if (ret !== undefined) {
        if (ret instanceof Promise) {
          if (ret.isFulfilled()) {
            return ret.value()
          } else {
            return undefined
          }
        }
      }
      return ret
    }

    function longStackTracesCaptureStackTrace () {
      this._trace = new CapturedTrace(this._peekContext())
    }

    function longStackTracesAttachExtraTrace (error, ignoreSelf) {
      if (canAttachTrace(error)) {
        var trace = this._trace
        if (trace !== undefined) {
          if (ignoreSelf) trace = trace._parent
        }
        if (trace !== undefined) {
          trace.attachExtraTrace(error)
        } else if (!error.__stackCleaned__) {
          var parsed = parseStackAndMessage(error)
          util.notEnumerableProp(error, 'stack', parsed.message + '\n' + parsed.stack.join('\n'))
          util.notEnumerableProp(error, '__stackCleaned__', true)
        }
      }
    }

    function checkForgottenReturns (returnValue, promiseCreated, name, promise, parent) {
      if (returnValue === undefined && promiseCreated !== null && wForgottenReturn) {
        if (parent !== undefined && parent._returnedNonUndefined()) return
        if ((promise._bitField & 65535) === 0) return

        if (name) name = name + ' '
        var handlerLine = ''
        var creatorLine = ''
        if (promiseCreated._trace) {
          var traceLines = promiseCreated._trace.stack.split('\n')
          var stack = cleanStack(traceLines)
          for (var i = stack.length - 1; i >= 0; --i) {
            var line = stack[i]
            if (!nodeFramePattern.test(line)) {
              var lineMatches = line.match(parseLinePattern)
              if (lineMatches) {
                handlerLine = 'at ' + lineMatches[1] + ':' + lineMatches[2] + ':' + lineMatches[3] + ' '
              }
              break
            }
          }

          if (stack.length > 0) {
            var firstUserLine = stack[0]
            for (var i = 0; i < traceLines.length; ++i) {
              if (traceLines[i] === firstUserLine) {
                if (i > 0) {
                  creatorLine = '\n' + traceLines[i - 1]
                }
                break
              }
            }
          }
        }
        var msg = 'a promise was created in a ' + name + 'handler ' + handlerLine + 'but was not returned from it, ' + 'see http://goo.gl/rRqMUw' + creatorLine
        promise._warn(msg, true, promiseCreated)
      }
    }

    function deprecated (name, replacement) {
      var message = name + ' is deprecated and will be removed in a future version.'
      if (replacement) message += ' Use ' + replacement + ' instead.'
      return warn(message)
    }

    function warn (message, shouldUseOwnTrace, promise) {
      if (!config.warnings) return
      var warning = new Warning(message)
      var ctx
      if (shouldUseOwnTrace) {
        promise._attachExtraTrace(warning)
      } else if (config.longStackTraces && (ctx = Promise._peekContext())) {
        ctx.attachExtraTrace(warning)
      } else {
        var parsed = parseStackAndMessage(warning)
        warning.stack = parsed.message + '\n' + parsed.stack.join('\n')
      }

      if (!activeFireEvent('warning', warning)) {
        formatAndLogError(warning, '', true)
      }
    }

    function reconstructStack (message, stacks) {
      for (var i = 0; i < stacks.length - 1; ++i) {
        stacks[i].push('From previous event:')
        stacks[i] = stacks[i].join('\n')
      }
      if (i < stacks.length) {
        stacks[i] = stacks[i].join('\n')
      }
      return message + '\n' + stacks.join('\n')
    }

    function removeDuplicateOrEmptyJumps (stacks) {
      for (var i = 0; i < stacks.length; ++i) {
        if (stacks[i].length === 0 || i + 1 < stacks.length && stacks[i][0] === stacks[i + 1][0]) {
          stacks.splice(i, 1)
          i--
        }
      }
    }

    function removeCommonRoots (stacks) {
      var current = stacks[0]
      for (var i = 1; i < stacks.length; ++i) {
        var prev = stacks[i]
        var currentLastIndex = current.length - 1
        var currentLastLine = current[currentLastIndex]
        var commonRootMeetPoint = -1

        for (var j = prev.length - 1; j >= 0; --j) {
          if (prev[j] === currentLastLine) {
            commonRootMeetPoint = j
            break
          }
        }

        for (var j = commonRootMeetPoint; j >= 0; --j) {
          var line = prev[j]
          if (current[currentLastIndex] === line) {
            current.pop()
            currentLastIndex--
          } else {
            break
          }
        }
        current = prev
      }
    }

    function cleanStack (stack) {
      var ret = []
      for (var i = 0; i < stack.length; ++i) {
        var line = stack[i]
        var isTraceLine = line === '    (No stack trace)' || stackFramePattern.test(line)
        var isInternalFrame = isTraceLine && shouldIgnore(line)
        if (isTraceLine && !isInternalFrame) {
          if (indentStackFrames && line.charAt(0) !== ' ') {
            line = '    ' + line
          }
          ret.push(line)
        }
      }
      return ret
    }

    function stackFramesAsArray (error) {
      var stack = error.stack.replace(/\s+$/g, '').split('\n')
      for (var i = 0; i < stack.length; ++i) {
        var line = stack[i]
        if (line === '    (No stack trace)' || stackFramePattern.test(line)) {
          break
        }
      }
      if (i > 0 && error.name != 'SyntaxError') {
        stack = stack.slice(i)
      }
      return stack
    }

    function parseStackAndMessage (error) {
      var stack = error.stack
      var message = error.toString()
      stack = typeof stack === 'string' && stack.length > 0 ? stackFramesAsArray(error) : ['    (No stack trace)']
      return {
        message: message,
        stack: error.name == 'SyntaxError' ? stack : cleanStack(stack)
      }
    }

    function formatAndLogError (error, title, isSoft) {
      if (typeof console !== 'undefined') {
        var message
        if (util.isObject(error)) {
          var stack = error.stack
          message = title + formatStack(stack, error)
        } else {
          message = title + String(error)
        }
        if (typeof printWarning === 'function') {
          printWarning(message, isSoft)
        } else if (typeof console.log === 'function' || typeof console.log === 'object') {
          console.log(message)
        }
      }
    }

    function fireRejectionEvent (name, localHandler, reason, promise) {
      var localEventFired = false
      try {
        if (typeof localHandler === 'function') {
          localEventFired = true
          if (name === 'rejectionHandled') {
            localHandler(promise)
          } else {
            localHandler(reason, promise)
          }
        }
      } catch (e) {
        async.throwLater(e)
      }

      if (name === 'unhandledRejection') {
        if (!activeFireEvent(name, reason, promise) && !localEventFired) {
          formatAndLogError(reason, 'Unhandled rejection ')
        }
      } else {
        activeFireEvent(name, promise)
      }
    }

    function formatNonError (obj) {
      var str
      if (typeof obj === 'function') {
        str = '[function ' + (obj.name || 'anonymous') + ']'
      } else {
        str = obj && typeof obj.toString === 'function' ? obj.toString() : util.toString(obj)
        var ruselessToString = /\[object [a-zA-Z0-9$_]+\]/
        if (ruselessToString.test(str)) {
          try {
            var newStr = JSON.stringify(obj)
            str = newStr
          } catch (e) {}
        }
        if (str.length === 0) {
          str = '(empty array)'
        }
      }
      return '(<' + snip(str) + '>, no stack trace)'
    }

    function snip (str) {
      var maxChars = 41
      if (str.length < maxChars) {
        return str
      }
      return str.substr(0, maxChars - 3) + '...'
    }

    function longStackTracesIsSupported () {
      return typeof captureStackTrace === 'function'
    }

    var shouldIgnore = function shouldIgnore () {
      return false
    }
    var parseLineInfoRegex = /[\/<\(]([^:\/]+):(\d+):(?:\d+)\)?\s*$/
    function parseLineInfo (line) {
      var matches = line.match(parseLineInfoRegex)
      if (matches) {
        return {
          fileName: matches[1],
          line: parseInt(matches[2], 10)
        }
      }
    }

    function setBounds (firstLineError, lastLineError) {
      if (!longStackTracesIsSupported()) return
      var firstStackLines = firstLineError.stack.split('\n')
      var lastStackLines = lastLineError.stack.split('\n')
      var firstIndex = -1
      var lastIndex = -1
      var firstFileName
      var lastFileName
      for (var i = 0; i < firstStackLines.length; ++i) {
        var result = parseLineInfo(firstStackLines[i])
        if (result) {
          firstFileName = result.fileName
          firstIndex = result.line
          break
        }
      }
      for (var i = 0; i < lastStackLines.length; ++i) {
        var result = parseLineInfo(lastStackLines[i])
        if (result) {
          lastFileName = result.fileName
          lastIndex = result.line
          break
        }
      }
      if (firstIndex < 0 || lastIndex < 0 || !firstFileName || !lastFileName || firstFileName !== lastFileName || firstIndex >= lastIndex) {
        return
      }

      shouldIgnore = function shouldIgnore (line) {
        if (bluebirdFramePattern.test(line)) return true
        var info = parseLineInfo(line)
        if (info) {
          if (info.fileName === firstFileName && firstIndex <= info.line && info.line <= lastIndex) {
            return true
          }
        }
        return false
      }
    }

    function CapturedTrace (parent) {
      this._parent = parent
      this._promisesCreated = 0
      var length = this._length = 1 + (parent === undefined ? 0 : parent._length)
      captureStackTrace(this, CapturedTrace)
      if (length > 32) this.uncycle()
    }
    util.inherits(CapturedTrace, Error)
    Context.CapturedTrace = CapturedTrace

    CapturedTrace.prototype.uncycle = function () {
      var length = this._length
      if (length < 2) return
      var nodes = []
      var stackToIndex = {}

      for (var i = 0, node = this; node !== undefined; ++i) {
        nodes.push(node)
        node = node._parent
      }
      length = this._length = i
      for (var i = length - 1; i >= 0; --i) {
        var stack = nodes[i].stack
        if (stackToIndex[stack] === undefined) {
          stackToIndex[stack] = i
        }
      }
      for (var i = 0; i < length; ++i) {
        var currentStack = nodes[i].stack
        var index = stackToIndex[currentStack]
        if (index !== undefined && index !== i) {
          if (index > 0) {
            nodes[index - 1]._parent = undefined
            nodes[index - 1]._length = 1
          }
          nodes[i]._parent = undefined
          nodes[i]._length = 1
          var cycleEdgeNode = i > 0 ? nodes[i - 1] : this

          if (index < length - 1) {
            cycleEdgeNode._parent = nodes[index + 1]
            cycleEdgeNode._parent.uncycle()
            cycleEdgeNode._length = cycleEdgeNode._parent._length + 1
          } else {
            cycleEdgeNode._parent = undefined
            cycleEdgeNode._length = 1
          }
          var currentChildLength = cycleEdgeNode._length + 1
          for (var j = i - 2; j >= 0; --j) {
            nodes[j]._length = currentChildLength
            currentChildLength++
          }
          return
        }
      }
    }

    CapturedTrace.prototype.attachExtraTrace = function (error) {
      if (error.__stackCleaned__) return
      this.uncycle()
      var parsed = parseStackAndMessage(error)
      var message = parsed.message
      var stacks = [parsed.stack]

      var trace = this
      while (trace !== undefined) {
        stacks.push(cleanStack(trace.stack.split('\n')))
        trace = trace._parent
      }
      removeCommonRoots(stacks)
      removeDuplicateOrEmptyJumps(stacks)
      util.notEnumerableProp(error, 'stack', reconstructStack(message, stacks))
      util.notEnumerableProp(error, '__stackCleaned__', true)
    }

    var captureStackTrace = (function stackDetection () {
      var v8stackFramePattern = /^\s*at\s*/
      var v8stackFormatter = function v8stackFormatter (stack, error) {
        if (typeof stack === 'string') return stack

        if (error.name !== undefined && error.message !== undefined) {
          return error.toString()
        }
        return formatNonError(error)
      }

      if (typeof Error.stackTraceLimit === 'number' && typeof Error.captureStackTrace === 'function') {
        Error.stackTraceLimit += 6
        stackFramePattern = v8stackFramePattern
        formatStack = v8stackFormatter
        var captureStackTrace = Error.captureStackTrace

        shouldIgnore = function shouldIgnore (line) {
          return bluebirdFramePattern.test(line)
        }
        return function (receiver, ignoreUntil) {
          Error.stackTraceLimit += 6
          captureStackTrace(receiver, ignoreUntil)
          Error.stackTraceLimit -= 6
        }
      }
      var err = new Error()

      if (typeof err.stack === 'string' && err.stack.split('\n')[0].indexOf('stackDetection@') >= 0) {
        stackFramePattern = /@/
        formatStack = v8stackFormatter
        indentStackFrames = true
        return function captureStackTrace (o) {
          o.stack = new Error().stack
        }
      }

      var hasStackAfterThrow
      try {
        throw new Error()
      } catch (e) {
        hasStackAfterThrow = 'stack' in e
      }
      if (!('stack' in err) && hasStackAfterThrow && typeof Error.stackTraceLimit === 'number') {
        stackFramePattern = v8stackFramePattern
        formatStack = v8stackFormatter
        return function captureStackTrace (o) {
          Error.stackTraceLimit += 6
          try {
            throw new Error()
          } catch (e) {
            o.stack = e.stack
          }
          Error.stackTraceLimit -= 6
        }
      }

      formatStack = function formatStack (stack, error) {
        if (typeof stack === 'string') return stack

        if ((typeof error === 'object' || typeof error === 'function') && error.name !== undefined && error.message !== undefined) {
          return error.toString()
        }
        return formatNonError(error)
      }

      return null
    }([]))

    if (typeof console !== 'undefined' && typeof console.warn !== 'undefined') {
      printWarning = function printWarning (message) {
        console.warn(message)
      }
      if (util.isNode && process.stderr.isTTY) {
        printWarning = function printWarning (message, isSoft) {
          var color = isSoft ? '\u001b[33m' : '\u001b[31m'
          console.warn(color + message + '\u001b[0m\n')
        }
      } else if (!util.isNode && typeof new Error().stack === 'string') {
        printWarning = function printWarning (message, isSoft) {
          console.warn('%c' + message, isSoft ? 'color: darkorange' : 'color: red')
        }
      }
    }

    var config = {
      warnings: warnings,
      longStackTraces: false,
      cancellation: false,
      monitoring: false
    }

    if (longStackTraces) Promise.longStackTraces()

    return {
      longStackTraces: function longStackTraces () {
        return config.longStackTraces
      },
      warnings: function warnings () {
        return config.warnings
      },
      cancellation: function cancellation () {
        return config.cancellation
      },
      monitoring: function monitoring () {
        return config.monitoring
      },
      propagateFromFunction: function propagateFromFunction () {
        return _propagateFromFunction
      },
      boundValueFunction: function boundValueFunction () {
        return _boundValueFunction
      },
      checkForgottenReturns: checkForgottenReturns,
      setBounds: setBounds,
      warn: warn,
      deprecated: deprecated,
      CapturedTrace: CapturedTrace,
      fireDomEvent: fireDomEvent,
      fireGlobalEvent: fireGlobalEvent
    }
  }

  var catch_filter = function catch_filter (NEXT_FILTER) {
    var util = util$1
    var getKeys = es5.keys
    var tryCatch = util.tryCatch
    var errorObj = util.errorObj

    function catchFilter (instances, cb, promise) {
      return function (e) {
        var boundTo = promise._boundValue()
        predicateLoop: for (var i = 0; i < instances.length; ++i) {
          var item = instances[i]

          if (item === Error || item != null && item.prototype instanceof Error) {
            if (e instanceof item) {
              return tryCatch(cb).call(boundTo, e)
            }
          } else if (typeof item === 'function') {
            var matchesPredicate = tryCatch(item).call(boundTo, e)
            if (matchesPredicate === errorObj) {
              return matchesPredicate
            } else if (matchesPredicate) {
              return tryCatch(cb).call(boundTo, e)
            }
          } else if (util.isObject(e)) {
            var keys = getKeys(item)
            for (var j = 0; j < keys.length; ++j) {
              var key = keys[j]
              if (item[key] != e[key]) {
                continue predicateLoop
              }
            }
            return tryCatch(cb).call(boundTo, e)
          }
        }
        return NEXT_FILTER
      }
    }

    return catchFilter
  }

  var _finally = function _finally (Promise, tryConvertToPromise, NEXT_FILTER) {
    var util = util$1
    var CancellationError = Promise.CancellationError
    var errorObj = util.errorObj
    var catchFilter = catch_filter(NEXT_FILTER)

    function PassThroughHandlerContext (promise, type, handler) {
      this.promise = promise
      this.type = type
      this.handler = handler
      this.called = false
      this.cancelPromise = null
    }

    PassThroughHandlerContext.prototype.isFinallyHandler = function () {
      return this.type === 0
    }

    function FinallyHandlerCancelReaction (finallyHandler) {
      this.finallyHandler = finallyHandler
    }

    FinallyHandlerCancelReaction.prototype._resultCancelled = function () {
      checkCancel(this.finallyHandler)
    }

    function checkCancel (ctx, reason) {
      if (ctx.cancelPromise != null) {
        if (arguments.length > 1) {
          ctx.cancelPromise._reject(reason)
        } else {
          ctx.cancelPromise._cancel()
        }
        ctx.cancelPromise = null
        return true
      }
      return false
    }

    function succeed () {
      return finallyHandler.call(this, this.promise._target()._settledValue())
    }
    function fail (reason) {
      if (checkCancel(this, reason)) return
      errorObj.e = reason
      return errorObj
    }
    function finallyHandler (reasonOrValue) {
      var promise = this.promise
      var handler = this.handler

      if (!this.called) {
        this.called = true
        var ret = this.isFinallyHandler() ? handler.call(promise._boundValue()) : handler.call(promise._boundValue(), reasonOrValue)
        if (ret === NEXT_FILTER) {
          return ret
        } else if (ret !== undefined) {
          promise._setReturnedNonUndefined()
          var maybePromise = tryConvertToPromise(ret, promise)
          if (maybePromise instanceof Promise) {
            if (this.cancelPromise != null) {
              if (maybePromise._isCancelled()) {
                var reason = new CancellationError('late cancellation observer')
                promise._attachExtraTrace(reason)
                errorObj.e = reason
                return errorObj
              } else if (maybePromise.isPending()) {
                maybePromise._attachCancellationCallback(new FinallyHandlerCancelReaction(this))
              }
            }
            return maybePromise._then(succeed, fail, undefined, this, undefined)
          }
        }
      }

      if (promise.isRejected()) {
        checkCancel(this)
        errorObj.e = reasonOrValue
        return errorObj
      } else {
        checkCancel(this)
        return reasonOrValue
      }
    }

    Promise.prototype._passThrough = function (handler, type, success, fail) {
      if (typeof handler !== 'function') return this.then()
      return this._then(success, fail, undefined, new PassThroughHandlerContext(this, type, handler), undefined)
    }

    Promise.prototype.lastly = Promise.prototype['finally'] = function (handler) {
      return this._passThrough(handler, 0, finallyHandler, finallyHandler)
    }

    Promise.prototype.tap = function (handler) {
      return this._passThrough(handler, 1, finallyHandler)
    }

    Promise.prototype.tapCatch = function (handlerOrPredicate) {
      var len = arguments.length
      if (len === 1) {
        return this._passThrough(handlerOrPredicate, 1, undefined, finallyHandler)
      } else {
        var catchInstances = new Array(len - 1),
          j = 0,
          i
        for (i = 0; i < len - 1; ++i) {
          var item = arguments[i]
          if (util.isObject(item)) {
            catchInstances[j++] = item
          } else {
            return Promise.reject(new TypeError('tapCatch statement predicate: ' + 'expecting an object but got ' + util.classString(item)))
          }
        }
        catchInstances.length = j
        var handler = arguments[i]
        return this._passThrough(catchFilter(catchInstances, handler, this), 1, undefined, finallyHandler)
      }
    }

    return PassThroughHandlerContext
  }

  var maybeWrapAsError$1 = util$1.maybeWrapAsError

  var OperationalError$1 = errors$1.OperationalError

  function isUntypedError (obj) {
    return obj instanceof Error && es5.getPrototypeOf(obj) === Error.prototype
  }

  var rErrorKey = /^(?:name|message|stack|cause)$/
  function wrapAsOperationalError (obj) {
    var ret
    if (isUntypedError(obj)) {
      ret = new OperationalError$1(obj)
      ret.name = obj.name
      ret.message = obj.message
      ret.stack = obj.stack
      var keys = es5.keys(obj)
      for (var i = 0; i < keys.length; ++i) {
        var key = keys[i]
        if (!rErrorKey.test(key)) {
          ret[key] = obj[key]
        }
      }
      return ret
    }
    util$1.markAsOriginatingFromRejection(obj)
    return obj
  }

  function nodebackForPromise (promise, multiArgs) {
    return function (err, value) {
      if (promise === null) return
      if (err) {
        var wrapped = wrapAsOperationalError(maybeWrapAsError$1(err))
        promise._attachExtraTrace(wrapped)
        promise._reject(wrapped)
      } else if (!multiArgs) {
        promise._fulfill(value)
      } else {
        var $_len = arguments.length; var args = new Array(Math.max($_len - 1, 0)); for (var $_i = 1; $_i < $_len; ++$_i) {
          args[$_i - 1] = arguments[$_i]
        }
        promise._fulfill(args)
      }
      promise = null
    }
  }

  var nodeback = nodebackForPromise

  var method = function method (Promise, INTERNAL, tryConvertToPromise, apiRejection, debug) {
    var util = util$1
    var tryCatch = util.tryCatch

    Promise.method = function (fn) {
      if (typeof fn !== 'function') {
        throw new Promise.TypeError('expecting a function but got ' + util.classString(fn))
      }
      return function () {
        var ret = new Promise(INTERNAL)
        ret._captureStackTrace()
        ret._pushContext()
        var value = tryCatch(fn).apply(this, arguments)
        var promiseCreated = ret._popContext()
        debug.checkForgottenReturns(value, promiseCreated, 'Promise.method', ret)
        ret._resolveFromSyncValue(value)
        return ret
      }
    }

    Promise.attempt = Promise['try'] = function (fn) {
      if (typeof fn !== 'function') {
        return apiRejection('expecting a function but got ' + util.classString(fn))
      }
      var ret = new Promise(INTERNAL)
      ret._captureStackTrace()
      ret._pushContext()
      var value
      if (arguments.length > 1) {
        debug.deprecated('calling Promise.try with more than 1 argument')
        var arg = arguments[1]
        var ctx = arguments[2]
        value = util.isArray(arg) ? tryCatch(fn).apply(ctx, arg) : tryCatch(fn).call(ctx, arg)
      } else {
        value = tryCatch(fn)()
      }
      var promiseCreated = ret._popContext()
      debug.checkForgottenReturns(value, promiseCreated, 'Promise.try', ret)
      ret._resolveFromSyncValue(value)
      return ret
    }

    Promise.prototype._resolveFromSyncValue = function (value) {
      if (value === util.errorObj) {
        this._rejectCallback(value.e, false)
      } else {
        this._resolveCallback(value, true)
      }
    }
  }

  var bind = function bind (Promise, INTERNAL, tryConvertToPromise, debug) {
    var calledBind = false
    var rejectThis = function rejectThis (_, e) {
      this._reject(e)
    }

    var targetRejected = function targetRejected (e, context) {
      context.promiseRejectionQueued = true
      context.bindingPromise._then(rejectThis, rejectThis, null, this, e)
    }

    var bindingResolved = function bindingResolved (thisArg, context) {
      if ((this._bitField & 50397184) === 0) {
        this._resolveCallback(context.target)
      }
    }

    var bindingRejected = function bindingRejected (e, context) {
      if (!context.promiseRejectionQueued) this._reject(e)
    }

    Promise.prototype.bind = function (thisArg) {
      if (!calledBind) {
        calledBind = true
        Promise.prototype._propagateFrom = debug.propagateFromFunction()
        Promise.prototype._boundValue = debug.boundValueFunction()
      }
      var maybePromise = tryConvertToPromise(thisArg)
      var ret = new Promise(INTERNAL)
      ret._propagateFrom(this, 1)
      var target = this._target()
      ret._setBoundTo(maybePromise)
      if (maybePromise instanceof Promise) {
        var context = {
          promiseRejectionQueued: false,
          promise: ret,
          target: target,
          bindingPromise: maybePromise
        }
        target._then(INTERNAL, targetRejected, undefined, ret, context)
        maybePromise._then(bindingResolved, bindingRejected, undefined, ret, context)
        ret._setOnCancel(maybePromise)
      } else {
        ret._resolveCallback(target)
      }
      return ret
    }

    Promise.prototype._setBoundTo = function (obj) {
      if (obj !== undefined) {
        this._bitField = this._bitField | 2097152
        this._boundTo = obj
      } else {
        this._bitField = this._bitField & ~2097152
      }
    }

    Promise.prototype._isBound = function () {
      return (this._bitField & 2097152) === 2097152
    }

    Promise.bind = function (thisArg, value) {
      return Promise.resolve(value).bind(thisArg)
    }
  }

  var cancel = function cancel (Promise, PromiseArray, apiRejection, debug) {
    var util = util$1
    var tryCatch = util.tryCatch
    var errorObj = util.errorObj
    var async = Promise._async

    Promise.prototype['break'] = Promise.prototype.cancel = function () {
      if (!debug.cancellation()) return this._warn('cancellation is disabled')

      var promise = this
      var child = promise
      while (promise._isCancellable()) {
        if (!promise._cancelBy(child)) {
          if (child._isFollowing()) {
            child._followee().cancel()
          } else {
            child._cancelBranched()
          }
          break
        }

        var parent = promise._cancellationParent
        if (parent == null || !parent._isCancellable()) {
          if (promise._isFollowing()) {
            promise._followee().cancel()
          } else {
            promise._cancelBranched()
          }
          break
        } else {
          if (promise._isFollowing()) promise._followee().cancel()
          promise._setWillBeCancelled()
          child = promise
          promise = parent
        }
      }
    }

    Promise.prototype._branchHasCancelled = function () {
      this._branchesRemainingToCancel--
    }

    Promise.prototype._enoughBranchesHaveCancelled = function () {
      return this._branchesRemainingToCancel === undefined || this._branchesRemainingToCancel <= 0
    }

    Promise.prototype._cancelBy = function (canceller) {
      if (canceller === this) {
        this._branchesRemainingToCancel = 0
        this._invokeOnCancel()
        return true
      } else {
        this._branchHasCancelled()
        if (this._enoughBranchesHaveCancelled()) {
          this._invokeOnCancel()
          return true
        }
      }
      return false
    }

    Promise.prototype._cancelBranched = function () {
      if (this._enoughBranchesHaveCancelled()) {
        this._cancel()
      }
    }

    Promise.prototype._cancel = function () {
      if (!this._isCancellable()) return
      this._setCancelled()
      async.invoke(this._cancelPromises, this, undefined)
    }

    Promise.prototype._cancelPromises = function () {
      if (this._length() > 0) this._settlePromises()
    }

    Promise.prototype._unsetOnCancel = function () {
      this._onCancelField = undefined
    }

    Promise.prototype._isCancellable = function () {
      return this.isPending() && !this._isCancelled()
    }

    Promise.prototype.isCancellable = function () {
      return this.isPending() && !this.isCancelled()
    }

    Promise.prototype._doInvokeOnCancel = function (onCancelCallback, internalOnly) {
      if (util.isArray(onCancelCallback)) {
        for (var i = 0; i < onCancelCallback.length; ++i) {
          this._doInvokeOnCancel(onCancelCallback[i], internalOnly)
        }
      } else if (onCancelCallback !== undefined) {
        if (typeof onCancelCallback === 'function') {
          if (!internalOnly) {
            var e = tryCatch(onCancelCallback).call(this._boundValue())
            if (e === errorObj) {
              this._attachExtraTrace(e.e)
              async.throwLater(e.e)
            }
          }
        } else {
          onCancelCallback._resultCancelled(this)
        }
      }
    }

    Promise.prototype._invokeOnCancel = function () {
      var onCancelCallback = this._onCancel()
      this._unsetOnCancel()
      async.invoke(this._doInvokeOnCancel, this, onCancelCallback)
    }

    Promise.prototype._invokeInternalOnCancel = function () {
      if (this._isCancellable()) {
        this._doInvokeOnCancel(this._onCancel(), true)
        this._unsetOnCancel()
      }
    }

    Promise.prototype._resultCancelled = function () {
      this.cancel()
    }
  }

  var direct_resolve = function direct_resolve (Promise) {
    function returner () {
      return this.value
    }
    function thrower () {
      throw this.reason
    }

    Promise.prototype['return'] = Promise.prototype.thenReturn = function (value) {
      if (value instanceof Promise) value.suppressUnhandledRejections()
      return this._then(returner, undefined, undefined, { value: value }, undefined)
    }

    Promise.prototype['throw'] = Promise.prototype.thenThrow = function (reason) {
      return this._then(thrower, undefined, undefined, { reason: reason }, undefined)
    }

    Promise.prototype.catchThrow = function (reason) {
      if (arguments.length <= 1) {
        return this._then(undefined, thrower, undefined, { reason: reason }, undefined)
      } else {
        var _reason = arguments[1]
        var handler = function handler () {
          throw _reason
        }
        return this.caught(reason, handler)
      }
    }

    Promise.prototype.catchReturn = function (value) {
      if (arguments.length <= 1) {
        if (value instanceof Promise) value.suppressUnhandledRejections()
        return this._then(undefined, returner, undefined, { value: value }, undefined)
      } else {
        var _value = arguments[1]
        if (_value instanceof Promise) _value.suppressUnhandledRejections()
        var handler = function handler () {
          return _value
        }
        return this.caught(value, handler)
      }
    }
  }

  var synchronous_inspection = function synchronous_inspection (Promise) {
    function PromiseInspection (promise) {
      if (promise !== undefined) {
        promise = promise._target()
        this._bitField = promise._bitField
        this._settledValueField = promise._isFateSealed() ? promise._settledValue() : undefined
      } else {
        this._bitField = 0
        this._settledValueField = undefined
      }
    }

    PromiseInspection.prototype._settledValue = function () {
      return this._settledValueField
    }

    var value = PromiseInspection.prototype.value = function () {
      if (!this.isFulfilled()) {
        throw new TypeError('cannot get fulfillment value of a non-fulfilled promise\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }
      return this._settledValue()
    }

    var reason = PromiseInspection.prototype.error = PromiseInspection.prototype.reason = function () {
      if (!this.isRejected()) {
        throw new TypeError('cannot get rejection reason of a non-rejected promise\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }
      return this._settledValue()
    }

    var isFulfilled = PromiseInspection.prototype.isFulfilled = function () {
      return (this._bitField & 33554432) !== 0
    }

    var isRejected = PromiseInspection.prototype.isRejected = function () {
      return (this._bitField & 16777216) !== 0
    }

    var isPending = PromiseInspection.prototype.isPending = function () {
      return (this._bitField & 50397184) === 0
    }

    var isResolved = PromiseInspection.prototype.isResolved = function () {
      return (this._bitField & 50331648) !== 0
    }

    PromiseInspection.prototype.isCancelled = function () {
      return (this._bitField & 8454144) !== 0
    }

    Promise.prototype.__isCancelled = function () {
      return (this._bitField & 65536) === 65536
    }

    Promise.prototype._isCancelled = function () {
      return this._target().__isCancelled()
    }

    Promise.prototype.isCancelled = function () {
      return (this._target()._bitField & 8454144) !== 0
    }

    Promise.prototype.isPending = function () {
      return isPending.call(this._target())
    }

    Promise.prototype.isRejected = function () {
      return isRejected.call(this._target())
    }

    Promise.prototype.isFulfilled = function () {
      return isFulfilled.call(this._target())
    }

    Promise.prototype.isResolved = function () {
      return isResolved.call(this._target())
    }

    Promise.prototype.value = function () {
      return value.call(this._target())
    }

    Promise.prototype.reason = function () {
      var target = this._target()
      target._unsetRejectionIsUnhandled()
      return reason.call(target)
    }

    Promise.prototype._value = function () {
      return this._settledValue()
    }

    Promise.prototype._reason = function () {
      this._unsetRejectionIsUnhandled()
      return this._settledValue()
    }

    Promise.PromiseInspection = PromiseInspection
  }

  var join = function join (Promise, PromiseArray, tryConvertToPromise, INTERNAL, async, getDomain) {
    var util = util$1
    var canEvaluate = util.canEvaluate
    var tryCatch = util.tryCatch
    var errorObj = util.errorObj
    var reject

    {
      if (canEvaluate) {
        var thenCallback = function thenCallback (i) {
          return new Function('value', 'holder', "                             \n\
            'use strict';                                                    \n\
            holder.pIndex = value;                                           \n\
            holder.checkFulfillment(this);                                   \n\
            ".replace(/Index/g, i))
        }

        var promiseSetter = function promiseSetter (i) {
          return new Function('promise', 'holder', "                           \n\
            'use strict';                                                    \n\
            holder.pIndex = promise;                                         \n\
            ".replace(/Index/g, i))
        }

        var generateHolderClass = function generateHolderClass (total) {
          var props = new Array(total)
          for (var i = 0; i < props.length; ++i) {
            props[i] = 'this.p' + (i + 1)
          }
          var assignment = props.join(' = ') + ' = null;'
          var cancellationCode = 'var promise;\n' + props.map(function (prop) {
            return '                                                         \n\
                promise = ' + prop + ';                                      \n\
                if (promise instanceof Promise) {                            \n\
                    promise.cancel();                                        \n\
                }                                                            \n\
            '
          }).join('\n')
          var passedArguments = props.join(', ')
          var name = 'Holder$' + total

          var code = "return function(tryCatch, errorObj, Promise, async) {    \n\
            'use strict';                                                    \n\
            function [TheName](fn) {                                         \n\
                [TheProperties]                                              \n\
                this.fn = fn;                                                \n\
                this.asyncNeeded = true;                                     \n\
                this.now = 0;                                                \n\
            }                                                                \n\
                                                                             \n\
            [TheName].prototype._callFunction = function(promise) {          \n\
                promise._pushContext();                                      \n\
                var ret = tryCatch(this.fn)([ThePassedArguments]);           \n\
                promise._popContext();                                       \n\
                if (ret === errorObj) {                                      \n\
                    promise._rejectCallback(ret.e, false);                   \n\
                } else {                                                     \n\
                    promise._resolveCallback(ret);                           \n\
                }                                                            \n\
            };                                                               \n\
                                                                             \n\
            [TheName].prototype.checkFulfillment = function(promise) {       \n\
                var now = ++this.now;                                        \n\
                if (now === [TheTotal]) {                                    \n\
                    if (this.asyncNeeded) {                                  \n\
                        async.invoke(this._callFunction, this, promise);     \n\
                    } else {                                                 \n\
                        this._callFunction(promise);                         \n\
                    }                                                        \n\
                                                                             \n\
                }                                                            \n\
            };                                                               \n\
                                                                             \n\
            [TheName].prototype._resultCancelled = function() {              \n\
                [CancellationCode]                                           \n\
            };                                                               \n\
                                                                             \n\
            return [TheName];                                                \n\
        }(tryCatch, errorObj, Promise, async);                               \n\
        "

          code = code.replace(/\[TheName\]/g, name).replace(/\[TheTotal\]/g, total).replace(/\[ThePassedArguments\]/g, passedArguments).replace(/\[TheProperties\]/g, assignment).replace(/\[CancellationCode\]/g, cancellationCode)

          return new Function('tryCatch', 'errorObj', 'Promise', 'async', code)(tryCatch, errorObj, Promise, async)
        }

        var holderClasses = []
        var thenCallbacks = []
        var promiseSetters = []

        for (var i = 0; i < 8; ++i) {
          holderClasses.push(generateHolderClass(i + 1))
          thenCallbacks.push(thenCallback(i + 1))
          promiseSetters.push(promiseSetter(i + 1))
        }

        reject = function reject (reason) {
          this._reject(reason)
        }
      }
    }

    Promise.join = function () {
      var last = arguments.length - 1
      var fn
      if (last > 0 && typeof arguments[last] === 'function') {
        fn = arguments[last]
        {
          if (last <= 8 && canEvaluate) {
            var ret = new Promise(INTERNAL)
            ret._captureStackTrace()
            var HolderClass = holderClasses[last - 1]
            var holder = new HolderClass(fn)
            var callbacks = thenCallbacks

            for (var i = 0; i < last; ++i) {
              var maybePromise = tryConvertToPromise(arguments[i], ret)
              if (maybePromise instanceof Promise) {
                maybePromise = maybePromise._target()
                var bitField = maybePromise._bitField

                if ((bitField & 50397184) === 0) {
                  maybePromise._then(callbacks[i], reject, undefined, ret, holder)
                  promiseSetters[i](maybePromise, holder)
                  holder.asyncNeeded = false
                } else if ((bitField & 33554432) !== 0) {
                  callbacks[i].call(ret, maybePromise._value(), holder)
                } else if ((bitField & 16777216) !== 0) {
                  ret._reject(maybePromise._reason())
                } else {
                  ret._cancel()
                }
              } else {
                callbacks[i].call(ret, maybePromise, holder)
              }
            }

            if (!ret._isFateSealed()) {
              if (holder.asyncNeeded) {
                var domain = getDomain()
                if (domain !== null) {
                  holder.fn = util.domainBind(domain, holder.fn)
                }
              }
              ret._setAsyncGuaranteed()
              ret._setOnCancel(holder)
            }
            return ret
          }
        }
      }
      var $_len = arguments.length; var args = new Array($_len); for (var $_i = 0; $_i < $_len; ++$_i) {
        args[$_i] = arguments[$_i]
      }
      if (fn) args.pop()
      var ret = new PromiseArray(args).promise()
      return fn !== undefined ? ret.spread(fn) : ret
    }
  }

  var map$2 = function map (Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL, debug) {
    var getDomain = Promise._getDomain
    var util = util$1
    var tryCatch = util.tryCatch
    var errorObj = util.errorObj
    var async = Promise._async

    function MappingPromiseArray (promises, fn, limit, _filter) {
      this.constructor$(promises)
      this._promise._captureStackTrace()
      var domain = getDomain()
      this._callback = domain === null ? fn : util.domainBind(domain, fn)
      this._preservedValues = _filter === INTERNAL ? new Array(this.length()) : null
      this._limit = limit
      this._inFlight = 0
      this._queue = []
      async.invoke(this._asyncInit, this, undefined)
    }
    util.inherits(MappingPromiseArray, PromiseArray)

    MappingPromiseArray.prototype._asyncInit = function () {
      this._init$(undefined, -2)
    }

    MappingPromiseArray.prototype._init = function () {}

    MappingPromiseArray.prototype._promiseFulfilled = function (value, index) {
      var values = this._values
      var length = this.length()
      var preservedValues = this._preservedValues
      var limit = this._limit

      if (index < 0) {
        index = index * -1 - 1
        values[index] = value
        if (limit >= 1) {
          this._inFlight--
          this._drainQueue()
          if (this._isResolved()) return true
        }
      } else {
        if (limit >= 1 && this._inFlight >= limit) {
          values[index] = value
          this._queue.push(index)
          return false
        }
        if (preservedValues !== null) preservedValues[index] = value

        var promise = this._promise
        var callback = this._callback
        var receiver = promise._boundValue()
        promise._pushContext()
        var ret = tryCatch(callback).call(receiver, value, index, length)
        var promiseCreated = promise._popContext()
        debug.checkForgottenReturns(ret, promiseCreated, preservedValues !== null ? 'Promise.filter' : 'Promise.map', promise)
        if (ret === errorObj) {
          this._reject(ret.e)
          return true
        }

        var maybePromise = tryConvertToPromise(ret, this._promise)
        if (maybePromise instanceof Promise) {
          maybePromise = maybePromise._target()
          var bitField = maybePromise._bitField

          if ((bitField & 50397184) === 0) {
            if (limit >= 1) this._inFlight++
            values[index] = maybePromise
            maybePromise._proxy(this, (index + 1) * -1)
            return false
          } else if ((bitField & 33554432) !== 0) {
            ret = maybePromise._value()
          } else if ((bitField & 16777216) !== 0) {
            this._reject(maybePromise._reason())
            return true
          } else {
            this._cancel()
            return true
          }
        }
        values[index] = ret
      }
      var totalResolved = ++this._totalResolved
      if (totalResolved >= length) {
        if (preservedValues !== null) {
          this._filter(values, preservedValues)
        } else {
          this._resolve(values)
        }
        return true
      }
      return false
    }

    MappingPromiseArray.prototype._drainQueue = function () {
      var queue = this._queue
      var limit = this._limit
      var values = this._values
      while (queue.length > 0 && this._inFlight < limit) {
        if (this._isResolved()) return
        var index = queue.pop()
        this._promiseFulfilled(values[index], index)
      }
    }

    MappingPromiseArray.prototype._filter = function (booleans, values) {
      var len = values.length
      var ret = new Array(len)
      var j = 0
      for (var i = 0; i < len; ++i) {
        if (booleans[i]) ret[j++] = values[i]
      }
      ret.length = j
      this._resolve(ret)
    }

    MappingPromiseArray.prototype.preservedValues = function () {
      return this._preservedValues
    }

    function map (promises, fn, options, _filter) {
      if (typeof fn !== 'function') {
        return apiRejection('expecting a function but got ' + util.classString(fn))
      }

      var limit = 0
      if (options !== undefined) {
        if (typeof options === 'object' && options !== null) {
          if (typeof options.concurrency !== 'number') {
            return Promise.reject(new TypeError("'concurrency' must be a number but it is " + util.classString(options.concurrency)))
          }
          limit = options.concurrency
        } else {
          return Promise.reject(new TypeError('options argument must be an object but it is ' + util.classString(options)))
        }
      }
      limit = typeof limit === 'number' && isFinite(limit) && limit >= 1 ? limit : 0
      return new MappingPromiseArray(promises, fn, limit, _filter).promise()
    }

    Promise.prototype.map = function (fn, options) {
      return map(this, fn, options, null)
    }

    Promise.map = function (promises, fn, options, _filter) {
      return map(promises, fn, options, _filter)
    }
  }

  var cr = Object.create
  if (cr) {
    var callerCache = cr(null)
    var getterCache = cr(null)
    callerCache[' size'] = getterCache[' size'] = 0
  }

  var call_get = function call_get (Promise) {
    var util = util$1
    var canEvaluate = util.canEvaluate
    var isIdentifier = util.isIdentifier

    var getMethodCaller
    var getGetter
    {
      var makeMethodCaller = function makeMethodCaller (methodName) {
        return new Function('ensureMethod', "                                    \n\
        return function(obj) {                                               \n\
            'use strict'                                                     \n\
            var len = this.length;                                           \n\
            ensureMethod(obj, 'methodName');                                 \n\
            switch(len) {                                                    \n\
                case 1: return obj.methodName(this[0]);                      \n\
                case 2: return obj.methodName(this[0], this[1]);             \n\
                case 3: return obj.methodName(this[0], this[1], this[2]);    \n\
                case 0: return obj.methodName();                             \n\
                default:                                                     \n\
                    return obj.methodName.apply(obj, this);                  \n\
            }                                                                \n\
        };                                                                   \n\
        ".replace(/methodName/g, methodName))(ensureMethod)
      }

      var makeGetter = function makeGetter (propertyName) {
        return new Function('obj', "                                             \n\
        'use strict';                                                        \n\
        return obj.propertyName;                                             \n\
        ".replace('propertyName', propertyName))
      }

      var getCompiled = function getCompiled (name, compiler, cache) {
        var ret = cache[name]
        if (typeof ret !== 'function') {
          if (!isIdentifier(name)) {
            return null
          }
          ret = compiler(name)
          cache[name] = ret
          cache[' size']++
          if (cache[' size'] > 512) {
            var keys = Object.keys(cache)
            for (var i = 0; i < 256; ++i) delete cache[keys[i]]
            cache[' size'] = keys.length - 256
          }
        }
        return ret
      }

      getMethodCaller = function getMethodCaller (name) {
        return getCompiled(name, makeMethodCaller, callerCache)
      }

      getGetter = function getGetter (name) {
        return getCompiled(name, makeGetter, getterCache)
      }
    }

    function ensureMethod (obj, methodName) {
      var fn
      if (obj != null) fn = obj[methodName]
      if (typeof fn !== 'function') {
        var message = 'Object ' + util.classString(obj) + " has no method '" + util.toString(methodName) + "'"
        throw new Promise.TypeError(message)
      }
      return fn
    }

    function caller (obj) {
      var methodName = this.pop()
      var fn = ensureMethod(obj, methodName)
      return fn.apply(obj, this)
    }
    Promise.prototype.call = function (methodName) {
      var $_len = arguments.length; var args = new Array(Math.max($_len - 1, 0)); for (var $_i = 1; $_i < $_len; ++$_i) {
        args[$_i - 1] = arguments[$_i]
      }
      {
        if (canEvaluate) {
          var maybeCaller = getMethodCaller(methodName)
          if (maybeCaller !== null) {
            return this._then(maybeCaller, undefined, undefined, args, undefined)
          }
        }
      }
      args.push(methodName)
      return this._then(caller, undefined, undefined, args, undefined)
    }

    function namedGetter (obj) {
      return obj[this]
    }
    function indexedGetter (obj) {
      var index = +this
      if (index < 0) index = Math.max(0, index + obj.length)
      return obj[index]
    }
    Promise.prototype.get = function (propertyName) {
      var isIndex = typeof propertyName === 'number'
      var getter
      if (!isIndex) {
        if (canEvaluate) {
          var maybeGetter = getGetter(propertyName)
          getter = maybeGetter !== null ? maybeGetter : namedGetter
        } else {
          getter = namedGetter
        }
      } else {
        getter = indexedGetter
      }
      return this._then(getter, undefined, undefined, propertyName, undefined)
    }
  }

  var using = function using (Promise, apiRejection, tryConvertToPromise, createContext, INTERNAL, debug) {
    var util = util$1
    var TypeError = errors$1.TypeError
    var inherits = util$1.inherits
    var errorObj = util.errorObj
    var tryCatch = util.tryCatch
    var NULL = {}

    function thrower (e) {
      setTimeout(function () {
        throw e
      }, 0)
    }

    function castPreservingDisposable (thenable) {
      var maybePromise = tryConvertToPromise(thenable)
      if (maybePromise !== thenable && typeof thenable._isDisposable === 'function' && typeof thenable._getDisposer === 'function' && thenable._isDisposable()) {
        maybePromise._setDisposable(thenable._getDisposer())
      }
      return maybePromise
    }
    function dispose (resources, inspection) {
      var i = 0
      var len = resources.length
      var ret = new Promise(INTERNAL)
      function iterator () {
        if (i >= len) return ret._fulfill()
        var maybePromise = castPreservingDisposable(resources[i++])
        if (maybePromise instanceof Promise && maybePromise._isDisposable()) {
          try {
            maybePromise = tryConvertToPromise(maybePromise._getDisposer().tryDispose(inspection), resources.promise)
          } catch (e) {
            return thrower(e)
          }
          if (maybePromise instanceof Promise) {
            return maybePromise._then(iterator, thrower, null, null, null)
          }
        }
        iterator()
      }
      iterator()
      return ret
    }

    function Disposer (data, promise, context) {
      this._data = data
      this._promise = promise
      this._context = context
    }

    Disposer.prototype.data = function () {
      return this._data
    }

    Disposer.prototype.promise = function () {
      return this._promise
    }

    Disposer.prototype.resource = function () {
      if (this.promise().isFulfilled()) {
        return this.promise().value()
      }
      return NULL
    }

    Disposer.prototype.tryDispose = function (inspection) {
      var resource = this.resource()
      var context = this._context
      if (context !== undefined) context._pushContext()
      var ret = resource !== NULL ? this.doDispose(resource, inspection) : null
      if (context !== undefined) context._popContext()
      this._promise._unsetDisposable()
      this._data = null
      return ret
    }

    Disposer.isDisposer = function (d) {
      return d != null && typeof d.resource === 'function' && typeof d.tryDispose === 'function'
    }

    function FunctionDisposer (fn, promise, context) {
      this.constructor$(fn, promise, context)
    }
    inherits(FunctionDisposer, Disposer)

    FunctionDisposer.prototype.doDispose = function (resource, inspection) {
      var fn = this.data()
      return fn.call(resource, resource, inspection)
    }

    function maybeUnwrapDisposer (value) {
      if (Disposer.isDisposer(value)) {
        this.resources[this.index]._setDisposable(value)
        return value.promise()
      }
      return value
    }

    function ResourceList (length) {
      this.length = length
      this.promise = null
      this[length - 1] = null
    }

    ResourceList.prototype._resultCancelled = function () {
      var len = this.length
      for (var i = 0; i < len; ++i) {
        var item = this[i]
        if (item instanceof Promise) {
          item.cancel()
        }
      }
    }

    Promise.using = function () {
      var len = arguments.length
      if (len < 2) return apiRejection('you must pass at least 2 arguments to Promise.using')
      var fn = arguments[len - 1]
      if (typeof fn !== 'function') {
        return apiRejection('expecting a function but got ' + util.classString(fn))
      }
      var input
      var spreadArgs = true
      if (len === 2 && Array.isArray(arguments[0])) {
        input = arguments[0]
        len = input.length
        spreadArgs = false
      } else {
        input = arguments
        len--
      }
      var resources = new ResourceList(len)
      for (var i = 0; i < len; ++i) {
        var resource = input[i]
        if (Disposer.isDisposer(resource)) {
          var disposer = resource
          resource = resource.promise()
          resource._setDisposable(disposer)
        } else {
          var maybePromise = tryConvertToPromise(resource)
          if (maybePromise instanceof Promise) {
            resource = maybePromise._then(maybeUnwrapDisposer, null, null, {
              resources: resources,
              index: i
            }, undefined)
          }
        }
        resources[i] = resource
      }

      var reflectedResources = new Array(resources.length)
      for (var i = 0; i < reflectedResources.length; ++i) {
        reflectedResources[i] = Promise.resolve(resources[i]).reflect()
      }

      var resultPromise = Promise.all(reflectedResources).then(function (inspections) {
        for (var i = 0; i < inspections.length; ++i) {
          var inspection = inspections[i]
          if (inspection.isRejected()) {
            errorObj.e = inspection.error()
            return errorObj
          } else if (!inspection.isFulfilled()) {
            resultPromise.cancel()
            return
          }
          inspections[i] = inspection.value()
        }
        promise._pushContext()

        fn = tryCatch(fn)
        var ret = spreadArgs ? fn.apply(undefined, inspections) : fn(inspections)
        var promiseCreated = promise._popContext()
        debug.checkForgottenReturns(ret, promiseCreated, 'Promise.using', promise)
        return ret
      })

      var promise = resultPromise.lastly(function () {
        var inspection = new Promise.PromiseInspection(resultPromise)
        return dispose(resources, inspection)
      })
      resources.promise = promise
      promise._setOnCancel(resources)
      return promise
    }

    Promise.prototype._setDisposable = function (disposer) {
      this._bitField = this._bitField | 131072
      this._disposer = disposer
    }

    Promise.prototype._isDisposable = function () {
      return (this._bitField & 131072) > 0
    }

    Promise.prototype._getDisposer = function () {
      return this._disposer
    }

    Promise.prototype._unsetDisposable = function () {
      this._bitField = this._bitField & ~131072
      this._disposer = undefined
    }

    Promise.prototype.disposer = function (fn) {
      if (typeof fn === 'function') {
        return new FunctionDisposer(fn, this, createContext())
      }
      throw new TypeError()
    }
  }

  var timers = function timers (Promise, INTERNAL, debug) {
    var util = util$1
    var TimeoutError = Promise.TimeoutError

    function HandleWrapper (handle) {
      this.handle = handle
    }

    HandleWrapper.prototype._resultCancelled = function () {
      clearTimeout(this.handle)
    }

    var afterValue = function afterValue (value) {
      return delay(+this).thenReturn(value)
    }
    var delay = Promise.delay = function (ms, value) {
      var ret
      var handle
      if (value !== undefined) {
        ret = Promise.resolve(value)._then(afterValue, null, null, ms, undefined)
        if (debug.cancellation() && value instanceof Promise) {
          ret._setOnCancel(value)
        }
      } else {
        ret = new Promise(INTERNAL)
        handle = setTimeout(function () {
          ret._fulfill()
        }, +ms)
        if (debug.cancellation()) {
          ret._setOnCancel(new HandleWrapper(handle))
        }
        ret._captureStackTrace()
      }
      ret._setAsyncGuaranteed()
      return ret
    }

    Promise.prototype.delay = function (ms) {
      return delay(ms, this)
    }

    var afterTimeout = function afterTimeout (promise, message, parent) {
      var err
      if (typeof message !== 'string') {
        if (message instanceof Error) {
          err = message
        } else {
          err = new TimeoutError('operation timed out')
        }
      } else {
        err = new TimeoutError(message)
      }
      util.markAsOriginatingFromRejection(err)
      promise._attachExtraTrace(err)
      promise._reject(err)

      if (parent != null) {
        parent.cancel()
      }
    }

    function successClear (value) {
      clearTimeout(this.handle)
      return value
    }

    function failureClear (reason) {
      clearTimeout(this.handle)
      throw reason
    }

    Promise.prototype.timeout = function (ms, message) {
      ms = +ms
      var ret, parent

      var handleWrapper = new HandleWrapper(setTimeout(function timeoutTimeout () {
        if (ret.isPending()) {
          afterTimeout(ret, message, parent)
        }
      }, ms))

      if (debug.cancellation()) {
        parent = this.then()
        ret = parent._then(successClear, failureClear, undefined, handleWrapper, undefined)
        ret._setOnCancel(handleWrapper)
      } else {
        ret = this._then(successClear, failureClear, undefined, handleWrapper, undefined)
      }

      return ret
    }
  }

  var generators = function generators (Promise, apiRejection, INTERNAL, tryConvertToPromise, Proxyable, debug) {
    var errors = errors$1
    var TypeError = errors.TypeError
    var util = util$1
    var errorObj = util.errorObj
    var tryCatch = util.tryCatch
    var yieldHandlers = []

    function promiseFromYieldHandler (value, yieldHandlers, traceParent) {
      for (var i = 0; i < yieldHandlers.length; ++i) {
        traceParent._pushContext()
        var result = tryCatch(yieldHandlers[i])(value)
        traceParent._popContext()
        if (result === errorObj) {
          traceParent._pushContext()
          var ret = Promise.reject(errorObj.e)
          traceParent._popContext()
          return ret
        }
        var maybePromise = tryConvertToPromise(result, traceParent)
        if (maybePromise instanceof Promise) return maybePromise
      }
      return null
    }

    function PromiseSpawn (generatorFunction, receiver, yieldHandler, stack) {
      if (debug.cancellation()) {
        var internal = new Promise(INTERNAL)
        var _finallyPromise = this._finallyPromise = new Promise(INTERNAL)
        this._promise = internal.lastly(function () {
          return _finallyPromise
        })
        internal._captureStackTrace()
        internal._setOnCancel(this)
      } else {
        var promise = this._promise = new Promise(INTERNAL)
        promise._captureStackTrace()
      }
      this._stack = stack
      this._generatorFunction = generatorFunction
      this._receiver = receiver
      this._generator = undefined
      this._yieldHandlers = typeof yieldHandler === 'function' ? [yieldHandler].concat(yieldHandlers) : yieldHandlers
      this._yieldedPromise = null
      this._cancellationPhase = false
    }
    util.inherits(PromiseSpawn, Proxyable)

    PromiseSpawn.prototype._isResolved = function () {
      return this._promise === null
    }

    PromiseSpawn.prototype._cleanup = function () {
      this._promise = this._generator = null
      if (debug.cancellation() && this._finallyPromise !== null) {
        this._finallyPromise._fulfill()
        this._finallyPromise = null
      }
    }

    PromiseSpawn.prototype._promiseCancelled = function () {
      if (this._isResolved()) return
      var implementsReturn = typeof this._generator['return'] !== 'undefined'

      var result
      if (!implementsReturn) {
        var reason = new Promise.CancellationError('generator .return() sentinel')
        Promise.coroutine.returnSentinel = reason
        this._promise._attachExtraTrace(reason)
        this._promise._pushContext()
        result = tryCatch(this._generator['throw']).call(this._generator, reason)
        this._promise._popContext()
      } else {
        this._promise._pushContext()
        result = tryCatch(this._generator['return']).call(this._generator, undefined)
        this._promise._popContext()
      }
      this._cancellationPhase = true
      this._yieldedPromise = null
      this._continue(result)
    }

    PromiseSpawn.prototype._promiseFulfilled = function (value) {
      this._yieldedPromise = null
      this._promise._pushContext()
      var result = tryCatch(this._generator.next).call(this._generator, value)
      this._promise._popContext()
      this._continue(result)
    }

    PromiseSpawn.prototype._promiseRejected = function (reason) {
      this._yieldedPromise = null
      this._promise._attachExtraTrace(reason)
      this._promise._pushContext()
      var result = tryCatch(this._generator['throw']).call(this._generator, reason)
      this._promise._popContext()
      this._continue(result)
    }

    PromiseSpawn.prototype._resultCancelled = function () {
      if (this._yieldedPromise instanceof Promise) {
        var promise = this._yieldedPromise
        this._yieldedPromise = null
        promise.cancel()
      }
    }

    PromiseSpawn.prototype.promise = function () {
      return this._promise
    }

    PromiseSpawn.prototype._run = function () {
      this._generator = this._generatorFunction.call(this._receiver)
      this._receiver = this._generatorFunction = undefined
      this._promiseFulfilled(undefined)
    }

    PromiseSpawn.prototype._continue = function (result) {
      var promise = this._promise
      if (result === errorObj) {
        this._cleanup()
        if (this._cancellationPhase) {
          return promise.cancel()
        } else {
          return promise._rejectCallback(result.e, false)
        }
      }

      var value = result.value
      if (result.done === true) {
        this._cleanup()
        if (this._cancellationPhase) {
          return promise.cancel()
        } else {
          return promise._resolveCallback(value)
        }
      } else {
        var maybePromise = tryConvertToPromise(value, this._promise)
        if (!(maybePromise instanceof Promise)) {
          maybePromise = promiseFromYieldHandler(maybePromise, this._yieldHandlers, this._promise)
          if (maybePromise === null) {
            this._promiseRejected(new TypeError('A value %s was yielded that could not be treated as a promise\u000a\u000a    See http://goo.gl/MqrFmX\u000a\u000a'.replace('%s', String(value)) + 'From coroutine:\u000a' + this._stack.split('\n').slice(1, -7).join('\n')))
            return
          }
        }
        maybePromise = maybePromise._target()
        var bitField = maybePromise._bitField

        if ((bitField & 50397184) === 0) {
          this._yieldedPromise = maybePromise
          maybePromise._proxy(this, null)
        } else if ((bitField & 33554432) !== 0) {
          Promise._async.invoke(this._promiseFulfilled, this, maybePromise._value())
        } else if ((bitField & 16777216) !== 0) {
          Promise._async.invoke(this._promiseRejected, this, maybePromise._reason())
        } else {
          this._promiseCancelled()
        }
      }
    }

    Promise.coroutine = function (generatorFunction, options) {
      if (typeof generatorFunction !== 'function') {
        throw new TypeError('generatorFunction must be a function\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }
      var yieldHandler = Object(options).yieldHandler
      var PromiseSpawn$ = PromiseSpawn
      var stack = new Error().stack
      return function () {
        var generator = generatorFunction.apply(this, arguments)
        var spawn = new PromiseSpawn$(undefined, undefined, yieldHandler, stack)
        var ret = spawn.promise()
        spawn._generator = generator
        spawn._promiseFulfilled(undefined)
        return ret
      }
    }

    Promise.coroutine.addYieldHandler = function (fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('expecting a function but got ' + util.classString(fn))
      }
      yieldHandlers.push(fn)
    }

    Promise.spawn = function (generatorFunction) {
      debug.deprecated('Promise.spawn()', 'Promise.coroutine()')
      if (typeof generatorFunction !== 'function') {
        return apiRejection('generatorFunction must be a function\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }
      var spawn = new PromiseSpawn(generatorFunction, this)
      var ret = spawn.promise()
      spawn._run(Promise.spawn)
      return ret
    }
  }

  var nodeify = function nodeify (Promise) {
    var util = util$1
    var async = Promise._async
    var tryCatch = util.tryCatch
    var errorObj = util.errorObj

    function spreadAdapter (val, nodeback) {
      var promise = this
      if (!util.isArray(val)) return successAdapter.call(promise, val, nodeback)
      var ret = tryCatch(nodeback).apply(promise._boundValue(), [null].concat(val))
      if (ret === errorObj) {
        async.throwLater(ret.e)
      }
    }

    function successAdapter (val, nodeback) {
      var promise = this
      var receiver = promise._boundValue()
      var ret = val === undefined ? tryCatch(nodeback).call(receiver, null) : tryCatch(nodeback).call(receiver, null, val)
      if (ret === errorObj) {
        async.throwLater(ret.e)
      }
    }
    function errorAdapter (reason, nodeback) {
      var promise = this
      if (!reason) {
        var newReason = new Error(reason + '')
        newReason.cause = reason
        reason = newReason
      }
      var ret = tryCatch(nodeback).call(promise._boundValue(), reason)
      if (ret === errorObj) {
        async.throwLater(ret.e)
      }
    }

    Promise.prototype.asCallback = Promise.prototype.nodeify = function (nodeback, options) {
      if (typeof nodeback === 'function') {
        var adapter = successAdapter
        if (options !== undefined && Object(options).spread) {
          adapter = spreadAdapter
        }
        this._then(adapter, errorAdapter, undefined, this, nodeback)
      }
      return this
    }
  }

  var promisify = function promisify (Promise, INTERNAL) {
    var THIS = {}
    var util = util$1
    var nodebackForPromise = nodeback
    var withAppended = util.withAppended
    var maybeWrapAsError = util.maybeWrapAsError
    var canEvaluate = util.canEvaluate
    var TypeError = errors$1.TypeError
    var defaultSuffix = 'Async'
    var defaultPromisified = { __isPromisified__: true }
    var noCopyProps = ['arity', 'length', 'name', 'arguments', 'caller', 'callee', 'prototype', '__isPromisified__']
    var noCopyPropsPattern = new RegExp('^(?:' + noCopyProps.join('|') + ')$')

    var defaultFilter = function defaultFilter (name) {
      return util.isIdentifier(name) && name.charAt(0) !== '_' && name !== 'constructor'
    }

    function propsFilter (key) {
      return !noCopyPropsPattern.test(key)
    }

    function isPromisified (fn) {
      try {
        return fn.__isPromisified__ === true
      } catch (e) {
        return false
      }
    }

    function hasPromisified (obj, key, suffix) {
      var val = util.getDataPropertyOrDefault(obj, key + suffix, defaultPromisified)
      return val ? isPromisified(val) : false
    }
    function checkValid (ret, suffix, suffixRegexp) {
      for (var i = 0; i < ret.length; i += 2) {
        var key = ret[i]
        if (suffixRegexp.test(key)) {
          var keyWithoutAsyncSuffix = key.replace(suffixRegexp, '')
          for (var j = 0; j < ret.length; j += 2) {
            if (ret[j] === keyWithoutAsyncSuffix) {
              throw new TypeError("Cannot promisify an API that has normal methods with '%s'-suffix\u000a\u000a    See http://goo.gl/MqrFmX\u000a".replace('%s', suffix))
            }
          }
        }
      }
    }

    function promisifiableMethods (obj, suffix, suffixRegexp, filter) {
      var keys = util.inheritedDataKeys(obj)
      var ret = []
      for (var i = 0; i < keys.length; ++i) {
        var key = keys[i]
        var value = obj[key]
        var passesDefaultFilter = filter === defaultFilter ? true : defaultFilter(key, value, obj)
        if (typeof value === 'function' && !isPromisified(value) && !hasPromisified(obj, key, suffix) && filter(key, value, obj, passesDefaultFilter)) {
          ret.push(key, value)
        }
      }
      checkValid(ret, suffix, suffixRegexp)
      return ret
    }

    var escapeIdentRegex = function escapeIdentRegex (str) {
      return str.replace(/([$])/, '\\$')
    }

    var makeNodePromisifiedEval
    {
      var switchCaseArgumentOrder = function switchCaseArgumentOrder (likelyArgumentCount) {
        var ret = [likelyArgumentCount]
        var min = Math.max(0, likelyArgumentCount - 1 - 3)
        for (var i = likelyArgumentCount - 1; i >= min; --i) {
          ret.push(i)
        }
        for (var i = likelyArgumentCount + 1; i <= 3; ++i) {
          ret.push(i)
        }
        return ret
      }

      var argumentSequence = function argumentSequence (argumentCount) {
        return util.filledRange(argumentCount, '_arg', '')
      }

      var parameterDeclaration = function parameterDeclaration (parameterCount) {
        return util.filledRange(Math.max(parameterCount, 3), '_arg', '')
      }

      var parameterCount = function parameterCount (fn) {
        if (typeof fn.length === 'number') {
          return Math.max(Math.min(fn.length, 1023 + 1), 0)
        }
        return 0
      }

      makeNodePromisifiedEval = function makeNodePromisifiedEval (callback, receiver, originalName, fn, _, multiArgs) {
        var newParameterCount = Math.max(0, parameterCount(fn) - 1)
        var argumentOrder = switchCaseArgumentOrder(newParameterCount)
        var shouldProxyThis = typeof callback === 'string' || receiver === THIS

        function generateCallForArgumentCount (count) {
          var args = argumentSequence(count).join(', ')
          var comma = count > 0 ? ', ' : ''
          var ret
          if (shouldProxyThis) {
            ret = 'ret = callback.call(this, {{args}}, nodeback); break;\n'
          } else {
            ret = receiver === undefined ? 'ret = callback({{args}}, nodeback); break;\n' : 'ret = callback.call(receiver, {{args}}, nodeback); break;\n'
          }
          return ret.replace('{{args}}', args).replace(', ', comma)
        }

        function generateArgumentSwitchCase () {
          var ret = ''
          for (var i = 0; i < argumentOrder.length; ++i) {
            ret += 'case ' + argumentOrder[i] + ':' + generateCallForArgumentCount(argumentOrder[i])
          }

          ret += '                                                             \n\
        default:                                                             \n\
            var args = new Array(len + 1);                                   \n\
            var i = 0;                                                       \n\
            for (var i = 0; i < len; ++i) {                                  \n\
               args[i] = arguments[i];                                       \n\
            }                                                                \n\
            args[i] = nodeback;                                              \n\
            [CodeForCall]                                                    \n\
            break;                                                           \n\
        '.replace('[CodeForCall]', shouldProxyThis ? 'ret = callback.apply(this, args);\n' : 'ret = callback.apply(receiver, args);\n')
          return ret
        }

        var getFunctionCode = typeof callback === 'string' ? "this != null ? this['" + callback + "'] : fn" : 'fn'
        var body = "'use strict';                                                \n\
        var ret = function (Parameters) {                                    \n\
            'use strict';                                                    \n\
            var len = arguments.length;                                      \n\
            var promise = new Promise(INTERNAL);                             \n\
            promise._captureStackTrace();                                    \n\
            var nodeback = nodebackForPromise(promise, " + multiArgs + ");   \n\
            var ret;                                                         \n\
            var callback = tryCatch([GetFunctionCode]);                      \n\
            switch(len) {                                                    \n\
                [CodeForSwitchCase]                                          \n\
            }                                                                \n\
            if (ret === errorObj) {                                          \n\
                promise._rejectCallback(maybeWrapAsError(ret.e), true, true);\n\
            }                                                                \n\
            if (!promise._isFateSealed()) promise._setAsyncGuaranteed();     \n\
            return promise;                                                  \n\
        };                                                                   \n\
        notEnumerableProp(ret, '__isPromisified__', true);                   \n\
        return ret;                                                          \n\
    ".replace('[CodeForSwitchCase]', generateArgumentSwitchCase()).replace('[GetFunctionCode]', getFunctionCode)
        body = body.replace('Parameters', parameterDeclaration(newParameterCount))
        return new Function('Promise', 'fn', 'receiver', 'withAppended', 'maybeWrapAsError', 'nodebackForPromise', 'tryCatch', 'errorObj', 'notEnumerableProp', 'INTERNAL', body)(Promise, fn, receiver, withAppended, maybeWrapAsError, nodebackForPromise, util.tryCatch, util.errorObj, util.notEnumerableProp, INTERNAL)
      }
    }

    function makeNodePromisifiedClosure (callback, receiver, _, fn, __, multiArgs) {
      var defaultThis = (function () {
        return this
      }())
      var method = callback
      if (typeof method === 'string') {
        callback = fn
      }
      function promisified () {
        var _receiver = receiver
        if (receiver === THIS) _receiver = this
        var promise = new Promise(INTERNAL)
        promise._captureStackTrace()
        var cb = typeof method === 'string' && this !== defaultThis ? this[method] : callback
        var fn = nodebackForPromise(promise, multiArgs)
        try {
          cb.apply(_receiver, withAppended(arguments, fn))
        } catch (e) {
          promise._rejectCallback(maybeWrapAsError(e), true, true)
        }
        if (!promise._isFateSealed()) promise._setAsyncGuaranteed()
        return promise
      }
      util.notEnumerableProp(promisified, '__isPromisified__', true)
      return promisified
    }

    var makeNodePromisified = canEvaluate ? makeNodePromisifiedEval : makeNodePromisifiedClosure

    function promisifyAll (obj, suffix, filter, promisifier, multiArgs) {
      var suffixRegexp = new RegExp(escapeIdentRegex(suffix) + '$')
      var methods = promisifiableMethods(obj, suffix, suffixRegexp, filter)

      for (var i = 0, len = methods.length; i < len; i += 2) {
        var key = methods[i]
        var fn = methods[i + 1]
        var promisifiedKey = key + suffix
        if (promisifier === makeNodePromisified) {
          obj[promisifiedKey] = makeNodePromisified(key, THIS, key, fn, suffix, multiArgs)
        } else {
          var promisified = promisifier(fn, function () {
            return makeNodePromisified(key, THIS, key, fn, suffix, multiArgs)
          })
          util.notEnumerableProp(promisified, '__isPromisified__', true)
          obj[promisifiedKey] = promisified
        }
      }
      util.toFastProperties(obj)
      return obj
    }

    function promisify (callback, receiver, multiArgs) {
      return makeNodePromisified(callback, receiver, undefined, callback, null, multiArgs)
    }

    Promise.promisify = function (fn, options) {
      if (typeof fn !== 'function') {
        throw new TypeError('expecting a function but got ' + util.classString(fn))
      }
      if (isPromisified(fn)) {
        return fn
      }
      options = Object(options)
      var receiver = options.context === undefined ? THIS : options.context
      var multiArgs = !!options.multiArgs
      var ret = promisify(fn, receiver, multiArgs)
      util.copyDescriptors(fn, ret, propsFilter)
      return ret
    }

    Promise.promisifyAll = function (target, options) {
      if (typeof target !== 'function' && typeof target !== 'object') {
        throw new TypeError('the target of promisifyAll must be an object or a function\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }
      options = Object(options)
      var multiArgs = !!options.multiArgs
      var suffix = options.suffix
      if (typeof suffix !== 'string') suffix = defaultSuffix
      var filter = options.filter
      if (typeof filter !== 'function') filter = defaultFilter
      var promisifier = options.promisifier
      if (typeof promisifier !== 'function') promisifier = makeNodePromisified

      if (!util.isIdentifier(suffix)) {
        throw new RangeError('suffix must be a valid identifier\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }

      var keys = util.inheritedDataKeys(target)
      for (var i = 0; i < keys.length; ++i) {
        var value = target[keys[i]]
        if (keys[i] !== 'constructor' && util.isClass(value)) {
          promisifyAll(value.prototype, suffix, filter, promisifier, multiArgs)
          promisifyAll(value, suffix, filter, promisifier, multiArgs)
        }
      }

      return promisifyAll(target, suffix, filter, promisifier, multiArgs)
    }
  }

  var props = function props (Promise, PromiseArray, tryConvertToPromise, apiRejection) {
    var util = util$1
    var isObject = util.isObject
    var es5$$2 = es5
    var Es6Map
    if (typeof Map === 'function') Es6Map = Map

    var mapToEntries = (function () {
      var index = 0
      var size = 0

      function extractEntry (value, key) {
        this[index] = value
        this[index + size] = key
        index++
      }

      return function mapToEntries (map) {
        size = map.size
        index = 0
        var ret = new Array(map.size * 2)
        map.forEach(extractEntry, ret)
        return ret
      }
    }())

    var entriesToMap = function entriesToMap (entries) {
      var ret = new Es6Map()
      var length = entries.length / 2 | 0
      for (var i = 0; i < length; ++i) {
        var key = entries[length + i]
        var value = entries[i]
        ret.set(key, value)
      }
      return ret
    }

    function PropertiesPromiseArray (obj) {
      var isMap = false
      var entries
      if (Es6Map !== undefined && obj instanceof Es6Map) {
        entries = mapToEntries(obj)
        isMap = true
      } else {
        var keys = es5$$2.keys(obj)
        var len = keys.length
        entries = new Array(len * 2)
        for (var i = 0; i < len; ++i) {
          var key = keys[i]
          entries[i] = obj[key]
          entries[i + len] = key
        }
      }
      this.constructor$(entries)
      this._isMap = isMap
      this._init$(undefined, isMap ? -6 : -3)
    }
    util.inherits(PropertiesPromiseArray, PromiseArray)

    PropertiesPromiseArray.prototype._init = function () {}

    PropertiesPromiseArray.prototype._promiseFulfilled = function (value, index) {
      this._values[index] = value
      var totalResolved = ++this._totalResolved
      if (totalResolved >= this._length) {
        var val
        if (this._isMap) {
          val = entriesToMap(this._values)
        } else {
          val = {}
          var keyOffset = this.length()
          for (var i = 0, len = this.length(); i < len; ++i) {
            val[this._values[i + keyOffset]] = this._values[i]
          }
        }
        this._resolve(val)
        return true
      }
      return false
    }

    PropertiesPromiseArray.prototype.shouldCopyValues = function () {
      return false
    }

    PropertiesPromiseArray.prototype.getActualLength = function (len) {
      return len >> 1
    }

    function props (promises) {
      var ret
      var castValue = tryConvertToPromise(promises)

      if (!isObject(castValue)) {
        return apiRejection('cannot await properties of a non-object\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      } else if (castValue instanceof Promise) {
        ret = castValue._then(Promise.props, undefined, undefined, undefined, undefined)
      } else {
        ret = new PropertiesPromiseArray(castValue).promise()
      }

      if (castValue instanceof Promise) {
        ret._propagateFrom(castValue, 2)
      }
      return ret
    }

    Promise.prototype.props = function () {
      return props(this)
    }

    Promise.props = function (promises) {
      return props(promises)
    }
  }

  var race = function race (Promise, INTERNAL, tryConvertToPromise, apiRejection) {
    var util = util$1

    var raceLater = function raceLater (promise) {
      return promise.then(function (array) {
        return race(array, promise)
      })
    }

    function race (promises, parent) {
      var maybePromise = tryConvertToPromise(promises)

      if (maybePromise instanceof Promise) {
        return raceLater(maybePromise)
      } else {
        promises = util.asArray(promises)
        if (promises === null) return apiRejection('expecting an array or an iterable object but got ' + util.classString(promises))
      }

      var ret = new Promise(INTERNAL)
      if (parent !== undefined) {
        ret._propagateFrom(parent, 3)
      }
      var fulfill = ret._fulfill
      var reject = ret._reject
      for (var i = 0, len = promises.length; i < len; ++i) {
        var val = promises[i]

        if (val === undefined && !(i in promises)) {
          continue
        }

        Promise.cast(val)._then(fulfill, reject, undefined, ret, null)
      }
      return ret
    }

    Promise.race = function (promises) {
      return race(promises, undefined)
    }

    Promise.prototype.race = function () {
      return race(this, undefined)
    }
  }

  var reduce = function reduce (Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL, debug) {
    var getDomain = Promise._getDomain
    var util = util$1
    var tryCatch = util.tryCatch

    function ReductionPromiseArray (promises, fn, initialValue, _each) {
      this.constructor$(promises)
      var domain = getDomain()
      this._fn = domain === null ? fn : util.domainBind(domain, fn)
      if (initialValue !== undefined) {
        initialValue = Promise.resolve(initialValue)
        initialValue._attachCancellationCallback(this)
      }
      this._initialValue = initialValue
      this._currentCancellable = null
      if (_each === INTERNAL) {
        this._eachValues = Array(this._length)
      } else if (_each === 0) {
        this._eachValues = null
      } else {
        this._eachValues = undefined
      }
      this._promise._captureStackTrace()
      this._init$(undefined, -5)
    }
    util.inherits(ReductionPromiseArray, PromiseArray)

    ReductionPromiseArray.prototype._gotAccum = function (accum) {
      if (this._eachValues !== undefined && this._eachValues !== null && accum !== INTERNAL) {
        this._eachValues.push(accum)
      }
    }

    ReductionPromiseArray.prototype._eachComplete = function (value) {
      if (this._eachValues !== null) {
        this._eachValues.push(value)
      }
      return this._eachValues
    }

    ReductionPromiseArray.prototype._init = function () {}

    ReductionPromiseArray.prototype._resolveEmptyArray = function () {
      this._resolve(this._eachValues !== undefined ? this._eachValues : this._initialValue)
    }

    ReductionPromiseArray.prototype.shouldCopyValues = function () {
      return false
    }

    ReductionPromiseArray.prototype._resolve = function (value) {
      this._promise._resolveCallback(value)
      this._values = null
    }

    ReductionPromiseArray.prototype._resultCancelled = function (sender) {
      if (sender === this._initialValue) return this._cancel()
      if (this._isResolved()) return
      this._resultCancelled$()
      if (this._currentCancellable instanceof Promise) {
        this._currentCancellable.cancel()
      }
      if (this._initialValue instanceof Promise) {
        this._initialValue.cancel()
      }
    }

    ReductionPromiseArray.prototype._iterate = function (values) {
      this._values = values
      var value
      var i
      var length = values.length
      if (this._initialValue !== undefined) {
        value = this._initialValue
        i = 0
      } else {
        value = Promise.resolve(values[0])
        i = 1
      }

      this._currentCancellable = value

      if (!value.isRejected()) {
        for (; i < length; ++i) {
          var ctx = {
            accum: null,
            value: values[i],
            index: i,
            length: length,
            array: this
          }
          value = value._then(gotAccum, undefined, undefined, ctx, undefined)
        }
      }

      if (this._eachValues !== undefined) {
        value = value._then(this._eachComplete, undefined, undefined, this, undefined)
      }
      value._then(completed, completed, undefined, value, this)
    }

    Promise.prototype.reduce = function (fn, initialValue) {
      return reduce(this, fn, initialValue, null)
    }

    Promise.reduce = function (promises, fn, initialValue, _each) {
      return reduce(promises, fn, initialValue, _each)
    }

    function completed (valueOrReason, array) {
      if (this.isFulfilled()) {
        array._resolve(valueOrReason)
      } else {
        array._reject(valueOrReason)
      }
    }

    function reduce (promises, fn, initialValue, _each) {
      if (typeof fn !== 'function') {
        return apiRejection('expecting a function but got ' + util.classString(fn))
      }
      var array = new ReductionPromiseArray(promises, fn, initialValue, _each)
      return array.promise()
    }

    function gotAccum (accum) {
      this.accum = accum
      this.array._gotAccum(accum)
      var value = tryConvertToPromise(this.value, this.array._promise)
      if (value instanceof Promise) {
        this.array._currentCancellable = value
        return value._then(gotValue, undefined, undefined, this, undefined)
      } else {
        return gotValue.call(this, value)
      }
    }

    function gotValue (value) {
      var array = this.array
      var promise = array._promise
      var fn = tryCatch(array._fn)
      promise._pushContext()
      var ret
      if (array._eachValues !== undefined) {
        ret = fn.call(promise._boundValue(), value, this.index, this.length)
      } else {
        ret = fn.call(promise._boundValue(), this.accum, value, this.index, this.length)
      }
      if (ret instanceof Promise) {
        array._currentCancellable = ret
      }
      var promiseCreated = promise._popContext()
      debug.checkForgottenReturns(ret, promiseCreated, array._eachValues !== undefined ? 'Promise.each' : 'Promise.reduce', promise)
      return ret
    }
  }

  var settle = function settle (Promise, PromiseArray, debug) {
    var PromiseInspection = Promise.PromiseInspection
    var util = util$1

    function SettledPromiseArray (values) {
      this.constructor$(values)
    }
    util.inherits(SettledPromiseArray, PromiseArray)

    SettledPromiseArray.prototype._promiseResolved = function (index, inspection) {
      this._values[index] = inspection
      var totalResolved = ++this._totalResolved
      if (totalResolved >= this._length) {
        this._resolve(this._values)
        return true
      }
      return false
    }

    SettledPromiseArray.prototype._promiseFulfilled = function (value, index) {
      var ret = new PromiseInspection()
      ret._bitField = 33554432
      ret._settledValueField = value
      return this._promiseResolved(index, ret)
    }
    SettledPromiseArray.prototype._promiseRejected = function (reason, index) {
      var ret = new PromiseInspection()
      ret._bitField = 16777216
      ret._settledValueField = reason
      return this._promiseResolved(index, ret)
    }

    Promise.settle = function (promises) {
      debug.deprecated('.settle()', '.reflect()')
      return new SettledPromiseArray(promises).promise()
    }

    Promise.prototype.settle = function () {
      return Promise.settle(this)
    }
  }

  var some = function some (Promise, PromiseArray, apiRejection) {
    var util = util$1
    var RangeError = errors$1.RangeError
    var AggregateError = errors$1.AggregateError
    var isArray = util.isArray
    var CANCELLATION = {}

    function SomePromiseArray (values) {
      this.constructor$(values)
      this._howMany = 0
      this._unwrap = false
      this._initialized = false
    }
    util.inherits(SomePromiseArray, PromiseArray)

    SomePromiseArray.prototype._init = function () {
      if (!this._initialized) {
        return
      }
      if (this._howMany === 0) {
        this._resolve([])
        return
      }
      this._init$(undefined, -5)
      var isArrayResolved = isArray(this._values)
      if (!this._isResolved() && isArrayResolved && this._howMany > this._canPossiblyFulfill()) {
        this._reject(this._getRangeError(this.length()))
      }
    }

    SomePromiseArray.prototype.init = function () {
      this._initialized = true
      this._init()
    }

    SomePromiseArray.prototype.setUnwrap = function () {
      this._unwrap = true
    }

    SomePromiseArray.prototype.howMany = function () {
      return this._howMany
    }

    SomePromiseArray.prototype.setHowMany = function (count) {
      this._howMany = count
    }

    SomePromiseArray.prototype._promiseFulfilled = function (value) {
      this._addFulfilled(value)
      if (this._fulfilled() === this.howMany()) {
        this._values.length = this.howMany()
        if (this.howMany() === 1 && this._unwrap) {
          this._resolve(this._values[0])
        } else {
          this._resolve(this._values)
        }
        return true
      }
      return false
    }
    SomePromiseArray.prototype._promiseRejected = function (reason) {
      this._addRejected(reason)
      return this._checkOutcome()
    }

    SomePromiseArray.prototype._promiseCancelled = function () {
      if (this._values instanceof Promise || this._values == null) {
        return this._cancel()
      }
      this._addRejected(CANCELLATION)
      return this._checkOutcome()
    }

    SomePromiseArray.prototype._checkOutcome = function () {
      if (this.howMany() > this._canPossiblyFulfill()) {
        var e = new AggregateError()
        for (var i = this.length(); i < this._values.length; ++i) {
          if (this._values[i] !== CANCELLATION) {
            e.push(this._values[i])
          }
        }
        if (e.length > 0) {
          this._reject(e)
        } else {
          this._cancel()
        }
        return true
      }
      return false
    }

    SomePromiseArray.prototype._fulfilled = function () {
      return this._totalResolved
    }

    SomePromiseArray.prototype._rejected = function () {
      return this._values.length - this.length()
    }

    SomePromiseArray.prototype._addRejected = function (reason) {
      this._values.push(reason)
    }

    SomePromiseArray.prototype._addFulfilled = function (value) {
      this._values[this._totalResolved++] = value
    }

    SomePromiseArray.prototype._canPossiblyFulfill = function () {
      return this.length() - this._rejected()
    }

    SomePromiseArray.prototype._getRangeError = function (count) {
      var message = 'Input array must contain at least ' + this._howMany + ' items but contains only ' + count + ' items'
      return new RangeError(message)
    }

    SomePromiseArray.prototype._resolveEmptyArray = function () {
      this._reject(this._getRangeError(0))
    }

    function some (promises, howMany) {
      if ((howMany | 0) !== howMany || howMany < 0) {
        return apiRejection('expecting a positive integer\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }
      var ret = new SomePromiseArray(promises)
      var promise = ret.promise()
      ret.setHowMany(howMany)
      ret.init()
      return promise
    }

    Promise.some = function (promises, howMany) {
      return some(promises, howMany)
    }

    Promise.prototype.some = function (howMany) {
      return some(this, howMany)
    }

    Promise._SomePromiseArray = SomePromiseArray
  }

  var filter = function filter (Promise, INTERNAL) {
    var PromiseMap = Promise.map

    Promise.prototype.filter = function (fn, options) {
      return PromiseMap(this, fn, options, INTERNAL)
    }

    Promise.filter = function (promises, fn, options) {
      return PromiseMap(promises, fn, options, INTERNAL)
    }
  }

  var each = function each (Promise, INTERNAL) {
    var PromiseReduce = Promise.reduce
    var PromiseAll = Promise.all

    function promiseAllThis () {
      return PromiseAll(this)
    }

    function PromiseMapSeries (promises, fn) {
      return PromiseReduce(promises, fn, INTERNAL, INTERNAL)
    }

    Promise.prototype.each = function (fn) {
      return PromiseReduce(this, fn, INTERNAL, 0)._then(promiseAllThis, undefined, undefined, this, undefined)
    }

    Promise.prototype.mapSeries = function (fn) {
      return PromiseReduce(this, fn, INTERNAL, INTERNAL)
    }

    Promise.each = function (promises, fn) {
      return PromiseReduce(promises, fn, INTERNAL, 0)._then(promiseAllThis, undefined, undefined, promises, undefined)
    }

    Promise.mapSeries = PromiseMapSeries
  }

  var any = function any (Promise) {
    var SomePromiseArray = Promise._SomePromiseArray
    function any (promises) {
      var ret = new SomePromiseArray(promises)
      var promise = ret.promise()
      ret.setHowMany(1)
      ret.setUnwrap()
      ret.init()
      return promise
    }

    Promise.any = function (promises) {
      return any(promises)
    }

    Promise.prototype.any = function () {
      return any(this)
    }
  }

  var promise = createCommonjsModule(function (module) {
    'use strict'

    module.exports = function () {
      var makeSelfResolutionError = function makeSelfResolutionError () {
        return new TypeError('circular promise resolution chain\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
      }
      var reflectHandler = function reflectHandler () {
        return new Promise.PromiseInspection(this._target())
      }
      var apiRejection = function apiRejection (msg) {
        return Promise.reject(new TypeError(msg))
      }
      function Proxyable () {}
      var UNDEFINED_BINDING = {}
      var util = util$1

      var getDomain
      if (util.isNode) {
        getDomain = function getDomain () {
          var ret = process.domain
          if (ret === undefined) ret = null
          return ret
        }
      } else {
        getDomain = function getDomain () {
          return null
        }
      }
      util.notEnumerableProp(Promise, '_getDomain', getDomain)

      var es5$$1 = es5
      var Async = async
      var async$$1 = new Async()
      es5$$1.defineProperty(Promise, '_async', { value: async$$1 })
      var errors = errors$1
      var TypeError = Promise.TypeError = errors.TypeError
      Promise.RangeError = errors.RangeError
      var CancellationError = Promise.CancellationError = errors.CancellationError
      Promise.TimeoutError = errors.TimeoutError
      Promise.OperationalError = errors.OperationalError
      Promise.RejectionError = errors.OperationalError
      Promise.AggregateError = errors.AggregateError
      var INTERNAL = function INTERNAL () {}
      var APPLY = {}
      var NEXT_FILTER = {}
      var tryConvertToPromise = thenables(Promise, INTERNAL)
      var PromiseArray = promise_array(Promise, INTERNAL, tryConvertToPromise, apiRejection, Proxyable)
      var Context = context(Promise)
        /* jshint unused:false */
      var createContext = Context.create
      var debug = debuggability(Promise, Context)
      var CapturedTrace = debug.CapturedTrace
      var PassThroughHandlerContext = _finally(Promise, tryConvertToPromise, NEXT_FILTER)
      var catchFilter = catch_filter(NEXT_FILTER)
      var nodebackForPromise = nodeback
      var errorObj = util.errorObj
      var tryCatch = util.tryCatch
      function check (self, executor) {
        if (self == null || self.constructor !== Promise) {
          throw new TypeError('the promise constructor cannot be invoked directly\u000a\u000a    See http://goo.gl/MqrFmX\u000a')
        }
        if (typeof executor !== 'function') {
          throw new TypeError('expecting a function but got ' + util.classString(executor))
        }
      }

      function Promise (executor) {
        if (executor !== INTERNAL) {
          check(this, executor)
        }
        this._bitField = 0
        this._fulfillmentHandler0 = undefined
        this._rejectionHandler0 = undefined
        this._promise0 = undefined
        this._receiver0 = undefined
        this._resolveFromExecutor(executor)
        this._promiseCreated()
        this._fireEvent('promiseCreated', this)
      }

      Promise.prototype.toString = function () {
        return '[object Promise]'
      }

      Promise.prototype.caught = Promise.prototype['catch'] = function (fn) {
        var len = arguments.length
        if (len > 1) {
          var catchInstances = new Array(len - 1),
            j = 0,
            i
          for (i = 0; i < len - 1; ++i) {
            var item = arguments[i]
            if (util.isObject(item)) {
              catchInstances[j++] = item
            } else {
              return apiRejection('Catch statement predicate: ' + 'expecting an object but got ' + util.classString(item))
            }
          }
          catchInstances.length = j
          fn = arguments[i]
          return this.then(undefined, catchFilter(catchInstances, fn, this))
        }
        return this.then(undefined, fn)
      }

      Promise.prototype.reflect = function () {
        return this._then(reflectHandler, reflectHandler, undefined, this, undefined)
      }

      Promise.prototype.then = function (didFulfill, didReject) {
        if (debug.warnings() && arguments.length > 0 && typeof didFulfill !== 'function' && typeof didReject !== 'function') {
          var msg = '.then() only accepts functions but was passed: ' + util.classString(didFulfill)
          if (arguments.length > 1) {
            msg += ', ' + util.classString(didReject)
          }
          this._warn(msg)
        }
        return this._then(didFulfill, didReject, undefined, undefined, undefined)
      }

      Promise.prototype.done = function (didFulfill, didReject) {
        var promise = this._then(didFulfill, didReject, undefined, undefined, undefined)
        promise._setIsFinal()
      }

      Promise.prototype.spread = function (fn) {
        if (typeof fn !== 'function') {
          return apiRejection('expecting a function but got ' + util.classString(fn))
        }
        return this.all()._then(fn, undefined, undefined, APPLY, undefined)
      }

      Promise.prototype.toJSON = function () {
        var ret = {
          isFulfilled: false,
          isRejected: false,
          fulfillmentValue: undefined,
          rejectionReason: undefined
        }
        if (this.isFulfilled()) {
          ret.fulfillmentValue = this.value()
          ret.isFulfilled = true
        } else if (this.isRejected()) {
          ret.rejectionReason = this.reason()
          ret.isRejected = true
        }
        return ret
      }

      Promise.prototype.all = function () {
        if (arguments.length > 0) {
          this._warn('.all() was passed arguments but it does not take any')
        }
        return new PromiseArray(this).promise()
      }

      Promise.prototype.error = function (fn) {
        return this.caught(util.originatesFromRejection, fn)
      }

      Promise.getNewLibraryCopy = module.exports

      Promise.is = function (val) {
        return val instanceof Promise
      }

      Promise.fromNode = Promise.fromCallback = function (fn) {
        var ret = new Promise(INTERNAL)
        ret._captureStackTrace()
        var multiArgs = arguments.length > 1 ? !!Object(arguments[1]).multiArgs : false
        var result = tryCatch(fn)(nodebackForPromise(ret, multiArgs))
        if (result === errorObj) {
          ret._rejectCallback(result.e, true)
        }
        if (!ret._isFateSealed()) ret._setAsyncGuaranteed()
        return ret
      }

      Promise.all = function (promises) {
        return new PromiseArray(promises).promise()
      }

      Promise.cast = function (obj) {
        var ret = tryConvertToPromise(obj)
        if (!(ret instanceof Promise)) {
          ret = new Promise(INTERNAL)
          ret._captureStackTrace()
          ret._setFulfilled()
          ret._rejectionHandler0 = obj
        }
        return ret
      }

      Promise.resolve = Promise.fulfilled = Promise.cast

      Promise.reject = Promise.rejected = function (reason) {
        var ret = new Promise(INTERNAL)
        ret._captureStackTrace()
        ret._rejectCallback(reason, true)
        return ret
      }

      Promise.setScheduler = function (fn) {
        if (typeof fn !== 'function') {
          throw new TypeError('expecting a function but got ' + util.classString(fn))
        }
        return async$$1.setScheduler(fn)
      }

      Promise.prototype._then = function (didFulfill, didReject, _, receiver, internalData) {
        var haveInternalData = internalData !== undefined
        var promise = haveInternalData ? internalData : new Promise(INTERNAL)
        var target = this._target()
        var bitField = target._bitField

        if (!haveInternalData) {
          promise._propagateFrom(this, 3)
          promise._captureStackTrace()
          if (receiver === undefined && (this._bitField & 2097152) !== 0) {
            if (!((bitField & 50397184) === 0)) {
              receiver = this._boundValue()
            } else {
              receiver = target === this ? undefined : this._boundTo
            }
          }
          this._fireEvent('promiseChained', this, promise)
        }

        var domain = getDomain()
        if (!((bitField & 50397184) === 0)) {
          var handler,
            value,
            settler = target._settlePromiseCtx
          if ((bitField & 33554432) !== 0) {
            value = target._rejectionHandler0
            handler = didFulfill
          } else if ((bitField & 16777216) !== 0) {
            value = target._fulfillmentHandler0
            handler = didReject
            target._unsetRejectionIsUnhandled()
          } else {
            settler = target._settlePromiseLateCancellationObserver
            value = new CancellationError('late cancellation observer')
            target._attachExtraTrace(value)
            handler = didReject
          }

          async$$1.invoke(settler, target, {
            handler: domain === null ? handler : typeof handler === 'function' && util.domainBind(domain, handler),
            promise: promise,
            receiver: receiver,
            value: value
          })
        } else {
          target._addCallbacks(didFulfill, didReject, promise, receiver, domain)
        }

        return promise
      }

      Promise.prototype._length = function () {
        return this._bitField & 65535
      }

      Promise.prototype._isFateSealed = function () {
        return (this._bitField & 117506048) !== 0
      }

      Promise.prototype._isFollowing = function () {
        return (this._bitField & 67108864) === 67108864
      }

      Promise.prototype._setLength = function (len) {
        this._bitField = this._bitField & -65536 | len & 65535
      }

      Promise.prototype._setFulfilled = function () {
        this._bitField = this._bitField | 33554432
        this._fireEvent('promiseFulfilled', this)
      }

      Promise.prototype._setRejected = function () {
        this._bitField = this._bitField | 16777216
        this._fireEvent('promiseRejected', this)
      }

      Promise.prototype._setFollowing = function () {
        this._bitField = this._bitField | 67108864
        this._fireEvent('promiseResolved', this)
      }

      Promise.prototype._setIsFinal = function () {
        this._bitField = this._bitField | 4194304
      }

      Promise.prototype._isFinal = function () {
        return (this._bitField & 4194304) > 0
      }

      Promise.prototype._unsetCancelled = function () {
        this._bitField = this._bitField & ~65536
      }

      Promise.prototype._setCancelled = function () {
        this._bitField = this._bitField | 65536
        this._fireEvent('promiseCancelled', this)
      }

      Promise.prototype._setWillBeCancelled = function () {
        this._bitField = this._bitField | 8388608
      }

      Promise.prototype._setAsyncGuaranteed = function () {
        if (async$$1.hasCustomScheduler()) return
        this._bitField = this._bitField | 134217728
      }

      Promise.prototype._receiverAt = function (index) {
        var ret = index === 0 ? this._receiver0 : this[index * 4 - 4 + 3]
        if (ret === UNDEFINED_BINDING) {
          return undefined
        } else if (ret === undefined && this._isBound()) {
          return this._boundValue()
        }
        return ret
      }

      Promise.prototype._promiseAt = function (index) {
        return this[index * 4 - 4 + 2]
      }

      Promise.prototype._fulfillmentHandlerAt = function (index) {
        return this[index * 4 - 4 + 0]
      }

      Promise.prototype._rejectionHandlerAt = function (index) {
        return this[index * 4 - 4 + 1]
      }

      Promise.prototype._boundValue = function () {}

      Promise.prototype._migrateCallback0 = function (follower) {
        var bitField = follower._bitField
        var fulfill = follower._fulfillmentHandler0
        var reject = follower._rejectionHandler0
        var promise = follower._promise0
        var receiver = follower._receiverAt(0)
        if (receiver === undefined) receiver = UNDEFINED_BINDING
        this._addCallbacks(fulfill, reject, promise, receiver, null)
      }

      Promise.prototype._migrateCallbackAt = function (follower, index) {
        var fulfill = follower._fulfillmentHandlerAt(index)
        var reject = follower._rejectionHandlerAt(index)
        var promise = follower._promiseAt(index)
        var receiver = follower._receiverAt(index)
        if (receiver === undefined) receiver = UNDEFINED_BINDING
        this._addCallbacks(fulfill, reject, promise, receiver, null)
      }

      Promise.prototype._addCallbacks = function (fulfill, reject, promise, receiver, domain) {
        var index = this._length()

        if (index >= 65535 - 4) {
          index = 0
          this._setLength(0)
        }

        if (index === 0) {
          this._promise0 = promise
          this._receiver0 = receiver
          if (typeof fulfill === 'function') {
            this._fulfillmentHandler0 = domain === null ? fulfill : util.domainBind(domain, fulfill)
          }
          if (typeof reject === 'function') {
            this._rejectionHandler0 = domain === null ? reject : util.domainBind(domain, reject)
          }
        } else {
          var base = index * 4 - 4
          this[base + 2] = promise
          this[base + 3] = receiver
          if (typeof fulfill === 'function') {
            this[base + 0] = domain === null ? fulfill : util.domainBind(domain, fulfill)
          }
          if (typeof reject === 'function') {
            this[base + 1] = domain === null ? reject : util.domainBind(domain, reject)
          }
        }
        this._setLength(index + 1)
        return index
      }

      Promise.prototype._proxy = function (proxyable, arg) {
        this._addCallbacks(undefined, undefined, arg, proxyable, null)
      }

      Promise.prototype._resolveCallback = function (value, shouldBind) {
        if ((this._bitField & 117506048) !== 0) return
        if (value === this) return this._rejectCallback(makeSelfResolutionError(), false)
        var maybePromise = tryConvertToPromise(value, this)
        if (!(maybePromise instanceof Promise)) return this._fulfill(value)

        if (shouldBind) this._propagateFrom(maybePromise, 2)

        var promise = maybePromise._target()

        if (promise === this) {
          this._reject(makeSelfResolutionError())
          return
        }

        var bitField = promise._bitField
        if ((bitField & 50397184) === 0) {
          var len = this._length()
          if (len > 0) promise._migrateCallback0(this)
          for (var i = 1; i < len; ++i) {
            promise._migrateCallbackAt(this, i)
          }
          this._setFollowing()
          this._setLength(0)
          this._setFollowee(promise)
        } else if ((bitField & 33554432) !== 0) {
          this._fulfill(promise._value())
        } else if ((bitField & 16777216) !== 0) {
          this._reject(promise._reason())
        } else {
          var reason = new CancellationError('late cancellation observer')
          promise._attachExtraTrace(reason)
          this._reject(reason)
        }
      }

      Promise.prototype._rejectCallback = function (reason, synchronous, ignoreNonErrorWarnings) {
        var trace = util.ensureErrorObject(reason)
        var hasStack = trace === reason
        if (!hasStack && !ignoreNonErrorWarnings && debug.warnings()) {
          var message = 'a promise was rejected with a non-error: ' + util.classString(reason)
          this._warn(message, true)
        }
        this._attachExtraTrace(trace, synchronous ? hasStack : false)
        this._reject(reason)
      }

      Promise.prototype._resolveFromExecutor = function (executor) {
        if (executor === INTERNAL) return
        var promise = this
        this._captureStackTrace()
        this._pushContext()
        var synchronous = true
        var r = this._execute(executor, function (value) {
          promise._resolveCallback(value)
        }, function (reason) {
          promise._rejectCallback(reason, synchronous)
        })
        synchronous = false
        this._popContext()

        if (r !== undefined) {
          promise._rejectCallback(r, true)
        }
      }

      Promise.prototype._settlePromiseFromHandler = function (handler, receiver, value, promise) {
        var bitField = promise._bitField
        if ((bitField & 65536) !== 0) return
        promise._pushContext()
        var x
        if (receiver === APPLY) {
          if (!value || typeof value.length !== 'number') {
            x = errorObj
            x.e = new TypeError('cannot .spread() a non-array: ' + util.classString(value))
          } else {
            x = tryCatch(handler).apply(this._boundValue(), value)
          }
        } else {
          x = tryCatch(handler).call(receiver, value)
        }
        var promiseCreated = promise._popContext()
        bitField = promise._bitField
        if ((bitField & 65536) !== 0) return

        if (x === NEXT_FILTER) {
          promise._reject(value)
        } else if (x === errorObj) {
          promise._rejectCallback(x.e, false)
        } else {
          debug.checkForgottenReturns(x, promiseCreated, '', promise, this)
          promise._resolveCallback(x)
        }
      }

      Promise.prototype._target = function () {
        var ret = this
        while (ret._isFollowing()) ret = ret._followee()
        return ret
      }

      Promise.prototype._followee = function () {
        return this._rejectionHandler0
      }

      Promise.prototype._setFollowee = function (promise) {
        this._rejectionHandler0 = promise
      }

      Promise.prototype._settlePromise = function (promise, handler, receiver, value) {
        var isPromise = promise instanceof Promise
        var bitField = this._bitField
        var asyncGuaranteed = (bitField & 134217728) !== 0
        if ((bitField & 65536) !== 0) {
          if (isPromise) promise._invokeInternalOnCancel()

          if (receiver instanceof PassThroughHandlerContext && receiver.isFinallyHandler()) {
            receiver.cancelPromise = promise
            if (tryCatch(handler).call(receiver, value) === errorObj) {
              promise._reject(errorObj.e)
            }
          } else if (handler === reflectHandler) {
            promise._fulfill(reflectHandler.call(receiver))
          } else if (receiver instanceof Proxyable) {
            receiver._promiseCancelled(promise)
          } else if (isPromise || promise instanceof PromiseArray) {
            promise._cancel()
          } else {
            receiver.cancel()
          }
        } else if (typeof handler === 'function') {
          if (!isPromise) {
            handler.call(receiver, value, promise)
          } else {
            if (asyncGuaranteed) promise._setAsyncGuaranteed()
            this._settlePromiseFromHandler(handler, receiver, value, promise)
          }
        } else if (receiver instanceof Proxyable) {
          if (!receiver._isResolved()) {
            if ((bitField & 33554432) !== 0) {
              receiver._promiseFulfilled(value, promise)
            } else {
              receiver._promiseRejected(value, promise)
            }
          }
        } else if (isPromise) {
          if (asyncGuaranteed) promise._setAsyncGuaranteed()
          if ((bitField & 33554432) !== 0) {
            promise._fulfill(value)
          } else {
            promise._reject(value)
          }
        }
      }

      Promise.prototype._settlePromiseLateCancellationObserver = function (ctx) {
        var handler = ctx.handler
        var promise = ctx.promise
        var receiver = ctx.receiver
        var value = ctx.value
        if (typeof handler === 'function') {
          if (!(promise instanceof Promise)) {
            handler.call(receiver, value, promise)
          } else {
            this._settlePromiseFromHandler(handler, receiver, value, promise)
          }
        } else if (promise instanceof Promise) {
          promise._reject(value)
        }
      }

      Promise.prototype._settlePromiseCtx = function (ctx) {
        this._settlePromise(ctx.promise, ctx.handler, ctx.receiver, ctx.value)
      }

      Promise.prototype._settlePromise0 = function (handler, value, bitField) {
        var promise = this._promise0
        var receiver = this._receiverAt(0)
        this._promise0 = undefined
        this._receiver0 = undefined
        this._settlePromise(promise, handler, receiver, value)
      }

      Promise.prototype._clearCallbackDataAtIndex = function (index) {
        var base = index * 4 - 4
        this[base + 2] = this[base + 3] = this[base + 0] = this[base + 1] = undefined
      }

      Promise.prototype._fulfill = function (value) {
        var bitField = this._bitField
        if ((bitField & 117506048) >>> 16) return
        if (value === this) {
          var err = makeSelfResolutionError()
          this._attachExtraTrace(err)
          return this._reject(err)
        }
        this._setFulfilled()
        this._rejectionHandler0 = value

        if ((bitField & 65535) > 0) {
          if ((bitField & 134217728) !== 0) {
            this._settlePromises()
          } else {
            async$$1.settlePromises(this)
          }
        }
      }

      Promise.prototype._reject = function (reason) {
        var bitField = this._bitField
        if ((bitField & 117506048) >>> 16) return
        this._setRejected()
        this._fulfillmentHandler0 = reason

        if (this._isFinal()) {
          return async$$1.fatalError(reason, util.isNode)
        }

        if ((bitField & 65535) > 0) {
          async$$1.settlePromises(this)
        } else {
          this._ensurePossibleRejectionHandled()
        }
      }

      Promise.prototype._fulfillPromises = function (len, value) {
        for (var i = 1; i < len; i++) {
          var handler = this._fulfillmentHandlerAt(i)
          var promise = this._promiseAt(i)
          var receiver = this._receiverAt(i)
          this._clearCallbackDataAtIndex(i)
          this._settlePromise(promise, handler, receiver, value)
        }
      }

      Promise.prototype._rejectPromises = function (len, reason) {
        for (var i = 1; i < len; i++) {
          var handler = this._rejectionHandlerAt(i)
          var promise = this._promiseAt(i)
          var receiver = this._receiverAt(i)
          this._clearCallbackDataAtIndex(i)
          this._settlePromise(promise, handler, receiver, reason)
        }
      }

      Promise.prototype._settlePromises = function () {
        var bitField = this._bitField
        var len = bitField & 65535

        if (len > 0) {
          if ((bitField & 16842752) !== 0) {
            var reason = this._fulfillmentHandler0
            this._settlePromise0(this._rejectionHandler0, reason, bitField)
            this._rejectPromises(len, reason)
          } else {
            var value = this._rejectionHandler0
            this._settlePromise0(this._fulfillmentHandler0, value, bitField)
            this._fulfillPromises(len, value)
          }
          this._setLength(0)
        }
        this._clearCancellationData()
      }

      Promise.prototype._settledValue = function () {
        var bitField = this._bitField
        if ((bitField & 33554432) !== 0) {
          return this._rejectionHandler0
        } else if ((bitField & 16777216) !== 0) {
          return this._fulfillmentHandler0
        }
      }

      function deferResolve (v) {
        this.promise._resolveCallback(v)
      }
      function deferReject (v) {
        this.promise._rejectCallback(v, false)
      }

      Promise.defer = Promise.pending = function () {
        debug.deprecated('Promise.defer', 'new Promise')
        var promise = new Promise(INTERNAL)
        return {
          promise: promise,
          resolve: deferResolve,
          reject: deferReject
        }
      }

      util.notEnumerableProp(Promise, '_makeSelfResolutionError', makeSelfResolutionError)

      method(Promise, INTERNAL, tryConvertToPromise, apiRejection, debug)
      bind(Promise, INTERNAL, tryConvertToPromise, debug)
      cancel(Promise, PromiseArray, apiRejection, debug)
      direct_resolve(Promise)
      synchronous_inspection(Promise)
      join(Promise, PromiseArray, tryConvertToPromise, INTERNAL, async$$1, getDomain)
      Promise.Promise = Promise
      Promise.version = '3.5.1'
      map$2(Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL, debug)
      call_get(Promise)
      using(Promise, apiRejection, tryConvertToPromise, createContext, INTERNAL, debug)
      timers(Promise, INTERNAL, debug)
      generators(Promise, apiRejection, INTERNAL, tryConvertToPromise, Proxyable, debug)
      nodeify(Promise)
      promisify(Promise, INTERNAL)
      props(Promise, PromiseArray, tryConvertToPromise, apiRejection)
      race(Promise, INTERNAL, tryConvertToPromise, apiRejection)
      reduce(Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL, debug)
      settle(Promise, PromiseArray, debug)
      some(Promise, PromiseArray, apiRejection)
      filter(Promise, INTERNAL)
      each(Promise, INTERNAL)
      any(Promise)

      util.toFastProperties(Promise)
      util.toFastProperties(Promise.prototype)
      function fillTypes (value) {
        var p = new Promise(INTERNAL)
        p._fulfillmentHandler0 = value
        p._rejectionHandler0 = value
        p._promise0 = value
        p._receiver0 = value
      }
        // Complete slack tracking, opt out of field-type tracking and
        // stabilize map
      fillTypes({ a: 1 })
      fillTypes({ b: 2 })
      fillTypes({ c: 3 })
      fillTypes(1)
      fillTypes(function () {})
      fillTypes(undefined)
      fillTypes(false)
      fillTypes(new Promise(INTERNAL))
      debug.setBounds(Async.firstLineError, util.lastLineError)
      return Promise
    }
  })

  var old
  if (typeof Promise !== 'undefined') old = Promise
  function noConflict () {
    try {
      if (Promise === bluebird) Promise = old
    } catch (e) {}
    return bluebird
  }
  var bluebird = promise()
  bluebird.noConflict = noConflict
  var bluebird_1 = bluebird

  var lookup = []
  var revLookup = []
  var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array
  var inited = false
  function init () {
    inited = true
    var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    for (var i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i]
      revLookup[code.charCodeAt(i)] = i
    }

    revLookup['-'.charCodeAt(0)] = 62
    revLookup['_'.charCodeAt(0)] = 63
  }

  function toByteArray (b64) {
    if (!inited) {
      init()
    }
    var i, j, l, tmp, placeHolders, arr
    var len = b64.length

    if (len % 4 > 0) {
      throw new Error('Invalid string. Length must be a multiple of 4')
    }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
    placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0

  // base64 is 4/3 + up to two characters of the original data
    arr = new Arr(len * 3 / 4 - placeHolders)

  // if there are placeholders, only get up to the last complete 4 chars
    l = placeHolders > 0 ? len - 4 : len

    var L = 0

    for (i = 0, j = 0; i < l; i += 4, j += 3) {
      tmp = revLookup[b64.charCodeAt(i)] << 18 | revLookup[b64.charCodeAt(i + 1)] << 12 | revLookup[b64.charCodeAt(i + 2)] << 6 | revLookup[b64.charCodeAt(i + 3)]
      arr[L++] = tmp >> 16 & 0xFF
      arr[L++] = tmp >> 8 & 0xFF
      arr[L++] = tmp & 0xFF
    }

    if (placeHolders === 2) {
      tmp = revLookup[b64.charCodeAt(i)] << 2 | revLookup[b64.charCodeAt(i + 1)] >> 4
      arr[L++] = tmp & 0xFF
    } else if (placeHolders === 1) {
      tmp = revLookup[b64.charCodeAt(i)] << 10 | revLookup[b64.charCodeAt(i + 1)] << 4 | revLookup[b64.charCodeAt(i + 2)] >> 2
      arr[L++] = tmp >> 8 & 0xFF
      arr[L++] = tmp & 0xFF
    }

    return arr
  }

  function tripletToBase64 (num) {
    return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
  }

  function encodeChunk (uint8, start, end) {
    var tmp
    var output = []
    for (var i = start; i < end; i += 3) {
      tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + uint8[i + 2]
      output.push(tripletToBase64(tmp))
    }
    return output.join('')
  }

  function fromByteArray (uint8) {
    if (!inited) {
      init()
    }
    var tmp
    var len = uint8.length
    var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
    var output = ''
    var parts = []
    var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
    for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
      parts.push(encodeChunk(uint8, i, i + maxChunkLength > len2 ? len2 : i + maxChunkLength))
    }

  // pad the end with zeros, but make sure to not forget the extra bytes
    if (extraBytes === 1) {
      tmp = uint8[len - 1]
      output += lookup[tmp >> 2]
      output += lookup[tmp << 4 & 0x3F]
      output += '=='
    } else if (extraBytes === 2) {
      tmp = (uint8[len - 2] << 8) + uint8[len - 1]
      output += lookup[tmp >> 10]
      output += lookup[tmp >> 4 & 0x3F]
      output += lookup[tmp << 2 & 0x3F]
      output += '='
    }

    parts.push(output)

    return parts.join('')
  }

  function read (buffer, offset, isLE, mLen, nBytes) {
    var e, m
    var eLen = nBytes * 8 - mLen - 1
    var eMax = (1 << eLen) - 1
    var eBias = eMax >> 1
    var nBits = -7
    var i = isLE ? nBytes - 1 : 0
    var d = isLE ? -1 : 1
    var s = buffer[offset + i]

    i += d

    e = s & (1 << -nBits) - 1
    s >>= -nBits
    nBits += eLen
    for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    m = e & (1 << -nBits) - 1
    e >>= -nBits
    nBits += mLen
    for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    if (e === 0) {
      e = 1 - eBias
    } else if (e === eMax) {
      return m ? NaN : (s ? -1 : 1) * Infinity
    } else {
      m = m + Math.pow(2, mLen)
      e = e - eBias
    }
    return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
  }

  function write (buffer, value, offset, isLE, mLen, nBytes) {
    var e, m, c
    var eLen = nBytes * 8 - mLen - 1
    var eMax = (1 << eLen) - 1
    var eBias = eMax >> 1
    var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0
    var i = isLE ? 0 : nBytes - 1
    var d = isLE ? 1 : -1
    var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0

    value = Math.abs(value)

    if (isNaN(value) || value === Infinity) {
      m = isNaN(value) ? 1 : 0
      e = eMax
    } else {
      e = Math.floor(Math.log(value) / Math.LN2)
      if (value * (c = Math.pow(2, -e)) < 1) {
        e--
        c *= 2
      }
      if (e + eBias >= 1) {
        value += rt / c
      } else {
        value += rt * Math.pow(2, 1 - eBias)
      }
      if (value * c >= 2) {
        e++
        c /= 2
      }

      if (e + eBias >= eMax) {
        m = 0
        e = eMax
      } else if (e + eBias >= 1) {
        m = (value * c - 1) * Math.pow(2, mLen)
        e = e + eBias
      } else {
        m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
        e = 0
      }
    }

    for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

    e = e << mLen | m
    eLen += mLen
    for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

    buffer[offset + i - d] |= s * 128
  }

  var toString = {}.toString

  var isArray$2 = Array.isArray || function (arr) {
    return toString.call(arr) == '[object Array]'
  }

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

  var INSPECT_MAX_BYTES = 50

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
  Buffer$1.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined ? global.TYPED_ARRAY_SUPPORT : true

  function kMaxLength () {
    return Buffer$1.TYPED_ARRAY_SUPPORT ? 0x7fffffff : 0x3fffffff
  }

  function createBuffer (that, length) {
    if (kMaxLength() < length) {
      throw new RangeError('Invalid typed array length')
    }
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
      that = new Uint8Array(length)
      that.__proto__ = Buffer$1.prototype
    } else {
    // Fallback: Return an object instance of the Buffer class
      if (that === null) {
        that = new Buffer$1(length)
      }
      that.length = length
    }

    return that
  }

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

  function Buffer$1 (arg, encodingOrOffset, length) {
    if (!Buffer$1.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer$1)) {
      return new Buffer$1(arg, encodingOrOffset, length)
    }

  // Common case.
    if (typeof arg === 'number') {
      if (typeof encodingOrOffset === 'string') {
        throw new Error('If encoding is specified then the first argument must be a string')
      }
      return allocUnsafe(this, arg)
    }
    return from(this, arg, encodingOrOffset, length)
  }

  Buffer$1.poolSize = 8192 // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
  Buffer$1._augment = function (arr) {
    arr.__proto__ = Buffer$1.prototype
    return arr
  }

  function from (that, value, encodingOrOffset, length) {
    if (typeof value === 'number') {
      throw new TypeError('"value" argument must not be a number')
    }

    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return fromArrayBuffer(that, value, encodingOrOffset, length)
    }

    if (typeof value === 'string') {
      return fromString(that, value, encodingOrOffset)
    }

    return fromObject(that, value)
  }

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
  Buffer$1.from = function (value, encodingOrOffset, length) {
    return from(null, value, encodingOrOffset, length)
  }

  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    Buffer$1.prototype.__proto__ = Uint8Array.prototype
    Buffer$1.__proto__ = Uint8Array
    if (typeof Symbol !== 'undefined' && Symbol.species && Buffer$1[Symbol.species] === Buffer$1) {
    // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
    // Object.defineProperty(Buffer, Symbol.species, {
    //   value: null,
    //   configurable: true
    // })
    }
  }

  function assertSize (size) {
    if (typeof size !== 'number') {
      throw new TypeError('"size" argument must be a number')
    } else if (size < 0) {
      throw new RangeError('"size" argument must not be negative')
    }
  }

  function alloc (that, size, fill, encoding) {
    assertSize(size)
    if (size <= 0) {
      return createBuffer(that, size)
    }
    if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
      return typeof encoding === 'string' ? createBuffer(that, size).fill(fill, encoding) : createBuffer(that, size).fill(fill)
    }
    return createBuffer(that, size)
  }

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
  Buffer$1.alloc = function (size, fill, encoding) {
    return alloc(null, size, fill, encoding)
  }

  function allocUnsafe (that, size) {
    assertSize(size)
    that = createBuffer(that, size < 0 ? 0 : checked(size) | 0)
    if (!Buffer$1.TYPED_ARRAY_SUPPORT) {
      for (var i = 0; i < size; ++i) {
        that[i] = 0
      }
    }
    return that
  }

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
  Buffer$1.allocUnsafe = function (size) {
    return allocUnsafe(null, size)
  }
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
  Buffer$1.allocUnsafeSlow = function (size) {
    return allocUnsafe(null, size)
  }

  function fromString (that, string, encoding) {
    if (typeof encoding !== 'string' || encoding === '') {
      encoding = 'utf8'
    }

    if (!Buffer$1.isEncoding(encoding)) {
      throw new TypeError('"encoding" must be a valid string encoding')
    }

    var length = byteLength(string, encoding) | 0
    that = createBuffer(that, length)

    var actual = that.write(string, encoding)

    if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
      that = that.slice(0, actual)
    }

    return that
  }

  function fromArrayLike (that, array) {
    var length = array.length < 0 ? 0 : checked(array.length) | 0
    that = createBuffer(that, length)
    for (var i = 0; i < length; i += 1) {
      that[i] = array[i] & 255
    }
    return that
  }

  function fromArrayBuffer (that, array, byteOffset, length) {
    array.byteLength // this throws if `array` is not a valid ArrayBuffer

    if (byteOffset < 0 || array.byteLength < byteOffset) {
      throw new RangeError('\'offset\' is out of bounds')
    }

    if (array.byteLength < byteOffset + (length || 0)) {
      throw new RangeError('\'length\' is out of bounds')
    }

    if (byteOffset === undefined && length === undefined) {
      array = new Uint8Array(array)
    } else if (length === undefined) {
      array = new Uint8Array(array, byteOffset)
    } else {
      array = new Uint8Array(array, byteOffset, length)
    }

    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
      that = array
      that.__proto__ = Buffer$1.prototype
    } else {
    // Fallback: Return an object instance of the Buffer class
      that = fromArrayLike(that, array)
    }
    return that
  }

  function fromObject (that, obj) {
    if (internalIsBuffer(obj)) {
      var len = checked(obj.length) | 0
      that = createBuffer(that, len)

      if (that.length === 0) {
        return that
      }

      obj.copy(that, 0, 0, len)
      return that
    }

    if (obj) {
      if (typeof ArrayBuffer !== 'undefined' && obj.buffer instanceof ArrayBuffer || 'length' in obj) {
        if (typeof obj.length !== 'number' || isnan(obj.length)) {
          return createBuffer(that, 0)
        }
        return fromArrayLike(that, obj)
      }

      if (obj.type === 'Buffer' && isArray$2(obj.data)) {
        return fromArrayLike(that, obj.data)
      }
    }

    throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
  }

  function checked (length) {
  // Note: cannot use `length < kMaxLength()` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
    if (length >= kMaxLength()) {
      throw new RangeError('Attempt to allocate Buffer larger than maximum ' + 'size: 0x' + kMaxLength().toString(16) + ' bytes')
    }
    return length | 0
  }

  Buffer$1.isBuffer = isBuffer$1
  function internalIsBuffer (b) {
    return !!(b != null && b._isBuffer)
  }

  Buffer$1.compare = function compare (a, b) {
    if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
      throw new TypeError('Arguments must be Buffers')
    }

    if (a === b) return 0

    var x = a.length
    var y = b.length

    for (var i = 0, len = Math.min(x, y); i < len; ++i) {
      if (a[i] !== b[i]) {
        x = a[i]
        y = b[i]
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  }

  Buffer$1.isEncoding = function isEncoding (encoding) {
    switch (String(encoding).toLowerCase()) {
      case 'hex':
      case 'utf8':
      case 'utf-8':
      case 'ascii':
      case 'latin1':
      case 'binary':
      case 'base64':
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return true
      default:
        return false
    }
  }

  Buffer$1.concat = function concat (list, length) {
    if (!isArray$2(list)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }

    if (list.length === 0) {
      return Buffer$1.alloc(0)
    }

    var i
    if (length === undefined) {
      length = 0
      for (i = 0; i < list.length; ++i) {
        length += list[i].length
      }
    }

    var buffer = Buffer$1.allocUnsafe(length)
    var pos = 0
    for (i = 0; i < list.length; ++i) {
      var buf = list[i]
      if (!internalIsBuffer(buf)) {
        throw new TypeError('"list" argument must be an Array of Buffers')
      }
      buf.copy(buffer, pos)
      pos += buf.length
    }
    return buffer
  }

  function byteLength (string, encoding) {
    if (internalIsBuffer(string)) {
      return string.length
    }
    if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' && (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
      return string.byteLength
    }
    if (typeof string !== 'string') {
      string = '' + string
    }

    var len = string.length
    if (len === 0) return 0

  // Use a for loop to avoid recursion
    var loweredCase = false
    for (;;) {
      switch (encoding) {
        case 'ascii':
        case 'latin1':
        case 'binary':
          return len
        case 'utf8':
        case 'utf-8':
        case undefined:
          return utf8ToBytes(string).length
        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return len * 2
        case 'hex':
          return len >>> 1
        case 'base64':
          return base64ToBytes(string).length
        default:
          if (loweredCase) return utf8ToBytes(string).length // assume utf8
          encoding = ('' + encoding).toLowerCase()
          loweredCase = true
      }
    }
  }
  Buffer$1.byteLength = byteLength

  function slowToString (encoding, start, end) {
    var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
    if (start === undefined || start < 0) {
      start = 0
    }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
    if (start > this.length) {
      return ''
    }

    if (end === undefined || end > this.length) {
      end = this.length
    }

    if (end <= 0) {
      return ''
    }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
    end >>>= 0
    start >>>= 0

    if (end <= start) {
      return ''
    }

    if (!encoding) encoding = 'utf8'

    while (true) {
      switch (encoding) {
        case 'hex':
          return hexSlice(this, start, end)

        case 'utf8':
        case 'utf-8':
          return utf8Slice(this, start, end)

        case 'ascii':
          return asciiSlice(this, start, end)

        case 'latin1':
        case 'binary':
          return latin1Slice(this, start, end)

        case 'base64':
          return base64Slice(this, start, end)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return utf16leSlice(this, start, end)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = (encoding + '').toLowerCase()
          loweredCase = true
      }
    }
  }

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
  Buffer$1.prototype._isBuffer = true

  function swap (b, n, m) {
    var i = b[n]
    b[n] = b[m]
    b[m] = i
  }

  Buffer$1.prototype.swap16 = function swap16 () {
    var len = this.length
    if (len % 2 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 16-bits')
    }
    for (var i = 0; i < len; i += 2) {
      swap(this, i, i + 1)
    }
    return this
  }

  Buffer$1.prototype.swap32 = function swap32 () {
    var len = this.length
    if (len % 4 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 32-bits')
    }
    for (var i = 0; i < len; i += 4) {
      swap(this, i, i + 3)
      swap(this, i + 1, i + 2)
    }
    return this
  }

  Buffer$1.prototype.swap64 = function swap64 () {
    var len = this.length
    if (len % 8 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 64-bits')
    }
    for (var i = 0; i < len; i += 8) {
      swap(this, i, i + 7)
      swap(this, i + 1, i + 6)
      swap(this, i + 2, i + 5)
      swap(this, i + 3, i + 4)
    }
    return this
  }

  Buffer$1.prototype.toString = function toString () {
    var length = this.length | 0
    if (length === 0) return ''
    if (arguments.length === 0) return utf8Slice(this, 0, length)
    return slowToString.apply(this, arguments)
  }

  Buffer$1.prototype.equals = function equals (b) {
    if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
    if (this === b) return true
    return Buffer$1.compare(this, b) === 0
  }

  Buffer$1.prototype.inspect = function inspect () {
    var str = ''
    var max = INSPECT_MAX_BYTES
    if (this.length > 0) {
      str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
      if (this.length > max) str += ' ... '
    }
    return '<Buffer ' + str + '>'
  }

  Buffer$1.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
    if (!internalIsBuffer(target)) {
      throw new TypeError('Argument must be a Buffer')
    }

    if (start === undefined) {
      start = 0
    }
    if (end === undefined) {
      end = target ? target.length : 0
    }
    if (thisStart === undefined) {
      thisStart = 0
    }
    if (thisEnd === undefined) {
      thisEnd = this.length
    }

    if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
      throw new RangeError('out of range index')
    }

    if (thisStart >= thisEnd && start >= end) {
      return 0
    }
    if (thisStart >= thisEnd) {
      return -1
    }
    if (start >= end) {
      return 1
    }

    start >>>= 0
    end >>>= 0
    thisStart >>>= 0
    thisEnd >>>= 0

    if (this === target) return 0

    var x = thisEnd - thisStart
    var y = end - start
    var len = Math.min(x, y)

    var thisCopy = this.slice(thisStart, thisEnd)
    var targetCopy = target.slice(start, end)

    for (var i = 0; i < len; ++i) {
      if (thisCopy[i] !== targetCopy[i]) {
        x = thisCopy[i]
        y = targetCopy[i]
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  }

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
  function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
    if (buffer.length === 0) return -1

  // Normalize byteOffset
    if (typeof byteOffset === 'string') {
      encoding = byteOffset
      byteOffset = 0
    } else if (byteOffset > 0x7fffffff) {
      byteOffset = 0x7fffffff
    } else if (byteOffset < -0x80000000) {
      byteOffset = -0x80000000
    }
    byteOffset = +byteOffset // Coerce to Number.
    if (isNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
      byteOffset = dir ? 0 : buffer.length - 1
    }

  // Normalize byteOffset: negative offsets start from the end of the buffer
    if (byteOffset < 0) byteOffset = buffer.length + byteOffset
    if (byteOffset >= buffer.length) {
      if (dir) return -1; else byteOffset = buffer.length - 1
    } else if (byteOffset < 0) {
      if (dir) byteOffset = 0; else return -1
    }

  // Normalize val
    if (typeof val === 'string') {
      val = Buffer$1.from(val, encoding)
    }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
    if (internalIsBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
      if (val.length === 0) {
        return -1
      }
      return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
    } else if (typeof val === 'number') {
      val = val & 0xFF // Search for a byte value [0-255]
      if (Buffer$1.TYPED_ARRAY_SUPPORT && typeof Uint8Array.prototype.indexOf === 'function') {
        if (dir) {
          return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
        } else {
          return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
        }
      }
      return arrayIndexOf(buffer, [val], byteOffset, encoding, dir)
    }

    throw new TypeError('val must be string, number or Buffer')
  }

  function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
    var indexSize = 1
    var arrLength = arr.length
    var valLength = val.length

    if (encoding !== undefined) {
      encoding = String(encoding).toLowerCase()
      if (encoding === 'ucs2' || encoding === 'ucs-2' || encoding === 'utf16le' || encoding === 'utf-16le') {
        if (arr.length < 2 || val.length < 2) {
          return -1
        }
        indexSize = 2
        arrLength /= 2
        valLength /= 2
        byteOffset /= 2
      }
    }

    function read$$1 (buf, i) {
      if (indexSize === 1) {
        return buf[i]
      } else {
        return buf.readUInt16BE(i * indexSize)
      }
    }

    var i
    if (dir) {
      var foundIndex = -1
      for (i = byteOffset; i < arrLength; i++) {
        if (read$$1(arr, i) === read$$1(val, foundIndex === -1 ? 0 : i - foundIndex)) {
          if (foundIndex === -1) foundIndex = i
          if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
        } else {
          if (foundIndex !== -1) i -= i - foundIndex
          foundIndex = -1
        }
      }
    } else {
      if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
      for (i = byteOffset; i >= 0; i--) {
        var found = true
        for (var j = 0; j < valLength; j++) {
          if (read$$1(arr, i + j) !== read$$1(val, j)) {
            found = false
            break
          }
        }
        if (found) return i
      }
    }

    return -1
  }

  Buffer$1.prototype.includes = function includes (val, byteOffset, encoding) {
    return this.indexOf(val, byteOffset, encoding) !== -1
  }

  Buffer$1.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
  }

  Buffer$1.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
  }

  function hexWrite (buf, string, offset, length) {
    offset = Number(offset) || 0
    var remaining = buf.length - offset
    if (!length) {
      length = remaining
    } else {
      length = Number(length)
      if (length > remaining) {
        length = remaining
      }
    }

  // must be an even number of digits
    var strLen = string.length
    if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

    if (length > strLen / 2) {
      length = strLen / 2
    }
    for (var i = 0; i < length; ++i) {
      var parsed = parseInt(string.substr(i * 2, 2), 16)
      if (isNaN(parsed)) return i
      buf[offset + i] = parsed
    }
    return i
  }

  function utf8Write (buf, string, offset, length) {
    return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
  }

  function asciiWrite (buf, string, offset, length) {
    return blitBuffer(asciiToBytes(string), buf, offset, length)
  }

  function latin1Write (buf, string, offset, length) {
    return asciiWrite(buf, string, offset, length)
  }

  function base64Write (buf, string, offset, length) {
    return blitBuffer(base64ToBytes(string), buf, offset, length)
  }

  function ucs2Write (buf, string, offset, length) {
    return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
  }

  Buffer$1.prototype.write = function write$$1 (string, offset, length, encoding) {
  // Buffer#write(string)
    if (offset === undefined) {
      encoding = 'utf8'
      length = this.length
      offset = 0
    // Buffer#write(string, encoding)
    } else if (length === undefined && typeof offset === 'string') {
      encoding = offset
      length = this.length
      offset = 0
    // Buffer#write(string, offset[, length][, encoding])
    } else if (isFinite(offset)) {
      offset = offset | 0
      if (isFinite(length)) {
        length = length | 0
        if (encoding === undefined) encoding = 'utf8'
      } else {
        encoding = length
        length = undefined
      }
    // legacy write(string, encoding, offset, length) - remove in v0.13
    } else {
      throw new Error('Buffer.write(string, encoding, offset[, length]) is no longer supported')
    }

    var remaining = this.length - offset
    if (length === undefined || length > remaining) length = remaining

    if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
      throw new RangeError('Attempt to write outside buffer bounds')
    }

    if (!encoding) encoding = 'utf8'

    var loweredCase = false
    for (;;) {
      switch (encoding) {
        case 'hex':
          return hexWrite(this, string, offset, length)

        case 'utf8':
        case 'utf-8':
          return utf8Write(this, string, offset, length)

        case 'ascii':
          return asciiWrite(this, string, offset, length)

        case 'latin1':
        case 'binary':
          return latin1Write(this, string, offset, length)

        case 'base64':
        // Warning: maxLength not taken into account in base64Write
          return base64Write(this, string, offset, length)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return ucs2Write(this, string, offset, length)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = ('' + encoding).toLowerCase()
          loweredCase = true
      }
    }
  }

  Buffer$1.prototype.toJSON = function toJSON () {
    return {
      type: 'Buffer',
      data: Array.prototype.slice.call(this._arr || this, 0)
    }
  }

  function base64Slice (buf, start, end) {
    if (start === 0 && end === buf.length) {
      return fromByteArray(buf)
    } else {
      return fromByteArray(buf.slice(start, end))
    }
  }

  function utf8Slice (buf, start, end) {
    end = Math.min(buf.length, end)
    var res = []

    var i = start
    while (i < end) {
      var firstByte = buf[i]
      var codePoint = null
      var bytesPerSequence = firstByte > 0xEF ? 4 : firstByte > 0xDF ? 3 : firstByte > 0xBF ? 2 : 1

      if (i + bytesPerSequence <= end) {
        var secondByte, thirdByte, fourthByte, tempCodePoint

        switch (bytesPerSequence) {
          case 1:
            if (firstByte < 0x80) {
              codePoint = firstByte
            }
            break
          case 2:
            secondByte = buf[i + 1]
            if ((secondByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0x1F) << 0x6 | secondByte & 0x3F
              if (tempCodePoint > 0x7F) {
                codePoint = tempCodePoint
              }
            }
            break
          case 3:
            secondByte = buf[i + 1]
            thirdByte = buf[i + 2]
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | thirdByte & 0x3F
              if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
                codePoint = tempCodePoint
              }
            }
            break
          case 4:
            secondByte = buf[i + 1]
            thirdByte = buf[i + 2]
            fourthByte = buf[i + 3]
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | fourthByte & 0x3F
              if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
                codePoint = tempCodePoint
              }
            }
        }
      }

      if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
        codePoint = 0xFFFD
        bytesPerSequence = 1
      } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
        codePoint -= 0x10000
        res.push(codePoint >>> 10 & 0x3FF | 0xD800)
        codePoint = 0xDC00 | codePoint & 0x3FF
      }

      res.push(codePoint)
      i += bytesPerSequence
    }

    return decodeCodePointsArray(res)
  }

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
  var MAX_ARGUMENTS_LENGTH = 0x1000

  function decodeCodePointsArray (codePoints) {
    var len = codePoints.length
    if (len <= MAX_ARGUMENTS_LENGTH) {
      return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
    }

  // Decode in chunks to avoid "call stack size exceeded".
    var res = ''
    var i = 0
    while (i < len) {
      res += String.fromCharCode.apply(String, codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH))
    }
    return res
  }

  function asciiSlice (buf, start, end) {
    var ret = ''
    end = Math.min(buf.length, end)

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i] & 0x7F)
    }
    return ret
  }

  function latin1Slice (buf, start, end) {
    var ret = ''
    end = Math.min(buf.length, end)

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i])
    }
    return ret
  }

  function hexSlice (buf, start, end) {
    var len = buf.length

    if (!start || start < 0) start = 0
    if (!end || end < 0 || end > len) end = len

    var out = ''
    for (var i = start; i < end; ++i) {
      out += toHex(buf[i])
    }
    return out
  }

  function utf16leSlice (buf, start, end) {
    var bytes = buf.slice(start, end)
    var res = ''
    for (var i = 0; i < bytes.length; i += 2) {
      res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
    }
    return res
  }

  Buffer$1.prototype.slice = function slice (start, end) {
    var len = this.length
    start = ~~start
    end = end === undefined ? len : ~~end

    if (start < 0) {
      start += len
      if (start < 0) start = 0
    } else if (start > len) {
      start = len
    }

    if (end < 0) {
      end += len
      if (end < 0) end = 0
    } else if (end > len) {
      end = len
    }

    if (end < start) end = start

    var newBuf
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      newBuf = this.subarray(start, end)
      newBuf.__proto__ = Buffer$1.prototype
    } else {
      var sliceLen = end - start
      newBuf = new Buffer$1(sliceLen, undefined)
      for (var i = 0; i < sliceLen; ++i) {
        newBuf[i] = this[i + start]
      }
    }

    return newBuf
  }

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
  function checkOffset (offset, ext, length) {
    if (offset % 1 !== 0 || offset < 0) throw new RangeError('offset is not uint')
    if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
  }

  Buffer$1.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
    offset = offset | 0
    byteLength = byteLength | 0
    if (!noAssert) checkOffset(offset, byteLength, this.length)

    var val = this[offset]
    var mul = 1
    var i = 0
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul
    }

    return val
  }

  Buffer$1.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
    offset = offset | 0
    byteLength = byteLength | 0
    if (!noAssert) {
      checkOffset(offset, byteLength, this.length)
    }

    var val = this[offset + --byteLength]
    var mul = 1
    while (byteLength > 0 && (mul *= 0x100)) {
      val += this[offset + --byteLength] * mul
    }

    return val
  }

  Buffer$1.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length)
    return this[offset]
  }

  Buffer$1.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length)
    return this[offset] | this[offset + 1] << 8
  }

  Buffer$1.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length)
    return this[offset] << 8 | this[offset + 1]
  }

  Buffer$1.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length)

    return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 0x1000000
  }

  Buffer$1.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length)

    return this[offset] * 0x1000000 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3])
  }

  Buffer$1.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
    offset = offset | 0
    byteLength = byteLength | 0
    if (!noAssert) checkOffset(offset, byteLength, this.length)

    var val = this[offset]
    var mul = 1
    var i = 0
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul
    }
    mul *= 0x80

    if (val >= mul) val -= Math.pow(2, 8 * byteLength)

    return val
  }

  Buffer$1.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
    offset = offset | 0
    byteLength = byteLength | 0
    if (!noAssert) checkOffset(offset, byteLength, this.length)

    var i = byteLength
    var mul = 1
    var val = this[offset + --i]
    while (i > 0 && (mul *= 0x100)) {
      val += this[offset + --i] * mul
    }
    mul *= 0x80

    if (val >= mul) val -= Math.pow(2, 8 * byteLength)

    return val
  }

  Buffer$1.prototype.readInt8 = function readInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length)
    if (!(this[offset] & 0x80)) return this[offset]
    return (0xff - this[offset] + 1) * -1
  }

  Buffer$1.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length)
    var val = this[offset] | this[offset + 1] << 8
    return val & 0x8000 ? val | 0xFFFF0000 : val
  }

  Buffer$1.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length)
    var val = this[offset + 1] | this[offset] << 8
    return val & 0x8000 ? val | 0xFFFF0000 : val
  }

  Buffer$1.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length)

    return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24
  }

  Buffer$1.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length)

    return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]
  }

  Buffer$1.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length)
    return read(this, offset, true, 23, 4)
  }

  Buffer$1.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length)
    return read(this, offset, false, 23, 4)
  }

  Buffer$1.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length)
    return read(this, offset, true, 52, 8)
  }

  Buffer$1.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length)
    return read(this, offset, false, 52, 8)
  }

  function checkInt (buf, value, offset, ext, max, min) {
    if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
    if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
  }

  Buffer$1.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
    value = +value
    offset = offset | 0
    byteLength = byteLength | 0
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1
      checkInt(this, value, offset, byteLength, maxBytes, 0)
    }

    var mul = 1
    var i = 0
    this[offset] = value & 0xFF
    while (++i < byteLength && (mul *= 0x100)) {
      this[offset + i] = value / mul & 0xFF
    }

    return offset + byteLength
  }

  Buffer$1.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
    value = +value
    offset = offset | 0
    byteLength = byteLength | 0
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1
      checkInt(this, value, offset, byteLength, maxBytes, 0)
    }

    var i = byteLength - 1
    var mul = 1
    this[offset + i] = value & 0xFF
    while (--i >= 0 && (mul *= 0x100)) {
      this[offset + i] = value / mul & 0xFF
    }

    return offset + byteLength
  }

  Buffer$1.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
    if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
    this[offset] = value & 0xff
    return offset + 1
  }

  function objectWriteUInt16 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffff + value + 1
    for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
      buf[offset + i] = (value & 0xff << 8 * (littleEndian ? i : 1 - i)) >>> (littleEndian ? i : 1 - i) * 8
    }
  }

  Buffer$1.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = value & 0xff
      this[offset + 1] = value >>> 8
    } else {
      objectWriteUInt16(this, value, offset, true)
    }
    return offset + 2
  }

  Buffer$1.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = value >>> 8
      this[offset + 1] = value & 0xff
    } else {
      objectWriteUInt16(this, value, offset, false)
    }
    return offset + 2
  }

  function objectWriteUInt32 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffffffff + value + 1
    for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
      buf[offset + i] = value >>> (littleEndian ? i : 3 - i) * 8 & 0xff
    }
  }

  Buffer$1.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset + 3] = value >>> 24
      this[offset + 2] = value >>> 16
      this[offset + 1] = value >>> 8
      this[offset] = value & 0xff
    } else {
      objectWriteUInt32(this, value, offset, true)
    }
    return offset + 4
  }

  Buffer$1.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = value >>> 24
      this[offset + 1] = value >>> 16
      this[offset + 2] = value >>> 8
      this[offset + 3] = value & 0xff
    } else {
      objectWriteUInt32(this, value, offset, false)
    }
    return offset + 4
  }

  Buffer$1.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1)

      checkInt(this, value, offset, byteLength, limit - 1, -limit)
    }

    var i = 0
    var mul = 1
    var sub = 0
    this[offset] = value & 0xFF
    while (++i < byteLength && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
        sub = 1
      }
      this[offset + i] = (value / mul >> 0) - sub & 0xFF
    }

    return offset + byteLength
  }

  Buffer$1.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1)

      checkInt(this, value, offset, byteLength, limit - 1, -limit)
    }

    var i = byteLength - 1
    var mul = 1
    var sub = 0
    this[offset + i] = value & 0xFF
    while (--i >= 0 && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
        sub = 1
      }
      this[offset + i] = (value / mul >> 0) - sub & 0xFF
    }

    return offset + byteLength
  }

  Buffer$1.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
    if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
    if (value < 0) value = 0xff + value + 1
    this[offset] = value & 0xff
    return offset + 1
  }

  Buffer$1.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = value & 0xff
      this[offset + 1] = value >>> 8
    } else {
      objectWriteUInt16(this, value, offset, true)
    }
    return offset + 2
  }

  Buffer$1.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = value >>> 8
      this[offset + 1] = value & 0xff
    } else {
      objectWriteUInt16(this, value, offset, false)
    }
    return offset + 2
  }

  Buffer$1.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = value & 0xff
      this[offset + 1] = value >>> 8
      this[offset + 2] = value >>> 16
      this[offset + 3] = value >>> 24
    } else {
      objectWriteUInt32(this, value, offset, true)
    }
    return offset + 4
  }

  Buffer$1.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
    value = +value
    offset = offset | 0
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
    if (value < 0) value = 0xffffffff + value + 1
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = value >>> 24
      this[offset + 1] = value >>> 16
      this[offset + 2] = value >>> 8
      this[offset + 3] = value & 0xff
    } else {
      objectWriteUInt32(this, value, offset, false)
    }
    return offset + 4
  }

  function checkIEEE754 (buf, value, offset, ext, max, min) {
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
    if (offset < 0) throw new RangeError('Index out of range')
  }

  function writeFloat (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
    }
    write(buf, value, offset, littleEndian, 23, 4)
    return offset + 4
  }

  Buffer$1.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
    return writeFloat(this, value, offset, true, noAssert)
  }

  Buffer$1.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
    return writeFloat(this, value, offset, false, noAssert)
  }

  function writeDouble (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
    }
    write(buf, value, offset, littleEndian, 52, 8)
    return offset + 8
  }

  Buffer$1.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
    return writeDouble(this, value, offset, true, noAssert)
  }

  Buffer$1.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
    return writeDouble(this, value, offset, false, noAssert)
  }

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
  Buffer$1.prototype.copy = function copy (target, targetStart, start, end) {
    if (!start) start = 0
    if (!end && end !== 0) end = this.length
    if (targetStart >= target.length) targetStart = target.length
    if (!targetStart) targetStart = 0
    if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
    if (end === start) return 0
    if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
    if (targetStart < 0) {
      throw new RangeError('targetStart out of bounds')
    }
    if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
    if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
    if (end > this.length) end = this.length
    if (target.length - targetStart < end - start) {
      end = target.length - targetStart + start
    }

    var len = end - start
    var i

    if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
      for (i = len - 1; i >= 0; --i) {
        target[i + targetStart] = this[i + start]
      }
    } else if (len < 1000 || !Buffer$1.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
      for (i = 0; i < len; ++i) {
        target[i + targetStart] = this[i + start]
      }
    } else {
      Uint8Array.prototype.set.call(target, this.subarray(start, start + len), targetStart)
    }

    return len
  }

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
  Buffer$1.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
    if (typeof val === 'string') {
      if (typeof start === 'string') {
        encoding = start
        start = 0
        end = this.length
      } else if (typeof end === 'string') {
        encoding = end
        end = this.length
      }
      if (val.length === 1) {
        var code = val.charCodeAt(0)
        if (code < 256) {
          val = code
        }
      }
      if (encoding !== undefined && typeof encoding !== 'string') {
        throw new TypeError('encoding must be a string')
      }
      if (typeof encoding === 'string' && !Buffer$1.isEncoding(encoding)) {
        throw new TypeError('Unknown encoding: ' + encoding)
      }
    } else if (typeof val === 'number') {
      val = val & 255
    }

  // Invalid ranges are not set to a default, so can range check early.
    if (start < 0 || this.length < start || this.length < end) {
      throw new RangeError('Out of range index')
    }

    if (end <= start) {
      return this
    }

    start = start >>> 0
    end = end === undefined ? this.length : end >>> 0

    if (!val) val = 0

    var i
    if (typeof val === 'number') {
      for (i = start; i < end; ++i) {
        this[i] = val
      }
    } else {
      var bytes = internalIsBuffer(val) ? val : utf8ToBytes(new Buffer$1(val, encoding).toString())
      var len = bytes.length
      for (i = 0; i < end - start; ++i) {
        this[i + start] = bytes[i % len]
      }
    }

    return this
  }

// HELPER FUNCTIONS
// ================

  var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

  function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
    str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
    if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
    while (str.length % 4 !== 0) {
      str = str + '='
    }
    return str
  }

  function stringtrim (str) {
    if (str.trim) return str.trim()
    return str.replace(/^\s+|\s+$/g, '')
  }

  function toHex (n) {
    if (n < 16) return '0' + n.toString(16)
    return n.toString(16)
  }

  function utf8ToBytes (string, units) {
    units = units || Infinity
    var codePoint
    var length = string.length
    var leadSurrogate = null
    var bytes = []

    for (var i = 0; i < length; ++i) {
      codePoint = string.charCodeAt(i)

    // is surrogate component
      if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
        if (!leadSurrogate) {
        // no lead yet
          if (codePoint > 0xDBFF) {
          // unexpected trail
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
            continue
          } else if (i + 1 === length) {
          // unpaired lead
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
            continue
          }

        // valid lead
          leadSurrogate = codePoint

          continue
        }

      // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        }

      // valid surrogate pair
        codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
      } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      }

      leadSurrogate = null

    // encode utf8
      if (codePoint < 0x80) {
        if ((units -= 1) < 0) break
        bytes.push(codePoint)
      } else if (codePoint < 0x800) {
        if ((units -= 2) < 0) break
        bytes.push(codePoint >> 0x6 | 0xC0, codePoint & 0x3F | 0x80)
      } else if (codePoint < 0x10000) {
        if ((units -= 3) < 0) break
        bytes.push(codePoint >> 0xC | 0xE0, codePoint >> 0x6 & 0x3F | 0x80, codePoint & 0x3F | 0x80)
      } else if (codePoint < 0x110000) {
        if ((units -= 4) < 0) break
        bytes.push(codePoint >> 0x12 | 0xF0, codePoint >> 0xC & 0x3F | 0x80, codePoint >> 0x6 & 0x3F | 0x80, codePoint & 0x3F | 0x80)
      } else {
        throw new Error('Invalid code point')
      }
    }

    return bytes
  }

  function asciiToBytes (str) {
    var byteArray = []
    for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
      byteArray.push(str.charCodeAt(i) & 0xFF)
    }
    return byteArray
  }

  function utf16leToBytes (str, units) {
    var c, hi, lo
    var byteArray = []
    for (var i = 0; i < str.length; ++i) {
      if ((units -= 2) < 0) break

      c = str.charCodeAt(i)
      hi = c >> 8
      lo = c % 256
      byteArray.push(lo)
      byteArray.push(hi)
    }

    return byteArray
  }

  function base64ToBytes (str) {
    return toByteArray(base64clean(str))
  }

  function blitBuffer (src, dst, offset, length) {
    for (var i = 0; i < length; ++i) {
      if (i + offset >= dst.length || i >= src.length) break
      dst[i + offset] = src[i]
    }
    return i
  }

  function isnan (val) {
    return val !== val // eslint-disable-line no-self-compare
  }

// the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
  function isBuffer$1 (obj) {
    return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
  }

  function isFastBuffer (obj) {
    return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
  }

// For Node v0.10 support. Remove this eventually.
  function isSlowBuffer (obj) {
    return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
  }

  function BufferList$1 () {
    this.head = null
    this.tail = null
    this.length = 0
  }

  BufferList$1.prototype.push = function (v) {
    var entry = { data: v, next: null }
    if (this.length > 0) this.tail.next = entry; else this.head = entry
    this.tail = entry
    ++this.length
  }

  BufferList$1.prototype.unshift = function (v) {
    var entry = { data: v, next: this.head }
    if (this.length === 0) this.tail = entry
    this.head = entry
    ++this.length
  }

  BufferList$1.prototype.shift = function () {
    if (this.length === 0) return
    var ret = this.head.data
    if (this.length === 1) this.head = this.tail = null; else this.head = this.head.next
    --this.length
    return ret
  }

  BufferList$1.prototype.clear = function () {
    this.head = this.tail = null
    this.length = 0
  }

  BufferList$1.prototype.join = function (s) {
    if (this.length === 0) return ''
    var p = this.head
    var ret = '' + p.data
    while (p = p.next) {
      ret += s + p.data
    } return ret
  }

  BufferList$1.prototype.concat = function (n) {
    if (this.length === 0) return Buffer$1.alloc(0)
    if (this.length === 1) return this.head.data
    var ret = Buffer$1.allocUnsafe(n >>> 0)
    var p = this.head
    var i = 0
    while (p) {
      p.data.copy(ret, i)
      i += p.data.length
      p = p.next
    }
    return ret
  }

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

  var isBufferEncoding = Buffer$1.isEncoding || function (encoding) {
    switch (encoding && encoding.toLowerCase()) {
      case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
        return true
      default:
        return false
    }
  }

  function assertEncoding (encoding) {
    if (encoding && !isBufferEncoding(encoding)) {
      throw new Error('Unknown encoding: ' + encoding)
    }
  }

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
  function StringDecoder (encoding) {
    this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '')
    assertEncoding(encoding)
    switch (this.encoding) {
      case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
        this.surrogateSize = 3
        break
      case 'ucs2':
      case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
        this.surrogateSize = 2
        this.detectIncompleteChar = utf16DetectIncompleteChar
        break
      case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
        this.surrogateSize = 3
        this.detectIncompleteChar = base64DetectIncompleteChar
        break
      default:
        this.write = passThroughWrite
        return
    }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
    this.charBuffer = new Buffer$1(6)
  // Number of bytes received for the current incomplete multi-byte character.
    this.charReceived = 0
  // Number of bytes expected for the current incomplete multi-byte character.
    this.charLength = 0
  }

// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
  StringDecoder.prototype.write = function (buffer) {
    var charStr = ''
  // if our last write ended with an incomplete multibyte character
    while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
      var available = buffer.length >= this.charLength - this.charReceived ? this.charLength - this.charReceived : buffer.length

    // add the new bytes to the char buffer
      buffer.copy(this.charBuffer, this.charReceived, 0, available)
      this.charReceived += available

      if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
        return ''
      }

    // remove bytes belonging to the current character from the buffer
      buffer = buffer.slice(available, buffer.length)

    // get the character that was split
      charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding)

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
      var charCode = charStr.charCodeAt(charStr.length - 1)
      if (charCode >= 0xD800 && charCode <= 0xDBFF) {
        this.charLength += this.surrogateSize
        charStr = ''
        continue
      }
      this.charReceived = this.charLength = 0

    // if there are no more bytes in this buffer, just emit our char
      if (buffer.length === 0) {
        return charStr
      }
      break
    }

  // determine and set charLength / charReceived
    this.detectIncompleteChar(buffer)

    var end = buffer.length
    if (this.charLength) {
    // buffer the incomplete character bytes we got
      buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end)
      end -= this.charReceived
    }

    charStr += buffer.toString(this.encoding, 0, end)

    var end = charStr.length - 1
    var charCode = charStr.charCodeAt(end)
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      var size = this.surrogateSize
      this.charLength += size
      this.charReceived += size
      this.charBuffer.copy(this.charBuffer, size, 0, size)
      buffer.copy(this.charBuffer, 0, 0, size)
      return charStr.substring(0, end)
    }

  // or just emit the charStr
    return charStr
  }

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
  StringDecoder.prototype.detectIncompleteChar = function (buffer) {
  // determine how many bytes we have to check at the end of this buffer
    var i = buffer.length >= 3 ? 3 : buffer.length

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
    for (; i > 0; i--) {
      var c = buffer[buffer.length - i]

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
      if (i == 1 && c >> 5 == 0x06) {
        this.charLength = 2
        break
      }

    // 1110XXXX
      if (i <= 2 && c >> 4 == 0x0E) {
        this.charLength = 3
        break
      }

    // 11110XXX
      if (i <= 3 && c >> 3 == 0x1E) {
        this.charLength = 4
        break
      }
    }
    this.charReceived = i
  }

  StringDecoder.prototype.end = function (buffer) {
    var res = ''
    if (buffer && buffer.length) res = this.write(buffer)

    if (this.charReceived) {
      var cr = this.charReceived
      var buf = this.charBuffer
      var enc = this.encoding
      res += buf.slice(0, cr).toString(enc)
    }

    return res
  }

  function passThroughWrite (buffer) {
    return buffer.toString(this.encoding)
  }

  function utf16DetectIncompleteChar (buffer) {
    this.charReceived = buffer.length % 2
    this.charLength = this.charReceived ? 2 : 0
  }

  function base64DetectIncompleteChar (buffer) {
    this.charReceived = buffer.length % 3
    this.charLength = this.charReceived ? 3 : 0
  }

  Readable$1.ReadableState = ReadableState
  var debug = debuglog('stream')
  inherits$1(Readable$1, EventEmitter)

  function prependListener (emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
    if (typeof emitter.prependListener === 'function') {
      return emitter.prependListener(event, fn)
    } else {
    // This is a hack to make sure that our error handler is attached before any
    // userland ones.  NEVER DO THIS. This is here only because this code needs
    // to continue to work with older versions of Node.js that do not include
    // the prependListener() method. The goal is to eventually remove this hack.
      if (!emitter._events || !emitter._events[event]) emitter.on(event, fn); else if (Array.isArray(emitter._events[event])) emitter._events[event].unshift(fn); else emitter._events[event] = [fn, emitter._events[event]]
    }
  }
  function listenerCount$1 (emitter, type) {
    return emitter.listeners(type).length
  }
  function ReadableState (options, stream) {
    options = options || {}

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
    this.objectMode = !!options.objectMode

    if (stream instanceof Duplex$1) this.objectMode = this.objectMode || !!options.readableObjectMode

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
    var hwm = options.highWaterMark
    var defaultHwm = this.objectMode ? 16 : 16 * 1024
    this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm

  // cast to ints.
    this.highWaterMark = ~~this.highWaterMark

  // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()
    this.buffer = new BufferList$1()
    this.length = 0
    this.pipes = null
    this.pipesCount = 0
    this.flowing = null
    this.ended = false
    this.endEmitted = false
    this.reading = false

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
    this.sync = true

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
    this.needReadable = false
    this.emittedReadable = false
    this.readableListening = false
    this.resumeScheduled = false

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
    this.defaultEncoding = options.defaultEncoding || 'utf8'

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
    this.ranOut = false

  // the number of writers that are awaiting a drain event in .pipe()s
    this.awaitDrain = 0

  // if true, a maybeReadMore has been scheduled
    this.readingMore = false

    this.decoder = null
    this.encoding = null
    if (options.encoding) {
      this.decoder = new StringDecoder(options.encoding)
      this.encoding = options.encoding
    }
  }
  function Readable$1 (options) {
    if (!(this instanceof Readable$1)) return new Readable$1(options)

    this._readableState = new ReadableState(options, this)

  // legacy
    this.readable = true

    if (options && typeof options.read === 'function') this._read = options.read

    EventEmitter.call(this)
  }

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
  Readable$1.prototype.push = function (chunk, encoding) {
    var state = this._readableState

    if (!state.objectMode && typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding
      if (encoding !== state.encoding) {
        chunk = Buffer.from(chunk, encoding)
        encoding = ''
      }
    }

    return readableAddChunk(this, state, chunk, encoding, false)
  }

// Unshift should *always* be something directly out of read()
  Readable$1.prototype.unshift = function (chunk) {
    var state = this._readableState
    return readableAddChunk(this, state, chunk, '', true)
  }

  Readable$1.prototype.isPaused = function () {
    return this._readableState.flowing === false
  }

  function readableAddChunk (stream, state, chunk, encoding, addToFront) {
    var er = chunkInvalid(state, chunk)
    if (er) {
      stream.emit('error', er)
    } else if (chunk === null) {
      state.reading = false
      onEofChunk(stream, state)
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (state.ended && !addToFront) {
        var e = new Error('stream.push() after EOF')
        stream.emit('error', e)
      } else if (state.endEmitted && addToFront) {
        var _e = new Error('stream.unshift() after end event')
        stream.emit('error', _e)
      } else {
        var skipAdd
        if (state.decoder && !addToFront && !encoding) {
          chunk = state.decoder.write(chunk)
          skipAdd = !state.objectMode && chunk.length === 0
        }

        if (!addToFront) state.reading = false

      // Don't add to the buffer if we've decoded to an empty string chunk and
      // we're not in object mode
        if (!skipAdd) {
        // if we want the data now, just emit it.
          if (state.flowing && state.length === 0 && !state.sync) {
            stream.emit('data', chunk)
            stream.read(0)
          } else {
          // update the buffer info.
            state.length += state.objectMode ? 1 : chunk.length
            if (addToFront) state.buffer.unshift(chunk); else state.buffer.push(chunk)

            if (state.needReadable) emitReadable(stream)
          }
        }

        maybeReadMore(stream, state)
      }
    } else if (!addToFront) {
      state.reading = false
    }

    return needMoreData(state)
  }

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
  function needMoreData (state) {
    return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0)
  }

// backwards compatibility.
  Readable$1.prototype.setEncoding = function (enc) {
    this._readableState.decoder = new StringDecoder(enc)
    this._readableState.encoding = enc
    return this
  }

// Don't raise the hwm > 8MB
  var MAX_HWM = 0x800000
  function computeNewHighWaterMark (n) {
    if (n >= MAX_HWM) {
      n = MAX_HWM
    } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
      n--
      n |= n >>> 1
      n |= n >>> 2
      n |= n >>> 4
      n |= n >>> 8
      n |= n >>> 16
      n++
    }
    return n
  }

// This function is designed to be inlinable, so please take care when making
// changes to the function body.
  function howMuchToRead (n, state) {
    if (n <= 0 || state.length === 0 && state.ended) return 0
    if (state.objectMode) return 1
    if (n !== n) {
    // Only flow one buffer at a time
      if (state.flowing && state.length) return state.buffer.head.data.length; else return state.length
    }
  // If we're asking for more than the current hwm, then raise the hwm.
    if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n)
    if (n <= state.length) return n
  // Don't have enough
    if (!state.ended) {
      state.needReadable = true
      return 0
    }
    return state.length
  }

// you can override either this method, or the async _read(n) below.
  Readable$1.prototype.read = function (n) {
    debug('read', n)
    n = parseInt(n, 10)
    var state = this._readableState
    var nOrig = n

    if (n !== 0) state.emittedReadable = false

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
    if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
      debug('read: emitReadable', state.length, state.ended)
      if (state.length === 0 && state.ended) endReadable(this); else emitReadable(this)
      return null
    }

    n = howMuchToRead(n, state)

  // if we've ended, and we're now clear, then finish it up.
    if (n === 0 && state.ended) {
      if (state.length === 0) endReadable(this)
      return null
    }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
    var doRead = state.needReadable
    debug('need readable', doRead)

  // if we currently have less than the highWaterMark, then also read some
    if (state.length === 0 || state.length - n < state.highWaterMark) {
      doRead = true
      debug('length less than watermark', doRead)
    }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
    if (state.ended || state.reading) {
      doRead = false
      debug('reading or ended', doRead)
    } else if (doRead) {
      debug('do read')
      state.reading = true
      state.sync = true
    // if the length is currently zero, then we *need* a readable event.
      if (state.length === 0) state.needReadable = true
    // call internal read method
      this._read(state.highWaterMark)
      state.sync = false
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
      if (!state.reading) n = howMuchToRead(nOrig, state)
    }

    var ret
    if (n > 0) ret = fromList(n, state); else ret = null

    if (ret === null) {
      state.needReadable = true
      n = 0
    } else {
      state.length -= n
    }

    if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
      if (!state.ended) state.needReadable = true

    // If we tried to read() past the EOF, then emit end on the next tick.
      if (nOrig !== n && state.ended) endReadable(this)
    }

    if (ret !== null) this.emit('data', ret)

    return ret
  }

  function chunkInvalid (state, chunk) {
    var er = null
    if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string' && chunk !== null && chunk !== undefined && !state.objectMode) {
      er = new TypeError('Invalid non-string/buffer chunk')
    }
    return er
  }

  function onEofChunk (stream, state) {
    if (state.ended) return
    if (state.decoder) {
      var chunk = state.decoder.end()
      if (chunk && chunk.length) {
        state.buffer.push(chunk)
        state.length += state.objectMode ? 1 : chunk.length
      }
    }
    state.ended = true

  // emit 'readable' now to make sure it gets picked up.
    emitReadable(stream)
  }

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
  function emitReadable (stream) {
    var state = stream._readableState
    state.needReadable = false
    if (!state.emittedReadable) {
      debug('emitReadable', state.flowing)
      state.emittedReadable = true
      if (state.sync) nextTick(emitReadable_, stream); else emitReadable_(stream)
    }
  }

  function emitReadable_ (stream) {
    debug('emit readable')
    stream.emit('readable')
    flow(stream)
  }

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
  function maybeReadMore (stream, state) {
    if (!state.readingMore) {
      state.readingMore = true
      nextTick(maybeReadMore_, stream, state)
    }
  }

  function maybeReadMore_ (stream, state) {
    var len = state.length
    while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
      debug('maybeReadMore read 0')
      stream.read(0)
      if (len === state.length)
      // didn't get any data, stop spinning.
      { break } else len = state.length
    }
    state.readingMore = false
  }

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
  Readable$1.prototype._read = function (n) {
    this.emit('error', new Error('not implemented'))
  }

  Readable$1.prototype.pipe = function (dest, pipeOpts) {
    var src = this
    var state = this._readableState

    switch (state.pipesCount) {
      case 0:
        state.pipes = dest
        break
      case 1:
        state.pipes = [state.pipes, dest]
        break
      default:
        state.pipes.push(dest)
        break
    }
    state.pipesCount += 1
    debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts)

    var doEnd = !pipeOpts || pipeOpts.end !== false

    var endFn = doEnd ? onend : cleanup
    if (state.endEmitted) nextTick(endFn); else src.once('end', endFn)

    dest.on('unpipe', onunpipe)
    function onunpipe (readable) {
      debug('onunpipe')
      if (readable === src) {
        cleanup()
      }
    }

    function onend () {
      debug('onend')
      dest.end()
    }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
    var ondrain = pipeOnDrain(src)
    dest.on('drain', ondrain)

    var cleanedUp = false
    function cleanup () {
      debug('cleanup')
    // cleanup event handlers once the pipe is broken
      dest.removeListener('close', onclose)
      dest.removeListener('finish', onfinish)
      dest.removeListener('drain', ondrain)
      dest.removeListener('error', onerror)
      dest.removeListener('unpipe', onunpipe)
      src.removeListener('end', onend)
      src.removeListener('end', cleanup)
      src.removeListener('data', ondata)

      cleanedUp = true

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
      if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain()
    }

  // If the user pushes more data while we're writing to dest then we'll end up
  // in ondata again. However, we only want to increase awaitDrain once because
  // dest will only emit one 'drain' event for the multiple writes.
  // => Introduce a guard on increasing awaitDrain.
    var increasedAwaitDrain = false
    src.on('data', ondata)
    function ondata (chunk) {
      debug('ondata')
      increasedAwaitDrain = false
      var ret = dest.write(chunk)
      if (ret === false && !increasedAwaitDrain) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
        if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
          debug('false write response, pause', src._readableState.awaitDrain)
          src._readableState.awaitDrain++
          increasedAwaitDrain = true
        }
        src.pause()
      }
    }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
    function onerror (er) {
      debug('onerror', er)
      unpipe()
      dest.removeListener('error', onerror)
      if (listenerCount$1(dest, 'error') === 0) dest.emit('error', er)
    }

  // Make sure our error handler is attached before userland ones.
    prependListener(dest, 'error', onerror)

  // Both close and finish should trigger unpipe, but only once.
    function onclose () {
      dest.removeListener('finish', onfinish)
      unpipe()
    }
    dest.once('close', onclose)
    function onfinish () {
      debug('onfinish')
      dest.removeListener('close', onclose)
      unpipe()
    }
    dest.once('finish', onfinish)

    function unpipe () {
      debug('unpipe')
      src.unpipe(dest)
    }

  // tell the dest that it's being piped to
    dest.emit('pipe', src)

  // start the flow if it hasn't been started already.
    if (!state.flowing) {
      debug('pipe resume')
      src.resume()
    }

    return dest
  }

  function pipeOnDrain (src) {
    return function () {
      var state = src._readableState
      debug('pipeOnDrain', state.awaitDrain)
      if (state.awaitDrain) state.awaitDrain--
      if (state.awaitDrain === 0 && src.listeners('data').length) {
        state.flowing = true
        flow(src)
      }
    }
  }

  Readable$1.prototype.unpipe = function (dest) {
    var state = this._readableState

  // if we're not piping anywhere, then do nothing.
    if (state.pipesCount === 0) return this

  // just one destination.  most common case.
    if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
      if (dest && dest !== state.pipes) return this

      if (!dest) dest = state.pipes

    // got a match.
      state.pipes = null
      state.pipesCount = 0
      state.flowing = false
      if (dest) dest.emit('unpipe', this)
      return this
    }

  // slow case. multiple pipe destinations.

    if (!dest) {
    // remove all.
      var dests = state.pipes
      var len = state.pipesCount
      state.pipes = null
      state.pipesCount = 0
      state.flowing = false

      for (var _i = 0; _i < len; _i++) {
        dests[_i].emit('unpipe', this)
      } return this
    }

  // try to find the right one.
    var i = indexOf(state.pipes, dest)
    if (i === -1) return this

    state.pipes.splice(i, 1)
    state.pipesCount -= 1
    if (state.pipesCount === 1) state.pipes = state.pipes[0]

    dest.emit('unpipe', this)

    return this
  }

// set up data events if they are asked for
// Ensure readable listeners eventually get something
  Readable$1.prototype.on = function (ev, fn) {
    var res = EventEmitter.prototype.on.call(this, ev, fn)

    if (ev === 'data') {
    // Start flowing on next tick if stream isn't explicitly paused
      if (this._readableState.flowing !== false) this.resume()
    } else if (ev === 'readable') {
      var state = this._readableState
      if (!state.endEmitted && !state.readableListening) {
        state.readableListening = state.needReadable = true
        state.emittedReadable = false
        if (!state.reading) {
          nextTick(nReadingNextTick, this)
        } else if (state.length) {
          emitReadable(this, state)
        }
      }
    }

    return res
  }
  Readable$1.prototype.addListener = Readable$1.prototype.on

  function nReadingNextTick (self) {
    debug('readable nexttick read 0')
    self.read(0)
  }

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
  Readable$1.prototype.resume = function () {
    var state = this._readableState
    if (!state.flowing) {
      debug('resume')
      state.flowing = true
      resume(this, state)
    }
    return this
  }

  function resume (stream, state) {
    if (!state.resumeScheduled) {
      state.resumeScheduled = true
      nextTick(resume_, stream, state)
    }
  }

  function resume_ (stream, state) {
    if (!state.reading) {
      debug('resume read 0')
      stream.read(0)
    }

    state.resumeScheduled = false
    state.awaitDrain = 0
    stream.emit('resume')
    flow(stream)
    if (state.flowing && !state.reading) stream.read(0)
  }

  Readable$1.prototype.pause = function () {
    debug('call pause flowing=%j', this._readableState.flowing)
    if (this._readableState.flowing !== false) {
      debug('pause')
      this._readableState.flowing = false
      this.emit('pause')
    }
    return this
  }

  function flow (stream) {
    var state = stream._readableState
    debug('flow', state.flowing)
    while (state.flowing && stream.read() !== null) {}
  }

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
  Readable$1.prototype.wrap = function (stream) {
    var state = this._readableState
    var paused = false

    var self = this
    stream.on('end', function () {
      debug('wrapped end')
      if (state.decoder && !state.ended) {
        var chunk = state.decoder.end()
        if (chunk && chunk.length) self.push(chunk)
      }

      self.push(null)
    })

    stream.on('data', function (chunk) {
      debug('wrapped data')
      if (state.decoder) chunk = state.decoder.write(chunk)

    // don't skip over falsy values in objectMode
      if (state.objectMode && (chunk === null || chunk === undefined)) return; else if (!state.objectMode && (!chunk || !chunk.length)) return

      var ret = self.push(chunk)
      if (!ret) {
        paused = true
        stream.pause()
      }
    })

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
    for (var i in stream) {
      if (this[i] === undefined && typeof stream[i] === 'function') {
        this[i] = (function (method) {
          return function () {
            return stream[method].apply(stream, arguments)
          }
        }(i))
      }
    }

  // proxy certain important events.
    var events = ['error', 'close', 'destroy', 'pause', 'resume']
    forEach(events, function (ev) {
      stream.on(ev, self.emit.bind(self, ev))
    })

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
    self._read = function (n) {
      debug('wrapped _read', n)
      if (paused) {
        paused = false
        stream.resume()
      }
    }

    return self
  }

// exposed for testing purposes only.
  Readable$1._fromList = fromList

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
  function fromList (n, state) {
  // nothing buffered
    if (state.length === 0) return null

    var ret
    if (state.objectMode) ret = state.buffer.shift(); else if (!n || n >= state.length) {
    // read it all, truncate the list
      if (state.decoder) ret = state.buffer.join(''); else if (state.buffer.length === 1) ret = state.buffer.head.data; else ret = state.buffer.concat(state.length)
      state.buffer.clear()
    } else {
    // read part of list
      ret = fromListPartial(n, state.buffer, state.decoder)
    }

    return ret
  }

// Extracts only enough buffered data to satisfy the amount requested.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
  function fromListPartial (n, list, hasStrings) {
    var ret
    if (n < list.head.data.length) {
    // slice is the same for buffers and strings
      ret = list.head.data.slice(0, n)
      list.head.data = list.head.data.slice(n)
    } else if (n === list.head.data.length) {
    // first chunk is a perfect match
      ret = list.shift()
    } else {
    // result spans more than one buffer
      ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list)
    }
    return ret
  }

// Copies a specified amount of characters from the list of buffered data
// chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
  function copyFromBufferString (n, list) {
    var p = list.head
    var c = 1
    var ret = p.data
    n -= ret.length
    while (p = p.next) {
      var str = p.data
      var nb = n > str.length ? str.length : n
      if (nb === str.length) ret += str; else ret += str.slice(0, n)
      n -= nb
      if (n === 0) {
        if (nb === str.length) {
          ++c
          if (p.next) list.head = p.next; else list.head = list.tail = null
        } else {
          list.head = p
          p.data = str.slice(nb)
        }
        break
      }
      ++c
    }
    list.length -= c
    return ret
  }

// Copies a specified amount of bytes from the list of buffered data chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
  function copyFromBuffer (n, list) {
    var ret = Buffer.allocUnsafe(n)
    var p = list.head
    var c = 1
    p.data.copy(ret)
    n -= p.data.length
    while (p = p.next) {
      var buf = p.data
      var nb = n > buf.length ? buf.length : n
      buf.copy(ret, ret.length - n, 0, nb)
      n -= nb
      if (n === 0) {
        if (nb === buf.length) {
          ++c
          if (p.next) list.head = p.next; else list.head = list.tail = null
        } else {
          list.head = p
          p.data = buf.slice(nb)
        }
        break
      }
      ++c
    }
    list.length -= c
    return ret
  }

  function endReadable (stream) {
    var state = stream._readableState

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
    if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream')

    if (!state.endEmitted) {
      state.ended = true
      nextTick(endReadableNT, state, stream)
    }
  }

  function endReadableNT (state, stream) {
  // Check that we didn't get one last unshift.
    if (!state.endEmitted && state.length === 0) {
      state.endEmitted = true
      stream.readable = false
      stream.emit('end')
    }
  }

  function forEach (xs, f) {
    for (var i = 0, l = xs.length; i < l; i++) {
      f(xs[i], i)
    }
  }

  function indexOf (xs, x) {
    for (var i = 0, l = xs.length; i < l; i++) {
      if (xs[i] === x) return i
    }
    return -1
  }

// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.

  Writable$1.WritableState = WritableState
  inherits$1(Writable$1, EventEmitter)

  function nop () {}

  function WriteReq (chunk, encoding, cb) {
    this.chunk = chunk
    this.encoding = encoding
    this.callback = cb
    this.next = null
  }

  function WritableState (options, stream) {
    Object.defineProperty(this, 'buffer', {
      get: deprecate(function () {
        return this.getBuffer()
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.')
    })
    options = options || {}

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
    this.objectMode = !!options.objectMode

    if (stream instanceof Duplex$1) this.objectMode = this.objectMode || !!options.writableObjectMode

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
    var hwm = options.highWaterMark
    var defaultHwm = this.objectMode ? 16 : 16 * 1024
    this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm

  // cast to ints.
    this.highWaterMark = ~~this.highWaterMark

    this.needDrain = false
  // at the start of calling end()
    this.ending = false
  // when end() has been called, and returned
    this.ended = false
  // when 'finish' is emitted
    this.finished = false

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
    var noDecode = options.decodeStrings === false
    this.decodeStrings = !noDecode

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
    this.defaultEncoding = options.defaultEncoding || 'utf8'

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
    this.length = 0

  // a flag to see when we're in the middle of a write.
    this.writing = false

  // when true all writes will be buffered until .uncork() call
    this.corked = 0

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
    this.sync = true

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
    this.bufferProcessing = false

  // the callback that's passed to _write(chunk,cb)
    this.onwrite = function (er) {
      onwrite(stream, er)
    }

  // the callback that the user supplies to write(chunk,encoding,cb)
    this.writecb = null

  // the amount that is being written when _write is called.
    this.writelen = 0

    this.bufferedRequest = null
    this.lastBufferedRequest = null

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
    this.pendingcb = 0

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
    this.prefinished = false

  // True if the error was already emitted and should not be thrown again
    this.errorEmitted = false

  // count buffered requests
    this.bufferedRequestCount = 0

  // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two
    this.corkedRequestsFree = new CorkedRequest(this)
  }

  WritableState.prototype.getBuffer = function writableStateGetBuffer () {
    var current = this.bufferedRequest
    var out = []
    while (current) {
      out.push(current)
      current = current.next
    }
    return out
  }

  function Writable$1 (options) {
  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
    if (!(this instanceof Writable$1) && !(this instanceof Duplex$1)) return new Writable$1(options)

    this._writableState = new WritableState(options, this)

  // legacy.
    this.writable = true

    if (options) {
      if (typeof options.write === 'function') this._write = options.write

      if (typeof options.writev === 'function') this._writev = options.writev
    }

    EventEmitter.call(this)
  }

// Otherwise people can pipe Writable streams, which is just wrong.
  Writable$1.prototype.pipe = function () {
    this.emit('error', new Error('Cannot pipe, not readable'))
  }

  function writeAfterEnd (stream, cb) {
    var er = new Error('write after end')
  // TODO: defer error events consistently everywhere, not just the cb
    stream.emit('error', er)
    nextTick(cb, er)
  }

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
  function validChunk (stream, state, chunk, cb) {
    var valid = true
    var er = false
  // Always throw error if a null is written
  // if we are not in object mode then throw
  // if it is not a buffer, string, or undefined.
    if (chunk === null) {
      er = new TypeError('May not write null values to stream')
    } else if (!Buffer$1.isBuffer(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
      er = new TypeError('Invalid non-string/buffer chunk')
    }
    if (er) {
      stream.emit('error', er)
      nextTick(cb, er)
      valid = false
    }
    return valid
  }

  Writable$1.prototype.write = function (chunk, encoding, cb) {
    var state = this._writableState
    var ret = false

    if (typeof encoding === 'function') {
      cb = encoding
      encoding = null
    }

    if (Buffer$1.isBuffer(chunk)) encoding = 'buffer'; else if (!encoding) encoding = state.defaultEncoding

    if (typeof cb !== 'function') cb = nop

    if (state.ended) writeAfterEnd(this, cb); else if (validChunk(this, state, chunk, cb)) {
      state.pendingcb++
      ret = writeOrBuffer(this, state, chunk, encoding, cb)
    }

    return ret
  }

  Writable$1.prototype.cork = function () {
    var state = this._writableState

    state.corked++
  }

  Writable$1.prototype.uncork = function () {
    var state = this._writableState

    if (state.corked) {
      state.corked--

      if (!state.writing && !state.corked && !state.finished && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state)
    }
  }

  Writable$1.prototype.setDefaultEncoding = function setDefaultEncoding (encoding) {
  // node::ParseEncoding() requires lower case.
    if (typeof encoding === 'string') encoding = encoding.toLowerCase()
    if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding)
    this._writableState.defaultEncoding = encoding
    return this
  }

  function decodeChunk (state, chunk, encoding) {
    if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
      chunk = Buffer$1.from(chunk, encoding)
    }
    return chunk
  }

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
  function writeOrBuffer (stream, state, chunk, encoding, cb) {
    chunk = decodeChunk(state, chunk, encoding)

    if (Buffer$1.isBuffer(chunk)) encoding = 'buffer'
    var len = state.objectMode ? 1 : chunk.length

    state.length += len

    var ret = state.length < state.highWaterMark
  // we must ensure that previous needDrain will not be reset to false.
    if (!ret) state.needDrain = true

    if (state.writing || state.corked) {
      var last = state.lastBufferedRequest
      state.lastBufferedRequest = new WriteReq(chunk, encoding, cb)
      if (last) {
        last.next = state.lastBufferedRequest
      } else {
        state.bufferedRequest = state.lastBufferedRequest
      }
      state.bufferedRequestCount += 1
    } else {
      doWrite(stream, state, false, len, chunk, encoding, cb)
    }

    return ret
  }

  function doWrite (stream, state, writev, len, chunk, encoding, cb) {
    state.writelen = len
    state.writecb = cb
    state.writing = true
    state.sync = true
    if (writev) stream._writev(chunk, state.onwrite); else stream._write(chunk, encoding, state.onwrite)
    state.sync = false
  }

  function onwriteError (stream, state, sync, er, cb) {
    --state.pendingcb
    if (sync) nextTick(cb, er); else cb(er)

    stream._writableState.errorEmitted = true
    stream.emit('error', er)
  }

  function onwriteStateUpdate (state) {
    state.writing = false
    state.writecb = null
    state.length -= state.writelen
    state.writelen = 0
  }

  function onwrite (stream, er) {
    var state = stream._writableState
    var sync = state.sync
    var cb = state.writecb

    onwriteStateUpdate(state)

    if (er) onwriteError(stream, state, sync, er, cb); else {
    // Check if we're actually ready to finish, but don't emit yet
      var finished = needFinish(state)

      if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
        clearBuffer(stream, state)
      }

      if (sync) {
      /* <replacement> */
        nextTick(afterWrite, stream, state, finished, cb)
      /* </replacement> */
      } else {
        afterWrite(stream, state, finished, cb)
      }
    }
  }

  function afterWrite (stream, state, finished, cb) {
    if (!finished) onwriteDrain(stream, state)
    state.pendingcb--
    cb()
    finishMaybe(stream, state)
  }

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
  function onwriteDrain (stream, state) {
    if (state.length === 0 && state.needDrain) {
      state.needDrain = false
      stream.emit('drain')
    }
  }

// if there's something in the buffer waiting, then process it
  function clearBuffer (stream, state) {
    state.bufferProcessing = true
    var entry = state.bufferedRequest

    if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
      var l = state.bufferedRequestCount
      var buffer = new Array(l)
      var holder = state.corkedRequestsFree
      holder.entry = entry

      var count = 0
      while (entry) {
        buffer[count] = entry
        entry = entry.next
        count += 1
      }

      doWrite(stream, state, true, state.length, buffer, '', holder.finish)

    // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite
      state.pendingcb++
      state.lastBufferedRequest = null
      if (holder.next) {
        state.corkedRequestsFree = holder.next
        holder.next = null
      } else {
        state.corkedRequestsFree = new CorkedRequest(state)
      }
    } else {
    // Slow case, write chunks one-by-one
      while (entry) {
        var chunk = entry.chunk
        var encoding = entry.encoding
        var cb = entry.callback
        var len = state.objectMode ? 1 : chunk.length

        doWrite(stream, state, false, len, chunk, encoding, cb)
        entry = entry.next
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
        if (state.writing) {
          break
        }
      }

      if (entry === null) state.lastBufferedRequest = null
    }

    state.bufferedRequestCount = 0
    state.bufferedRequest = entry
    state.bufferProcessing = false
  }

  Writable$1.prototype._write = function (chunk, encoding, cb) {
    cb(new Error('not implemented'))
  }

  Writable$1.prototype._writev = null

  Writable$1.prototype.end = function (chunk, encoding, cb) {
    var state = this._writableState

    if (typeof chunk === 'function') {
      cb = chunk
      chunk = null
      encoding = null
    } else if (typeof encoding === 'function') {
      cb = encoding
      encoding = null
    }

    if (chunk !== null && chunk !== undefined) this.write(chunk, encoding)

  // .end() fully uncorks
    if (state.corked) {
      state.corked = 1
      this.uncork()
    }

  // ignore unnecessary end() calls.
    if (!state.ending && !state.finished) endWritable(this, state, cb)
  }

  function needFinish (state) {
    return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing
  }

  function prefinish (stream, state) {
    if (!state.prefinished) {
      state.prefinished = true
      stream.emit('prefinish')
    }
  }

  function finishMaybe (stream, state) {
    var need = needFinish(state)
    if (need) {
      if (state.pendingcb === 0) {
        prefinish(stream, state)
        state.finished = true
        stream.emit('finish')
      } else {
        prefinish(stream, state)
      }
    }
    return need
  }

  function endWritable (stream, state, cb) {
    state.ending = true
    finishMaybe(stream, state)
    if (cb) {
      if (state.finished) nextTick(cb); else stream.once('finish', cb)
    }
    state.ended = true
    stream.writable = false
  }

// It seems a linked list but it is not
// there will be only 2 of these for each stream
  function CorkedRequest (state) {
    var _this = this

    this.next = null
    this.entry = null

    this.finish = function (err) {
      var entry = _this.entry
      _this.entry = null
      while (entry) {
        var cb = entry.callback
        state.pendingcb--
        cb(err)
        entry = entry.next
      }
      if (state.corkedRequestsFree) {
        state.corkedRequestsFree.next = _this
      } else {
        state.corkedRequestsFree = _this
      }
    }
  }

  inherits$1(Duplex$1, Readable$1)

  var keys = Object.keys(Writable$1.prototype)
  for (var v = 0; v < keys.length; v++) {
    var method$2 = keys[v]
    if (!Duplex$1.prototype[method$2]) Duplex$1.prototype[method$2] = Writable$1.prototype[method$2]
  }
  function Duplex$1 (options) {
    if (!(this instanceof Duplex$1)) return new Duplex$1(options)

    Readable$1.call(this, options)
    Writable$1.call(this, options)

    if (options && options.readable === false) this.readable = false

    if (options && options.writable === false) this.writable = false

    this.allowHalfOpen = true
    if (options && options.allowHalfOpen === false) this.allowHalfOpen = false

    this.once('end', onend)
  }

// the no-half-open enforcer
  function onend () {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
    if (this.allowHalfOpen || this._writableState.ended) return

  // no more data can be written.
  // But allow more writes to happen in this tick.
    nextTick(onEndNT, this)
  }

  function onEndNT (self) {
    self.end()
  }

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

  inherits$1(Transform$1, Duplex$1)

  function TransformState (stream) {
    this.afterTransform = function (er, data) {
      return afterTransform(stream, er, data)
    }

    this.needTransform = false
    this.transforming = false
    this.writecb = null
    this.writechunk = null
    this.writeencoding = null
  }

  function afterTransform (stream, er, data) {
    var ts = stream._transformState
    ts.transforming = false

    var cb = ts.writecb

    if (!cb) return stream.emit('error', new Error('no writecb in Transform class'))

    ts.writechunk = null
    ts.writecb = null

    if (data !== null && data !== undefined) stream.push(data)

    cb(er)

    var rs = stream._readableState
    rs.reading = false
    if (rs.needReadable || rs.length < rs.highWaterMark) {
      stream._read(rs.highWaterMark)
    }
  }
  function Transform$1 (options) {
    if (!(this instanceof Transform$1)) return new Transform$1(options)

    Duplex$1.call(this, options)

    this._transformState = new TransformState(this)

  // when the writable side finishes, then flush out anything remaining.
    var stream = this

  // start out asking for a readable event once data is transformed.
    this._readableState.needReadable = true

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
    this._readableState.sync = false

    if (options) {
      if (typeof options.transform === 'function') this._transform = options.transform

      if (typeof options.flush === 'function') this._flush = options.flush
    }

    this.once('prefinish', function () {
      if (typeof this._flush === 'function') {
        this._flush(function (er) {
          done(stream, er)
        })
      } else done(stream)
    })
  }

  Transform$1.prototype.push = function (chunk, encoding) {
    this._transformState.needTransform = false
    return Duplex$1.prototype.push.call(this, chunk, encoding)
  }

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
  Transform$1.prototype._transform = function (chunk, encoding, cb) {
    throw new Error('Not implemented')
  }

  Transform$1.prototype._write = function (chunk, encoding, cb) {
    var ts = this._transformState
    ts.writecb = cb
    ts.writechunk = chunk
    ts.writeencoding = encoding
    if (!ts.transforming) {
      var rs = this._readableState
      if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark)
    }
  }

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
  Transform$1.prototype._read = function (n) {
    var ts = this._transformState

    if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
      ts.transforming = true
      this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform)
    } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
      ts.needTransform = true
    }
  }

  function done (stream, er) {
    if (er) return stream.emit('error', er)

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
    var ws = stream._writableState
    var ts = stream._transformState

    if (ws.length) throw new Error('Calling transform done when ws.length != 0')

    if (ts.transforming) throw new Error('Calling transform done when still transforming')

    return stream.push(null)
  }

  inherits$1(PassThrough$1, Transform$1)
  function PassThrough$1 (options) {
    if (!(this instanceof PassThrough$1)) return new PassThrough$1(options)

    Transform$1.call(this, options)
  }

  PassThrough$1.prototype._transform = function (chunk, encoding, cb) {
    cb(null, chunk)
  }

  inherits$1(Stream$1, EventEmitter)
  Stream$1.Readable = Readable$1
  Stream$1.Writable = Writable$1
  Stream$1.Duplex = Duplex$1
  Stream$1.Transform = Transform$1
  Stream$1.PassThrough = PassThrough$1

// Backwards-compat with node 0.4.x
  Stream$1.Stream = Stream$1

// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

  function Stream$1 () {
    EventEmitter.call(this)
  }

  Stream$1.prototype.pipe = function (dest, options) {
    var source = this

    function ondata (chunk) {
      if (dest.writable) {
        if (dest.write(chunk) === false && source.pause) {
          source.pause()
        }
      }
    }

    source.on('data', ondata)

    function ondrain () {
      if (source.readable && source.resume) {
        source.resume()
      }
    }

    dest.on('drain', ondrain)

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
    if (!dest._isStdio && (!options || options.end !== false)) {
      source.on('end', onend)
      source.on('close', onclose)
    }

    var didOnEnd = false
    function onend () {
      if (didOnEnd) return
      didOnEnd = true

      dest.end()
    }

    function onclose () {
      if (didOnEnd) return
      didOnEnd = true

      if (typeof dest.destroy === 'function') dest.destroy()
    }

  // don't leave dangling pipes when there are errors.
    function onerror (er) {
      cleanup()
      if (EventEmitter.listenerCount(this, 'error') === 0) {
        throw er // Unhandled stream error in pipe.
      }
    }

    source.on('error', onerror)
    dest.on('error', onerror)

  // remove all the event listeners that were added.
    function cleanup () {
      source.removeListener('data', ondata)
      dest.removeListener('drain', ondrain)

      source.removeListener('end', onend)
      source.removeListener('close', onclose)

      source.removeListener('error', onerror)
      dest.removeListener('error', onerror)

      source.removeListener('end', cleanup)
      source.removeListener('close', cleanup)

      dest.removeListener('close', cleanup)
    }

    source.on('end', cleanup)
    source.on('close', cleanup)

    dest.on('close', cleanup)

    dest.emit('pipe', source)

  // Allow for unix-like usage: A.pipe(B).pipe(C)
    return dest
  }

  var msg = {
    2: 'need dictionary', /* Z_NEED_DICT       2  */
    1: 'stream end', /* Z_STREAM_END      1  */
    0: '', /* Z_OK              0  */
    '-1': 'file error', /* Z_ERRNO         (-1) */
    '-2': 'stream error', /* Z_STREAM_ERROR  (-2) */
    '-3': 'data error', /* Z_DATA_ERROR    (-3) */
    '-4': 'insufficient memory', /* Z_MEM_ERROR     (-4) */
    '-5': 'buffer error', /* Z_BUF_ERROR     (-5) */
    '-6': 'incompatible version' /* Z_VERSION_ERROR (-6) */
  }

  function ZStream () {
  /* next input byte */
    this.input = null // JS specific, because we have no pointers
    this.next_in = 0
  /* number of bytes available at input */
    this.avail_in = 0
  /* total number of input bytes read so far */
    this.total_in = 0
  /* next output byte should be put there */
    this.output = null // JS specific, because we have no pointers
    this.next_out = 0
  /* remaining free space at output */
    this.avail_out = 0
  /* total number of bytes output so far */
    this.total_out = 0
  /* last error message, NULL if no error */
    this.msg = '' /* Z_NULL */
  /* not visible by applications */
    this.state = null
  /* best guess about the data type: binary or text */
    this.data_type = 2 /* Z_UNKNOWN */
  /* adler32 value of the uncompressed data */
    this.adler = 0
  }

// reduce buffer size, avoiding mem copy

  function arraySet (dest, src, src_offs, len, dest_offs) {
    if (src.subarray && dest.subarray) {
      dest.set(src.subarray(src_offs, src_offs + len), dest_offs)
      return
    }
  // Fallback to ordinary array
    for (var i = 0; i < len; i++) {
      dest[dest_offs + i] = src[src_offs + i]
    }
  }

  var Buf8 = Uint8Array
  var Buf16 = Uint16Array
  var Buf32 = Int32Array
// Enable/Disable typed arrays use, for testing
//

/* Public constants ========================================================== */
/* =========================================================================== */

// var Z_FILTERED          = 1;
// var Z_HUFFMAN_ONLY      = 2;
// var Z_RLE               = 3;
  var Z_FIXED$2 = 4
// var Z_DEFAULT_STRATEGY  = 0;

/* Possible values of the data_type field (though see inflate()) */
  var Z_BINARY$1 = 0
  var Z_TEXT$1 = 1
// var Z_ASCII             = 1; // = Z_TEXT
  var Z_UNKNOWN$2 = 2

/* ============================================================================ */

  function zero$1 (buf) {
    var len = buf.length
    while (--len >= 0) {
      buf[len] = 0
    }
  }

// From zutil.h

  var STORED_BLOCK = 0
  var STATIC_TREES = 1
  var DYN_TREES = 2
/* The three kinds of block type */

  var MIN_MATCH$1 = 3
  var MAX_MATCH$1 = 258
/* The minimum and maximum match lengths */

// From deflate.h
/* ===========================================================================
 * Internal compression state.
 */

  var LENGTH_CODES$1 = 29
/* number of length codes, not counting the special END_BLOCK code */

  var LITERALS$1 = 256
/* number of literal bytes 0..255 */

  var L_CODES$1 = LITERALS$1 + 1 + LENGTH_CODES$1
/* number of Literal or Length codes, including the END_BLOCK code */

  var D_CODES$1 = 30
/* number of distance codes */

  var BL_CODES$1 = 19
/* number of codes used to transfer the bit lengths */

  var HEAP_SIZE$1 = 2 * L_CODES$1 + 1
/* maximum heap size */

  var MAX_BITS$1 = 15
/* All codes must not exceed MAX_BITS bits */

  var Buf_size = 16
/* size of bit buffer in bi_buf */

/* ===========================================================================
 * Constants
 */

  var MAX_BL_BITS = 7
/* Bit length codes must not exceed MAX_BL_BITS bits */

  var END_BLOCK = 256
/* end of block literal code */

  var REP_3_6 = 16
/* repeat previous bit length 3-6 times (2 bits of repeat count) */

  var REPZ_3_10 = 17
/* repeat a zero length 3-10 times  (3 bits of repeat count) */

  var REPZ_11_138 = 18
/* repeat a zero length 11-138 times  (7 bits of repeat count) */

/* eslint-disable comma-spacing,array-bracket-spacing */
  var extra_lbits = /* extra bits for each length code */[0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]

  var extra_dbits = /* extra bits for each distance code */[0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

  var extra_blbits = /* extra bits for each bit length code */[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7]

  var bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
/* eslint-enable comma-spacing,array-bracket-spacing */

/* The lengths of the bit length codes are sent in order of decreasing
 * probability, to avoid transmitting the lengths for unused bit length codes.
 */

/* ===========================================================================
 * Local data. These are initialized only once.
 */

// We pre-fill arrays with 0 to avoid uninitialized gaps

  var DIST_CODE_LEN = 512 /* see definition of array dist_code below */

// !!!! Use flat array insdead of structure, Freq = i*2, Len = i*2+1
  var static_ltree = new Array((L_CODES$1 + 2) * 2)
  zero$1(static_ltree)
/* The static literal tree. Since the bit lengths are imposed, there is no
 * need for the L_CODES extra codes used during heap construction. However
 * The codes 286 and 287 are needed to build a canonical tree (see _tr_init
 * below).
 */

  var static_dtree = new Array(D_CODES$1 * 2)
  zero$1(static_dtree)
/* The static distance tree. (Actually a trivial tree since all codes use
 * 5 bits.)
 */

  var _dist_code = new Array(DIST_CODE_LEN)
  zero$1(_dist_code)
/* Distance codes. The first 256 values correspond to the distances
 * 3 .. 258, the last 256 values correspond to the top 8 bits of
 * the 15 bit distances.
 */

  var _length_code = new Array(MAX_MATCH$1 - MIN_MATCH$1 + 1)
  zero$1(_length_code)
/* length code for each normalized match length (0 == MIN_MATCH) */

  var base_length = new Array(LENGTH_CODES$1)
  zero$1(base_length)
/* First normalized length for each code (0 = MIN_MATCH) */

  var base_dist = new Array(D_CODES$1)
  zero$1(base_dist)
/* First normalized distance for each code (0 = distance of 1) */

  function StaticTreeDesc (static_tree, extra_bits, extra_base, elems, max_length) {
    this.static_tree = static_tree /* static tree or NULL */
    this.extra_bits = extra_bits /* extra bits for each code or NULL */
    this.extra_base = extra_base /* base index for extra_bits */
    this.elems = elems /* max number of elements in the tree */
    this.max_length = max_length /* max bit length for the codes */

  // show if `static_tree` has data or dummy - needed for monomorphic objects
    this.has_stree = static_tree && static_tree.length
  }

  var static_l_desc
  var static_d_desc
  var static_bl_desc

  function TreeDesc (dyn_tree, stat_desc) {
    this.dyn_tree = dyn_tree /* the dynamic tree */
    this.max_code = 0 /* largest code with non zero frequency */
    this.stat_desc = stat_desc /* the corresponding static tree */
  }

  function d_code (dist) {
    return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)]
  }

/* ===========================================================================
 * Output a short LSB first on the stream.
 * IN assertion: there is enough room in pendingBuf.
 */
  function put_short (s, w) {
  //    put_byte(s, (uch)((w) & 0xff));
  //    put_byte(s, (uch)((ush)(w) >> 8));
    s.pending_buf[s.pending++] = w & 0xff
    s.pending_buf[s.pending++] = w >>> 8 & 0xff
  }

/* ===========================================================================
 * Send a value on a given number of bits.
 * IN assertion: length <= 16 and value fits in length bits.
 */
  function send_bits (s, value, length) {
    if (s.bi_valid > Buf_size - length) {
      s.bi_buf |= value << s.bi_valid & 0xffff
      put_short(s, s.bi_buf)
      s.bi_buf = value >> Buf_size - s.bi_valid
      s.bi_valid += length - Buf_size
    } else {
      s.bi_buf |= value << s.bi_valid & 0xffff
      s.bi_valid += length
    }
  }

  function send_code (s, c, tree) {
    send_bits(s, tree[c * 2] /* .Code */, tree[c * 2 + 1] /* .Len */)
  }

/* ===========================================================================
 * Reverse the first len bits of a code, using straightforward code (a faster
 * method would use a table)
 * IN assertion: 1 <= len <= 15
 */
  function bi_reverse (code, len) {
    var res = 0
    do {
      res |= code & 1
      code >>>= 1
      res <<= 1
    } while (--len > 0)
    return res >>> 1
  }

/* ===========================================================================
 * Flush the bit buffer, keeping at most 7 bits in it.
 */
  function bi_flush (s) {
    if (s.bi_valid === 16) {
      put_short(s, s.bi_buf)
      s.bi_buf = 0
      s.bi_valid = 0
    } else if (s.bi_valid >= 8) {
      s.pending_buf[s.pending++] = s.bi_buf & 0xff
      s.bi_buf >>= 8
      s.bi_valid -= 8
    }
  }

/* ===========================================================================
 * Compute the optimal bit lengths for a tree and update the total bit length
 * for the current block.
 * IN assertion: the fields freq and dad are set, heap[heap_max] and
 *    above are the tree nodes sorted by increasing frequency.
 * OUT assertions: the field len is set to the optimal bit length, the
 *     array bl_count contains the frequencies for each bit length.
 *     The length opt_len is updated; static_len is also updated if stree is
 *     not null.
 */
  function gen_bitlen (s, desc) {
  //    deflate_state *s;
  //    tree_desc *desc;    /* the tree descriptor */
    var tree = desc.dyn_tree
    var max_code = desc.max_code
    var stree = desc.stat_desc.static_tree
    var has_stree = desc.stat_desc.has_stree
    var extra = desc.stat_desc.extra_bits
    var base = desc.stat_desc.extra_base
    var max_length = desc.stat_desc.max_length
    var h /* heap index */
    var n, m /* iterate over the tree elements */
    var bits /* bit length */
    var xbits /* extra bits */
    var f /* frequency */
    var overflow = 0 /* number of elements with bit length too large */

    for (bits = 0; bits <= MAX_BITS$1; bits++) {
      s.bl_count[bits] = 0
    }

  /* In a first pass, compute the optimal bit lengths (which may
   * overflow in the case of the bit length tree).
   */
    tree[s.heap[s.heap_max] * 2 + 1] /* .Len */ = 0 /* root of the heap */

    for (h = s.heap_max + 1; h < HEAP_SIZE$1; h++) {
      n = s.heap[h]
      bits = tree[tree[n * 2 + 1] /* .Dad */ * 2 + 1] /* .Len */ + 1
      if (bits > max_length) {
        bits = max_length
        overflow++
      }
      tree[n * 2 + 1] /* .Len */ = bits
    /* We overwrite tree[n].Dad which is no longer needed */

      if (n > max_code) {
        continue
      } /* not a leaf node */

      s.bl_count[bits]++
      xbits = 0
      if (n >= base) {
        xbits = extra[n - base]
      }
      f = tree[n * 2] /* .Freq */
      s.opt_len += f * (bits + xbits)
      if (has_stree) {
        s.static_len += f * (stree[n * 2 + 1] /* .Len */ + xbits)
      }
    }
    if (overflow === 0) {
      return
    }

  // Trace((stderr,"\nbit length overflow\n"));
  /* This happens for example on obj2 and pic of the Calgary corpus */

  /* Find the first bit length which could increase: */
    do {
      bits = max_length - 1
      while (s.bl_count[bits] === 0) {
        bits--
      }
      s.bl_count[bits]-- /* move one leaf down the tree */
      s.bl_count[bits + 1] += 2 /* move one overflow item as its brother */
      s.bl_count[max_length]--
    /* The brother of the overflow item also moves one step up,
     * but this does not affect bl_count[max_length]
     */
      overflow -= 2
    } while (overflow > 0)

  /* Now recompute all bit lengths, scanning in increasing frequency.
   * h is still equal to HEAP_SIZE. (It is simpler to reconstruct all
   * lengths instead of fixing only the wrong ones. This idea is taken
   * from 'ar' written by Haruhiko Okumura.)
   */
    for (bits = max_length; bits !== 0; bits--) {
      n = s.bl_count[bits]
      while (n !== 0) {
        m = s.heap[--h]
        if (m > max_code) {
          continue
        }
        if (tree[m * 2 + 1] /* .Len */ !== bits) {
        // Trace((stderr,"code %d bits %d->%d\n", m, tree[m].Len, bits));
          s.opt_len += (bits - tree[m * 2 + 1] /* .Len */) * tree[m * 2] /* .Freq */
          tree[m * 2 + 1] /* .Len */ = bits
        }
        n--
      }
    }
  }

/* ===========================================================================
 * Generate the codes for a given tree and bit counts (which need not be
 * optimal).
 * IN assertion: the array bl_count contains the bit length statistics for
 * the given tree and the field len is set for all tree elements.
 * OUT assertion: the field code is set for all tree elements of non
 *     zero code length.
 */
  function gen_codes (tree, max_code, bl_count) {
  //    ct_data *tree;             /* the tree to decorate */
  //    int max_code;              /* largest code with non zero frequency */
  //    ushf *bl_count;            /* number of codes at each bit length */

    var next_code = new Array(MAX_BITS$1 + 1) /* next code value for each bit length */
    var code = 0 /* running code value */
    var bits /* bit index */
    var n /* code index */

  /* The distribution counts are first used to generate the code values
   * without bit reversal.
   */
    for (bits = 1; bits <= MAX_BITS$1; bits++) {
      next_code[bits] = code = code + bl_count[bits - 1] << 1
    }
  /* Check that the bit counts in bl_count are consistent. The last code
   * must be all ones.
   */
  // Assert (code + bl_count[MAX_BITS]-1 == (1<<MAX_BITS)-1,
  //        "inconsistent bit counts");
  // Tracev((stderr,"\ngen_codes: max_code %d ", max_code));

    for (n = 0; n <= max_code; n++) {
      var len = tree[n * 2 + 1]
      if (len === 0) {
        continue
      }
    /* Now reverse the bits */
      tree[n * 2] /* .Code */ = bi_reverse(next_code[len]++, len)

    // Tracecv(tree != static_ltree, (stderr,"\nn %3d %c l %2d c %4x (%x) ",
    //     n, (isgraph(n) ? n : ' '), len, tree[n].Code, next_code[len]-1));
    }
  }

/* ===========================================================================
 * Initialize the various 'constant' tables.
 */
  function tr_static_init () {
    var n /* iterates over tree elements */
    var bits /* bit counter */
    var length /* length value */
    var code /* code value */
    var dist /* distance index */
    var bl_count = new Array(MAX_BITS$1 + 1)
  /* number of codes at each bit length for an optimal tree */

  // do check in _tr_init()
  // if (static_init_done) return;

  /* For some embedded targets, global variables are not initialized: */
  /* #ifdef NO_INIT_GLOBAL_POINTERS
    static_l_desc.static_tree = static_ltree;
    static_l_desc.extra_bits = extra_lbits;
    static_d_desc.static_tree = static_dtree;
    static_d_desc.extra_bits = extra_dbits;
    static_bl_desc.extra_bits = extra_blbits;
  #endif */

  /* Initialize the mapping length (0..255) -> length code (0..28) */
    length = 0
    for (code = 0; code < LENGTH_CODES$1 - 1; code++) {
      base_length[code] = length
      for (n = 0; n < 1 << extra_lbits[code]; n++) {
        _length_code[length++] = code
      }
    }
  // Assert (length == 256, "tr_static_init: length != 256");
  /* Note that the length 255 (match length 258) can be represented
   * in two different ways: code 284 + 5 bits or code 285, so we
   * overwrite length_code[255] to use the best encoding:
   */
    _length_code[length - 1] = code

  /* Initialize the mapping dist (0..32K) -> dist code (0..29) */
    dist = 0
    for (code = 0; code < 16; code++) {
      base_dist[code] = dist
      for (n = 0; n < 1 << extra_dbits[code]; n++) {
        _dist_code[dist++] = code
      }
    }
  // Assert (dist == 256, "tr_static_init: dist != 256");
    dist >>= 7 /* from now on, all distances are divided by 128 */
    for (; code < D_CODES$1; code++) {
      base_dist[code] = dist << 7
      for (n = 0; n < 1 << extra_dbits[code] - 7; n++) {
        _dist_code[256 + dist++] = code
      }
    }
  // Assert (dist == 256, "tr_static_init: 256+dist != 512");

  /* Construct the codes of the static literal tree */
    for (bits = 0; bits <= MAX_BITS$1; bits++) {
      bl_count[bits] = 0
    }

    n = 0
    while (n <= 143) {
      static_ltree[n * 2 + 1] /* .Len */ = 8
      n++
      bl_count[8]++
    }
    while (n <= 255) {
      static_ltree[n * 2 + 1] /* .Len */ = 9
      n++
      bl_count[9]++
    }
    while (n <= 279) {
      static_ltree[n * 2 + 1] /* .Len */ = 7
      n++
      bl_count[7]++
    }
    while (n <= 287) {
      static_ltree[n * 2 + 1] /* .Len */ = 8
      n++
      bl_count[8]++
    }
  /* Codes 286 and 287 do not exist, but we must include them in the
   * tree construction to get a canonical Huffman tree (longest code
   * all ones)
   */
    gen_codes(static_ltree, L_CODES$1 + 1, bl_count)

  /* The static distance tree is trivial: */
    for (n = 0; n < D_CODES$1; n++) {
      static_dtree[n * 2 + 1] /* .Len */ = 5
      static_dtree[n * 2] /* .Code */ = bi_reverse(n, 5)
    }

  // Now data ready and we can init static trees
    static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS$1 + 1, L_CODES$1, MAX_BITS$1)
    static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES$1, MAX_BITS$1)
    static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES$1, MAX_BL_BITS)

  // static_init_done = true;
  }

/* ===========================================================================
 * Initialize a new block.
 */
  function init_block (s) {
    var n /* iterates over tree elements */

  /* Initialize the trees. */
    for (n = 0; n < L_CODES$1; n++) {
      s.dyn_ltree[n * 2] /* .Freq */ = 0
    }
    for (n = 0; n < D_CODES$1; n++) {
      s.dyn_dtree[n * 2] /* .Freq */ = 0
    }
    for (n = 0; n < BL_CODES$1; n++) {
      s.bl_tree[n * 2] /* .Freq */ = 0
    }

    s.dyn_ltree[END_BLOCK * 2] /* .Freq */ = 1
    s.opt_len = s.static_len = 0
    s.last_lit = s.matches = 0
  }

/* ===========================================================================
 * Flush the bit buffer and align the output on a byte boundary
 */
  function bi_windup (s) {
    if (s.bi_valid > 8) {
      put_short(s, s.bi_buf)
    } else if (s.bi_valid > 0) {
    // put_byte(s, (Byte)s->bi_buf);
      s.pending_buf[s.pending++] = s.bi_buf
    }
    s.bi_buf = 0
    s.bi_valid = 0
  }

/* ===========================================================================
 * Copy a stored block, storing first the length and its
 * one's complement if requested.
 */
  function copy_block (s, buf, len, header) {
  // DeflateState *s;
  // charf    *buf;    /* the input data */
  // unsigned len;     /* its length */
  // int      header;  /* true if block header must be written */

    bi_windup(s) /* align on byte boundary */

    if (header) {
      put_short(s, len)
      put_short(s, ~len)
    }
  //  while (len--) {
  //    put_byte(s, *buf++);
  //  }
    arraySet(s.pending_buf, s.window, buf, len, s.pending)
    s.pending += len
  }

/* ===========================================================================
 * Compares to subtrees, using the tree depth as tie breaker when
 * the subtrees have equal frequency. This minimizes the worst case length.
 */
  function smaller (tree, n, m, depth) {
    var _n2 = n * 2
    var _m2 = m * 2
    return tree[_n2] /* .Freq */ < tree[_m2] /* .Freq */ || tree[_n2] /* .Freq */ === tree[_m2] /* .Freq */ && depth[n] <= depth[m]
  }

/* ===========================================================================
 * Restore the heap property by moving down the tree starting at node k,
 * exchanging a node with the smallest of its two sons if necessary, stopping
 * when the heap property is re-established (each father smaller than its
 * two sons).
 */
  function pqdownheap (s, tree, k)
//    deflate_state *s;
//    ct_data *tree;  /* the tree to restore */
//    int k;               /* node to move down */
{
    var v = s.heap[k]
    var j = k << 1 /* left son of k */
    while (j <= s.heap_len) {
    /* Set j to the smallest of the two sons: */
      if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
        j++
      }
    /* Exit if v is smaller than both sons */
      if (smaller(tree, v, s.heap[j], s.depth)) {
        break
      }

    /* Exchange v with the smallest son */
      s.heap[k] = s.heap[j]
      k = j

    /* And continue down the tree, setting j to the left son of k */
      j <<= 1
    }
    s.heap[k] = v
  }

// inlined manually
// var SMALLEST = 1;

/* ===========================================================================
 * Send the block data compressed using the given Huffman trees
 */
  function compress_block (s, ltree, dtree)
//    deflate_state *s;
//    const ct_data *ltree; /* literal tree */
//    const ct_data *dtree; /* distance tree */
{
    var dist /* distance of matched string */
    var lc /* match length or unmatched char (if dist == 0) */
    var lx = 0 /* running index in l_buf */
    var code /* the code to send */
    var extra /* number of extra bits to send */

    if (s.last_lit !== 0) {
      do {
        dist = s.pending_buf[s.d_buf + lx * 2] << 8 | s.pending_buf[s.d_buf + lx * 2 + 1]
        lc = s.pending_buf[s.l_buf + lx]
        lx++

        if (dist === 0) {
          send_code(s, lc, ltree) /* send a literal byte */
        // Tracecv(isgraph(lc), (stderr," '%c' ", lc));
        } else {
        /* Here, lc is the match length - MIN_MATCH */
          code = _length_code[lc]
          send_code(s, code + LITERALS$1 + 1, ltree) /* send the length code */
          extra = extra_lbits[code]
          if (extra !== 0) {
            lc -= base_length[code]
            send_bits(s, lc, extra) /* send the extra length bits */
          }
          dist-- /* dist is now the match distance - 1 */
          code = d_code(dist)
        // Assert (code < D_CODES, "bad d_code");

          send_code(s, code, dtree) /* send the distance code */
          extra = extra_dbits[code]
          if (extra !== 0) {
            dist -= base_dist[code]
            send_bits(s, dist, extra) /* send the extra distance bits */
          }
        } /* literal or match pair ? */

      /* Check that the overlay between pending_buf and d_buf+l_buf is ok: */
      // Assert((uInt)(s->pending) < s->lit_bufsize + 2*lx,
      //       "pendingBuf overflow");
      } while (lx < s.last_lit)
    }

    send_code(s, END_BLOCK, ltree)
  }

/* ===========================================================================
 * Construct one Huffman tree and assigns the code bit strings and lengths.
 * Update the total bit length for the current block.
 * IN assertion: the field freq is set for all tree elements.
 * OUT assertions: the fields len and code are set to the optimal bit length
 *     and corresponding code. The length opt_len is updated; static_len is
 *     also updated if stree is not null. The field max_code is set.
 */
  function build_tree (s, desc)
//    deflate_state *s;
//    tree_desc *desc; /* the tree descriptor */
{
    var tree = desc.dyn_tree
    var stree = desc.stat_desc.static_tree
    var has_stree = desc.stat_desc.has_stree
    var elems = desc.stat_desc.elems
    var n, m /* iterate over heap elements */
    var max_code = -1 /* largest code with non zero frequency */
    var node /* new node being created */

  /* Construct the initial heap, with least frequent element in
   * heap[SMALLEST]. The sons of heap[n] are heap[2*n] and heap[2*n+1].
   * heap[0] is not used.
   */
    s.heap_len = 0
    s.heap_max = HEAP_SIZE$1

    for (n = 0; n < elems; n++) {
      if (tree[n * 2] /* .Freq */ !== 0) {
        s.heap[++s.heap_len] = max_code = n
        s.depth[n] = 0
      } else {
        tree[n * 2 + 1] /* .Len */ = 0
      }
    }

  /* The pkzip format requires that at least one distance code exists,
   * and that at least one bit should be sent even if there is only one
   * possible code. So to avoid special checks later on we force at least
   * two codes of non zero frequency.
   */
    while (s.heap_len < 2) {
      node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0
      tree[node * 2] /* .Freq */ = 1
      s.depth[node] = 0
      s.opt_len--

      if (has_stree) {
        s.static_len -= stree[node * 2 + 1] /* .Len */
      }
    /* node is 0 or 1 so it does not have extra bits */
    }
    desc.max_code = max_code

  /* The elements heap[heap_len/2+1 .. heap_len] are leaves of the tree,
   * establish sub-heaps of increasing lengths:
   */
    for (n = s.heap_len >> 1; n >= 1; n--) {
      pqdownheap(s, tree, n)
    }

  /* Construct the Huffman tree by repeatedly combining the least two
   * frequent nodes.
   */
    node = elems /* next internal node of the tree */
    do {
    // pqremove(s, tree, n);  /* n = node of least frequency */
    /** * pqremove ***/
      n = s.heap[1 /* SMALLEST */]
      s.heap[1 /* SMALLEST */] = s.heap[s.heap_len--]
      pqdownheap(s, tree, 1 /* SMALLEST */)
    /***/

      m = s.heap[1 /* SMALLEST */] /* m = node of next least frequency */

      s.heap[--s.heap_max] = n /* keep the nodes sorted by frequency */
      s.heap[--s.heap_max] = m

    /* Create a new node father of n and m */
      tree[node * 2] /* .Freq */ = tree[n * 2] /* .Freq */ + tree[m * 2] /* .Freq */
      s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1
      tree[n * 2 + 1] /* .Dad */ = tree[m * 2 + 1] /* .Dad */ = node

    /* and insert the new node in the heap */
      s.heap[1 /* SMALLEST */] = node++
      pqdownheap(s, tree, 1 /* SMALLEST */)
    } while (s.heap_len >= 2)

    s.heap[--s.heap_max] = s.heap[1 /* SMALLEST */]

  /* At this point, the fields freq and dad are set. We can now
   * generate the bit lengths.
   */
    gen_bitlen(s, desc)

  /* The field len is now set, we can generate the bit codes */
    gen_codes(tree, max_code, s.bl_count)
  }

/* ===========================================================================
 * Scan a literal or distance tree to determine the frequencies of the codes
 * in the bit length tree.
 */
  function scan_tree (s, tree, max_code)
//    deflate_state *s;
//    ct_data *tree;   /* the tree to be scanned */
//    int max_code;    /* and its largest code of non zero frequency */
{
    var n /* iterates over all tree elements */
    var prevlen = -1 /* last emitted length */
    var curlen /* length of current code */

    var nextlen = tree[0 * 2 + 1] /* length of next code */

    var count = 0 /* repeat count of the current code */
    var max_count = 7 /* max repeat count */
    var min_count = 4 /* min repeat count */

    if (nextlen === 0) {
      max_count = 138
      min_count = 3
    }
    tree[(max_code + 1) * 2 + 1] /* .Len */ = 0xffff /* guard */

    for (n = 0; n <= max_code; n++) {
      curlen = nextlen
      nextlen = tree[(n + 1) * 2 + 1] /* .Len */

      if (++count < max_count && curlen === nextlen) {
        continue
      } else if (count < min_count) {
        s.bl_tree[curlen * 2] /* .Freq */ += count
      } else if (curlen !== 0) {
        if (curlen !== prevlen) {
          s.bl_tree[curlen * 2] /* .Freq */++
        }
        s.bl_tree[REP_3_6 * 2] /* .Freq */++
      } else if (count <= 10) {
        s.bl_tree[REPZ_3_10 * 2] /* .Freq */++
      } else {
        s.bl_tree[REPZ_11_138 * 2] /* .Freq */++
      }

      count = 0
      prevlen = curlen

      if (nextlen === 0) {
        max_count = 138
        min_count = 3
      } else if (curlen === nextlen) {
        max_count = 6
        min_count = 3
      } else {
        max_count = 7
        min_count = 4
      }
    }
  }

/* ===========================================================================
 * Send a literal or distance tree in compressed form, using the codes in
 * bl_tree.
 */
  function send_tree (s, tree, max_code)
//    deflate_state *s;
//    ct_data *tree; /* the tree to be scanned */
//    int max_code;       /* and its largest code of non zero frequency */
{
    var n /* iterates over all tree elements */
    var prevlen = -1 /* last emitted length */
    var curlen /* length of current code */

    var nextlen = tree[0 * 2 + 1] /* length of next code */

    var count = 0 /* repeat count of the current code */
    var max_count = 7 /* max repeat count */
    var min_count = 4 /* min repeat count */

  /* tree[max_code+1].Len = -1; */
  /* guard already set */
    if (nextlen === 0) {
      max_count = 138
      min_count = 3
    }

    for (n = 0; n <= max_code; n++) {
      curlen = nextlen
      nextlen = tree[(n + 1) * 2 + 1] /* .Len */

      if (++count < max_count && curlen === nextlen) {
        continue
      } else if (count < min_count) {
        do {
          send_code(s, curlen, s.bl_tree)
        } while (--count !== 0)
      } else if (curlen !== 0) {
        if (curlen !== prevlen) {
          send_code(s, curlen, s.bl_tree)
          count--
        }
      // Assert(count >= 3 && count <= 6, " 3_6?");
        send_code(s, REP_3_6, s.bl_tree)
        send_bits(s, count - 3, 2)
      } else if (count <= 10) {
        send_code(s, REPZ_3_10, s.bl_tree)
        send_bits(s, count - 3, 3)
      } else {
        send_code(s, REPZ_11_138, s.bl_tree)
        send_bits(s, count - 11, 7)
      }

      count = 0
      prevlen = curlen
      if (nextlen === 0) {
        max_count = 138
        min_count = 3
      } else if (curlen === nextlen) {
        max_count = 6
        min_count = 3
      } else {
        max_count = 7
        min_count = 4
      }
    }
  }

/* ===========================================================================
 * Construct the Huffman tree for the bit lengths and return the index in
 * bl_order of the last bit length code to send.
 */
  function build_bl_tree (s) {
    var max_blindex /* index of last bit length code of non zero freq */

  /* Determine the bit length frequencies for literal and distance trees */
    scan_tree(s, s.dyn_ltree, s.l_desc.max_code)
    scan_tree(s, s.dyn_dtree, s.d_desc.max_code)

  /* Build the bit length tree: */
    build_tree(s, s.bl_desc)
  /* opt_len now includes the length of the tree representations, except
   * the lengths of the bit lengths codes and the 5+5+4 bits for the counts.
   */

  /* Determine the number of bit length codes to send. The pkzip format
   * requires that at least 4 bit length codes be sent. (appnote.txt says
   * 3 but the actual value used is 4.)
   */
    for (max_blindex = BL_CODES$1 - 1; max_blindex >= 3; max_blindex--) {
      if (s.bl_tree[bl_order[max_blindex] * 2 + 1] /* .Len */ !== 0) {
        break
      }
    }
  /* Update opt_len to include the bit length tree and counts */
    s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4
  // Tracev((stderr, "\ndyn trees: dyn %ld, stat %ld",
  //        s->opt_len, s->static_len));

    return max_blindex
  }

/* ===========================================================================
 * Send the header for a block using dynamic Huffman trees: the counts, the
 * lengths of the bit length codes, the literal tree and the distance tree.
 * IN assertion: lcodes >= 257, dcodes >= 1, blcodes >= 4.
 */
  function send_all_trees (s, lcodes, dcodes, blcodes)
//    deflate_state *s;
//    int lcodes, dcodes, blcodes; /* number of codes for each tree */
{
    var rank /* index in bl_order */

  // Assert (lcodes >= 257 && dcodes >= 1 && blcodes >= 4, "not enough codes");
  // Assert (lcodes <= L_CODES && dcodes <= D_CODES && blcodes <= BL_CODES,
  //        "too many codes");
  // Tracev((stderr, "\nbl counts: "));
    send_bits(s, lcodes - 257, 5) /* not +255 as stated in appnote.txt */
    send_bits(s, dcodes - 1, 5)
    send_bits(s, blcodes - 4, 4) /* not -3 as stated in appnote.txt */
    for (rank = 0; rank < blcodes; rank++) {
    // Tracev((stderr, "\nbl code %2d ", bl_order[rank]));
      send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1] /* .Len */, 3)
    }
  // Tracev((stderr, "\nbl tree: sent %ld", s->bits_sent));

    send_tree(s, s.dyn_ltree, lcodes - 1) /* literal tree */
  // Tracev((stderr, "\nlit tree: sent %ld", s->bits_sent));

    send_tree(s, s.dyn_dtree, dcodes - 1) /* distance tree */
  // Tracev((stderr, "\ndist tree: sent %ld", s->bits_sent));
  }

/* ===========================================================================
 * Check if the data type is TEXT or BINARY, using the following algorithm:
 * - TEXT if the two conditions below are satisfied:
 *    a) There are no non-portable control characters belonging to the
 *       "black list" (0..6, 14..25, 28..31).
 *    b) There is at least one printable character belonging to the
 *       "white list" (9 {TAB}, 10 {LF}, 13 {CR}, 32..255).
 * - BINARY otherwise.
 * - The following partially-portable control characters form a
 *   "gray list" that is ignored in this detection algorithm:
 *   (7 {BEL}, 8 {BS}, 11 {VT}, 12 {FF}, 26 {SUB}, 27 {ESC}).
 * IN assertion: the fields Freq of dyn_ltree are set.
 */
  function detect_data_type (s) {
  /* black_mask is the bit mask of black-listed bytes
   * set bits 0..6, 14..25, and 28..31
   * 0xf3ffc07f = binary 11110011111111111100000001111111
   */
    var black_mask = 0xf3ffc07f
    var n

  /* Check for non-textual ("black-listed") bytes. */
    for (n = 0; n <= 31; n++, black_mask >>>= 1) {
      if (black_mask & 1 && s.dyn_ltree[n * 2] /* .Freq */ !== 0) {
        return Z_BINARY$1
      }
    }

  /* Check for textual ("white-listed") bytes. */
    if (s.dyn_ltree[9 * 2] /* .Freq */ !== 0 || s.dyn_ltree[10 * 2] /* .Freq */ !== 0 || s.dyn_ltree[13 * 2] /* .Freq */ !== 0) {
      return Z_TEXT$1
    }
    for (n = 32; n < LITERALS$1; n++) {
      if (s.dyn_ltree[n * 2] /* .Freq */ !== 0) {
        return Z_TEXT$1
      }
    }

  /* There are no "black-listed" or "white-listed" bytes:
   * this stream either is empty or has tolerated ("gray-listed") bytes only.
   */
    return Z_BINARY$1
  }

  var static_init_done = false

/* ===========================================================================
 * Initialize the tree data structures for a new zlib stream.
 */
  function _tr_init (s) {
    if (!static_init_done) {
      tr_static_init()
      static_init_done = true
    }

    s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc)
    s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc)
    s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc)

    s.bi_buf = 0
    s.bi_valid = 0

  /* Initialize the first block of the first file: */
    init_block(s)
  }

/* ===========================================================================
 * Send a stored block
 */
  function _tr_stored_block (s, buf, stored_len, last)
// DeflateState *s;
// charf *buf;       /* input block */
// ulg stored_len;   /* length of input block */
// int last;         /* one if this is the last block for a file */
{
    send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3) /* send block type */
    copy_block(s, buf, stored_len, true) /* with header */
  }

/* ===========================================================================
 * Send one empty static block to give enough lookahead for inflate.
 * This takes 10 bits, of which 7 may remain in the bit buffer.
 */
  function _tr_align (s) {
    send_bits(s, STATIC_TREES << 1, 3)
    send_code(s, END_BLOCK, static_ltree)
    bi_flush(s)
  }

/* ===========================================================================
 * Determine the best encoding for the current block: dynamic trees, static
 * trees or store, and output the encoded block to the zip file.
 */
  function _tr_flush_block (s, buf, stored_len, last)
// DeflateState *s;
// charf *buf;       /* input block, or NULL if too old */
// ulg stored_len;   /* length of input block */
// int last;         /* one if this is the last block for a file */
{
    var opt_lenb, static_lenb /* opt_len and static_len in bytes */
    var max_blindex = 0 /* index of last bit length code of non zero freq */

  /* Build the Huffman trees unless a stored block is forced */
    if (s.level > 0) {
    /* Check if the file is binary or text */
      if (s.strm.data_type === Z_UNKNOWN$2) {
        s.strm.data_type = detect_data_type(s)
      }

    /* Construct the literal and distance trees */
      build_tree(s, s.l_desc)
    // Tracev((stderr, "\nlit data: dyn %ld, stat %ld", s->opt_len,
    //        s->static_len));

      build_tree(s, s.d_desc)
    // Tracev((stderr, "\ndist data: dyn %ld, stat %ld", s->opt_len,
    //        s->static_len));
    /* At this point, opt_len and static_len are the total bit lengths of
     * the compressed block data, excluding the tree representations.
     */

    /* Build the bit length tree for the above two trees, and get the index
     * in bl_order of the last bit length code to send.
     */
      max_blindex = build_bl_tree(s)

    /* Determine the best encoding. Compute the block lengths in bytes. */
      opt_lenb = s.opt_len + 3 + 7 >>> 3
      static_lenb = s.static_len + 3 + 7 >>> 3

    // Tracev((stderr, "\nopt %lu(%lu) stat %lu(%lu) stored %lu lit %u ",
    //        opt_lenb, s->opt_len, static_lenb, s->static_len, stored_len,
    //        s->last_lit));

      if (static_lenb <= opt_lenb) {
        opt_lenb = static_lenb
      }
    } else {
    // Assert(buf != (char*)0, "lost buf");
      opt_lenb = static_lenb = stored_len + 5 /* force a stored block */
    }

    if (stored_len + 4 <= opt_lenb && buf !== -1) {
    /* 4: two words for the lengths */

    /* The test buf != NULL is only necessary if LIT_BUFSIZE > WSIZE.
     * Otherwise we can't have processed more than WSIZE input bytes since
     * the last block flush, because compression would have been
     * successful. If LIT_BUFSIZE <= WSIZE, it is never too late to
     * transform a block into a stored block.
     */
      _tr_stored_block(s, buf, stored_len, last)
    } else if (s.strategy === Z_FIXED$2 || static_lenb === opt_lenb) {
      send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3)
      compress_block(s, static_ltree, static_dtree)
    } else {
      send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3)
      send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1)
      compress_block(s, s.dyn_ltree, s.dyn_dtree)
    }
  // Assert (s->compressed_len == s->bits_sent, "bad compressed size");
  /* The above check is made mod 2^32, for files larger than 512 MB
   * and uLong implemented on 32 bits.
   */
    init_block(s)

    if (last) {
      bi_windup(s)
    }
  // Tracev((stderr,"\ncomprlen %lu(%lu) ", s->compressed_len>>3,
  //       s->compressed_len-7*last));
  }

/* ===========================================================================
 * Save the match info and tally the frequency counts. Return true if
 * the current block must be flushed.
 */
  function _tr_tally (s, dist, lc)
//    deflate_state *s;
//    unsigned dist;  /* distance of matched string */
//    unsigned lc;    /* match length-MIN_MATCH or unmatched char (if dist==0) */
{
  // var out_length, in_length, dcode;

    s.pending_buf[s.d_buf + s.last_lit * 2] = dist >>> 8 & 0xff
    s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 0xff

    s.pending_buf[s.l_buf + s.last_lit] = lc & 0xff
    s.last_lit++

    if (dist === 0) {
    /* lc is the unmatched char */
      s.dyn_ltree[lc * 2] /* .Freq */++
    } else {
      s.matches++
    /* Here, lc is the match length - MIN_MATCH */
      dist-- /* dist = match distance - 1 */
    // Assert((ush)dist < (ush)MAX_DIST(s) &&
    //       (ush)lc <= (ush)(MAX_MATCH-MIN_MATCH) &&
    //       (ush)d_code(dist) < (ush)D_CODES,  "_tr_tally: bad match");

      s.dyn_ltree[(_length_code[lc] + LITERALS$1 + 1) * 2] /* .Freq */++
      s.dyn_dtree[d_code(dist) * 2] /* .Freq */++
    }

  // (!) This block is disabled in zlib defailts,
  // don't enable it for binary compatibility

  // #ifdef TRUNCATE_BLOCK
  //  /* Try to guess if it is profitable to stop the current block here */
  //  if ((s.last_lit & 0x1fff) === 0 && s.level > 2) {
  //    /* Compute an upper bound for the compressed length */
  //    out_length = s.last_lit*8;
  //    in_length = s.strstart - s.block_start;
  //
  //    for (dcode = 0; dcode < D_CODES; dcode++) {
  //      out_length += s.dyn_dtree[dcode*2]/*.Freq*/ * (5 + extra_dbits[dcode]);
  //    }
  //    out_length >>>= 3;
  //    //Tracev((stderr,"\nlast_lit %u, in %ld, out ~%ld(%ld%%) ",
  //    //       s->last_lit, in_length, out_length,
  //    //       100L - out_length*100L/in_length));
  //    if (s.matches < (s.last_lit>>1)/*int /2*/ && out_length < (in_length>>1)/*int /2*/) {
  //      return true;
  //    }
  //  }
  // #endif

    return s.last_lit === s.lit_bufsize - 1
  /* We avoid equality with lit_bufsize because of wraparound at 64K
   * on 16 bit machines and because stored blocks are restricted to
   * 64K-1 bytes.
   */
  }

// Note: adler32 takes 12% for level 0 and 2% for level 6.
// It doesn't worth to make additional optimizationa as in original.
// Small size is preferable.

  function adler32 (adler, buf, len, pos) {
    var s1 = adler & 0xffff | 0,
      s2 = adler >>> 16 & 0xffff | 0,
      n = 0

    while (len !== 0) {
    // Set limit ~ twice less than 5552, to keep
    // s2 in 31-bits, because we force signed ints.
    // in other case %= will fail.
      n = len > 2000 ? 2000 : len
      len -= n

      do {
        s1 = s1 + buf[pos++] | 0
        s2 = s2 + s1 | 0
      } while (--n)

      s1 %= 65521
      s2 %= 65521
    }

    return s1 | s2 << 16 | 0
  }

// Note: we can't get significant speed boost here.
// So write code to minimize size - no pregenerated tables
// and array tools dependencies.

// Use ordinary array, since untyped makes no boost here
  function makeTable () {
    var c,
      table = []

    for (var n = 0; n < 256; n++) {
      c = n
      for (var k = 0; k < 8; k++) {
        c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1
      }
      table[n] = c
    }

    return table
  }

// Create table on load. Just 255 signed longs. Not a problem.
  var crcTable = makeTable()

  function crc32 (crc, buf, len, pos) {
    var t = crcTable,
      end = pos + len

    crc ^= -1

    for (var i = pos; i < end; i++) {
      crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 0xFF]
    }

    return crc ^ -1 // >>> 0;
  }

/* Public constants ========================================================== */
/* =========================================================================== */

/* Allowed flush values; see deflate() and inflate() below for details */
  var Z_NO_FLUSH$1 = 0
  var Z_PARTIAL_FLUSH$1 = 1
// var Z_SYNC_FLUSH    = 2;
  var Z_FULL_FLUSH$1 = 3
  var Z_FINISH$1 = 4
  var Z_BLOCK$1 = 5
// var Z_TREES         = 6;

/* Return codes for the compression/decompression functions. Negative values
 * are errors, positive values are used for special but normal events.
 */
  var Z_OK$1 = 0
  var Z_STREAM_END$1 = 1
// var Z_NEED_DICT     = 2;
// var Z_ERRNO         = -1;
  var Z_STREAM_ERROR$1 = -2
  var Z_DATA_ERROR$1 = -3
// var Z_MEM_ERROR     = -4;
  var Z_BUF_ERROR$1 = -5
// var Z_VERSION_ERROR = -6;

/* compression levels */
// var Z_NO_COMPRESSION      = 0;
// var Z_BEST_SPEED          = 1;
// var Z_BEST_COMPRESSION    = 9;
  var Z_DEFAULT_COMPRESSION$1 = -1

  var Z_FILTERED$1 = 1
  var Z_HUFFMAN_ONLY$1 = 2
  var Z_RLE$1 = 3
  var Z_FIXED$1 = 4
/* Possible values of the data_type field (though see inflate()) */
// var Z_BINARY              = 0;
// var Z_TEXT                = 1;
// var Z_ASCII               = 1; // = Z_TEXT
  var Z_UNKNOWN$1 = 2

/* The deflate compression method */
  var Z_DEFLATED$1 = 8

/* ============================================================================ */

  var MAX_MEM_LEVEL = 9
  var LENGTH_CODES = 29
/* number of length codes, not counting the special END_BLOCK code */
  var LITERALS = 256
/* number of literal bytes 0..255 */
  var L_CODES = LITERALS + 1 + LENGTH_CODES
/* number of Literal or Length codes, including the END_BLOCK code */
  var D_CODES = 30
/* number of distance codes */
  var BL_CODES = 19
/* number of codes used to transfer the bit lengths */
  var HEAP_SIZE = 2 * L_CODES + 1
/* maximum heap size */
  var MAX_BITS = 15
/* All codes must not exceed MAX_BITS bits */

  var MIN_MATCH = 3
  var MAX_MATCH = 258
  var MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1

  var PRESET_DICT = 0x20

  var INIT_STATE = 42
  var EXTRA_STATE = 69
  var NAME_STATE = 73
  var COMMENT_STATE = 91
  var HCRC_STATE = 103
  var BUSY_STATE = 113
  var FINISH_STATE = 666

  var BS_NEED_MORE = 1 /* block not completed, need more input or more output */
  var BS_BLOCK_DONE = 2 /* block flush performed */
  var BS_FINISH_STARTED = 3 /* finish started, need only more output at next deflate */
  var BS_FINISH_DONE = 4 /* finish done, accept no more input or output */

  var OS_CODE = 0x03 // Unix :) . Don't detect, use this default.

  function err (strm, errorCode) {
    strm.msg = msg[errorCode]
    return errorCode
  }

  function rank (f) {
    return (f << 1) - (f > 4 ? 9 : 0)
  }

  function zero (buf) {
    var len = buf.length
    while (--len >= 0) {
      buf[len] = 0
    }
  }

/* =========================================================================
 * Flush as much pending output as possible. All deflate() output goes
 * through this function so some applications may wish to modify it
 * to avoid allocating a large strm->output buffer and copying into it.
 * (See also read_buf()).
 */
  function flush_pending (strm) {
    var s = strm.state

  // _tr_flush_bits(s);
    var len = s.pending
    if (len > strm.avail_out) {
      len = strm.avail_out
    }
    if (len === 0) {
      return
    }

    arraySet(strm.output, s.pending_buf, s.pending_out, len, strm.next_out)
    strm.next_out += len
    s.pending_out += len
    strm.total_out += len
    strm.avail_out -= len
    s.pending -= len
    if (s.pending === 0) {
      s.pending_out = 0
    }
  }

  function flush_block_only (s, last) {
    _tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last)
    s.block_start = s.strstart
    flush_pending(s.strm)
  }

  function put_byte (s, b) {
    s.pending_buf[s.pending++] = b
  }

/* =========================================================================
 * Put a short in the pending buffer. The 16-bit value is put in MSB order.
 * IN assertion: the stream state is correct and there is enough room in
 * pending_buf.
 */
  function putShortMSB (s, b) {
  //  put_byte(s, (Byte)(b >> 8));
  //  put_byte(s, (Byte)(b & 0xff));
    s.pending_buf[s.pending++] = b >>> 8 & 0xff
    s.pending_buf[s.pending++] = b & 0xff
  }

/* ===========================================================================
 * Read a new buffer from the current input stream, update the adler32
 * and total number of bytes read.  All deflate() input goes through
 * this function so some applications may wish to modify it to avoid
 * allocating a large strm->input buffer and copying from it.
 * (See also flush_pending()).
 */
  function read_buf (strm, buf, start, size) {
    var len = strm.avail_in

    if (len > size) {
      len = size
    }
    if (len === 0) {
      return 0
    }

    strm.avail_in -= len

  // zmemcpy(buf, strm->next_in, len);
    arraySet(buf, strm.input, strm.next_in, len, start)
    if (strm.state.wrap === 1) {
      strm.adler = adler32(strm.adler, buf, len, start)
    } else if (strm.state.wrap === 2) {
      strm.adler = crc32(strm.adler, buf, len, start)
    }

    strm.next_in += len
    strm.total_in += len

    return len
  }

/* ===========================================================================
 * Set match_start to the longest match starting at the given string and
 * return its length. Matches shorter or equal to prev_length are discarded,
 * in which case the result is equal to prev_length and match_start is
 * garbage.
 * IN assertions: cur_match is the head of the hash chain for the current
 *   string (strstart) and its distance is <= MAX_DIST, and prev_length >= 1
 * OUT assertion: the match length is not greater than s->lookahead.
 */
  function longest_match (s, cur_match) {
    var chain_length = s.max_chain_length /* max hash chain length */
    var scan = s.strstart /* current string */
    var match /* matched string */
    var len /* length of current match */
    var best_len = s.prev_length /* best match length so far */
    var nice_match = s.nice_match /* stop if match long enough */
    var limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0

    var _win = s.window // shortcut

    var wmask = s.w_mask
    var prev = s.prev

  /* Stop when cur_match becomes <= limit. To simplify the code,
   * we prevent matches with the string of window index 0.
   */

    var strend = s.strstart + MAX_MATCH
    var scan_end1 = _win[scan + best_len - 1]
    var scan_end = _win[scan + best_len]

  /* The code is optimized for HASH_BITS >= 8 and MAX_MATCH-2 multiple of 16.
   * It is easy to get rid of this optimization if necessary.
   */
  // Assert(s->hash_bits >= 8 && MAX_MATCH == 258, "Code too clever");

  /* Do not waste too much time if we already have a good match: */
    if (s.prev_length >= s.good_match) {
      chain_length >>= 2
    }
  /* Do not look for matches beyond the end of the input. This is necessary
   * to make deflate deterministic.
   */
    if (nice_match > s.lookahead) {
      nice_match = s.lookahead
    }

  // Assert((ulg)s->strstart <= s->window_size-MIN_LOOKAHEAD, "need lookahead");

    do {
    // Assert(cur_match < s->strstart, "no future");
      match = cur_match

    /* Skip to next match if the match length cannot increase
     * or if the match length is less than 2.  Note that the checks below
     * for insufficient lookahead only occur occasionally for performance
     * reasons.  Therefore uninitialized memory will be accessed, and
     * conditional jumps will be made that depend on those values.
     * However the length of the match is limited to the lookahead, so
     * the output of deflate is not affected by the uninitialized values.
     */

      if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) {
        continue
      }

    /* The check at best_len-1 can be removed because it will be made
     * again later. (This heuristic is not always a win.)
     * It is not necessary to compare scan[2] and match[2] since they
     * are always equal when the other bytes match, given that
     * the hash keys are equal and that HASH_BITS >= 8.
     */
      scan += 2
      match++
    // Assert(*scan == *match, "match[2]?");

    /* We check for insufficient lookahead only every 8th comparison;
     * the 256th check will be made at strstart+258.
     */
      do {
      /* jshint noempty:false */
      } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend)

    // Assert(scan <= s->window+(unsigned)(s->window_size-1), "wild scan");

      len = MAX_MATCH - (strend - scan)
      scan = strend - MAX_MATCH

      if (len > best_len) {
        s.match_start = cur_match
        best_len = len
        if (len >= nice_match) {
          break
        }
        scan_end1 = _win[scan + best_len - 1]
        scan_end = _win[scan + best_len]
      }
    } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0)

    if (best_len <= s.lookahead) {
      return best_len
    }
    return s.lookahead
  }

/* ===========================================================================
 * Fill the window when the lookahead becomes insufficient.
 * Updates strstart and lookahead.
 *
 * IN assertion: lookahead < MIN_LOOKAHEAD
 * OUT assertions: strstart <= window_size-MIN_LOOKAHEAD
 *    At least one byte has been read, or avail_in == 0; reads are
 *    performed for at least two bytes (required for the zip translate_eol
 *    option -- not supported here).
 */
  function fill_window (s) {
    var _w_size = s.w_size
    var p, n, m, more, str

  // Assert(s->lookahead < MIN_LOOKAHEAD, "already enough lookahead");

    do {
      more = s.window_size - s.lookahead - s.strstart

    // JS ints have 32 bit, block below not needed
    /* Deal with !@#$% 64K limit: */
    // if (sizeof(int) <= 2) {
    //    if (more == 0 && s->strstart == 0 && s->lookahead == 0) {
    //        more = wsize;
    //
    //  } else if (more == (unsigned)(-1)) {
    //        /* Very unlikely, but possible on 16 bit machine if
    //         * strstart == 0 && lookahead == 1 (input done a byte at time)
    //         */
    //        more--;
    //    }
    // }

    /* If the window is almost full and there is insufficient lookahead,
     * move the upper half to the lower one to make room in the upper half.
     */
      if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
        arraySet(s.window, s.window, _w_size, _w_size, 0)
        s.match_start -= _w_size
        s.strstart -= _w_size
      /* we now have strstart >= MAX_DIST */
        s.block_start -= _w_size

      /* Slide the hash table (could be avoided with 32 bit values
       at the expense of memory usage). We slide even when level == 0
       to keep the hash table consistent if we switch back to level > 0
       later. (Using level 0 permanently is not an optimal usage of
       zlib, so we don't care about this pathological case.)
       */

        n = s.hash_size
        p = n
        do {
          m = s.head[--p]
          s.head[p] = m >= _w_size ? m - _w_size : 0
        } while (--n)

        n = _w_size
        p = n
        do {
          m = s.prev[--p]
          s.prev[p] = m >= _w_size ? m - _w_size : 0
        /* If n is not on any hash chain, prev[n] is garbage but
         * its value will never be used.
         */
        } while (--n)

        more += _w_size
      }
      if (s.strm.avail_in === 0) {
        break
      }

    /* If there was no sliding:
     *    strstart <= WSIZE+MAX_DIST-1 && lookahead <= MIN_LOOKAHEAD - 1 &&
     *    more == window_size - lookahead - strstart
     * => more >= window_size - (MIN_LOOKAHEAD-1 + WSIZE + MAX_DIST-1)
     * => more >= window_size - 2*WSIZE + 2
     * In the BIG_MEM or MMAP case (not yet supported),
     *   window_size == input_size + MIN_LOOKAHEAD  &&
     *   strstart + s->lookahead <= input_size => more >= MIN_LOOKAHEAD.
     * Otherwise, window_size == 2*WSIZE so more >= 2.
     * If there was sliding, more >= WSIZE. So in all cases, more >= 2.
     */
    // Assert(more >= 2, "more < 2");
      n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more)
      s.lookahead += n

    /* Initialize the hash value now that we have some input: */
      if (s.lookahead + s.insert >= MIN_MATCH) {
        str = s.strstart - s.insert
        s.ins_h = s.window[str]

      /* UPDATE_HASH(s, s->ins_h, s->window[str + 1]); */
        s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + 1]) & s.hash_mask
      // #if MIN_MATCH != 3
      //        Call update_hash() MIN_MATCH-3 more times
      // #endif
        while (s.insert) {
        /* UPDATE_HASH(s, s->ins_h, s->window[str + MIN_MATCH-1]); */
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask

          s.prev[str & s.w_mask] = s.head[s.ins_h]
          s.head[s.ins_h] = str
          str++
          s.insert--
          if (s.lookahead + s.insert < MIN_MATCH) {
            break
          }
        }
      }
    /* If the whole input has less than MIN_MATCH bytes, ins_h is garbage,
     * but this is not important since only literal bytes will be emitted.
     */
    } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0)

  /* If the WIN_INIT bytes after the end of the current data have never been
   * written, then zero those bytes in order to avoid memory check reports of
   * the use of uninitialized (or uninitialised as Julian writes) bytes by
   * the longest match routines.  Update the high water mark for the next
   * time through here.  WIN_INIT is set to MAX_MATCH since the longest match
   * routines allow scanning to strstart + MAX_MATCH, ignoring lookahead.
   */
  //  if (s.high_water < s.window_size) {
  //    var curr = s.strstart + s.lookahead;
  //    var init = 0;
  //
  //    if (s.high_water < curr) {
  //      /* Previous high water mark below current data -- zero WIN_INIT
  //       * bytes or up to end of window, whichever is less.
  //       */
  //      init = s.window_size - curr;
  //      if (init > WIN_INIT)
  //        init = WIN_INIT;
  //      zmemzero(s->window + curr, (unsigned)init);
  //      s->high_water = curr + init;
  //    }
  //    else if (s->high_water < (ulg)curr + WIN_INIT) {
  //      /* High water mark at or above current data, but below current data
  //       * plus WIN_INIT -- zero out to current data plus WIN_INIT, or up
  //       * to end of window, whichever is less.
  //       */
  //      init = (ulg)curr + WIN_INIT - s->high_water;
  //      if (init > s->window_size - s->high_water)
  //        init = s->window_size - s->high_water;
  //      zmemzero(s->window + s->high_water, (unsigned)init);
  //      s->high_water += init;
  //    }
  //  }
  //
  //  Assert((ulg)s->strstart <= s->window_size - MIN_LOOKAHEAD,
  //    "not enough room for search");
  }

/* ===========================================================================
 * Copy without compression as much as possible from the input stream, return
 * the current block state.
 * This function does not insert new strings in the dictionary since
 * uncompressible data is probably not useful. This function is used
 * only for the level=0 compression option.
 * NOTE: this function should be optimized to avoid extra copying from
 * window to pending_buf.
 */
  function deflate_stored (s, flush) {
  /* Stored blocks are limited to 0xffff bytes, pending_buf is limited
   * to pending_buf_size, and each stored block has a 5 byte header:
   */
    var max_block_size = 0xffff

    if (max_block_size > s.pending_buf_size - 5) {
      max_block_size = s.pending_buf_size - 5
    }

  /* Copy as much as possible from input to output: */
    for (;;) {
    /* Fill the window as much as possible: */
      if (s.lookahead <= 1) {
      // Assert(s->strstart < s->w_size+MAX_DIST(s) ||
      //  s->block_start >= (long)s->w_size, "slide too late");
      //      if (!(s.strstart < s.w_size + (s.w_size - MIN_LOOKAHEAD) ||
      //        s.block_start >= s.w_size)) {
      //        throw  new Error("slide too late");
      //      }

        fill_window(s)
        if (s.lookahead === 0 && flush === Z_NO_FLUSH$1) {
          return BS_NEED_MORE
        }

        if (s.lookahead === 0) {
          break
        }
      /* flush the current block */
      }
    // Assert(s->block_start >= 0L, "block gone");
    //    if (s.block_start < 0) throw new Error("block gone");

      s.strstart += s.lookahead
      s.lookahead = 0

    /* Emit a stored block if pending_buf will be full: */
      var max_start = s.block_start + max_block_size

      if (s.strstart === 0 || s.strstart >= max_start) {
      /* strstart == 0 is possible when wraparound on 16-bit machine */
        s.lookahead = s.strstart - max_start
        s.strstart = max_start
      /** * FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false)
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE
        }
      /***/
      }
    /* Flush if we may have to slide, otherwise block_start may become
     * negative and the data will be gone:
     */
      if (s.strstart - s.block_start >= s.w_size - MIN_LOOKAHEAD) {
      /** * FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false)
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE
        }
      /***/
      }
    }

    s.insert = 0

    if (flush === Z_FINISH$1) {
    /** * FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true)
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED
      }
    /***/
      return BS_FINISH_DONE
    }

    if (s.strstart > s.block_start) {
    /** * FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false)
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE
      }
    /***/
    }

    return BS_NEED_MORE
  }

/* ===========================================================================
 * Compress as much as possible from the input stream, return the current
 * block state.
 * This function does not perform lazy evaluation of matches and inserts
 * new strings in the dictionary only for unmatched strings or for short
 * matches. It is used only for the fast compression options.
 */
  function deflate_fast (s, flush) {
    var hash_head /* head of the hash chain */
    var bflush /* set if current block must be flushed */

    for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the next match, plus MIN_MATCH bytes to insert the
     * string following the next match.
     */
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s)
        if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$1) {
          return BS_NEED_MORE
        }
        if (s.lookahead === 0) {
          break /* flush the current block */
        }
      }

    /* Insert the string window[strstart .. strstart+2] in the
     * dictionary, and set hash_head to the head of the hash chain:
     */
      hash_head = 0 /* NIL */
      if (s.lookahead >= MIN_MATCH) {
      /** * INSERT_STRING(s, s.strstart, hash_head); ***/
        s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask
        hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h]
        s.head[s.ins_h] = s.strstart
      /***/
      }

    /* Find the longest match, discarding those <= prev_length.
     * At this point we have always match_length < MIN_MATCH
     */
      if (hash_head !== 0 /* NIL */ && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
      /* To simplify the code, we prevent matches with the string
       * of window index 0 (in particular we have to avoid a match
       * of the string with itself at the start of the input file).
       */
        s.match_length = longest_match(s, hash_head)
      /* longest_match() sets match_start */
      }
      if (s.match_length >= MIN_MATCH) {
      // check_match(s, s.strstart, s.match_start, s.match_length); // for debug only

      /** * _tr_tally_dist(s, s.strstart - s.match_start,
                     s.match_length - MIN_MATCH, bflush); ***/
        bflush = _tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH)

        s.lookahead -= s.match_length

      /* Insert new strings in the hash table only if the match length
       * is not too large. This saves time but degrades compression.
       */
        if (s.match_length <= s.max_lazy_match /* max_insert_length */ && s.lookahead >= MIN_MATCH) {
          s.match_length-- /* string at strstart already in table */
          do {
            s.strstart++
          /** * INSERT_STRING(s, s.strstart, hash_head); ***/
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask
            hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h]
            s.head[s.ins_h] = s.strstart
          /***/
          /* strstart never exceeds WSIZE-MAX_MATCH, so there are
           * always MIN_MATCH bytes ahead.
           */
          } while (--s.match_length !== 0)
          s.strstart++
        } else {
          s.strstart += s.match_length
          s.match_length = 0
          s.ins_h = s.window[s.strstart]
        /* UPDATE_HASH(s, s.ins_h, s.window[s.strstart+1]); */
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + 1]) & s.hash_mask

        // #if MIN_MATCH != 3
        //                Call UPDATE_HASH() MIN_MATCH-3 more times
        // #endif
        /* If lookahead < MIN_MATCH, ins_h is garbage, but it does not
         * matter since it will be recomputed at next deflate call.
         */
        }
      } else {
      /* No match, output a literal byte */
      // Tracevv((stderr,"%c", s.window[s.strstart]));
      /** * _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
        bflush = _tr_tally(s, 0, s.window[s.strstart])

        s.lookahead--
        s.strstart++
      }
      if (bflush) {
      /** * FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false)
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE
        }
      /***/
      }
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1
    if (flush === Z_FINISH$1) {
    /** * FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true)
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED
      }
    /***/
      return BS_FINISH_DONE
    }
    if (s.last_lit) {
    /** * FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false)
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE
      }
    /***/
    }
    return BS_BLOCK_DONE
  }

/* ===========================================================================
 * Same as above, but achieves better compression. We use a lazy
 * evaluation for matches: a match is finally adopted only if there is
 * no better match at the next window position.
 */
  function deflate_slow (s, flush) {
    var hash_head /* head of hash chain */
    var bflush /* set if current block must be flushed */

    var max_insert

  /* Process the input block. */
    for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the next match, plus MIN_MATCH bytes to insert the
     * string following the next match.
     */
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s)
        if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$1) {
          return BS_NEED_MORE
        }
        if (s.lookahead === 0) {
          break
        } /* flush the current block */
      }

    /* Insert the string window[strstart .. strstart+2] in the
     * dictionary, and set hash_head to the head of the hash chain:
     */
      hash_head = 0 /* NIL */
      if (s.lookahead >= MIN_MATCH) {
      /** * INSERT_STRING(s, s.strstart, hash_head); ***/
        s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask
        hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h]
        s.head[s.ins_h] = s.strstart
      /***/
      }

    /* Find the longest match, discarding those <= prev_length.
     */
      s.prev_length = s.match_length
      s.prev_match = s.match_start
      s.match_length = MIN_MATCH - 1

      if (hash_head !== 0 /* NIL */ && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD /* MAX_DIST(s) */) {
        /* To simplify the code, we prevent matches with the string
         * of window index 0 (in particular we have to avoid a match
         * of the string with itself at the start of the input file).
         */
        s.match_length = longest_match(s, hash_head)
        /* longest_match() sets match_start */

        if (s.match_length <= 5 && (s.strategy === Z_FILTERED$1 || s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096 /* TOO_FAR */)) {
          /* If prev_match is also MIN_MATCH, match_start is garbage
           * but we will ignore the current match anyway.
           */
          s.match_length = MIN_MATCH - 1
        }
      }
    /* If there was a match at the previous step and the current
     * match is not better, output the previous match:
     */
      if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
        max_insert = s.strstart + s.lookahead - MIN_MATCH
      /* Do not insert strings in hash table beyond this. */

      // check_match(s, s.strstart-1, s.prev_match, s.prev_length);

      /** *_tr_tally_dist(s, s.strstart - 1 - s.prev_match,
                     s.prev_length - MIN_MATCH, bflush);***/
        bflush = _tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH)
      /* Insert in hash table all strings up to the end of the match.
       * strstart-1 and strstart are already inserted. If there is not
       * enough lookahead, the last two strings are not inserted in
       * the hash table.
       */
        s.lookahead -= s.prev_length - 1
        s.prev_length -= 2
        do {
          if (++s.strstart <= max_insert) {
          /** * INSERT_STRING(s, s.strstart, hash_head); ***/
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask
            hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h]
            s.head[s.ins_h] = s.strstart
          /***/
          }
        } while (--s.prev_length !== 0)
        s.match_available = 0
        s.match_length = MIN_MATCH - 1
        s.strstart++

        if (bflush) {
        /** * FLUSH_BLOCK(s, 0); ***/
          flush_block_only(s, false)
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE
          }
        /***/
        }
      } else if (s.match_available) {
      /* If there was no match at the previous position, output a
       * single literal. If there was a match but the current match
       * is longer, truncate the previous match to a single literal.
       */
      // Tracevv((stderr,"%c", s->window[s->strstart-1]));
      /** * _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
        bflush = _tr_tally(s, 0, s.window[s.strstart - 1])

        if (bflush) {
        /** * FLUSH_BLOCK_ONLY(s, 0) ***/
          flush_block_only(s, false)
        /***/
        }
        s.strstart++
        s.lookahead--
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE
        }
      } else {
      /* There is no previous match to compare with, wait for
       * the next step to decide.
       */
        s.match_available = 1
        s.strstart++
        s.lookahead--
      }
    }
  // Assert (flush != Z_NO_FLUSH, "no flush?");
    if (s.match_available) {
    // Tracevv((stderr,"%c", s->window[s->strstart-1]));
    /** * _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
      bflush = _tr_tally(s, 0, s.window[s.strstart - 1])

      s.match_available = 0
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1
    if (flush === Z_FINISH$1) {
    /** * FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true)
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED
      }
    /***/
      return BS_FINISH_DONE
    }
    if (s.last_lit) {
    /** * FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false)
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE
      }
    /***/
    }

    return BS_BLOCK_DONE
  }

/* ===========================================================================
 * For Z_RLE, simply look for runs of bytes, generate matches only of distance
 * one.  Do not maintain a hash table.  (It will be regenerated if this run of
 * deflate switches away from Z_RLE.)
 */
  function deflate_rle (s, flush) {
    var bflush /* set if current block must be flushed */
    var prev /* byte at distance one to match */
    var scan, strend /* scan goes up to strend for length of run */

    var _win = s.window

    for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the longest run, plus one for the unrolled loop.
     */
      if (s.lookahead <= MAX_MATCH) {
        fill_window(s)
        if (s.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH$1) {
          return BS_NEED_MORE
        }
        if (s.lookahead === 0) {
          break
        } /* flush the current block */
      }

    /* See how many times the previous byte repeats */
      s.match_length = 0
      if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
        scan = s.strstart - 1
        prev = _win[scan]
        if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
          strend = s.strstart + MAX_MATCH
          do {
          /* jshint noempty:false */
          } while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend)
          s.match_length = MAX_MATCH - (strend - scan)
          if (s.match_length > s.lookahead) {
            s.match_length = s.lookahead
          }
        }
      // Assert(scan <= s->window+(uInt)(s->window_size-1), "wild scan");
      }

    /* Emit match if have run of MIN_MATCH or longer, else emit literal */
      if (s.match_length >= MIN_MATCH) {
      // check_match(s, s.strstart, s.strstart - 1, s.match_length);

      /** * _tr_tally_dist(s, 1, s.match_length - MIN_MATCH, bflush); ***/
        bflush = _tr_tally(s, 1, s.match_length - MIN_MATCH)

        s.lookahead -= s.match_length
        s.strstart += s.match_length
        s.match_length = 0
      } else {
      /* No match, output a literal byte */
      // Tracevv((stderr,"%c", s->window[s->strstart]));
      /** * _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
        bflush = _tr_tally(s, 0, s.window[s.strstart])

        s.lookahead--
        s.strstart++
      }
      if (bflush) {
      /** * FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false)
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE
        }
      /***/
      }
    }
    s.insert = 0
    if (flush === Z_FINISH$1) {
    /** * FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true)
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED
      }
    /***/
      return BS_FINISH_DONE
    }
    if (s.last_lit) {
    /** * FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false)
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE
      }
    /***/
    }
    return BS_BLOCK_DONE
  }

/* ===========================================================================
 * For Z_HUFFMAN_ONLY, do not look for matches.  Do not maintain a hash table.
 * (It will be regenerated if this run of deflate switches away from Huffman.)
 */
  function deflate_huff (s, flush) {
    var bflush /* set if current block must be flushed */

    for (;;) {
    /* Make sure that we have a literal to write. */
      if (s.lookahead === 0) {
        fill_window(s)
        if (s.lookahead === 0) {
          if (flush === Z_NO_FLUSH$1) {
            return BS_NEED_MORE
          }
          break /* flush the current block */
        }
      }

    /* Output a literal byte */
      s.match_length = 0
    // Tracevv((stderr,"%c", s->window[s->strstart]));
    /** * _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
      bflush = _tr_tally(s, 0, s.window[s.strstart])
      s.lookahead--
      s.strstart++
      if (bflush) {
      /** * FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false)
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE
        }
      /***/
      }
    }
    s.insert = 0
    if (flush === Z_FINISH$1) {
    /** * FLUSH_BLOCK(s, 1); ***/
      flush_block_only(s, true)
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED
      }
    /***/
      return BS_FINISH_DONE
    }
    if (s.last_lit) {
    /** * FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false)
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE
      }
    /***/
    }
    return BS_BLOCK_DONE
  }

/* Values for max_lazy_match, good_match and max_chain_length, depending on
 * the desired pack level (0..9). The values given below have been tuned to
 * exclude worst case performance for pathological files. Better values may be
 * found for specific files.
 */
  function Config (good_length, max_lazy, nice_length, max_chain, func) {
    this.good_length = good_length
    this.max_lazy = max_lazy
    this.nice_length = nice_length
    this.max_chain = max_chain
    this.func = func
  }

  var configuration_table

  configuration_table = [
/*      good lazy nice chain */
    new Config(0, 0, 0, 0, deflate_stored), /* 0 store only */
    new Config(4, 4, 8, 4, deflate_fast), /* 1 max speed, no lazy matches */
    new Config(4, 5, 16, 8, deflate_fast), /* 2 */
    new Config(4, 6, 32, 32, deflate_fast), /* 3 */

    new Config(4, 4, 16, 16, deflate_slow), /* 4 lazy matches */
    new Config(8, 16, 32, 32, deflate_slow), /* 5 */
    new Config(8, 16, 128, 128, deflate_slow), /* 6 */
    new Config(8, 32, 128, 256, deflate_slow), /* 7 */
    new Config(32, 128, 258, 1024, deflate_slow), /* 8 */
    new Config(32, 258, 258, 4096, deflate_slow) /* 9 max compression */
  ]

/* ===========================================================================
 * Initialize the "longest match" routines for a new zlib stream
 */
  function lm_init (s) {
    s.window_size = 2 * s.w_size

  /** * CLEAR_HASH(s); ***/
    zero(s.head) // Fill with NIL (= 0);

  /* Set the default configuration parameters:
   */
    s.max_lazy_match = configuration_table[s.level].max_lazy
    s.good_match = configuration_table[s.level].good_length
    s.nice_match = configuration_table[s.level].nice_length
    s.max_chain_length = configuration_table[s.level].max_chain

    s.strstart = 0
    s.block_start = 0
    s.lookahead = 0
    s.insert = 0
    s.match_length = s.prev_length = MIN_MATCH - 1
    s.match_available = 0
    s.ins_h = 0
  }

  function DeflateState () {
    this.strm = null /* pointer back to this zlib stream */
    this.status = 0 /* as the name implies */
    this.pending_buf = null /* output still pending */
    this.pending_buf_size = 0 /* size of pending_buf */
    this.pending_out = 0 /* next pending byte to output to the stream */
    this.pending = 0 /* nb of bytes in the pending buffer */
    this.wrap = 0 /* bit 0 true for zlib, bit 1 true for gzip */
    this.gzhead = null /* gzip header information to write */
    this.gzindex = 0 /* where in extra, name, or comment */
    this.method = Z_DEFLATED$1 /* can only be DEFLATED */
    this.last_flush = -1 /* value of flush param for previous deflate call */

    this.w_size = 0 /* LZ77 window size (32K by default) */
    this.w_bits = 0 /* log2(w_size)  (8..16) */
    this.w_mask = 0 /* w_size - 1 */

    this.window = null
  /* Sliding window. Input bytes are read into the second half of the window,
   * and move to the first half later to keep a dictionary of at least wSize
   * bytes. With this organization, matches are limited to a distance of
   * wSize-MAX_MATCH bytes, but this ensures that IO is always
   * performed with a length multiple of the block size.
   */

    this.window_size = 0
  /* Actual size of window: 2*wSize, except when the user input buffer
   * is directly used as sliding window.
   */

    this.prev = null
  /* Link to older string with same hash index. To limit the size of this
   * array to 64K, this link is maintained only for the last 32K strings.
   * An index in this array is thus a window index modulo 32K.
   */

    this.head = null /* Heads of the hash chains or NIL. */

    this.ins_h = 0 /* hash index of string to be inserted */
    this.hash_size = 0 /* number of elements in hash table */
    this.hash_bits = 0 /* log2(hash_size) */
    this.hash_mask = 0 /* hash_size-1 */

    this.hash_shift = 0
  /* Number of bits by which ins_h must be shifted at each input
   * step. It must be such that after MIN_MATCH steps, the oldest
   * byte no longer takes part in the hash key, that is:
   *   hash_shift * MIN_MATCH >= hash_bits
   */

    this.block_start = 0
  /* Window position at the beginning of the current output block. Gets
   * negative when the window is moved backwards.
   */

    this.match_length = 0 /* length of best match */
    this.prev_match = 0 /* previous match */
    this.match_available = 0 /* set if previous match exists */
    this.strstart = 0 /* start of string to insert */
    this.match_start = 0 /* start of matching string */
    this.lookahead = 0 /* number of valid bytes ahead in window */

    this.prev_length = 0
  /* Length of the best match at previous step. Matches not greater than this
   * are discarded. This is used in the lazy match evaluation.
   */

    this.max_chain_length = 0
  /* To speed up deflation, hash chains are never searched beyond this
   * length.  A higher limit improves compression ratio but degrades the
   * speed.
   */

    this.max_lazy_match = 0
  /* Attempt to find a better match only when the current match is strictly
   * smaller than this value. This mechanism is used only for compression
   * levels >= 4.
   */
  // That's alias to max_lazy_match, don't use directly
  // this.max_insert_length = 0;
  /* Insert new strings in the hash table only if the match length is not
   * greater than this length. This saves time but degrades compression.
   * max_insert_length is used only for compression levels <= 3.
   */

    this.level = 0 /* compression level (1..9) */
    this.strategy = 0 /* favor or force Huffman coding */

    this.good_match = 0
  /* Use a faster search when the previous match is longer than this */

    this.nice_match = 0 /* Stop searching when current match exceeds this */

  /* used by c: */

  /* Didn't use ct_data typedef below to suppress compiler warning */

  // struct ct_data_s dyn_ltree[HEAP_SIZE];   /* literal and length tree */
  // struct ct_data_s dyn_dtree[2*D_CODES+1]; /* distance tree */
  // struct ct_data_s bl_tree[2*BL_CODES+1];  /* Huffman tree for bit lengths */

  // Use flat array of DOUBLE size, with interleaved fata,
  // because JS does not support effective
    this.dyn_ltree = new Buf16(HEAP_SIZE * 2)
    this.dyn_dtree = new Buf16((2 * D_CODES + 1) * 2)
    this.bl_tree = new Buf16((2 * BL_CODES + 1) * 2)
    zero(this.dyn_ltree)
    zero(this.dyn_dtree)
    zero(this.bl_tree)

    this.l_desc = null /* desc. for literal tree */
    this.d_desc = null /* desc. for distance tree */
    this.bl_desc = null /* desc. for bit length tree */

  // ush bl_count[MAX_BITS+1];
    this.bl_count = new Buf16(MAX_BITS + 1)
  /* number of codes at each bit length for an optimal tree */

  // int heap[2*L_CODES+1];      /* heap used to build the Huffman trees */
    this.heap = new Buf16(2 * L_CODES + 1) /* heap used to build the Huffman trees */
    zero(this.heap)

    this.heap_len = 0 /* number of elements in the heap */
    this.heap_max = 0 /* element of largest frequency */
  /* The sons of heap[n] are heap[2*n] and heap[2*n+1]. heap[0] is not used.
   * The same heap array is used to build all
   */

    this.depth = new Buf16(2 * L_CODES + 1) // uch depth[2*L_CODES+1];
    zero(this.depth)
  /* Depth of each subtree used as tie breaker for trees of equal frequency
   */

    this.l_buf = 0 /* buffer index for literals or lengths */

    this.lit_bufsize = 0
  /* Size of match buffer for literals/lengths.  There are 4 reasons for
   * limiting lit_bufsize to 64K:
   *   - frequencies can be kept in 16 bit counters
   *   - if compression is not successful for the first block, all input
   *     data is still in the window so we can still emit a stored block even
   *     when input comes from standard input.  (This can also be done for
   *     all blocks if lit_bufsize is not greater than 32K.)
   *   - if compression is not successful for a file smaller than 64K, we can
   *     even emit a stored file instead of a stored block (saving 5 bytes).
   *     This is applicable only for zip (not gzip or zlib).
   *   - creating new Huffman trees less frequently may not provide fast
   *     adaptation to changes in the input data statistics. (Take for
   *     example a binary file with poorly compressible code followed by
   *     a highly compressible string table.) Smaller buffer sizes give
   *     fast adaptation but have of course the overhead of transmitting
   *     trees more frequently.
   *   - I can't count above 4
   */

    this.last_lit = 0 /* running index in l_buf */

    this.d_buf = 0
  /* Buffer index for distances. To simplify the code, d_buf and l_buf have
   * the same number of elements. To use different lengths, an extra flag
   * array would be necessary.
   */

    this.opt_len = 0 /* bit length of current block with optimal trees */
    this.static_len = 0 /* bit length of current block with static trees */
    this.matches = 0 /* number of string matches in current block */
    this.insert = 0 /* bytes at end of window left to insert */

    this.bi_buf = 0
  /* Output buffer. bits are inserted starting at the bottom (least
   * significant bits).
   */
    this.bi_valid = 0
  /* Number of valid bits in bi_buf.  All bits above the last valid bit
   * are always zero.
   */

  // Used for window memory init. We safely ignore it for JS. That makes
  // sense only for pointers and memory check tools.
  // this.high_water = 0;
  /* High water mark offset in window for initialized bytes -- bytes above
   * this are set to zero in order to avoid memory check warnings when
   * longest match routines access bytes past the input.  This is then
   * updated to the new high water mark.
   */
  }

  function deflateResetKeep (strm) {
    var s

    if (!strm || !strm.state) {
      return err(strm, Z_STREAM_ERROR$1)
    }

    strm.total_in = strm.total_out = 0
    strm.data_type = Z_UNKNOWN$1

    s = strm.state
    s.pending = 0
    s.pending_out = 0

    if (s.wrap < 0) {
      s.wrap = -s.wrap
    /* was made negative by deflate(..., Z_FINISH); */
    }
    s.status = s.wrap ? INIT_STATE : BUSY_STATE
    strm.adler = s.wrap === 2 ? 0 // crc32(0, Z_NULL, 0)
  : 1 // adler32(0, Z_NULL, 0)
    s.last_flush = Z_NO_FLUSH$1
    _tr_init(s)
    return Z_OK$1
  }

  function deflateReset (strm) {
    var ret = deflateResetKeep(strm)
    if (ret === Z_OK$1) {
      lm_init(strm.state)
    }
    return ret
  }

  function deflateInit2 (strm, level, method, windowBits, memLevel, strategy) {
    if (!strm) {
    // === Z_NULL
      return Z_STREAM_ERROR$1
    }
    var wrap = 1

    if (level === Z_DEFAULT_COMPRESSION$1) {
      level = 6
    }

    if (windowBits < 0) {
    /* suppress zlib wrapper */
      wrap = 0
      windowBits = -windowBits
    } else if (windowBits > 15) {
      wrap = 2 /* write gzip wrapper instead */
      windowBits -= 16
    }

    if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED$1 || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED$1) {
      return err(strm, Z_STREAM_ERROR$1)
    }

    if (windowBits === 8) {
      windowBits = 9
    }
  /* until 256-byte window bug fixed */

    var s = new DeflateState()

    strm.state = s
    s.strm = strm

    s.wrap = wrap
    s.gzhead = null
    s.w_bits = windowBits
    s.w_size = 1 << s.w_bits
    s.w_mask = s.w_size - 1

    s.hash_bits = memLevel + 7
    s.hash_size = 1 << s.hash_bits
    s.hash_mask = s.hash_size - 1
    s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH)

    s.window = new Buf8(s.w_size * 2)
    s.head = new Buf16(s.hash_size)
    s.prev = new Buf16(s.w_size)

  // Don't need mem init magic for JS.
  // s.high_water = 0;  /* nothing written to s->window yet */

    s.lit_bufsize = 1 << memLevel + 6 /* 16K elements by default */

    s.pending_buf_size = s.lit_bufsize * 4

  // overlay = (ushf *) ZALLOC(strm, s->lit_bufsize, sizeof(ush)+2);
  // s->pending_buf = (uchf *) overlay;
    s.pending_buf = new Buf8(s.pending_buf_size)

  // It is offset from `s.pending_buf` (size is `s.lit_bufsize * 2`)
  // s->d_buf = overlay + s->lit_bufsize/sizeof(ush);
    s.d_buf = 1 * s.lit_bufsize

  // s->l_buf = s->pending_buf + (1+sizeof(ush))*s->lit_bufsize;
    s.l_buf = (1 + 2) * s.lit_bufsize

    s.level = level
    s.strategy = strategy
    s.method = method

    return deflateReset(strm)
  }

  function deflate$1 (strm, flush) {
    var old_flush, s
    var beg, val // for gzip header write only

    if (!strm || !strm.state || flush > Z_BLOCK$1 || flush < 0) {
      return strm ? err(strm, Z_STREAM_ERROR$1) : Z_STREAM_ERROR$1
    }

    s = strm.state

    if (!strm.output || !strm.input && strm.avail_in !== 0 || s.status === FINISH_STATE && flush !== Z_FINISH$1) {
      return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR$1 : Z_STREAM_ERROR$1)
    }

    s.strm = strm /* just in case */
    old_flush = s.last_flush
    s.last_flush = flush

  /* Write the header */
    if (s.status === INIT_STATE) {
      if (s.wrap === 2) {
      // GZIP header
        strm.adler = 0 // crc32(0L, Z_NULL, 0);
        put_byte(s, 31)
        put_byte(s, 139)
        put_byte(s, 8)
        if (!s.gzhead) {
        // s->gzhead == Z_NULL
          put_byte(s, 0)
          put_byte(s, 0)
          put_byte(s, 0)
          put_byte(s, 0)
          put_byte(s, 0)
          put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY$1 || s.level < 2 ? 4 : 0)
          put_byte(s, OS_CODE)
          s.status = BUSY_STATE
        } else {
          put_byte(s, (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16))
          put_byte(s, s.gzhead.time & 0xff)
          put_byte(s, s.gzhead.time >> 8 & 0xff)
          put_byte(s, s.gzhead.time >> 16 & 0xff)
          put_byte(s, s.gzhead.time >> 24 & 0xff)
          put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY$1 || s.level < 2 ? 4 : 0)
          put_byte(s, s.gzhead.os & 0xff)
          if (s.gzhead.extra && s.gzhead.extra.length) {
            put_byte(s, s.gzhead.extra.length & 0xff)
            put_byte(s, s.gzhead.extra.length >> 8 & 0xff)
          }
          if (s.gzhead.hcrc) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending, 0)
          }
          s.gzindex = 0
          s.status = EXTRA_STATE
        }
      } else // DEFLATE header
      {
        var header = Z_DEFLATED$1 + (s.w_bits - 8 << 4) << 8
        var level_flags = -1

        if (s.strategy >= Z_HUFFMAN_ONLY$1 || s.level < 2) {
          level_flags = 0
        } else if (s.level < 6) {
          level_flags = 1
        } else if (s.level === 6) {
          level_flags = 2
        } else {
          level_flags = 3
        }
        header |= level_flags << 6
        if (s.strstart !== 0) {
          header |= PRESET_DICT
        }
        header += 31 - header % 31

        s.status = BUSY_STATE
        putShortMSB(s, header)

        /* Save the adler32 of the preset dictionary: */
        if (s.strstart !== 0) {
          putShortMSB(s, strm.adler >>> 16)
          putShortMSB(s, strm.adler & 0xffff)
        }
        strm.adler = 1 // adler32(0L, Z_NULL, 0);
      }
    }

  // #ifdef GZIP
    if (s.status === EXTRA_STATE) {
      if (s.gzhead.extra /* != Z_NULL */) {
        beg = s.pending /* start of bytes to update crc */

        while (s.gzindex < (s.gzhead.extra.length & 0xffff)) {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) {
              strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg)
            }
            flush_pending(strm)
            beg = s.pending
            if (s.pending === s.pending_buf_size) {
              break
            }
          }
          put_byte(s, s.gzhead.extra[s.gzindex] & 0xff)
          s.gzindex++
        }
        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg)
        }
        if (s.gzindex === s.gzhead.extra.length) {
          s.gzindex = 0
          s.status = NAME_STATE
        }
      } else {
        s.status = NAME_STATE
      }
    }
    if (s.status === NAME_STATE) {
      if (s.gzhead.name /* != Z_NULL */) {
        beg = s.pending /* start of bytes to update crc */
        // int val;

        do {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) {
              strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg)
            }
            flush_pending(strm)
            beg = s.pending
            if (s.pending === s.pending_buf_size) {
              val = 1
              break
            }
          }
          // JS specific: little magic to add zero terminator to end of string
          if (s.gzindex < s.gzhead.name.length) {
            val = s.gzhead.name.charCodeAt(s.gzindex++) & 0xff
          } else {
            val = 0
          }
          put_byte(s, val)
        } while (val !== 0)

        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg)
        }
        if (val === 0) {
          s.gzindex = 0
          s.status = COMMENT_STATE
        }
      } else {
        s.status = COMMENT_STATE
      }
    }
    if (s.status === COMMENT_STATE) {
      if (s.gzhead.comment /* != Z_NULL */) {
        beg = s.pending /* start of bytes to update crc */
        // int val;

        do {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) {
              strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg)
            }
            flush_pending(strm)
            beg = s.pending
            if (s.pending === s.pending_buf_size) {
              val = 1
              break
            }
          }
          // JS specific: little magic to add zero terminator to end of string
          if (s.gzindex < s.gzhead.comment.length) {
            val = s.gzhead.comment.charCodeAt(s.gzindex++) & 0xff
          } else {
            val = 0
          }
          put_byte(s, val)
        } while (val !== 0)

        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg)
        }
        if (val === 0) {
          s.status = HCRC_STATE
        }
      } else {
        s.status = HCRC_STATE
      }
    }
    if (s.status === HCRC_STATE) {
      if (s.gzhead.hcrc) {
        if (s.pending + 2 > s.pending_buf_size) {
          flush_pending(strm)
        }
        if (s.pending + 2 <= s.pending_buf_size) {
          put_byte(s, strm.adler & 0xff)
          put_byte(s, strm.adler >> 8 & 0xff)
          strm.adler = 0 // crc32(0L, Z_NULL, 0);
          s.status = BUSY_STATE
        }
      } else {
        s.status = BUSY_STATE
      }
    }
  // #endif

  /* Flush as much pending output as possible */
    if (s.pending !== 0) {
      flush_pending(strm)
      if (strm.avail_out === 0) {
      /* Since avail_out is 0, deflate will be called again with
       * more output space, but possibly with both pending and
       * avail_in equal to zero. There won't be anything to do,
       * but this is not an error situation so make sure we
       * return OK instead of BUF_ERROR at next call of deflate:
       */
        s.last_flush = -1
        return Z_OK$1
      }

    /* Make sure there is something to do and avoid duplicate consecutive
     * flushes. For repeated and useless calls with Z_FINISH, we keep
     * returning Z_STREAM_END instead of Z_BUF_ERROR.
     */
    } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== Z_FINISH$1) {
      return err(strm, Z_BUF_ERROR$1)
    }

  /* User must not provide more input after the first FINISH: */
    if (s.status === FINISH_STATE && strm.avail_in !== 0) {
      return err(strm, Z_BUF_ERROR$1)
    }

  /* Start a new block or continue the current one.
   */
    if (strm.avail_in !== 0 || s.lookahead !== 0 || flush !== Z_NO_FLUSH$1 && s.status !== FINISH_STATE) {
      var bstate = s.strategy === Z_HUFFMAN_ONLY$1 ? deflate_huff(s, flush) : s.strategy === Z_RLE$1 ? deflate_rle(s, flush) : configuration_table[s.level].func(s, flush)

      if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
        s.status = FINISH_STATE
      }
      if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
        if (strm.avail_out === 0) {
          s.last_flush = -1
        /* avoid BUF_ERROR next call, see above */
        }
        return Z_OK$1
      /* If flush != Z_NO_FLUSH && avail_out == 0, the next call
       * of deflate should use the same flush parameter to make sure
       * that the flush is complete. So we don't have to output an
       * empty block here, this will be done at next call. This also
       * ensures that for a very small output buffer, we emit at most
       * one empty block.
       */
      }
      if (bstate === BS_BLOCK_DONE) {
        if (flush === Z_PARTIAL_FLUSH$1) {
          _tr_align(s)
        } else if (flush !== Z_BLOCK$1) {
        /* FULL_FLUSH or SYNC_FLUSH */

          _tr_stored_block(s, 0, 0, false)
        /* For a full flush, this empty block will be recognized
         * as a special marker by inflate_sync().
         */
          if (flush === Z_FULL_FLUSH$1) {
          /** * CLEAR_HASH(s); ***/
          /* forget history */
            zero(s.head) // Fill with NIL (= 0);

            if (s.lookahead === 0) {
              s.strstart = 0
              s.block_start = 0
              s.insert = 0
            }
          }
        }
        flush_pending(strm)
        if (strm.avail_out === 0) {
          s.last_flush = -1 /* avoid BUF_ERROR at next call, see above */
          return Z_OK$1
        }
      }
    }
  // Assert(strm->avail_out > 0, "bug2");
  // if (strm.avail_out <= 0) { throw new Error("bug2");}

    if (flush !== Z_FINISH$1) {
      return Z_OK$1
    }
    if (s.wrap <= 0) {
      return Z_STREAM_END$1
    }

  /* Write the trailer */
    if (s.wrap === 2) {
      put_byte(s, strm.adler & 0xff)
      put_byte(s, strm.adler >> 8 & 0xff)
      put_byte(s, strm.adler >> 16 & 0xff)
      put_byte(s, strm.adler >> 24 & 0xff)
      put_byte(s, strm.total_in & 0xff)
      put_byte(s, strm.total_in >> 8 & 0xff)
      put_byte(s, strm.total_in >> 16 & 0xff)
      put_byte(s, strm.total_in >> 24 & 0xff)
    } else {
      putShortMSB(s, strm.adler >>> 16)
      putShortMSB(s, strm.adler & 0xffff)
    }

    flush_pending(strm)
  /* If avail_out is zero, the application will call deflate again
   * to flush the rest.
   */
    if (s.wrap > 0) {
      s.wrap = -s.wrap
    }
  /* write the trailer only once! */
    return s.pending !== 0 ? Z_OK$1 : Z_STREAM_END$1
  }

  function deflateEnd (strm) {
    var status

    if (!strm /* == Z_NULL */ || !strm.state /* == Z_NULL */) {
      return Z_STREAM_ERROR$1
    }

    status = strm.state.status
    if (status !== INIT_STATE && status !== EXTRA_STATE && status !== NAME_STATE && status !== COMMENT_STATE && status !== HCRC_STATE && status !== BUSY_STATE && status !== FINISH_STATE) {
      return err(strm, Z_STREAM_ERROR$1)
    }

    strm.state = null

    return status === BUSY_STATE ? err(strm, Z_DATA_ERROR$1) : Z_OK$1
  }

/* =========================================================================
 * Initializes the compression dictionary from the given byte
 * sequence without producing any compressed output.
 */

/* Not implemented
exports.deflateBound = deflateBound;
exports.deflateCopy = deflateCopy;
exports.deflateParams = deflateParams;
exports.deflatePending = deflatePending;
exports.deflatePrime = deflatePrime;
exports.deflateTune = deflateTune;
*/

// See state defs from inflate.js
  var BAD$1 = 30 /* got a data error -- remain here until reset */
  var TYPE$1 = 12 /* i: waiting for type bits, including last-flag bit */

/*
   Decode literal, length, and distance codes and write out the resulting
   literal and match bytes until either not enough input or output is
   available, an end-of-block is encountered, or a data error is encountered.
   When large enough input and output buffers are supplied to inflate(), for
   example, a 16K input buffer and a 64K output buffer, more than 95% of the
   inflate execution time is spent in this routine.

   Entry assumptions:

        state.mode === LEN
        strm.avail_in >= 6
        strm.avail_out >= 258
        start >= strm.avail_out
        state.bits < 8

   On return, state.mode is one of:

        LEN -- ran out of enough output space or enough available input
        TYPE -- reached end of block code, inflate() to interpret next block
        BAD -- error in block data

   Notes:

    - The maximum input bits used by a length/distance pair is 15 bits for the
      length code, 5 bits for the length extra, 15 bits for the distance code,
      and 13 bits for the distance extra.  This totals 48 bits, or six bytes.
      Therefore if strm.avail_in >= 6, then there is enough input to avoid
      checking for available input while decoding.

    - The maximum bytes that a single length/distance pair can output is 258
      bytes, which is the maximum length that can be coded.  inflate_fast()
      requires strm.avail_out >= 258 for each loop to avoid checking for
      output space.
 */
  function inflate_fast (strm, start) {
    var state
    var _in /* local strm.input */
    var last /* have enough input while in < last */
    var _out /* local strm.output */
    var beg /* inflate()'s initial strm.output */
    var end /* while out < end, enough space available */
  // #ifdef INFLATE_STRICT
    var dmax /* maximum distance from zlib header */
  // #endif
    var wsize /* window size or zero if not using window */
    var whave /* valid bytes in the window */
    var wnext /* window write index */
  // Use `s_window` instead `window`, avoid conflict with instrumentation tools
    var s_window /* allocated sliding window, if wsize != 0 */
    var hold /* local strm.hold */
    var bits /* local strm.bits */
    var lcode /* local strm.lencode */
    var dcode /* local strm.distcode */
    var lmask /* mask for first level of length codes */
    var dmask /* mask for first level of distance codes */
    var here /* retrieved table entry */
    var op /* code bits, operation, extra bits, or */
  /*  window position, window bytes to copy */
    var len /* match length, unused bytes */
    var dist /* match distance */
    var from /* where to copy match from */
    var from_source

    var input, output // JS specific, because we have no pointers

  /* copy state to local variables */
    state = strm.state
  // here = state.here;
    _in = strm.next_in
    input = strm.input
    last = _in + (strm.avail_in - 5)
    _out = strm.next_out
    output = strm.output
    beg = _out - (start - strm.avail_out)
    end = _out + (strm.avail_out - 257)
  // #ifdef INFLATE_STRICT
    dmax = state.dmax
  // #endif
    wsize = state.wsize
    whave = state.whave
    wnext = state.wnext
    s_window = state.window
    hold = state.hold
    bits = state.bits
    lcode = state.lencode
    dcode = state.distcode
    lmask = (1 << state.lenbits) - 1
    dmask = (1 << state.distbits) - 1

  /* decode literals and length/distances until end-of-block or not enough
     input data or output space */

    top: do {
      if (bits < 15) {
        hold += input[_in++] << bits
        bits += 8
        hold += input[_in++] << bits
        bits += 8
      }

      here = lcode[hold & lmask]

      dolen: for (;;) {
      // Goto emulation
        op = here >>> 24 /* here.bits */
        hold >>>= op
        bits -= op
        op = here >>> 16 & 0xff /* here.op */
        if (op === 0) {
        /* literal */
        // Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
        //        "inflate:         literal '%c'\n" :
        //        "inflate:         literal 0x%02x\n", here.val));
          output[_out++] = here & 0xffff /* here.val */
        } else if (op & 16) {
        /* length base */
          len = here & 0xffff /* here.val */
          op &= 15 /* number of extra bits */
          if (op) {
            if (bits < op) {
              hold += input[_in++] << bits
              bits += 8
            }
            len += hold & (1 << op) - 1
            hold >>>= op
            bits -= op
          }
        // Tracevv((stderr, "inflate:         length %u\n", len));
          if (bits < 15) {
            hold += input[_in++] << bits
            bits += 8
            hold += input[_in++] << bits
            bits += 8
          }
          here = dcode[hold & dmask]

          dodist: for (;;) {
          // goto emulation
            op = here >>> 24 /* here.bits */
            hold >>>= op
            bits -= op
            op = here >>> 16 & 0xff /* here.op */

            if (op & 16) {
            /* distance base */
              dist = here & 0xffff /* here.val */
              op &= 15 /* number of extra bits */
              if (bits < op) {
                hold += input[_in++] << bits
                bits += 8
                if (bits < op) {
                  hold += input[_in++] << bits
                  bits += 8
                }
              }
              dist += hold & (1 << op) - 1
            // #ifdef INFLATE_STRICT
              if (dist > dmax) {
                strm.msg = 'invalid distance too far back'
                state.mode = BAD$1
                break top
              }
            // #endif
              hold >>>= op
              bits -= op
            // Tracevv((stderr, "inflate:         distance %u\n", dist));
              op = _out - beg /* max distance in output */
              if (dist > op) {
              /* see if copy from window */
                op = dist - op /* distance back in window */
                if (op > whave) {
                  if (state.sane) {
                    strm.msg = 'invalid distance too far back'
                    state.mode = BAD$1
                    break top
                  }

                // (!) This block is disabled in zlib defailts,
                // don't enable it for binary compatibility
                // #ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
                //                if (len <= op - whave) {
                //                  do {
                //                    output[_out++] = 0;
                //                  } while (--len);
                //                  continue top;
                //                }
                //                len -= op - whave;
                //                do {
                //                  output[_out++] = 0;
                //                } while (--op > whave);
                //                if (op === 0) {
                //                  from = _out - dist;
                //                  do {
                //                    output[_out++] = output[from++];
                //                  } while (--len);
                //                  continue top;
                //                }
                // #endif
                }
                from = 0 // window index
                from_source = s_window
                if (wnext === 0) {
                /* very common case */
                  from += wsize - op
                  if (op < len) {
                  /* some from window */
                    len -= op
                    do {
                      output[_out++] = s_window[from++]
                    } while (--op)
                    from = _out - dist /* rest from output */
                    from_source = output
                  }
                } else if (wnext < op) {
                /* wrap around window */
                  from += wsize + wnext - op
                  op -= wnext
                  if (op < len) {
                  /* some from end of window */
                    len -= op
                    do {
                      output[_out++] = s_window[from++]
                    } while (--op)
                    from = 0
                    if (wnext < len) {
                    /* some from start of window */
                      op = wnext
                      len -= op
                      do {
                        output[_out++] = s_window[from++]
                      } while (--op)
                      from = _out - dist /* rest from output */
                      from_source = output
                    }
                  }
                } else {
                /* contiguous in window */
                  from += wnext - op
                  if (op < len) {
                  /* some from window */
                    len -= op
                    do {
                      output[_out++] = s_window[from++]
                    } while (--op)
                    from = _out - dist /* rest from output */
                    from_source = output
                  }
                }
                while (len > 2) {
                  output[_out++] = from_source[from++]
                  output[_out++] = from_source[from++]
                  output[_out++] = from_source[from++]
                  len -= 3
                }
                if (len) {
                  output[_out++] = from_source[from++]
                  if (len > 1) {
                    output[_out++] = from_source[from++]
                  }
                }
              } else {
                from = _out - dist /* copy direct from output */
                do {
                /* minimum length is three */
                  output[_out++] = output[from++]
                  output[_out++] = output[from++]
                  output[_out++] = output[from++]
                  len -= 3
                } while (len > 2)
                if (len) {
                  output[_out++] = output[from++]
                  if (len > 1) {
                    output[_out++] = output[from++]
                  }
                }
              }
            } else if ((op & 64) === 0) {
            /* 2nd level distance code */
              here = dcode[(here & 0xffff) + (/* here.val */hold & (1 << op) - 1)]
              continue dodist
            } else {
              strm.msg = 'invalid distance code'
              state.mode = BAD$1
              break top
            }

            break // need to emulate goto via "continue"
          }
        } else if ((op & 64) === 0) {
        /* 2nd level length code */
          here = lcode[(here & 0xffff) + (/* here.val */hold & (1 << op) - 1)]
          continue dolen
        } else if (op & 32) {
        /* end-of-block */
        // Tracevv((stderr, "inflate:         end of block\n"));
          state.mode = TYPE$1
          break top
        } else {
          strm.msg = 'invalid literal/length code'
          state.mode = BAD$1
          break top
        }

        break // need to emulate goto via "continue"
      }
    } while (_in < last && _out < end)

  /* return unused bytes (on entry, bits < 8, so in won't go too far back) */
    len = bits >> 3
    _in -= len
    bits -= len << 3
    hold &= (1 << bits) - 1

  /* update state and return */
    strm.next_in = _in
    strm.next_out = _out
    strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last)
    strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end)
    state.hold = hold
    state.bits = bits
  }

  var MAXBITS = 15
  var ENOUGH_LENS$1 = 852
  var ENOUGH_DISTS$1 = 592
// var ENOUGH = (ENOUGH_LENS+ENOUGH_DISTS);

  var CODES$1 = 0
  var LENS$1 = 1
  var DISTS$1 = 2

  var lbase = [/* Length codes 257..285 base */
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0]

  var lext = [/* Length codes 257..285 extra */
    16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78]

  var dbase = [/* Distance codes 0..29 base */
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0]

  var dext = [/* Distance codes 0..29 extra */
    16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64]

  function inflate_table (type, lens, lens_index, codes, table, table_index, work, opts) {
    var bits = opts.bits
  // here = opts.here; /* table entry for duplication */

    var len = 0 /* a code's length in bits */
    var sym = 0 /* index of code symbols */
    var min = 0,
      max = 0 /* minimum and maximum code lengths */
    var root = 0 /* number of index bits for root table */
    var curr = 0 /* number of index bits for current table */
    var drop = 0 /* code bits to drop for sub-table */
    var left = 0 /* number of prefix codes available */
    var used = 0 /* code entries in table used */
    var huff = 0 /* Huffman code */
    var incr /* for incrementing code, index */
    var fill /* index for replicating entries */
    var low /* low bits for current root entry */
    var mask /* mask for low root bits */
    var next /* next available space in table */
    var base = null /* base value table to use */
    var base_index = 0
  //  var shoextra;    /* extra bits table to use */
    var end /* use base and extra for symbol > end */
    var count = new Buf16(MAXBITS + 1) // [MAXBITS+1];    /* number of codes of each length */
    var offs = new Buf16(MAXBITS + 1) // [MAXBITS+1];     /* offsets in table for each length */
    var extra = null
    var extra_index = 0

    var here_bits, here_op, here_val

  /*
   Process a set of code lengths to create a canonical Huffman code.  The
   code lengths are lens[0..codes-1].  Each length corresponds to the
   symbols 0..codes-1.  The Huffman code is generated by first sorting the
   symbols by length from short to long, and retaining the symbol order
   for codes with equal lengths.  Then the code starts with all zero bits
   for the first code of the shortest length, and the codes are integer
   increments for the same length, and zeros are appended as the length
   increases.  For the deflate format, these bits are stored backwards
   from their more natural integer increment ordering, and so when the
   decoding tables are built in the large loop below, the integer codes
   are incremented backwards.
    This routine assumes, but does not check, that all of the entries in
   lens[] are in the range 0..MAXBITS.  The caller must assure this.
   1..MAXBITS is interpreted as that code length.  zero means that that
   symbol does not occur in this code.
    The codes are sorted by computing a count of codes for each length,
   creating from that a table of starting indices for each length in the
   sorted table, and then entering the symbols in order in the sorted
   table.  The sorted table is work[], with that space being provided by
   the caller.
    The length counts are used for other purposes as well, i.e. finding
   the minimum and maximum length codes, determining if there are any
   codes at all, checking for a valid set of lengths, and looking ahead
   at length counts to determine sub-table sizes when building the
   decoding tables.
   */

  /* accumulate lengths for codes (assumes lens[] all in 0..MAXBITS) */
    for (len = 0; len <= MAXBITS; len++) {
      count[len] = 0
    }
    for (sym = 0; sym < codes; sym++) {
      count[lens[lens_index + sym]]++
    }

  /* bound code lengths, force root to be within code lengths */
    root = bits
    for (max = MAXBITS; max >= 1; max--) {
      if (count[max] !== 0) {
        break
      }
    }
    if (root > max) {
      root = max
    }
    if (max === 0) {
    /* no symbols to code at all */
    // table.op[opts.table_index] = 64;  //here.op = (var char)64;    /* invalid code marker */
    // table.bits[opts.table_index] = 1;   //here.bits = (var char)1;
    // table.val[opts.table_index++] = 0;   //here.val = (var short)0;
      table[table_index++] = 1 << 24 | 64 << 16 | 0

    // table.op[opts.table_index] = 64;
    // table.bits[opts.table_index] = 1;
    // table.val[opts.table_index++] = 0;
      table[table_index++] = 1 << 24 | 64 << 16 | 0

      opts.bits = 1
      return 0 /* no symbols, but wait for decoding to report error */
    }
    for (min = 1; min < max; min++) {
      if (count[min] !== 0) {
        break
      }
    }
    if (root < min) {
      root = min
    }

  /* check for an over-subscribed or incomplete set of lengths */
    left = 1
    for (len = 1; len <= MAXBITS; len++) {
      left <<= 1
      left -= count[len]
      if (left < 0) {
        return -1
      } /* over-subscribed */
    }
    if (left > 0 && (type === CODES$1 || max !== 1)) {
      return -1 /* incomplete set */
    }

  /* generate offsets into symbol table for each length for sorting */
    offs[1] = 0
    for (len = 1; len < MAXBITS; len++) {
      offs[len + 1] = offs[len] + count[len]
    }

  /* sort symbols by length, by symbol order within each length */
    for (sym = 0; sym < codes; sym++) {
      if (lens[lens_index + sym] !== 0) {
        work[offs[lens[lens_index + sym]]++] = sym
      }
    }

  /*
   Create and fill in decoding tables.  In this loop, the table being
   filled is at next and has curr index bits.  The code being used is huff
   with length len.  That code is converted to an index by dropping drop
   bits off of the bottom.  For codes where len is less than drop + curr,
   those top drop + curr - len bits are incremented through all values to
   fill the table with replicated entries.
    root is the number of index bits for the root table.  When len exceeds
   root, sub-tables are created pointed to by the root entry with an index
   of the low root bits of huff.  This is saved in low to check for when a
   new sub-table should be started.  drop is zero when the root table is
   being filled, and drop is root when sub-tables are being filled.
    When a new sub-table is needed, it is necessary to look ahead in the
   code lengths to determine what size sub-table is needed.  The length
   counts are used for this, and so count[] is decremented as codes are
   entered in the tables.
    used keeps track of how many table entries have been allocated from the
   provided *table space.  It is checked for LENS and DIST tables against
   the constants ENOUGH_LENS and ENOUGH_DISTS to guard against changes in
   the initial root table size constants.  See the comments in inftrees.h
   for more information.
    sym increments through all symbols, and the loop terminates when
   all codes of length max, i.e. all codes, have been processed.  This
   routine permits incomplete codes, so another loop after this one fills
   in the rest of the decoding tables with invalid code markers.
   */

  /* set up for code type */
  // poor man optimization - use if-else instead of switch,
  // to avoid deopts in old v8
    if (type === CODES$1) {
      base = extra = work /* dummy value--not used */
      end = 19
    } else if (type === LENS$1) {
      base = lbase
      base_index -= 257
      extra = lext
      extra_index -= 257
      end = 256
    } else {
    /* DISTS */
      base = dbase
      extra = dext
      end = -1
    }

  /* initialize opts for loop */
    huff = 0 /* starting code */
    sym = 0 /* starting code symbol */
    len = min /* starting code length */
    next = table_index /* current table to fill in */
    curr = root /* current table index bits */
    drop = 0 /* current bits to drop from code for index */
    low = -1 /* trigger new sub-table when len > root */
    used = 1 << root /* use root table entries */
    mask = used - 1 /* mask for comparing low */

  /* check available table space */
    if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) {
      return 1
    }

    var i = 0
  /* process all codes and make table entries */
    for (;;) {
      i++
    /* create table entry */
      here_bits = len - drop
      if (work[sym] < end) {
        here_op = 0
        here_val = work[sym]
      } else if (work[sym] > end) {
        here_op = extra[extra_index + work[sym]]
        here_val = base[base_index + work[sym]]
      } else {
        here_op = 32 + 64 /* end of block */
        here_val = 0
      }

    /* replicate for those indices with low len bits equal to huff */
      incr = 1 << len - drop
      fill = 1 << curr
      min = fill /* save offset to next table */
      do {
        fill -= incr
        table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0
      } while (fill !== 0)

    /* backwards increment the len-bit code huff */
      incr = 1 << len - 1
      while (huff & incr) {
        incr >>= 1
      }
      if (incr !== 0) {
        huff &= incr - 1
        huff += incr
      } else {
        huff = 0
      }

    /* go to next symbol, update count, len */
      sym++
      if (--count[len] === 0) {
        if (len === max) {
          break
        }
        len = lens[lens_index + work[sym]]
      }

    /* create new sub-table if needed */
      if (len > root && (huff & mask) !== low) {
      /* if first time, transition to sub-tables */
        if (drop === 0) {
          drop = root
        }

      /* increment past last table */
        next += min /* here min is 1 << curr */

      /* determine length of next table */
        curr = len - drop
        left = 1 << curr
        while (curr + drop < max) {
          left -= count[curr + drop]
          if (left <= 0) {
            break
          }
          curr++
          left <<= 1
        }

      /* check for enough space */
        used += 1 << curr
        if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) {
          return 1
        }

      /* point entry in root table to sub-table */
        low = huff & mask
      /* table.op[low] = curr;
      table.bits[low] = root;
      table.val[low] = next - opts.table_index; */
        table[low] = root << 24 | curr << 16 | next - table_index | 0
      }
    }

  /* fill in remaining table entry if code is incomplete (guaranteed to have
   at most one remaining entry, since if the code is incomplete, the
   maximum code length that was allowed to get this far is one bit) */
    if (huff !== 0) {
    // table.op[next + huff] = 64;            /* invalid code marker */
    // table.bits[next + huff] = len - drop;
    // table.val[next + huff] = 0;
      table[next + huff] = len - drop << 24 | 64 << 16 | 0
    }

  /* set return parameters */
  // opts.table_index += used;
    opts.bits = root
    return 0
  }

  var CODES = 0
  var LENS = 1
  var DISTS = 2

/* Public constants ========================================================== */
/* =========================================================================== */

/* Allowed flush values; see deflate() and inflate() below for details */
// var Z_NO_FLUSH      = 0;
// var Z_PARTIAL_FLUSH = 1;
// var Z_SYNC_FLUSH    = 2;
// var Z_FULL_FLUSH    = 3;
  var Z_FINISH$2 = 4
  var Z_BLOCK$2 = 5
  var Z_TREES$1 = 6

/* Return codes for the compression/decompression functions. Negative values
 * are errors, positive values are used for special but normal events.
 */
  var Z_OK$2 = 0
  var Z_STREAM_END$2 = 1
  var Z_NEED_DICT$1 = 2
// var Z_ERRNO         = -1;
  var Z_STREAM_ERROR$2 = -2
  var Z_DATA_ERROR$2 = -3
  var Z_MEM_ERROR = -4
  var Z_BUF_ERROR$2 = -5
// var Z_VERSION_ERROR = -6;

/* The deflate compression method */
  var Z_DEFLATED$2 = 8

/* STATES ==================================================================== */
/* =========================================================================== */

  var HEAD = 1 /* i: waiting for magic header */
  var FLAGS = 2 /* i: waiting for method and flags (gzip) */
  var TIME = 3 /* i: waiting for modification time (gzip) */
  var OS = 4 /* i: waiting for extra flags and operating system (gzip) */
  var EXLEN = 5 /* i: waiting for extra length (gzip) */
  var EXTRA = 6 /* i: waiting for extra bytes (gzip) */
  var NAME = 7 /* i: waiting for end of file name (gzip) */
  var COMMENT = 8 /* i: waiting for end of comment (gzip) */
  var HCRC = 9 /* i: waiting for header crc (gzip) */
  var DICTID = 10 /* i: waiting for dictionary check value */
  var DICT = 11 /* waiting for inflateSetDictionary() call */
  var TYPE = 12 /* i: waiting for type bits, including last-flag bit */
  var TYPEDO = 13 /* i: same, but skip check to exit inflate on new block */
  var STORED = 14 /* i: waiting for stored size (length and complement) */
  var COPY_ = 15 /* i/o: same as COPY below, but only first time in */
  var COPY = 16 /* i/o: waiting for input or output to copy stored block */
  var TABLE = 17 /* i: waiting for dynamic block table lengths */
  var LENLENS = 18 /* i: waiting for code length code lengths */
  var CODELENS = 19 /* i: waiting for length/lit and distance code lengths */
  var LEN_ = 20 /* i: same as LEN below, but only first time in */
  var LEN = 21 /* i: waiting for length/lit/eob code */
  var LENEXT = 22 /* i: waiting for length extra bits */
  var DIST = 23 /* i: waiting for distance code */
  var DISTEXT = 24 /* i: waiting for distance extra bits */
  var MATCH = 25 /* o: waiting for output space to copy string */
  var LIT = 26 /* o: waiting for output space to write literal */
  var CHECK = 27 /* i: waiting for 32-bit check value */
  var LENGTH = 28 /* i: waiting for 32-bit length (gzip) */
  var DONE = 29 /* finished check, done -- remain here until reset */
  var BAD = 30 /* got a data error -- remain here until reset */
  var MEM = 31 /* got an inflate() memory error -- remain here until reset */
  var SYNC = 32 /* looking for synchronization bytes to restart inflate() */

/* =========================================================================== */

  var ENOUGH_LENS = 852
  var ENOUGH_DISTS = 592
  function zswap32 (q) {
    return (q >>> 24 & 0xff) + (q >>> 8 & 0xff00) + ((q & 0xff00) << 8) + ((q & 0xff) << 24)
  }

  function InflateState () {
    this.mode = 0 /* current inflate mode */
    this.last = false /* true if processing last block */
    this.wrap = 0 /* bit 0 true for zlib, bit 1 true for gzip */
    this.havedict = false /* true if dictionary provided */
    this.flags = 0 /* gzip header method and flags (0 if zlib) */
    this.dmax = 0 /* zlib header max distance (INFLATE_STRICT) */
    this.check = 0 /* protected copy of check value */
    this.total = 0 /* protected copy of output count */
  // TODO: may be {}
    this.head = null /* where to save gzip header information */

  /* sliding window */
    this.wbits = 0 /* log base 2 of requested window size */
    this.wsize = 0 /* window size or zero if not using window */
    this.whave = 0 /* valid bytes in the window */
    this.wnext = 0 /* window write index */
    this.window = null /* allocated sliding window, if needed */

  /* bit accumulator */
    this.hold = 0 /* input bit accumulator */
    this.bits = 0 /* number of bits in "in" */

  /* for string and stored block copying */
    this.length = 0 /* literal or length of data to copy */
    this.offset = 0 /* distance back to copy string from */

  /* for table and code decoding */
    this.extra = 0 /* extra bits needed */

  /* fixed and dynamic code tables */
    this.lencode = null /* starting table for length/literal codes */
    this.distcode = null /* starting table for distance codes */
    this.lenbits = 0 /* index bits for lencode */
    this.distbits = 0 /* index bits for distcode */

  /* dynamic table building */
    this.ncode = 0 /* number of code length code lengths */
    this.nlen = 0 /* number of length code lengths */
    this.ndist = 0 /* number of distance code lengths */
    this.have = 0 /* number of code lengths in lens[] */
    this.next = null /* next available space in codes[] */

    this.lens = new Buf16(320) /* temporary storage for code lengths */
    this.work = new Buf16(288) /* work area for code table building */

  /*
   because we don't have pointers in js, we use lencode and distcode directly
   as buffers so we don't need codes
  */
  // this.codes = new Buf32(ENOUGH);       /* space for code tables */
    this.lendyn = null /* dynamic table for length/literal codes (JS specific) */
    this.distdyn = null /* dynamic table for distance codes (JS specific) */
    this.sane = 0 /* if false, allow invalid distance too far */
    this.back = 0 /* bits back of last unprocessed length/lit */
    this.was = 0 /* initial length of match */
  }

  function inflateResetKeep (strm) {
    var state

    if (!strm || !strm.state) {
      return Z_STREAM_ERROR$2
    }
    state = strm.state
    strm.total_in = strm.total_out = state.total = 0
    strm.msg = '' /* Z_NULL */
    if (state.wrap) {
    /* to support ill-conceived Java test suite */
      strm.adler = state.wrap & 1
    }
    state.mode = HEAD
    state.last = 0
    state.havedict = 0
    state.dmax = 32768
    state.head = null /* Z_NULL */
    state.hold = 0
    state.bits = 0
  // state.lencode = state.distcode = state.next = state.codes;
    state.lencode = state.lendyn = new Buf32(ENOUGH_LENS)
    state.distcode = state.distdyn = new Buf32(ENOUGH_DISTS)

    state.sane = 1
    state.back = -1
  // Tracev((stderr, "inflate: reset\n"));
    return Z_OK$2
  }

  function inflateReset (strm) {
    var state

    if (!strm || !strm.state) {
      return Z_STREAM_ERROR$2
    }
    state = strm.state
    state.wsize = 0
    state.whave = 0
    state.wnext = 0
    return inflateResetKeep(strm)
  }

  function inflateReset2 (strm, windowBits) {
    var wrap
    var state

  /* get the state */
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR$2
    }
    state = strm.state

  /* extract wrap request from windowBits parameter */
    if (windowBits < 0) {
      wrap = 0
      windowBits = -windowBits
    } else {
      wrap = (windowBits >> 4) + 1
      if (windowBits < 48) {
        windowBits &= 15
      }
    }

  /* set number of window bits, free window if different */
    if (windowBits && (windowBits < 8 || windowBits > 15)) {
      return Z_STREAM_ERROR$2
    }
    if (state.window !== null && state.wbits !== windowBits) {
      state.window = null
    }

  /* update state and reset the rest of it */
    state.wrap = wrap
    state.wbits = windowBits
    return inflateReset(strm)
  }

  function inflateInit2 (strm, windowBits) {
    var ret
    var state

    if (!strm) {
      return Z_STREAM_ERROR$2
    }
  // strm.msg = Z_NULL;                 /* in case we return an error */

    state = new InflateState()

  // if (state === Z_NULL) return Z_MEM_ERROR;
  // Tracev((stderr, "inflate: allocated\n"));
    strm.state = state
    state.window = null /* Z_NULL */
    ret = inflateReset2(strm, windowBits)
    if (ret !== Z_OK$2) {
      strm.state = null /* Z_NULL */
    }
    return ret
  }

/*
 Return state with length and distance decoding tables and index sizes set to
 fixed code decoding.  Normally this returns fixed tables from inffixed.h.
 If BUILDFIXED is defined, then instead this routine builds the tables the
 first time it's called, and returns those tables the first time and
 thereafter.  This reduces the size of the code by about 2K bytes, in
 exchange for a little execution time.  However, BUILDFIXED should not be
 used for threaded applications, since the rewriting of the tables and virgin
 may not be thread-safe.
 */
  var virgin = true

  var lenfix
  var distfix // We have no pointers in JS, so keep tables separate

  function fixedtables (state) {
  /* build fixed huffman tables if first call (may not be thread safe) */
    if (virgin) {
      var sym

      lenfix = new Buf32(512)
      distfix = new Buf32(32)

    /* literal/length table */
      sym = 0
      while (sym < 144) {
        state.lens[sym++] = 8
      }
      while (sym < 256) {
        state.lens[sym++] = 9
      }
      while (sym < 280) {
        state.lens[sym++] = 7
      }
      while (sym < 288) {
        state.lens[sym++] = 8
      }

      inflate_table(LENS, state.lens, 0, 288, lenfix, 0, state.work, {
        bits: 9
      })

    /* distance table */
      sym = 0
      while (sym < 32) {
        state.lens[sym++] = 5
      }

      inflate_table(DISTS, state.lens, 0, 32, distfix, 0, state.work, {
        bits: 5
      })

    /* do this just once */
      virgin = false
    }

    state.lencode = lenfix
    state.lenbits = 9
    state.distcode = distfix
    state.distbits = 5
  }

/*
 Update the window with the last wsize (normally 32K) bytes written before
 returning.  If window does not exist yet, create it.  This is only called
 when a window is already in use, or when output has been written during this
 inflate call, but the end of the deflate stream has not been reached yet.
 It is also called to create a window for dictionary data when a dictionary
 is loaded.

 Providing output buffers larger than 32K to inflate() should provide a speed
 advantage, since only the last 32K of output is copied to the sliding window
 upon return from inflate(), and since all distances after the first 32K of
 output will fall in the output data, making match copies simpler and faster.
 The advantage may be dependent on the size of the processor's data caches.
 */
  function updatewindow (strm, src, end, copy) {
    var dist
    var state = strm.state

  /* if it hasn't been done already, allocate space for the window */
    if (state.window === null) {
      state.wsize = 1 << state.wbits
      state.wnext = 0
      state.whave = 0

      state.window = new Buf8(state.wsize)
    }

  /* copy state->wsize or less output bytes into the circular window */
    if (copy >= state.wsize) {
      arraySet(state.window, src, end - state.wsize, state.wsize, 0)
      state.wnext = 0
      state.whave = state.wsize
    } else {
      dist = state.wsize - state.wnext
      if (dist > copy) {
        dist = copy
      }
    // zmemcpy(state->window + state->wnext, end - copy, dist);
      arraySet(state.window, src, end - copy, dist, state.wnext)
      copy -= dist
      if (copy) {
      // zmemcpy(state->window, end - copy, copy);
        arraySet(state.window, src, end - copy, copy, 0)
        state.wnext = copy
        state.whave = state.wsize
      } else {
        state.wnext += dist
        if (state.wnext === state.wsize) {
          state.wnext = 0
        }
        if (state.whave < state.wsize) {
          state.whave += dist
        }
      }
    }
    return 0
  }

  function inflate$1 (strm, flush) {
    var state
    var input, output // input/output buffers
    var next /* next input INDEX */
    var put /* next output INDEX */
    var have, left /* available input and output */
    var hold /* bit buffer */
    var bits /* bits in bit buffer */
    var _in, _out /* save starting available input and output */
    var copy /* number of stored or match bytes to copy */
    var from /* where to copy match bytes from */
    var from_source
    var here = 0 /* current decoding table entry */
    var here_bits, here_op, here_val // paked "here" denormalized (JS specific)
  // var last;                   /* parent table entry */
    var last_bits, last_op, last_val // paked "last" denormalized (JS specific)
    var len /* length to copy for repeats, bits to drop */
    var ret /* return code */
    var hbuf = new Buf8(4) /* buffer for gzip header crc calculation */
    var opts

    var n // temporary var for NEED_BITS

    var order = /* permutation of code lengths */[16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

    if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
      return Z_STREAM_ERROR$2
    }

    state = strm.state
    if (state.mode === TYPE) {
      state.mode = TYPEDO
    } /* skip check */

  // --- LOAD() ---
    put = strm.next_out
    output = strm.output
    left = strm.avail_out
    next = strm.next_in
    input = strm.input
    have = strm.avail_in
    hold = state.hold
    bits = state.bits
  // ---

    _in = have
    _out = left
    ret = Z_OK$2

    inf_leave: // goto emulation
  for (;;) {
    switch (state.mode) {
      case HEAD:
        if (state.wrap === 0) {
          state.mode = TYPEDO
          break
        }
        // === NEEDBITS(16);
        while (bits < 16) {
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
        }
        // ===//
        if (state.wrap & 2 && hold === 0x8b1f) {
          /* gzip header */
          state.check = 0 /* crc32(0L, Z_NULL, 0) */
          // === CRC2(state.check, hold);
          hbuf[0] = hold & 0xff
          hbuf[1] = hold >>> 8 & 0xff
          state.check = crc32(state.check, hbuf, 2, 0)
          // ===//

          // === INITBITS();
          hold = 0
          bits = 0
          // ===//
          state.mode = FLAGS
          break
        }
        state.flags = 0 /* expect zlib header */
        if (state.head) {
          state.head.done = false
        }
        if (!(state.wrap & 1) || /* check if zlib header allowed */
        (((hold & 0xff) << /* BITS(8) */8) + (hold >> 8)) % 31) {
          strm.msg = 'incorrect header check'
          state.mode = BAD
          break
        }
        if ((hold & 0x0f) !== /* BITS(4) */Z_DEFLATED$2) {
          strm.msg = 'unknown compression method'
          state.mode = BAD
          break
        }
        // --- DROPBITS(4) ---//
        hold >>>= 4
        bits -= 4
        // ---//
        len = (hold & 0x0f) + /* BITS(4) */8
        if (state.wbits === 0) {
          state.wbits = len
        } else if (len > state.wbits) {
          strm.msg = 'invalid window size'
          state.mode = BAD
          break
        }
        state.dmax = 1 << len
        // Tracev((stderr, "inflate:   zlib header ok\n"));
        strm.adler = state.check = 1 /* adler32(0L, Z_NULL, 0) */
        state.mode = hold & 0x200 ? DICTID : TYPE
        // === INITBITS();
        hold = 0
        bits = 0
        // ===//
        break
      case FLAGS:
        // === NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
        }
        // ===//
        state.flags = hold
        if ((state.flags & 0xff) !== Z_DEFLATED$2) {
          strm.msg = 'unknown compression method'
          state.mode = BAD
          break
        }
        if (state.flags & 0xe000) {
          strm.msg = 'unknown header flags set'
          state.mode = BAD
          break
        }
        if (state.head) {
          state.head.text = hold >> 8 & 1
        }
        if (state.flags & 0x0200) {
          // === CRC2(state.check, hold);
          hbuf[0] = hold & 0xff
          hbuf[1] = hold >>> 8 & 0xff
          state.check = crc32(state.check, hbuf, 2, 0)
          // ===//
        }
        // === INITBITS();
        hold = 0
        bits = 0
        // ===//
        state.mode = TIME
      /* falls through */
      case TIME:
        // === NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
        }
        // ===//
        if (state.head) {
          state.head.time = hold
        }
        if (state.flags & 0x0200) {
          // === CRC4(state.check, hold)
          hbuf[0] = hold & 0xff
          hbuf[1] = hold >>> 8 & 0xff
          hbuf[2] = hold >>> 16 & 0xff
          hbuf[3] = hold >>> 24 & 0xff
          state.check = crc32(state.check, hbuf, 4, 0)
          // ===
        }
        // === INITBITS();
        hold = 0
        bits = 0
        // ===//
        state.mode = OS
      /* falls through */
      case OS:
        // === NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
        }
        // ===//
        if (state.head) {
          state.head.xflags = hold & 0xff
          state.head.os = hold >> 8
        }
        if (state.flags & 0x0200) {
          // === CRC2(state.check, hold);
          hbuf[0] = hold & 0xff
          hbuf[1] = hold >>> 8 & 0xff
          state.check = crc32(state.check, hbuf, 2, 0)
          // ===//
        }
        // === INITBITS();
        hold = 0
        bits = 0
        // ===//
        state.mode = EXLEN
      /* falls through */
      case EXLEN:
        if (state.flags & 0x0400) {
          // === NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) {
              break inf_leave
            }
            have--
            hold += input[next++] << bits
            bits += 8
          }
          // ===//
          state.length = hold
          if (state.head) {
            state.head.extra_len = hold
          }
          if (state.flags & 0x0200) {
            // === CRC2(state.check, hold);
            hbuf[0] = hold & 0xff
            hbuf[1] = hold >>> 8 & 0xff
            state.check = crc32(state.check, hbuf, 2, 0)
            // ===//
          }
          // === INITBITS();
          hold = 0
          bits = 0
          // ===//
        } else if (state.head) {
          state.head.extra = null /* Z_NULL */
        }
        state.mode = EXTRA
      /* falls through */
      case EXTRA:
        if (state.flags & 0x0400) {
          copy = state.length
          if (copy > have) {
            copy = have
          }
          if (copy) {
            if (state.head) {
              len = state.head.extra_len - state.length
              if (!state.head.extra) {
                // Use untyped array for more conveniend processing later
                state.head.extra = new Array(state.head.extra_len)
              }
              arraySet(state.head.extra, input, next,
              // extra field is limited to 65536 bytes
              // - no need for additional size check
              copy,
              /* len + copy > state.head.extra_max - len ? state.head.extra_max : copy, */
              len)
              // zmemcpy(state.head.extra + len, next,
              //        len + copy > state.head.extra_max ?
              //        state.head.extra_max - len : copy);
            }
            if (state.flags & 0x0200) {
              state.check = crc32(state.check, input, copy, next)
            }
            have -= copy
            next += copy
            state.length -= copy
          }
          if (state.length) {
            break inf_leave
          }
        }
        state.length = 0
        state.mode = NAME
      /* falls through */
      case NAME:
        if (state.flags & 0x0800) {
          if (have === 0) {
            break inf_leave
          }
          copy = 0
          do {
            // TODO: 2 or 1 bytes?
            len = input[next + copy++]
            /* use constant limit because in js we should not preallocate memory */
            if (state.head && len && state.length < 65536 /* state.head.name_max */) {
              state.head.name += String.fromCharCode(len)
            }
          } while (len && copy < have)

          if (state.flags & 0x0200) {
            state.check = crc32(state.check, input, copy, next)
          }
          have -= copy
          next += copy
          if (len) {
            break inf_leave
          }
        } else if (state.head) {
          state.head.name = null
        }
        state.length = 0
        state.mode = COMMENT
      /* falls through */
      case COMMENT:
        if (state.flags & 0x1000) {
          if (have === 0) {
            break inf_leave
          }
          copy = 0
          do {
            len = input[next + copy++]
            /* use constant limit because in js we should not preallocate memory */
            if (state.head && len && state.length < 65536 /* state.head.comm_max */) {
              state.head.comment += String.fromCharCode(len)
            }
          } while (len && copy < have)
          if (state.flags & 0x0200) {
            state.check = crc32(state.check, input, copy, next)
          }
          have -= copy
          next += copy
          if (len) {
            break inf_leave
          }
        } else if (state.head) {
          state.head.comment = null
        }
        state.mode = HCRC
      /* falls through */
      case HCRC:
        if (state.flags & 0x0200) {
          // === NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) {
              break inf_leave
            }
            have--
            hold += input[next++] << bits
            bits += 8
          }
          // ===//
          if (hold !== (state.check & 0xffff)) {
            strm.msg = 'header crc mismatch'
            state.mode = BAD
            break
          }
          // === INITBITS();
          hold = 0
          bits = 0
          // ===//
        }
        if (state.head) {
          state.head.hcrc = state.flags >> 9 & 1
          state.head.done = true
        }
        strm.adler = state.check = 0
        state.mode = TYPE
        break
      case DICTID:
        // === NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
        }
        // ===//
        strm.adler = state.check = zswap32(hold)
        // === INITBITS();
        hold = 0
        bits = 0
        // ===//
        state.mode = DICT
      /* falls through */
      case DICT:
        if (state.havedict === 0) {
          // --- RESTORE() ---
          strm.next_out = put
          strm.avail_out = left
          strm.next_in = next
          strm.avail_in = have
          state.hold = hold
          state.bits = bits
          // ---
          return Z_NEED_DICT$1
        }
        strm.adler = state.check = 1 /* adler32(0L, Z_NULL, 0) */
        state.mode = TYPE
      /* falls through */
      case TYPE:
        if (flush === Z_BLOCK$2 || flush === Z_TREES$1) {
          break inf_leave
        }
      /* falls through */
      case TYPEDO:
        if (state.last) {
          // --- BYTEBITS() ---//
          hold >>>= bits & 7
          bits -= bits & 7
          // ---//
          state.mode = CHECK
          break
        }
        // === NEEDBITS(3); */
        while (bits < 3) {
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
        }
        // ===//
        state.last = hold & 0x01 /* BITS(1) */
        // --- DROPBITS(1) ---//
        hold >>>= 1
        bits -= 1
        // ---//

        switch (hold & 0x03) {
          /* BITS(2) */case 0:
            /* stored block */
            // Tracev((stderr, "inflate:     stored block%s\n",
            //        state.last ? " (last)" : ""));
            state.mode = STORED
            break
          case 1:
            /* fixed block */
            fixedtables(state)
            // Tracev((stderr, "inflate:     fixed codes block%s\n",
            //        state.last ? " (last)" : ""));
            state.mode = LEN_ /* decode codes */
            if (flush === Z_TREES$1) {
              // --- DROPBITS(2) ---//
              hold >>>= 2
              bits -= 2
              // ---//
              break inf_leave
            }
            break
          case 2:
            /* dynamic block */
            // Tracev((stderr, "inflate:     dynamic codes block%s\n",
            //        state.last ? " (last)" : ""));
            state.mode = TABLE
            break
          case 3:
            strm.msg = 'invalid block type'
            state.mode = BAD
        }
        // --- DROPBITS(2) ---//
        hold >>>= 2
        bits -= 2
        // ---//
        break
      case STORED:
        // --- BYTEBITS() ---// /* go to byte boundary */
        hold >>>= bits & 7
        bits -= bits & 7
        // ---//
        // === NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
        }
        // ===//
        if ((hold & 0xffff) !== (hold >>> 16 ^ 0xffff)) {
          strm.msg = 'invalid stored block lengths'
          state.mode = BAD
          break
        }
        state.length = hold & 0xffff
        // Tracev((stderr, "inflate:       stored length %u\n",
        //        state.length));
        // === INITBITS();
        hold = 0
        bits = 0
        // ===//
        state.mode = COPY_
        if (flush === Z_TREES$1) {
          break inf_leave
        }
      /* falls through */
      case COPY_:
        state.mode = COPY
      /* falls through */
      case COPY:
        copy = state.length
        if (copy) {
          if (copy > have) {
            copy = have
          }
          if (copy > left) {
            copy = left
          }
          if (copy === 0) {
            break inf_leave
          }
          // --- zmemcpy(put, next, copy); ---
          arraySet(output, input, next, copy, put)
          // ---//
          have -= copy
          next += copy
          left -= copy
          put += copy
          state.length -= copy
          break
        }
        // Tracev((stderr, "inflate:       stored end\n"));
        state.mode = TYPE
        break
      case TABLE:
        // === NEEDBITS(14); */
        while (bits < 14) {
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
        }
        // ===//
        state.nlen = (hold & 0x1f) + /* BITS(5) */257
        // --- DROPBITS(5) ---//
        hold >>>= 5
        bits -= 5
        // ---//
        state.ndist = (hold & 0x1f) + /* BITS(5) */1
        // --- DROPBITS(5) ---//
        hold >>>= 5
        bits -= 5
        // ---//
        state.ncode = (hold & 0x0f) + /* BITS(4) */4
        // --- DROPBITS(4) ---//
        hold >>>= 4
        bits -= 4
        // ---//
        // #ifndef PKZIP_BUG_WORKAROUND
        if (state.nlen > 286 || state.ndist > 30) {
          strm.msg = 'too many length or distance symbols'
          state.mode = BAD
          break
        }
        // #endif
        // Tracev((stderr, "inflate:       table sizes ok\n"));
        state.have = 0
        state.mode = LENLENS
      /* falls through */
      case LENLENS:
        while (state.have < state.ncode) {
          // === NEEDBITS(3);
          while (bits < 3) {
            if (have === 0) {
              break inf_leave
            }
            have--
            hold += input[next++] << bits
            bits += 8
          }
          // ===//
          state.lens[order[state.have++]] = hold & 0x07 // BITS(3);
          // --- DROPBITS(3) ---//
          hold >>>= 3
          bits -= 3
          // ---//
        }
        while (state.have < 19) {
          state.lens[order[state.have++]] = 0
        }
        // We have separate tables & no pointers. 2 commented lines below not needed.
        // state.next = state.codes;
        // state.lencode = state.next;
        // Switch to use dynamic table
        state.lencode = state.lendyn
        state.lenbits = 7

        opts = {
          bits: state.lenbits
        }
        ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts)
        state.lenbits = opts.bits

        if (ret) {
          strm.msg = 'invalid code lengths set'
          state.mode = BAD
          break
        }
        // Tracev((stderr, "inflate:       code lengths ok\n"));
        state.have = 0
        state.mode = CODELENS
      /* falls through */
      case CODELENS:
        while (state.have < state.nlen + state.ndist) {
          for (;;) {
            here = state.lencode[hold & (1 << state.lenbits) - 1] /* BITS(state.lenbits) */
            here_bits = here >>> 24
            here_op = here >>> 16 & 0xff
            here_val = here & 0xffff

            if (here_bits <= bits) {
              break
            }
            // --- PULLBYTE() ---//
            if (have === 0) {
              break inf_leave
            }
            have--
            hold += input[next++] << bits
            bits += 8
            // ---//
          }
          if (here_val < 16) {
            // --- DROPBITS(here.bits) ---//
            hold >>>= here_bits
            bits -= here_bits
            // ---//
            state.lens[state.have++] = here_val
          } else {
            if (here_val === 16) {
              // === NEEDBITS(here.bits + 2);
              n = here_bits + 2
              while (bits < n) {
                if (have === 0) {
                  break inf_leave
                }
                have--
                hold += input[next++] << bits
                bits += 8
              }
              // ===//
              // --- DROPBITS(here.bits) ---//
              hold >>>= here_bits
              bits -= here_bits
              // ---//
              if (state.have === 0) {
                strm.msg = 'invalid bit length repeat'
                state.mode = BAD
                break
              }
              len = state.lens[state.have - 1]
              copy = 3 + (hold & 0x03) // BITS(2);
              // --- DROPBITS(2) ---//
              hold >>>= 2
              bits -= 2
              // ---//
            } else if (here_val === 17) {
              // === NEEDBITS(here.bits + 3);
              n = here_bits + 3
              while (bits < n) {
                if (have === 0) {
                  break inf_leave
                }
                have--
                hold += input[next++] << bits
                bits += 8
              }
              // ===//
              // --- DROPBITS(here.bits) ---//
              hold >>>= here_bits
              bits -= here_bits
              // ---//
              len = 0
              copy = 3 + (hold & 0x07) // BITS(3);
              // --- DROPBITS(3) ---//
              hold >>>= 3
              bits -= 3
              // ---//
            } else {
              // === NEEDBITS(here.bits + 7);
              n = here_bits + 7
              while (bits < n) {
                if (have === 0) {
                  break inf_leave
                }
                have--
                hold += input[next++] << bits
                bits += 8
              }
              // ===//
              // --- DROPBITS(here.bits) ---//
              hold >>>= here_bits
              bits -= here_bits
              // ---//
              len = 0
              copy = 11 + (hold & 0x7f) // BITS(7);
              // --- DROPBITS(7) ---//
              hold >>>= 7
              bits -= 7
              // ---//
            }
            if (state.have + copy > state.nlen + state.ndist) {
              strm.msg = 'invalid bit length repeat'
              state.mode = BAD
              break
            }
            while (copy--) {
              state.lens[state.have++] = len
            }
          }
        }

        /* handle error breaks in while */
        if (state.mode === BAD) {
          break
        }

        /* check for end-of-block code (better have one) */
        if (state.lens[256] === 0) {
          strm.msg = 'invalid code -- missing end-of-block'
          state.mode = BAD
          break
        }

        /* build code tables -- note: do not change the lenbits or distbits
           values here (9 and 6) without reading the comments in inftrees.h
           concerning the ENOUGH constants, which depend on those values */
        state.lenbits = 9

        opts = {
          bits: state.lenbits
        }
        ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts)
        // We have separate tables & no pointers. 2 commented lines below not needed.
        // state.next_index = opts.table_index;
        state.lenbits = opts.bits
        // state.lencode = state.next;

        if (ret) {
          strm.msg = 'invalid literal/lengths set'
          state.mode = BAD
          break
        }

        state.distbits = 6
        // state.distcode.copy(state.codes);
        // Switch to use dynamic table
        state.distcode = state.distdyn
        opts = {
          bits: state.distbits
        }
        ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts)
        // We have separate tables & no pointers. 2 commented lines below not needed.
        // state.next_index = opts.table_index;
        state.distbits = opts.bits
        // state.distcode = state.next;

        if (ret) {
          strm.msg = 'invalid distances set'
          state.mode = BAD
          break
        }
        // Tracev((stderr, 'inflate:       codes ok\n'));
        state.mode = LEN_
        if (flush === Z_TREES$1) {
          break inf_leave
        }
      /* falls through */
      case LEN_:
        state.mode = LEN
      /* falls through */
      case LEN:
        if (have >= 6 && left >= 258) {
          // --- RESTORE() ---
          strm.next_out = put
          strm.avail_out = left
          strm.next_in = next
          strm.avail_in = have
          state.hold = hold
          state.bits = bits
          // ---
          inflate_fast(strm, _out)
          // --- LOAD() ---
          put = strm.next_out
          output = strm.output
          left = strm.avail_out
          next = strm.next_in
          input = strm.input
          have = strm.avail_in
          hold = state.hold
          bits = state.bits
          // ---

          if (state.mode === TYPE) {
            state.back = -1
          }
          break
        }
        state.back = 0
        for (;;) {
          here = state.lencode[hold & (1 << state.lenbits) - 1] /* BITS(state.lenbits) */
          here_bits = here >>> 24
          here_op = here >>> 16 & 0xff
          here_val = here & 0xffff

          if (here_bits <= bits) {
            break
          }
          // --- PULLBYTE() ---//
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
          // ---//
        }
        if (here_op && (here_op & 0xf0) === 0) {
          last_bits = here_bits
          last_op = here_op
          last_val = here_val
          for (;;) {
            here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> /* BITS(last.bits + last.op) */last_bits)]
            here_bits = here >>> 24
            here_op = here >>> 16 & 0xff
            here_val = here & 0xffff

            if (last_bits + here_bits <= bits) {
              break
            }
            // --- PULLBYTE() ---//
            if (have === 0) {
              break inf_leave
            }
            have--
            hold += input[next++] << bits
            bits += 8
            // ---//
          }
          // --- DROPBITS(last.bits) ---//
          hold >>>= last_bits
          bits -= last_bits
          // ---//
          state.back += last_bits
        }
        // --- DROPBITS(here.bits) ---//
        hold >>>= here_bits
        bits -= here_bits
        // ---//
        state.back += here_bits
        state.length = here_val
        if (here_op === 0) {
          // Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
          //        "inflate:         literal '%c'\n" :
          //        "inflate:         literal 0x%02x\n", here.val));
          state.mode = LIT
          break
        }
        if (here_op & 32) {
          // Tracevv((stderr, "inflate:         end of block\n"));
          state.back = -1
          state.mode = TYPE
          break
        }
        if (here_op & 64) {
          strm.msg = 'invalid literal/length code'
          state.mode = BAD
          break
        }
        state.extra = here_op & 15
        state.mode = LENEXT
      /* falls through */
      case LENEXT:
        if (state.extra) {
          // === NEEDBITS(state.extra);
          n = state.extra
          while (bits < n) {
            if (have === 0) {
              break inf_leave
            }
            have--
            hold += input[next++] << bits
            bits += 8
          }
          // ===//
          state.length += hold & (1 << state.extra) - 1 /* BITS(state.extra) */
          // --- DROPBITS(state.extra) ---//
          hold >>>= state.extra
          bits -= state.extra
          // ---//
          state.back += state.extra
        }
        // Tracevv((stderr, "inflate:         length %u\n", state.length));
        state.was = state.length
        state.mode = DIST
      /* falls through */
      case DIST:
        for (;;) {
          here = state.distcode[hold & (1 << state.distbits) - 1] /* BITS(state.distbits) */
          here_bits = here >>> 24
          here_op = here >>> 16 & 0xff
          here_val = here & 0xffff

          if (here_bits <= bits) {
            break
          }
          // --- PULLBYTE() ---//
          if (have === 0) {
            break inf_leave
          }
          have--
          hold += input[next++] << bits
          bits += 8
          // ---//
        }
        if ((here_op & 0xf0) === 0) {
          last_bits = here_bits
          last_op = here_op
          last_val = here_val
          for (;;) {
            here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> /* BITS(last.bits + last.op) */last_bits)]
            here_bits = here >>> 24
            here_op = here >>> 16 & 0xff
            here_val = here & 0xffff

            if (last_bits + here_bits <= bits) {
              break
            }
            // --- PULLBYTE() ---//
            if (have === 0) {
              break inf_leave
            }
            have--
            hold += input[next++] << bits
            bits += 8
            // ---//
          }
          // --- DROPBITS(last.bits) ---//
          hold >>>= last_bits
          bits -= last_bits
          // ---//
          state.back += last_bits
        }
        // --- DROPBITS(here.bits) ---//
        hold >>>= here_bits
        bits -= here_bits
        // ---//
        state.back += here_bits
        if (here_op & 64) {
          strm.msg = 'invalid distance code'
          state.mode = BAD
          break
        }
        state.offset = here_val
        state.extra = here_op & 15
        state.mode = DISTEXT
      /* falls through */
      case DISTEXT:
        if (state.extra) {
          // === NEEDBITS(state.extra);
          n = state.extra
          while (bits < n) {
            if (have === 0) {
              break inf_leave
            }
            have--
            hold += input[next++] << bits
            bits += 8
          }
          // ===//
          state.offset += hold & (1 << state.extra) - 1 /* BITS(state.extra) */
          // --- DROPBITS(state.extra) ---//
          hold >>>= state.extra
          bits -= state.extra
          // ---//
          state.back += state.extra
        }
        // #ifdef INFLATE_STRICT
        if (state.offset > state.dmax) {
          strm.msg = 'invalid distance too far back'
          state.mode = BAD
          break
        }
        // #endif
        // Tracevv((stderr, "inflate:         distance %u\n", state.offset));
        state.mode = MATCH
      /* falls through */
      case MATCH:
        if (left === 0) {
          break inf_leave
        }
        copy = _out - left
        if (state.offset > copy) {
          /* copy from window */
          copy = state.offset - copy
          if (copy > state.whave) {
            if (state.sane) {
              strm.msg = 'invalid distance too far back'
              state.mode = BAD
              break
            }
            // (!) This block is disabled in zlib defailts,
            // don't enable it for binary compatibility
            // #ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
            //          Trace((stderr, "inflate.c too far\n"));
            //          copy -= state.whave;
            //          if (copy > state.length) { copy = state.length; }
            //          if (copy > left) { copy = left; }
            //          left -= copy;
            //          state.length -= copy;
            //          do {
            //            output[put++] = 0;
            //          } while (--copy);
            //          if (state.length === 0) { state.mode = LEN; }
            //          break;
            // #endif
          }
          if (copy > state.wnext) {
            copy -= state.wnext
            from = state.wsize - copy
          } else {
            from = state.wnext - copy
          }
          if (copy > state.length) {
            copy = state.length
          }
          from_source = state.window
        } else {
          /* copy from output */
          from_source = output
          from = put - state.offset
          copy = state.length
        }
        if (copy > left) {
          copy = left
        }
        left -= copy
        state.length -= copy
        do {
          output[put++] = from_source[from++]
        } while (--copy)
        if (state.length === 0) {
          state.mode = LEN
        }
        break
      case LIT:
        if (left === 0) {
          break inf_leave
        }
        output[put++] = state.length
        left--
        state.mode = LEN
        break
      case CHECK:
        if (state.wrap) {
          // === NEEDBITS(32);
          while (bits < 32) {
            if (have === 0) {
              break inf_leave
            }
            have--
            // Use '|' insdead of '+' to make sure that result is signed
            hold |= input[next++] << bits
            bits += 8
          }
          // ===//
          _out -= left
          strm.total_out += _out
          state.total += _out
          if (_out) {
            strm.adler = state.check =
            /* UPDATE(state.check, put - _out, _out); */
            state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out)
          }
          _out = left
          // NB: crc32 stored as signed 32-bit int, zswap32 returns signed too
          if ((state.flags ? hold : zswap32(hold)) !== state.check) {
            strm.msg = 'incorrect data check'
            state.mode = BAD
            break
          }
          // === INITBITS();
          hold = 0
          bits = 0
          // ===//
          // Tracev((stderr, "inflate:   check matches trailer\n"));
        }
        state.mode = LENGTH
      /* falls through */
      case LENGTH:
        if (state.wrap && state.flags) {
          // === NEEDBITS(32);
          while (bits < 32) {
            if (have === 0) {
              break inf_leave
            }
            have--
            hold += input[next++] << bits
            bits += 8
          }
          // ===//
          if (hold !== (state.total & 0xffffffff)) {
            strm.msg = 'incorrect length check'
            state.mode = BAD
            break
          }
          // === INITBITS();
          hold = 0
          bits = 0
          // ===//
          // Tracev((stderr, "inflate:   length matches trailer\n"));
        }
        state.mode = DONE
      /* falls through */
      case DONE:
        ret = Z_STREAM_END$2
        break inf_leave
      case BAD:
        ret = Z_DATA_ERROR$2
        break inf_leave
      case MEM:
        return Z_MEM_ERROR
      case SYNC:
      /* falls through */
      default:
        return Z_STREAM_ERROR$2
    }
  }

  // inf_leave <- here is real place for "goto inf_leave", emulated via "break inf_leave"

  /*
     Return from inflate(), updating the total counts and the check value.
     If there was no progress during the inflate() call, return a buffer
     error.  Call updatewindow() to create and/or update the window state.
     Note: a memory error from inflate() is non-recoverable.
   */

  // --- RESTORE() ---
    strm.next_out = put
    strm.avail_out = left
    strm.next_in = next
    strm.avail_in = have
    state.hold = hold
    state.bits = bits
  // ---

    if (state.wsize || _out !== strm.avail_out && state.mode < BAD && (state.mode < CHECK || flush !== Z_FINISH$2)) {
      if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) {
        state.mode = MEM
        return Z_MEM_ERROR
      }
    }
    _in -= strm.avail_in
    _out -= strm.avail_out
    strm.total_in += _in
    strm.total_out += _out
    state.total += _out
    if (state.wrap && _out) {
      strm.adler = state.check = /* UPDATE(state.check, strm.next_out - _out, _out); */
    state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out)
    }
    strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0)
    if ((_in === 0 && _out === 0 || flush === Z_FINISH$2) && ret === Z_OK$2) {
      ret = Z_BUF_ERROR$2
    }
    return ret
  }

  function inflateEnd (strm) {
    if (!strm || !strm.state /* || strm->zfree == (free_func)0 */) {
      return Z_STREAM_ERROR$2
    }

    var state = strm.state
    if (state.window) {
      state.window = null
    }
    strm.state = null
    return Z_OK$2
  }

/* Not implemented
exports.inflateCopy = inflateCopy;
exports.inflateGetDictionary = inflateGetDictionary;
exports.inflateMark = inflateMark;
exports.inflatePrime = inflatePrime;
exports.inflateSync = inflateSync;
exports.inflateSyncPoint = inflateSyncPoint;
exports.inflateUndermine = inflateUndermine;
*/

// import constants from './constants';

// zlib modes
  var NONE = 0
  var DEFLATE = 1
  var INFLATE = 2
  var GZIP = 3
  var GUNZIP = 4
  var DEFLATERAW = 5
  var INFLATERAW = 6
  var UNZIP = 7
  var Z_NO_FLUSH = 0
  var Z_PARTIAL_FLUSH = 1
  var Z_SYNC_FLUSH = 2
  var Z_FULL_FLUSH = 3
  var Z_FINISH = 4
  var Z_BLOCK = 5
  var Z_TREES = 6
  var Z_OK = 0
  var Z_STREAM_END = 1
  var Z_NEED_DICT = 2
  var Z_ERRNO = -1
  var Z_STREAM_ERROR = -2
  var Z_DATA_ERROR = -3
  var Z_BUF_ERROR = -5
  var Z_NO_COMPRESSION = 0
  var Z_BEST_SPEED = 1
  var Z_BEST_COMPRESSION = 9
  var Z_DEFAULT_COMPRESSION = -1
  var Z_FILTERED = 1
  var Z_HUFFMAN_ONLY = 2
  var Z_RLE = 3
  var Z_FIXED = 4
  var Z_DEFAULT_STRATEGY = 0
  var Z_BINARY = 0
  var Z_TEXT = 1
  var Z_UNKNOWN = 2
  var Z_DEFLATED = 8
  function Zlib$1 (mode) {
    if (mode < DEFLATE || mode > UNZIP) throw new TypeError('Bad argument')

    this.mode = mode
    this.init_done = false
    this.write_in_progress = false
    this.pending_close = false
    this.windowBits = 0
    this.level = 0
    this.memLevel = 0
    this.strategy = 0
    this.dictionary = null
  }

  Zlib$1.prototype.init = function (windowBits, level, memLevel, strategy, dictionary) {
    this.windowBits = windowBits
    this.level = level
    this.memLevel = memLevel
    this.strategy = strategy
  // dictionary not supported.

    if (this.mode === GZIP || this.mode === GUNZIP) this.windowBits += 16

    if (this.mode === UNZIP) this.windowBits += 32

    if (this.mode === DEFLATERAW || this.mode === INFLATERAW) this.windowBits = -this.windowBits

    this.strm = new ZStream()
    var status
    switch (this.mode) {
      case DEFLATE:
      case GZIP:
      case DEFLATERAW:
        status = deflateInit2(this.strm, this.level, Z_DEFLATED, this.windowBits, this.memLevel, this.strategy)
        break
      case INFLATE:
      case GUNZIP:
      case INFLATERAW:
      case UNZIP:
        status = inflateInit2(this.strm, this.windowBits)
        break
      default:
        throw new Error('Unknown mode ' + this.mode)
    }

    if (status !== Z_OK) {
      this._error(status)
      return
    }

    this.write_in_progress = false
    this.init_done = true
  }

  Zlib$1.prototype.params = function () {
    throw new Error('deflateParams Not supported')
  }

  Zlib$1.prototype._writeCheck = function () {
    if (!this.init_done) throw new Error('write before init')

    if (this.mode === NONE) throw new Error('already finalized')

    if (this.write_in_progress) throw new Error('write already in progress')

    if (this.pending_close) throw new Error('close is pending')
  }

  Zlib$1.prototype.write = function (flush, input, in_off, in_len, out, out_off, out_len) {
    this._writeCheck()
    this.write_in_progress = true

    var self = this
    process.nextTick(function () {
      self.write_in_progress = false
      var res = self._write(flush, input, in_off, in_len, out, out_off, out_len)
      self.callback(res[0], res[1])

      if (self.pending_close) self.close()
    })

    return this
  }

// set method for Node buffers, used by pako
  function bufferSet (data, offset) {
    for (var i = 0; i < data.length; i++) {
      this[offset + i] = data[i]
    }
  }

  Zlib$1.prototype.writeSync = function (flush, input, in_off, in_len, out, out_off, out_len) {
    this._writeCheck()
    return this._write(flush, input, in_off, in_len, out, out_off, out_len)
  }

  Zlib$1.prototype._write = function (flush, input, in_off, in_len, out, out_off, out_len) {
    this.write_in_progress = true

    if (flush !== Z_NO_FLUSH && flush !== Z_PARTIAL_FLUSH && flush !== Z_SYNC_FLUSH && flush !== Z_FULL_FLUSH && flush !== Z_FINISH && flush !== Z_BLOCK) {
      throw new Error('Invalid flush value')
    }

    if (input == null) {
      input = new Buffer(0)
      in_len = 0
      in_off = 0
    }

    if (out._set) out.set = out._set; else out.set = bufferSet

    var strm = this.strm
    strm.avail_in = in_len
    strm.input = input
    strm.next_in = in_off
    strm.avail_out = out_len
    strm.output = out
    strm.next_out = out_off
    var status
    switch (this.mode) {
      case DEFLATE:
      case GZIP:
      case DEFLATERAW:
        status = deflate$1(strm, flush)
        break
      case UNZIP:
      case INFLATE:
      case GUNZIP:
      case INFLATERAW:
        status = inflate$1(strm, flush)
        break
      default:
        throw new Error('Unknown mode ' + this.mode)
    }

    if (status !== Z_STREAM_END && status !== Z_OK) {
      this._error(status)
    }

    this.write_in_progress = false
    return [strm.avail_in, strm.avail_out]
  }

  Zlib$1.prototype.close = function () {
    if (this.write_in_progress) {
      this.pending_close = true
      return
    }

    this.pending_close = false

    if (this.mode === DEFLATE || this.mode === GZIP || this.mode === DEFLATERAW) {
      deflateEnd(this.strm)
    } else {
      inflateEnd(this.strm)
    }

    this.mode = NONE
  }
  var status
  Zlib$1.prototype.reset = function () {
    switch (this.mode) {
      case DEFLATE:
      case DEFLATERAW:
        status = deflateReset(this.strm)
        break
      case INFLATE:
      case INFLATERAW:
        status = inflateReset(this.strm)
        break
    }

    if (status !== Z_OK) {
      this._error(status)
    }
  }

  Zlib$1.prototype._error = function (status) {
    this.onerror(msg[status] + ': ' + this.strm.msg, status)

    this.write_in_progress = false
    if (this.pending_close) this.close()
  }

  var _binding = Object.freeze({
    NONE: NONE,
    DEFLATE: DEFLATE,
    INFLATE: INFLATE,
    GZIP: GZIP,
    GUNZIP: GUNZIP,
    DEFLATERAW: DEFLATERAW,
    INFLATERAW: INFLATERAW,
    UNZIP: UNZIP,
    Z_NO_FLUSH: Z_NO_FLUSH,
    Z_PARTIAL_FLUSH: Z_PARTIAL_FLUSH,
    Z_SYNC_FLUSH: Z_SYNC_FLUSH,
    Z_FULL_FLUSH: Z_FULL_FLUSH,
    Z_FINISH: Z_FINISH,
    Z_BLOCK: Z_BLOCK,
    Z_TREES: Z_TREES,
    Z_OK: Z_OK,
    Z_STREAM_END: Z_STREAM_END,
    Z_NEED_DICT: Z_NEED_DICT,
    Z_ERRNO: Z_ERRNO,
    Z_STREAM_ERROR: Z_STREAM_ERROR,
    Z_DATA_ERROR: Z_DATA_ERROR,
    Z_BUF_ERROR: Z_BUF_ERROR,
    Z_NO_COMPRESSION: Z_NO_COMPRESSION,
    Z_BEST_SPEED: Z_BEST_SPEED,
    Z_BEST_COMPRESSION: Z_BEST_COMPRESSION,
    Z_DEFAULT_COMPRESSION: Z_DEFAULT_COMPRESSION,
    Z_FILTERED: Z_FILTERED,
    Z_HUFFMAN_ONLY: Z_HUFFMAN_ONLY,
    Z_RLE: Z_RLE,
    Z_FIXED: Z_FIXED,
    Z_DEFAULT_STRATEGY: Z_DEFAULT_STRATEGY,
    Z_BINARY: Z_BINARY,
    Z_TEXT: Z_TEXT,
    Z_UNKNOWN: Z_UNKNOWN,
    Z_DEFLATED: Z_DEFLATED,
    Zlib: Zlib$1
  })

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

  function assert (a, msg) {
    if (!a) {
      throw new Error(msg)
    }
  }
  var binding$1 = {}
  Object.keys(_binding).forEach(function (key) {
    binding$1[key] = _binding[key]
  })
// zlib doesn't provide these, so kludge them in following the same
// const naming scheme zlib uses.
  binding$1.Z_MIN_WINDOWBITS = 8
  binding$1.Z_MAX_WINDOWBITS = 15
  binding$1.Z_DEFAULT_WINDOWBITS = 15

// fewer than 64 bytes per chunk is stupid.
// technically it could work with as few as 8, but even 64 bytes
// is absurdly low.  Usually a MB or more is best.
  binding$1.Z_MIN_CHUNK = 64
  binding$1.Z_MAX_CHUNK = Infinity
  binding$1.Z_DEFAULT_CHUNK = 16 * 1024

  binding$1.Z_MIN_MEMLEVEL = 1
  binding$1.Z_MAX_MEMLEVEL = 9
  binding$1.Z_DEFAULT_MEMLEVEL = 8

  binding$1.Z_MIN_LEVEL = -1
  binding$1.Z_MAX_LEVEL = 9
  binding$1.Z_DEFAULT_LEVEL = binding$1.Z_DEFAULT_COMPRESSION

// translation table for return codes.
  var codes = {
    Z_OK: binding$1.Z_OK,
    Z_STREAM_END: binding$1.Z_STREAM_END,
    Z_NEED_DICT: binding$1.Z_NEED_DICT,
    Z_ERRNO: binding$1.Z_ERRNO,
    Z_STREAM_ERROR: binding$1.Z_STREAM_ERROR,
    Z_DATA_ERROR: binding$1.Z_DATA_ERROR,
    Z_MEM_ERROR: binding$1.Z_MEM_ERROR,
    Z_BUF_ERROR: binding$1.Z_BUF_ERROR,
    Z_VERSION_ERROR: binding$1.Z_VERSION_ERROR
  }

  Object.keys(codes).forEach(function (k) {
    codes[codes[k]] = k
  })

  function createDeflate (o) {
    return new Deflate(o)
  }

  function createInflate (o) {
    return new Inflate(o)
  }

  function createDeflateRaw (o) {
    return new DeflateRaw(o)
  }

  function createInflateRaw (o) {
    return new InflateRaw(o)
  }

  function createGzip (o) {
    return new Gzip(o)
  }

  function createGunzip (o) {
    return new Gunzip(o)
  }

  function createUnzip (o) {
    return new Unzip(o)
  }

// Convenience methods.
// compress/decompress a string or buffer in one step.
  function deflate (buffer, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    return zlibBuffer(new Deflate(opts), buffer, callback)
  }

  function deflateSync (buffer, opts) {
    return zlibBufferSync(new Deflate(opts), buffer)
  }

  function gzip (buffer, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    return zlibBuffer(new Gzip(opts), buffer, callback)
  }

  function gzipSync (buffer, opts) {
    return zlibBufferSync(new Gzip(opts), buffer)
  }

  function deflateRaw (buffer, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    return zlibBuffer(new DeflateRaw(opts), buffer, callback)
  }

  function deflateRawSync (buffer, opts) {
    return zlibBufferSync(new DeflateRaw(opts), buffer)
  }

  function unzip (buffer, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    return zlibBuffer(new Unzip(opts), buffer, callback)
  }

  function unzipSync (buffer, opts) {
    return zlibBufferSync(new Unzip(opts), buffer)
  }

  function inflate (buffer, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    return zlibBuffer(new Inflate(opts), buffer, callback)
  }

  function inflateSync (buffer, opts) {
    return zlibBufferSync(new Inflate(opts), buffer)
  }

  function gunzip (buffer, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    return zlibBuffer(new Gunzip(opts), buffer, callback)
  }

  function gunzipSync (buffer, opts) {
    return zlibBufferSync(new Gunzip(opts), buffer)
  }

  function inflateRaw (buffer, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    return zlibBuffer(new InflateRaw(opts), buffer, callback)
  }

  function inflateRawSync (buffer, opts) {
    return zlibBufferSync(new InflateRaw(opts), buffer)
  }

  function zlibBuffer (engine, buffer, callback) {
    var buffers = []
    var nread = 0

    engine.on('error', onError)
    engine.on('end', onEnd)

    engine.end(buffer)
    flow()

    function flow () {
      var chunk
      while ((chunk = engine.read()) !== null) {
        buffers.push(chunk)
        nread += chunk.length
      }
      engine.once('readable', flow)
    }

    function onError (err) {
      engine.removeListener('end', onEnd)
      engine.removeListener('readable', flow)
      callback(err)
    }

    function onEnd () {
      var buf = Buffer.concat(buffers, nread)
      buffers = []
      callback(null, buf)
      engine.close()
    }
  }

  function zlibBufferSync (engine, buffer) {
    if (typeof buffer === 'string') buffer = new Buffer(buffer)
    if (!Buffer.isBuffer(buffer)) throw new TypeError('Not a string or buffer')

    var flushFlag = binding$1.Z_FINISH

    return engine._processChunk(buffer, flushFlag)
  }

// generic zlib
// minimal 2-byte header
  function Deflate (opts) {
    if (!(this instanceof Deflate)) return new Deflate(opts)
    Zlib.call(this, opts, binding$1.DEFLATE)
  }

  function Inflate (opts) {
    if (!(this instanceof Inflate)) return new Inflate(opts)
    Zlib.call(this, opts, binding$1.INFLATE)
  }

// gzip - bigger header, same deflate compression
  function Gzip (opts) {
    if (!(this instanceof Gzip)) return new Gzip(opts)
    Zlib.call(this, opts, binding$1.GZIP)
  }

  function Gunzip (opts) {
    if (!(this instanceof Gunzip)) return new Gunzip(opts)
    Zlib.call(this, opts, binding$1.GUNZIP)
  }

// raw - no header
  function DeflateRaw (opts) {
    if (!(this instanceof DeflateRaw)) return new DeflateRaw(opts)
    Zlib.call(this, opts, binding$1.DEFLATERAW)
  }

  function InflateRaw (opts) {
    if (!(this instanceof InflateRaw)) return new InflateRaw(opts)
    Zlib.call(this, opts, binding$1.INFLATERAW)
  }

// auto-detect header.
  function Unzip (opts) {
    if (!(this instanceof Unzip)) return new Unzip(opts)
    Zlib.call(this, opts, binding$1.UNZIP)
  }

// the Zlib class they all inherit from
// This thing manages the queue of requests, and returns
// true or false if there is anything in the queue when
// you call the .write() method.

  function Zlib (opts, mode) {
    this._opts = opts = opts || {}
    this._chunkSize = opts.chunkSize || binding$1.Z_DEFAULT_CHUNK

    Transform$1.call(this, opts)

    if (opts.flush) {
      if (opts.flush !== binding$1.Z_NO_FLUSH && opts.flush !== binding$1.Z_PARTIAL_FLUSH && opts.flush !== binding$1.Z_SYNC_FLUSH && opts.flush !== binding$1.Z_FULL_FLUSH && opts.flush !== binding$1.Z_FINISH && opts.flush !== binding$1.Z_BLOCK) {
        throw new Error('Invalid flush flag: ' + opts.flush)
      }
    }
    this._flushFlag = opts.flush || binding$1.Z_NO_FLUSH

    if (opts.chunkSize) {
      if (opts.chunkSize < binding$1.Z_MIN_CHUNK || opts.chunkSize > binding$1.Z_MAX_CHUNK) {
        throw new Error('Invalid chunk size: ' + opts.chunkSize)
      }
    }

    if (opts.windowBits) {
      if (opts.windowBits < binding$1.Z_MIN_WINDOWBITS || opts.windowBits > binding$1.Z_MAX_WINDOWBITS) {
        throw new Error('Invalid windowBits: ' + opts.windowBits)
      }
    }

    if (opts.level) {
      if (opts.level < binding$1.Z_MIN_LEVEL || opts.level > binding$1.Z_MAX_LEVEL) {
        throw new Error('Invalid compression level: ' + opts.level)
      }
    }

    if (opts.memLevel) {
      if (opts.memLevel < binding$1.Z_MIN_MEMLEVEL || opts.memLevel > binding$1.Z_MAX_MEMLEVEL) {
        throw new Error('Invalid memLevel: ' + opts.memLevel)
      }
    }

    if (opts.strategy) {
      if (opts.strategy != binding$1.Z_FILTERED && opts.strategy != binding$1.Z_HUFFMAN_ONLY && opts.strategy != binding$1.Z_RLE && opts.strategy != binding$1.Z_FIXED && opts.strategy != binding$1.Z_DEFAULT_STRATEGY) {
        throw new Error('Invalid strategy: ' + opts.strategy)
      }
    }

    if (opts.dictionary) {
      if (!Buffer.isBuffer(opts.dictionary)) {
        throw new Error('Invalid dictionary: it should be a Buffer instance')
      }
    }

    this._binding = new binding$1.Zlib(mode)

    var self = this
    this._hadError = false
    this._binding.onerror = function (message, errno) {
    // there is no way to cleanly recover.
    // continuing only obscures problems.
      self._binding = null
      self._hadError = true

      var error = new Error(message)
      error.errno = errno
      error.code = binding$1.codes[errno]
      self.emit('error', error)
    }

    var level = binding$1.Z_DEFAULT_COMPRESSION
    if (typeof opts.level === 'number') level = opts.level

    var strategy = binding$1.Z_DEFAULT_STRATEGY
    if (typeof opts.strategy === 'number') strategy = opts.strategy

    this._binding.init(opts.windowBits || binding$1.Z_DEFAULT_WINDOWBITS, level, opts.memLevel || binding$1.Z_DEFAULT_MEMLEVEL, strategy, opts.dictionary)

    this._buffer = new Buffer(this._chunkSize)
    this._offset = 0
    this._closed = false
    this._level = level
    this._strategy = strategy

    this.once('end', this.close)
  }

  inherits$1(Zlib, Transform$1)

  Zlib.prototype.params = function (level, strategy, callback) {
    if (level < binding$1.Z_MIN_LEVEL || level > binding$1.Z_MAX_LEVEL) {
      throw new RangeError('Invalid compression level: ' + level)
    }
    if (strategy != binding$1.Z_FILTERED && strategy != binding$1.Z_HUFFMAN_ONLY && strategy != binding$1.Z_RLE && strategy != binding$1.Z_FIXED && strategy != binding$1.Z_DEFAULT_STRATEGY) {
      throw new TypeError('Invalid strategy: ' + strategy)
    }

    if (this._level !== level || this._strategy !== strategy) {
      var self = this
      this.flush(binding$1.Z_SYNC_FLUSH, function () {
        self._binding.params(level, strategy)
        if (!self._hadError) {
          self._level = level
          self._strategy = strategy
          if (callback) callback()
        }
      })
    } else {
      process.nextTick(callback)
    }
  }

  Zlib.prototype.reset = function () {
    return this._binding.reset()
  }

// This is the _flush function called by the transform class,
// internally, when the last chunk has been written.
  Zlib.prototype._flush = function (callback) {
    this._transform(new Buffer(0), '', callback)
  }

  Zlib.prototype.flush = function (kind, callback) {
    var ws = this._writableState

    if (typeof kind === 'function' || kind === void 0 && !callback) {
      callback = kind
      kind = binding$1.Z_FULL_FLUSH
    }

    if (ws.ended) {
      if (callback) process.nextTick(callback)
    } else if (ws.ending) {
      if (callback) this.once('end', callback)
    } else if (ws.needDrain) {
      var self = this
      this.once('drain', function () {
        self.flush(callback)
      })
    } else {
      this._flushFlag = kind
      this.write(new Buffer(0), '', callback)
    }
  }

  Zlib.prototype.close = function (callback) {
    if (callback) process.nextTick(callback)

    if (this._closed) return

    this._closed = true

    this._binding.close()

    var self = this
    process.nextTick(function () {
      self.emit('close')
    })
  }

  Zlib.prototype._transform = function (chunk, encoding, cb) {
    var flushFlag
    var ws = this._writableState
    var ending = ws.ending || ws.ended
    var last = ending && (!chunk || ws.length === chunk.length)

    if (!chunk === null && !Buffer.isBuffer(chunk)) return cb(new Error('invalid input'))

  // If it's the last chunk, or a final flush, we use the Z_FINISH flush flag.
  // If it's explicitly flushing at some other time, then we use
  // Z_FULL_FLUSH. Otherwise, use Z_NO_FLUSH for maximum compression
  // goodness.
    if (last) flushFlag = binding$1.Z_FINISH; else {
      flushFlag = this._flushFlag
    // once we've flushed the last of the queue, stop flushing and
    // go back to the normal behavior.
      if (chunk.length >= ws.length) {
        this._flushFlag = this._opts.flush || binding$1.Z_NO_FLUSH
      }
    }

    this._processChunk(chunk, flushFlag, cb)
  }

  Zlib.prototype._processChunk = function (chunk, flushFlag, cb) {
    var availInBefore = chunk && chunk.length
    var availOutBefore = this._chunkSize - this._offset
    var inOff = 0

    var self = this

    var async = typeof cb === 'function'

    if (!async) {
      var buffers = []
      var nread = 0

      var error
      this.on('error', function (er) {
        error = er
      })

      do {
        var res = this._binding.writeSync(flushFlag, chunk, // in
      inOff, // in_off
      availInBefore, // in_len
      this._buffer, // out
      this._offset, // out_off
      availOutBefore) // out_len
      } while (!this._hadError && callback(res[0], res[1]))

      if (this._hadError) {
        throw error
      }

      var buf = Buffer.concat(buffers, nread)
      this.close()

      return buf
    }

    var req = this._binding.write(flushFlag, chunk, // in
  inOff, // in_off
  availInBefore, // in_len
  this._buffer, // out
  this._offset, // out_off
  availOutBefore) // out_len

    req.buffer = chunk
    req.callback = callback

    function callback (availInAfter, availOutAfter) {
      if (self._hadError) return

      var have = availOutBefore - availOutAfter
      assert(have >= 0, 'have should not go down')

      if (have > 0) {
        var out = self._buffer.slice(self._offset, self._offset + have)
        self._offset += have
      // serve some output to the consumer.
        if (async) {
          self.push(out)
        } else {
          buffers.push(out)
          nread += out.length
        }
      }

    // exhausted the output buffer, or used all the input create a new one.
      if (availOutAfter === 0 || self._offset >= self._chunkSize) {
        availOutBefore = self._chunkSize
        self._offset = 0
        self._buffer = new Buffer(self._chunkSize)
      }

      if (availOutAfter === 0) {
      // Not actually done.  Need to reprocess.
      // Also, update the availInBefore to the availInAfter value,
      // so that if we have to hit it a third (fourth, etc.) time,
      // it'll have the correct byte counts.
        inOff += availInBefore - availInAfter
        availInBefore = availInAfter

        if (!async) return true

        var newReq = self._binding.write(flushFlag, chunk, inOff, availInBefore, self._buffer, self._offset, self._chunkSize)
        newReq.callback = callback // this same function
        newReq.buffer = chunk
        return
      }

      if (!async) return false

    // finished with the chunk.
      cb()
    }
  }

  inherits$1(Deflate, Zlib)
  inherits$1(Inflate, Zlib)
  inherits$1(Gzip, Zlib)
  inherits$1(Gunzip, Zlib)
  inherits$1(DeflateRaw, Zlib)
  inherits$1(InflateRaw, Zlib)
  inherits$1(Unzip, Zlib)
  var zlib = {
    codes: codes,
    createDeflate: createDeflate,
    createInflate: createInflate,
    createDeflateRaw: createDeflateRaw,
    createInflateRaw: createInflateRaw,
    createGzip: createGzip,
    createGunzip: createGunzip,
    createUnzip: createUnzip,
    deflate: deflate,
    deflateSync: deflateSync,
    gzip: gzip,
    gzipSync: gzipSync,
    deflateRaw: deflateRaw,
    deflateRawSync: deflateRawSync,
    unzip: unzip,
    unzipSync: unzipSync,
    inflate: inflate,
    inflateSync: inflateSync,
    gunzip: gunzip,
    gunzipSync: gunzipSync,
    inflateRaw: inflateRaw,
    inflateRawSync: inflateRawSync,
    Deflate: Deflate,
    Inflate: Inflate,
    Gzip: Gzip,
    Gunzip: Gunzip,
    DeflateRaw: DeflateRaw,
    InflateRaw: InflateRaw,
    Unzip: Unzip,
    Zlib: Zlib
  }

  const format$2 = URL.format

  bluebird_1.promisifyAll(zlib)

  const DEFAULT_SHARD = 'shard0'
  const OFFICIAL_HISTORY_INTERVAL = 100
  const PRIVATE_HISTORY_INTERVAL = 20

  class RawAPI extends EventEmitter {
    constructor (opts = {}) {
      super()
      this.setServer(opts)
      let self = this
      this.raw = {
        version () {
          return self.req('GET', '/api/version')
        },
        authmod () {
          if (self.isOfficialServer()) {
            return bluebird_1.resolve({ name: 'official' })
          }
          return self.req('GET', '/api/authmod')
        },
        history (room, tick, shard = DEFAULT_SHARD) {
          if (self.isOfficialServer()) {
            tick -= tick % OFFICIAL_HISTORY_INTERVAL
            return self.req('GET', `/room-history/${shard}/${room}/${tick}.json`)
          } else {
            tick -= tick % PRIVATE_HISTORY_INTERVAL
            return self.req('GET', `/room-history?room=${room}&time=${tick}`)
          }
        },
        auth: {
          signin (email, password) {
            return self.req('POST', '/api/auth/signin', { email, password })
          },
          steamTicket (ticket, useNativeAuth = false) {
            return self.req('POST', '/api/auth/steam-ticket', { ticket, useNativeAuth })
          },
          me () {
            return self.req('GET', '/api/auth/me')
          }
        },
        register: {
          checkEmail (email) {
            return self.req('GET', '/api/register/check-email', { email })
          },
          checkUsername (username) {
            return self.req('GET', '/api/register/check-username', { username })
          },
          setUsername (username) {
            return self.req('POST', '/api/register/set-username', { username })
          },
          submit (username, email, password, modules) {
            return self.req('POST', '/api/register/submit', { username, email, password, modules })
          }
        },
        userMessages: {
          list (respondent) {
            return self.req('GET', '/api/user/messages/list', { respondent })
          },
          index () {
            return self.req('GET', '/api/user/messages/index')
          },
          unreadCount () {
            return self.req('GET', '/api/user/messages/unread-count')
          },
          send (respondent, text) {
            return self.req('POST', '/api/user/messages/send', { respondent, text })
          },
          markRead (id) {
            return self.req('POST', '/api/user/messages/mark-read', { id })
          }
        },
        game: {
          mapStats (rooms, statName, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/map-stats', { rooms, statName, shard })
          },
          genUniqueObjectName (type, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/gen-unique-object-name', { type, shard })
          },
          checkUniqueObjectName (type, name, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/check-unique-object-name', { type, name, shard })
          },
          placeSpawn (room, x, y, name, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/place-spawn', { name, room, x, y, shard })
          },
          createFlag (room, x, y, name, color = 1, secondaryColor = 1, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/create-flag', { name, room, x, y, color, secondaryColor, shard })
          },
          genUniqueFlagName (shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/gen-unique-flag-name', { shard })
          },
          checkUniqueFlagName (name, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/check-unique-flag-name', { name, shard })
          },
          changeFlagColor (color = 1, secondaryColor = 1, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/change-flag-color', { color, secondaryColor, shard })
          },
          removeFlag (room, name, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/remove-flag', { name, room, shard })
          },
          addObjectIntent (room, name, intent, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/add-object-intent', { room, name, intent, shard })
          },
          createConstruction (room, x, y, structureType, name, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/create-construction', { room, x, y, structureType, name, shard })
          },
          setNotifyWhenAttacked (_id, enabled = true, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/set-notify-when-attacked', { _id, enabled, shard })
          },
          createInvader (room, x, y, size, type, boosted = false, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/create-invader', { room, x, y, size, type, boosted, shard })
          },
          removeInvader (_id, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/game/remove-invader', { _id, shard })
          },
          time (shard = DEFAULT_SHARD) {
            return self.req('GET', '/api/game/time', { shard })
          },
          worldSize (shard = DEFAULT_SHARD) {
            return self.req('GET', '/api/game/world-size', { shard })
          },
          roomTerrain (room, encoded = 1, shard = DEFAULT_SHARD) {
            return self.req('GET', '/api/game/room-terrain', { room, encoded, shard })
          },
          roomStatus (room, shard = DEFAULT_SHARD) {
            return self.req('GET', '/api/game/room-status', { room, shard })
          },
          roomOverview (room, interval = 8, shard = DEFAULT_SHARD) {
            return self.req('GET', '/api/game/room-overview', { room, interval, shard })
          },
          market: {
            ordersIndex (shard = DEFAULT_SHARD) {
              return self.req('GET', '/api/game/market/orders-index', { shard })
            },
            myOrders () {
              return self.req('GET', '/api/game/market/my-orders').then(this.mapToShard)
            },
            orders (resourceType, shard = DEFAULT_SHARD) {
              return self.req('GET', '/api/game/market/orders', { resourceType, shard })
            },
            stats (resourceType, shard = DEFAULT_SHARD) {
              return self.req('GET', '/api/game/market/stats', { resourceType, shard })
            }
          },
          shards: {
            info () {
              return self.req('GET', '/api/game/shards/info')
            }
          }
        },
        leaderboard: {
          list (limit = 10, mode = 'world', offset = 0, season) {
            if (mode !== 'world' && mode !== 'power') throw new Error('incorrect mode parameter')
            if (!season) season = self.currentSeason()
            return self.req('GET', '/api/leaderboard/list', { limit, mode, offset, season })
          },
          find (username, mode = 'world', season = '') {
            return self.req('GET', '/api/leaderboard/find', { season, mode, username })
          },
          seasons () {
            return self.req('GET', '/api/leaderboard/seasons')
          }
        },
        user: {
          badge (badge) {
            return self.req('POST', '/api/user/badge', { badge })
          },
          respawn () {
            return self.req('POST', '/api/user/respawn')
          },
          setActiveBranch (branch, activeName) {
            return self.req('POST', '/api/user/set-active-branch', { branch, activeName })
          },
          cloneBranch (branch, newName, defaultModules) {
            return self.req('POST', '/api/user/clone-branch', { branch, newName, defaultModules })
          },
          deleteBranch (branch) {
            return self.req('POST', '/api/user/delete-branch', { branch })
          },
          notifyPrefs (prefs) {
          // disabled,disabledOnMessages,sendOnline,interval,errorsInterval
            return self.req('POST', '/api/user/notify-prefs', prefs)
          },
          tutorialDone () {
            return self.req('POST', '/api/user/tutorial-done')
          },
          email (email) {
            return self.req('POST', '/api/user/email', { email })
          },
          worldStartRoom (shard) {
            return self.req('GET', '/api/user/world-start-room', { shard })
          },
          worldStatus () {
            return self.req('GET', '/api/user/world-status')
          },
          branches () {
            return self.req('GET', '/api/user/branches')
          },
          code: {
            get (branch) {
              return self.req('GET', '/api/user/code', { branch })
            },
            set (branch, modules, _hash) {
              if (!_hash) _hash = Date.now()
              return self.req('POST', '/api/user/code', { branch, modules, _hash })
            }
          },
          respawnProhibitedRooms () {
            return self.req('GET', '/api/user/respawn-prohibited-rooms')
          },
          memory: {
            get (path, shard = DEFAULT_SHARD) {
              return self.req('GET', '/api/user/memory', { path, shard })
            },
            set (path, value, shard = DEFAULT_SHARD) {
              return self.req('POST', '/api/user/memory', { path, value, shard })
            },
            segment: {
              get (segment, shard = DEFAULT_SHARD) {
                return self.req('GET', '/api/user/memory-segment', { segment, shard })
              },
              set (segment, data, shard = DEFAULT_SHARD) {
                return self.req('POST', '/api/user/memory-segment', { segment, data, shard })
              }
            }
          },
          find (username) {
            return self.req('GET', '/api/user/find', { username })
          },
          findById (id) {
            return self.req('GET', '/api/user/find', { id })
          },
          stats (interval) {
            return self.req('GET', '/api/user/stats', { interval })
          },
          rooms (id) {
            return self.req('GET', '/api/user/rooms', { id }).then(this.mapToShard)
          },
          overview (interval, statName) {
            return self.req('GET', '/api/user/overview', { interval, statName })
          },
          moneyHistory (page = 0) {
            return self.req('GET', '/api/user/money-history', { page })
          },
          console (expression, shard = DEFAULT_SHARD) {
            return self.req('POST', '/api/user/console', { expression, shard })
          }
        }
      }
    }
    currentSeason () {
      let now = new Date()
      let year = now.getFullYear()
      let month = (now.getUTCMonth() + 1).toString()
      if (month.length === 1) month = `0${month}`
      return `${year}-${month}`
    }
    isOfficialServer () {
      return this.opts.url.match(/screeps\.com/) !== null
    }
    mapToShard (res) {
      if (!res.shards) {
        res.shards = {
          [DEFAULT_SHARD]: res.list || res.rooms
        }
      }
      return res
    }
    setServer (opts) {
      if (!this.opts) {
        this.opts = {}
      }
      Object.assign(this.opts, opts)
      if (opts.path && !opts.pathname) {
        this.opts.pathname = this.opts.path
      }
      if (!opts.url) {
        this.opts.url = format$2(this.opts)
        if (!this.opts.url.endsWith('/')) this.opts.url += '/'
      }
      if (opts.token) {
        this.token = opts.token
      }
    }
    auth (email, password, opts = {}) {
      var _this = this

      return asyncToGenerator(function * () {
        _this.setServer(opts)
        if (email && password) {
          Object.assign(_this.opts, { email, password })
        }
        let res = yield _this.raw.auth.signin(_this.opts.email, _this.opts.password)
        _this.emit('token', res.token)
        _this.emit('auth')
        _this.__authed = true
        return res
      })()
    }
    req (method, path, body = {}) {
      var _this2 = this

      return asyncToGenerator(function * () {
        let opts = {
          method,
          headers: {
            'X-Token': _this2.token,
            'X-Username': _this2.token
          }
        }
        if (path.startsWith('/')) path = path.substring(1)
        let url = URL.resolve(_this2.opts.url, path)
        if (method === 'GET') {
          url += '?' + querystring.stringify(body)
        }
        if (method === 'POST') {
          opts.headers['content-type'] = 'application/json'
          opts.body = JSON.stringify(body)
        }
        let res = yield fetch(url, opts)
        if (res.status === 401) {
          if (_this2.__authed) {
            _this2.__authed = false
            yield _this2.auth(_this2.opts.email, _this2.opts.password)
          } else {
            throw new Error('Not Authorized')
          }
        }
        let token = res.headers.get('x-token')
        if (token) {
          _this2.emit('token', token)
        }
        _this2.emit('response', res)
        if (!res.ok) {
          throw new Error((yield res.text()))
        }
        res = yield res.json()
        if (typeof res.data === 'string' && res.data.slice(0, 3) === 'gz:') {
          res.data = yield _this2.gz(res.data)
        }
        return res
      })()
    }
    gz (data) {
      return asyncToGenerator(function * () {
        let buf = Buffer.from(data.slice(3), 'base64')
        let ret = yield zlib.gunzipAsync(buf)
        return JSON.parse(ret.toString())
      })()
    }
    inflate (data) {
      return asyncToGenerator(function * () {
      // es
        let buf = Buffer.from(data.slice(3), 'base64')
        let ret = yield zlib.inflateAsync(buf)
        return JSON.parse(ret.toString())
      })()
    }
}

  const DEFAULTS = {
    protocol: 'https',
    hostname: 'screeps.com',
    port: 443,
    path: '/'
  }

  class ScreepsAPI extends RawAPI {
    constructor (opts) {
      opts = Object.assign({}, DEFAULTS, opts)
      super(opts)
      this.on('token', token => {
        this.token = token
        this.raw.token = token
      })
      this.socket = new Socket(this)
      if ((this.opts.username || this.opts.email) && this.opts.password) {
        this.auth(this.opts.username || this.opts.email, this.opts.password)
      }
    }
    me () {
      var _this = this

      return asyncToGenerator(function * () {
        _this.user = yield _this.raw.auth.me()
        return _this.user
      })()
    }
    get history () {
      return this.raw.history
    }
    get authmod () {
      return this.raw.authmod
    }
    get version () {
      return this.raw.version
    }
    get time () {
      return this.raw.game.time
    }
    get leaderboard () {
      return this.raw.leaderboard
    }
    get market () {
      return this.raw.game.market
    }
    get registerUser () {
      return this.raw.register.submit
    }
    get code () {
      return this.raw.user.code
    }
    get memory () {
      return this.raw.user.memory
    }
    get segment () {
      return this.raw.user.memory.segment
    }
    get console () {
      return this.raw.user.console
    }
}

  exports.ScreepsAPI = ScreepsAPI

  return exports
}({}, WebSocket, fetch))

// import once from 'lodash/once'
const once = require('lodash/once')

const PROMISE_PENDING = 'pending'
const PROMISE_RESOLVED = 'resolved'
const PROMISE_REJECTED = 'rejected'

const pendingResolutions = []

function resolvePromise(promise, x) {
  console.log('resolve', promise._id, x, promise._state, promise._value)
  if (promise === x) {
    throw new TypeError('Promise cannot resolve itself')
  }
  if (x instanceof Promise) {
    if (x._state === PROMISE_PENDING) {
      x.then(v => resolvePromise(promise, v), e => rejectPromise(promise, e))
    }
    if (x._state === PROMISE_RESOLVED) {
      fulfillPromise(promise, x._value)
    }
    if (x._state === PROMISE_REJECTED) {
      rejectPromise(promise, x._value)
    }
  }
  if (typeof x === 'function' || typeof x === 'object') {
    try {
      const then = x.then
      if (typeof then === 'function') {
        then.call(x, v => resolvePromise(promise, v), e => rejectPromise(promise, e))
      } else {
        fulfillPromise(promise, x)
      }
    } catch (e) {
      rejectPromise(promise, e)
    }
  } else {
    fulfillPromise(promise, x)
  }
}

function fulfillPromise (promise, x) {
  console.log('fulfill', promise._id, x, promise._state, promise._value)
  if (promise._state !== PROMISE_PENDING) return
  promise._state = 'resolved'
  promise._value = x
  promise._fulfilled.forEach(fn => fn.call(promise, promise._value))
}
function rejectPromise (promise, reason) {
  console.log('reject', promise._id, promise._state, promise._value, reason.stack || reason)
  if (promise._state !== PROMISE_PENDING) return
  promise._state = 'rejected'
  promise._value = reason
  promise._rejected.forEach(fn => fn.call(promise, promise._value))
}

function isThenable(x) {
  return x && typeof x.then === 'function'
}

module.exports = class Promise {
  static handleResolutions () {
    while (pendingResolutions.length) {
      const [fn, value] = pendingResolutions.pop()
      fn(value)
    }
  }
  static resolve(v) {
    return new Promise(resolve => resolve(v))
  }
  static reject(e) {
    return new Promise((_, reject) => reject(e))
  }
  constructor (fn) {
    this._id = Math.random().toString(36).slice(-4)
    this._state = 'pending'
    this._fulfilled = []
    this._rejected = []
    this._value = undefined
    fn(v => resolvePromise(this, v), e => rejectPromise(this, e))
  }
  then(onFulfilled, onRejected) {
    let p = this
    switch(this._state) {
      case PROMISE_RESOLVED:
        if (typeof onFulfilled === 'function') {
          onFulfilled(this._value)
        }
        break
      case PROMISE_REJECTED:
        if (typeof onRejected === 'function') {
          onRejected(this._value)
        }
        break
      case PROMISE_PENDING:
        p = new Promise(() => { })
        if (typeof onFulfilled === 'function') {
          console.log('push _fulfilled fn', this._id, p._id)
          this._fulfilled.push(v => {
            try {
              const ret = onFulfilled(v)
              console.log('onFulfilled', this._id, v, ret)
              if (ret) {
                resolvePromise(p, ret)
              }
            } catch (e) {
              rejectPromise(p, e)
            }
          })
        } else {
          this._fulfilled.push(v => resolvePromise(p, v))
        }
        if (typeof onRejected === 'function') {
          console.log('push _rejected fn', this._id, p._id)
          this._rejected.push(err => {
            try {
              const ret = onRejected(err)
              console.log('onRejected', this._id, err, ret)
              if (ret) {
                resolvePromise(p, ret)
              }
            } catch (e) {
              rejectPromise(p, e)
            }
          })
        } else {
          this._rejected.push(e => rejectPromise(p, e))
        }
        break
    }
    console.log('then', this._id, p._id)
    return p
  }
  catch (onRejected) {
    this.then(null, onRejected)
  }
}
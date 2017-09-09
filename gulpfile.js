const gulp = require('gulp')
const screeps = require('gulp-screeps')
const auth = require('./auth.js')

gulp.task('default', ['screeps'])

gulp.task('screeps', [], () => {
  auth.branch = auth.branch || 'default'
  auth.ptr = auth.ptr || false
  gulp.src(`src/*.js`)
    .pipe(screeps(auth))
})
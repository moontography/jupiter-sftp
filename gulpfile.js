const gulp = require('gulp')
const nodemon = require('gulp-nodemon')
const run = require('gulp-run')

gulp.task('build', function() {
  return run('npm run build').exec()
})

gulp.task('startSftp', function(done) {
  const streamSftp = nodemon({
    exec: 'npm run sftp',
    ext: 'ts',
    tasks: ['build'],
    watch: ['src'],
    done: done,
  })

  streamSftp.on('crash', function() {
    console.error('sftp has crashed!\n')
    streamSftp.emit('restart', 10) // restart the server in 10 seconds
  })
  return streamSftp
})

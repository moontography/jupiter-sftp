import fs, { constants } from 'fs'
import crypto from 'crypto'
import path from 'path'
import { EventEmitter } from 'events'
import bunyan from 'bunyan'
import ssh2 from 'ssh2'
import JupiterFs from 'jupiter-fs'
import JupterSdk from 'jupiter-node-sdk'
import { v1 as uuidv1 } from 'uuid'
import { IStringMap } from '../types'
import config from '../config'

const jupServer = `https://nodes.gojupiter.tech`
const log = bunyan.createLogger(config.logger.options as any)

var OPEN_MODE = ssh2.SFTP_OPEN_MODE
var STATUS_CODE = ssh2.SFTP_STATUS_CODE

new ssh2.Server(
  {
    hostKeys: [fs.readFileSync(path.join(__dirname, '..', '..', 'host.key'))],
  },
  function(client, info) {
    log.debug('Client connected!')
    let jupAddy: string, jupPassphrase: string

    client
      .on('authentication', async function(ctx) {
        try {
          jupAddy = ctx.username

          switch (ctx.method) {
            case 'password':
              jupPassphrase = ctx.password

              const client = JupterSdk({
                server: jupServer,
                address: jupAddy,
                passphrase: jupPassphrase,
              })
              const {
                address: addyToCheckAgainst,
              } = await client.getAddressFromPassphrase(jupPassphrase)
              if (
                jupAddy !== addyToCheckAgainst ||
                !crypto.timingSafeEqual(
                  Buffer.from(jupAddy),
                  Buffer.from(addyToCheckAgainst)
                )
              ) {
                return ctx.reject()
              }
              break
            case 'none':
              return ctx.reject(['password'])
            default:
              return ctx.reject()
          }

          log.debug(`user authenticated with SFTP server`, jupAddy)
          ctx.accept()
        } catch (err) {
          log.error(`Error with authentication`, err)
          ctx.reject()
        }
      })
      .on('ready', function() {
        log.debug('Client authenticated!')

        let readDataBuffer: any = {},
          eofState: any = {}

        const jupFs = JupiterFs({
          server: jupServer,
          address: jupAddy,
          passphrase: jupPassphrase,
          feeNQT: 4000,
        })

        client.on('session', function(accept, reject) {
          const openFileNames: IStringMap = {}
          const openFileData: IStringMap = {}
          var session = accept()
          patchEmitter(session, log)
          session.on('sftp', function(accept, reject) {
            log.debug('Client SFTP session')
            // `sftpStream` is an `SFTPStream` instance in server mode
            // see: https://github.com/mscdex/ssh2-streams/blob/master/SFTPStream.md
            var sftpStream = accept()
            patchEmitter(sftpStream, log)
            sftpStream
              .on('OPEN', function(reqid, filename, flags, attrs) {
                log.debug('OPEN', reqid, filename, flags, attrs)
                const handle = Buffer.from(uuidv1())
                openFileNames[handle.toString('utf-8')] = filename.slice(1)
                sftpStream.handle(reqid, handle)
              })
              .on('READ', async function(reqid, handle, offset, length) {
                try {
                  log.debug('READ', reqid, handle, offset, length)
                  const uuid = handle.toString('utf-8')
                  const dataBuffer = readDataBuffer[uuid] as Buffer

                  if (dataBuffer) {
                    // send EOF if there is no more data left to send
                    if (offset > dataBuffer.length) {
                      delete readDataBuffer[uuid]
                      return sftpStream.status(reqid, STATUS_CODE.EOF)
                    }

                    sftpStream.data(
                      reqid,
                      dataBuffer.slice(offset, offset + length)
                    )
                  }

                  const fileName = openFileNames[handle.toString('utf-8')]
                  if (!fileName)
                    return sftpStream.status(
                      reqid,
                      STATUS_CODE.FAILURE,
                      `You need to open the file first before we can access it's data.`
                    )

                  const fileBuffer: Buffer = await jupFs.getFile({
                    name: fileName,
                  })
                  readDataBuffer[uuid] = fileBuffer
                  sftpStream.data(
                    reqid,
                    fileBuffer.slice(offset, offset + length)
                  )
                } catch (err) {
                  log.error(`READ error`, err)
                  sftpStream.status(
                    reqid,
                    STATUS_CODE.FAILURE,
                    `There was an error reading this file.`
                  )
                }
              })
              .on('WRITE', function(reqid, handle, offset, data) {
                log.debug('WRITE', reqid, handle, offset, data)
                const uuid = handle.toString('utf-8')
                openFileData[uuid] = openFileData[uuid]
                  ? Buffer.concat([openFileData[uuid], data])
                  : data
                sftpStream.status(reqid, STATUS_CODE.OK)
              })
              .on('FSTAT', function(reqid, handle) {
                log.error('FSTAT', reqid, handle)
                sftpStream.status(reqid, STATUS_CODE.OP_UNSUPPORTED)
              })
              .on('FSETSTAT', function(reqid, handle, attrs) {
                // NOOPing for now
                log.debug('FSETSTAT', reqid, handle, attrs)
                sftpStream.status(reqid, STATUS_CODE.OK)
              })
              .on('OPENDIR', function(reqid, path) {
                log.debug('OPENDIR', reqid, path)
                const handle = Buffer.from(uuidv1())
                sftpStream.handle(reqid, handle)
              })
              .on('READDIR', async function(reqid, handle) {
                try {
                  log.debug('READDIR', reqid, handle)
                  const uuid = handle.toString('utf-8')
                  if (eofState[uuid]) {
                    delete eofState[uuid]
                    return sftpStream.status(reqid, STATUS_CODE.EOF)
                  }

                  eofState[uuid] = true
                  const files = await jupFs.ls()
                  sftpStream.name(
                    reqid,
                    files.map((file: IStringMap) => ({
                      filename: file.fileName,
                      longname: `/${file.fileName}`,
                      attrs: {
                        mode: OPEN_MODE.READ,
                        uid: 0,
                        gid: 0,
                        size: file.fileSize,
                        atime: 0,
                        mtime: 0,
                      },
                    }))
                  )
                } catch (err) {
                  log.error(`READDIR error`, err)
                  sftpStream.status(
                    reqid,
                    STATUS_CODE.FAILURE,
                    `There was an error reading this directory.`
                  )
                }
              })
              .on('LSTAT', onStat('LSTAT', sftpStream, jupFs))
              .on('STAT', onStat('STAT', sftpStream, jupFs))
              .on('REMOVE', function(reqid, path) {
                log.error('REMOVE', reqid, path)
                sftpStream.status(reqid, STATUS_CODE.OP_UNSUPPORTED)
              })
              .on('RMDIR', function(reqid, path) {
                log.error('RMDIR', reqid, path)
                sftpStream.status(reqid, STATUS_CODE.OP_UNSUPPORTED)
              })
              .on('REALPATH', function(reqid, path) {
                log.debug('REALPATH', reqid, path)
                sftpStream.name(reqid, [
                  {
                    filename: '',
                    longname: '/',
                    attrs: {
                      mode: OPEN_MODE.READ,
                      uid: 0,
                      gid: 0,
                      size: 0,
                      atime: 0,
                      mtime: 0,
                    },
                  },
                ])
              })
              .on('READLINK', function(reqid, path) {
                log.error('READLINK', reqid, path)
                sftpStream.status(reqid, STATUS_CODE.OP_UNSUPPORTED)
              })
              .on('SETSTAT', function(reqid, path, attrs) {
                // NOOPing for now
                log.debug('SETSTAT', reqid, path, attrs)
                sftpStream.status(reqid, STATUS_CODE.OK)
              })
              .on('MKDIR', function(reqid, path, attrs) {
                log.error('MKDIR', reqid, path, attrs)
                sftpStream.status(reqid, STATUS_CODE.OP_UNSUPPORTED)
              })
              .on('RENAME', function(reqid, oldPath, newPath) {
                log.error('RENAME', reqid, oldPath, newPath)
                sftpStream.status(reqid, STATUS_CODE.OP_UNSUPPORTED)
              })
              .on('SYMLINK', function(reqid, linkPath, targetPath) {
                log.error('SYMLINK', reqid, linkPath, targetPath)
                sftpStream.status(reqid, STATUS_CODE.OP_UNSUPPORTED)
              })
              .on('CLOSE', async function(reqid, handle) {
                try {
                  log.debug('CLOSE', reqid)

                  const uuid = handle.toString('utf-8')
                  if (openFileData[uuid]) {
                    const fileName = openFileNames[uuid] || uuid
                    const fileData = openFileData[uuid]

                    await jupFs.writeFile(fileName.slice('/'), fileData)

                    delete openFileNames[uuid]
                    delete openFileData[uuid]
                  }
                  sftpStream.status(reqid, STATUS_CODE.OK)
                } catch (err) {
                  log.error(`CLOSE error`, err)
                  sftpStream.status(
                    reqid,
                    STATUS_CODE.FAILURE,
                    `There was an error closing the file.`
                  )
                }
              })
              .on('EXTENDED', function() {
                log.debug('EXTENDED', ...arguments)
              })
          })
        })
      })
      .on('error', function(err) {
        log.error(`client error`, err)
      })
      .on('end', function() {
        log.debug('Client disconnected')
      })
  }
).listen(parseInt(config.sftpServer.port), '0.0.0.0', function() {
  log.info(`listening on *:${config.sftpServer.port}`)
})

function onStat(operation: string, sftpStream: any, jupFs: any) {
  return async function onStat(reqid: number, path: string) {
    try {
      log.debug(operation, reqid, path)
      const fileName = path.slice(1)
      const files = await jupFs.ls()
      const file = files.find((f: IStringMap) => f.fileName === fileName) || {
        fileSize: 0,
      }

      let mode = constants.S_IFREG // Regular file
      mode = constants.S_IRUSR // Read for user
      mode |= constants.S_IRGRP // Read for group
      mode |= constants.S_IROTH // Read for other
      sftpStream.attrs(reqid, {
        mode,
        uid: 0,
        gid: 0,
        size: file.fileSize,
        atime: 0,
        mtime: 0,
      })
    } catch (err) {
      log.error(`STAT error`, err)
      sftpStream.status(
        reqid,
        STATUS_CODE.FAILURE,
        `There was an error reading this file.`
      )
    }
  }
}

function patchEmitter(emitter: EventEmitter, log: any) {
  var oldEmit = emitter.emit

  emitter.emit = function(): any {
    log.trace('emitter event', ...arguments)
    oldEmit.apply(emitter, arguments as any)
  }
}

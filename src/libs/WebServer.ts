import http from 'http'
import path from 'path'
import express, { NextFunction, Request, Response } from 'express'
import bunyan from 'bunyan'
import FileHelpers from './FileHelpers'
import config from '../config'

const log = bunyan.createLogger(config.logger.options as any)
const app = express()
const httpServer = new http.Server(app)

app.disable('x-powered-by')

export default function WebServer(/*portToListenOn=config.server.port, shouldListenOnPort=true*/) {
  return [
    httpServer,
    async function startServer() {
      try {
        //view engine setup
        app.set('views', path.join(config.app.rootDir, 'views'))
        app.set('view engine', 'pug')

        //static files
        app.use(
          '/public',
          express.static(path.join(config.app.rootDir, '/public'))
        )

        app.get('*', function(req: Request, res: Response) {
          FileHelpers.expressjs.convertReadmeToHtml(res)
        })

        // Express error handling
        app.use(function ExpressErrorHandler(
          err: Error,
          req: Request,
          res: Response,
          next: NextFunction
        ) {
          log.error('Express error handling', err)

          const contType = req.headers['content-type']
          const userAgent = req.headers['user-agent']
          if (
            (contType && contType === 'application/json') ||
            userAgent === 'jupiter-git-cli'
          ) {
            return res.status(500).json({
              error: `There was an error that we're looking into now. Thanks for your patience.`,
            })
          }

          res.redirect('/')
        })

        // Assume we'll listen in the primary app file via `sticky-cluster` module
        // if (shouldListenOnPort)
        //   httpServer.listen(portToListenOn, () => log.info(`listening on *: ${portToListenOn}`))
      } catch (err) {
        log.error('Error starting server', err)
        process.exit()
      } finally {
        return app
      }
    },
  ]
}

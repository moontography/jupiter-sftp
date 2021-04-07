# jupiter-sftp

**This is in an alpha state and will be changing constantly. If you use this software consider you will likely find bugs depending on the SFTP client you're using. Please add issues to this repository if/when you find them and the client you're using.**

A small [SFTP](https://www.ssh.com/academy/ssh/sftp) server that allows browsing/downloading/uploading files stored on the [Jupiter blockchain](https://gojupiter.tech). All files and file data are encrypted and secured on the blockchain.

## Usage

This repo contains two server components (one web server and one SFTP). Once the SFTP server is running, it can be connected to by any SFTP client (think things like FileZilla, Cyberduck, or any other GUI or CLI-based SFTP clients). The web server is meant to simply provide documentation (i.e what you're reading now).

### Cyberduck Example

You should connect to either a server you setup with this repo, or a Jupiter supported public server.

- **Username:** _Your funded mainnet JUP-XXXX-XXXX... Jupiter address_
- **Password:** _passphrase for the JUP-XXXX-XXXX... Jupiter address_

TODO: Screenshot(s)

## Install & Run

The quickest way to run both servers is with docker and docker-compose. If you have these installed, you should be able to execute the following in a terminal and get the web server running on `http://localhost:8000` and SFTP server running on `sftp://localhost:8022`

```sh
$ git clone https://github.com/whatl3y/jupiter-sftp
$ cd jupiter-sftp
$ touch .env
$ docker-compose up
```

## Deploy

### Docker & Docker Compose

There's a `Dockerfile` to allow you to build the container and deploy in any infrastructure or orchestration engine you'd like to use. However, for a really simple deployment that isn't supporting tons of users, you can just deploy using the normal docker compose config.

You can use `-f docker-compose.dev.yml` when running `docker-compose` if you'd like to map your local machine's file system build folder to a volume in the container to ease development when making changes. If you want to deploy `jupiter-git` to production/a public URL, it's recommended to use the normal `docker-compose.yml` configuration to ensure the build and execution is entirely inside the container.

```sh
$ # no need to specify a file w/ `-f` since docker-compose.yml is the default
$ docker-compose up
```

# Tips w/ cryptocurrency

I love FOSS (free and open source software) and for the most part don't want to charge for the software I build. It does however take a good bit of time keeping up with feature requests and bug fixes, so if you have the desire and ability to send me a free coffee, it would be greatly appreciated!

- Bitcoin (BTC): `3D779dP5SZo4szHivWHyFd6J2ESumwDmph`
- Ethereum (ETH and ERC-20 tokens): `0xF3ffa9706b3264EDd1DAa93D5F5D70C8f71fAc99`
- Stellar (XLM): `GACH6YMYFZ574FSGCV7IJXTGETEQL3DLQK64Z6DFGD57PZL5RH6LYOJT`
- Jupiter (JUP) mainnet: `JUP-TUWZ-4B8Z-9REP-2YVH5`

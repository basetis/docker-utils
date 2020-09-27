#!/usr/bin/env node
//@ts-check

const { once } = require('events')
const { argv } = require('yargs')
const Docker = require('dockerode')
process.on('unhandledRejection', up => { throw up })

const [ containerId, imageId ] = argv._

;(async function main() {
    // Connect to docker
    const engine = new Docker()
    const container = engine.getContainer(containerId)

    // Check image exists, pull otherwise
    const image = engine.getImage(imageId)
    try {
        await image.inspect()
    } catch (e) {
        if (e.statusCode !== 404) throw e
        console.log('Pulling image...')
        const req = await engine.pull(imageId)
        await once(req, 'end')
        await image.inspect()
    }

    // Check container exists and get its config
    const containerInfo = await container.inspect()

    console.log('Stopping & removing...')
    await container.stop()
    await container.remove()

    console.log('Launching new container...')
    const { Config, HostConfig, NetworkSettings, Name: name } = containerInfo
    const newContainer = await engine.createContainer({
        name, ...Config, HostConfig,
        NetworkingConfig: NetworkSettings.Networks,
        // overrides
        Image: imageId,
    })
    await newContainer.start()

    console.log('Done.')
})()

#!/usr/bin/env node
//@ts-check

const { once } = require('events')
const { argv } = require('yargs')
const Docker = require('dockerode')
const imageExists = image => image.inspect().then(() => true,
    e => (e.statusCode === 404 ? false : Promise.reject(e)))
process.on('unhandledRejection', up => { throw up })

let [ containerId, imageId ] = argv._

;(async function main() {
    // Connect to docker
    const engine = new Docker()
    const container = engine.getContainer(containerId)

    // If only a tag was given, attempt to resolve repo of running container
    if (imageId.startsWith(':')) {
        const { Image } = await container.inspect()
        const { RepoTags } = await engine.getImage(Image).inspect()
        const repos = new Set(RepoTags.map(x => /^(.+)(:.+?)$/.exec(x)[1]))
        if (repos.size === 0)
            throw Error("couldn't determine image tag of running container")
        if (repos.size > 1)
            throw Error(`image corresponds to more than one repo: ${JSON.stringify([...repos])}`)
        imageId = [...repos][0] + imageId
        console.log(`Resolved to ${imageId}`)
    }

    // Check image exists, pull otherwise
    const image = engine.getImage(imageId)
    if (!await imageExists(image)) {
        console.log('Pulling image...')
        const req = await engine.pull(imageId)
        req.resume()
        await once(req, 'end')
        if (!await imageExists(image))
            throw Error('Could not pull image')
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
    if (!['exited', 'created'].includes(containerInfo.State.Status))
        await newContainer.start()

    console.log('Done.')
})()

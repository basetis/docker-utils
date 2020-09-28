#!/usr/bin/env node
//@ts-check

const { once } = require('events')
const Docker = require('dockerode')
const imageExists = image => image.inspect().then(() => true,
    e => (e.statusCode === 404 ? false : Promise.reject(e)))
process.on('unhandledRejection', up => { throw up })

/** @type {{ argv: any }} */
const yargs = require('yargs')
    .command('$0 <container> [image_tag]',
        'Re-launch a container with a new image, preserving its config.')
    .option('pull', {
        description: "Pull the image first. If not set, the image will only be pulled if it doesn't exist, or if no image tag was passed.",
        type: 'boolean',
    })

/** @type {{ argv: { container: string, image_tag: string, pull: boolean? }}} */
const { argv } = yargs

;(async function main() {
    // Connect to docker
    const engine = new Docker()
    const container = engine.getContainer(argv.container)
    const { Config: { Image: currentImage } } = await container.inspect()

    let imageId = argv.image_tag
    if (!imageId) {
        // If no image tag was given, use current one
        imageId = currentImage
        if (argv.pull === undefined) argv.pull = true
        console.log(`Resolved to ${imageId}`)
    } else if (imageId.startsWith(':')) {
        // If only a tag was given, combine with running image
        const repo = /^(.+)(:.+?)?$/.exec(currentImage)[1]
        imageId = repo + imageId
        console.log(`Resolved to ${imageId}`)
    }

    // Check image exists, pull otherwise
    const image = engine.getImage(imageId)
    const exists = await imageExists(image)
    if (argv.pull === false && !exists)
        throw Error("Image doesn't exist")
    if (argv.pull === true || (argv.pull === undefined && !exists)) {
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
    const EndpointsConfig = getEndpointsConfig(NetworkSettings.Networks)
    const newContainer = await engine.createContainer({
        name, ...Config, HostConfig,
        NetworkingConfig: { EndpointsConfig },
        // overrides
        Image: imageId,
    })
    if (!['exited', 'created'].includes(containerInfo.State.Status))
        await newContainer.start()

    console.log('Done.')
})()

function getEndpointsConfig(Networks) {
    const EndpointsConfig = {}
    Object.keys(Networks).forEach(key => {
        const value = { ...Networks[key] }
        EndpointsConfig[key] = value
        value.IPAMConfig = { IPv4Address: value.IPAddress, ...value.IPAMConfig }
        delete value.Aliases // FIXME: look into why this is needed
    })
    return EndpointsConfig
}

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
if (!argv.image_tag && argv.pull === undefined)
    argv.pull = true

;(async function main() {
    // Connect to docker
    const engine = new Docker()
    const container = engine.getContainer(argv.container)
    const { Image: currentImage } = await container.inspect()

    let imageId = argv.image_tag
    if (!imageId) {
        // If no image tag was given, use image tag of running container
        const { RepoTags } = await engine.getImage(currentImage).inspect()
        if (RepoTags.length === 0)
            throw Error("couldn't determine image tag of running container")
        if (RepoTags.length > 1)
            throw Error(`image corresponds to more than one tag: ${JSON.stringify(RepoTags)}`)
        imageId = RepoTags[0]
        console.log(`Resolved to ${imageId}`)
    } else if (imageId.startsWith(':')) {
        // If only a tag was given, attempt to resolve repo of running container
        const { RepoTags } = await engine.getImage(currentImage).inspect()
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

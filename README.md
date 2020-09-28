# docker-utils

Some utilities for the Docker engine, used internally at Basetis.

To use, first install Node.js, then:

~~~ bash
npm i -g @basetis/docker-utils
~~~


## docker-upgrade

    docker-upgrade <container> <image_tag>

Re-launch a container with a new image, preserving its config.

To minimize downtime, the image is pulled first if necessary.
Then the container is stopped, removed, and a new one is started.

For convenience, you can just supply `:TAG` and the repo part will
be detected from the running container.

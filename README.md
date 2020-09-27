# docker-utils

Some utilities for the Docker engine, used internally at Basetis.


## docker-upgrade

    docker-upgrade <container ID> <new image tag>

Re-launch a container with a new image, preserving its config.

To minimize downtime, the image is pulled first if necessary.

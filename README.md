Scaling mediasoup-powered framework for distributing real time communications globally.

Defining scale
 - 1 room per server (scale 0)
 - Many rooms per server (scale 1) [Horizontal]
 - Many rooms on many server (scale 2) [Vertical + Horizontal]
 - 1 room on many servers (scale 3) [Distributed Horizontal]
 - Many rooms on many servers (scale 4) [Distributed Vertical + Horizontal]
 - Regional distribution to "last mile" (scale 5) [Cloud]

Four projects exist within this repository.
 - Ingress/Egress webrtc to exchange video/audio/eventdata between peers
 - Signaling websocket for coordinating webrtc servers
 - Webapp Interface Samples
 - Github/Terraform Continuous Integration Samples (to avoid manual aws setup)

Dependencies
 - Docker and docker-compose
 - Linux (or something just as good)

What this is not
This is not a Metaverse as a Service. I'd recommend framevr.io for that kind of thing.

Acknowledgments and Thanks
I would like to express my deep gratitude to framevr.io for their generosity and curiosity
in allowing me to fork the decommissioned backend as open source.

The decision to embrace the open-source spirit not only demonstrates
their commitment to the greater good but also exemplifies the potential of
collaboration in our ever-evolving tech landscape.

I extend my thanks to all the users, contributors, and well-wishers who have supported
this endeavor. Together, we're shaping the future of software, one commit at a time.
Let's continue to learn, grow, and make the world a better place.

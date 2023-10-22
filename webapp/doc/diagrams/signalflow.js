/**
 * Signaling flow for establishing, delivering, and receiving media/data
 * @file
 * @mermaid
 *  sequenceDiagram
 *    #Identity
 *    WSProcess->>PeerManager: requestIdentity
 *    PeerManager->>WSProcess: identity
 *
 *    #Join Room
 *    WSProcess->>PeerManager: joinRoom
 *    #WSProcess sends either/both ingress/egress joinRoom
 *    # Depending on if they are none, spectator, or participant
 *    par Joining Rooms
 *    PeerManager->>SignalRouter: joinRoom (ingress)
 *    SignalRouter->>MediaServer: createRouterGroup
 *    MediaServer->>SignalRouter: joinedRoom
 *    SignalRouter->>WSProcess: joinedRoom
 *
 *    #Create ingress transport to client
 *    WSProcess->>PeerManager: createIngressTransport
 *    PeerManager->>SignalRouter: createWebRTCIngress
 *    SignalRouter->>MediaServer: createWebRTCIngress
 *
 *    par StorePipe and Signal created ingress transport
 *    #Create a pipe relay to give data to egress
 *    MediaServer->>SignalRouter: storePipeRelay(from ingress)
 *    SignalRouter->>MediaServer: storePipeRelay(to egress)
 *    and
 *    #Reply to WSProcess that ingress has been created
 *    MediaServer->>SignalRouter: createdIngressTransport
 *    SignalRouter->>WSProcess: createdIngressTransport
 *    end
 *
 *    #Connect ingress transport
 *    WSProcess->>PeerManager: connectIngressTransport
 *    PeerManager->>SignalRouter: connectWebRTCIngress
 *    SignalRouter->>MediaServer: connectWebRTCIngress
 *    MediaServer->>SignalRouter: connectedIngressTransport
 *    SignalRouter->>WSProcess: connectedIngressTransport
 *
 *    and
 *
 *    #Repeat for every egress
 *    PeerManager->>SignalRouter: joinRoom (egress)
 *    SignalRouter->>MediaServer: createRouterGroup
 *    MediaServer->>SignalRouter: joinedRoom
 *    SignalRouter->>WSProcess: joinedRoom
 *
 *    #Create egress transport to client
 *    WSProcess->>PeerManager: createEgressTransport
 *    PeerManager->>SignalRouter: createWebRTCEgress
 *    SignalRouter->>MediaServer: createWebRTCEgress
 *
 *    #Reply to WSProcess that egress has been created
 *    MediaServer->>SignalRouter: createdEgressTransport
 *    SignalRouter->>WSProcess: createdEgressTransport
 *
 *    #Connect egress transport
 *    WSProcess->>PeerManager: connectEgressTransport
 *    PeerManager->>SignalRouter: connectWebRTCEgress
 *    SignalRouter->>MediaServer: connectWebRTCEgress
 *    MediaServer->>SignalRouter: connectedEgressTransport
 *    SignalRouter->>WSProcess: connectedEgressTransport
 *
 *    end
 *
 *    par  Produce Data and Produce Media (if any)
 *    #Participant flow (produces at a minimum, movement)
 *    WSProcess->>PeerManager: produceData
 *    PeerManager->>SignalRouter: produceData
 *    SignalRouter->>MediaServer: produceData
 *    par Signal client has produced data and begin to pipe that data to egress
 *    #Return to WSProcess the success of data production from server
 *    MediaServer->>SignalRouter: producedData
 *    SignalRouter->>WSProcess: producedData
 *    and
 *    #Initiate transporting movement data from ingress into egress (for peers to recv)
 *    MediaServer->>SignalRouter: createRelayProducer (from ingress)
 *    SignalRouter->>MediaServer: createRelayProducer (to egress)
 *
 *    par Complete pipe relay and announce to other peers of new movement
 *    #Completes a pipe relay to give data from ingress to egress
 *    MediaServer->>SignalRouter: connectPipeRelay (from egress)
 *    SignalRouter->>MediaServer: connectPipeRelay (to ingress)
 *    and
 *    #When new relay producer created, give new data to WSProcess (peers)
 *    MediaServer->>SignalRouter: createdRelayProducer (from ingress)
 *    SignalRouter->>MediaServer: consumeAudio|Video|Movement (to egress)
 *    MediaServer->>SignalRouter: MovementAnnouncement (from egress)
 *    SignalRouter->>WSProcess: MovementAnnouncement
 *    end
 *
 *    end
 *
 *    and
 *    
 *    WSProcess->>PeerManager: produceMedia
 *    PeerManager->>SignalRouter: produceMedia
 *    SignalRouter->>MediaServer: produceMedia
 *    par Signal client has produced media and begin to pipe that media to egress
 *    #Return to WSProcess the success of media production from server
 *    MediaServer->>SignalRouter: producedMedia
 *    SignalRouter->>WSProcess: producedMedia
 *    and
 *    #Initiate transporting movement data from ingress into egress (for peers to recv)
 *    MediaServer->>SignalRouter: createRelayProducer (from ingress)
 *    SignalRouter->>MediaServer: createRelayProducer (to egress)
 *
 *    par Complete pipe relay and announce to other peers of new audio/video
 *    #Completes a pipe relay to give data from ingress to egress
 *    MediaServer->>SignalRouter: connectPipeRelay (from egress)
 *    SignalRouter->>MediaServer: connectPipeRelay (to ingress)
 *    and
 *    #When new relay producer created, give new data to WSProcess (peers)
 *    MediaServer->>SignalRouter: createdRelayProducer (from ingress)
 *    SignalRouter->>MediaServer: consumeAudio|Video|Movement (to egress)
 *    MediaServer->>SignalRouter: Audio|VideoAnnouncement (from egress)
 *    SignalRouter->>WSProcess: Audio|VideoAnnouncement
 *    end
 *
 *    end
 *
 *    end
 */

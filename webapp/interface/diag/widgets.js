export default class ReadoutWidget {
  constructor() {
    //Peer list
    this.peers = document.createElement("DIV");
    this.peers.setAttribute("class", "peerlist");
    document.body.appendChild(this.peers);

    //Consumers list
    this.audioConsumers = document.createElement("DIV");
    this.audioConsumers.setAttribute("class", "consumerslist");
    this.audioConsumers.setAttribute("title", "Audio Consumers (from peers)");
    document.body.appendChild(this.audioConsumers);
    this.videoConsumers = document.createElement("DIV");
    this.videoConsumers.setAttribute("class", "consumerslist");
    this.videoConsumers.setAttribute("title", "Video Consumers (from peers)");
    document.body.appendChild(this.videoConsumers);
    this.movementConsumers = document.createElement("DIV");
    this.movementConsumers.setAttribute("class", "consumerslist");
    this.movementConsumers.setAttribute(
      "title",
      "Movement Received (from peers)"
    );
    document.body.appendChild(this.movementConsumers);
    this.eventConsumers = document.createElement("DIV");
    this.eventConsumers.setAttribute("class", "consumerslist");
    this.eventConsumers.setAttribute("title", "Events Recieved (from peers)");
    document.body.appendChild(this.eventConsumers);
  }

  //Add/Remove/Update Peer
  addPeer(id) {
    console.debug("Adding peer", id);
    let newPeerEntry = this.createListEntry(id);
    let indicatorEntry = document.createElement("DIV");
    indicatorEntry.setAttribute("class", "peerindicator");
    newPeerEntry.appendChild(indicatorEntry);
    newPeerEntry.dataset.peerid = id;
    this.peers.appendChild(newPeerEntry);
  }
  removePeer(id) {
    console.debug("Removing peer", id);
    let removedPeer = this.peers.querySelector('[data-peerid="' + id + '"]');
    removedPeer.remove();
    this.removeAudioConsumer(id);
    this.removeVideoConsumer(id);
    this.removeMovementConsumer(id);
  }

  setPeerIndicator(id, indicator) {
    console.debug("Setting peer indicator", indicator);
    let indicatorListEntry = this.peers.querySelector(
      '[data-peerid="' + id + '"] > .peerindicator'
    );
    indicatorListEntry.dataset.peerid = id;
    indicatorListEntry.innerHTML = JSON.stringify(indicator, 2);
  }

  //Add/Remove/Update Audio Consumer
  addAudioConsumer(id, track) {
    console.debug("Adding audio consumer", id, track);
    let newAudioConsumerEntry = this.createListEntry(id + " >>> " + track.id);
    newAudioConsumerEntry.dataset.peerid = id;
    newAudioConsumerEntry.dataset.audioconsumerid = track.id;
    this.audioConsumers.appendChild(newAudioConsumerEntry);
  }

  removeAudioConsumer(id) {
    console.debug("Removing audio consumer", id);
    let removedAudioConsumer = this.audioConsumers.querySelector(
      '[data-peerid="' + id + '"]'
    );
    removedAudioConsumer?.remove();
  }

  //Add/Remove/Update Video Consumer
  addVideoConsumer(id, track) {
    console.debug("Adding video consumer", id, track);
    let newVideoConsumerEntry = this.createListEntry(id + " >>> " + track.id);
    newVideoConsumerEntry.dataset.peerid = id;
    newVideoConsumerEntry.dataset.videoconsumerid = track.id;
    this.videoConsumers.appendChild(newVideoConsumerEntry);
  }

  removeVideoConsumer(id) {
    console.debug("Removing video consumer", id);
    let removedVideoConsumer = this.videoConsumers.querySelector(
      '[data-peerid="' + id + '"]'
    );
    removedVideoConsumer?.remove();
  }

  //Add/Remove/Update Movement Consumer
  addMovementPacket(id, movement) {
    //console.debug("Adding movement packet", id, movement);
    let movementEntry = this.movementConsumers.querySelector(
      '[data-movementconsumerid="' + id + '"]'
    );
    if (movementEntry) {
      movementEntry.innerHTML = id + " >>> " + JSON.stringify(movement);
    } else {
      let newMovementConsumerEntry = this.createListEntry(
        id + " >>> " + JSON.stringify(movement)
      );
      newMovementConsumerEntry.dataset.movementconsumerid = id;
      newMovementConsumerEntry.dataset.peerid = id;
      this.movementConsumers.appendChild(newMovementConsumerEntry);
    }
  }

  removeMovementConsumer(id) {
    console.debug("Removing movement consumer", id);
    let removedMovementConsumer = this.movementConsumers.querySelector(
      '[data-peerid="' + id + '"]'
    );
    removedMovementConsumer?.remove();
  }

  //Add/Remove/Update Event Consumer
  addEventConsumer(id, track) {
    console.debug("Adding event consumer", id, track);
    let newEventConsumerEntry = this.createListEntry(id);
    newEventConsumerEntry.dataset.peerid = id;
    newEventConsumerEntry.dataset.eventconsumerid = id;
    this.eventConsumers.appendChild(newEventConsumerEntry);
  }

  //Add/Remove/Update Audio Producer
  //Add/Remove/Update Video Producer
  //Add/Remove/Update Movement Producer
  //Add/Remove/Update Event Producer

  //Add signal

  //Private functions
  //Make container with LED
  createListEntry(entryText) {
    let listEntry = document.createElement("DIV");
    listEntry.setAttribute("class", "listentry");
    let listtext = document.createElement("DIV");
    listtext.setAttribute("class", "listtext");
    listtext.innerHTML = entryText;
    let ledBox = document.createElement("DIV");
    ledBox.setAttribute("class", "led-success");
    listEntry.appendChild(ledBox);
    listEntry.appendChild(listtext);

    return listEntry;
  }
}

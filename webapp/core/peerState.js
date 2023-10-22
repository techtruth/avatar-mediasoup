import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";

export default createStore(
  subscribeWithSelector((set, get) => ({
    facades: {},
    avatars: {},
    assetBindings: {},
    //Set/update for remote peer state
    updatePeer: (peerId, type, indicator) =>
      set((state) => {
        const stateType = { ...state[type] };
        stateType[peerId] = { ...(state[type][peerId] || {}), ...indicator };
        return {
          [type]: stateType,
        };
      }),

    //Set peer state, overwriting existing state
    setPeer: (peerId, type, indicator) =>
      set((state) => {
        ////Set the object to clear/empty
        const stateType = { ...state[type] };
        stateType[peerId] = { ...indicator }; // TODO fixme. indicator boundassets will turn into a {} if empty (not a [])
        return {
          [type]: stateType,
        };
      }),

    //Wipe peer from state tracking
    deletePeer: (peerId) =>
      set((state) => {
        let newFacades = { ...state.facades };
        let newAvatars = { ...state.avatars };
        let newAssetBindings = { ...state.assetBindings }; // TODO fixme wrong type again. it need to enforce as [] not {}.

        delete newFacades[peerId];
        delete newAvatars[peerId];
        newAssetBindings[peerId] = new Object(); // TODO FIXME wrong type. it should be []. not sure why it isnt deleted.

        return {
          facades: newFacades,
          avatars: newAvatars,
          assetBindings: newAssetBindings,
        };
      }, true),

    //Wipe peer from state tracking
    checkPeer: (peerId) => {
      //return all peers when check arg is undefined
      if (peerId === undefined) {
        let peers = new Object();
        let facades = get().facades;
        let avatars = get().avatars;
        let assetBindings = get.assetBindings;

        for (let peer in facades) {
          if (!peers[peer]) {
            peers[peer] = new Object();
          }
          peers[peer].facade = facades[peer];
        }
        for (let peer in avatars) {
          if (!peers[peer]) {
            peers[peer] = new Object();
          }
          peers[peer].avatar = avatars[peer];
        }
        for (let peer in assetBindings) {
          if (!peers[peer]) {
            peers[peer] = new Object();
          }
          peers[peer].assetBindings = assetBindings[peer];
        }
        return peers;
      }

      if (
        Object.keys(get().facades).includes(peerId) ||
        Object.keys(get().avatars).includes(peerId)
      ) {
        return { avatar: get().avatars[peerId], facade: get().facades[peerId] }; //Peer exists!
      } else {
        return false; //Peer does not exist!
      }
    },
  }))
);

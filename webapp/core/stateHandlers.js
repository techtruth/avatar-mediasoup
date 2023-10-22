import stateManager from "./state";
import { debounce } from "lodash";

export const setAvatar = (avatar) => {
  const state = stateManager.getState();
  stateManager.setState({
    avatar: { ...state.avatar, ...avatar },
  });
  // ensure avatarLink is initialized
  if (window.avatarLink && state.avatarId) {
    window.avatarLink.send("peerIndicators", {
      peerId: state.avatarId,
      indicators: {
        avatar: avatar,
      },
    });
  }
};

/**
 * @param {AvatarFacade} facade
 * @param {boolean} [broadcast] - default true. whether to send update to peers, or to only show locally.
 */
export const setFacade = (facade, broadcast = true) => {
  const state = stateManager.getState();
  stateManager.setState({
    facade: { ...state.facade, ...facade },
  });
  if (broadcast && window.avatarLink && state.avatarId) {
    window.avatarLink.send("peerIndicators", {
      peerId: state.avatarId,
      indicators: {
        facade: facade,
      },
    });
  }
};

//TODO: this needs to move into state.js
// put here to avoid merge conflicts
export const addBoundAssets = (boundAssets) => {
  const state = stateManager.getState();
  const allBoundAssets = [...state.boundAssets, ...boundAssets];
  setBoundAssets(allBoundAssets);
};

const sendAssetBindings = debounce((boundAssets) => {
  if (window.avatarLink) {
    window.avatarLink.send("peerIndicators", {
      peerId: stateManager.getState().avatarId,
      indicators: {
        assetBindings: { ...boundAssets }, // TODO fixme. wrong type. empty will turn into {} instead of [].
      },
    });
  }
}, 50);

//TODO: this needs to move into state.js
// put here to avoid merge conflicts
export const setBoundAssets = (boundAssets) => {
  //First, set local state to reflect changes
  stateManager.setState({
    boundAssets: boundAssets,
  });

  // Send state changes to remote peers, but debounced by 50ms,
  // to prevent any future rapid local state changes from spamming
  // the signaling server.
  sendAssetBindings(boundAssets);
};

export const removeBoundAsset = (removedAsset) => {
  const currentBoundAssets = stateManager.getState().boundAssets;
  const remainingBoundAssets = currentBoundAssets.filter(
    (boundAsset) =>
      !(
        boundAsset.id === removedAsset.id &&
        boundAsset.type === removedAsset.type
      )
  );
  if (currentBoundAssets.length !== remainingBoundAssets.length) {
    setBoundAssets(remainingBoundAssets);
  }
};

export const updateBoundAsset = (updatedAsset) => {
  const currentBoundAssets = stateManager.getState().boundAssets;
  const iUpdated = currentBoundAssets.findIndex(
    (boundAsset) =>
      boundAsset.id === updatedAsset.id && boundAsset.type === updatedAsset.type
  );
  if (iUpdated !== -1) {
    const newBoundAssets = currentBoundAssets.slice();
    newBoundAssets[iUpdated] = updatedAsset;
    setBoundAssets(newBoundAssets);
  }
};

export const clearAvatar = (field) => {
  const state = stateManager.getState();
  state.avatar[field] = [];
  stateManager.setState({
    avatar: state.avatar,
  });
  if (window.avatarLink) {
    window.avatarLink.send("peerIndicators", {
      peerId: state.avatarId,
      indicators: { avatar: state.avatar, facade: state.facade },
    });
  }
};

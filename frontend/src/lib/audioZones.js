
import {
  PROXIMITY_RADIUS,
  SPACES,
  getRoomIdAtPosition,
} from './world.js';

// Audio policy for each virtual space.
const AUDIO_POLICIES = Object.freeze({
  studio: 'proximity',
  ideation: 'isolated',
  lounge: 'isolated',
});

/**
 * Preview who is eligible to hear whom.
 * This does not transmit microphone audio or implement WebRTC.
 */
export function getAudioZonePreview(position, peers = []) {
  const roomId = getRoomIdAtPosition(position?.x, position?.y);
  const room = SPACES.find((space) => space.id === roomId);
  const policy = roomId ? AUDIO_POLICIES[roomId] : null;
  const list = Array.isArray(peers) ? peers : [];

  const validPosition =
    Number.isFinite(position?.x) && Number.isFinite(position?.y);

  const nearbyPeers = !roomId || !validPosition
    ? []
    : list.filter((peer) => {
        if (
          !peer ||
          !Number.isFinite(peer.x) ||
          !Number.isFinite(peer.y)
        ) {
          return false;
        }

        // Participants must occupy the same space.
        if (getRoomIdAtPosition(peer.x, peer.y) !== roomId) {
          return false;
        }

        // Isolated rooms allow everyone in that room to hear each other.
        if (policy === 'isolated') {
          return true;
        }

        // Studio uses distance-based audio eligibility.
        return (
          Math.hypot(peer.x - position.x, peer.y - position.y) <=
          PROXIMITY_RADIUS
        );
      });

  return {
    roomId,
    roomLabel: room?.short || 'Outside rooms',
    policy,
    nearbyPeers,
    radius: policy === 'proximity' ? PROXIMITY_RADIUS : null,
  };
}

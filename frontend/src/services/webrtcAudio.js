import { getRoomIdAtPosition, PROXIMITY_RADIUS } from '../lib/world.js';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

const SIGNALING_ROOM = 'main';
const STUDIO_RANGE = PROXIMITY_RADIUS;

function isAudioEligible(localPosition, remotePosition) {
  if (!localPosition || !remotePosition) return false;

  const localRoom = getRoomIdAtPosition(
    localPosition.x,
    localPosition.y
  );

  const remoteRoom = getRoomIdAtPosition(
    remotePosition.x,
    remotePosition.y
  );

  if (!localRoom || !remoteRoom || localRoom !== remoteRoom) {
    return false;
  }

  // Studio uses proximity; the other rooms are isolated
  // and allow everyone in that same room to hear each other.
  if (localRoom === 'studio') {
    const dx = localPosition.x - remotePosition.x;
    const dy = localPosition.y - remotePosition.y;
    return Math.hypot(dx, dy) <= STUDIO_RANGE;
  }

  return localRoom === 'ideation' || localRoom === 'lounge';
}

export function createWebRTCAudio({
  socket,
  localStream = null,
  getLocalPosition,
  getParticipants,
  onRemoteStream = () => {},
  onRemoteStreamRemoved = () => {},
  onError = console.error,
}) {
  const peers = new Map();
  const pendingCandidates = new Map();
  const offeredPeers = new Set();

  let closed = false;

  function canHear(peerId) {
    if (closed || !socket?.connected || !peerId) return false;

    const participant = getParticipants?.()?.find(
      (person) => person.socketId === peerId
    );

    if (!participant) return false;

    return isAudioEligible(
      getLocalPosition?.(),
      participant
    );
  }

  function sendSignal(event, to, payload) {
    if (closed || !socket?.connected) return;

    socket.emit(event, {
      roomId: SIGNALING_ROOM,
      to,
      ...payload,
    });
  }

  function createPeer(peerId) {
    if (closed || !peerId || !canHear(peerId)) return null;

    if (peers.has(peerId)) return peers.get(peerId);

    const peer = new RTCPeerConnection(ICE_SERVERS);
    peers.set(peerId, peer);
    pendingCandidates.set(peerId, []);

    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });
    }

    peer.onicecandidate = ({ candidate }) => {
      if (candidate && canHear(peerId)) {
        sendSignal('rtc:ice-candidate', peerId, { candidate });
      }
    };

    peer.ontrack = ({ streams }) => {
      if (canHear(peerId) && streams?.[0]) {
        onRemoteStream(peerId, streams[0]);
      }
    };

    peer.onconnectionstatechange = () => {
      if (
        peer.connectionState === 'failed' ||
        peer.connectionState === 'closed'
      ) {
        onRemoteStreamRemoved(peerId);
      }

      if (peer.connectionState === 'failed') {
        onError(new Error(`WebRTC connection failed for ${peerId}`));
      }
    };

    return peer;
  }

  async function addPendingCandidates(peerId, peer) {
    const candidates = pendingCandidates.get(peerId) || [];
    pendingCandidates.set(peerId, []);

    for (const candidate of candidates) {
      if (!canHear(peerId)) break;

      try {
        await peer.addIceCandidate(candidate);
      } catch (error) {
        onError(error);
      }
    }
  }

  async function callPeer(peerId) {
    if (!canHear(peerId) || !socket?.id) return;

    // Only one side initiates an offer, preventing simultaneous offers.
    if (socket.id.localeCompare(peerId) > 0) return;

    const peer = createPeer(peerId);
    if (!peer || offeredPeers.has(peerId)) return;

    try {
      offeredPeers.add(peerId);

      const offer = await peer.createOffer();
      if (!canHear(peerId)) {
        closePeer(peerId);
        return;
      }

      await peer.setLocalDescription(offer);

      sendSignal('rtc:offer', peerId, {
        description: peer.localDescription,
      });
    } catch (error) {
      offeredPeers.delete(peerId);
      onError(error);
    }
  }

  async function handleOffer({
    from,
    description,
    roomId: incomingRoom,
  } = {}) {
    if (
      !from ||
      incomingRoom !== SIGNALING_ROOM ||
      !canHear(from)
    ) return;

    try {
      const peer = createPeer(from);
      if (!peer) return;

      await peer.setRemoteDescription(description);
      await addPendingCandidates(from, peer);

      if (!canHear(from)) {
        closePeer(from);
        return;
      }

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      sendSignal('rtc:answer', from, {
        description: peer.localDescription,
      });
    } catch (error) {
      onError(error);
    }
  }

  async function handleAnswer({
    from,
    description,
    roomId: incomingRoom,
  } = {}) {
    if (
      !from ||
      incomingRoom !== SIGNALING_ROOM ||
      !canHear(from)
    ) return;

    try {
      const peer = peers.get(from);
      if (!peer) return;

      await peer.setRemoteDescription(description);
      await addPendingCandidates(from, peer);
    } catch (error) {
      onError(error);
    }
  }

  async function handleIceCandidate({
    from,
    candidate,
    roomId: incomingRoom,
  } = {}) {
    if (
      !from ||
      incomingRoom !== SIGNALING_ROOM ||
      !candidate ||
      !canHear(from)
    ) return;

    const peer = peers.get(from);

    if (!peer || !peer.remoteDescription) {
      if (!pendingCandidates.has(from)) {
        pendingCandidates.set(from, []);
      }

      pendingCandidates.get(from).push(candidate);
      return;
    }

    try {
      await peer.addIceCandidate(candidate);
    } catch (error) {
      onError(error);
    }
  }

  function syncPeers() {
    if (closed || !socket?.connected) return;

    const participants = getParticipants?.() || [];

    for (const participant of participants) {
      const peerId = participant.socketId;

      if (!peerId || peerId === socket.id) continue;

      if (canHear(peerId)) {
        void callPeer(peerId);
      } else {
        closePeer(peerId);
      }
    }

    for (const peerId of peers.keys()) {
      if (!canHear(peerId)) closePeer(peerId);
    }
  }

  function closePeer(peerId) {
    const peer = peers.get(peerId);

    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.close();
      peers.delete(peerId);
    }

    pendingCandidates.delete(peerId);
    offeredPeers.delete(peerId);
    onRemoteStreamRemoved(peerId);
  }

  function close() {
    if (closed) return;
    closed = true;

    socket?.off('rtc:offer', handleOffer);
    socket?.off('rtc:answer', handleAnswer);
    socket?.off('rtc:ice-candidate', handleIceCandidate);

    for (const peerId of [...peers.keys()]) {
      closePeer(peerId);
    }
  }

  socket?.on('rtc:offer', handleOffer);
  socket?.on('rtc:answer', handleAnswer);
  socket?.on('rtc:ice-candidate', handleIceCandidate);

  return {
    syncPeers,
    closePeer,
    close,
    getPeerIds: () => [...peers.keys()],
    setLocalStream(stream) {
      localStream = stream;
    },
  };
}
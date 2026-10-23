
/*
 * ProxiSpeak — Room-Aware Audio Engine
 * Version 2: Room membership, audio policy, and participant departure
 *
 * This module defines WHO is allowed to hear WHOM.
 * Actual microphone/WebRTC routing will be integrated later.
 */

class ProxiSpeakAudioEngine {
  constructor() {
    this.participants = new Map();

    this.zones = {
      workspace: {
        type: "open",
        maxDistance: 0.8
      },
      meetingRoom1: {
        type: "isolated"
      },
      meetingRoom2: {
        type: "isolated"
      }
    };
  }

  // Register a participant when they join the virtual office.
  addParticipant(id, options = {}) {
    if (!id) {
      throw new Error("Participant ID is required.");
    }

    const roomId = options.roomId ?? "workspace";

    if (!this.zones[roomId]) {
      throw new Error(`Unknown zone: ${roomId}`);
    }

    this.participants.set(id, {
      id,
      roomId,
      x: options.x ?? 0.5,
      y: options.y ?? 0.5,
      muted: options.muted ?? false
    });

    return this.getParticipant(id);
  }

  // Get a safe copy of participant information.
  getParticipant(id) {
    const participant = this.participants.get(id);
    return participant ? { ...participant } : null;
  }

  // Remove a participant when they leave the virtual office.
  removeParticipant(id) {
    if (!this.participants.has(id)) {
      return false;
    }

    this.participants.delete(id);
    return true;
  }

  // Move a participant into another zone.
  moveParticipant(id, roomId, position = {}) {
    const participant = this.participants.get(id);

    if (!participant) {
      throw new Error(`Unknown participant: ${id}`);
    }

    if (!this.zones[roomId]) {
      throw new Error(`Unknown zone: ${roomId}`);
    }

    participant.roomId = roomId;

    if (Number.isFinite(position.x)) {
      participant.x = position.x;
    }

    if (Number.isFinite(position.y)) {
      participant.y = position.y;
    }

    return this.getParticipant(id);
  }

  // Mute or unmute a participant in the audio policy.
  setMuted(id, muted) {
    const participant = this.participants.get(id);

    if (!participant) {
      throw new Error(`Unknown participant: ${id}`);
    }

    participant.muted = Boolean(muted);
  }

  // Decide whether a listener is allowed to hear a speaker.
  canHear(listenerId, speakerId) {
    const listener = this.participants.get(listenerId);
    const speaker = this.participants.get(speakerId);

    if (!listener || !speaker) return false;
    if (listener.id === speaker.id) return false;
    if (speaker.muted) return false;

    // Different zones are isolated from each other.
    if (listener.roomId !== speaker.roomId) {
      return false;
    }

    const zone = this.zones[listener.roomId];

    // Participants in the same isolated meeting room can hear each other.
    if (zone.type === "isolated") {
      return true;
    }

    // Open workspace uses proximity-based audio.
    const distance = Math.hypot(
      listener.x - speaker.x,
      listener.y - speaker.y
    );

    return distance <= zone.maxDistance;
  }

  // Return everyone a participant is currently allowed to hear.
  getAudibleParticipants(listenerId) {
    return [...this.participants.keys()].filter(
      speakerId => this.canHear(listenerId, speakerId)
    );
  }

  // Get a volume factor for open-workspace audio.
  getVolume(listenerId, speakerId) {
    if (!this.canHear(listenerId, speakerId)) {
      return 0;
    }

    const listener = this.participants.get(listenerId);
    const speaker = this.participants.get(speakerId);
    const zone = this.zones[listener.roomId];

    // Meeting-room participants have full policy volume.
    if (zone.type === "isolated") {
      return 1;
    }

    const distance = Math.hypot(
      listener.x - speaker.x,
      listener.y - speaker.y
    );

    return Math.max(0, 1 - distance / zone.maxDistance);
  }
}

// Make the engine available to browser scripts.
window.ProxiSpeakAudioEngine = ProxiSpeakAudioEngine;

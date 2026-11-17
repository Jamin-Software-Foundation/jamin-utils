import { BasicMIDI } from "spessasynth_core";
import { SECTION_MAP } from "./constants.js";

const NORMALIZED_SECTIONS = Object.fromEntries(
  Object.entries(SECTION_MAP).map(([k, v]) => [k.toLowerCase(), v])
);

export function extractSections(baseMidi, logFn = console.log) {
  const markers = new Array();
  let maxTrackTick = baseMidi.lastVoiceEventTick || 0;

  for (const track of baseMidi.tracks) {
    const events = track.events || new Array();
    for (const ev of events) {
      if (ev.ticks > maxTrackTick) {
        maxTrackTick = ev.ticks;
      }
      if (ev.statusByte === 0x06 && ev.data) {
        const rawName = new TextDecoder("ascii").decode(ev.data).replace(/\0/g, "").trim();
        const ketronName = NORMALIZED_SECTIONS[rawName.toLowerCase()];
        if (ketronName) {
          markers.push({ name: rawName, ketronName, tick: ev.ticks });
        } else {
          logFn(`  [Unmapped Marker] "${rawName}" at tick ${ev.ticks}`);
        }
      }
    }
  }

  markers.sort((a, b) => a.tick - b.tick);

  const firstMarkerTick = markers.length > 0 ? markers.at(0).tick : 0;
  const allEvents = baseMidi.tracks.flatMap(t => t.events || new Array());

  const setupEvents = allEvents.filter(ev => {
    const cmd = ev.statusByte & 0xf0;
    return ev.ticks <= firstMarkerTick && cmd !== 0x90 && cmd !== 0x80 && ev.statusByte !== 0x2f;
  });

  const ppq = baseMidi.timeDivision || 480;
  const ticksPerBar = ppq * 4; // Round final section up to a full bar boundary

  const sections = new Array();
  for (let i = 0; i < markers.length; i++) {
    const current = markers.at(i);
    const next = markers.at(i + 1);
    const startTick = current.tick;

    let endTick;
    if (next) {
      endTick = next.tick;
    } else {
      // Round the final Ending section up to the nearest full bar so the last beat isn't clipped
      const rawLength = Math.max(ticksPerBar, maxTrackTick - startTick);
      const bars = Math.ceil(rawLength / ticksPerBar);
      endTick = startTick + bars * ticksPerBar;
    }

    if (endTick <= startTick) continue;

    sections.push({
      ketronName: current.ketronName,
      startTick,
      endTick,
      setupEvents
    });
  }
  return sections;
}


/**
 * Resolves which Ketron group ("DRUM", "BASS", or "CHORD") a MIDI channel belongs to
 * using Yamaha's CASM destChannel mapping.
 */
function getChannelRole(ch, channelRules) {
  const rule = channelRules.at(ch);
  const dest = rule ? rule.destChannel : ch;

  // Yamaha Style Destination Channels (0-indexed):
  // 8 = Sub Rhythm, 9 = Rhythm -> DRUM
  // 10 = Bass -> BASS
  // 11..15 (or 0..7 melodic channels) -> CHORD
  if (dest === 8 || dest === 9 || ch === 8 || ch === 9) return "DRUM";
  if (dest === 10) return "BASS";
  return "CHORD";
}

export function buildSectionMidi(
  baseMidi,
  section,
  targetRole,
  channelRules,
  targetIntervals,
  targetRootSemitone = 0,
  constrainBassRange = false,
  channelVolumes = null
) {
  const cloned = BasicMIDI.fromArrayBuffer(baseMidi.writeMIDI());
  const allEvents = cloned.tracks.flatMap(t => t.events || new Array());
  const firstMarkerTick = section.setupEvents.length > 0
    ? Math.max(...section.setupEvents.map(e => e.ticks))
    : 0;

  const newEvents = new Array();

  // 1. Setup events (Tempo, Bank Select, Program Change, initial CC7 Volume)
  for (const ev of allEvents) {
    const cmd = ev.statusByte & 0xf0;
    const ch = ev.statusByte & 0x0f;
    const isChannelMsg = cmd >= 0x80 && cmd <= 0xe0;

    if (ev.ticks <= firstMarkerTick && cmd !== 0x90 && cmd !== 0x80 && ev.statusByte !== 0x2f) {
      if (isChannelMsg && getChannelRole(ch, channelRules) !== targetRole) continue;

      // Scale initial CC7 (Channel Volume) if present
      if (cmd === 0xb0 && ev.data.at(0) === 7 && channelVolumes) {
        const volScale = channelVolumes.at(ch) ?? 1.0;
        const scaledCC7 = Math.max(0, Math.min(127, Math.round(ev.data.at(1) * volScale)));
        ev.data.set(new Array(7, scaledCC7));
      }

      ev.ticks = 0;
      newEvents.push(ev);
    }
  }

  // 2. Section events
  for (const ev of allEvents) {
    if (ev.ticks < section.startTick || ev.ticks >= section.endTick) continue;
    if (ev.statusByte === 0x2f) continue;

    const status = ev.statusByte & 0xf0;
    const ch = ev.statusByte & 0x0f;
    const isChannelMsg = status >= 0x80 && status <= 0xe0;

    if (isChannelMsg && getChannelRole(ch, channelRules) !== targetRole) continue;

    const volScale = channelVolumes ? (channelVolumes.at(ch) ?? 1.0) : 1.0;

    // Scale mid-section CC7 (Channel Volume) messages
    if (status === 0xb0 && ev.data.at(0) === 7 && channelVolumes) {
      const scaledCC7 = Math.max(0, Math.min(127, Math.round(ev.data.at(1) * volScale)));
      ev.data.set(new Array(7, scaledCC7));
    }

    if (status === 0x90 || status === 0x80) {
      let note = ev.data.at(0);
      let vel = ev.data.at(1);

      // Strip Yamaha MegaVoice articulation triggers (> 115 velocity on melodic channels)
      if (targetRole !== "DRUM" && status === 0x90 && vel > 115) continue;

      // Scale Note-On velocity by channel slider (preserve Note-Off vel = 0)
      if (status === 0x90 && vel > 0 && channelVolumes) {
        if (volScale <= 0) continue; // Mute channel completely if slider is 0%
        vel = Math.max(1, Math.min(127, Math.round(vel * volScale)));
      }

      if (targetIntervals && targetRole !== "DRUM") {
        const rule = channelRules.at(ch) || { sourceRoot: 0, ntr: 0 };
        note = transposePitch(note, rule.sourceRoot, targetIntervals, targetRootSemitone);

        if (constrainBassRange) {
          while (note > 55) note -= 12;
          while (note < 28) note += 12;
        }
      }

      ev.data.set(new Array(Math.max(0, Math.min(127, note)), vel));
    }

    ev.ticks = ev.ticks - section.startTick;
    newEvents.push(ev);
  }

  newEvents.sort((a, b) => a.ticks - b.ticks);

  const eotEvent = allEvents.find(ev => ev.statusByte === 0x2f);
  if (eotEvent) {
    eotEvent.ticks = section.endTick - section.startTick;
    newEvents.push(eotEvent);
  }

  const primaryTrack = cloned.tracks.at(0);
  primaryTrack.events.splice(0, primaryTrack.events.length, ...newEvents);
  cloned.tracks.splice(1);

  if (typeof cloned.flush === "function") cloned.flush();
  return cloned;
}


function transposePitch(midiNote, sourceRoot, targetIntervals, targetRootSemitone = 0) {
  const pitchClass = (midiNote - sourceRoot + 120) % 12;
  const octaveBase = midiNote - pitchClass;

  let offset = pitchClass;
  if (pitchClass === 0) offset = targetIntervals.at(0);
  else if (pitchClass === 2) offset = targetIntervals.includes(2) ? 2 : targetIntervals.at(0) + 2;
  else if (pitchClass === 4) offset = targetIntervals.at(1);
  else if (pitchClass === 5) offset = targetIntervals.at(1) === 5 ? 5 : targetIntervals.at(1);
  else if (pitchClass === 7) offset = targetIntervals.at(2);
  else if (pitchClass === 9) offset = targetIntervals.length > 3 ? targetIntervals.at(3) : targetIntervals.at(2) + 2;
  else if (pitchClass === 11 || pitchClass === 10) {
    offset = targetIntervals.length > 3 ? targetIntervals.at(3) : targetIntervals.at(0);
  }

  return octaveBase + offset + targetRootSemitone;
}

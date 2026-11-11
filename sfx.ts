/**
 * Shared Web Audio SFX engine for the minigames.
 *
 * Every sound is synthesised at runtime, so there are no audio files to load.
 * The graph is mixed through a glue compressor + limiter and a procedural
 * reverb, and each voice can add a sub-octave layer, detuned doubles, stereo
 * spread and soft-clip drive to sound bigger than a bare oscillator.
 */

export interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  slideTo?: number | null;
  delay?: number;
  pan?: number;
  sub?: boolean;
  reverb?: number;
  detune?: number;
  drive?: number;
}

export interface NoiseOptions {
  gain?: number;
  filterFreq?: number;
  delay?: number;
  pan?: number;
  reverb?: number;
  q?: number;
}

export interface SfxEngine {
  resume(): void;
  setMuted(muted: boolean): void;
  tone(freq: number, duration: number, opts?: ToneOptions): void;
  noise(duration: number, opts?: NoiseOptions): void;
}

const MIN_GAIN = 0.0002;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Short stereo noise tail used as a procedural reverb impulse. */
function makeImpulse(context: AudioContext, seconds: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const decay = Math.pow(1 - i / length, 2.6);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return impulse;
}

/** Soft-clip curve that adds harmonics without hard edges. */
function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const k = Math.max(0, amount) * 40;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

export function createSfxEngine(initialMuted: boolean): SfxEngine {
  let muted = initialMuted;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let reverbBus: GainNode | null = null;
  const driveCurves = new Map<number, Float32Array<ArrayBuffer>>();

  function build(context: AudioContext): void {
    master = context.createGain();
    master.gain.value = 0.9;

    const glue = context.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.knee.value = 20;
    glue.ratio.value = 6;
    glue.attack.value = 0.004;
    glue.release.value = 0.25;

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;

    master.connect(glue);
    glue.connect(limiter);
    limiter.connect(context.destination);

    const convolver = context.createConvolver();
    convolver.buffer = makeImpulse(context, 1.25);

    const wetFilter = context.createBiquadFilter();
    wetFilter.type = "lowpass";
    wetFilter.frequency.value = 5200;

    const wetGain = context.createGain();
    wetGain.gain.value = 0.22;

    reverbBus = context.createGain();
    reverbBus.gain.value = 1;
    reverbBus.connect(convolver);
    convolver.connect(wetFilter);
    wetFilter.connect(wetGain);
    wetGain.connect(master);
  }

  function ensure(): AudioContext | null {
    if (muted) return null;
    if (!ctx) {
      // Safari exposes a prefixed constructor that lib.dom does not declare.
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      build(ctx);
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  /** Pan a voice and send part of it to the shared reverb. */
  function route(
    context: AudioContext,
    node: AudioNode,
    pan: number,
    reverb: number,
  ): void {
    if (!master || !reverbBus) return;
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    node.connect(panner);
    panner.connect(master);
    const wet = clamp(reverb, 0, 1);
    if (wet > 0) {
      const send = context.createGain();
      send.gain.value = wet;
      panner.connect(send);
      send.connect(reverbBus);
    }
  }

  function tone(freq: number, duration: number, opts: ToneOptions = {}): void {
    const context = ensure();
    if (!context || !master) return;

    const start = context.currentTime + (opts.delay ?? 0);
    const durationSafe = Math.max(0.04, duration);
    const peak = Math.max(MIN_GAIN, (opts.gain ?? 0.06) * 1.35);
    const type = opts.type ?? "sine";
    const slideTo = opts.slideTo ?? null;
    const pan = opts.pan ?? 0;
    const reverb = opts.reverb ?? 0.12;
    const detune = opts.detune ?? (durationSafe >= 0.12 ? 6 : 0);

    const layers: Array<{
      freq: number;
      gain: number;
      detune: number;
      type: OscillatorType;
    }> = [{ freq, gain: 1, detune: 0, type }];

    if (detune > 0) {
      layers.push({ freq, gain: 0.5, detune, type });
      layers.push({ freq, gain: 0.5, detune: -detune, type });
    }

    const wantsSub = opts.sub ?? (freq <= 260 && durationSafe >= 0.08);
    if (wantsSub) {
      layers.push({
        freq: Math.max(30, freq / 2),
        gain: 0.75,
        detune: 0,
        type: "sine",
      });
    }

    let curve: Float32Array<ArrayBuffer> | null = null;
    const drive = opts.drive ?? 0;
    if (drive > 0) {
      const key = Math.round(drive * 20) / 20;
      curve = driveCurves.get(key) ?? makeDriveCurve(key);
      driveCurves.set(key, curve);
    }

    for (const layer of layers) {
      const osc = context.createOscillator();
      osc.type = layer.type;
      const layerFreq = Math.max(20, layer.freq);
      osc.frequency.setValueAtTime(layerFreq, start);
      if (slideTo) {
        const ratio = slideTo / Math.max(1, freq);
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, layerFreq * ratio),
          start + durationSafe,
        );
      }
      if (layer.detune) {
        osc.detune.setValueAtTime(layer.detune, start);
      }

      const amp = context.createGain();
      const layerPeak = Math.max(MIN_GAIN, peak * layer.gain);
      amp.gain.setValueAtTime(MIN_GAIN, start);
      amp.gain.exponentialRampToValueAtTime(layerPeak, start + 0.004);
      amp.gain.exponentialRampToValueAtTime(MIN_GAIN, start + durationSafe);

      osc.connect(amp);
      let tail: AudioNode = amp;
      if (curve) {
        const shaper = context.createWaveShaper();
        shaper.curve = curve;
        shaper.oversample = "2x";
        amp.connect(shaper);
        tail = shaper;
      }

      const layerPan = clamp(
        pan + (layer.detune > 0 ? 0.14 : layer.detune < 0 ? -0.14 : 0),
        -1,
        1,
      );
      route(context, tail, layerPan, reverb);
      osc.start(start);
      osc.stop(start + durationSafe + 0.05);
    }
  }

  function noise(duration: number, opts: NoiseOptions = {}): void {
    const context = ensure();
    if (!context) return;

    const start = context.currentTime + (opts.delay ?? 0);
    const durationSafe = Math.max(0.02, duration);
    const frames = Math.max(1, Math.floor(context.sampleRate * durationSafe));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = opts.filterFreq ?? 900;
    filter.Q.value = opts.q ?? 0.8;

    const amp = context.createGain();
    const peak = Math.max(MIN_GAIN, (opts.gain ?? 0.05) * 1.35);
    amp.gain.setValueAtTime(peak, start);
    amp.gain.exponentialRampToValueAtTime(MIN_GAIN, start + durationSafe);

    source.connect(filter);
    filter.connect(amp);
    route(context, amp, opts.pan ?? 0, opts.reverb ?? 0.12);
    source.start(start);
  }

  return {
    resume(): void {
      ensure();
    },
    setMuted(next: boolean): void {
      muted = next;
    },
    tone,
    noise,
  };
}

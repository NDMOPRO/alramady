import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface SlideTransition {
  id: string;
  slideId: string;
  type: TransitionType;
  duration: number;
  delay: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  easing: EasingFunction;
  advanceOnClick: boolean;
  advanceAfter?: number;
}

type TransitionType =
  | 'none'
  | 'fade'
  | 'dissolve'
  | 'slide'
  | 'push'
  | 'wipe'
  | 'split'
  | 'reveal'
  | 'cover'
  | 'uncover'
  | 'morph'
  | 'zoom'
  | 'curtain'
  | 'flip'
  | 'rotate';

type EasingFunction =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'bounce'
  | 'elastic';

interface ElementAnimation {
  id: string;
  elementId: string;
  slideId: string;
  trigger: 'onClick' | 'withPrevious' | 'afterPrevious' | 'onLoad';
  effect: AnimationEffect;
  timing: AnimationTiming;
  properties: AnimationProperties;
  order: number;
  groupId?: string;
}

interface AnimationEffect {
  type: AnimationEffectType;
  subtype?: string;
  direction?: 'left' | 'right' | 'up' | 'down' | 'center' | 'clockwise' | 'counterclockwise';
  emphasis?: 'pulse' | 'spin' | 'grow' | 'shrink' | 'bounce' | 'shake' | 'highlight';
}

type AnimationEffectType =
  | 'appear'
  | 'fade'
  | 'fly'
  | 'float'
  | 'split'
  | 'wipe'
  | 'zoom'
  | 'spin'
  | 'grow'
  | 'bounce'
  | 'typewriter'
  | 'wave'
  | 'emphasis'
  | 'exit_fade'
  | 'exit_fly'
  | 'exit_shrink'
  | 'path';

interface AnimationTiming {
  duration: number;
  delay: number;
  repeatCount: number;
  repeatDelay: number;
  autoReverse: boolean;
  speed: number;
}

interface AnimationProperties {
  startOpacity?: number;
  endOpacity?: number;
  startScale?: number;
  endScale?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  startRotation?: number;
  endRotation?: number;
  motionPath?: MotionPathPoint[];
  color?: string;
  blurAmount?: number;
}

interface MotionPathPoint {
  x: number;
  y: number;
  time: number;
}

interface AnimationSequence {
  id: string;
  slideId: string;
  name: string;
  animations: ElementAnimation[];
  totalDuration: number;
  loopCount: number;
}

interface AnimationPreview {
  id: string;
  slideId: string;
  frames: AnimationFrame[];
  fps: number;
  totalDuration: number;
  width: number;
  height: number;
}

interface AnimationFrame {
  frameIndex: number;
  timeMs: number;
  elements: ElementState[];
}

interface ElementState {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation: number;
  scale: number;
  visible: boolean;
}

interface AnimationPreset {
  name: string;
  description: string;
  category: 'entrance' | 'emphasis' | 'exit' | 'motion_path';
  effect: AnimationEffect;
  defaultTiming: AnimationTiming;
  defaultProperties: AnimationProperties;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class AnimationEngineService {
  private prisma: PrismaClient;
  private transitionCache: Map<string, SlideTransition> = new Map();
  private animationSequences: Map<string, AnimationSequence> = new Map();
  private presets: Map<string, AnimationPreset> = new Map();
  private readonly DEFAULT_FPS = 30;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializePresets();
  }

  private initializePresets(): void {
    this.presets.set('fadeIn', {
      name: 'fadeIn',
      description: 'Gradually appears by increasing opacity',
      category: 'entrance',
      effect: { type: 'fade' },
      defaultTiming: { duration: 500, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startOpacity: 0, endOpacity: 1 },
    });

    this.presets.set('flyFromLeft', {
      name: 'flyFromLeft',
      description: 'Flies in from the left side of the slide',
      category: 'entrance',
      effect: { type: 'fly', direction: 'left' },
      defaultTiming: { duration: 700, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startX: -1000, startY: 0, endX: 0, endY: 0, startOpacity: 0, endOpacity: 1 },
    });

    this.presets.set('flyFromRight', {
      name: 'flyFromRight',
      description: 'Flies in from the right side of the slide',
      category: 'entrance',
      effect: { type: 'fly', direction: 'right' },
      defaultTiming: { duration: 700, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startX: 1000, startY: 0, endX: 0, endY: 0, startOpacity: 0, endOpacity: 1 },
    });

    this.presets.set('flyFromBottom', {
      name: 'flyFromBottom',
      description: 'Flies in from the bottom of the slide',
      category: 'entrance',
      effect: { type: 'fly', direction: 'up' },
      defaultTiming: { duration: 700, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startX: 0, startY: 800, endX: 0, endY: 0, startOpacity: 0, endOpacity: 1 },
    });

    this.presets.set('zoomIn', {
      name: 'zoomIn',
      description: 'Zooms in from a small size to full size',
      category: 'entrance',
      effect: { type: 'zoom', direction: 'center' },
      defaultTiming: { duration: 600, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startScale: 0.1, endScale: 1, startOpacity: 0, endOpacity: 1 },
    });

    this.presets.set('bounceIn', {
      name: 'bounceIn',
      description: 'Bounces into view with a spring effect',
      category: 'entrance',
      effect: { type: 'bounce' },
      defaultTiming: { duration: 800, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startScale: 0, endScale: 1, startOpacity: 0, endOpacity: 1, startY: -200, endY: 0 },
    });

    this.presets.set('spinIn', {
      name: 'spinIn',
      description: 'Rotates while appearing',
      category: 'entrance',
      effect: { type: 'spin', direction: 'clockwise' },
      defaultTiming: { duration: 700, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startRotation: 0, endRotation: 360, startScale: 0.5, endScale: 1, startOpacity: 0, endOpacity: 1 },
    });

    this.presets.set('pulse', {
      name: 'pulse',
      description: 'Pulses to draw attention',
      category: 'emphasis',
      effect: { type: 'emphasis', emphasis: 'pulse' },
      defaultTiming: { duration: 500, delay: 0, repeatCount: 2, repeatDelay: 100, autoReverse: true, speed: 1 },
      defaultProperties: { startScale: 1, endScale: 1.15 },
    });

    this.presets.set('shake', {
      name: 'shake',
      description: 'Shakes horizontally to draw attention',
      category: 'emphasis',
      effect: { type: 'emphasis', emphasis: 'shake' },
      defaultTiming: { duration: 400, delay: 0, repeatCount: 3, repeatDelay: 0, autoReverse: true, speed: 1 },
      defaultProperties: { startX: 0, endX: 10 },
    });

    this.presets.set('fadeOut', {
      name: 'fadeOut',
      description: 'Gradually disappears by decreasing opacity',
      category: 'exit',
      effect: { type: 'exit_fade' },
      defaultTiming: { duration: 500, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startOpacity: 1, endOpacity: 0 },
    });

    this.presets.set('flyOut', {
      name: 'flyOut',
      description: 'Flies out to the right side',
      category: 'exit',
      effect: { type: 'exit_fly', direction: 'right' },
      defaultTiming: { duration: 600, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startX: 0, endX: 1200, startOpacity: 1, endOpacity: 0 },
    });

    this.presets.set('shrinkOut', {
      name: 'shrinkOut',
      description: 'Shrinks to nothing',
      category: 'exit',
      effect: { type: 'exit_shrink' },
      defaultTiming: { duration: 500, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
      defaultProperties: { startScale: 1, endScale: 0, startOpacity: 1, endOpacity: 0 },
    });
  }

  async setSlideTransition(
    slideId: string,
    type: TransitionType,
    duration: number = 500,
    options?: Partial<SlideTransition>,
  ): Promise<SlideTransition> {
    const id = crypto.randomUUID();
    const transition: SlideTransition = {
      id,
      slideId,
      type,
      duration: Math.max(100, Math.min(duration, 5000)),
      delay: options?.delay || 0,
      direction: options?.direction,
      easing: options?.easing || 'easeInOut',
      advanceOnClick: options?.advanceOnClick !== false,
      advanceAfter: options?.advanceAfter,
    };

    await this.prisma.slideTransition.upsert({
      where: { slideId },
      update: {
        type: transition.type,
        duration: transition.duration,
        delay: transition.delay,
        direction: transition.direction,
        easing: transition.easing,
        advanceOnClick: transition.advanceOnClick,
        advanceAfter: transition.advanceAfter,
        updatedAt: new Date(),
      },
      create: {
        id: transition.id,
        slideId: transition.slideId,
        type: transition.type,
        duration: transition.duration,
        delay: transition.delay,
        direction: transition.direction,
        easing: transition.easing,
        advanceOnClick: transition.advanceOnClick,
        advanceAfter: transition.advanceAfter,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    this.transitionCache.set(slideId, transition);
    return transition;
  }

  async addElementAnimation(
    elementId: string,
    slideId: string,
    presetName: string,
    trigger: ElementAnimation['trigger'] = 'afterPrevious',
    timingOverrides?: Partial<AnimationTiming>,
    propertyOverrides?: Partial<AnimationProperties>,
  ): Promise<ElementAnimation> {
    const preset = this.presets.get(presetName);
    if (!preset) {
      throw new Error(`Animation preset not found: ${presetName}`);
    }

    const existingAnimations = await this.getSlideAnimations(slideId);
    const maxOrder = existingAnimations.length > 0
      ? Math.max(...existingAnimations.map(a => a.order))
      : -1;

    const animation: ElementAnimation = {
      id: crypto.randomUUID(),
      elementId,
      slideId,
      trigger,
      effect: { ...preset.effect },
      timing: {
        ...preset.defaultTiming,
        ...timingOverrides,
      },
      properties: {
        ...preset.defaultProperties,
        ...propertyOverrides,
      },
      order: maxOrder + 1,
    };

    await this.prisma.elementAnimation.create({
      data: {
        id: animation.id,
        elementId: animation.elementId,
        slideId: animation.slideId,
        trigger: animation.trigger,
        effect: JSON.parse(JSON.stringify(animation.effect)),
        timing: JSON.parse(JSON.stringify(animation.timing)),
        properties: JSON.parse(JSON.stringify(animation.properties)),
        order: animation.order,
        groupId: animation.groupId,
        createdAt: new Date(),
      },
    });

    const sequence = this.animationSequences.get(slideId);
    if (sequence) {
      sequence.animations.push(animation);
      sequence.totalDuration = this.calculateSequenceDuration(sequence.animations);
    }

    return animation;
  }

  async removeElementAnimation(animationId: string): Promise<void> {
    const record = await this.prisma.elementAnimation.findUnique({ where: { id: animationId } });
    if (!record) return;

    await this.prisma.elementAnimation.delete({ where: { id: animationId } });

    const sequence = this.animationSequences.get(record.slideId);
    if (sequence) {
      sequence.animations = sequence.animations.filter(a => a.id !== animationId);
      sequence.totalDuration = this.calculateSequenceDuration(sequence.animations);
    }
  }

  async reorderAnimations(slideId: string, animationIds: string[]): Promise<void> {
    for (let i = 0; i < animationIds.length; i++) {
      await this.prisma.elementAnimation.update({
        where: { id: animationIds[i] },
        data: { order: i },
      });
    }

    const sequence = this.animationSequences.get(slideId);
    if (sequence) {
      const reordered = animationIds.map((id, idx) => {
        const anim = sequence.animations.find(a => a.id === id);
        if (anim) {
          anim.order = idx;
        }
        return anim;
      }).filter(Boolean) as ElementAnimation[];
      sequence.animations = reordered;
    }
  }

  async getSlideAnimations(slideId: string): Promise<ElementAnimation[]> {
    const cached = this.animationSequences.get(slideId);
    if (cached) return cached.animations;

    const records = await this.prisma.elementAnimation.findMany({
      where: { slideId },
      orderBy: { order: 'asc' },
    });

    const animations: ElementAnimation[] = records.map(r => ({
      id: r.id,
      elementId: r.elementId,
      slideId: r.slideId,
      trigger: r.trigger as ElementAnimation['trigger'],
      effect: r.effect as unknown as AnimationEffect,
      timing: r.timing as unknown as AnimationTiming,
      properties: r.properties as unknown as AnimationProperties,
      order: r.order,
      groupId: r.groupId || undefined,
    }));

    const sequence: AnimationSequence = {
      id: crypto.randomUUID(),
      slideId,
      name: `Sequence for ${slideId}`,
      animations,
      totalDuration: this.calculateSequenceDuration(animations),
      loopCount: 0,
    };

    this.animationSequences.set(slideId, sequence);
    return animations;
  }

  private calculateSequenceDuration(animations: ElementAnimation[]): number {
    if (animations.length === 0) return 0;

    let totalDuration = 0;
    let parallelGroupEnd = 0;

    for (const anim of animations) {
      const animEnd = anim.timing.delay + anim.timing.duration;
      const repeatDuration = anim.timing.repeatCount > 0
        ? anim.timing.repeatCount * (anim.timing.duration + anim.timing.repeatDelay)
        : 0;
      const fullDuration = animEnd + repeatDuration;

      switch (anim.trigger) {
        case 'withPrevious':
          parallelGroupEnd = Math.max(parallelGroupEnd, fullDuration);
          break;
        case 'afterPrevious':
          totalDuration += parallelGroupEnd;
          parallelGroupEnd = fullDuration;
          break;
        case 'onClick':
          totalDuration += parallelGroupEnd;
          parallelGroupEnd = fullDuration;
          break;
        case 'onLoad':
          parallelGroupEnd = Math.max(parallelGroupEnd, fullDuration);
          break;
      }
    }

    totalDuration += parallelGroupEnd;
    return totalDuration;
  }

  async generatePreview(
    slideId: string,
    slideWidth: number = 960,
    slideHeight: number = 540,
    fps: number = 30,
  ): Promise<AnimationPreview> {
    const animations = await this.getSlideAnimations(slideId);
    const sequence = this.animationSequences.get(slideId)!;
    const totalDuration = sequence.totalDuration;
    const totalFrames = Math.ceil((totalDuration / 1000) * fps);

    const elements = await this.prisma.slideElement.findMany({
      where: { slideId },
    });

    const elementPositions = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const el of elements) {
      elementPositions.set(el.id, {
        x: (el.positionX as number) || 0,
        y: (el.positionY as number) || 0,
        w: (el.width as number) || 100,
        h: (el.height as number) || 50,
      });
    }

    const frames: AnimationFrame[] = [];

    for (let frameIdx = 0; frameIdx <= totalFrames; frameIdx++) {
      const timeMs = (frameIdx / fps) * 1000;
      const elementStates: ElementState[] = [];

      for (const el of elements) {
        const basePos = elementPositions.get(el.id)!;
        const relevantAnimations = animations.filter(a => a.elementId === el.id);

        let state: ElementState = {
          elementId: el.id,
          x: basePos.x,
          y: basePos.y,
          width: basePos.w,
          height: basePos.h,
          opacity: relevantAnimations.length > 0 ? 0 : 1,
          rotation: 0,
          scale: 1,
          visible: relevantAnimations.length === 0,
        };

        for (const anim of relevantAnimations) {
          const animStartTime = this.getAnimationStartTime(anim, animations);
          const animEndTime = animStartTime + anim.timing.duration;

          if (timeMs < animStartTime) {
            if (anim.effect.type.startsWith('exit_') || anim.effect.type === 'emphasis') {
              state.opacity = 1;
              state.visible = true;
            }
            continue;
          }

          if (timeMs > animEndTime) {
            state = this.getAnimationEndState(state, anim, basePos);
            continue;
          }

          const progress = (timeMs - animStartTime) / anim.timing.duration;
          const easedProgress = this.applyEasing(progress, 'easeInOut');

          state = this.interpolateState(state, anim, basePos, easedProgress);
        }

        elementStates.push(state);
      }

      frames.push({
        frameIndex: frameIdx,
        timeMs: Math.round(timeMs),
        elements: elementStates,
      });
    }

    return {
      id: crypto.randomUUID(),
      slideId,
      frames,
      fps,
      totalDuration,
      width: slideWidth,
      height: slideHeight,
    };
  }

  private getAnimationStartTime(
    animation: ElementAnimation,
    allAnimations: ElementAnimation[],
  ): number {
    if (animation.trigger === 'onLoad') {
      return animation.timing.delay;
    }

    const prevAnimations = allAnimations.filter(a => a.order < animation.order);
    if (prevAnimations.length === 0) {
      return animation.timing.delay;
    }

    const lastPrev = prevAnimations[prevAnimations.length - 1];
    const lastPrevStart = this.getAnimationStartTime(lastPrev, allAnimations);
    const lastPrevEnd = lastPrevStart + lastPrev.timing.duration;

    if (animation.trigger === 'withPrevious') {
      return lastPrevStart + animation.timing.delay;
    }

    if (animation.trigger === 'afterPrevious') {
      return lastPrevEnd + animation.timing.delay;
    }

    return lastPrevEnd + animation.timing.delay;
  }

  private getAnimationEndState(
    currentState: ElementState,
    animation: ElementAnimation,
    basePos: { x: number; y: number; w: number; h: number },
  ): ElementState {
    const props = animation.properties;
    const state = { ...currentState };

    state.opacity = props.endOpacity ?? 1;
    state.scale = props.endScale ?? 1;
    state.rotation = props.endRotation ?? 0;
    state.x = basePos.x + (props.endX ?? 0);
    state.y = basePos.y + (props.endY ?? 0);
    state.visible = state.opacity > 0;

    return state;
  }

  private interpolateState(
    currentState: ElementState,
    animation: ElementAnimation,
    basePos: { x: number; y: number; w: number; h: number },
    progress: number,
  ): ElementState {
    const props = animation.properties;
    const state = { ...currentState };

    const startOpacity = props.startOpacity ?? 0;
    const endOpacity = props.endOpacity ?? 1;
    state.opacity = startOpacity + (endOpacity - startOpacity) * progress;

    const startScale = props.startScale ?? 1;
    const endScale = props.endScale ?? 1;
    state.scale = startScale + (endScale - startScale) * progress;

    const startRot = props.startRotation ?? 0;
    const endRot = props.endRotation ?? 0;
    state.rotation = startRot + (endRot - startRot) * progress;

    const startX = props.startX ?? 0;
    const endX = props.endX ?? 0;
    state.x = basePos.x + startX + (endX - startX) * progress;

    const startY = props.startY ?? 0;
    const endY = props.endY ?? 0;
    state.y = basePos.y + startY + (endY - startY) * progress;

    state.visible = state.opacity > 0.01;
    state.width = basePos.w * state.scale;
    state.height = basePos.h * state.scale;

    return state;
  }

  private applyEasing(t: number, easing: EasingFunction | string): number {
    const clamped = Math.max(0, Math.min(1, t));

    switch (easing) {
      case 'linear':
        return clamped;
      case 'easeIn':
        return clamped * clamped;
      case 'easeOut':
        return 1 - (1 - clamped) * (1 - clamped);
      case 'easeInOut':
        return clamped < 0.5
          ? 2 * clamped * clamped
          : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
      case 'easeInCubic':
        return clamped * clamped * clamped;
      case 'easeOutCubic':
        return 1 - Math.pow(1 - clamped, 3);
      case 'easeInOutCubic':
        return clamped < 0.5
          ? 4 * clamped * clamped * clamped
          : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
      case 'bounce': {
        const n1 = 7.5625;
        const d1 = 2.75;
        let val = clamped;
        if (val < 1 / d1) return n1 * val * val;
        else if (val < 2 / d1) return n1 * (val -= 1.5 / d1) * val + 0.75;
        else if (val < 2.5 / d1) return n1 * (val -= 2.25 / d1) * val + 0.9375;
        else return n1 * (val -= 2.625 / d1) * val + 0.984375;
      }
      case 'elastic': {
        if (clamped === 0 || clamped === 1) return clamped;
        return -Math.pow(2, 10 * clamped - 10) * Math.sin((clamped * 10 - 10.75) * ((2 * Math.PI) / 3));
      }
      default:
        return clamped;
    }
  }

  getAvailablePresets(category?: string): AnimationPreset[] {
    const presets = Array.from(this.presets.values());
    if (category) {
      return presets.filter(p => p.category === category);
    }
    return presets;
  }

  getAvailableTransitions(): { type: TransitionType; description: string }[] {
    return [
      { type: 'none', description: 'No transition' },
      { type: 'fade', description: 'Gradually fades between slides' },
      { type: 'dissolve', description: 'Dissolves into the next slide' },
      { type: 'slide', description: 'Slides in from a direction' },
      { type: 'push', description: 'Pushes the current slide out' },
      { type: 'wipe', description: 'Wipes across the slide' },
      { type: 'split', description: 'Splits the slide open' },
      { type: 'reveal', description: 'Reveals the next slide underneath' },
      { type: 'cover', description: 'Covers the current slide' },
      { type: 'morph', description: 'Morphs matching elements' },
      { type: 'zoom', description: 'Zooms into the next slide' },
      { type: 'curtain', description: 'Opens like a curtain' },
      { type: 'flip', description: 'Flips to reveal next slide' },
      { type: 'rotate', description: 'Rotates to the next slide' },
    ];
  }
}

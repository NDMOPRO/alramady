// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  slideTransition: {
    upsert: jest.fn().mockResolvedValue({}),
  },
  elementAnimation: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue({ id: 'anim-001', slideId: 'slide-001' }),
    delete: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
  },
  slideElement: {
    findMany: jest.fn().mockResolvedValue([
      { id: 'el-001', positionX: 100, positionY: 50, width: 200, height: 100 },
      { id: 'el-002', positionX: 400, positionY: 200, width: 300, height: 150 },
    ]),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

import AnimationEngineService from '../services/animation-engine.service.js';

describe('Animation Engine Service (Section 5.6)', () => {
  let service: AnimationEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnimationEngineService(mockPrisma as any);
  });

  describe('setSlideTransition', () => {
    it('should create a slide transition with the given type and duration', async () => {
      const transition = await service.setSlideTransition('slide-001', 'fade', 800);
      expect(transition.slideId).toBe('slide-001');
      expect(transition.type).toBe('fade');
      expect(transition.duration).toBe(800);
      expect(transition.easing).toBe('easeInOut');
      expect(transition.advanceOnClick).toBe(true);
      expect(mockPrisma.slideTransition.upsert).toHaveBeenCalledTimes(1);
    });

    it('should clamp duration to minimum 100ms and maximum 5000ms', async () => {
      const tooShort = await service.setSlideTransition('slide-001', 'slide', 10);
      expect(tooShort.duration).toBe(100);

      const tooLong = await service.setSlideTransition('slide-002', 'wipe', 99999);
      expect(tooLong.duration).toBe(5000);
    });

    it('should apply optional direction, easing, and advanceAfter settings', async () => {
      const transition = await service.setSlideTransition('slide-001', 'push', 600, {
        direction: 'left',
        easing: 'bounce',
        advanceOnClick: false,
        advanceAfter: 3000,
      });
      expect(transition.direction).toBe('left');
      expect(transition.easing).toBe('bounce');
      expect(transition.advanceOnClick).toBe(false);
      expect(transition.advanceAfter).toBe(3000);
    });

    it('should default to 500ms duration when not provided', async () => {
      const transition = await service.setSlideTransition('slide-001', 'dissolve');
      expect(transition.duration).toBe(500);
    });
  });

  describe('addElementAnimation', () => {
    it('should add a fadeIn animation using the preset defaults', async () => {
      const animation = await service.addElementAnimation(
        'el-001',
        'slide-001',
        'fadeIn',
      );
      expect(animation.elementId).toBe('el-001');
      expect(animation.slideId).toBe('slide-001');
      expect(animation.trigger).toBe('afterPrevious');
      expect(animation.effect.type).toBe('fade');
      expect(animation.timing.duration).toBe(500);
      expect(animation.properties.startOpacity).toBe(0);
      expect(animation.properties.endOpacity).toBe(1);
      expect(animation.order).toBe(0);
      expect(mockPrisma.elementAnimation.create).toHaveBeenCalledTimes(1);
    });

    it('should throw when an unknown preset name is provided', async () => {
      await expect(
        service.addElementAnimation('el-001', 'slide-001', 'nonExistentPreset'),
      ).rejects.toThrow('Animation preset not found: nonExistentPreset');
    });

    it('should apply timing overrides on top of preset defaults', async () => {
      const animation = await service.addElementAnimation(
        'el-002',
        'slide-001',
        'flyFromLeft',
        'onClick',
        { duration: 1200, delay: 300 },
      );
      expect(animation.timing.duration).toBe(1200);
      expect(animation.timing.delay).toBe(300);
      expect(animation.trigger).toBe('onClick');
      // Preset defaults that were not overridden should remain
      expect(animation.timing.repeatCount).toBe(0);
      expect(animation.timing.autoReverse).toBe(false);
    });

    it('should apply property overrides on top of preset defaults', async () => {
      const animation = await service.addElementAnimation(
        'el-001',
        'slide-001',
        'zoomIn',
        'withPrevious',
        undefined,
        { startScale: 0.5, endScale: 1.5 },
      );
      expect(animation.properties.startScale).toBe(0.5);
      expect(animation.properties.endScale).toBe(1.5);
      // startOpacity from preset should still be present
      expect(animation.properties.startOpacity).toBe(0);
    });

    it('should use bounceIn preset with correct effect and properties', async () => {
      const animation = await service.addElementAnimation(
        'el-001',
        'slide-001',
        'bounceIn',
      );
      expect(animation.effect.type).toBe('bounce');
      expect(animation.timing.duration).toBe(800);
      expect(animation.properties.startScale).toBe(0);
      expect(animation.properties.endScale).toBe(1);
      expect(animation.properties.startY).toBe(-200);
      expect(animation.properties.endY).toBe(0);
    });
  });

  describe('removeElementAnimation', () => {
    it('should delete an animation by its ID', async () => {
      await service.removeElementAnimation('anim-001');
      expect(mockPrisma.elementAnimation.findUnique).toHaveBeenCalledWith({
        where: { id: 'anim-001' },
      });
      expect(mockPrisma.elementAnimation.delete).toHaveBeenCalledWith({
        where: { id: 'anim-001' },
      });
    });

    it('should do nothing when the animation does not exist', async () => {
      mockPrisma.elementAnimation.findUnique.mockResolvedValueOnce(null);
      await service.removeElementAnimation('nonexistent');
      expect(mockPrisma.elementAnimation.delete).not.toHaveBeenCalled();
    });
  });

  describe('reorderAnimations', () => {
    it('should update the order of animations by their IDs', async () => {
      await service.reorderAnimations('slide-001', ['anim-c', 'anim-a', 'anim-b']);
      expect(mockPrisma.elementAnimation.update).toHaveBeenCalledTimes(3);
      expect(mockPrisma.elementAnimation.update).toHaveBeenCalledWith({
        where: { id: 'anim-c' },
        data: { order: 0 },
      });
      expect(mockPrisma.elementAnimation.update).toHaveBeenCalledWith({
        where: { id: 'anim-a' },
        data: { order: 1 },
      });
      expect(mockPrisma.elementAnimation.update).toHaveBeenCalledWith({
        where: { id: 'anim-b' },
        data: { order: 2 },
      });
    });
  });

  describe('getSlideAnimations', () => {
    it('should fetch animations from the database and cache them', async () => {
      const mockRecords = [
        {
          id: 'anim-101',
          elementId: 'el-001',
          slideId: 'slide-010',
          trigger: 'afterPrevious',
          effect: { type: 'fade' },
          timing: { duration: 500, delay: 0, repeatCount: 0, repeatDelay: 0, autoReverse: false, speed: 1 },
          properties: { startOpacity: 0, endOpacity: 1 },
          order: 0,
          groupId: null,
        },
      ];
      mockPrisma.elementAnimation.findMany.mockResolvedValueOnce(mockRecords);

      const animations = await service.getSlideAnimations('slide-010');
      expect(animations).toHaveLength(1);
      expect(animations[0].id).toBe('anim-101');
      expect(animations[0].effect.type).toBe('fade');
      expect(animations[0].timing.duration).toBe(500);
    });
  });

  describe('getAvailablePresets', () => {
    it('should return all presets when no category filter is given', () => {
      const presets = service.getAvailablePresets();
      expect(presets.length).toBeGreaterThanOrEqual(12);
      const names = presets.map(p => p.name);
      expect(names).toContain('fadeIn');
      expect(names).toContain('flyFromLeft');
      expect(names).toContain('zoomIn');
      expect(names).toContain('bounceIn');
      expect(names).toContain('pulse');
      expect(names).toContain('shake');
      expect(names).toContain('fadeOut');
      expect(names).toContain('flyOut');
      expect(names).toContain('shrinkOut');
    });

    it('should filter presets by entrance category', () => {
      const entrancePresets = service.getAvailablePresets('entrance');
      expect(entrancePresets.length).toBeGreaterThanOrEqual(5);
      entrancePresets.forEach(p => expect(p.category).toBe('entrance'));
    });

    it('should filter presets by emphasis category', () => {
      const emphasisPresets = service.getAvailablePresets('emphasis');
      expect(emphasisPresets.length).toBeGreaterThanOrEqual(2);
      emphasisPresets.forEach(p => expect(p.category).toBe('emphasis'));
      const names = emphasisPresets.map(p => p.name);
      expect(names).toContain('pulse');
      expect(names).toContain('shake');
    });

    it('should filter presets by exit category', () => {
      const exitPresets = service.getAvailablePresets('exit');
      expect(exitPresets.length).toBeGreaterThanOrEqual(3);
      exitPresets.forEach(p => expect(p.category).toBe('exit'));
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return all 14 transition types with descriptions', () => {
      const transitions = service.getAvailableTransitions();
      expect(transitions).toHaveLength(14);
      const types = transitions.map(t => t.type);
      expect(types).toContain('none');
      expect(types).toContain('fade');
      expect(types).toContain('dissolve');
      expect(types).toContain('slide');
      expect(types).toContain('push');
      expect(types).toContain('wipe');
      expect(types).toContain('split');
      expect(types).toContain('reveal');
      expect(types).toContain('cover');
      expect(types).toContain('morph');
      expect(types).toContain('zoom');
      expect(types).toContain('curtain');
      expect(types).toContain('flip');
      expect(types).toContain('rotate');
      transitions.forEach(t => expect(t.description.length).toBeGreaterThan(0));
    });
  });

  describe('generatePreview', () => {
    it('should generate an animation preview with frames for the slide', async () => {
      // First add an animation so there's a cached sequence
      const animation = await service.addElementAnimation(
        'el-001',
        'slide-preview',
        'fadeIn',
        'onLoad',
      );

      const preview = await service.generatePreview('slide-preview', 960, 540, 30);
      expect(preview.slideId).toBe('slide-preview');
      expect(preview.fps).toBe(30);
      expect(preview.width).toBe(960);
      expect(preview.height).toBe(540);
      expect(preview.totalDuration).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(preview.frames)).toBe(true);
    });
  });
});

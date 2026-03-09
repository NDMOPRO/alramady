import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const HtmlExportOptionsSchema = z.object({
  includeAnimations: z.boolean(),
  includeNarration: z.boolean(),
  autoAdvance: z.number().int().min(1).max(300).optional(),
  theme: z.enum(['light', 'dark']),
  standalone: z.boolean(),
});

interface HtmlExportOptions {
  includeAnimations: boolean;
  includeNarration: boolean;
  autoAdvance?: number;
  theme: 'light' | 'dark';
  standalone: boolean;
}

interface SlideData {
  id: string;
  order: number;
  content: Record<string, unknown>;
  notes: string | null;
}

interface PresentationData {
  id: string;
  title: string;
  slideCount: number;
  slides: SlideData[];
}

export class InteractiveHtmlExportService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  async exportToHtml(
    presentationId: string,
    options: HtmlExportOptions
  ): Promise<Buffer> {
    const validatedId = z.string().uuid().parse(presentationId);
    const validatedOptions = HtmlExportOptionsSchema.parse(options);

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: validatedId },
      select: {
        id: true,
        name: true,
        title: true,
        slideCount: true,
      },
    });

    if (!presentation) {
      throw new Error(`Presentation not found: ${validatedId}`);
    }

    const slideRecords = await this.prisma.slide.findMany({
      where: { presentationId: validatedId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        order: true,
        content: true,
        notes: true,
      },
    });

    const slides: SlideData[] = slideRecords.map((s) => ({
      id: s.id,
      order: s.order,
      content: (s.content as Record<string, unknown>) ?? {},
      notes: s.notes,
    }));

    const presentationData: PresentationData = {
      id: presentation.id,
      title: presentation.title || presentation.name,
      slideCount: presentation.slideCount,
      slides,
    };

    const slidesHtml = slides
      .map((slide: SlideData, index: number) => this.generateSlideHtml(slide, index))
      .join('\n');

    const styles = this.generateStyles(validatedOptions.theme);
    const navigationScript = this.generateNavigationScript();
    const animationStyles = validatedOptions.includeAnimations
      ? this.generateAnimationStyles()
      : '';
    const narrationScript = validatedOptions.includeNarration
      ? this.generateNarrationScript(slides)
      : '';
    const autoAdvanceScript = validatedOptions.autoAdvance
      ? this.generateAutoAdvanceScript(validatedOptions.autoAdvance)
      : '';

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this.escapeHtml(presentationData.title)}</title>
<style>
${styles}
${animationStyles}
</style>
</head>
<body>
<div id="rasid-presentation" class="rasid-presentation" data-total-slides="${presentationData.slideCount}">
  <div id="rasid-progress-bar" class="rasid-progress-bar">
    <div id="rasid-progress-fill" class="rasid-progress-fill"></div>
  </div>

  <div id="rasid-slides-container" class="rasid-slides-container">
    ${slidesHtml}
  </div>

  <div id="rasid-controls" class="rasid-controls">
    <button id="rasid-prev" class="rasid-nav-btn" aria-label="الشريحة السابقة" title="الشريحة السابقة">&#9664;</button>
    <span id="rasid-slide-counter" class="rasid-slide-counter">1 / ${presentationData.slideCount}</span>
    <button id="rasid-next" class="rasid-nav-btn" aria-label="الشريحة التالية" title="الشريحة التالية">&#9654;</button>
    <button id="rasid-fullscreen" class="rasid-nav-btn rasid-fullscreen-btn" aria-label="وضع ملء الشاشة" title="ملء الشاشة">&#x26F6;</button>
    <button id="rasid-notes-toggle" class="rasid-nav-btn rasid-notes-btn" aria-label="ملاحظات المتحدث" title="ملاحظات المتحدث">&#x1F4DD;</button>
  </div>

  <div id="rasid-notes-panel" class="rasid-notes-panel rasid-hidden">
    <div class="rasid-notes-header">
      <span>ملاحظات المتحدث</span>
      <button id="rasid-notes-close" class="rasid-notes-close-btn" aria-label="إغلاق">&times;</button>
    </div>
    <div id="rasid-notes-content" class="rasid-notes-content"></div>
  </div>
</div>

<script>
${navigationScript}
${narrationScript}
${autoAdvanceScript}
</script>
</body>
</html>`;

    return Buffer.from(html, 'utf-8');
  }

  private generateSlideHtml(slide: SlideData, index: number): string {
    const content = slide.content;
    const elements = Array.isArray(content.elements)
      ? (content.elements as Array<Record<string, unknown>>)
      : [];

    const title = typeof content.title === 'string' ? content.title : '';
    const subtitle = typeof content.subtitle === 'string' ? content.subtitle : '';
    const body = typeof content.body === 'string' ? content.body : '';
    const backgroundColor =
      typeof content.backgroundColor === 'string'
        ? content.backgroundColor
        : '';

    const bgStyle = backgroundColor
      ? ` style="background-color: ${this.escapeAttr(backgroundColor)};"`
      : '';

    const hiddenClass = index === 0 ? '' : ' rasid-slide-hidden';

    let elementsHtml = '';

    for (const element of elements) {
      const elType = typeof element.type === 'string' ? element.type : '';
      const elX = typeof element.x === 'number' ? element.x : 0;
      const elY = typeof element.y === 'number' ? element.y : 0;

      switch (elType) {
        case 'text': {
          const text = typeof element.text === 'string' ? element.text : '';
          const fontSize =
            typeof element.fontSize === 'number' ? element.fontSize : 16;
          const fontColor =
            typeof element.color === 'string' ? element.color : 'inherit';
          elementsHtml += `<div class="rasid-element rasid-text-element" style="position:absolute;right:${elX}px;top:${elY}px;font-size:${fontSize}px;color:${this.escapeAttr(fontColor)};">${this.escapeHtml(text)}</div>`;
          break;
        }
        case 'image': {
          const src = typeof element.src === 'string' ? element.src : '';
          const dataUrl =
            typeof element.dataUrl === 'string' ? element.dataUrl : '';
          const imgSrc = dataUrl || src;
          const elWidth =
            typeof element.width === 'number' ? element.width : 200;
          const elHeight =
            typeof element.height === 'number' ? element.height : 200;
          if (imgSrc) {
            elementsHtml += `<img class="rasid-element rasid-image-element" src="${this.escapeAttr(imgSrc)}" style="position:absolute;right:${elX}px;top:${elY}px;width:${elWidth}px;height:${elHeight}px;object-fit:contain;" alt="" loading="lazy">`;
          }
          break;
        }
        case 'qrcode': {
          const qrDataUrl =
            typeof element.dataUrl === 'string' ? element.dataUrl : '';
          const qrWidth =
            typeof element.width === 'number' ? element.width : 200;
          if (qrDataUrl) {
            elementsHtml += `<img class="rasid-element rasid-qr-element" src="${this.escapeAttr(qrDataUrl)}" style="position:absolute;right:${elX}px;top:${elY}px;width:${qrWidth}px;height:${qrWidth}px;" alt="QR Code" loading="lazy">`;
          }
          break;
        }
        case 'video': {
          const embedHtml =
            typeof element.embedHtml === 'string' ? element.embedHtml : '';
          const vidWidth =
            typeof element.width === 'number' ? element.width : 560;
          const vidHeight =
            typeof element.height === 'number' ? element.height : 315;
          elementsHtml += `<div class="rasid-element rasid-video-element" style="position:absolute;right:${elX}px;top:${elY}px;width:${vidWidth}px;height:${vidHeight}px;">${embedHtml}</div>`;
          break;
        }
        case 'shape': {
          const shapeType =
            typeof element.shapeType === 'string' ? element.shapeType : 'rect';
          const fillColor =
            typeof element.fill === 'string' ? element.fill : '#cccccc';
          const shapeWidth =
            typeof element.width === 'number' ? element.width : 100;
          const shapeHeight =
            typeof element.height === 'number' ? element.height : 100;
          const borderRadius = shapeType === 'circle' ? '50%' : '0';
          elementsHtml += `<div class="rasid-element rasid-shape-element" style="position:absolute;right:${elX}px;top:${elY}px;width:${shapeWidth}px;height:${shapeHeight}px;background-color:${this.escapeAttr(fillColor)};border-radius:${borderRadius};"></div>`;
          break;
        }
        default:
          break;
      }
    }

    const notesData = slide.notes
      ? ` data-notes="${this.escapeAttr(slide.notes)}"`
      : '';

    return `    <div class="rasid-slide${hiddenClass}" data-slide-index="${index}"${notesData}${bgStyle}>
      <div class="rasid-slide-content">
        ${title ? `<h1 class="rasid-slide-title">${this.escapeHtml(title)}</h1>` : ''}
        ${subtitle ? `<h2 class="rasid-slide-subtitle">${this.escapeHtml(subtitle)}</h2>` : ''}
        ${body ? `<div class="rasid-slide-body">${this.escapeHtml(body)}</div>` : ''}
        ${elementsHtml}
      </div>
    </div>`;
  }

  private generateNavigationScript(): string {
    return `(function() {
  'use strict';

  var currentSlide = 0;
  var slides = document.querySelectorAll('.rasid-slide');
  var totalSlides = slides.length;
  var counter = document.getElementById('rasid-slide-counter');
  var progressFill = document.getElementById('rasid-progress-fill');
  var notesPanel = document.getElementById('rasid-notes-panel');
  var notesContent = document.getElementById('rasid-notes-content');
  var notesVisible = false;

  function showSlide(index) {
    if (index < 0 || index >= totalSlides) return;
    slides[currentSlide].classList.add('rasid-slide-hidden');
    currentSlide = index;
    slides[currentSlide].classList.remove('rasid-slide-hidden');
    counter.textContent = (currentSlide + 1) + ' / ' + totalSlides;
    var progress = ((currentSlide + 1) / totalSlides) * 100;
    progressFill.style.width = progress + '%';
    updateNotes();

    if (typeof window.rasidOnSlideChange === 'function') {
      window.rasidOnSlideChange(currentSlide);
    }
  }

  function nextSlide() {
    if (currentSlide < totalSlides - 1) {
      showSlide(currentSlide + 1);
    }
  }

  function prevSlide() {
    if (currentSlide > 0) {
      showSlide(currentSlide - 1);
    }
  }

  function toggleFullscreen() {
    var el = document.getElementById('rasid-presentation');
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) el.msRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    }
  }

  function toggleNotes() {
    notesVisible = !notesVisible;
    if (notesVisible) {
      notesPanel.classList.remove('rasid-hidden');
    } else {
      notesPanel.classList.add('rasid-hidden');
    }
    updateNotes();
  }

  function updateNotes() {
    var slideEl = slides[currentSlide];
    var notes = slideEl.getAttribute('data-notes') || '';
    notesContent.textContent = notes || 'لا توجد ملاحظات لهذه الشريحة';
  }

  document.getElementById('rasid-next').addEventListener('click', nextSlide);
  document.getElementById('rasid-prev').addEventListener('click', prevSlide);
  document.getElementById('rasid-fullscreen').addEventListener('click', toggleFullscreen);
  document.getElementById('rasid-notes-toggle').addEventListener('click', toggleNotes);
  document.getElementById('rasid-notes-close').addEventListener('click', toggleNotes);

  document.addEventListener('keydown', function(e) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        prevSlide();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case ' ':
        e.preventDefault();
        nextSlide();
        break;
      case 'Home':
        e.preventDefault();
        showSlide(0);
        break;
      case 'End':
        e.preventDefault();
        showSlide(totalSlides - 1);
        break;
      case 'Escape':
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
        break;
      case 'n':
      case 'N':
        toggleNotes();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
    }
  });

  var touchStartX = 0;
  var touchStartY = 0;
  var SWIPE_THRESHOLD = 50;

  document.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    var deltaX = e.changedTouches[0].screenX - touchStartX;
    var deltaY = e.changedTouches[0].screenY - touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
      if (deltaX > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
  }, { passive: true });

  showSlide(0);

  window.rasidNavigation = {
    next: nextSlide,
    prev: prevSlide,
    goTo: showSlide,
    getCurrentSlide: function() { return currentSlide; },
    getTotalSlides: function() { return totalSlides; }
  };
})();`;
  }

  private generateStyles(theme: 'light' | 'dark'): string {
    const isDark = theme === 'dark';

    const bgColor = isDark ? '#1a1a2e' : '#ffffff';
    const textColor = isDark ? '#e0e0e0' : '#333333';
    const controlsBg = isDark ? 'rgba(30, 30, 60, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const controlsText = isDark ? '#e0e0e0' : '#333333';
    const btnHoverBg = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)';
    const progressBg = isDark ? '#2a2a4a' : '#e0e0e0';
    const progressFill = isDark ? '#6c63ff' : '#4a90d9';
    const notesBg = isDark ? '#16213e' : '#f8f9fa';
    const notesBorder = isDark ? '#2a2a4a' : '#dee2e6';
    const titleColor = isDark ? '#ffffff' : '#1a1a1a';
    const subtitleColor = isDark ? '#b0b0d0' : '#555555';

    return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: 'Segoe UI', Tahoma, 'Noto Sans Arabic', 'Cairo', sans-serif;
  direction: rtl;
  background-color: ${bgColor};
  color: ${textColor};
}

.rasid-presentation {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.rasid-progress-bar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  height: 4px;
  background-color: ${progressBg};
  z-index: 1000;
}

.rasid-progress-fill {
  height: 100%;
  background-color: ${progressFill};
  transition: width 0.3s ease;
  width: 0%;
}

.rasid-slides-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.rasid-slide {
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 80px;
  background-color: ${bgColor};
  transition: opacity 0.4s ease;
  opacity: 1;
}

.rasid-slide-hidden {
  opacity: 0;
  pointer-events: none;
  z-index: -1;
}

.rasid-slide-content {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.rasid-slide-title {
  font-size: 2.8em;
  font-weight: 700;
  margin-bottom: 0.4em;
  color: ${titleColor};
  line-height: 1.3;
  word-break: break-word;
}

.rasid-slide-subtitle {
  font-size: 1.6em;
  font-weight: 400;
  margin-bottom: 0.8em;
  color: ${subtitleColor};
  line-height: 1.4;
  word-break: break-word;
}

.rasid-slide-body {
  font-size: 1.2em;
  line-height: 1.8;
  max-width: 900px;
  color: ${textColor};
  white-space: pre-wrap;
  word-break: break-word;
}

.rasid-element {
  z-index: 10;
}

.rasid-controls {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: ${controlsBg};
  padding: 10px 20px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 100;
  user-select: none;
  backdrop-filter: blur(10px);
}

.rasid-nav-btn {
  background: none;
  border: none;
  color: ${controlsText};
  font-size: 1.2em;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  transition: background 0.2s ease;
  line-height: 1;
}

.rasid-nav-btn:hover {
  background: ${btnHoverBg};
}

.rasid-nav-btn:focus {
  outline: 2px solid ${progressFill};
  outline-offset: 2px;
}

.rasid-slide-counter {
  font-size: 0.95em;
  color: ${controlsText};
  min-width: 60px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.rasid-notes-panel {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 700px;
  max-height: 200px;
  background: ${notesBg};
  border: 1px solid ${notesBorder};
  border-radius: 12px;
  padding: 16px;
  z-index: 99;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.rasid-notes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 0.9em;
  color: ${controlsText};
}

.rasid-notes-close-btn {
  background: none;
  border: none;
  font-size: 1.4em;
  cursor: pointer;
  color: ${controlsText};
  padding: 0 4px;
  line-height: 1;
}

.rasid-notes-content {
  font-size: 0.9em;
  line-height: 1.6;
  color: ${textColor};
  white-space: pre-wrap;
}

.rasid-hidden {
  display: none;
}

@media (max-width: 768px) {
  .rasid-slide {
    padding: 30px 20px;
  }

  .rasid-slide-title {
    font-size: 1.8em;
  }

  .rasid-slide-subtitle {
    font-size: 1.2em;
  }

  .rasid-slide-body {
    font-size: 1em;
  }

  .rasid-controls {
    bottom: 10px;
    padding: 8px 14px;
    gap: 8px;
  }

  .rasid-nav-btn {
    font-size: 1em;
    padding: 6px 8px;
  }
}

@media print {
  .rasid-controls,
  .rasid-progress-bar,
  .rasid-notes-panel {
    display: none;
  }

  .rasid-slide {
    page-break-after: always;
    position: relative;
    opacity: 1;
    pointer-events: auto;
    z-index: auto;
  }

  .rasid-slide-hidden {
    opacity: 1;
    pointer-events: auto;
    z-index: auto;
  }
}`;
  }

  private generateAnimationStyles(): string {
    return `
.rasid-slide:not(.rasid-slide-hidden) .rasid-slide-title {
  animation: rasidFadeInUp 0.6s ease forwards;
}

.rasid-slide:not(.rasid-slide-hidden) .rasid-slide-subtitle {
  animation: rasidFadeInUp 0.6s ease 0.15s forwards;
  opacity: 0;
}

.rasid-slide:not(.rasid-slide-hidden) .rasid-slide-body {
  animation: rasidFadeInUp 0.6s ease 0.3s forwards;
  opacity: 0;
}

.rasid-slide:not(.rasid-slide-hidden) .rasid-element {
  animation: rasidFadeIn 0.5s ease 0.4s forwards;
  opacity: 0;
}

@keyframes rasidFadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes rasidFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}`;
  }

  private generateNarrationScript(slides: SlideData[]): string {
    const narrationData = slides.map((slide) => {
      const content = slide.content;
      const narration =
        typeof content.narration === 'string' ? content.narration : '';
      return narration;
    });

    const narrationJson = JSON.stringify(narrationData);

    return `
(function() {
  'use strict';

  var narrations = ${narrationJson};
  var speechSupported = 'speechSynthesis' in window;

  if (!speechSupported) return;

  window.rasidOnSlideChange = function(slideIndex) {
    window.speechSynthesis.cancel();
    var text = narrations[slideIndex];
    if (text && text.length > 0) {
      var utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ar-SA';
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };
})();`;
  }

  private generateAutoAdvanceScript(seconds: number): string {
    return `
(function() {
  'use strict';

  var intervalMs = ${seconds * 1000};
  var autoAdvanceTimer = null;

  function startAutoAdvance() {
    stopAutoAdvance();
    autoAdvanceTimer = setInterval(function() {
      if (window.rasidNavigation) {
        var current = window.rasidNavigation.getCurrentSlide();
        var total = window.rasidNavigation.getTotalSlides();
        if (current < total - 1) {
          window.rasidNavigation.next();
        } else {
          stopAutoAdvance();
        }
      }
    }, intervalMs);
  }

  function stopAutoAdvance() {
    if (autoAdvanceTimer !== null) {
      clearInterval(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
  }

  document.addEventListener('click', function() {
    stopAutoAdvance();
  });

  document.addEventListener('keydown', function() {
    stopAutoAdvance();
  });

  startAutoAdvance();
})();`;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  private escapeAttr(value: string): string {
    return this.escapeHtml(value);
  }
}

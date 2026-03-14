import { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
}

// E07-0130: Background particles (light) + gradient shifts
export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const gradientPhaseRef = useRef(0);

  const initParticles = useCallback((width: number, height: number) => {
    const count = Math.min(Math.floor((width * height) / 25000), 40);
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.15 + 0.05,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      initParticles(rect.width, rect.height);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Check for reduced motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      window.removeEventListener('resize', resizeCanvas);
      return;
    }

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // Slow gradient shift
      gradientPhaseRef.current += 0.002;
      const phase = gradientPhaseRef.current;
      const gx = w * 0.5 + Math.sin(phase) * w * 0.3;
      const gy = h * 0.5 + Math.cos(phase * 0.7) * h * 0.3;

      const gradient = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.6);

      // Use computed style for theme-awareness
      const computedStyle = getComputedStyle(document.documentElement);
      const isDark = document.documentElement.classList.contains('dark');

      if (isDark) {
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.03)');
        gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.015)');
        gradient.addColorStop(1, 'transparent');
      } else {
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.04)');
        gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.02)');
        gradient.addColorStop(1, 'transparent');
      }

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Draw particles
      const particleColor = isDark ? '200, 210, 230' : '100, 116, 139';

      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${particleColor}, ${p.opacity})`;
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
}

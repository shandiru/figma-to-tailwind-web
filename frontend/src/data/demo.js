const text = (name, value, x, y, width, size, color = '#172135', weight = '400') => ({
  name, type: 'TEXT', text: value, x, y, width, height: size * 1.5,
  css: { 'font-family': 'Instrument Sans', 'font-size': `${size}px`, 'line-height': '1.25', color, 'font-weight': weight },
});
const box = (name, x, y, width, height, css, children = []) => ({ name, type: 'FRAME', x, y, width, height, css, children });
export function demoDesign(mobile = false) {
  const width = mobile ? 390 : 1080;
  return {
    format: 'figma-to-tailwind', version: 1, fonts: ['Instrument Sans'], warnings: [],
    frame: box('Studio landing page', 0, 0, width, mobile ? 740 : 680, { background: '#f5f2eb' }, [
      text('Wordmark', 'form & field', 32, 30, 220, 23, '#243a31', '700'),
      ...(!mobile ? [text('Navigation', 'Our work       About       Contact', 690, 36, 350, 14)] : []),
      text('Eyebrow', 'INDEPENDENT DESIGN STUDIO', 32, 135, 330, 11, '#69786e', '600'),
      text('Heading line 1', 'Good things', 32, 175, width - 64, mobile ? 49 : 80, '#243a31', '600'),
      text('Heading line 2', 'take shape.', 32, mobile ? 238 : 270, width - 64, mobile ? 49 : 80, '#243a31', '600'),
      text('Description', 'Thoughtful brands. Meaningful experiences.', 34, mobile ? 329 : 385, width - 64, mobile ? 14 : 19, '#69786e'),
      box('CTA button', 32, mobile ? 390 : 450, 180, 52, { background: '#243a31', 'border-radius': '28px' }, [
        text('Button label', 'Explore our work  ↗', 20, 16, 155, 14, '#ffffff', '600'),
      ]),
      box('Accent card', mobile ? 32 : 770, mobile ? 495 : 170, mobile ? 326 : 250, mobile ? 180 : 330, { background: '#d0d9a8', 'border-radius': '140px 140px 12px 12px' }, [
        box('Circle', mobile ? 110 : 69, mobile ? 35 : 85, 110, 110, { background: '#f5f2eb', 'border-radius': '100px' }),
      ]),
      text('Footer', 'A little intention makes all the difference.', 32, mobile ? 700 : 615, width - 64, 12, '#69786e'),
    ]),
  };
}

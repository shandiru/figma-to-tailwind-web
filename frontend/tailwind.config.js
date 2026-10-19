export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
      colors: { ink: '#16181d', paper: '#f6f7f9', accent: { DEFAULT: '#2f4bff', dark: '#2338c9' } },
    },
  },
  plugins: [],
};

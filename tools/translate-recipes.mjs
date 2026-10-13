import fs from "node:fs";
import path from "node:path";

const translations = {
  "components/backgrounds/mesh-hero.html": "The soft iridescent mesh is composed of several large geometric elements (.blob) colored in the OKLCH space, continuously moving and rotating along separate trajectory paths. The parent container with filter: blur(70px) organically blends them into a fluid gradient without muddy bleeding artifacts.",

  "components/buttons/glitch-cyber-button.html": "The polygon-chamfered silhouette is sculpted via clip-path: polygon(). The RGB split glitch effect is driven by two pseudoelements (::before, ::after) cloning the button text, offset slightly horizontally and clipped to thin slices with clip-path: inset() using a rapid steps() keyframe loop.",

  "components/buttons/orbit-border-button.html": "The core mechanism relies on registering the custom CSS property @property --angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }. This allows smooth keyframe animation of the conic gradient rotation angle. A blurred duplicate pseudoelement placed behind generates the dynamic glowing aura.",

  "components/cards/glass-4-hazy-border.html": "The non-uniform glowing border is achieved with a conic-gradient on a ::before pseudoelement with 1px padding, hollowed out via mask-composite: exclude (content-box XOR border-box). The atmospheric inner haze uses ::after with negative insets, 3 radial gradients, and blur(25px). In light mode, border segment saturation is lowered rather than inverted, preserving genuine glass physics.",

  "components/cards/holo-foil-card.html": "As the cursor moves, tilt angles (--rx, --ry) and glare origins (--px, --py) are calculated in real time. The holographic rainbow shimmer is created with a conic/linear spectrum overlay using mix-blend-mode: color-dodge, while a moving specular radial gradient mimics ambient light reflection.",

  "components/cards/spotlight-card-grid.html": "A pointermove listener on the parent container computes cursor coordinates relative to each card (--mouse-x, --mouse-y). Each card's ::before layer renders a radial gradient positioned at those coordinates, masked to the border perimeter. Neighboring cards are lit synchronously by a single unified beam of light.",

  "components/loaders/signal-loaders.html": "Each telemetry loader demonstrates a distinct CSS animation technique: from rotating radar sweep sectors (conic-gradient mask) and oscilloscope sine waves (SVG stroke-dashoffset) to segmented LCD equalizer meters with staggered discrete animation-delay offsets.",

  "components/micro-interactions/scroll-reveal-feed.html": "Standard CSS keyframe animations are bound to scroll position: animation-timeline: view() drives the reveal while the card enters the viewport (animation-range: entry 0% cover 30%), while scroll(root) drives the sticky top progress bar. In browsers without support, an IntersectionObserver fallback activates the .in class.",

  "components/micro-interactions/soft-toggle-set.html": "Neumorphic tactile depth is crafted with dual opposing box-shadows: a bright specular highlight top-left and a soft dark shadow bottom-right. State is managed purely with modern CSS: .panel:has(#t-focus:checked) redefines the --accent variable. The springy knob bounce is defined via linear() easing with graceful cubic-bezier fallback.",

  "components/modals/crt-terminal.html": "The CRT monitor appearance is produced by combining a peripheral radial-gradient vignette (simulating glass screen curvature) with an overlay repeating-linear-gradient for cathode ray scanlines. The phosphor green glow uses layered text-shadows, while the command prompt cursor blinks discretely with steps(1).",

  "components/modals/frosted-grain-dialog.html": "The modal opens via the native HTML5 .showModal() API. Smooth top-layer entry transitions are animated with @starting-style and transition-behavior: allow-discrete. The tactile frosted glass grain texture is rendered by an inline SVG feTurbulence fractal noise filter composited with mix-blend-mode: overlay.",

  "components/navigation/glass-dock.html": "The graduated neighbor icon magnification without JavaScript is powered by pure CSS: combining :hover with the next-sibling selector (.item:hover + .item) and previous-sibling selector via :has() (.item:has(+ .item:hover)). The floating frosted glass dock chassis features backdrop-filter: blur(24px).",

  "components/navigation/pixel-menu.html": "The authentic 8-bit stepped pixel border is constructed using multiple zero-blur box-shadow offsets, rendering pixelated stepped corners without external images. The blinking triangle cursor is controlled by keyboard Up/Down/Enter keys with discrete steps(1) animation.",

  "components/navigation/segmented-nav.html": "The active sliding pill indicator is positioned dynamically using CSS custom properties --pill-left and --pill-width, smoothly transitioning with cubic-bezier curves when tabs change. The glass container features backdrop-filter: blur(20px) and a subtle top-edge specular highlight.",

  "components/widgets/dynamic-island.html": "The morphing pill dynamically interpolates its dimensions and internal layout across states (compact, weather, player, call) using physics-inspired linear() easing. Sub-views transition seamlessly with coordinated opacity and transform scale keyframes.",

  "components/widgets/lcd-stopwatch.html": "The authentic LCD display trick stacks two layers of the DSEG7 font in a single CSS grid cell: a dim ghost segment background reading 88:88.88 underneath, and bright illuminated digits on top. Because all DSEG glyphs share identical metrics, segments align perfectly with multi-layered text-shadow phosphor glow and scanlines.",

  "components/widgets/paper-notification-stack.html": "Tactile stacked paper cards are created using progressive transform: translateY() scale() offsets paired with subtle multi-layer box-shadows. Hovering over the stack fans out the cards smoothly, while clicking dismisses the active top card with an exit swipe transition.",

  "components/widgets/police-radar.html": "The police Doppler radar combines an active 360-degree sweep scope (conic-gradient beam with target blips) and a dual-layer DSEG7 digital speed readout. Exceeding the speed limit triggers an attention-grabbing strobing VIOLATION / LOCKED status alert.",

  "components/widgets/vintage-car-radio.html": "The physical tactile aesthetic is achieved with knurled rotary knobs (radial teeth textured with repeating-conic-gradient) supporting interactive vertical pointer dragging. The 14-segment amber VFD display uses DSEG14 with warm phosphor text-shadow glow, unlit ghost segments, and scanlines."
};

for (const [relPath, newRecipe] of Object.entries(translations)) {
  const fullPath = path.resolve(relPath);
  let content = fs.readFileSync(fullPath, "utf8");

  content = content.replace(/(<script[^>]*data-uilab-meta[^>]*>)([\s\S]*?)(<\/script>)/, (match, openTag, jsonText, closeTag) => {
    try {
      const meta = JSON.parse(jsonText);
      meta.recipe = newRecipe;
      return `${openTag}\n${JSON.stringify(meta, null, 2)}\n${closeTag}`;
    } catch (e) {
      console.error(`Error parsing JSON in ${relPath}:`, e);
      return match;
    }
  });

  fs.writeFileSync(fullPath, content, "utf8");
  console.log(`Updated recipe in: ${relPath}`);
}
